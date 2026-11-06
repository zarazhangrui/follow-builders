import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchJSON,
  filterPodcasts,
  getFeedFreshness,
} from '../scripts/prepare-digest.js';

test('fetchJSON retries a transient connection failure', async () => {
  let calls = 0;
  const result = await fetchJSON('https://example.test/feed.json', 'Test feed', {
    attempts: 3,
    retryDelayMs: 0,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls++;
      if (calls === 1) {
        const error = new Error('fetch failed');
        error.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
        throw error;
      }
      return {
        ok: true,
        json: async () => ({ generatedAt: '2026-08-15T06:00:00.000Z' }),
      };
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.error, null);
  assert.equal(result.data.generatedAt, '2026-08-15T06:00:00.000Z');
});

test('fetchJSON reports a bounded failure after three attempts', async () => {
  let calls = 0;
  const result = await fetchJSON('https://example.test/feed.json', 'Test feed', {
    attempts: 3,
    retryDelayMs: 0,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls++;
      throw new Error('offline');
    },
  });

  assert.equal(calls, 3);
  assert.equal(result.data, null);
  assert.equal(result.attempts, 3);
  assert.match(result.error, /failed after 3 attempt/);
});

test('feed freshness distinguishes current, stale, and missing timestamps', () => {
  const now = Date.parse('2026-08-15T15:00:00.000Z');
  assert.deepEqual(
    getFeedFreshness({ generatedAt: '2026-08-15T14:00:00.000Z' }, now, 8),
    { generatedAt: '2026-08-15T14:00:00.000Z', ageHours: 1, stale: false },
  );
  assert.equal(
    getFeedFreshness({ generatedAt: '2026-08-14T14:00:00.000Z' }, now, 8).stale,
    true,
  );
  assert.equal(getFeedFreshness({}, now, 8).stale, true);
});

test('podcast filtering keeps direct episodes and rejects YouTube containers', () => {
  const errors = [];
  const podcasts = [
    { title: 'Channel', url: 'https://www.youtube.com/@builder/videos' },
    { title: 'Playlist', url: 'https://www.youtube.com/playlist?list=PL123' },
    { title: 'Watch', url: 'https://www.youtube.com/watch?v=abc123' },
    { title: 'Short', url: 'https://youtu.be/abc123' },
    { title: 'RSS episode', url: 'https://podcast.example/episodes/42' },
  ];

  const filtered = filterPodcasts(podcasts, errors);
  assert.deepEqual(filtered.map(item => item.title), ['Watch', 'Short', 'RSS episode']);
  assert.equal(errors.length, 2);
});
