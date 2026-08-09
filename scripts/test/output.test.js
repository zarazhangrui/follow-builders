import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import test from 'node:test';

import { writeJsonOutput } from '../lib/output.js';

test('JSON output waits for a slow writable stream to flush completely', async () => {
  const chunks = [];
  const stream = new Writable({
    highWaterMark: 8,
    write(chunk, encoding, callback) {
      setImmediate(() => {
        chunks.push(Buffer.from(chunk));
        callback();
      });
    }
  });
  const value = { status: 'ok', payload: 'x'.repeat(100_000) };

  await writeJsonOutput(value, stream);

  const text = Buffer.concat(chunks).toString('utf8');
  assert.equal(text.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(text), value);
});
