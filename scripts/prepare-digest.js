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
import { join } from 'path';
import { homedir } from 'os';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const SUPPORTED_INDUSTRIES = new Set(['womenswear']);

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

const INDUSTRY_PROMPT_FILES = [
  'short-video-topics.md',
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

async function readJSON(path) {
  return JSON.parse((await readFile(path, 'utf-8')).replace(/^\uFEFF/, ''));
}

async function loadPromptFile({ filename, localDir, userDir, errors }) {
  const userPath = join(userDir, filename);
  const localPath = join(localDir, filename);

  if (existsSync(userPath)) {
    return readFile(userPath, 'utf-8');
  }

  if (existsSync(localPath)) {
    return readFile(localPath, 'utf-8');
  }

  errors.push(`Could not load prompt: ${filename}`);
  return '';
}

function normalizeIndustry(industry) {
  if (!industry || industry === 'ai-builders') return 'ai-builders';
  return industry;
}

async function prepareIndustryDigest({ config, scriptDir, errors }) {
  const industry = normalizeIndustry(config.industry);

  if (!SUPPORTED_INDUSTRIES.has(industry)) {
    return {
      status: 'error',
      message: `Unsupported industry: ${industry}`,
      supportedIndustries: [...SUPPORTED_INDUSTRIES]
    };
  }

  const localIndustryDir = join(scriptDir, '..', 'config', 'industries', industry);
  const localPromptsDir = join(scriptDir, '..', 'prompts', 'industries', industry);
  const userIndustryDir = join(USER_DIR, 'industries', industry);
  const userPromptsDir = join(userIndustryDir, 'prompts');
  const feedPath = join(userIndustryDir, 'feed.json');
  const profilePath = join(localIndustryDir, 'profile.json');

  let profile = {};
  if (existsSync(profilePath)) {
    try {
      profile = await readJSON(profilePath);
    } catch (err) {
      errors.push(`Could not read industry profile: ${err.message}`);
    }
  } else {
    errors.push(`Could not find industry profile: ${industry}`);
  }

  const prompts = {};
  for (const filename of INDUSTRY_PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    prompts[key] = await loadPromptFile({
      filename,
      localDir: localPromptsDir,
      userDir: userPromptsDir,
      errors
    });
  }

  let items = [];
  if (!existsSync(feedPath)) {
    return {
      status: 'empty',
      message: `No local content feed found for industry "${industry}". Add items to ${feedPath}.`,
      generatedAt: new Date().toISOString(),
      config: {
        language: config.language || 'en',
        frequency: config.frequency || 'daily',
        delivery: config.delivery || { method: 'stdout' },
        industry,
        outputMode: config.outputMode || 'short_video_topics'
      },
      industry: profile,
      items,
      prompts,
      stats: { items: 0, linkedItems: 0, sourceTypes: {} },
      errors: errors.length > 0 ? errors : undefined
    };
  }

  try {
    const feed = await readJSON(feedPath);
    items = Array.isArray(feed) ? feed : feed.items || [];
  } catch (err) {
    return {
      status: 'error',
      message: `Could not parse local content feed for industry "${industry}": ${err.message}`,
      feedPath
    };
  }

  const sourceTypes = {};
  for (const item of items) {
    const type = item.sourceType || 'unknown';
    sourceTypes[type] = (sourceTypes[type] || 0) + 1;
  }

  if (items.length === 0) {
    return {
      status: 'empty',
      message: `No local content items found for industry "${industry}". Add items to ${feedPath}.`,
      generatedAt: new Date().toISOString(),
      config: {
        language: config.language || 'en',
        frequency: config.frequency || 'daily',
        delivery: config.delivery || { method: 'stdout' },
        industry,
        outputMode: config.outputMode || 'short_video_topics'
      },
      industry: profile,
      items,
      prompts,
      stats: { items: 0, linkedItems: 0, sourceTypes },
      errors: errors.length > 0 ? errors : undefined
    };
  }

  return {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    config: {
      language: config.language || 'en',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' },
      industry,
      outputMode: config.outputMode || 'short_video_topics'
    },
    industry: profile,
    items,
    stats: {
      items: items.length,
      linkedItems: items.filter((item) => Boolean(item.url)).length,
      sourceTypes
    },
    prompts,
    errors: errors.length > 0 ? errors : undefined
  };
}

// -- Main --------------------------------------------------------------------

async function main() {
  const errors = [];
  const scriptDir = decodeURIComponent(new URL('.', import.meta.url).pathname);

  // 1. Read user config
  let config = {
    language: 'en',
    frequency: 'daily',
    delivery: { method: 'stdout' },
    industry: 'ai-builders',
    outputMode: 'digest'
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      config = await readJSON(CONFIG_PATH);
    } catch (err) {
      errors.push(`Could not read config: ${err.message}`);
    }
  }

  const industry = normalizeIndustry(config.industry);
  if (industry !== 'ai-builders') {
    const output = await prepareIndustryDigest({ config, scriptDir, errors });
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // 2. Fetch all three feeds
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

  // 3. Load prompts with priority: user custom > remote (GitHub) > local default
  //
  // If the user has a custom prompt at ~/.follow-builders/prompts/<file>,
  // use that (they personalized it — don't overwrite with remote updates).
  // Otherwise, fetch the latest from GitHub so they get central improvements.
  // If GitHub is unreachable, fall back to the local copy shipped with the skill.
  const prompts = {};
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
    status: 'ok',
    generatedAt: new Date().toISOString(),

    // User preferences
    config: {
      language: config.language || 'en',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' },
      industry: 'ai-builders',
      outputMode: config.outputMode || 'digest'
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
