export const MAX_PODCAST_FAILURES = 3;

export function ensurePodcastState(state) {
  if (!state.seenVideos) state.seenVideos = {};
  if (!state.failedVideos) state.failedVideos = {};
  return state;
}

export function shouldSkipPodcastAfterFailures(state, guid) {
  ensurePodcastState(state);
  return (state.failedVideos[guid]?.count || 0) >= MAX_PODCAST_FAILURES;
}

export function recordPodcastFailure(state, guid, reason, nowMs = Date.now()) {
  ensurePodcastState(state);
  const previous = state.failedVideos[guid];
  state.failedVideos[guid] = {
    count: (previous?.count || 0) + 1,
    lastAttemptAt: nowMs,
    lastError: reason || 'unknown error'
  };
  return state.failedVideos[guid];
}

export function recordPodcastSuccess(state, guid, nowMs = Date.now()) {
  ensurePodcastState(state);
  state.seenVideos[guid] = nowMs;
  delete state.failedVideos[guid];
}

export function prunePodcastFailures(state, cutoffMs) {
  ensurePodcastState(state);
  for (const [guid, failure] of Object.entries(state.failedVideos)) {
    if (!failure?.lastAttemptAt || failure.lastAttemptAt < cutoffMs) {
      delete state.failedVideos[guid];
    }
  }
}
