import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createTrendState,
  loadTrendState,
  pruneTrendState,
  recordTrendSnapshot,
  saveTrendState
} from '../lib/trend-state.js';

test('first snapshot is a baseline and the next snapshot exposes numeric deltas', () => {
  const state = createTrendState();

  const first = recordTrendSnapshot(state, 'github', 'openai/codex', {
    now: new Date('2026-07-15T00:00:00.000Z'),
    metrics: { stars: 100, forks: 20 }
  });
  assert.equal(first.baselineOnly, true);
  assert.deepEqual(first.deltas, { stars: null, forks: null });

  const second = recordTrendSnapshot(state, 'github', 'openai/codex', {
    now: new Date('2026-07-16T00:00:00.000Z'),
    metrics: { stars: 108, forks: 23 }
  });
  assert.equal(second.baselineOnly, false);
  assert.deepEqual(second.deltas, { stars: 8, forks: 3 });
  assert.equal(second.entry.firstSeenAt, '2026-07-15T00:00:00.000Z');
  assert.equal(second.entry.lastSeenAt, '2026-07-16T00:00:00.000Z');
});

test('pruning removes entries older than 48 hours and keeps the exact boundary', () => {
  const state = createTrendState();
  state.github.old = { lastSeenAt: '2026-07-13T23:00:00.000Z' };
  state.github.boundary = { lastSeenAt: '2026-07-14T00:00:00.000Z' };
  state.hackerNews.fresh = { lastSeenAt: '2026-07-15T23:00:00.000Z' };

  const removed = pruneTrendState(state, {
    now: new Date('2026-07-16T00:00:00.000Z'),
    retentionHours: 48
  });

  assert.deepEqual(removed, { github: 1, hackerNews: 0, reddit: 0 });
  assert.deepEqual(Object.keys(state.github), ['boundary']);
  assert.deepEqual(Object.keys(state.hackerNews), ['fresh']);
});

test('trend state is saved atomically and can be loaded again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'follow-builders-state-'));
  const statePath = join(directory, 'nested', 'trend-state.json');
  const state = createTrendState();
  recordTrendSnapshot(state, 'hackerNews', '123', {
    now: new Date('2026-07-16T00:00:00.000Z'),
    metrics: { points: 42, comments: 7 }
  });

  try {
    await saveTrendState(statePath, state);
    assert.deepEqual(await loadTrendState(statePath), state);
    assert.deepEqual(await readdir(join(directory, 'nested')), ['trend-state.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
