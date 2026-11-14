import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skill = await readFile(new URL('../SKILL.md', import.meta.url), 'utf8');
const generator = await readFile(
  new URL('../scripts/generate-feed.js', import.meta.url),
  'utf8',
);

test('skill contract includes blogs and stale-feed handling', () => {
  assert.match(skill, /`blogs` — official blog posts/);
  assert.match(skill, /prompts\.summarize_blogs/);
  assert.match(skill, /\*\*Blogs \(process second\):\*\*/);
  assert.match(skill, /stale: true/);
});

test('generator records podcast success only after validating an episode URL', () => {
  const successIndex = generator.indexOf('recordPodcastSuccess(state, selected.guid)');
  const episodeUrlIndex = generator.indexOf('const episodeUrl = youtubeUrl || rssEpisodeUrl');
  assert.ok(episodeUrlIndex >= 0);
  assert.ok(successIndex > episodeUrlIndex);
  assert.doesNotMatch(generator, /Mark as seen regardless/);
});
