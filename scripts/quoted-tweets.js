export function buildQuotedTweetLookup(includes = {}) {
  const usersById = new Map(
    (includes?.users || []).map((user) => [user.id, user]),
  );

  return new Map(
    (includes?.tweets || []).map((tweet) => {
      const author = usersById.get(tweet.author_id);
      const username = author?.username || null;

      return [
        tweet.id,
        {
          author: author?.name || username,
          text: tweet.note_tweet?.text || tweet.text,
          url: username
            ? `https://x.com/${username}/status/${tweet.id}`
            : `https://x.com/i/web/status/${tweet.id}`,
        },
      ];
    }),
  );
}
