import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PODCAST_FAILURES,
  prunePodcastFailures,
  recordPodcastFailure,
  recordPodcastSuccess,
  shouldSkipPodcastAfterFailures,
} from '../scripts/podcast-state.js';

test('podcast failures remain retryable until the bounded limit', () => {
  const state = { seenVideos: {}, failedVideos: {} };
  const guid = 'episode-1';

  for (let count = 1; count < MAX_PODCAST_FAILURES; count++) {
    const failure = recordPodcastFailure(state, guid, `failure ${count}`, count);
    assert.equal(failure.count, count);
    assert.equal(shouldSkipPodcastAfterFailures(state, guid), false);
  }

  recordPodcastFailure(state, guid, 'final failure', MAX_PODCAST_FAILURES);
  assert.equal(shouldSkipPodcastAfterFailures(state, guid), true);
  assert.equal(state.seenVideos[guid], undefined);
});

test('podcast success marks seen and clears prior failures', () => {
  const state = { seenVideos: {}, failedVideos: {} };
  recordPodcastFailure(state, 'episode-2', 'temporary failure', 100);
  recordPodcastSuccess(state, 'episode-2', 200);

  assert.equal(state.seenVideos['episode-2'], 200);
  assert.equal(state.failedVideos['episode-2'], undefined);
});

test('old podcast failures are pruned for a future retry window', () => {
  const state = {
    seenVideos: {},
    failedVideos: {
      old: { count: 3, lastAttemptAt: 10, lastError: 'old' },
      current: { count: 1, lastAttemptAt: 30, lastError: 'current' },
    },
  };

  prunePodcastFailures(state, 20);
  assert.equal(state.failedVideos.old, undefined);
  assert.equal(state.failedVideos.current.count, 1);
});
