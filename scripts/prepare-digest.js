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

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const SEEN_PATH = join(USER_DIR, 'seen-content.json');

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

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

// -- Local deduplication -----------------------------------------------------

async function loadSeen() {
  if (!existsSync(SEEN_PATH)) {
    return { tweets: {}, videos: {}, articles: {} };
  }
  try {
    return JSON.parse(await readFile(SEEN_PATH, 'utf-8'));
  } catch {
    return { tweets: {}, videos: {}, articles: {} };
  }
}

async function saveSeen(seen) {
  await mkdir(USER_DIR, { recursive: true });
  await writeFile(SEEN_PATH, JSON.stringify(seen, null, 2));
}

function filterNew(items, seenMap, idField) {
  const newItems = [];
  for (const item of items) {
    const id = item[idField];
    if (!seenMap[id]) {
      newItems.push(item);
      seenMap[id] = Date.now();
    }
  }
  return newItems;
}

// -- Main --------------------------------------------------------------------

async function main() {
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

  // 2. Load seen content
  const seen = await loadSeen();

  // 3. Fetch all three feeds
  const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
    fetchJSON(FEED_X_URL),
    fetchJSON(FEED_PODCASTS_URL),
    fetchJSON(FEED_BLOGS_URL)
  ]);

  if (!feedX) errors.push('Could not fetch tweet feed');
  if (!feedPodcasts) errors.push('Could not fetch podcast feed');
  if (!feedBlogs) errors.push('Could not fetch blog feed');
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

  // 4. Filter out already-seen content
  const filteredX = (feedX?.x || []).map(builder => ({
    ...builder,
    tweets: filterNew(builder.tweets, seen.tweets, 'id')
  })).filter(b => b.tweets.length > 0);

  const filteredPodcasts = filterNew(feedPodcasts?.podcasts || [], seen.videos, 'videoId');
  const filteredBlogs = filterNew(feedBlogs?.blogs || [], seen.articles, 'url');

  // 5. Load prompts with priority: user custom > remote (GitHub) > local default
  const prompts = {};
  const scriptDir = decodeURIComponent(new URL('.', import.meta.url).pathname);
  const localPromptsDir = join(scriptDir, '..', 'prompts');
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

  // 6. Save updated seen content
  await saveSeen(seen);

  // 7. Build the output
  const hasContent = filteredPodcasts.length > 0 || filteredX.length > 0 || filteredBlogs.length > 0;

  if (!hasContent) {
    // No new content - output a simple message
    console.log('今天没有新的内容更新。');
    return;
  }

  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    config: {
      language: config.language || 'en',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' }
    },
    podcasts: filteredPodcasts,
    x: filteredX,
    blogs: filteredBlogs,
    stats: {
      podcastEpisodes: filteredPodcasts.length,
      xBuilders: filteredX.length,
      totalTweets: filteredX.reduce((sum, a) => sum + a.tweets.length, 0),
      blogPosts: filteredBlogs.length,
      feedGeneratedAt: feedX?.generatedAt || feedPodcasts?.generatedAt || feedBlogs?.generatedAt || null
    },
    prompts,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    status: 'error',
    message: err.message
  }));
  process.exit(1);
});
