#!/usr/bin/env node

// ============================================================================
// remix-digest.js — lightweight smoke tests
// ============================================================================
// No test framework, no real ANTHROPIC_API_KEY required. Runs remix-digest.js
// as a child process for each scenario (so its process.exit() calls don't
// kill this runner) and asserts on stdout/stderr/exit code.
//
// Covers the regression this script fixes: cron-based delivery must NEVER
// forward raw JSON as the digest — it should either produce a real remixed
// digest, or emit nothing (fail closed) so deliver.js skips sending.
//
// Usage: node remix-digest.test.js
// ============================================================================

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, 'remix-digest.js');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok  - ${name}`);
    passed++;
  } else {
    console.log(`  FAIL - ${name}${detail ? `: ${detail}` : ''}`);
    failed++;
  }
}

function runScript({ stdin, env }) {
  return spawnSync('node', [SCRIPT_PATH], {
    input: stdin,
    env: { ...process.env, ...env },
    encoding: 'utf-8'
  });
}

// Minimal fixture matching prepare-digest.js's real output shape.
const FIXTURE_WITH_CONTENT = JSON.stringify({
  status: 'ok',
  generatedAt: '2026-08-20T07:00:00.000Z',
  config: { language: 'en', frequency: 'daily', delivery: { method: 'email', email: 'test@example.com' } },
  podcasts: [],
  x: [{
    handle: 'levie',
    bio: 'ceo @box',
    tweets: [{ text: 'AI agents are reshaping software procurement.', url: 'https://x.com/levie/status/999999' }]
  }],
  blogs: [],
  stats: { podcastEpisodes: 0, xBuilders: 1, totalTweets: 1, blogPosts: 0, feedGeneratedAt: '2026-08-20T07:00:00.000Z' },
  prompts: {
    digest_intro: 'Start with "AI Builders Digest — [Date]", then list tweets with their URLs.',
    summarize_tweets: 'Summarize each builder\'s tweets in 1-2 sentences. Always include the tweet URL.',
    summarize_blogs: 'Summarize each post in 1-2 sentences with its link.',
    summarize_podcast: 'Summarize the transcript in a few sentences, include title and video URL.',
    translate: 'Translate to natural, fluent simplified Mandarin.'
  }
});

const FIXTURE_NO_CONTENT = JSON.stringify({
  status: 'ok',
  config: { language: 'en' },
  podcasts: [],
  x: [],
  blogs: [],
  stats: { podcastEpisodes: 0, xBuilders: 0, totalTweets: 0, blogPosts: 0 },
  prompts: {}
});

// -- Test 1: missing ANTHROPIC_API_KEY must fail closed ----------------------
console.log('Test: missing ANTHROPIC_API_KEY');
{
  const result = runScript({ stdin: FIXTURE_WITH_CONTENT, env: { ANTHROPIC_API_KEY: '' } });
  check('exits non-zero', result.status !== 0, `got status ${result.status}`);
  check('stdout is empty (no raw JSON/data forwarded)', result.stdout.trim() === '', `got: ${result.stdout.slice(0, 200)}`);
  check('stderr explains the reason', /ANTHROPIC_API_KEY/.test(result.stderr));
}

// -- Test 2: no new content must skip cleanly, not send anything -------------
console.log('Test: no new content today');
{
  const result = runScript({ stdin: FIXTURE_NO_CONTENT, env: { ANTHROPIC_API_KEY: 'irrelevant-since-it-should-skip-before-calling-the-api' } });
  check('exits zero (soft skip, not an error)', result.status === 0, `got status ${result.status}`);
  check('stdout is empty (deliver.js will skip sending)', result.stdout.trim() === '', `got: ${result.stdout.slice(0, 200)}`);
  check('stderr reports skipped', /skipped/i.test(result.stderr));
}

// -- Test 3: bad/invalid API key against the REAL Anthropic endpoint ---------
// This intentionally hits the real network to prove the request is well-formed
// (a 401 from Anthropic's servers, not a local crash) and that failures still
// fail closed. Skips gracefully if there's no network access in CI.
console.log('Test: invalid API key against real Anthropic endpoint (network required)');
{
  const result = runScript({ stdin: FIXTURE_WITH_CONTENT, env: { ANTHROPIC_API_KEY: 'sk-invalid-test-key-000' } });
  if (result.status === 0 && result.stdout.trim() === '' && /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(result.stderr + result.stdout)) {
    console.log('  skip - no network access in this environment');
  } else {
    check('exits non-zero', result.status !== 0, `got status ${result.status}`);
    check('stdout is still empty on failure', result.stdout.trim() === '', `got: ${result.stdout.slice(0, 200)}`);
    check('stderr surfaces the API error (not a raw crash)', /Anthropic API error/.test(result.stderr), `got: ${result.stderr.slice(0, 300)}`);
  }
}

// -- Summary -------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
