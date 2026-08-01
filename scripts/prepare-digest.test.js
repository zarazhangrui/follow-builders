import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareDigest } from './prepare-digest.js';

const FEED_FIXTURES = {
  'feed-x.json': {
    generatedAt: '2026-08-01T00:00:00.000Z',
    x: [
      {
        name: 'Builder',
        tweets: [
          { text: 'Building in public', url: 'https://x.com/builder/status/1' }
        ]
      }
    ]
  },
  'feed-podcasts.json': {
    generatedAt: '2026-08-01T00:05:00.000Z',
    podcasts: [
      {
        name: 'Builder Podcast',
        title: 'Shipping',
        url: 'https://example.test/podcast'
      }
    ]
  },
  'feed-blogs.json': {
    generatedAt: '2026-08-01T00:10:00.000Z',
    blogs: [
      {
        name: 'Builder Blog',
        title: 'A launch',
        url: 'https://example.test/blog'
      }
    ]
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function createFetch(overrides = {}) {
  return async (url) => {
    const feedName = Object.keys(FEED_FIXTURES).find((name) =>
      url.endsWith(name)
    );

    if (!feedName) {
      return new Response('not found', { status: 404 });
    }

    const override = overrides[feedName];
    if (override instanceof Error) throw override;
    if (typeof override === 'function') return override(url);
    if (override !== undefined) return override;

    return jsonResponse(FEED_FIXTURES[feedName]);
  };
}

async function createUserDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'follow-builders-user-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('reports ok when every feed loads', async (t) => {
  const output = await prepareDigest({
    fetchImpl: createFetch(),
    userDir: await createUserDirectory(t),
    now: () => new Date('2026-08-01T01:00:00.000Z')
  });

  assert.equal(output.status, 'ok');
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(output.feedStatus).map(([name, value]) => [
        name,
        value.status
      ])
    ),
    { x: 'ok', podcasts: 'ok', blogs: 'ok' }
  );
  assert.equal(output.generatedAt, '2026-08-01T01:00:00.000Z');
  assert.deepEqual(output.stats, {
    podcastEpisodes: 1,
    xBuilders: 1,
    totalTweets: 1,
    blogPosts: 1,
    feedGeneratedAt: '2026-08-01T00:00:00.000Z'
  });
});

test('reports partial while preserving usable feeds when one request fails', async (t) => {
  const output = await prepareDigest({
    fetchImpl: createFetch({
      'feed-podcasts.json': () =>
        new Response('unavailable', { status: 503 })
    }),
    userDir: await createUserDirectory(t)
  });

  assert.equal(output.status, 'partial');
  assert.equal(output.feedStatus.x.status, 'ok');
  assert.equal(output.feedStatus.podcasts.status, 'error');
  assert.match(output.feedStatus.podcasts.error, /HTTP 503/);
  assert.equal(output.feedStatus.blogs.status, 'ok');
  assert.equal(output.podcasts.length, 0);
  assert.equal(output.x.length, 1);
  assert.equal(output.blogs.length, 1);
  assert.ok(output.errors.some((error) => /podcast.*HTTP 503/i.test(error)));
});

test('reports error with source-specific failures when no feed loads', async (t) => {
  const output = await prepareDigest({
    fetchImpl: createFetch({
      'feed-x.json': new Error('network unavailable'),
      'feed-podcasts.json': new Error('network unavailable'),
      'feed-blogs.json': new Error('network unavailable')
    }),
    userDir: await createUserDirectory(t)
  });

  assert.equal(output.status, 'error');
  assert.deepEqual(output.x, []);
  assert.deepEqual(output.podcasts, []);
  assert.deepEqual(output.blogs, []);
  assert.equal(output.errors.length, 3);
  assert.ok(output.errors.some((error) => /^Tweet feed problem:/.test(error)));
  assert.ok(output.errors.some((error) => /^Podcast feed problem:/.test(error)));
  assert.ok(output.errors.some((error) => /^Blog feed problem:/.test(error)));
});

test('reports partial when a loaded feed contains upstream errors', async (t) => {
  const output = await prepareDigest({
    fetchImpl: createFetch({
      'feed-x.json': jsonResponse({
        ...FEED_FIXTURES['feed-x.json'],
        errors: ['one account could not be refreshed']
      })
    }),
    userDir: await createUserDirectory(t)
  });

  assert.equal(output.status, 'partial');
  assert.equal(output.x.length, 1);
  assert.equal(output.feedStatus.x.status, 'ok');
  assert.ok(
    output.errors.includes(
      'Tweet feed problem: one account could not be refreshed'
    )
  );
});
