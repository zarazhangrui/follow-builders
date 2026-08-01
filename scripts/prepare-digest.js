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

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// -- Constants ---------------------------------------------------------------

const DEFAULT_USER_DIR = join(homedir(), '.follow-builders');
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));

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

// -- Fetch helpers -----------------------------------------------------------

async function fetchJSON(url, fetchImpl) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      const suffix = response.statusText ? ` ${response.statusText}` : '';
      return { data: null, error: `HTTP ${response.status}${suffix}` };
    }
    return { data: await response.json(), error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

async function fetchText(url, fetchImpl) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

// -- Main --------------------------------------------------------------------

export async function prepareDigest({
  fetchImpl = globalThis.fetch,
  userDir = DEFAULT_USER_DIR,
  now = () => new Date()
} = {}) {
  const errors = [];
  const configPath = join(userDir, 'config.json');

  // 1. Read user config
  let config = {
    language: 'en',
    frequency: 'daily',
    delivery: { method: 'stdout' }
  };
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(await readFile(configPath, 'utf-8'));
    } catch (err) {
      errors.push(`Could not read config: ${err.message}`);
    }
  }

  // 2. Fetch all three feeds
  const [xResult, podcastResult, blogResult] = await Promise.all([
    fetchJSON(FEED_X_URL, fetchImpl),
    fetchJSON(FEED_PODCASTS_URL, fetchImpl),
    fetchJSON(FEED_BLOGS_URL, fetchImpl)
  ]);

  const feedX = xResult.data;
  const feedPodcasts = podcastResult.data;
  const feedBlogs = blogResult.data;

  if (xResult.error) {
    errors.push(`Tweet feed problem: ${xResult.error}`);
  }
  if (podcastResult.error) {
    errors.push(`Podcast feed problem: ${podcastResult.error}`);
  }
  if (blogResult.error) {
    errors.push(`Blog feed problem: ${blogResult.error}`);
  }

  let hasUpstreamFeedErrors = false;
  if (feedX?.errors?.length) {
    hasUpstreamFeedErrors = true;
    errors.push(
      ...feedX.errors.map((error) => `Tweet feed problem: ${error}`)
    );
  }
  if (feedPodcasts?.errors?.length) {
    hasUpstreamFeedErrors = true;
    errors.push(
      ...feedPodcasts.errors.map((error) => `Podcast feed problem: ${error}`)
    );
  }
  if (feedBlogs?.errors?.length) {
    hasUpstreamFeedErrors = true;
    errors.push(
      ...feedBlogs.errors.map((error) => `Blog feed problem: ${error}`)
    );
  }

  // 3. Load prompts with priority: user custom > remote (GitHub) > local default
  //
  // If the user has a custom prompt at ~/.follow-builders/prompts/<file>,
  // use that (they personalized it — don't overwrite with remote updates).
  // Otherwise, fetch the latest from GitHub so they get central improvements.
  // If GitHub is unreachable, fall back to the local copy shipped with the skill.
  const prompts = {};
  const localPromptsDir = join(SCRIPT_DIRECTORY, '..', 'prompts');
  const userPromptsDir = join(userDir, 'prompts');

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
    const remote = await fetchText(`${PROMPTS_BASE}/${filename}`, fetchImpl);
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

  const feedStatus = {
    x: {
      status: feedX ? 'ok' : 'error',
      generatedAt: feedX?.generatedAt || null,
      ...(xResult.error ? { error: xResult.error } : {})
    },
    podcasts: {
      status: feedPodcasts ? 'ok' : 'error',
      generatedAt: feedPodcasts?.generatedAt || null,
      ...(podcastResult.error ? { error: podcastResult.error } : {})
    },
    blogs: {
      status: feedBlogs ? 'ok' : 'error',
      generatedAt: feedBlogs?.generatedAt || null,
      ...(blogResult.error ? { error: blogResult.error } : {})
    }
  };

  const loadedFeedCount = [feedX, feedPodcasts, feedBlogs].filter(Boolean).length;
  const status =
    loadedFeedCount === 0
      ? 'error'
      : loadedFeedCount < 3 || hasUpstreamFeedErrors
        ? 'partial'
        : 'ok';

  // 4. Build the output — everything the LLM needs in one blob
  const output = {
    status,
    generatedAt: now().toISOString(),
    feedStatus,

    // User preferences
    config: {
      language: config.language || 'en',
      frequency: config.frequency || 'daily',
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
      totalTweets: (feedX?.x || []).reduce(
        (sum, builder) =>
          sum + (Array.isArray(builder.tweets) ? builder.tweets.length : 0),
        0
      ),
      blogPosts: feedBlogs?.blogs?.length || 0,
      feedGeneratedAt: feedX?.generatedAt || feedPodcasts?.generatedAt || feedBlogs?.generatedAt || null
    },

    // Prompts — the LLM reads these and follows the instructions
    prompts,

    // Non-fatal errors
    errors: errors.length > 0 ? errors : undefined
  };

  return output;
}

async function runCli() {
  const output = await prepareDigest();
  console.log(JSON.stringify(output, null, 2));
  if (output.status === 'error') {
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  runCli().catch((error) => {
    console.error(
      JSON.stringify({
        status: 'error',
        message: error.message
      })
    );
    process.exitCode = 1;
  });
}
