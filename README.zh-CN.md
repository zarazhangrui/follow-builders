[English](README.md) | **中文**

# 追踪建造者，而非网红

一个 AI 驱动的信息聚合工具，追踪 AI 领域最顶尖的建造者——研究员、创始人、产品经理和工程师——并将他们的最新动态整理成易于消化的摘要推送给你。

**理念：** 追踪那些真正在做产品、有独立见解的人，而非只会搬运信息的网红。

## 你会得到什么

每日或每周推送到你常用的通讯工具（Telegram、Discord、WhatsApp 等），包含：

- 顶级 AI 播客新节目的精华摘要
- 25 位精选 AI 建造者在 X/Twitter 上的关键观点和洞察
- 本机 `twitter` CLI 补充的 X 新鲜信号（与中心 feed 按 tweet ID 去重融合）
- AI Agent / 编码工具链的 GitHub watch、OSSInsight 趋势、Hacker News 社区讨论
- AI 公司官方博客的完整文章（Anthropic Engineering、Claude Blog）
- 所有原始内容的链接
- 支持英文、中文或双语版本

## 快速开始

1. 在你的 AI agent 中安装此 skill（OpenClaw 或 Claude Code）
2. 输入 "set up follow builders" 或执行 `/follow-builders`
3. Agent 会以对话方式引导你完成设置——不需要手动编辑任何配置文件

Agent 会询问你：
- 推送频率（每日或每周）和时间
- 语言偏好
- 推送方式（Telegram、邮件或直接在聊天中显示）

核心 feed 不需要新增内容 API key。可选 Horizon 渠道复用本机 `gh` 等工具；AnySearch 支持匿名访问。
设置完成后，你的第一期摘要会立即推送。

## 修改设置

通过对话即可修改推送偏好。直接告诉你的 agent：

- "改成每周一早上推送"
- "语言换成中文"
- "把摘要写得更简短一些"
- "显示我当前的设置"

信息源列表（建造者和播客）由中心化统一管理和更新——你无需做任何操作即可获得最新的信息源。

## 自定义摘要风格

Skill 使用纯文本 prompt 文件来控制内容的摘要方式。你可以通过两种方式自定义：

**通过对话（推荐）：**
直接告诉你的 agent——"摘要写得更简练一些"、"多关注可操作的洞察"、"用更轻松的语气"。Agent 会自动帮你更新 prompt。

**直接编辑（高级用户）：**
编辑 `prompts/` 文件夹中的文件：
- `summarize-podcast.md` — 播客节目的摘要方式
- `summarize-tweets.md` — X/Twitter 帖子的摘要方式
- `summarize-blogs.md` — 博客文章的摘要方式
- `digest-intro.md` — 整体摘要的格式和语气
- `translate.md` — 英文内容翻译为中文的方式

这些都是纯文本指令，不是代码。修改后下次推送即生效。

## 默认信息源

### 播客（6个）
- [Latent Space](https://www.youtube.com/@LatentSpacePod)
- [Training Data](https://www.youtube.com/playlist?list=PLOhHNjZItNnMm5tdW61JpnyxeYH5NDDx8)
- [No Priors](https://www.youtube.com/@NoPriorsPodcast)
- [Unsupervised Learning](https://www.youtube.com/@RedpointAI)
- [The MAD Podcast with Matt Turck](https://www.youtube.com/@DataDrivenNYC)
- [AI & I by Every](https://www.youtube.com/playlist?list=PLuMcoKK9mKgHtW_o9h5sGO2vXrffKHwJL)

### X 上的 AI 建造者（25位）
[Andrej Karpathy](https://x.com/karpathy), [Swyx](https://x.com/swyx), [Josh Woodward](https://x.com/joshwoodward), [Kevin Weil](https://x.com/kevinweil), [Peter Yang](https://x.com/petergyang), [Nan Yu](https://x.com/thenanyu), [Madhu Guru](https://x.com/realmadhuguru), [Amanda Askell](https://x.com/AmandaAskell), [Cat Wu](https://x.com/_catwu), [Thariq](https://x.com/trq212), [Google Labs](https://x.com/GoogleLabs), [Amjad Masad](https://x.com/amasad), [Guillermo Rauch](https://x.com/rauchg), [Alex Albert](https://x.com/alexalbert__), [Aaron Levie](https://x.com/levie), [Ryo Lu](https://x.com/ryolu_), [Garry Tan](https://x.com/garrytan), [Matt Turck](https://x.com/mattturck), [Zara Zhang](https://x.com/zarazhangrui), [Nikunj Kothari](https://x.com/nikunj), [Peter Steinberger](https://x.com/steipete), [Dan Shipper](https://x.com/danshipper), [Aditya Agarwal](https://x.com/adityaag), [Sam Altman](https://x.com/sama), [Claude](https://x.com/claudeai)

### 官方博客（2个）
- [Anthropic Engineering](https://www.anthropic.com/engineering) — Anthropic 团队的技术深度文章
- [Claude Blog](https://claude.com/blog) — Claude 的产品公告与更新

### Agent 工具链默认信号（非 RSS）

这些默认源来自 `config/horizon-defaults.json`，用于补充“大家正在用什么 / star 什么 / 讨论什么”：

- **本机 X 补鲜**：优先抓取 Karpathy、Swyx、Peter Yang、Guillermo Rauch、Alex Albert、Dan Shipper 等高信号账号，每账号 1 条，串行执行，避免触发限流。
- **GitHub 24 小时动量**：合并固定观察池、按主题运行的 `gh search repos` 和 OSSInsight 候选，再用 GitHub 官方 GraphQL stargazer 时间戳计算 `stars24h` 与按项目年龄校正的 `starVelocity`；不会把累计 stars 冒充日增量。
- **OSSInsight 候选发现**：先读取 `past_24_hours`，同时记录过滤前后行数。如果阈值把结果全部清空，可降级到 `past_week`，并在输出中保留真实窗口。
- **Hacker News**：合并官方 new/top/best 列表与 Algolia 关键词检索，只保留 24 小时内的新帖，按 item ID 去重；已输出条目只有动量显著增长才会再次出现。
- **Reddit 软源**：AnySearch 发现公开帖子元数据，Arctic Shift 复核发布时间，并承担搜索 fallback。两者都不是 Reddit 官方 API；帖子正文和评论会在进入 digest 准备态之前被丢弃。
- **持久 Source Health**：`~/.follow-builders/trend-state.json` 保留 48 小时滚动基线。各渠道明确输出 `baseline_only`、`ok_new`、`ok_no_new`、`degraded`、`failed` 或 `blocked_auth`，不再把所有空数组都解释为成功。

## 安装

### OpenClaw
```bash
# 从 ClawhHub 安装（即将上线）
clawhub install follow-builders

# 或手动安装
git clone https://github.com/zarazhangrui/follow-builders.git ~/skills/follow-builders
cd ~/skills/follow-builders/scripts && npm install
```

### Claude Code
```bash
git clone https://github.com/zarazhangrui/follow-builders.git ~/.claude/skills/follow-builders
cd ~/.claude/skills/follow-builders/scripts && npm install
```

## 系统要求

- 一个 AI agent（OpenClaw、Claude Code 或类似工具）
- 网络连接（用于获取中心化 feed）
- 已登录的 GitHub CLI（`gh`），用于精确计算 GitHub 24 小时涨星；该源不可用时其余 digest 仍可继续

默认 Reddit 软源不需要 Reddit 账号或 Reddit API 凭据。AnySearch 可匿名运行（额度较低），也可读取本机已有的可选 key。中心化博客、播客和 X 内容不依赖这些 Horizon 渠道。

AnySearch CLI 依次从 `config/horizon-defaults.json` 的 `reddit.anySearchCli`、`FOLLOW_BUILDERS_ANYSEARCH_CLI`（或 `ANYSEARCH_CLI`）、当前用户目录下常见的 agent skill 路径、以及 `PATH` 中的 `anysearch` 命令解析。

## 工作原理

1. 中心化 feed 每日更新博客、播客和 X 内容（博客文章通过网页抓取，YouTube 字幕通过 Supadata，X/Twitter 通过官方 API）
2. 你的 agent 获取该 feed，并独立准备 GitHub、HN、Reddit 的公开趋势元数据
3. 本机 48 小时状态把新信号、重复条目、正常空结果和采集失败区分开
4. Agent 根据你的偏好把准备态 JSON 混编为易消化的摘要
5. 摘要推送到你的通讯工具（或直接在聊天中显示）

查看 [examples/sample-digest.md](examples/sample-digest.md) 了解输出示例。

## 隐私

- Telegram/邮件推送凭据仅存储在本机 `~/.follow-builders/.env`，不会进入准备态输出
- GitHub/HN/Reddit 只读取公开元数据；固定且不敏感的 Reddit 搜索词会发送给 AnySearch，帖子正文和评论会被丢弃
- 48 小时滚动状态只在 `~/.follow-builders/trend-state.json` 保存 ID、时间戳和数值指标
- 你的配置、偏好、交付凭据和趋势状态都保留在自己的设备上

## 许可证

MIT
