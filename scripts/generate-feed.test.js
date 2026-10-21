import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPodcastFeedEntry,
  fetchPod2txtTranscript,
  fetchSupadataTranscript,
  matchYouTubeEpisode,
  parseYouTubePageData,
  parseYouTubeFeed,
  parseSyndicationFeed,
  sourceMetadata,
} from "./generate-feed.js";

test("fetchPod2txtTranscript returns an error instead of throwing on network failure", async () => {
  const result = await fetchPod2txtTranscript(
    "https://example.com/feed.rss",
    "episode-guid",
    "dummy-key",
    async () => {
      throw new Error("network down");
    },
  );

  assert.deepEqual(result, { error: "network down" });
});

test("fetchSupadataTranscript normalizes chunked transcript content", async () => {
  const calls = [];
  const result = await fetchSupadataTranscript(
    "https://www.youtube.com/watch?v=abc123",
    "sd_test",
    async (url, options) => {
      calls.push({ url: String(url), key: options.headers["x-api-key"] });
      return new Response(
        JSON.stringify({
          content: [{ text: "first chunk" }, { text: "second chunk" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  );

  assert.deepEqual(result, { transcript: "first chunk\nsecond chunk" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, "sd_test");
  assert.match(calls[0].url, /api\.supadata\.ai\/v1\/transcript/);
  assert.match(calls[0].url, /mode=native/);
});

test("fetchSupadataTranscript redacts API key from auth errors", async () => {
  const result = await fetchSupadataTranscript(
    "https://www.youtube.com/watch?v=abc123",
    "sd_secret",
    async () =>
      new Response(
        JSON.stringify({
          error: "unauthorized",
          details: "Invalid API Key: sd_secret",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
  );

  assert.equal(result.authError, true);
  assert.match(result.error, /Invalid API Key: \[REDACTED\]/);
  assert.doesNotMatch(result.error, /sd_secret/);
});

test("parseYouTubeFeed reads Atom entries", () => {
  const feed = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
    <entry>
      <title>Knowing What Your Customers Want, All the Time: Listen Labs&apos; Alfred Wahlforss</title>
      <yt:videoId>UDTr9yUnLUI</yt:videoId>
    </entry>
  </feed>`;

  assert.deepEqual(parseYouTubeFeed(feed), [
    {
      title:
        "Knowing What Your Customers Want, All the Time: Listen Labs&apos; Alfred Wahlforss",
      videoId: "UDTr9yUnLUI",
      url: "https://www.youtube.com/watch?v=UDTr9yUnLUI",
    },
  ]);
});

test("parseYouTubePageData returns videoId and watch URL", () => {
  const data = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                richGridRenderer: {
                  contents: [
                    {
                      richItemRenderer: {
                        content: {
                          videoRenderer: {
                            videoId: "abc123XYZ00",
                            title: { simpleText: "Episode title" },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
  const html = `var ytInitialData = ${JSON.stringify(data)};</script>`;

  assert.deepEqual(parseYouTubePageData(html), [
    {
      title: "Episode title",
      videoId: "abc123XYZ00",
      url: "https://www.youtube.com/watch?v=abc123XYZ00",
    },
  ]);
});

test("matchYouTubeEpisode returns both videoId and URL only for a confident match", () => {
  const videos = [
    {
      title: "How Every's Team Used AI to Ship Its Biggest Launch Ever",
      videoId: "episode12345",
      url: "https://www.youtube.com/watch?v=episode12345",
    },
  ];

  assert.deepEqual(
    matchYouTubeEpisode(videos, "How Every's Team Used AI to Ship Its Biggest Launch Ever"),
    {
      videoId: "episode12345",
      url: "https://www.youtube.com/watch?v=episode12345",
    },
  );
  assert.equal(matchYouTubeEpisode(videos, "Unrelated episode"), null);
});

test("buildPodcastFeedEntry never falls back to a playlist URL", () => {
  const entry = buildPodcastFeedEntry({
    selected: {
      podcast: {
        name: "AI & I by Every",
        url: "https://www.youtube.com/playlist?list=playlist123",
      },
      title: "Episode without a video match",
      guid: "episode-guid",
      link: "https://every.to/podcast/episode",
      publishedAt: "2026-07-22T15:09:01.000Z",
    },
    youtubeEpisode: null,
    transcript: "transcript",
  });

  assert.equal(entry.videoId, null);
  assert.equal(entry.url, null);
  assert.equal(entry.podcastUrl, "https://every.to/podcast/episode");
  assert.doesNotMatch(JSON.stringify(entry), /youtube\.com\/playlist/);
});

test("parseSyndicationFeed reads Atom entries with escaped HTML content", () => {
  const feed = `<?xml version="1.0"?>
    <feed>
      <entry>
        <title>Codex v1.2.3</title>
        <id>tag:github.com,2008:Repository/1/v1.2.3</id>
        <updated>2026-06-07T08:00:00Z</updated>
        <link rel="alternate" href="https://github.com/openai/codex/releases/tag/v1.2.3"/>
        <content type="html">&lt;p&gt;Fixed agent workflow bugs.&lt;/p&gt;</content>
      </entry>
    </feed>`;

  assert.deepEqual(parseSyndicationFeed(feed), [
    {
      title: "Codex v1.2.3",
      url: "https://github.com/openai/codex/releases/tag/v1.2.3",
      guid: "tag:github.com,2008:Repository/1/v1.2.3",
      publishedAt: "2026-06-07T08:00:00.000Z",
      content: "Fixed agent workflow bugs.",
    },
  ]);
});

test("sourceMetadata keeps only editorial metadata", () => {
  assert.deepEqual(
    sourceMetadata({
      name: "Claude",
      handle: "claudeai",
      topics: ["claude-code"],
      wechat: { priority: "high" },
    }),
    {
      topics: ["claude-code"],
      wechat: { priority: "high" },
    },
  );
});
