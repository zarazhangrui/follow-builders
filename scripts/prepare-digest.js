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
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { filterPodcasts } from './source-url.js';

export { filterPodcasts, isUsableSourceUrl } from './source-url.js';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');

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

const FEED_FETCH_ATTEMPTS = 3;
const FEED_FETCH_TIMEOUT_MS = 15000;
const PROMPT_FETCH_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 500;
const DEFAULT_MAX_FEED_AGE_HOURS = 30;

// -- Fetch helpers -----------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function describeError(error) {
  const name = error?.name || 'Error';
  const message = error?.message || String(error);
  const causeCode = error?.cause?.code;
  return causeCode ? `${name}: ${message} (${causeCode})` : `${name}: ${message}`;
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchJSON(url, label, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const attempts = options.attempts || FEED_FETCH_ATTEMPTS;
  const timeoutMs = options.timeoutMs || FEED_FETCH_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const sleepImpl = options.sleepImpl || sleep;
  let lastError = 'unknown error';
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    attemptsUsed = attempt;
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': 'follow-builders/prepare-digest' },
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (res.ok) {
        try {
          return { data: await res.json(), attempts: attempt, error: null };
        } catch (error) {
          lastError = `invalid JSON (${describeError(error)})`;
        }
      } else {
        lastError = `HTTP ${res.status}`;
        if (!isRetryableStatus(res.status)) break;
      }
    } catch (error) {
      lastError = describeError(error);
    }

    if (attempt < attempts) {
      await sleepImpl(retryDelayMs * attempt);
    }
  }

  return {
    data: null,
    attempts: attemptsUsed,
    error: `${label} failed after ${attemptsUsed} attempt(s): ${lastError}`
  };
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'follow-builders/prepare-digest' },
      signal: AbortSignal.timeout(PROMPT_FETCH_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

export function getFeedFreshness(feed, nowMs, maxAgeHours) {
  if (!feed) {
    return { generatedAt: null, ageHours: null, stale: false };
  }

  const generatedAt = feed.generatedAt || null;
  const generatedAtMs = Date.parse(generatedAt);
  if (!generatedAt || !Number.isFinite(generatedAtMs)) {
    return { generatedAt, ageHours: null, stale: true };
  }

  const ageHours = Math.max(0, (nowMs - generatedAtMs) / (60 * 60 * 1000));
  return {
    generatedAt,
    ageHours: Number(ageHours.toFixed(2)),
    stale: ageHours > maxAgeHours
  };
}

function getMaxFeedAgeHours(config) {
  const configured = Number(config.maxFeedAgeHours);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_FEED_AGE_HOURS;
}

// -- Main --------------------------------------------------------------------

export async function main() {
  const errors = [];

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

  // 2. Fetch all three feeds
  const [feedXResult, feedPodcastsResult, feedBlogsResult] = await Promise.all([
    fetchJSON(FEED_X_URL, 'Tweet feed'),
    fetchJSON(FEED_PODCASTS_URL, 'Podcast feed'),
    fetchJSON(FEED_BLOGS_URL, 'Blog feed')
  ]);

  const feedX = feedXResult.data;
  const feedPodcasts = feedPodcastsResult.data;
  const feedBlogs = feedBlogsResult.data;

  if (feedXResult.error) errors.push(feedXResult.error);
  if (feedPodcastsResult.error) errors.push(feedPodcastsResult.error);
  if (feedBlogsResult.error) errors.push(feedBlogsResult.error);
  if (feedX?.errors?.length) {
    errors.push(
      ...feedX.errors.map((error) => `Tweet feed problem: ${error}`)
    );
  }
  if (feedPodcasts?.errors?.length) {
    errors.push(
      ...feedPodcasts.errors.map((error) => `Podcast feed problem: ${error}`)
    );
  }
  if (feedBlogs?.errors?.length) {
    errors.push(
      ...feedBlogs.errors.map((error) => `Blog feed problem: ${error}`)
    );
  }

  const maxFeedAgeHours = getMaxFeedAgeHours(config);
  const feedResults = {
    x: feedXResult,
    podcasts: feedPodcastsResult,
    blogs: feedBlogsResult
  };
  const nowMs = Date.now();
  const sourceStatus = Object.fromEntries(
    Object.entries(feedResults).map(([name, result]) => {
      const freshness = getFeedFreshness(result.data, nowMs, maxFeedAgeHours);
      const staleError = freshness.stale
        ? `${name} feed is stale: generatedAt=${freshness.generatedAt || 'missing'}, maxAgeHours=${maxFeedAgeHours}`
        : null;
      if (staleError) errors.push(staleError);
      return [name, {
        ok: Boolean(result.data),
        attempts: result.attempts,
        generatedAt: freshness.generatedAt,
        ageHours: freshness.ageHours,
        stale: freshness.stale,
        error: result.error || staleError
      }];
    })
  );

  const freshFeedX = sourceStatus.x.ok && !sourceStatus.x.stale ? feedX : null;
  const freshFeedPodcasts = sourceStatus.podcasts.ok && !sourceStatus.podcasts.stale
    ? feedPodcasts
    : null;
  const freshFeedBlogs = sourceStatus.blogs.ok && !sourceStatus.blogs.stale
    ? feedBlogs
    : null;
  const podcasts = filterPodcasts(freshFeedPodcasts?.podcasts || [], errors);
  const unhealthyFeedCount = Object.values(sourceStatus).filter(
    source => !source.ok || source.stale
  ).length;

  // 3. Load prompts with priority: user custom > remote (GitHub) > local default
  //
  // If the user has a custom prompt at ~/.follow-builders/prompts/<file>,
  // use that (they personalized it — don't overwrite with remote updates).
  // Otherwise, fetch the latest from GitHub so they get central improvements.
  // If GitHub is unreachable, fall back to the local copy shipped with the skill.
  const prompts = {};
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const localPromptsDir = join(scriptDir, '..', 'prompts');
  const userPromptsDir = join(USER_DIR, 'prompts');

  for (const filename of PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    const userPath = join(userPromptsDir, filename);
    const localPath = join(localPromptsDir, filename);

    // Priority 1: user's custom prompt (they personalized it)
    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
      continue;
    }

    // Priority 2: latest from GitHub (central updates)
    const remote = await fetchText(`${PROMPTS_BASE}/${filename}`);
    if (remote) {
      prompts[key] = remote;
      continue;
    }

    // Priority 3: local copy shipped with the skill
    if (existsSync(localPath)) {
      prompts[key] = await readFile(localPath, 'utf-8');
    } else {
      errors.push(`Could not load prompt: ${filename}`);
    }
  }

  // 4. Build the output — everything the LLM needs in one blob
  const output = {
    status: unhealthyFeedCount === 0 ? 'ok' : 'partial',
    generatedAt: new Date().toISOString(),

    // User preferences
    config: {
      language: config.language || 'en',
      timezone: config.timezone || 'UTC',
      frequency: config.frequency || 'daily',
      maxFeedAgeHours,
      delivery: config.delivery || { method: 'stdout' }
    },

    // Content to remix
    podcasts,
    x: freshFeedX?.x || [],
    blogs: freshFeedBlogs?.blogs || [],

    // Stats for the LLM to reference
    stats: {
      podcastEpisodes: podcasts.length,
      xBuilders: freshFeedX?.x?.length || 0,
      totalTweets: (freshFeedX?.x || []).reduce((sum, a) => sum + a.tweets.length, 0),
      blogPosts: freshFeedBlogs?.blogs?.length || 0,
      feedGeneratedAt: feedX?.generatedAt || feedPodcasts?.generatedAt || feedBlogs?.generatedAt || null
    },

    // Per-source fetch health. Empty content is only a true "no updates" result
    // when the corresponding source reports ok=true.
    sourceStatus,

    // Prompts — the LLM reads these and follows the instructions
    prompts,

    // Non-fatal errors
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(JSON.stringify({
      status: 'error',
      message: err.message
    }));
    process.exit(1);
  });
}
