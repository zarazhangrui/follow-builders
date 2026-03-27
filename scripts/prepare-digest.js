#!/usr/bin/env node

// ============================================================================
// Follow Builders — Prepare Digest
// ============================================================================
// Gathers everything the LLM needs to produce a digest:
// - Reads local feed files (tweets + podcasts + blogs)
// - Loads local prompts (with optional user overrides)
// - Reads the user's config (language, delivery method)
// - Outputs a single JSON blob to stdout
//
// The LLM's ONLY job is to read this JSON, remix the content, and output
// the digest text. Everything else is handled here deterministically.
//
// Local-only mode: this script does NOT fetch prompts or feeds from GitHub.
//
// Usage: node prepare-digest.js
// Output: JSON to stdout
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');

const SCRIPT_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname);
const FEED_X_PATH = join(SCRIPT_DIR, '..', 'feed-x.json');
const FEED_PODCASTS_PATH = join(SCRIPT_DIR, '..', 'feed-podcasts.json');
const FEED_BLOGS_PATH = join(SCRIPT_DIR, '..', 'feed-blogs.json');

const PROMPT_FILES = [
  'summarize-podcast.md',
  'summarize-tweets.md',
  'summarize-blogs.md',
  'digest-intro.md',
  'translate.md'
];

// -- Local file helpers ------------------------------------------------------

async function readJSONIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf-8'));
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

  // 2. Read all three local feeds
  const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
    readJSONIfExists(FEED_X_PATH),
    readJSONIfExists(FEED_PODCASTS_PATH),
    readJSONIfExists(FEED_BLOGS_PATH)
  ]);

  if (!feedX) errors.push(`Could not read local tweet feed: ${FEED_X_PATH}`);
  if (!feedPodcasts) errors.push(`Could not read local podcast feed: ${FEED_PODCASTS_PATH}`);
  if (!feedBlogs) errors.push(`Could not read local blog feed: ${FEED_BLOGS_PATH}`);

  // 3. Load prompts with priority: user custom > local default
  //
  // If the user has a custom prompt at ~/.follow-builders/prompts/<file>,
  // use that. Otherwise, use the local copy shipped with the skill.
  const prompts = {};
  const localPromptsDir = join(SCRIPT_DIR, '..', 'prompts');
  const userPromptsDir = join(USER_DIR, 'prompts');

  for (const filename of PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    const userPath = join(userPromptsDir, filename);
    const localPath = join(localPromptsDir, filename);

    // Priority 1: user's custom prompt
    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
      continue;
    }

    // Priority 2: local copy shipped with the skill
    if (existsSync(localPath)) {
      prompts[key] = await readFile(localPath, 'utf-8');
    } else {
      errors.push(`Could not load local prompt: ${filename}`);
    }
  }

  // 4. Build the output — everything the LLM needs in one blob
  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),

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
      totalTweets: (feedX?.x || []).reduce((sum, a) => sum + a.tweets.length, 0),
      blogPosts: feedBlogs?.blogs?.length || 0,
      feedGeneratedAt: feedX?.generatedAt || feedPodcasts?.generatedAt || feedBlogs?.generatedAt || null
    },

    // Prompts — the LLM reads these and follows the instructions
    prompts,

    // Non-fatal errors
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
