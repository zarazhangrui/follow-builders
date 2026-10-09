#!/usr/bin/env node

// ============================================================================
// Follow Builders — Remix Digest (headless LLM step)
// ============================================================================
// Bridges the gap between prepare-digest.js and deliver.js when there is no
// live agent in the loop (e.g. a system crontab entry on a non-persistent
// platform like Claude Code).
//
// Without this script, cron setups piped prepare-digest.js straight into
// deliver.js:
//
//   node prepare-digest.js | node deliver.js
//
// That sends the RAW JSON blob (feeds, transcripts, prompts, stats) as the
// digest body, because there was no LLM in the pipeline to actually remix
// it per SKILL.md's "Content Delivery" instructions. This script fills that
// gap by calling the Anthropic API directly with the same prompts an agent
// would use, so scheduled/cron runs produce a real digest instead of JSON.
//
// Usage:
//   node prepare-digest.js | node remix-digest.js | node deliver.js
//
// Requires ANTHROPIC_API_KEY in ~/.follow-builders/.env. If it's missing,
// this script fails closed: it prints nothing to stdout (so deliver.js sees
// an empty digest and skips sending) and logs the reason to stderr. Sending
// nothing is preferable to sending raw JSON.
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const USER_DIR = join(homedir(), '.follow-builders');
const ENV_PATH = join(USER_DIR, '.env');

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 8192;

// -- Read prepare-digest.js output from stdin/--file --------------------------

async function getInputJSON() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');

  let raw;
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    raw = await readFile(args[fileIdx + 1], 'utf-8');
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    raw = Buffer.concat(chunks).toString('utf-8');
  }

  if (!raw || raw.trim().length === 0) {
    throw new Error('No input received (expected JSON from prepare-digest.js on stdin or --file)');
  }
  return JSON.parse(raw);
}

// -- Build the prompt the LLM needs to remix, following SKILL.md exactly ----

function buildPrompt(data) {
  const { config, podcasts = [], x = [], blogs = [], prompts = {}, stats = {} } = data;
  const language = config?.language || 'en';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return `You are the Follow Builders digest assembler, running unattended via a scheduled job (no human agent is reviewing this before it sends). Follow these instructions exactly — your output will be emailed/messaged as-is.

Today's date: ${today}
Target language for the final digest: ${language} ("en" = English only, "zh" = Chinese only, "bilingual" = interleave English and Chinese paragraph by paragraph — never all-English-then-all-Chinese)

=== ABSOLUTE RULES ===
- NEVER invent or fabricate content. Only use what's in the DATA block below.
- Every piece of content MUST include its source URL from the DATA. No URL = do not include it.
- Do NOT guess job titles. Use each person's "bio" field, or just their name.
- Do NOT visit any URL, search the web, or call any API. Everything you need is in DATA.
- If there is nothing real for a builder/blog/podcast, skip it entirely — do not pad the digest.
- Output ONLY the final digest text. No preamble, no "Here is the digest", no code fences.

=== ASSEMBLY INSTRUCTIONS (digest-intro) ===
${prompts.digest_intro || '(no digest-intro prompt provided — use a clean, scannable header + sections for X/Twitter, Blogs, and Podcasts)'}

=== TWEET SUMMARIZATION RULES ===
${prompts.summarize_tweets || '(no prompt provided — summarize concisely, one paragraph per builder, must include their tweet URLs)'}

=== BLOG SUMMARIZATION RULES ===
${prompts.summarize_blogs || '(no prompt provided — summarize each post in 1-2 sentences with its link)'}

=== PODCAST SUMMARIZATION RULES ===
${prompts.summarize_podcast || '(no prompt provided — summarize the transcript in a few sentences, include the episode title and video URL)'}

=== TRANSLATION RULES (only relevant if language is "zh" or "bilingual") ===
${prompts.translate || '(no prompt provided — translate to natural, fluent simplified Mandarin, keep technical terms and proper nouns in English, keep URLs unchanged)'}

=== DATA (this is the ONLY source of truth — everything to remix is here) ===
Stats: ${JSON.stringify(stats)}

X / Twitter builders and their tweets:
${JSON.stringify(x, null, 2)}

Official blog posts:
${JSON.stringify(blogs, null, 2)}

Podcast episode(s):
${JSON.stringify(podcasts, null, 2)}

=== YOUR TASK ===
1. Process tweets first, then blogs, then the podcast (if present), each using their rules above.
2. Assemble everything following the digest-intro instructions.
3. Apply the "${language}" language setting exactly as specified.
4. Output only the finished digest text.`;
}

// -- Call Anthropic ------------------------------------------------------------

async function remix(apiKey, prompt) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const body = await res.json();
  const text = (body.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Anthropic API returned no text content');
  return text;
}

// -- Main ------------------------------------------------------------------

async function main() {
  loadEnv({ path: ENV_PATH });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({
      status: 'error',
      message: 'ANTHROPIC_API_KEY not set in ~/.follow-builders/.env — cannot remix digest ' +
        'for unattended/cron delivery. Add a key to enable automated remixing, or run /ai ' +
        'manually so the live agent can remix it instead. Refusing to forward raw JSON.'
    }));
    process.exit(1);
  }

  let data;
  try {
    data = await getInputJSON();
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: `Bad input: ${err.message}` }));
    process.exit(1);
  }

  if (data.status !== 'ok' && !data.podcasts && !data.x) {
    console.error(JSON.stringify({ status: 'error', message: 'prepare-digest.js reported failure; nothing to remix' }));
    process.exit(1);
  }

  const podcastCount = (data.podcasts || []).length;
  const xCount = (data.x || []).length;
  const blogCount = (data.blogs || []).length;
  if (podcastCount === 0 && xCount === 0 && blogCount === 0) {
    // Nothing new today — say nothing to stdout so deliver.js skips sending.
    console.error(JSON.stringify({ status: 'skipped', message: 'No new content today' }));
    return;
  }

  try {
    const prompt = buildPrompt(data);
    const digestText = await remix(apiKey, prompt);
    console.log(digestText);
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  }
}

main();
