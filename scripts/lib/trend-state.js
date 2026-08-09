import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const CHANNELS = new Set(['github', 'hackerNews', 'reddit']);

function toIso(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid trend-state timestamp: ${now}`);
  return date.toISOString();
}

export function createTrendState() {
  return {
    version: 1,
    updatedAt: null,
    github: {},
    hackerNews: {},
    reddit: {},
    sourceHealth: {}
  };
}

export function recordTrendSnapshot(state, channel, id, { now = new Date(), metrics = {} } = {}) {
  if (!CHANNELS.has(channel)) throw new TypeError(`Unsupported trend-state channel: ${channel}`);
  if (!id) throw new TypeError('Trend-state snapshot id is required');

  state[channel] ||= {};
  const timestamp = toIso(now);
  const previous = state[channel][id] || null;
  const deltas = {};

  for (const [field, value] of Object.entries(metrics)) {
    deltas[field] = previous && Number.isFinite(previous[field]) && Number.isFinite(value)
      ? value - previous[field]
      : null;
  }

  const entry = {
    ...(previous || {}),
    firstSeenAt: previous?.firstSeenAt || timestamp,
    lastSeenAt: timestamp,
    ...metrics
  };
  state[channel][id] = entry;
  state.updatedAt = timestamp;

  return {
    baselineOnly: previous === null,
    deltas,
    entry
  };
}

export function pruneTrendState(state, { now = new Date(), retentionHours = 48 } = {}) {
  const cutoff = new Date(now).getTime() - retentionHours * 60 * 60 * 1000;
  if (!Number.isFinite(cutoff)) throw new TypeError(`Invalid trend-state prune timestamp: ${now}`);

  const removed = { github: 0, hackerNews: 0, reddit: 0 };
  for (const channel of CHANNELS) {
    state[channel] ||= {};
    for (const [id, entry] of Object.entries(state[channel])) {
      const lastSeenAt = new Date(entry?.lastSeenAt).getTime();
      if (Number.isFinite(lastSeenAt) && lastSeenAt < cutoff) {
        delete state[channel][id];
        removed[channel] += 1;
      }
    }
  }
  return removed;
}

function normalizeTrendState(value) {
  const empty = createTrendState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  return {
    ...empty,
    ...value,
    version: 1,
    github: value.github && typeof value.github === 'object' ? value.github : {},
    hackerNews: value.hackerNews && typeof value.hackerNews === 'object' ? value.hackerNews : {},
    reddit: value.reddit && typeof value.reddit === 'object' ? value.reddit : {},
    sourceHealth: value.sourceHealth && typeof value.sourceHealth === 'object' ? value.sourceHealth : {}
  };
}

export async function loadTrendState(path) {
  try {
    return normalizeTrendState(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return createTrendState();
    throw error;
  }
}

export async function saveTrendState(path, state) {
  const directory = dirname(path);
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(normalizeTrendState(state), null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}
