#!/usr/bin/env node

// ============================================================================
// Follow Builders — Remix Digest
// ============================================================================
// Reads the JSON output from prepare-digest.js, calls an LLM API
// (Anthropic Claude or OpenAI) to remix raw feed data into a readable
// digest, and outputs the final text to stdout.
//
// Usage:
//   node prepare-digest.js | node remix-digest.js
//   node remix-digest.js --file prepared.json
//   node remix-digest.js --file prepared.json --language zh --model gpt-4o
//
// Environment variables:
//   ANTHROPIC_API_KEY  — use Anthropic Claude (priority)
//   OPENAI_API_KEY     — use OpenAI (fallback)
//
// Exit codes:
//   0 — success (or partial success with warnings on stderr)
//   1 — fatal error (no API key, bad input, etc.)
// ============================================================================

import { readFile } from 'fs/promises';

// -- Constants ---------------------------------------------------------------

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

const REQUIRED_PROMPT_KEYS = [
  'summarize_tweets',
  'summarize_podcast',
  'summarize_blogs',
  'digest_intro',
  'translate',
];

// -- CLI Argument Parsing ----------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { file: null, language: 'en', model: null };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
        parsed.file = args[++i];
        break;
      case '--language':
        parsed.language = args[++i] || 'en';
        break;
      case '--model':
        parsed.model = args[++i] || null;
        break;
    }
  }
  return parsed;
}

// -- Input Reading -----------------------------------------------------------

async function readInput(filePath) {
  if (filePath) {
    try {
      return await readFile(filePath, 'utf-8');
    } catch (err) {
      process.stderr.write(JSON.stringify({
        status: 'error',
        step: 'read-input',
        message: `Cannot read file: ${filePath}`,
        details: { error: err.message },
      }) + '\n');
      process.exit(1);
    }
  }

  // Read from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function parseAndValidateInput(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(JSON.stringify({
      status: 'error',
      step: 'parse-input',
      message: 'Invalid input JSON',
      details: { error: err.message },
    }) + '\n');
    process.exit(1);
  }

  // Validate required prompts field
  if (!data.prompts || typeof data.prompts !== 'object') {
    process.stderr.write(JSON.stringify({
      status: 'error',
      step: 'validate-input',
      message: 'Missing required field: prompts',
    }) + '\n');
    process.exit(1);
  }

  const missing = REQUIRED_PROMPT_KEYS.filter((k) => !data.prompts[k]);
  if (missing.length > 0) {
    process.stderr.write(JSON.stringify({
      status: 'error',
      step: 'validate-input',
      message: `Missing required prompt keys: ${missing.join(', ')}`,
    }) + '\n');
    process.exit(1);
  }

  return data;
}

// -- LLM Provider Abstraction ------------------------------------------------

function detectProvider(modelOverride) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    return {
      name: 'anthropic',
      apiKey: anthropicKey,
      model: modelOverride || DEFAULT_ANTHROPIC_MODEL,
    };
  }

  if (openaiKey) {
    return {
      name: 'openai',
      apiKey: openaiKey,
      model: modelOverride || DEFAULT_OPENAI_MODEL,
    };
  }

  process.stderr.write(JSON.stringify({
    status: 'error',
    step: 'detect-provider',
    message: 'No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.',
  }) + '\n');
  process.exit(1);
}

async function callLLM(systemPrompt, userMessage, options = {}) {
  const { provider, maxTokens = DEFAULT_MAX_TOKENS } = options;

  if (provider.name === 'anthropic') {
    return callAnthropic(systemPrompt, userMessage, provider, maxTokens);
  }
  return callOpenAI(systemPrompt, userMessage, provider, maxTokens);
}

async function callAnthropic(systemPrompt, userMessage, provider, maxTokens) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    let errMsg;
    try {
      errMsg = JSON.parse(errBody).error?.message || errBody;
    } catch {
      errMsg = errBody;
    }
    const error = new Error(`Anthropic API error: ${res.status} ${errMsg}`);
    error.httpStatus = res.status;
    error.apiMessage = errMsg;
    throw error;
  }

  const json = await res.json();
  const text = json.content?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from LLM');
  }
  return text;
}

async function callOpenAI(systemPrompt, userMessage, provider, maxTokens) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    let errMsg;
    try {
      errMsg = JSON.parse(errBody).error?.message || errBody;
    } catch {
      errMsg = errBody;
    }
    const error = new Error(`OpenAI API error: ${res.status} ${errMsg}`);
    error.httpStatus = res.status;
    error.apiMessage = errMsg;
    throw error;
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Empty response from LLM');
  }
  return text;
}

// -- Multi-Step LLM Calls & Digest Assembly ----------------------------------

async function summarizeTweets(xBuilders, prompt, provider) {
  const tasks = xBuilders.map(async (builder) => {
    const userMsg = JSON.stringify({
      author: builder.author,
      handle: builder.handle,
      tweets: builder.tweets,
    });
    try {
      return await callLLM(prompt, userMsg, { provider });
    } catch (err) {
      process.stderr.write(JSON.stringify({
        status: 'warning',
        step: 'remix-tweets',
        message: `Skipping tweets for ${builder.author}: ${err.message}`,
        details: { builder: builder.handle, httpStatus: err.httpStatus },
      }) + '\n');
      return null;
    }
  });
  return (await Promise.all(tasks)).filter(Boolean);
}

async function summarizePodcasts(podcasts, prompt, provider) {
  const tasks = podcasts.map(async (podcast) => {
    const userMsg = JSON.stringify({
      name: podcast.name,
      title: podcast.title,
      url: podcast.url,
      transcript: podcast.transcript,
      publishedAt: podcast.publishedAt,
    });
    try {
      return await callLLM(prompt, userMsg, { provider });
    } catch (err) {
      process.stderr.write(JSON.stringify({
        status: 'warning',
        step: 'remix-podcasts',
        message: `Skipping podcast "${podcast.name}": ${err.message}`,
        details: { podcast: podcast.name, httpStatus: err.httpStatus },
      }) + '\n');
      return null;
    }
  });
  return (await Promise.all(tasks)).filter(Boolean);
}

async function summarizeBlogs(blogs, prompt, provider) {
  const tasks = blogs.map(async (blog) => {
    const userMsg = JSON.stringify({
      source: blog.source,
      title: blog.title,
      url: blog.url,
      content: blog.content,
      author: blog.author,
      publishedAt: blog.publishedAt,
    });
    try {
      return await callLLM(prompt, userMsg, { provider });
    } catch (err) {
      process.stderr.write(JSON.stringify({
        status: 'warning',
        step: 'remix-blogs',
        message: `Skipping blog "${blog.title}": ${err.message}`,
        details: { blog: blog.title, httpStatus: err.httpStatus },
      }) + '\n');
      return null;
    }
  });
  return (await Promise.all(tasks)).filter(Boolean);
}

async function assembleDigest(tweetSummaries, podcastSummaries, blogSummaries, prompt, provider) {
  const userMsg = JSON.stringify({
    tweetSummaries,
    podcastSummaries,
    blogSummaries,
  });
  return callLLM(prompt, userMsg, { provider });
}

async function translateDigest(digestText, prompt, provider, language) {
  const userMsg = JSON.stringify({
    digest: digestText,
    targetMode: language, // 'zh' or 'bilingual'
  });
  return callLLM(prompt, userMsg, { provider });
}

// -- Main --------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const provider = detectProvider(args.model);

  // Read and validate input
  const raw = await readInput(args.file);
  const data = parseAndValidateInput(raw);
  const { prompts } = data;

  // Steps 1-3: Parallel LLM calls for tweets, podcasts, blogs
  const [tweetSummaries, podcastSummaries, blogSummaries] = await Promise.all([
    summarizeTweets(data.x || [], prompts.summarize_tweets, provider),
    summarizePodcasts(data.podcasts || [], prompts.summarize_podcast, provider),
    summarizeBlogs(data.blogs || [], prompts.summarize_blogs, provider),
  ]);

  // Step 4: Assemble full digest
  let digest = await assembleDigest(
    tweetSummaries,
    podcastSummaries,
    blogSummaries,
    prompts.digest_intro,
    provider,
  );

  // Step 5: Translate if needed
  if (args.language === 'zh' || args.language === 'bilingual') {
    digest = await translateDigest(digest, prompts.translate, provider, args.language);
  }

  // Output final digest to stdout
  process.stdout.write(digest);
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({
    status: 'error',
    step: 'fatal',
    message: err.message,
    details: { httpStatus: err.httpStatus, apiMessage: err.apiMessage },
  }) + '\n');
  process.exit(1);
});
