#!/usr/bin/env node

// ============================================================================
// Documentation Consistency Tests
// ============================================================================
// Verifies that READMEs, SKILL.md, prompts, and sample digest stay in sync
// with the actual source config and each other.
//
// Usage: node test-docs-consistency.js
// Exit code: 0 = pass, 1 = failures found
// ============================================================================

import { readFile } from 'fs/promises';
import { join } from 'path';

const SCRIPT_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname);
const ROOT = join(SCRIPT_DIR, '..');

let failures = 0;

function pass(name) {
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  console.error(`  ✗ ${name}`);
  console.error(`    ${detail}`);
  failures++;
}

// -- Helpers -----------------------------------------------------------------

async function readText(relPath) {
  return readFile(join(ROOT, relPath), 'utf-8');
}

async function readJSON(relPath) {
  return JSON.parse(await readFile(join(ROOT, relPath), 'utf-8'));
}

// -- Tests -------------------------------------------------------------------

async function testPodcastCountInReadmes() {
  const sources = await readJSON('config/default-sources.json');
  const actualCount = sources.podcasts.length;

  const readmeEn = await readText('README.md');
  const readmeZh = await readText('README.zh-CN.md');

  // English README
  const enMatch = readmeEn.match(/### Podcasts \((\d+)\)/);
  if (!enMatch) {
    fail('README.md podcast count', 'Could not find "### Podcasts (N)" heading');
  } else if (parseInt(enMatch[1]) !== actualCount) {
    fail('README.md podcast count', `Says ${enMatch[1]} but default-sources.json has ${actualCount}`);
  } else {
    pass('README.md podcast count matches default-sources.json');
  }

  // Chinese README
  const zhMatch = readmeZh.match(/### 播客（(\d+)个）/);
  if (!zhMatch) {
    fail('README.zh-CN.md podcast count', 'Could not find "### 播客（N个）" heading');
  } else if (parseInt(zhMatch[1]) !== actualCount) {
    fail('README.zh-CN.md podcast count', `Says ${zhMatch[1]} but default-sources.json has ${actualCount}`);
  } else {
    pass('README.zh-CN.md podcast count matches default-sources.json');
  }

  // Verify each podcast name appears in both READMEs
  for (const podcast of sources.podcasts) {
    if (!readmeEn.includes(podcast.name)) {
      fail(`README.md missing podcast`, `"${podcast.name}" not listed`);
    }
    if (!readmeZh.includes(podcast.name)) {
      fail(`README.zh-CN.md missing podcast`, `"${podcast.name}" not listed`);
    }
  }
}

async function testSkillMdBlogPromptReference() {
  const skill = await readText('SKILL.md');

  // SKILL.md must reference summarize_blogs prompt
  if (skill.includes('prompts.summarize_blogs')) {
    pass('SKILL.md references prompts.summarize_blogs');
  } else {
    fail('SKILL.md missing blog prompt', 'Step 4 should list prompts.summarize_blogs');
  }
}

async function testSkillMdNoContentCheck() {
  const skill = await readText('SKILL.md');

  // The "no content" check must include blogPosts
  if (skill.includes('stats.blogPosts')) {
    pass('SKILL.md no-content check includes blogPosts');
  } else {
    fail('SKILL.md no-content check', 'Should check stats.blogPosts alongside podcastEpisodes and xBuilders');
  }
}

async function testSampleDigestNoAtHandles() {
  const sample = await readText('examples/sample-digest.md');

  // @ followed by a word character indicates a Twitter handle with @
  // Exclude URLs like https://x.com/@... which are valid
  const lines = sample.split('\n');
  const badLines = [];
  for (const line of lines) {
    // Skip URL lines
    if (line.trim().startsWith('http')) continue;
    // Check for @handle pattern (not inside URLs)
    if (/@\w+/.test(line.replace(/https?:\/\/\S+/g, ''))) {
      badLines.push(line.trim());
    }
  }

  if (badLines.length === 0) {
    pass('Sample digest contains no @handles in non-URL text');
  } else {
    fail('Sample digest has @handles', `Found: ${badLines[0]}`);
  }
}

async function testSampleDigestSectionOrder() {
  const sample = await readText('examples/sample-digest.md');

  // digest-intro.md specifies: X/TWITTER → OFFICIAL BLOGS → PODCASTS
  const xPos = sample.indexOf('X / TWITTER');
  const blogsPos = sample.indexOf('OFFICIAL BLOGS') !== -1
    ? sample.indexOf('OFFICIAL BLOGS')
    : sample.indexOf('BLOGS');
  const podcastsPos = sample.indexOf('PODCASTS');

  if (xPos === -1) {
    fail('Sample digest section order', 'Missing X / TWITTER section');
    return;
  }
  if (podcastsPos === -1) {
    fail('Sample digest section order', 'Missing PODCASTS section');
    return;
  }

  if (xPos < podcastsPos && (blogsPos === -1 || (xPos < blogsPos && blogsPos < podcastsPos))) {
    pass('Sample digest section order: X → Blogs → Podcasts');
  } else {
    fail('Sample digest section order', `Expected X (${xPos}) < Blogs (${blogsPos}) < Podcasts (${podcastsPos})`);
  }
}

async function testPrepareDigestLoadsAllPrompts() {
  const prepare = await readText('scripts/prepare-digest.js');

  const expectedPrompts = [
    'summarize-podcast.md',
    'summarize-tweets.md',
    'summarize-blogs.md',
    'digest-intro.md',
    'translate.md'
  ];

  for (const prompt of expectedPrompts) {
    if (prepare.includes(prompt)) {
      pass(`prepare-digest.js references ${prompt}`);
    } else {
      fail(`prepare-digest.js missing prompt`, `${prompt} not found in PROMPT_FILES`);
    }
  }
}

// -- Run ---------------------------------------------------------------------

console.log('\nDocumentation Consistency Tests\n');

await testPodcastCountInReadmes();
await testSkillMdBlogPromptReference();
await testSkillMdNoContentCheck();
await testSampleDigestNoAtHandles();
await testSampleDigestSectionOrder();
await testPrepareDigestLoadsAllPrompts();

console.log('');
if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log('All tests passed');
}
