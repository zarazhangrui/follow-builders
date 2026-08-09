**English** | [中文](README.zh-CN.md)

# Follow Builders, Not Influencers

An AI-powered digest that tracks the top builders in AI — researchers, founders, PMs,
and engineers who are actually building things — and delivers curated summaries of
what they're saying.

**Philosophy:** Follow people who build products and have original opinions, not
influencers who regurgitate information.

## What You Get

A daily or weekly digest delivered to your preferred messaging app (Telegram, Discord,
WhatsApp, etc.) with:

- Summaries of new podcast episodes from top AI podcasts
- Key posts and insights from 25 curated AI builders on X/Twitter
- Fresh local X signals from the installed `twitter` CLI, deduped with the central feed by tweet ID
- GitHub watch, OSSInsight trending repos, and Hacker News discussion for AI agent and coding-tool infrastructure
- Full articles from official AI company blogs (Anthropic Engineering, Claude Blog)
- Links to all original content
- Available in English, Chinese, or bilingual

## Quick Start

1. Install the skill in your agent (OpenClaw or Claude Code)
2. Say "set up follow builders" or invoke `/follow-builders`
3. The agent walks you through setup conversationally — no config files to edit

The agent will ask you:
- How often you want your digest (daily or weekly) and what time
- What language you prefer
- How you want it delivered (Telegram, email, or in-chat)

No new content API key is required for the core feed. Optional Horizon sources reuse local tools such as `gh`; AnySearch supports anonymous access.
Your first digest arrives immediately after setup.

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

### AI Builders on X (25)
[Andrej Karpathy](https://x.com/karpathy), [Swyx](https://x.com/swyx), [Josh Woodward](https://x.com/joshwoodward), [Kevin Weil](https://x.com/kevinweil), [Peter Yang](https://x.com/petergyang), [Nan Yu](https://x.com/thenanyu), [Madhu Guru](https://x.com/realmadhuguru), [Amanda Askell](https://x.com/AmandaAskell), [Cat Wu](https://x.com/_catwu), [Thariq](https://x.com/trq212), [Google Labs](https://x.com/GoogleLabs), [Amjad Masad](https://x.com/amasad), [Guillermo Rauch](https://x.com/rauchg), [Alex Albert](https://x.com/alexalbert__), [Aaron Levie](https://x.com/levie), [Ryo Lu](https://x.com/ryolu_), [Garry Tan](https://x.com/garrytan), [Matt Turck](https://x.com/mattturck), [Zara Zhang](https://x.com/zarazhangrui), [Nikunj Kothari](https://x.com/nikunj), [Peter Steinberger](https://x.com/steipete), [Dan Shipper](https://x.com/danshipper), [Aditya Agarwal](https://x.com/adityaag), [Sam Altman](https://x.com/sama), [Claude](https://x.com/claudeai)

### Official Blogs (2)
- [Anthropic Engineering](https://www.anthropic.com/engineering) — technical deep-dives from the Anthropic team
- [Claude Blog](https://claude.com/blog) — product announcements and updates from Claude

### Agent Toolchain Signals (Non-RSS)

These defaults live in `config/horizon-defaults.json` and add signals for what builders are using, starring, and debating:

- **Local X freshness**: fetches one recent post each from high-signal accounts such as Karpathy, Swyx, Peter Yang, Guillermo Rauch, Alex Albert, and Dan Shipper. Runs serially to avoid rate limits.
- **GitHub 24-hour momentum**: merges the fixed watchlist, topic-based `gh search repos` discovery, and OSSInsight candidates. Official GitHub GraphQL stargazer timestamps produce `stars24h` and an age-adjusted `starVelocity`; cumulative stars are not presented as daily growth.
- **OSSInsight discovery**: starts with `past_24_hours` and records rows before and after filtering. If the configured threshold removes every result, it may fall back to `past_week`, and the wider window stays visible in the output.
- **Hacker News**: merges the official new/top/best story lists with Algolia keyword search, keeps only 24-hour-old stories, deduplicates by item ID, and suppresses repeat appearances until momentum grows materially.
- **Reddit soft source**: AnySearch discovers public post metadata, Arctic Shift verifies post time, and Arctic Shift search is the fallback. Both are non-official sources; post bodies and comments are discarded before digest preparation.
- **Persistent source health**: `~/.follow-builders/trend-state.json` keeps a 48-hour rolling baseline. Each channel reports `baseline_only`, `ok_new`, `ok_no_new`, `degraded`, `failed`, or `blocked_auth` instead of treating every empty array as success.

## Installation

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

- An AI agent (OpenClaw, Claude Code, or similar)
- Internet connection (to fetch the central feed)
- An authenticated GitHub CLI (`gh`) for exact GitHub 24-hour star counts; the rest of the digest still runs if this source is unavailable

No Reddit account or Reddit API credentials are required for the default soft-source path. AnySearch can use anonymous access with lower limits or an optional locally configured key. Central blog, podcast, and X content remains available independently of these Horizon sources.

The AnySearch CLI is resolved from `reddit.anySearchCli` in `config/horizon-defaults.json`, then `FOLLOW_BUILDERS_ANYSEARCH_CLI` (or `ANYSEARCH_CLI`), common agent skill directories under the current home directory, and finally the `anysearch` command on `PATH`.

## How It Works

1. A central feed is updated daily with blogs, podcasts, and X content
   (blog articles via web scraping, YouTube transcripts via Supadata, X/Twitter via official API)
2. Your agent fetches that feed and independently prepares public GitHub, HN, and Reddit trend metadata
3. A local 48-hour state separates a new signal from a repeated item, an empty result, or a source failure
4. Your agent remixes the prepared JSON into a digestible summary using your preferences
5. The digest is delivered to your messaging app (or shown in-chat)

See [examples/sample-digest.md](examples/sample-digest.md) for what the output looks like.

## Privacy

- Telegram/email delivery credentials stay locally in `~/.follow-builders/.env`; the prepared output never includes them
- GitHub/HN/Reddit collection uses public metadata. Fixed, non-sensitive Reddit search terms are sent to AnySearch; post bodies and comments are discarded
- The rolling trend state stores only IDs, timestamps, and numeric metrics in `~/.follow-builders/trend-state.json`
- Your configuration, preferences, delivery credentials, and trend state stay on your machine

## License

MIT
