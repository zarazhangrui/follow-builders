import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const prepareDigestPath = join(scriptsDir, 'prepare-digest.js');

test('prepare-digest keeps runtime loading local while supporting local blog content', async () => {
  const source = await readFile(prepareDigestPath, 'utf-8');

  assert.match(source, /feed-blogs\.json/);
  assert.match(source, /summarize-blogs\.md/);
  assert.doesNotMatch(source, /raw\.githubusercontent\.com/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);

  const homeDir = await mkdtemp(join(tmpdir(), 'follow-builders-home-'));
  const userDir = join(homeDir, '.follow-builders');

  await mkdir(userDir, { recursive: true });
  await writeFile(
    join(userDir, 'config.json'),
    JSON.stringify({
      language: 'en',
      frequency: 'daily',
      delivery: { method: 'stdout' }
    })
  );

  const { stdout } = await execFileAsync(process.execPath, [prepareDigestPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: homeDir
    }
  });

  const output = JSON.parse(stdout);

  assert.ok(Array.isArray(output.blogs));
  assert.ok('summarize_blogs' in output.prompts);
  assert.equal(output.stats.blogPosts, output.blogs.length);
});
