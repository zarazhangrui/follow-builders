import { mkdtemp, writeFile } from "fs/promises";
import { getDefaultResultOrder } from "dns";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchFreshJSON,
  fetchJSONWithFallback,
  fetchTextWithFallback,
  fetchTextWithRemoteFallback,
  resolveDigestMode,
} from "./prepare-digest.js";

test("prepare-digest prefers IPv4 DNS results for GitHub raw fetches", () => {
  assert.equal(getDefaultResultOrder(), "ipv4first");
});

test("resolveDigestMode supports explicit and configured expanded editions", () => {
  assert.equal(resolveDigestMode([], {}), "standard");
  assert.equal(resolveDigestMode(["--expanded"], {}), "expanded");
  assert.equal(resolveDigestMode(["--standard"], { digestMode: "expanded" }), "standard");
  assert.equal(resolveDigestMode([], { digestMode: "expanded" }), "expanded");
});

test("fetchJSONWithFallback reads local feed when remote fetch fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fb-feed-"));
  const localPath = join(dir, "feed.json");
  await writeFile(localPath, JSON.stringify({ x: [{ name: "Local feed" }] }));

  const errors = [];
  const result = await fetchJSONWithFallback({
    url: "https://example.invalid/feed.json",
    localPath,
    label: "tweet feed",
    errors,
    fetcher: async () => {
      throw new Error("network down");
    },
  });

  assert.deepEqual(result, { x: [{ name: "Local feed" }] });
  assert.match(errors[0], /remote tweet feed failed/i);
});

test("fetchFreshJSON uses origin/main feed data when available", async () => {
  const errors = [];
  const result = await fetchFreshJSON({
    url: "https://example.com/feed.json",
    filePath: "feed.json",
    label: "tweet feed",
    errors,
    gitFetcher: async () => {},
    gitReader: async () => ({ generatedAt: "2026-05-27T07:45:34.065Z" }),
  });

  assert.deepEqual(result, {
    data: { generatedAt: "2026-05-27T07:45:34.065Z" },
    source: "origin_main",
  });
  assert.deepEqual(errors, []);
});

test("fetchFreshJSON falls back to GitHub raw when git is unavailable", async () => {
  const errors = [];
  const result = await fetchFreshJSON({
    url: "https://example.com/feed.json",
    filePath: "feed.json",
    label: "tweet feed",
    errors,
    gitFetcher: async () => {
      throw new Error("not a git repo");
    },
    fetcher: async () => ({
      ok: true,
      json: async () => ({ generatedAt: "2026-05-27T07:45:34.065Z" }),
    }),
  });

  assert.deepEqual(result, {
    data: { generatedAt: "2026-05-27T07:45:34.065Z" },
    source: "github_raw",
  });
  assert.match(errors.join("\n"), /git origin\/main tweet feed failed/i);
});

test("fetchFreshJSON does not use repo local fallback", async () => {
  const errors = [];
  const result = await fetchFreshJSON({
    url: "https://example.invalid/feed.json",
    filePath: "missing-feed.json",
    label: "tweet feed",
    errors,
    gitFetcher: async () => {
      throw new Error("not a git repo");
    },
    fetcher: async () => {
      throw new Error("network down");
    },
  });

  assert.deepEqual(result, { data: null, source: null });
  assert.match(errors.join("\n"), /git origin\/main tweet feed failed/i);
  assert.match(errors.join("\n"), /remote tweet feed failed/i);
});

test("fetchTextWithFallback reads local prompt when remote fetch fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fb-prompt-"));
  const localPath = join(dir, "prompt.md");
  await writeFile(localPath, "local prompt");

  const errors = [];
  const result = await fetchTextWithFallback({
    url: "https://example.invalid/prompt.md",
    localPath,
    label: "digest prompt",
    errors,
    fetcher: async () => {
      throw new Error("network down");
    },
  });

  assert.equal(result, "local prompt");
  assert.match(errors[0], /remote digest prompt failed/i);
});

test("fetchTextWithRemoteFallback uses origin/main prompt text when available", async () => {
  const errors = [];
  const result = await fetchTextWithRemoteFallback({
    url: "https://example.com/prompt.md",
    filePath: "prompts/prompt.md",
    localPath: "prompt.md",
    label: "digest prompt",
    errors,
    gitFetcher: async () => {},
    gitTextReader: async () => "remote prompt from git",
  });

  assert.equal(result, "remote prompt from git");
  assert.deepEqual(errors, []);
});
