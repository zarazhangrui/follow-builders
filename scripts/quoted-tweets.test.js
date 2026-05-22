import assert from "node:assert/strict";
import test from "node:test";

import { buildQuotedTweetLookup } from "./quoted-tweets.js";

test("builds quoted tweet details from expanded tweets and users", () => {
  const lookup = buildQuotedTweetLookup({
    tweets: [
      {
        id: "456",
        author_id: "123",
        text: "Truncated text",
        note_tweet: { text: "Full quoted tweet text" },
      },
    ],
    users: [{ id: "123", name: "Builder", username: "builder" }],
  });

  assert.deepEqual(lookup.get("456"), {
    author: "Builder",
    text: "Full quoted tweet text",
    url: "https://x.com/builder/status/456",
  });
});

test("falls back when an expanded author is unavailable", () => {
  const lookup = buildQuotedTweetLookup({
    tweets: [{ id: "789", author_id: "missing", text: "Quoted text" }],
  });

  assert.deepEqual(lookup.get("789"), {
    author: null,
    text: "Quoted text",
    url: "https://x.com/i/web/status/789",
  });
});

test("handles responses without expansions", () => {
  assert.equal(buildQuotedTweetLookup(null).size, 0);
});
