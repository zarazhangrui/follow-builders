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

import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');

const FEED_X_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json';
const FEED_PODCASTS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json';
const FEED_BLOGS_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json';
const FEED_X_ARTICLES_URL = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x-articles.json';

const PROMPTS_BASE = 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/prompts';
const PROMPT_FILES = [
  'summarize-podcast.md',
  'summarize-tweets.md',
  'summarize-blogs.md',
  'summarize-x-articles.md',
  'summarize-shared-links.md',
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

// -- X Article helpers (fxtwitter API, no auth needed) -----------------------

// Extract tweet ID from x.com/status/ID URL
function extractTweetId(url) {
  try {
    const u = new URL(url);
    let m = u.pathname.match(/\/status\/(\d+)/);
    if (m) return m[1];
    // Handle /i/article/ID format
    m = u.pathname.match(/\/i\/article\/(\d+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

// Extract handle from x.com/handle URL
function extractHandle(url) {
  try {
    const u = new URL(url);
    // Skip /i/ prefix for article URLs
    const m = u.pathname.match(/^\/(?!i\/)(\w+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

// Resolve t.co redirect → real URL
async function resolveTco(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    return res.headers.get('location') || null;
  } catch { return null; }
}

// Fetch X Article content via fxtwitter API
async function fetchXArticle(handle, tweetId) {
  try {
    const apiUrl = `https://api.fxtwitter.com/${handle}/status/${tweetId}`;
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 200 || !data.tweet?.article) return null;

    const tweet = data.tweet;
    const blocks = tweet.article?.content?.blocks || [];
    const fullText = blocks.map(b => b.text).join('\n\n');

    return {
      handle: '@' + handle,
      name: tweet.author.name,
      bio: tweet.author.description || '',
      article: {
        title: tweet.article.title || '',
        text: fullText,
        url: tweet.url,
        previewText: tweet.article.preview_text || '',
        createdAt: tweet.article.created_at
      }
    };
  } catch { return null; }
}

// Resolve X article links from tweets: t.co → real URL → fxtwitter article
async function resolveXArticleLink(url) {
  let realUrl = url;
  try {
    const host = new URL(url).hostname;

    // If t.co, resolve the redirect first
    if (host === 't.co') {
      const resolved = await resolveTco(url);
      if (!resolved) return null;
      realUrl = resolved;
    }
  } catch { return null; }

  // Check if resolved URL is an x.com status or article link
  const tweetId = extractTweetId(realUrl);
  let handle = extractHandle(realUrl);

  // If we have tweetId but no handle (e.g. /i/article/ID URLs), try redirect follow
  if (tweetId && !handle) {
    try {
      const getRes = await fetch(realUrl, { method: 'GET', redirect: 'follow' });
      const finalUrl = getRes.url;
      handle = extractHandle(finalUrl);
    } catch { /* ignore */ }
  }

  if (!tweetId) return null;

  // If we have tweetId but no handle (e.g. /i/article/ID URLs that couldn't resolve),
  // return a minimal article entry so the caller can try fallback resolution
  if (!handle) {
    return {
      title: '',
      text: '',
      url: realUrl,
      previewText: '',
      createdAt: null,
    };
  }

  return fetchXArticle(handle, tweetId);
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

  // 2. Fetch all four feeds
  const [feedX, feedPodcasts, feedBlogs, feedXArticles] = await Promise.all([
    fetchJSON(FEED_X_URL),
    fetchJSON(FEED_PODCASTS_URL),
    fetchJSON(FEED_BLOGS_URL),
    fetchJSON(FEED_X_ARTICLES_URL)
  ]);

  if (!feedX) errors.push('Could not fetch tweet feed');
  if (!feedPodcasts) errors.push('Could not fetch podcast feed');
  if (!feedBlogs) errors.push('Could not fetch blog feed');
  // X articles feed is optional — don't error if missing

  // 3. Load prompts with priority: user custom > remote (GitHub) > local default
  //
  // If the user has a custom prompt at ~/.follow-builders/prompts/<file>,
  // use that (they personalized it — don't overwrite with remote updates).
  // Otherwise, fetch the latest from GitHub so they get central improvements.
  // If GitHub is unreachable, fall back to the local copy shipped with the skill.
  const prompts = {};
  const scriptDir = decodeURIComponent(new URL('.', import.meta.url).pathname);
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

  // 4. Extract shared links from tweets
  const sharedLinks = [];
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  const skipDomains = ['x.com', 't.co', 'twitter.com', 'youtube.com', 'youtu.be'];
  const seen = new Set();

  for (const builder of (feedX?.x || [])) {
    for (const tweet of (builder.tweets || [])) {
      const matches = (tweet.text || '').match(urlPattern) || [];
      for (const raw of matches) {
        try {
          const u = new URL(raw);
          if (skipDomains.some(d => u.hostname.endsWith(d))) continue;
          const key = u.origin + u.pathname;
          if (seen.has(key)) continue;
          seen.add(key);
          sharedLinks.push({
            url: raw,
            sharedBy: builder.name,
            sharedByHandle: builder.handle,
            tweetUrl: tweet.url || null,
            tweetText: tweet.text?.replace(urlPattern, '').trim().slice(0, 200) || ''
          });
        } catch {}
      }
    }
  }

  // 4b. Resolve X article links from tweets via fxtwitter API
  const xArticlesFromLinks = [];
  const xLinkSeen = new Set();
  const xLinkPattern = /https?:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+[^\s<>"']*|https?:\/\/t\.co\/\w+/gi;

  for (const builder of (feedX?.x || [])) {
    for (const tweet of (builder.tweets || [])) {
      const matches = (tweet.text || '').match(xLinkPattern) || [];
      for (const raw of matches) {
        try {
          const u = new URL(raw);
          const host = u.hostname.replace('www.', '');
          // Build a dedup key
          let dedupKey;
          if (host === 't.co') {
            // t.co links always unique (different short codes for same URL)
            // Use the short code as key
            dedupKey = u.hostname + u.pathname;
          } else {
            dedupKey = u.hostname + u.pathname.replace(/\/$/, '');
          }
          if (xLinkSeen.has(dedupKey)) continue;
          xLinkSeen.add(dedupKey);

          const article = await resolveXArticleLink(raw);
          if (article) {
            // If the resolved article has no real content (minimal fallback from /i/article/),
            // try fetching the original tweet directly which may have the article field
            const artData = article.article || {};
            if (!artData.text || artData.title === 'X Article' || !artData.title) {
              const tweetArticle = await fetchXArticle(builder.handle, tweet.id);
              if (tweetArticle) {
                tweetArticle.sharedBy = builder.name;
                tweetArticle.sharedByHandle = builder.handle;
                tweetArticle.tweetUrl = tweet.url || null;
                xArticlesFromLinks.push(tweetArticle);
                continue;
              }
            }
            article.sharedBy = builder.name;
            article.sharedByHandle = builder.handle;
            article.tweetUrl = tweet.url || null;
            if (!article.handle) article.handle = '@' + builder.handle;
            if (!article.name) article.name = builder.name;
            if (!article.bio) article.bio = builder.bio || '';
            xArticlesFromLinks.push(article);
          }
        } catch {}
      }
    }
  }

  if (xArticlesFromLinks.length > 0) {
    console.error(`Resolved ${xArticlesFromLinks.length} X article(s) from tweet links`);
  }

  // 5. Build the output — everything the LLM needs in one blob
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
    // Merge central feed articles + articles resolved from tweet links
    xArticles: [
      ...(feedXArticles?.articles || []),
      ...xArticlesFromLinks
    ],
    sharedLinks,

    // Stats for the LLM to reference
    stats: {
      podcastEpisodes: feedPodcasts?.podcasts?.length || 0,
      xBuilders: feedX?.x?.length || 0,
      totalTweets: (feedX?.x || []).reduce((sum, a) => sum + a.tweets.length, 0),
      blogPosts: feedBlogs?.blogs?.length || 0,
      xArticles: (feedXArticles?.articles?.length || 0) + xArticlesFromLinks.length,
      sharedLinks: sharedLinks.length,
      xArticlesFromFeed: feedXArticles?.articles?.length || 0,
      xArticlesFromLinks: xArticlesFromLinks.length,
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
