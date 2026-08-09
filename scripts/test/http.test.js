import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpError, fetchJsonStrict } from '../lib/http.js';

test('strict JSON fetch preserves 403, 429, and 5xx response status', async () => {
  for (const status of [403, 429, 503]) {
    await assert.rejects(
      fetchJsonStrict('https://example.test/data', {
        backend: 'fixture-api',
        fetchImpl: async () => new Response('blocked', { status })
      }),
      error => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.httpStatus, status);
        assert.equal(error.backend, 'fixture-api');
        return true;
      }
    );
  }
});
