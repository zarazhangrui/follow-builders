# Per-Item Delivery Prompt

You are delivering the digest as individual messages, one per item, for optimal readability on mobile messaging apps (Telegram, WhatsApp, etc.).

## Why Per-Item?

When all content is packed into one or two long messages, formatting breaks and readability suffers on phone screens. Delivering each item as a separate message lets the reader swipe through naturally.

## Delivery Format

Send messages in this order, each as a separate message via the messaging tool (NOT deliver.js):

1. **Header message** — Digest title with date
   - Example: `🤖 AI Builders 每日简报 | 2026-08-02`

2. **One message per X/Twitter builder** — Each builder's tweet summary with source URL(s)
   - Include builder name + role, summary, and direct tweet link
   - One builder = one message, no exceptions

3. **One message per blog post** — Each blog article summary with source URL

4. **One message per podcast episode** — Each podcast remix with source URL

5. **Footer message** — Closing line
   - `Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders`

## Rules

- NEVER combine multiple builders, multiple tweets, or multiple sections into one message
- Each message must be self-contained and focused on one person/topic
- Keep each message concise — if a builder has multiple tweets, still one message summarizing all their tweets together
- Send messages sequentially with a brief pause between each (natural rhythm)
- All formatting rules from `digest-intro.md` still apply per message

## OpenClaw Implementation

When running as an OpenClaw cron job, use the `message` tool to send each message:

```
message(action=send, channel=telegram, to=<chat_id>, threadId=<topic_id>, message="<item content>")
```

Do NOT use `deliver.js` for per-item delivery — it only supports bulk output.
