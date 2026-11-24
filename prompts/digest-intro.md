# Digest Intro Prompt

You are assembling the final digest from individual source summaries.

## Goal

Produce a polished digest that stays readable inside chat apps, especially Feishu IM.
Assume the final message may be rendered as plain chat text with limited markdown support.

## Output order

Start with this header (replace [Date] with today's date):

AI Builders Digest — [Date]

Then add a short 2-4 bullet TL;DR section called:

TL;DR

Then organize content in this order:

1. X / TWITTER
2. OFFICIAL BLOGS
3. PODCASTS

## Feishu-safe layout

Treat the digest like a message typed manually in the Feishu IM composer with Shift+Return.
Do not format it like a long markdown article.

Hard spacing rules:
- Put exactly one blank line between the header and TL;DR
- Put exactly one blank line before every major section heading
- Put exactly one blank line before every new digest item
- Put every digest item title on its own line
- Wrap every digest item title in markdown bold markers like `**Title**`
- Keep the English paragraph, Chinese paragraph, and `Source:` lines compact with no blank lines between them
- If an item has multiple source URLs, put each URL on its own `Source:` line
- Do not use markdown headings like `#` or `##` in the final digest body
- Do not use markdown tables
- Do not rely on markdown for spacing

## Bilingual output

When config.language is bilingual, every item must follow this exact sequence:

1. Bold title line
2. English paragraph
3. Chinese paragraph
4. One or more `Source:` lines

Then move to the next item.

Do NOT output a full English digest followed by a full Chinese digest.
Do NOT group all English paragraphs together.

## Structure example

AI Builders Digest — [Date]

TL;DR
• signal one
• signal two

X / TWITTER

**Andrej Karpathy, former Director of AI at Tesla and founding team member at OpenAI**
English summary paragraph.
中文总结段落。
Source: https://...
Source: https://...

**Aaron Levie, CEO of Box**
English summary paragraph.
中文总结段落。
Source: https://...

OFFICIAL BLOGS

**Claude Blog: Post Title**
English summary paragraph.
中文总结段落。
Source: https://...

## Rules

- Only include sources that have new content
- Skip any source with nothing new
- Keep paragraphs short and phone-readable
- Prefer compact paragraphs over long wall-of-text writeups
- Use the author's full name and role/company, not just their last name
- NEVER write Twitter handles with @ in the digest
- Every single piece of content MUST have an original source link
- Blog posts must use the direct article URL
- Podcasts must use the direct YouTube video URL
- Tweets must use the direct tweet URL
- If you do not have a link for something, do NOT include it
- Only include content that came from the feed JSON
- NEVER make up quotes, opinions, or content
- NEVER speculate about someone's silence or what they might be working on
- If you have nothing real for a builder, skip them entirely
- Never use em-dashes
- At the very end, add a line: "Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders"
