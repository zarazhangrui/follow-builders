import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuotedTweetFields,
  buildQuotedTweetLookup,
} from "./quoted-tweets.js";

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

test("attaches expanded details to a quoted tweet", () => {
  const fields = buildQuotedTweetFields(
    { referenced_tweets: [{ type: "quoted", id: "456" }] },
    new Map([["456", { author: "Builder", text: "Context", url: "url" }]]),
  );

  assert.deepEqual(fields, {
    isQuote: true,
    quotedTweetId: "456",
    quotedTweet: { author: "Builder", text: "Context", url: "url" },
  });
});

test("marks unavailable quoted tweet details as null", () => {
  const fields = buildQuotedTweetFields(
    { referenced_tweets: [{ type: "quoted", id: "missing" }] },
    new Map(),
  );

  assert.deepEqual(fields, {
    isQuote: true,
    quotedTweetId: "missing",
    quotedTweet: null,
  });
});

test("omits quotedTweet for a regular tweet", () => {
  assert.deepEqual(buildQuotedTweetFields({}, new Map()), {
    isQuote: false,
    quotedTweetId: null,
  });
});
