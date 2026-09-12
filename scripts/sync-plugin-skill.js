#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const ROOT_SKILL = join(REPOSITORY_ROOT, 'SKILL.md');
const PLUGIN_SKILL = join(
  REPOSITORY_ROOT,
  'skills',
  'follow-builders',
  'SKILL.md'
);

export async function syncSkill({
  source = ROOT_SKILL,
  target = PLUGIN_SKILL,
  check = false
} = {}) {
  const canonical = await readFile(source);
  let mirror;

  try {
    mirror = await readFile(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (check) return { ok: false, reason: 'missing' };
  }

  if (mirror?.equals(canonical)) {
    return { ok: true, reason: 'matching' };
  }

  if (check) {
    return { ok: false, reason: 'drift' };
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, canonical);
  return { ok: true, reason: 'synced' };
}

async function runCli() {
  const check = process.argv.includes('--check');
  const result = await syncSkill({ check });

  if (!result.ok) {
    console.error(
      `Plugin Skill mirror is ${result.reason}. Run "npm run sync-plugin-skill" from scripts/.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Plugin Skill mirror is ${result.reason}.`);
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
