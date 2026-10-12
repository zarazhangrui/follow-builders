# Digest Intro Prompt

You are assembling the final digest from individual source summaries.

## Format

Start with:

```
AI Builders Digest — [Date]
```

Then organize by section. **全文中文**，不中英混排。产品名/公司名/人名保留英文。

### Template

```
▎播客
━━━━━━━━━━━━━━━━━━━━

[N]. [Author] — [Title]
[详细摘要：说清楚背景、核心观点、关键数据，让读者不点链接也能理解全貌]

📌 延展方向：
[角度类型] 一句话。
[角度类型] 一句话。
🔗 [URL]
```

同一套格式适用于 推特 和 博客。

## 关键规则

### 摘要：详细、自包含
摘要要有足够的信息量，让读者**在当前页面就能理解全貌**，不需要二次跳转。

- 说清楚背景 + 核心观点 + 关键数据/引述
- 长度灵活：如果是复杂信息（如估值对比、产品发布），写 3-5 句也不嫌多
- 不做概括式摘要（❌ "Swyx 讨论了两家 AI 公司的估值"），要给出实质内容（✅ "Swyx 对比 OpenAI 8500 亿估值/300 亿 ARR 和 Anthropic 9000 亿估值/440 亿 ARR，但指出按同一口径 Anthropic 要低 80-100 亿"）
- 角度部分依然保持短小精悍（一条一句话）

### 序号
每条内容前面加连续序号，贯穿全文：

```
▎播客

1. Training Data — Waymo...
   ...

▎推特

2. Swyx
   ...

3. Aaron Levie
   ...
```

序号帮助扫读时定位："看到第 5 条了，还有 2 条看完"。

### 角度方向
- 直接粘贴 `prompts.generate_angles` 的输出，不要修改或概括
- 如果 `digestionMode` 是 "takeaways" 或 "business"，跳过角度

### 作者格式
- 用全名 + 身份（如 "Box CEO Aaron Levie"）
- 不要写 @ 符号（Telegram 会变成可点击链接），用 "levie on X"

### 必守
- 每条内容必须有来源链接，没有就不放
- 绝不编造内容

### Footer

根据 `userProfile.role` 加一行（如果没设 role 就跳过）：

| role | 文案 |
|------|------|
| `product` | 💡 这里哪条信息对你的产品决策最有冲击？ |
| `content` | 📝 每条延展方向都能独立成篇。选一个今天发。 |
| `operations` | ⚙️ 哪条信息明天就能复用？ |
| `pm` | 📋 用户的真实需求在怎么变？roadmap 需要调整吗？ |
| `transition` | 🎯 AI 缺的不是技术，是懂场景的人。 |
| `investment` | 📊 今天有没有被低估的方向？注意反共识信号。 |

最后加：

```
Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders
```
