import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadEnvFile } from './deliver.js';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));

test('local env loading preserves existing values and supports common syntax', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'follow-builders-env-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const envPath = join(directory, '.env');
  const environment = { EXISTING: 'from-process' };
  await writeFile(
    envPath,
    [
      '# delivery credentials',
      'EXISTING=from-file',
      'export TELEGRAM_BOT_TOKEN=token-value',
      'RESEND_API_KEY=\"line\\nvalue\"',
      'UNQUOTED=value # trailing comment'
    ].join('\n')
  );

  await loadEnvFile(envPath, environment);

  assert.deepEqual(environment, {
    EXISTING: 'from-process',
    TELEGRAM_BOT_TOKEN: 'token-value',
    RESEND_API_KEY: 'line\nvalue',
    UNQUOTED: 'value'
  });
});

test('stdout delivery runs from an installed package without node_modules', async (t) => {
  const packageRoot = await mkdtemp(
    join(tmpdir(), 'follow-builders-installed-')
  );
  t.after(() => rm(packageRoot, { recursive: true, force: true }));

  const scriptsDirectory = join(packageRoot, 'scripts');
  const userDirectory = join(packageRoot, 'user');
  await mkdir(scriptsDirectory, { recursive: true });
  await copyFile(
    join(SCRIPT_DIRECTORY, 'deliver.js'),
    join(scriptsDirectory, 'deliver.js')
  );
  await writeFile(
    join(scriptsDirectory, 'package.json'),
    JSON.stringify({ type: 'module' })
  );

  const result = spawnSync(
    process.execPath,
    [join(scriptsDirectory, 'deliver.js')],
    {
      input: 'installed stdout smoke\n',
      encoding: 'utf8',
      env: {
        ...process.env,
        FOLLOW_BUILDERS_USER_DIR: userDirectory
      }
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, 'installed stdout smoke\n\n');
});
