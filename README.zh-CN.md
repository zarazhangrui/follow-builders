[English](README.md) | **中文**

# 追踪建造者，而非网红

一个 AI 驱动的信息聚合工具，追踪 AI 领域最顶尖的建造者——研究员、创始人、产品经理和工程师——并将他们的最新动态整理成易于消化的摘要推送给你。

**理念：** 追踪那些真正在做产品、有独立见解的人，而非只会搬运信息的网红。

## 你会得到什么

按需生成或定时发送到 ChatGPT、OpenClaw 或你选择的推送渠道，包含：

- 顶级 AI 播客新节目的精华摘要
- 26 位精选 AI 建造者在 X/Twitter 上的关键观点和洞察
- AI 公司官方博客的完整文章（Anthropic Engineering、Claude Blog）
- 所有原始内容的链接
- 支持英文、中文或双语版本

## 快速开始

1. 在 ChatGPT App 中安装 Plugin，或在其他兼容 Agent 中安装根目录 Skill
2. 直接说“生成今天的 AI Builders 简报”（单次使用不需要先完成设置）
3. 只有在需要保存偏好、定时运行或外部推送时，才说“设置 Follow Builders”

进行持久化设置时，Agent 会询问你：

- 推送频率（每日或每周）和时间
- 语言偏好
- 推送方式（Telegram、邮件或直接在聊天中显示）

信息源不需要 API key——所有内容由中心化服务统一抓取。只有选择 Telegram
或邮件外部推送时，才需要对应的可选密钥。

## ChatGPT App

Follow Builders 被封装为一个 skills-only ChatGPT Plugin，同时支持 **Work**
与 **Codex** 模式。两个模式共用同一份 Skill、feed、摘要规则、原始链接和失败处理：

- **Work** 主要呈现最终简报；宿主具备能力时可优先使用原生 Scheduled Tasks。
- **Codex** 还可以展示脚本执行、仓库上下文和诊断信息。

当前仓库已经具备本地开发测试所需结构，但尚未发布到公共 Plugins Directory。

### 测试本地 Plugin

1. 克隆仓库并安装投递脚本依赖：

   ```bash
   git clone https://github.com/zarazhangrui/follow-builders.git
   cd follow-builders/scripts && npm install
   ```

2. 在 ChatGPT Work 中使用 `@plugin-creator`，或在 Codex 中使用
   `$plugin-creator`，让它把现有 `follow-builders` 目录加入个人 marketplace。
3. 检查 `.codex-plugin/plugin.json`，刷新 ChatGPT 桌面 App，打开
   **Plugins**，选择个人/本地来源并安装 **Follow Builders**。
4. 新建 chat 或 task 后直接提出需求；也可以在输入框键入 `@`，明确选择
   Plugin。

本地 marketplace 在不同使用界面的可用性可能不同。本地测试请使用 ChatGPT
桌面 App；要在 ChatGPT Work Web 中分发，需要走相应的 workspace 或公共发布流程。
参见 OpenAI 的[插件使用说明](https://learn.chatgpt.com/docs/plugins)和
[插件构建文档](https://developers.openai.com/plugins/build/plugins)。

### 定时与推送顺序

Skill 会按宿主实际具备的能力选择第一条可用路径：

1. ChatGPT 原生 Scheduled Tasks
2. OpenClaw cron 与已配置 channel
3. 仅在用户明确选择时使用 Telegram 或邮件
4. 在当前对话按需输出

原生调度不可用时，不会静默写入系统 `crontab`。

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

### X 上的 AI 建造者（26位）
[Andrej Karpathy](https://x.com/karpathy), [Swyx](https://x.com/swyx), [Josh Woodward](https://x.com/joshwoodward), [Boris Cherny](https://x.com/bcherny), [Thibault Sottiaux](https://x.com/thsottiaux), [Peter Yang](https://x.com/petergyang), [Nan Yu](https://x.com/thenanyu), [Madhu Guru](https://x.com/realmadhuguru), [Amanda Askell](https://x.com/AmandaAskell), [Cat Wu](https://x.com/_catwu), [Thariq](https://x.com/trq212), [Google Labs](https://x.com/GoogleLabs), [Amjad Masad](https://x.com/amasad), [Guillermo Rauch](https://x.com/rauchg), [Alex Albert](https://x.com/alexalbert__), [Aaron Levie](https://x.com/levie), [Ryo Lu](https://x.com/ryolu_), [Garry Tan](https://x.com/garrytan), [Matt Turck](https://x.com/mattturck), [Zara Zhang](https://x.com/zarazhangrui), [Nikunj Kothari](https://x.com/nikunj), [Peter Steinberger](https://x.com/steipete), [Dan Shipper](https://x.com/danshipper), [Aditya Agarwal](https://x.com/adityaag), [Sam Altman](https://x.com/sama), [Claude](https://x.com/claudeai)

### 官方博客（2个）
- [Anthropic Engineering](https://www.anthropic.com/engineering) — Anthropic 团队的技术深度文章
- [Claude Blog](https://claude.com/blog) — Claude 的产品公告与更新

## 安装

ChatGPT App 的开发测试流程见上文。

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

- ChatGPT App（Work 或 Codex）、OpenClaw、Claude Code、Cursor 或类似的
  Skill 宿主
- Node.js 18 或更高版本，用于运行 bundled scripts
- 网络连接（用于获取中心化 feed）

仅此而已。信息源不需要 API key。所有内容（博客文章 + YouTube 字幕 +
X/Twitter 帖子）由中心化服务每日抓取更新。

## 工作原理

1. 中心化 feed 每日更新，抓取所有信息源的最新内容（博客文章通过网页抓取，YouTube 字幕通过 Supadata，X/Twitter 通过官方 API）
2. bundled script 从 GitHub 获取三份 feed 文件和可选的 prompt 更新——信息源不需要 API key
3. 你的 agent 根据你的偏好将原始内容重新混编为易消化的摘要
4. 摘要推送到你的通讯工具（或直接在聊天中显示）

准备脚本会明确返回 `ok`、`partial` 或 `error`。网络限制或某一路信息源不可用时，
会披露覆盖不完整/失败状态，不会误报成“今天没有更新”。

查看 [examples/sample-digest.md](examples/sample-digest.md) 了解输出示例。

## 隐私

- 信息源不需要 API key，也不会向 feed 服务发送此类密钥
- 如果使用 Telegram/邮件推送，相关凭据存储在本地
  `~/.follow-builders/.env`，并且只发送给用户选择的投递服务商
- Skill 只读取公开内容（公开的博客文章、YouTube 视频和 X 帖子）
- bundled script 会从本 GitHub 仓库下载公开 feed 和可选的 prompt 更新；
  远程 prompt 不可用时会回退到 bundled local prompts
- feed 内容和远程 prompt 都作为不可信输入处理，不能授权工具、文件修改、定时任务或外部发送
- 你的配置和偏好保留在你自己的设备上

## 许可证

MIT
