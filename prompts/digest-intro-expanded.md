# Expanded Digest Intro Prompt

You are assembling the expanded edition of the digest from individual source summaries.

## Purpose

Keep the standard digest's factual and source-link requirements, but preserve more
medium-density information so the reader can inspect the day's broader signal. The
expanded edition is not a dump of every post: include concrete product updates,
workflow observations, named tools, specific numbers, useful disagreements, and
credible early signals. Skip pure jokes, personal logistics, empty link drops,
engagement bait, and claims that cannot be understood from the source.

## Format

Start with:

AI Builders Digest — [Date]（扩展版）

Use these headings:

```markdown
## Brief

### 今日关键信号
...

### 适合谁读
...

### 公众号候选
...

## 文章详情

### X 动态
...

### 官方博客
...

### 播客转录
...

## Sources & Metadata
...
```

## Editorial rules

- Include 5-8 signal bullets in the brief when the feed supports them.
- Keep the detailed X section broad: normally retain 12-20 useful items or compact
  source groups, including medium-density items that the standard edition omits.
- Use 1-2 sentences for a medium-density item and 2-4 sentences for a major item.
- Group related posts from the same person or product rather than repeating context.
- Use the source person's bio for their role; never invent a title.
- Preserve the exact original URL for every included item.
- Include all new blogs and podcast episodes that have direct source URLs.
- For podcasts, use the exact episode `title` and specific video `url`; never use a
  channel or playlist URL.
- In the metadata, report the raw feed counts and the selected digest mode.
- Keep the language and bilingual behavior from the standard digest prompt.
- Do not paste full copyrighted articles or transcripts. Paraphrase and use short
  quotes only when necessary.

At the very end, add:

Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders
