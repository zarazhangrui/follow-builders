import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { fetchJsonStrict, HttpError } from './http.js';
import { recordTrendSnapshot } from './trend-state.js';

const execFileAsync = promisify(execFile);

export async function resolveAnySearchCli({
  anySearchCli,
  env = process.env,
  homeDir = homedir(),
  accessImpl = access
} = {}) {
  const configured = anySearchCli || env.FOLLOW_BUILDERS_ANYSEARCH_CLI || env.ANYSEARCH_CLI;
  if (configured) return configured;

  const relativeSkillPath = join('skills', 'anysearch', 'scripts', 'anysearch_cli.py');
  for (const skillRoot of ['.agents', '.codex', '.claude']) {
    const candidate = join(homeDir, skillRoot, relativeSkillPath);
    try {
      await accessImpl(candidate);
      return candidate;
    } catch {
      // Try the next common agent skill root before falling back to PATH.
    }
  }
  return 'anysearch';
}

function errorAttempt(error, defaultBackend) {
  return {
    backend: error?.backend || defaultBackend,
    httpStatus: Number.isFinite(error?.httpStatus) ? error.httpStatus : null,
    error: error?.message || String(error)
  };
}

function normalizeSearchResult(value, defaultBackend) {
  if (Array.isArray(value)) {
    return {
      backend: defaultBackend,
      httpStatus: 200,
      items: value,
      itemsBeforeFilter: value.length,
      degraded: false,
      metadata: null
    };
  }
  const items = Array.isArray(value?.items) ? value.items : [];
  return {
    backend: value?.backend || defaultBackend,
    httpStatus: Number.isFinite(value?.httpStatus) ? value.httpStatus : 200,
    items,
    itemsBeforeFilter: Number.isFinite(value?.itemsBeforeFilter)
      ? value.itemsBeforeFilter
      : items.length,
    degraded: Boolean(value?.degraded),
    metadata: value?.metadata || null
  };
}

function normalizeRedditItem(item) {
  const url = item?.url || item?.permalink || '';
  const id = String(item?.id || url.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1] || '');
  if (!id || !url) return null;
  return {
    id,
    title: item?.title || '',
    url,
    subreddit: String(item?.subreddit || '').replace(/^r\//i, ''),
    createdAt: item?.createdAt || (Number.isFinite(item?.created_utc)
      ? new Date(item.created_utc * 1000).toISOString()
      : null),
    score: Number(item?.score || 0),
    comments: Number(item?.comments ?? item?.num_comments ?? 0)
  };
}

function processRedditSearchResult(result, {
  now,
  state,
  config,
  backend,
  degraded,
  attempts
}) {
  const nowMs = new Date(now).getTime();
  const timestamp = new Date(now).toISOString();
  const windowHours = Number(config.windowHours || 24);
  const sinceMs = nowMs - windowHours * 60 * 60 * 1000;
  const baselineOnly = Boolean(state) && Object.keys(state.reddit || {}).length === 0;
  const deduplicated = new Map();

  for (const rawItem of result.items) {
    const item = normalizeRedditItem(rawItem);
    if (!item) continue;
    const createdMs = new Date(item.createdAt).getTime();
    if (
      !Number.isFinite(createdMs) || createdMs < sinceMs || createdMs > nowMs ||
      item.score < Number(config.minScore || 0) ||
      !matchesAnyInterest(item, config.interests || [])
    ) continue;
    const existing = deduplicated.get(item.id);
    if (!existing || item.score + item.comments * 2 > existing.score + existing.comments * 2) {
      deduplicated.set(item.id, item);
    }
  }

  const emissionCandidates = [];
  for (const item of deduplicated.values()) {
    const previous = state?.reddit?.[item.id] || null;
    let entry = previous;
    if (state) {
      entry = recordTrendSnapshot(state, 'reddit', item.id, {
        now,
        metrics: { score: item.score, comments: item.comments }
      }).entry;
    }
    if (!previous?.lastEmittedAt) {
      emissionCandidates.push({
        source: 'reddit',
        backend,
        official: false,
        ...item,
        engagement: item.score + item.comments * 2,
        windowHours,
        _stateEntry: entry
      });
    }
  }

  const items = emissionCandidates
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, Number(config.maxItems || 15));
  for (const item of items) {
    if (item._stateEntry) item._stateEntry.lastEmittedAt = timestamp;
    delete item._stateEntry;
  }

  return {
    items,
    health: {
      status: degraded
        ? 'degraded'
        : baselineOnly && items.length > 0 ? 'baseline_only' : items.length > 0 ? 'ok_new' : 'ok_no_new',
      backend,
      lastHttpStatus: result.httpStatus,
      itemsBeforeFilter: result.itemsBeforeFilter,
      itemsAfterFilter: items.length,
      windowHours,
      lastSuccessAt: timestamp,
      partial: degraded,
      metadata: result.metadata,
      attempts
    },
    errors: attempts.filter(attempt => attempt.error).map(attempt => `${attempt.backend}: ${attempt.error}`)
  };
}

export function calculateStarVelocity(stars24h, createdAt, now = new Date()) {
  const nowMs = new Date(now).getTime();
  const createdMs = new Date(createdAt).getTime();
  const ageHours = Number.isFinite(createdMs) && Number.isFinite(nowMs)
    ? Math.max(0, (nowMs - createdMs) / (60 * 60 * 1000))
    : 24;
  const denominator = Math.max(Math.min(ageHours, 24), 2);
  return Number(stars24h || 0) / denominator;
}

function mergeGitHubCandidate(candidates, candidate, source) {
  const fullName = candidate?.fullName || candidate?.nameWithOwner || candidate?.repo_name;
  if (!fullName) return;
  const existing = candidates.get(fullName) || { fullName, candidateSources: [] };
  if (source && !existing.candidateSources.includes(source)) existing.candidateSources.push(source);
  candidates.set(fullName, {
    ...existing,
    ...candidate,
    fullName,
    candidateSources: existing.candidateSources
  });
}

function normalizeGitHubRepository(repository) {
  const fullName = repository.fullName || repository.nameWithOwner;
  return {
    ...repository,
    fullName,
    name: repository.name || fullName?.split('/').at(-1) || '',
    owner: repository.owner?.login || repository.owner || fullName?.split('/')[0] || '',
    url: repository.url || repository.html_url,
    description: repository.description || '',
    createdAt: repository.createdAt || repository.created_at,
    pushedAt: repository.pushedAt || repository.pushed_at,
    updatedAt: repository.updatedAt || repository.updated_at,
    stars: Number(repository.stars ?? repository.stargazersCount ?? repository.stargazerCount ?? 0),
    forks: Number(repository.forks ?? repository.forksCount ?? repository.forkCount ?? 0),
    language: repository.language?.name || repository.language || repository.primaryLanguage?.name || '',
    isFork: Boolean(repository.isFork ?? repository.fork),
    isArchived: Boolean(repository.isArchived ?? repository.archived)
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function normalizeHackerNewsItem(item, source) {
  const id = String(item?.id ?? item?.objectID ?? '');
  if (!id) return null;
  const createdSeconds = Number(item?.time ?? item?.created_at_i);
  return {
    id,
    title: item?.title || item?.story_title || '',
    outboundUrl: item?.url || item?.story_url || '',
    hnUrl: `https://news.ycombinator.com/item?id=${id}`,
    author: item?.by || item?.author || '',
    createdAt: Number.isFinite(createdSeconds)
      ? new Date(createdSeconds * 1000).toISOString()
      : item?.created_at || null,
    points: Number(item?.score ?? item?.points ?? 0),
    comments: Number(item?.descendants ?? item?.num_comments ?? 0),
    type: item?.type || 'story',
    dead: Boolean(item?.dead),
    deleted: Boolean(item?.deleted),
    sourceTags: [source]
  };
}

function mergeHackerNewsCandidate(candidates, candidate) {
  if (!candidate?.id) return;
  const existing = candidates.get(candidate.id);
  if (!existing) {
    candidates.set(candidate.id, candidate);
    return;
  }
  candidates.set(candidate.id, {
    ...existing,
    ...candidate,
    title: candidate.title || existing.title,
    outboundUrl: candidate.outboundUrl || existing.outboundUrl,
    createdAt: candidate.createdAt || existing.createdAt,
    points: Math.max(existing.points, candidate.points),
    comments: Math.max(existing.comments, candidate.comments),
    sourceTags: [...new Set([...existing.sourceTags, ...candidate.sourceTags])]
  });
}

function matchesAnyInterest(item, interests) {
  if (!interests || interests.length === 0) return true;
  const text = `${item.title || ''}\n${item.outboundUrl || ''}`.toLowerCase();
  return interests.some(interest => text.includes(String(interest).toLowerCase()));
}

export function parseAnySearchRedditMarkdown(markdown) {
  const items = [];
  const sections = String(markdown || '').split(/^###\s+\d+\.\s+/m).slice(1);
  for (const section of sections) {
    const lineBreak = section.indexOf('\n');
    if (lineBreak === -1) continue;
    const title = section.slice(0, lineBreak).trim();
    const body = section.slice(lineBreak + 1);
    const url = body.match(/^-\s+\*\*URL\*\*:\s+(https?:\/\/\S+)/m)?.[1];
    const id = url?.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1];
    const subreddit = body.match(/Subreddit:\s+r\/([^\s]+)/i)?.[1];
    const score = Number(body.match(/Score:\s*(-?\d+)/i)?.[1]);
    const comments = Number(body.match(/Comments:\s*(\d+)/i)?.[1]);
    if (!url || !id) continue;
    items.push({
      id,
      title,
      url,
      subreddit: subreddit || '',
      score: Number.isFinite(score) ? score : 0,
      comments: Number.isFinite(comments) ? comments : 0
    });
  }
  return items;
}

function conciseCommandError(error) {
  return String(error?.stderr || error?.message || error).trim().split('\n')[0];
}

export async function searchGitHubRepositoriesViaGh({
  topic,
  createdAfter,
  limit = 10,
  execFileImpl = execFileAsync
}) {
  const createdDate = new Date(createdAfter).toISOString().slice(0, 10);
  try {
    const { stdout } = await execFileImpl('gh', [
      'search', 'repos', topic,
      '--created', `>=${createdDate}`,
      '--archived=false',
      '--include-forks=false',
      '--sort=stars',
      '--order=desc',
      '--limit', String(limit),
      '--json', 'fullName,description,url,stargazersCount,forksCount,createdAt,pushedAt,updatedAt,isFork,isArchived,language'
    ], {
      timeout: 20000,
      killSignal: 'SIGKILL',
      maxBuffer: 4 * 1024 * 1024
    });
    return JSON.parse(stdout || '[]');
  } catch (error) {
    throw new Error(conciseCommandError(error));
  }
}

export async function getGitHubRepositoryViaGh(fullName, { execFileImpl = execFileAsync } = {}) {
  try {
    const { stdout } = await execFileImpl('gh', [
      'repo', 'view', fullName,
      '--json', 'nameWithOwner,description,url,stargazerCount,forkCount,issues,primaryLanguage,createdAt,pushedAt,updatedAt,isFork,isArchived'
    ], {
      timeout: 15000,
      killSignal: 'SIGKILL',
      maxBuffer: 2 * 1024 * 1024
    });
    const repository = JSON.parse(stdout);
    return {
      ...repository,
      fullName: repository.nameWithOwner,
      stars: repository.stargazerCount,
      forks: repository.forkCount,
      openIssues: repository.issues?.totalCount || 0,
      language: repository.primaryLanguage?.name || ''
    };
  } catch (error) {
    throw new Error(conciseCommandError(error));
  }
}

export async function fetchGitHubStargazerPageViaGh({
  owner,
  name,
  after,
  execFileImpl = execFileAsync
}) {
  const query = `
    query($owner: String!, $name: String!, $after: String) {
      repository(owner: $owner, name: $name) {
        stargazers(first: 100, after: $after, orderBy: {field: STARRED_AT, direction: DESC}) {
          edges { starredAt }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;
  const args = ['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`];
  if (after) args.push('-F', `after=${after}`);
  try {
    const { stdout } = await execFileImpl('gh', args, {
      timeout: 20000,
      killSignal: 'SIGKILL',
      maxBuffer: 2 * 1024 * 1024
    });
    const payload = JSON.parse(stdout);
    const connection = payload?.data?.repository?.stargazers;
    if (!connection) throw new Error(`GitHub returned no stargazers for ${owner}/${name}`);
    return connection;
  } catch (error) {
    throw new Error(conciseCommandError(error));
  }
}

export async function fetchHackerNewsStoryIds(list, options = {}) {
  const { data } = await fetchJsonStrict(
    `https://hacker-news.firebaseio.com/v0/${encodeURIComponent(list)}.json`,
    { ...options, backend: 'hn-official' }
  );
  return Array.isArray(data) ? data : [];
}

export async function fetchHackerNewsStory(id, options = {}) {
  const { data } = await fetchJsonStrict(
    `https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(id)}.json`,
    { ...options, backend: 'hn-official' }
  );
  return data;
}

export async function searchHackerNewsAlgolia(query, {
  since,
  maxItems = 20,
  ...options
} = {}) {
  const url = new URL('https://hn.algolia.com/api/v1/search_by_date');
  url.searchParams.set('query', query);
  url.searchParams.set('tags', 'story');
  url.searchParams.set('hitsPerPage', String(maxItems));
  if (since) url.searchParams.set('numericFilters', `created_at_i>=${Math.floor(new Date(since).getTime() / 1000)}`);
  const { data } = await fetchJsonStrict(url.toString(), { ...options, backend: 'hn-algolia' });
  return data?.hits || [];
}

export async function searchRedditViaAnySearch({
  queries,
  maxResults = 10,
  anySearchCli,
  execFileImpl = execFileAsync,
  fetchOptions = {},
  env = process.env,
  homeDir = homedir(),
  accessImpl = access
}) {
  const resolvedCli = await resolveAnySearchCli({ anySearchCli, env, homeDir, accessImpl });
  const parsedItems = [];
  const errors = [];
  let successfulQueries = 0;
  for (const query of queries || []) {
    try {
      const searchArgs = [
        'search', query,
        '--domain', 'social_media',
        '--sub_domain', 'social_media.social_media',
        '--sub_domain_params', JSON.stringify({ type: 'reddit_post', keyword: query }),
        '--max_results', String(maxResults)
      ];
      const command = resolvedCli.endsWith('.py') ? 'python3' : resolvedCli;
      const args = resolvedCli.endsWith('.py') ? [resolvedCli, ...searchArgs] : searchArgs;
      const { stdout } = await execFileImpl(command, args, {
        timeout: 45000,
        killSignal: 'SIGKILL',
        maxBuffer: 8 * 1024 * 1024
      });
      const queryItems = parseAnySearchRedditMarkdown(stdout);
      const explicitEmpty = /(?:Search Results\s*\(\s*0 results?\b|\bno (?:search )?results(?: found)?\b)/i.test(String(stdout));
      if (queryItems.length === 0 && !explicitEmpty) {
        throw new Error('AnySearch returned an unrecognized output format');
      }
      parsedItems.push(...queryItems);
      successfulQueries += 1;
    } catch (error) {
      errors.push(conciseCommandError(error));
    }
  }
  if (successfulQueries === 0 && errors.length > 0) {
    const error = new Error(`AnySearch failed: ${errors[0]}`);
    error.backend = 'anysearch';
    throw error;
  }

  const discovered = [...new Map(parsedItems.map(item => [item.id, item])).values()];
  if (discovered.length === 0) {
    if (errors.length > 0) {
      const error = new Error(`AnySearch failed: ${errors[0]}`);
      error.backend = 'anysearch';
      throw error;
    }
    return {
      backend: 'anysearch',
      httpStatus: 200,
      items: [],
      itemsBeforeFilter: parsedItems.length,
      degraded: errors.length > 0
    };
  }

  const verifyUrl = new URL('https://arctic-shift.photon-reddit.com/api/posts/ids');
  verifyUrl.searchParams.set('ids', discovered.map(item => item.id).slice(0, 500).join(','));
  verifyUrl.searchParams.set('fields', 'id,created_utc,subreddit,title,url,score,num_comments');
  let verification;
  try {
    verification = await fetchJsonStrict(verifyUrl.toString(), {
      ...fetchOptions,
      backend: 'arctic-shift-verify',
      timeoutMs: 20000
    });
  } catch (error) {
    error.backend = 'anysearch+arctic-shift-verify';
    throw error;
  }
  const verifiedRows = verification.data?.data || [];
  if (verifiedRows.length === 0) {
    throw new HttpError('AnySearch results could not be time-verified', {
      backend: 'anysearch+arctic-shift-verify',
      httpStatus: verification.httpStatus,
      url: verifyUrl.toString()
    });
  }
  const verifiedById = new Map(verifiedRows.map(row => [String(row.id), row]));
  const items = discovered.flatMap(item => {
    const verified = verifiedById.get(item.id);
    if (!verified) return [];
    return [{
      ...item,
      subreddit: item.subreddit || verified.subreddit || '',
      createdAt: Number.isFinite(verified.created_utc)
        ? new Date(verified.created_utc * 1000).toISOString()
        : null
    }];
  });

  return {
    backend: 'anysearch+arctic-shift-verify',
    httpStatus: verification.httpStatus,
    items,
    itemsBeforeFilter: parsedItems.length,
    degraded: errors.length > 0 || items.length < discovered.length
  };
}

export async function searchRedditViaArcticShift({
  now = new Date(),
  config = {},
  fetchOptions = {}
}) {
  const windowHours = Number(config.windowHours || 24);
  const after = new Date(new Date(now).getTime() - windowHours * 60 * 60 * 1000).toISOString();
  const subreddits = config.subreddits?.length ? config.subreddits : ['LocalLLaMA'];
  const items = [];
  const errors = [];
  let successfulRequests = 0;
  let lastHttpStatus = null;

  for (const subreddit of subreddits) {
    const url = new URL('https://arctic-shift.photon-reddit.com/api/posts/search');
    url.searchParams.set('subreddit', subreddit);
    url.searchParams.set('after', after);
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('limit', String(config.maxPostsPerSubreddit || 10));
    url.searchParams.set('fields', 'id,created_utc,subreddit,title,url,score,num_comments');
    if (config.fallbackQuery) url.searchParams.set('query', config.fallbackQuery);
    try {
      const result = await fetchJsonStrict(url.toString(), {
        ...fetchOptions,
        backend: 'arctic-shift',
        timeoutMs: 20000
      });
      lastHttpStatus = result.httpStatus;
      successfulRequests += 1;
      for (const row of result.data?.data || []) {
        items.push({
          id: String(row.id || ''),
          title: row.title || '',
          url: `https://www.reddit.com/r/${row.subreddit || subreddit}/comments/${row.id}/`,
          subreddit: row.subreddit || subreddit,
          score: Number(row.score || 0),
          comments: Number(row.num_comments || 0),
          createdAt: Number.isFinite(row.created_utc)
            ? new Date(row.created_utc * 1000).toISOString()
            : null,
          engagementDelayed: true
        });
      }
    } catch (error) {
      errors.push(error);
    }
  }

  if (successfulRequests === 0 && errors.length > 0) {
    const error = errors[0];
    error.backend = 'arctic-shift';
    throw error;
  }
  return {
    backend: 'arctic-shift',
    httpStatus: lastHttpStatus || 200,
    items,
    itemsBeforeFilter: items.length,
    degraded: errors.length > 0,
    metadata: {
      official: false,
      uptimeSla: 'none',
      engagementDelayedHours: 36
    }
  };
}

export async function collectHackerNewsTrends({
  now = new Date(),
  state,
  config = {},
  fetchStoryIds,
  fetchStory,
  searchAlgolia
}) {
  const nowDate = new Date(now);
  const nowMs = nowDate.getTime();
  const timestamp = nowDate.toISOString();
  const windowHours = Number(config.windowHours || 24);
  const sinceMs = nowMs - windowHours * 60 * 60 * 1000;
  const baselineOnly = Object.keys(state?.hackerNews || {}).length === 0;
  const candidates = new Map();
  const errors = [];
  let successfulBackends = 0;

  const storyIds = new Set();
  for (const list of config.lists || ['newstories', 'topstories', 'beststories']) {
    try {
      const ids = await fetchStoryIds(list);
      for (const id of (ids || []).slice(0, Number(config.listLimit || 100))) storyIds.add(id);
      successfulBackends += 1;
    } catch (error) {
      errors.push(`Hacker News ${list}: ${error.message}`);
    }
  }

  const officialResults = await mapWithConcurrency(
    [...storyIds],
    Number(config.concurrency || 8),
    async id => {
      try {
        return normalizeHackerNewsItem(await fetchStory(id), 'hn-official');
      } catch (error) {
        errors.push(`Hacker News item ${id}: ${error.message}`);
        return null;
      }
    }
  );
  for (const candidate of officialResults) mergeHackerNewsCandidate(candidates, candidate);

  for (const query of config.queries || []) {
    try {
      const hits = await searchAlgolia(query);
      for (const hit of hits || []) {
        mergeHackerNewsCandidate(candidates, normalizeHackerNewsItem(hit, `algolia:${query}`));
      }
      successfulBackends += 1;
    } catch (error) {
      errors.push(`Hacker News Algolia ${query}: ${error.message}`);
    }
  }

  const eligible = [];
  for (const candidate of candidates.values()) {
    const createdMs = new Date(candidate.createdAt).getTime();
    if (
      candidate.type !== 'story' || candidate.dead || candidate.deleted ||
      !Number.isFinite(createdMs) || createdMs < sinceMs || createdMs > nowMs ||
      !matchesAnyInterest(candidate, config.interests || [])
    ) continue;

    const ageHours = Math.max(0, (nowMs - createdMs) / (60 * 60 * 1000));
    const momentum = candidate.points + candidate.comments * 2;
    if (momentum < Number(config.minMomentum || 0)) continue;
    const previous = state.hackerNews?.[candidate.id] || null;
    const hasEmittedMomentumBaseline = previous?.lastEmittedMomentum !== undefined &&
      previous?.lastEmittedMomentum !== null;
    const lastEmittedMomentum = hasEmittedMomentumBaseline ? previous.lastEmittedMomentum : 0;
    const shouldEmit = !previous?.lastEmittedAt || !hasEmittedMomentumBaseline ||
      momentum - Number(lastEmittedMomentum) >= Number(config.reemitMomentumDelta || 25);
    const item = {
      source: 'hacker-news',
      ...candidate,
      url: candidate.outboundUrl || candidate.hnUrl,
      momentum,
      velocity: momentum / Math.max(ageHours, 2),
      ageHours,
      windowHours
    };
    const snapshot = recordTrendSnapshot(state, 'hackerNews', candidate.id, {
      now,
      metrics: {
        points: item.points,
        comments: item.comments,
        momentum: item.momentum
      }
    });
    if (shouldEmit) {
      eligible.push({ item, stateEntry: snapshot.entry });
    }
  }

  const selected = eligible
    .sort((a, b) => b.item.velocity - a.item.velocity || b.item.momentum - a.item.momentum)
    .slice(0, Number(config.maxItems || 12));
  for (const entry of selected) {
    entry.stateEntry.lastEmittedAt = timestamp;
    entry.stateEntry.lastEmittedMomentum = entry.item.momentum;
  }
  const items = selected.map(entry => entry.item);
  const success = successfulBackends > 0;
  const degraded = errors.length > 0;

  return {
    items,
    health: {
      status: !success
        ? 'failed'
        : degraded ? 'degraded' : baselineOnly && items.length > 0 ? 'baseline_only' : items.length > 0 ? 'ok_new' : 'ok_no_new',
      backend: 'hn-official+algolia',
      lastHttpStatus: success ? 200 : null,
      itemsBeforeFilter: candidates.size,
      itemsAfterFilter: items.length,
      windowHours,
      lastSuccessAt: success ? timestamp : null,
      partial: degraded
    },
    errors,
    stats: {
      officialIds: storyIds.size,
      mergedCandidates: candidates.size,
      successfulBackends
    }
  };
}

export async function collectGitHubTrends({
  now = new Date(),
  state,
  config = {},
  ossCandidates = [],
  searchRepositories,
  getRepository,
  countStargazers
}) {
  const timestamp = new Date(now).toISOString();
  const windowHours = Number(config.windowHours || 24);
  const since = new Date(new Date(now).getTime() - windowHours * 60 * 60 * 1000);
  const baselineOnly = Object.keys(state?.github || {}).length === 0;
  const candidates = new Map();
  const errors = [];

  for (const fullName of config.repos || []) {
    mergeGitHubCandidate(candidates, { fullName }, 'watch');
  }
  for (const candidate of ossCandidates || []) {
    mergeGitHubCandidate(
      candidates,
      candidate,
      `ossinsight:${candidate.window || candidate.period || 'unknown'}`
    );
  }
  const staticCandidateCount = candidates.size;
  let successfulDiscoveries = 0;

  for (const topic of config.discoveryTopics || []) {
    try {
      const discovered = await searchRepositories({
        topic,
        createdAfter: since,
        limit: Number(config.maxSearchResultsPerTopic || 10)
      });
      successfulDiscoveries += 1;
      for (const candidate of discovered || []) {
        mergeGitHubCandidate(candidates, candidate, `github-search:${topic}`);
      }
    } catch (error) {
      errors.push(`GitHub search ${topic}: ${error.message}`);
    }
  }

  const candidateLimit = Number(config.maxCandidates || 50);
  const selectedCandidates = [...candidates.values()]
    .filter(candidate => !candidate.isFork && !candidate.isArchived)
    .sort((a, b) => {
      const sourcePriority = candidate => candidate.candidateSources.includes('watch')
        ? 3
        : candidate.candidateSources.some(source => source.startsWith('github-search:')) ? 2 : 1;
      return sourcePriority(b) - sourcePriority(a) || Number(b.stars || 0) - Number(a.stars || 0);
    })
    .slice(0, candidateLimit);

  const evaluated = [];
  let graphqlRequests = 0;
  let partialRepos = 0;
  let normallyFilteredRepos = 0;
  const maxGraphqlRequests = Number(config.maxGraphqlRequests || 100);

  for (const candidate of selectedCandidates) {
    if (graphqlRequests >= maxGraphqlRequests) {
      errors.push(`GitHub GraphQL request budget exhausted before ${candidate.fullName}`);
      partialRepos += 1;
      continue;
    }

    let repository;
    try {
      const needsMetadata = !candidate.url || !candidate.createdAt || !Number.isFinite(Number(candidate.stars));
      repository = normalizeGitHubRepository(
        needsMetadata ? await getRepository(candidate.fullName) : candidate
      );
      repository.candidateSources = [...candidate.candidateSources];
      if (repository.isFork || repository.isArchived) {
        normallyFilteredRepos += 1;
        continue;
      }
      const pushedAt = new Date(repository.pushedAt).getTime();
      const pushCutoff = new Date(now).getTime() - Number(config.maxPushAgeHours || 168) * 60 * 60 * 1000;
      if (!repository.candidateSources.includes('watch') && Number.isFinite(pushedAt) && pushedAt < pushCutoff) {
        normallyFilteredRepos += 1;
        continue;
      }
    } catch (error) {
      errors.push(`GitHub metadata ${candidate.fullName}: ${error.message}`);
      continue;
    }

    try {
      const remainingBudget = maxGraphqlRequests - graphqlRequests;
      const starResult = await countStargazers({
        fullName: repository.fullName,
        since,
        maxPages: Math.max(1, Math.min(Number(config.maxPagesPerRepo || 5), remainingBudget))
      });
      graphqlRequests += Math.max(1, Number(starResult.pagesFetched || 1));
      if (starResult.partial) partialRepos += 1;

      const item = {
        source: 'github-trend',
        ...repository,
        stars24h: Number(starResult.stars24h || 0),
        starVelocity: calculateStarVelocity(starResult.stars24h, repository.createdAt, now),
        windowHours,
        partial: Boolean(starResult.partial)
      };
      const snapshot = recordTrendSnapshot(state, 'github', item.fullName, {
        now,
        metrics: {
          lastStars: item.stars,
          stars24h: item.stars24h
        }
      });
      item.starDeltaSinceLastRun = snapshot.deltas.lastStars;
      evaluated.push(item);
    } catch (error) {
      errors.push(`GitHub stargazers ${repository.fullName}: ${error.message}`);
    }
  }

  const eligible = evaluated.filter(item => item.stars24h >= Number(config.minStars24h ?? 1));
  const maxItems = Number(config.maxItems || 10);
  const byStars24h = [...eligible]
    .sort((a, b) => b.stars24h - a.stars24h || b.starVelocity - a.starVelocity)
    .slice(0, maxItems);
  const byVelocity = [...eligible]
    .sort((a, b) => b.starVelocity - a.starVelocity || b.stars24h - a.stars24h)
    .slice(0, maxItems);
  const repos = [...new Map([...byStars24h, ...byVelocity].map(item => [item.fullName, item])).values()];
  const noConfiguredSources = staticCandidateCount === 0 && (config.discoveryTopics || []).length === 0;
  const successful = evaluated.length > 0 || normallyFilteredRepos > 0 ||
    successfulDiscoveries > 0 || (selectedCandidates.length === 0 && staticCandidateCount > 0) ||
    noConfiguredSources;
  const degraded = errors.length > 0 || partialRepos > 0;
  const blockedAuth = !successful && errors.some(error =>
    /auth login|authentication required|not logged in|requires authentication|http 401/i.test(error)
  );

  return {
    repos,
    rankings: { byStars24h, byVelocity },
    health: {
      status: blockedAuth
        ? 'blocked_auth'
        : !successful ? 'failed'
        : degraded ? 'degraded' : baselineOnly && repos.length > 0 ? 'baseline_only' : repos.length > 0 ? 'ok_new' : 'ok_no_new',
      backend: 'github-search+graphql',
      lastHttpStatus: successful ? 200 : null,
      itemsBeforeFilter: selectedCandidates.length,
      itemsAfterFilter: repos.length,
      windowHours,
      lastSuccessAt: successful ? timestamp : null,
      partial: degraded
    },
    errors,
    stats: {
      candidates: selectedCandidates.length,
      evaluated: evaluated.length,
      normallyFilteredRepos,
      successfulDiscoveries,
      graphqlRequests,
      partialRepos
    }
  };
}

export async function countRecentStargazers({ fullName, since, fetchPage, maxPages = 5 }) {
  const [owner, name, ...extra] = String(fullName || '').split('/');
  if (!owner || !name || extra.length > 0) throw new TypeError(`Invalid GitHub repository: ${fullName}`);
  const sinceMs = new Date(since).getTime();
  if (!Number.isFinite(sinceMs)) throw new TypeError(`Invalid GitHub star window: ${since}`);

  let after = null;
  let pagesFetched = 0;
  let stars24h = 0;
  let reachedBoundary = false;
  let hasNextPage = false;

  while (pagesFetched < maxPages) {
    const page = await fetchPage({ owner, name, after });
    pagesFetched += 1;
    const edges = Array.isArray(page?.edges) ? page.edges : [];

    for (const edge of edges) {
      const starredAt = new Date(edge?.starredAt).getTime();
      if (!Number.isFinite(starredAt)) continue;
      if (starredAt < sinceMs) {
        reachedBoundary = true;
        break;
      }
      stars24h += 1;
    }

    hasNextPage = Boolean(page?.pageInfo?.hasNextPage);
    if (reachedBoundary || !hasNextPage) break;
    after = page?.pageInfo?.endCursor || null;
    if (!after) break;
  }

  return {
    stars24h,
    pagesFetched,
    partial: hasNextPage && !reachedBoundary && pagesFetched >= maxPages
  };
}

export async function collectRedditTrends({
  now = new Date(),
  state,
  config = {},
  primarySearch,
  fallbackSearch,
  windowHours = 24
}) {
  const timestamp = new Date(now).toISOString();
  try {
    const result = normalizeSearchResult(await primarySearch(), 'anysearch');
    return processRedditSearchResult(result, {
      now,
      state,
      config: { windowHours, ...config },
      backend: result.backend,
      degraded: result.degraded,
      attempts: [{ backend: result.backend, httpStatus: result.httpStatus }]
    });
  } catch (primaryError) {
    const primaryAttempt = errorAttempt(primaryError, 'anysearch');
    try {
      const result = normalizeSearchResult(await fallbackSearch(), 'arctic-shift');
      return processRedditSearchResult(result, {
        now,
        state,
        config: { windowHours, ...config },
        backend: `${primaryAttempt.backend}->${result.backend}`,
        degraded: true,
        attempts: [primaryAttempt, { backend: result.backend, httpStatus: result.httpStatus }]
      });
    } catch (fallbackError) {
      const fallbackAttempt = errorAttempt(fallbackError, 'arctic-shift');
      return {
        items: [],
        health: {
          status: 'failed',
          backend: `${primaryAttempt.backend}->${fallbackAttempt.backend}`,
          lastHttpStatus: fallbackAttempt.httpStatus,
          itemsBeforeFilter: 0,
          itemsAfterFilter: 0,
          windowHours,
          lastSuccessAt: null,
          attempts: [primaryAttempt, fallbackAttempt]
        },
        errors: [primaryAttempt, fallbackAttempt].map(attempt => `${attempt.backend}: ${attempt.error}`)
      };
    }
  }
}
