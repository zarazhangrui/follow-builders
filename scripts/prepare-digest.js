#!/usr/bin/env node

// ============================================================================
// Follow Builders — Prepare Digest
// ============================================================================
// Gathers everything the LLM needs to produce a digest:
// - Fetches the central feeds (tweets + podcasts + blogs)
// - Adds local freshness from twitter-cli when available
// - Adds Horizon-inspired default non-RSS signals (GitHub, OSSInsight, HN, Reddit)
// - Fetches the latest prompts from GitHub
// - Reads the user's config (language, delivery method)
// - Outputs a single JSON blob to stdout
//
// The LLM's ONLY job is to read this JSON, remix the content, and output
// the digest text. Everything else is handled here deterministically.
// ============================================================================

import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import { fetchJsonStrict } from './lib/http.js';
import { writeJsonOutput } from './lib/output.js';
import {
  collectGitHubTrends,
  collectHackerNewsTrends,
  collectRedditTrends,
  countRecentStargazers,
  fetchGitHubStargazerPageViaGh,
  fetchHackerNewsStory,
  fetchHackerNewsStoryIds,
  getGitHubRepositoryViaGh,
  searchGitHubRepositoriesViaGh,
  searchHackerNewsAlgolia,
  searchRedditViaAnySearch,
  searchRedditViaArcticShift
} from './lib/trend-sources.js';
import {
  createTrendState,
  loadTrendState,
  pruneTrendState,
  saveTrendState
} from './lib/trend-state.js';

// -- Constants ---------------------------------------------------------------

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname);
const REPO_ROOT = join(SCRIPT_DIR, '..');
const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const USER_HORIZON_DEFAULTS_PATH = join(USER_DIR, 'horizon-defaults.json');
const HORIZON_DEFAULTS_PATH = join(REPO_ROOT, 'config', 'horizon-defaults.json');
const TREND_STATE_PATH = process.env.FOLLOW_BUILDERS_TREND_STATE || join(USER_DIR, 'trend-state.json');

const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json';
const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json';

const PROMPTS_BASE = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/prompts';
const PROMPT_FILES = [
  'summarize-podcast.md',
  'summarize-tweets.md',
  'summarize-blogs.md',
  'digest-intro.md',
  'translate.md'
];

// -- Generic helpers ---------------------------------------------------------

function mergeObjects(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      merged[key] = mergeObjects(base[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

async function readJSONFile(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf-8'));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'follow-builders-digest/1.0',
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJSON(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) return null;
  return res.json();
}

async function fetchText(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) return null;
  return res.text();
}

async function mapLimit(items, limit, worker) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function safeDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function normalizeHandle(handle = '') {
  return String(handle).replace(/^@/, '').trim();
}

function tweetUrl(tweet, fallbackHandle) {
  const handle = normalizeHandle(tweet.author?.screenName || tweet.handle || fallbackHandle);
  return handle && tweet.id ? `https://x.com/${handle}/status/${tweet.id}` : tweet.url || '';
}

function scoreInterest(text, interests = []) {
  const normalized = String(text || '').toLowerCase();
  const matches = [];
  for (const interest of interests) {
    const keyword = String(interest).toLowerCase();
    if (keyword && normalized.includes(keyword)) matches.push(interest);
  }
  return {
    score: matches.length,
    matches: [...new Set(matches)]
  };
}

function sortByDateDesc(items, field = 'createdAt') {
  return [...items].sort((a, b) => {
    const left = safeDate(a[field])?.getTime() || 0;
    const right = safeDate(b[field])?.getTime() || 0;
    return right - left;
  });
}

// -- Horizon defaults --------------------------------------------------------

async function loadHorizonDefaults(errors) {
  const repoDefaults = await readJSONFile(HORIZON_DEFAULTS_PATH, { enabled: false });
  const userDefaults = await readJSONFile(USER_HORIZON_DEFAULTS_PATH, null).catch(err => {
    errors.push(`Could not read user horizon defaults: ${err.message}`);
    return null;
  });
  return mergeObjects(repoDefaults, userDefaults);
}

// -- Local X via twitter-cli -------------------------------------------------

function normalizeTwitterCliTweet(tweet, account) {
  const handle = normalizeHandle(tweet.author?.screenName || account.handle);
  const createdAt = tweet.createdAtISO || tweet.createdAt || null;
  const metrics = tweet.metrics || {};
  return {
    id: String(tweet.id),
    text: tweet.text || '',
    createdAt,
    createdAtLocal: tweet.createdAtLocal || null,
    url: tweetUrl(tweet, handle),
    likes: metrics.likes || 0,
    retweets: metrics.retweets || 0,
    replies: metrics.replies || 0,
    quotes: metrics.quotes || 0,
    views: metrics.views || 0,
    bookmarks: metrics.bookmarks || 0,
    isQuote: Boolean(tweet.quotedTweet),
    quotedTweet: tweet.quotedTweet || null,
    isRetweet: Boolean(tweet.isRetweet),
    localSource: 'twitter-cli'
  };
}

async function fetchTwitterAccount(account, xConfig, horizonConfig) {
  const handle = normalizeHandle(account.handle);
  if (!handle) return { account, tweets: [], error: 'missing handle' };

  const tempDir = await mkdtemp(join(tmpdir(), 'follow-builders-twitter-'));
  const outputPath = join(tempDir, `${handle}.json`);

  try {
    await execFileAsync('twitter', [
      'user-posts',
      handle,
      '-n',
      String(xConfig.maxPostsPerAccount || 3),
      '--json',
      '-o',
      outputPath
    ], {
      timeout: xConfig.timeoutMs || 30000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024 * 10
    });

    const raw = JSON.parse(await readFile(outputPath, 'utf-8'));
    const cutoff = xConfig.lookbackHours
      ? Date.now() - Number(xConfig.lookbackHours) * 60 * 60 * 1000
      : 0;

    const tweets = (Array.isArray(raw) ? raw : raw.data || [])
      .filter(tweet => tweet?.id && tweet?.text)
      .filter(tweet => xConfig.includeRetweets || !tweet.isRetweet)
      .map(tweet => normalizeTwitterCliTweet(tweet, account))
      .filter(tweet => {
        const date = safeDate(tweet.createdAt);
        return !cutoff || !date || date.getTime() >= cutoff;
      })
      .map(tweet => ({
        ...tweet,
        interest: scoreInterest(
          `${tweet.text}\n${tweet.quotedTweet?.text || ''}`,
          horizonConfig.interests
        )
      }));

    return { account, tweets };
  } catch (err) {
    return { account, tweets: [], error: err.message };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function fetchLocalX(feedX, horizonConfig, errors) {
  const xConfig = horizonConfig.x || {};
  if (!horizonConfig.enabled || !xConfig.enabled || xConfig.mode !== 'twitter-cli') {
    return { accounts: [], errors: [], stats: { enabled: false } };
  }

  const centralAccounts = feedX?.x || [];
  const accounts = xConfig.deriveAccountsFromDefaultFeed
    ? centralAccounts.map(({ name, handle }) => ({ name, handle }))
    : xConfig.accounts || [];
  const priority = new Map((xConfig.priorityHandles || []).map((handle, index) => [normalizeHandle(handle).toLowerCase(), index]));
  const centralByHandle = new Map(centralAccounts.map(account => [normalizeHandle(account.handle).toLowerCase(), account]));
  const candidatesByHandle = new Map();
  for (const handle of xConfig.priorityHandles || []) {
    const normalized = normalizeHandle(handle);
    const centralAccount = centralByHandle.get(normalized.toLowerCase());
    candidatesByHandle.set(normalized.toLowerCase(), {
      name: centralAccount?.name || normalized,
      handle: normalized
    });
  }
  for (const account of accounts) {
    const normalized = normalizeHandle(account.handle);
    if (!candidatesByHandle.has(normalized.toLowerCase())) {
      candidatesByHandle.set(normalized.toLowerCase(), account);
    }
  }

  const selectedAccounts = [...candidatesByHandle.values()]
    .sort((a, b) => {
      const aRank = priority.has(normalizeHandle(a.handle).toLowerCase())
        ? priority.get(normalizeHandle(a.handle).toLowerCase())
        : Number.MAX_SAFE_INTEGER;
      const bRank = priority.has(normalizeHandle(b.handle).toLowerCase())
        ? priority.get(normalizeHandle(b.handle).toLowerCase())
        : Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    })
    .slice(0, xConfig.maxAccounts || accounts.length);

  if (selectedAccounts.length === 0) {
    return { accounts: [], errors: ['No X accounts configured'], stats: { enabled: true, accountsAttempted: 0 } };
  }

  const fetched = await mapLimit(
    selectedAccounts,
    xConfig.concurrency || 2,
    account => fetchTwitterAccount(account, xConfig, horizonConfig)
  );

  const localErrors = fetched
    .filter(result => result.error)
    .map(result => `${normalizeHandle(result.account.handle)}: ${result.error}`);
  if (localErrors.length > 0) errors.push(`twitter-cli partial failures: ${localErrors.slice(0, 3).join('; ')}`);

  return {
    accounts: fetched.map(result => ({
      source: 'x-local',
      name: result.account.name,
      handle: normalizeHandle(result.account.handle),
      tweets: result.tweets,
      error: result.error || undefined
    })),
    errors: localErrors,
    stats: {
      enabled: true,
      accountsAttempted: selectedAccounts.length,
      accountsSucceeded: fetched.filter(result => !result.error).length,
      tweets: fetched.reduce((sum, result) => sum + result.tweets.length, 0)
    }
  };
}

function mergeXFeeds(centralAccounts, localAccounts) {
  const accountMap = new Map();

  function ensureAccount(account) {
    const handle = normalizeHandle(account.handle);
    if (!accountMap.has(handle)) {
      accountMap.set(handle, {
        source: 'x',
        name: account.name || handle,
        handle,
        bio: account.bio || '',
        tweets: [],
        sourceMix: { central: 0, local: 0, both: 0 }
      });
    }
    return accountMap.get(handle);
  }

  for (const account of centralAccounts || []) {
    const target = ensureAccount(account);
    target.bio = target.bio || account.bio || '';
    for (const tweet of account.tweets || []) {
      target.tweets.push({
        ...tweet,
        sourceTags: ['central-feed']
      });
      target.sourceMix.central += 1;
    }
  }

  for (const account of localAccounts || []) {
    const target = ensureAccount(account);
    const byId = new Map(target.tweets.map(tweet => [String(tweet.id), tweet]));
    for (const tweet of account.tweets || []) {
      const existing = byId.get(String(tweet.id));
      if (existing) {
        Object.assign(existing, {
          ...existing,
          ...tweet,
          sourceTags: [...new Set([...(existing.sourceTags || []), 'twitter-cli'])],
          localMetrics: {
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies,
            quotes: tweet.quotes,
            views: tweet.views,
            bookmarks: tweet.bookmarks
          }
        });
        target.sourceMix.both += 1;
      } else {
        target.tweets.push({
          ...tweet,
          sourceTags: ['twitter-cli']
        });
        target.sourceMix.local += 1;
      }
    }
    target.tweets = sortByDateDesc(target.tweets, 'createdAt').slice(0, 8);
  }

  return [...accountMap.values()]
    .filter(account => account.tweets.length > 0)
    .sort((a, b) => b.tweets.length - a.tweets.length);
}

// -- OSSInsight candidate discovery -----------------------------------------

async function fetchOSSInsight(horizonConfig, errors) {
  const oss = horizonConfig.ossinsight || {};
  if (!horizonConfig.enabled || !oss.enabled) {
    return { repos: [], health: { status: 'ok_no_new', backend: 'disabled' }, stats: { enabled: false } };
  }

  const timestamp = new Date().toISOString();
  const seen = new Map();
  const localErrors = [];
  let rowsBeforeFilter = 0;
  let rowsAfterFilter = 0;
  let successfulRequests = 0;
  let lastHttpStatus = null;
  let usedPeriod = oss.period || 'past_24_hours';
  let fallbackUsed = false;
  const periods = [usedPeriod];
  if (oss.fallbackPeriod && oss.fallbackPeriod !== usedPeriod) periods.push(oss.fallbackPeriod);

  for (const [periodIndex, period] of periods.entries()) {
    for (const language of oss.languages || ['All']) {
      const url = new URL('https://api.ossinsight.io/v1/trends/repos');
      url.searchParams.set('period', period);
      url.searchParams.set('language', language);

      try {
        const result = await fetchJsonStrict(url.toString(), { backend: 'ossinsight' });
        lastHttpStatus = result.httpStatus;
        successfulRequests += 1;
        const rows = result.data?.data?.rows || [];
        rowsBeforeFilter += rows.length;
        for (const row of rows) {
          const text = `${row.repo_name || ''}\n${row.description || ''}\n${row.collection_names || ''}`;
          const interest = scoreInterest(text, oss.keywords || []);
          const stars = Number(row.stars || 0);
          if (stars < Number(oss.minStars || 0)) continue;
          if ((oss.keywords || []).length > 0 && interest.score === 0) continue;
          rowsAfterFilter += 1;

          const existing = seen.get(row.repo_name);
          const item = {
            source: 'ossinsight-trending',
            fullName: row.repo_name,
            description: row.description || '',
            language: row.primary_language || language,
            starsGained: stars,
            forksGained: Number(row.forks || 0),
            totalScore: Number(row.total_score || 0),
            url: `https://github.com/${row.repo_name}`,
            window: period,
            interest
          };
          if (!existing || item.starsGained > existing.starsGained) seen.set(row.repo_name, item);
        }
      } catch (err) {
        localErrors.push(`${period}/${language}: ${err.message}`);
      }
    }
    if (seen.size > 0 || periodIndex === periods.length - 1) {
      usedPeriod = period;
      fallbackUsed = periodIndex > 0;
      break;
    }
  }

  if (localErrors.length > 0) errors.push(`OSSInsight failures: ${localErrors.slice(0, 3).join('; ')}`);
  const repos = [...seen.values()]
    .sort((a, b) => b.starsGained - a.starsGained)
    .slice(0, oss.maxItems || 20);
  const success = successfulRequests > 0;

  return {
    repos,
    health: {
      status: !success
        ? 'failed'
        : fallbackUsed || localErrors.length > 0 ? 'degraded' : repos.length > 0 ? 'ok_new' : 'ok_no_new',
      backend: `ossinsight:${usedPeriod}`,
      lastHttpStatus,
      itemsBeforeFilter: rowsBeforeFilter,
      itemsAfterFilter: repos.length,
      windowHours: usedPeriod === 'past_24_hours' ? 24 : null,
      lastSuccessAt: success ? timestamp : null,
      partial: localErrors.length > 0,
      fallbackUsed
    },
    errors: localErrors,
    stats: {
      enabled: true,
      repos: seen.size,
      rowsBeforeFilter,
      rowsAfterFilter,
      period: usedPeriod
    }
  };
}

// -- Main --------------------------------------------------------------------

async function main() {
  const errors = [];
  const now = new Date();

  // 1. Read user config
  let config = {
    language: 'en',
    frequency: 'daily',
    delivery: { method: 'stdout' }
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    } catch (err) {
      errors.push(`Could not read config: ${err.message}`);
    }
  }

  const horizonConfig = await loadHorizonDefaults(errors);
  let trendState = createTrendState();
  let stateLoadFailed = false;
  try {
    trendState = await loadTrendState(TREND_STATE_PATH);
  } catch (err) {
    stateLoadFailed = true;
    errors.push(`Could not read trend state; existing file was left untouched: ${err.message}`);
  }
  const prunedStateEntries = pruneTrendState(trendState, {
    now,
    retentionHours: Number(horizonConfig.state?.retentionHours || 48)
  });

  // 2. Fetch all three central feeds
  const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
    fetchJSON(FEED_X_URL),
    fetchJSON(FEED_PODCASTS_URL),
    fetchJSON(FEED_BLOGS_URL)
  ]);

  if (!feedX) errors.push('Could not fetch tweet feed');
  if (!feedPodcasts) errors.push('Could not fetch podcast feed');
  if (!feedBlogs) errors.push('Could not fetch blog feed');

  // 3. Fetch Horizon-inspired non-RSS signals. OSSInsight is resolved first so
  // its discovery candidates can be verified by GitHub's official API.
  const ossinsight = await fetchOSSInsight(horizonConfig, errors);
  const disabledHealth = backend => ({
    status: 'ok_no_new',
    backend,
    lastHttpStatus: null,
    itemsBeforeFilter: 0,
    itemsAfterFilter: 0,
    windowHours: 24,
    lastSuccessAt: null
  });
  const githubConfig = horizonConfig.github || {};
  const hackerNewsConfig = horizonConfig.hackerNews || {};
  const redditConfig = horizonConfig.reddit || {};
  const hnSince = new Date(now.getTime() - Number(hackerNewsConfig.windowHours || 24) * 60 * 60 * 1000);

  const [localX, github, hackerNews, reddit] = await Promise.all([
    fetchLocalX(feedX, horizonConfig, errors),
    horizonConfig.enabled && githubConfig.enabled
      ? collectGitHubTrends({
        now,
        state: trendState,
        config: githubConfig,
        ossCandidates: ossinsight.repos,
        searchRepositories: searchGitHubRepositoriesViaGh,
        getRepository: getGitHubRepositoryViaGh,
        countStargazers: params => countRecentStargazers({
          ...params,
          fetchPage: fetchGitHubStargazerPageViaGh
        })
      })
      : Promise.resolve({ repos: [], rankings: { byStars24h: [], byVelocity: [] }, health: disabledHealth('github-disabled'), errors: [], stats: { enabled: false } }),
    horizonConfig.enabled && hackerNewsConfig.enabled
      ? collectHackerNewsTrends({
        now,
        state: trendState,
        config: { ...hackerNewsConfig, interests: horizonConfig.interests || [] },
        fetchStoryIds: fetchHackerNewsStoryIds,
        fetchStory: fetchHackerNewsStory,
        searchAlgolia: query => searchHackerNewsAlgolia(query, {
          since: hnSince,
          maxItems: Number(hackerNewsConfig.maxItemsPerQuery || hackerNewsConfig.maxItems || 20)
        })
      })
      : Promise.resolve({ items: [], health: disabledHealth('hacker-news-disabled'), errors: [], stats: { enabled: false } }),
    horizonConfig.enabled && redditConfig.enabled
      ? collectRedditTrends({
        now,
        state: trendState,
        config: { ...redditConfig, interests: horizonConfig.interests || [] },
        primarySearch: () => searchRedditViaAnySearch({
          queries: redditConfig.queries || [],
          maxResults: Number(redditConfig.maxResultsPerQuery || 10),
          anySearchCli: redditConfig.anySearchCli
        }),
        fallbackSearch: () => searchRedditViaArcticShift({ now, config: redditConfig })
      })
      : Promise.resolve({ items: [], health: disabledHealth('reddit-disabled'), errors: [], stats: { enabled: false } })
  ]);

  for (const sourceResult of [github, hackerNews, reddit]) {
    for (const sourceError of sourceResult.errors || []) errors.push(sourceError);
  }

  trendState.sourceHealth ||= {};
  const sourceHealth = {
    github: github.health,
    ossinsight: ossinsight.health,
    hackerNews: hackerNews.health,
    reddit: reddit.health
  };
  for (const [source, health] of Object.entries(sourceHealth)) {
    if (!health.lastSuccessAt) {
      health.lastSuccessAt = trendState.sourceHealth[source]?.lastSuccessAt || null;
    }
    trendState.sourceHealth[source] = health;
  }

  let statePersisted = false;
  if (!stateLoadFailed) {
    try {
      await saveTrendState(TREND_STATE_PATH, trendState);
      statePersisted = true;
    } catch (err) {
      errors.push(`Could not save trend state: ${err.message}`);
    }
  }

  const fusedX = mergeXFeeds(feedX?.x || [], localX.accounts || []);

  // 4. Load prompts with priority: user custom > remote (GitHub) > local default
  const prompts = {};
  const localPromptsDir = join(REPO_ROOT, 'prompts');
  const userPromptsDir = join(USER_DIR, 'prompts');

  for (const filename of PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    const userPath = join(userPromptsDir, filename);
    const localPath = join(localPromptsDir, filename);

    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
      continue;
    }

    const remote = await fetchText(`${PROMPTS_BASE}/${filename}`);
    if (remote) {
      prompts[key] = remote;
      continue;
    }

    if (existsSync(localPath)) {
      prompts[key] = await readFile(localPath, 'utf-8');
    } else {
      errors.push(`Could not load prompt: ${filename}`);
    }
  }

  // 5. Build the output — everything the LLM needs in one blob
  const output = {
    status: 'ok',
    generatedAt: now.toISOString(),

    config: {
      language: config.language || 'en',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' }
    },

    podcasts: feedPodcasts?.podcasts || [],
    x: fusedX,
    xCentral: feedX?.x || [],
    blogs: feedBlogs?.blogs || [],

    horizon: {
      enabled: Boolean(horizonConfig.enabled),
      generatedAt: now.toISOString(),
      defaultInterests: horizonConfig.interests || [],
      xFusion: {
        mode: horizonConfig.x?.mode || 'none',
        local: localX,
        fusedAccounts: fusedX.length,
        fusedTweets: fusedX.reduce((sum, account) => sum + account.tweets.length, 0)
      },
      github,
      ossinsight,
      hackerNews,
      reddit,
      sourceHealth,
      trendState: {
        version: trendState.version,
        retentionHours: Number(horizonConfig.state?.retentionHours || 48),
        prunedEntries: prunedStateEntries,
        persisted: statePersisted
      },
      guidance: {
        primaryUse: 'Use these non-RSS signals to identify agent infrastructure, coding-agent, MCP, skills, local-model, browser automation, and workflow trends.',
        weighting: 'Treat GitHub official 24-hour star counts and local X as high confidence. Treat OSSInsight as candidate discovery. Treat Reddit and Hacker News as community validation, not as the only source of truth.',
        outputContract: {
          requiredSection: 'Agent 工具链雷达',
          rule: 'Prefer new 24-hour momentum over cumulative popularity. Do not treat failed or degraded sources as a successful empty result.',
          requiredBlocks: [
            'GitHub 24h 趋势: show stars24h and starVelocity with original repository links',
            'OSSInsight 候选发现: show its actual window and never present past_week as a 24-hour count',
            'HN / Reddit 社区验证: use original discussion links and omit unverified body/comment summaries',
            'Source Health: explicitly distinguish baseline_only, ok_no_new, degraded, failed, and blocked_auth'
          ]
        }
      }
    },

    stats: {
      podcastEpisodes: feedPodcasts?.podcasts?.length || 0,
      xBuilders: fusedX.length,
      totalTweets: fusedX.reduce((sum, account) => sum + account.tweets.length, 0),
      centralTweets: (feedX?.x || []).reduce((sum, account) => sum + account.tweets.length, 0),
      localTweets: localX.stats?.tweets || 0,
      blogPosts: feedBlogs?.blogs?.length || 0,
      githubWatchRepos: github.repos?.length || 0,
      githubTrendRepos: github.repos?.length || 0,
      githubGraphqlRequests: github.stats?.graphqlRequests || 0,
      ossInsightRepos: ossinsight.repos?.length || 0,
      hackerNewsItems: hackerNews.items?.length || 0,
      redditItems: reddit.items?.length || 0,
      feedGeneratedAt: feedX?.generatedAt || feedPodcasts?.generatedAt || feedBlogs?.generatedAt || null
    },

    prompts,
    errors: errors.length > 0 ? errors : undefined
  };

  // Some local agents prefer a real file during debugging.
  if (process.env.FOLLOW_BUILDERS_PREPARED_OUTPUT) {
    await writeFile(process.env.FOLLOW_BUILDERS_PREPARED_OUTPUT, JSON.stringify(output, null, 2));
  }

  await writeJsonOutput(output);
}

main().catch(err => {
  console.error(JSON.stringify({
    status: 'error',
    message: err.message
  }));
  process.exit(1);
});
