# Follow Builders ChatGPT App 插件兼容设计

- 日期：2026-08-01
- 状态：方向已获批准，等待书面规格复核
- 目标仓库：`zarazhangrui/follow-builders`
- 目标宿主：ChatGPT 桌面 App 的 Work 与 Codex 模式，以及 ChatGPT Work Web

## 1. 背景与问题

Follow Builders 当前是一个以仓库根目录 `SKILL.md` 为入口的 Agent Skill。它已经具备完整的内容链路：

1. 中心化 GitHub feed 提供 X、播客和博客内容；
2. `scripts/prepare-digest.js` 获取 feed、摘要 prompts 和用户偏好；
3. 宿主 Agent 根据 prompts 完成筛选、摘要与翻译；
4. `scripts/deliver.js` 将结果输出到当前对话、Telegram 或 Email。

当前缺口不是 Work 与 Codex 二选一，而是仓库尚未按 OpenAI Plugin 规范封装：

- 缺少 `.codex-plugin/plugin.json`；
- 缺少标准的 `skills/<skill-name>/SKILL.md` 插件发现结构；
- Skill 使用 Claude/OpenClaw 导向的平台判断和 `${CLAUDE_SKILL_DIR}` 路径；
- 调度逻辑优先考虑 OpenClaw cron 或系统 crontab，没有优先使用 ChatGPT App 原生 Scheduled Tasks；
- 远程 feed 和远程 prompt 的信任边界没有明确区分。

OpenAI 官方资料说明，ChatGPT 桌面 App 中的 Work 与 Codex 能力重叠，主要区别是界面、技术细节和结果呈现方式。两种模式共享插件目录，并可使用同一个 Plugin 中的 Skill。因此本项目应交付一个插件包，并分别验证两种模式，而不是维护两套适配。

## 2. 目标

第一阶段交付一个 Skills-only ChatGPT Plugin，使同一仓库能够：

1. 被 OpenAI Plugin 校验器识别；
2. 在 ChatGPT App 的 Work 和 Codex 模式中安装和触发；
3. 在 Work 模式中按用户请求生成当日简报；
4. 在 Codex 模式中复用相同工作流，并保留脚本调试能力；
5. 继续兼容现有 OpenClaw、Claude Code、Cursor 等根目录 Skill 安装方式；
6. 在宿主支持原生 Scheduled Tasks 时优先使用原生调度；
7. 不在缺少运行证据时引入 MCP、远程服务或自定义 UI。

## 3. 非目标

第一阶段不包含：

- 部署远程 MCP server；
- 创建 ChatGPT 自定义 UI；
- 提交到 OpenAI 公共 Plugins Directory；
- 改造中心 feed 的生成流水线或信息源；
- 增加新的外部投递渠道；
- 合并或替代上游现有 Codex PR #41；
- 解决 feed 长期可用性、内容质量或第三方数据授权的全部问题；
- 将 Telegram、Email 密钥迁移到新的托管密钥系统。

公共目录提交需要上游维护者身份、发布资料和审核流程，本 PR 只提供可安装、可验证的插件代码与文档基础。

## 4. 方案比较

### 方案 A：Skills-only Plugin，验证后按需扩展（采用）

增加 Plugin manifest 和标准 Skill 目录，复用现有脚本、prompts 与公开 feed。先在 Work 和 Codex 中验证真实运行边界。

优点：

- 改动最小，最符合现有架构；
- 不需要新服务、鉴权、托管或运维；
- Work 与 Codex 共用一个插件包；
- 容易向上游解释和审查；
- 能用运行证据决定是否需要 MCP。

代价：

- Work 的受控环境、网络权限和 bundled script 定位必须实际验证；
- 需要兼容根目录 Skill 和插件 Skill 两个发现入口；
- 宿主环境差异仍需通过能力判断处理。

### 方案 B：立即建设 Skill + MCP

由 MCP server 提供 `get_latest_feed`、`get_sources`、`get_feed_status` 等只读工具，Skill 只负责编排与输出规范。

优点：

- 数据获取接口稳定、结构化；
- 可以统一 Work、Codex 和未来其他 ChatGPT 表面；
- 服务端可以控制 schema、限流和观测。

代价：

- 新增部署、域名、可用性、监控和审核负担；
- 当前公开 GitHub feed 已能满足核心用例，增量价值尚未验证；
- PR 无法单独交付“可用服务”，除非上游愿意长期托管。

触发条件：只有 Skills-only 验证表明宿主无法可靠读取 feed、无法运行 bundled script，或上游明确要求服务端接口时才进入。

### 方案 C：仅补 Codex 安装和路径兼容

只增加 Codex 文档、安装路径和脚本 fallback。

优点：

- 实现成本最低；
- 与现有本地脚本高度贴合。

代价：

- 不能形成 ChatGPT App 可安装 Plugin；
- 不能覆盖 Work 模式；
- 与上游 PR #41 高度重叠。

因此不采用。

## 5. 插件结构

目标结构：

```text
follow-builders/
├── .codex-plugin/
│   └── plugin.json
├── skills/
│   └── follow-builders/
│       └── SKILL.md
├── SKILL.md
├── scripts/
├── prompts/
├── config/
├── examples/
└── README.md
```

### 5.1 Plugin manifest

`.codex-plugin/plugin.json` 至少包含：

- `name`: `follow-builders`
- 严格 semver `version`
- 真实的 description、author、repository 和 MIT license
- `skills`: `./skills/`
- Work/Codex 通用的界面描述
- 最多三个短 starter prompts
- 基于实际行为声明的 capabilities

第一阶段不声明 `apps` 或 `mcpServers`，因为对应文件和服务不存在。仓库不提交个人 marketplace 配置；本地测试使用临时或个人 marketplace，避免把开发者机器路径写入上游。

### 5.2 Skill 双入口兼容

OpenAI Plugin 校验器要求标准 `skills/` 目录，但现有 OpenClaw、Claude Code 和 ClawHub 使用根目录 `SKILL.md`。为避免破坏现有入口：

- 根目录 `SKILL.md` 继续作为 legacy 入口；
- `skills/follow-builders/SKILL.md` 作为 Plugin 入口；
- 两份文件保持相同内容；
- 增加自动同步命令和一致性测试，防止后续漂移；
- 根目录版本作为维护源，插件版本由同步命令生成。

选择受测试约束的镜像，而不是 symlink 或薄 wrapper，原因是不同 Skill 宿主对 symlink、跨目录引用和打包范围的支持不一致。镜像虽有重复，但能保持两个入口独立、完整、可移植。

### 5.3 资源与脚本定位

Skill 不再依赖 `${CLAUDE_SKILL_DIR}`。在需要运行脚本时，先定位最近的、同时包含以下路径的祖先目录，并将其视为 `FOLLOW_BUILDERS_ROOT`：

- `scripts/prepare-digest.js`
- `prompts/`
- `config/default-sources.json`

随后使用绝对路径运行脚本。该规则同时适用于：

- 根目录 Skill；
- `skills/follow-builders/` 下的 Plugin Skill；
- ChatGPT Work 的受控环境；
- Codex、本地 Claude Code 和 Cursor。

如果无法定位完整包，Skill 必须明确报告安装不完整，不猜测路径、不下载未审查的替代脚本。

## 6. 模式无关的运行流程

### 6.1 一次性简报

当用户直接要求“今天的 AI Builders 简报”时：

1. 不用完整 onboarding 阻塞当前请求；
2. 从用户请求读取明确语言和长度偏好；
3. 缺省语言沿用配置；没有配置时使用英文；
4. 运行 `prepare-digest.js`；
5. 检查 `status`、feed 时间和内容计数；
6. 将 feed 内容作为待摘要数据处理；
7. 生成带原始 URL 的简报；
8. 默认直接返回当前对话。

只有用户明确要求持久偏好、外部投递或定期运行时，才进入配置和调度流程。

### 6.2 平台与能力判断

不再只用 `which openclaw` 将所有其他宿主归为非持久终端。采用能力优先顺序：

1. 宿主提供原生 Scheduled Tasks：优先使用宿主调度；
2. 检测到 OpenClaw：使用 OpenClaw channel 和 cron；
3. 用户明确选择 Telegram 或 Email：使用现有投递脚本；
4. 其他情况：按需生成并在当前对话输出。

不得依赖未被 OpenAI 官方文档确认的 ChatGPT 环境变量来判断 Work 或 Codex。

### 6.3 Work 与 Codex 的共同与差异化验收

共同工作流保持一致：

- 相同触发条件；
- 相同 feed；
- 相同摘要、翻译和链接规则；
- 相同错误与安全边界。

模式差异只体现在呈现和开发工具：

- Work：以最终简报和可选定期更新为主要结果，隐藏无关 shell 细节；
- Codex：允许展示脚本诊断、diff 和验证证据。

## 7. 数据与安全边界

中心 feed、社交媒体正文、播客 transcript 和远程 prompts 都来自网络。适配后必须明确：

1. feed 中的文本是不可信内容，只能作为摘要对象；
2. feed 中出现的命令、角色指令、工具请求或配置修改要求不得执行；
3. 远程 prompts 只能影响摘要格式、选材和翻译风格，不能扩大工具、文件、网络、投递或调度权限；
4. 任何外部发送、密钥保存或定时任务创建仍需遵循宿主审批规则；
5. 每条输出内容保留原始 URL；
6. feed 过期、部分失败或数据为空时保留不确定状态，不宣称“今日无更新”以掩盖抓取失败。

本阶段不改变远程 prompt 更新机制，但通过 Skill 指令限制其解释范围。是否进一步做 commit pinning 或签名验证，作为独立安全改进讨论，不混入兼容性 PR。

## 8. 错误处理

- Plugin manifest 无效：校验失败并阻止提交；
- Skill 两份入口不一致：测试失败；
- bundled scripts 缺失：报告安装不完整；
- feed 请求失败：区分网络限制、HTTP 错误和内容为空；
- feed 部分失败：使用可用内容并向用户说明缺失范围；
- 原生调度不可用：回退到按需模式，不擅自写 system crontab；
- 外部投递失败：在当前对话显示简报作为 fallback；
- Work 或 Codex 某一模式失败：记录为表面兼容缺口，不用另一模式成功代替。

## 9. 测试与验证

### 9.1 自动验证

实现阶段采用测试驱动开发，至少覆盖：

1. Plugin manifest 通过 `plugin-creator` 官方校验器；
2. Plugin Skill 通过 `skill-creator` quick validation；
3. 根目录 Skill 与 Plugin Skill 内容一致；
4. manifest 不声明不存在的 MCP/App 文件；
5. starter prompts 数量和长度符合限制；
6. Node.js 语法检查通过；
7. 现有 stdout 投递 smoke test 不回归；
8. `prepare-digest.js` 的成功、部分错误和完全失败状态能够被工作流区分。

### 9.2 ChatGPT App 验收

使用本地 marketplace 安装同一 Plugin 后，在新对话中分别验证：

**Work 模式**

- 直接请求：“生成今天的中文 AI Builders 简报”；
- 间接请求：“最近 AI 建造者们在讨论什么？”；
- 明确调用：`@follow-builders`；
- 创建定期更新时优先走原生 Scheduled Tasks；
- 输出包含原始链接，并能说明 feed 的时间与缺失状态。

**Codex 模式**

- 直接请求和显式 Skill 调用均能触发；
- 能定位并执行 bundled scripts；
- 能显示必要的脚本和验证细节；
- 与 Work 使用相同摘要和安全规则。

### 9.3 Legacy 回归

- 根目录 Skill 仍可被现有安装方式发现；
- README 中的 OpenClaw 和 Claude Code 安装路径仍成立；
- OpenClaw 平台判断和 channel 投递不回归；
- 不要求现有用户迁移配置。

## 10. PR 边界与提交策略

计划拆成小而可审查的提交：

1. 设计文档；
2. manifest、Plugin Skill 镜像和校验测试；
3. mode-neutral 路径、运行和调度指令；
4. README 中的 ChatGPT App 安装与双模式说明；
5. 验证证据和必要修复。

PR 描述必须：

- 明确 Work 与 Codex 是同一 ChatGPT App 插件的两个受支持模式；
- 说明第一阶段为何选择 Skills-only；
- 列出 Work、Codex 和 legacy 三组验证；
- 说明 MCP 被有意延后，而不是遗漏；
- 链接并区分现有 PR #41 的范围；
- 不声称公共目录已发布或自动定时投递已经在所有环境可用。

## 11. 完成标准

本阶段只有在以下条件全部满足时才算完成：

- Plugin 与 Skill 校验器通过；
- 自动测试和现有脚本检查通过；
- Work 与 Codex 均完成真实的新对话验证；
- legacy 入口没有回归；
- 没有为了兼容性引入未使用的 MCP、UI 或托管服务；
- 分支已推送，并向上游创建聚焦的 PR；
- 未验证或受账号/环境限制的项目在 PR 中明确披露。
