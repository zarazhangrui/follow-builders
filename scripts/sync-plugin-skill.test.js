import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { syncSkill } from './sync-plugin-skill.js';

async function createFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'follow-builders-sync-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  return {
    source: join(directory, 'SKILL.md'),
    target: join(directory, 'skills', 'follow-builders', 'SKILL.md')
  };
}

test('check mode reports a missing mirror without mutating it', async (t) => {
  const { source, target } = await createFixture(t);
  await writeFile(source, '# canonical\n');

  const result = await syncSkill({ source, target, check: true });

  assert.deepEqual(result, { ok: false, reason: 'missing' });
  await assert.rejects(readFile(target, 'utf8'), { code: 'ENOENT' });
});

test('sync mode creates an exact mirror', async (t) => {
  const { source, target } = await createFixture(t);
  const canonical = '---\nname: follow-builders\n---\n\n# Canonical\n';
  await writeFile(source, canonical);

  const result = await syncSkill({ source, target });

  assert.deepEqual(result, { ok: true, reason: 'synced' });
  assert.equal(await readFile(target, 'utf8'), canonical);
});

test('check mode reports drift without overwriting it', async (t) => {
  const { source, target } = await createFixture(t);
  await writeFile(source, '# canonical\n');
  await syncSkill({ source, target });
  await writeFile(target, '# drifted\n');

  const result = await syncSkill({ source, target, check: true });

  assert.deepEqual(result, { ok: false, reason: 'drift' });
  assert.equal(await readFile(target, 'utf8'), '# drifted\n');
});

test('repository plugin Skill matches the canonical root Skill', () => {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const result = spawnSync(
    process.execPath,
    [join(scriptDirectory, 'sync-plugin-skill.js'), '--check'],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
