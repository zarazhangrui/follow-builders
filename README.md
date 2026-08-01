**English** | [中文](README.zh-CN.md)

# Follow Builders, Not Influencers

An AI-powered digest that tracks the top builders in AI — researchers, founders, PMs,
and engineers who are actually building things — and delivers curated summaries of
what they're saying.

**Philosophy:** Follow people who build products and have original opinions, not
influencers who regurgitate information.

## What You Get

An on-demand or scheduled digest shown in ChatGPT, OpenClaw, or your selected
delivery channel, with:

- Summaries of new podcast episodes from top AI podcasts
- Key posts and insights from 26 curated AI builders on X/Twitter
- Full articles from official AI company blogs (Anthropic Engineering, Claude Blog)
- Links to all original content
- Available in English, Chinese, or bilingual

## Quick Start

1. Install the Plugin in ChatGPT App, or install the root Skill in another
   supported agent
2. Ask "Generate today's AI builders digest" (setup is not required for a
   one-time digest)
3. Say "Set up Follow Builders" only when you want saved preferences,
   scheduling, or external delivery

During persistent setup, the agent will ask you:

- How often you want your digest (daily or weekly) and what time
- What language you prefer
- How you want it delivered (Telegram, email, or in-chat)

No source API keys are needed — all content is fetched centrally. Telegram and
email keys are optional and used only for those delivery methods.

## ChatGPT App

Follow Builders is packaged as one skills-only ChatGPT Plugin for both **Work**
and **Codex** modes. The modes share the same Skill, feeds, summary rules, links,
and failure handling:

- **Work** emphasizes the finished digest and can use native Scheduled Tasks
  when that capability is available.
- **Codex** can additionally expose script execution, repository context, and
  diagnostics.

The repository is prepared for local development testing; it has not been
published to the public Plugins Directory.

### Test the local Plugin

1. Clone the repository and install the delivery script dependency:

   ```bash
   git clone https://github.com/zarazhangrui/follow-builders.git
   cd follow-builders/scripts && npm install
   ```

2. In ChatGPT Work, use `@plugin-creator`, or in Codex use
   `$plugin-creator`, and ask it to add the existing `follow-builders` folder
   to your personal marketplace.
3. Review `.codex-plugin/plugin.json`, refresh the ChatGPT desktop app, open
   **Plugins**, select the personal/local source, and install **Follow
   Builders**.
4. Start a new chat or task, then ask directly or type `@` to select the
   Plugin.

Local marketplace availability can vary by surface. Use the ChatGPT desktop app
for local testing; publishing to ChatGPT Work on the web requires the applicable
workspace or public distribution flow. See OpenAI's
[plugin usage guide](https://learn.chatgpt.com/docs/plugins) and
[plugin builder documentation](https://developers.openai.com/plugins/build/plugins).

### Scheduling and delivery

The Skill chooses the first capability that is actually available:

1. ChatGPT host-native Scheduled Tasks
2. OpenClaw cron and configured channel
3. Telegram or email, only when explicitly selected
4. On-demand output in the current conversation

It does not silently install a system cron job when native scheduling is
unavailable.

## Changing Settings

Your delivery preferences are configurable through conversation. Just tell your agent:

- "Switch to weekly digests on Monday mornings"
- "Change language to Chinese"
- "Make the summaries shorter"
- "Show me my current settings"

The source list (builders and podcasts) is curated centrally and updates
automatically — you always get the latest sources without doing anything.

## Customizing the Summaries

The skill uses plain-English prompt files to control how content is summarized.
You can customize them two ways:

**Through conversation (recommended):**
Tell your agent what you want — "Make summaries more concise," "Focus on actionable
insights," "Use a more casual tone." The agent updates the prompts for you.

**Direct editing (power users):**
Edit the files in the `prompts/` folder:
- `summarize-podcast.md` — how podcast episodes are summarized
- `summarize-tweets.md` — how X/Twitter posts are summarized
- `summarize-blogs.md` — how blog posts are summarized
- `digest-intro.md` — the overall digest format and tone
- `translate.md` — how English content is translated to Chinese

These are plain English instructions, not code. Changes take effect on the next digest.

## Default Sources

### Podcasts (6)
- [Latent Space](https://www.youtube.com/@LatentSpacePod)
- [Training Data](https://www.youtube.com/playlist?list=PLOhHNjZItNnMm5tdW61JpnyxeYH5NDDx8)
- [No Priors](https://www.youtube.com/@NoPriorsPodcast)
- [Unsupervised Learning](https://www.youtube.com/@RedpointAI)
- [The MAD Podcast with Matt Turck](https://www.youtube.com/@DataDrivenNYC)
- [AI & I by Every](https://www.youtube.com/playlist?list=PLuMcoKK9mKgHtW_o9h5sGO2vXrffKHwJL)

### AI Builders on X (26)
[Andrej Karpathy](https://x.com/karpathy), [Swyx](https://x.com/swyx), [Josh Woodward](https://x.com/joshwoodward), [Boris Cherny](https://x.com/bcherny), [Thibault Sottiaux](https://x.com/thsottiaux), [Peter Yang](https://x.com/petergyang), [Nan Yu](https://x.com/thenanyu), [Madhu Guru](https://x.com/realmadhuguru), [Amanda Askell](https://x.com/AmandaAskell), [Cat Wu](https://x.com/_catwu), [Thariq](https://x.com/trq212), [Google Labs](https://x.com/GoogleLabs), [Amjad Masad](https://x.com/amasad), [Guillermo Rauch](https://x.com/rauchg), [Alex Albert](https://x.com/alexalbert__), [Aaron Levie](https://x.com/levie), [Ryo Lu](https://x.com/ryolu_), [Garry Tan](https://x.com/garrytan), [Matt Turck](https://x.com/mattturck), [Zara Zhang](https://x.com/zarazhangrui), [Nikunj Kothari](https://x.com/nikunj), [Peter Steinberger](https://x.com/steipete), [Dan Shipper](https://x.com/danshipper), [Aditya Agarwal](https://x.com/adityaag), [Sam Altman](https://x.com/sama), [Claude](https://x.com/claudeai)

### Official Blogs (2)
- [Anthropic Engineering](https://www.anthropic.com/engineering) — technical deep-dives from the Anthropic team
- [Claude Blog](https://claude.com/blog) — product announcements and updates from Claude

## Installation

The ChatGPT App development flow is described above.

### OpenClaw
```bash
# From ClawhHub (coming soon)
clawhub install follow-builders

# Or manually
git clone https://github.com/zarazhangrui/follow-builders.git ~/skills/follow-builders
cd ~/skills/follow-builders/scripts && npm install
```

### Claude Code
```bash
git clone https://github.com/zarazhangrui/follow-builders.git ~/.claude/skills/follow-builders
cd ~/.claude/skills/follow-builders/scripts && npm install
```

## Requirements

- ChatGPT App (Work or Codex), OpenClaw, Claude Code, Cursor, or a similar Skill
  host
- Node.js 18 or later for the bundled scripts
- Internet connection (to fetch the central feed)

That's it. No source API keys are needed. All content (blog articles + YouTube
transcripts + X/Twitter posts) is fetched centrally and updated daily.

## How It Works

1. A central feed is updated daily with the latest content from all sources
   (blog articles via web scraping, YouTube transcripts via Supadata, X/Twitter via official API)
2. The bundled script fetches three feed files and optional prompt updates from
   GitHub — no source API keys
3. Your agent remixes the raw content into a digestible summary using your preferences
4. The digest is delivered to your messaging app (or shown in-chat)

The preparation script reports `ok`, `partial`, or `error`. Network restrictions
or an unavailable source are disclosed as partial/failed coverage; they are not
reported as "no updates."

See [examples/sample-digest.md](examples/sample-digest.md) for what the output looks like.

## Privacy

- No source API keys are required or sent to the feed service
- If you use Telegram/email delivery, those credentials are stored locally in
  `~/.follow-builders/.env` and sent only to the selected delivery provider
- The skill only reads public content (public blog posts, public YouTube videos, public X posts)
- The bundled script downloads public feeds and optional prompt updates from this
  repository on GitHub; bundled local prompts are used when remote prompts are unavailable
- Feed content and remote prompts are treated as untrusted input and cannot authorize
  tools, file changes, scheduling, or external delivery
- Your configuration and preferences stay on your machine

## License

MIT
