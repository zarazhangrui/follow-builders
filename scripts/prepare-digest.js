#!/usr/bin/env node

// ============================================================================
// Follow Builders — Prepare Digest
// ============================================================================
// Gathers everything the LLM needs to produce a digest:
// - Fetches the central feeds (tweets + podcasts)
// - Fetches the latest prompts from GitHub
// - Reads the user's config (language, delivery method)
// - Outputs a single JSON blob to stdout
//
// The LLM's ONLY job is to read this JSON, remix the content, and output
// the digest text. Everything else is handled here deterministically.
//
// Usage: node prepare-digest.js
// Output: JSON to stdout
// ============================================================================

import { readFile } from 'fs/promises';
import { setDefaultResultOrder } from 'dns';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

setDefaultResultOrder('ipv4first');

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const SCRIPT_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname);
const REPO_ROOT = join(SCRIPT_DIR, '..');
const FETCH_TIMEOUT_MS = Number(process.env.FOLLOW_BUILDERS_FETCH_TIMEOUT_MS || 15000);
const execFileAsync = promisify(execFile);
let originMainFetchPromise = null;

const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json';
const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json';

const PROMPTS_BASE = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/prompts';
const PROMPT_FILES = [
  'summarize-podcast.md',
  'summarize-tweets.md',
  'summarize-blogs.md',
  'digest-intro.md',
  'digest-intro-expanded.md',
  'translate.md'
];

// -- Fetch helpers -----------------------------------------------------------

async function fetchJSON(url, fetcher = fetch) {
  const res = await fetcher(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.json();
}

async function fetchText(url, fetcher = fetch) {
  const res = await fetcher(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.text();
}

export async function fetchJSONWithFallback({ url, localPath, label, errors, fetcher = fetch }) {
  try {
    const remote = await fetchJSON(url, fetcher);
    if (remote) return remote;
    errors.push(`Remote ${label} returned an unusable response`);
  } catch (err) {
    errors.push(`Remote ${label} failed: ${err.message}`);
  }

  if (!existsSync(localPath)) {
    errors.push(`Local fallback for ${label} not found: ${localPath}`);
    return null;
  }

  try {
    return JSON.parse(await readFile(localPath, 'utf-8'));
  } catch (err) {
    errors.push(`Local fallback for ${label} failed: ${err.message}`);
    return null;
  }
}

async function readGitBlob(ref, filePath) {
  const { stdout } = await execFileAsync('git', ['show', `${ref}:${filePath}`], {
    cwd: REPO_ROOT,
    maxBuffer: 20 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

async function readGitTextBlob(ref, filePath) {
  const { stdout } = await execFileAsync('git', ['show', `${ref}:${filePath}`], {
    cwd: REPO_ROOT,
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout;
}

async function ensureOriginMainFetched() {
  if (!originMainFetchPromise) {
    originMainFetchPromise = execFileAsync('git', ['fetch', '--quiet', 'origin', 'main'], {
      cwd: REPO_ROOT,
      timeout: FETCH_TIMEOUT_MS
    });
  }
  return originMainFetchPromise;
}

export async function fetchFreshJSON({
  url,
  filePath,
  label,
  errors,
  fetcher = fetch,
  gitFetcher = ensureOriginMainFetched,
  gitReader = readGitBlob
}) {
  try {
    await gitFetcher();
    const fromOrigin = await gitReader('origin/main', filePath);
    return { data: fromOrigin, source: 'origin_main' };
  } catch (err) {
    errors.push(`Git origin/main ${label} failed: ${err.message}`);
  }

  try {
    const remote = await fetchJSON(url, fetcher);
    if (remote) {
      return { data: remote, source: 'github_raw' };
    }
    errors.push(`Remote ${label} returned an unusable response`);
  } catch (err) {
    errors.push(`Remote ${label} failed: ${err.message}`);
  }

  return { data: null, source: null };
}

export async function fetchTextWithFallback({ url, localPath, label, errors, fetcher = fetch }) {
  try {
    const remote = await fetchText(url, fetcher);
    if (remote) return remote;
    errors.push(`Remote ${label} returned an unusable response`);
  } catch (err) {
    errors.push(`Remote ${label} failed: ${err.message}`);
  }

  if (!existsSync(localPath)) {
    errors.push(`Local fallback for ${label} not found: ${localPath}`);
    return null;
  }

  try {
    return readFile(localPath, 'utf-8');
  } catch (err) {
    errors.push(`Local fallback for ${label} failed: ${err.message}`);
    return null;
  }
}

export async function fetchTextWithRemoteFallback({
  url,
  filePath,
  localPath,
  label,
  errors,
  fetcher = fetch,
  gitFetcher = ensureOriginMainFetched,
  gitTextReader = readGitTextBlob
}) {
  try {
    await gitFetcher();
    return await gitTextReader('origin/main', filePath);
  } catch (err) {
    errors.push(`Git origin/main ${label} failed: ${err.message}`);
  }

  return fetchTextWithFallback({ url, localPath, label, errors, fetcher });
}

export function resolveDigestMode(args = [], config = {}) {
  if (args.includes('--expanded')) return 'expanded';
  if (args.includes('--standard')) return 'standard';
  return config.digestMode === 'expanded' ? 'expanded' : 'standard';
}

function promptKeyFor(filename) {
  if (filename === 'digest-intro.md') return 'digest_intro_standard';
  if (filename === 'digest-intro-expanded.md') return 'digest_intro_expanded';
  return filename.replace('.md', '').replace(/-/g, '_');
}

// -- Main --------------------------------------------------------------------

async function main() {
  const errors = [];
  const args = process.argv.slice(2);

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

  const digestMode = resolveDigestMode(args, config);

  // 2. Fetch all three feeds.
  //
  // Feeds must be fresh enough to be tied to the current remote source. A local
  // repo fallback can be weeks old, which is worse than no digest for news.
  const [feedXResult, feedPodcastsResult, feedBlogsResult] = await Promise.all([
    fetchFreshJSON({
      url: FEED_X_URL,
      filePath: 'feed-x.json',
      label: 'tweet feed',
      errors
    }),
    fetchFreshJSON({
      url: FEED_PODCASTS_URL,
      filePath: 'feed-podcasts.json',
      label: 'podcast feed',
      errors
    }),
    fetchFreshJSON({
      url: FEED_BLOGS_URL,
      filePath: 'feed-blogs.json',
      label: 'blog feed',
      errors
    })
  ]);

  const feedX = feedXResult.data;
  const feedPodcasts = feedPodcastsResult.data;
  const feedBlogs = feedBlogsResult.data;

  if (!feedX) errors.push('Could not fetch tweet feed');
  if (!feedPodcasts) errors.push('Could not fetch podcast feed');
  if (!feedBlogs) errors.push('Could not fetch blog feed');

  if (!feedX || !feedPodcasts || !feedBlogs) {
    console.log(JSON.stringify({
      status: 'no_fresh_data',
      generatedAt: new Date().toISOString(),
      message: 'Could not verify the latest remote feeds. No digest should be generated from local fallback data.',
      config: {
        language: config.language || 'en',
        frequency: config.frequency || 'daily',
        digestMode,
        delivery: config.delivery || { method: 'stdout' }
      },
      stats: {
        podcastEpisodes: 0,
        xBuilders: 0,
        totalTweets: 0,
        blogPosts: 0,
        feedGeneratedAt: null
      },
      feedSources: {
        x: feedXResult.source,
        podcasts: feedPodcastsResult.source,
        blogs: feedBlogsResult.source
      },
      errors
    }, null, 2));
    return;
  }

  // 3. Load prompts with priority: user custom > remote (GitHub) > local default
  //
  // If the user has a custom prompt at ~/.follow-builders/prompts/<file>,
  // use that (they personalized it — don't overwrite with remote updates).
  // Otherwise, fetch the latest from GitHub so they get central improvements.
  // If GitHub is unreachable, fall back to the local copy shipped with the skill.
  const prompts = {};
  const localPromptsDir = join(REPO_ROOT, 'prompts');
  const userPromptsDir = join(USER_DIR, 'prompts');

  for (const filename of PROMPT_FILES) {
    const key = promptKeyFor(filename);
    const userPath = join(userPromptsDir, filename);
    const localPath = join(localPromptsDir, filename);

    // Priority 1: user's custom prompt (they personalized it)
    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
      continue;
    }

    // Priority 2: latest from GitHub (central updates), falling back to local copy.
    const prompt = await fetchTextWithRemoteFallback({
      url: `${PROMPTS_BASE}/${filename}`,
      filePath: `prompts/${filename}`,
      localPath,
      label: `prompt ${filename}`,
      errors
    });
    if (prompt) {
      prompts[key] = prompt;
      continue;
    }
  }

  // Keep the historical key stable while selecting the requested edition.
  prompts.digest_intro =
    prompts[`digest_intro_${digestMode}`] ||
    prompts.digest_intro_standard ||
    prompts.digest_intro_expanded;

  // 4. Build the output — everything the LLM needs in one blob
  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),

    // User preferences
    config: {
      language: config.language || 'en',
      frequency: config.frequency || 'daily',
      digestMode,
      delivery: config.delivery || { method: 'stdout' }
    },

    // Content to remix
    podcasts: feedPodcasts?.podcasts || [],
    x: feedX?.x || [],
    blogs: feedBlogs?.blogs || [],

    // Stats for the LLM to reference
    stats: {
      podcastEpisodes: feedPodcasts?.podcasts?.length || 0,
      xBuilders: feedX?.x?.length || 0,
      totalTweets: (feedX?.x || []).reduce((sum, a) => sum + a.tweets.length, 0),
      blogPosts: feedBlogs?.blogs?.length || 0,
      feedGeneratedAt: feedX?.generatedAt || feedPodcasts?.generatedAt || feedBlogs?.generatedAt || null
    },

    feedSources: {
      x: feedXResult.source,
      podcasts: feedPodcastsResult.source,
      blogs: feedBlogsResult.source
    },

    // Prompts — the LLM reads these and follows the instructions
    prompts,

    // Non-fatal errors
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(JSON.stringify({
      status: 'error',
      message: err.message
    }));
    process.exit(1);
  });
}
