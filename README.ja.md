[English](README.md) | [中文](README.zh-CN.md) | **日本語**

# インフルエンサーではなく、ビルダーをフォローしよう

AI の世界のトップビルダー（研究者、創業者、PM、
実際にものを作っているエンジニア）を追いかけ、彼らの発言を厳選した要約として
届ける、AI を活用したダイジェストです。

**理念：** 情報を受け売りするインフルエンサーではなく、プロダクトを作り、
独自の意見を持つ人をフォローしましょう。

## 受け取れるもの

日次または週次のダイジェストが、お好みのメッセージアプリ（Telegram、Discord、
WhatsApp など）に届きます。内容は次のとおりです。

- トップクラスの AI ポッドキャストの新しいエピソードの要約
- X/Twitter で厳選した 26 人の AI ビルダーによる重要な投稿と知見
- AI 企業の公式ブログ（Anthropic Engineering、Claude Blog）の記事全文
- すべての元コンテンツへのリンク
- 英語、中国語、または 2 か国語併記で利用可能

## クイックスタート

1. エージェント（OpenClaw または Claude Code）にスキルをインストールします
2. 「set up follow builders」と言うか、`/follow-builders` を実行します
3. エージェントが会話形式でセットアップを案内します。設定ファイルを編集する必要はありません

エージェントは次のことを尋ねます。
- ダイジェストを受け取る頻度（日次または週次）と時刻
- 希望する言語
- 配信方法（Telegram、メール、またはチャット内）

API キーは不要です。すべてのコンテンツは一元的に取得されます。
最初のダイジェストは、セットアップ直後に届きます。

## 設定の変更

配信の設定は会話で変更できます。エージェントにこう伝えるだけです。

- 「月曜の朝に届く週次ダイジェストに切り替えて」
- 「言語を中国語に変えて」
- 「要約をもっと短くして」
- 「今の設定を見せて」

ソースの一覧（ビルダーとポッドキャスト）は一元的に管理され、自動で
更新されます。何もしなくても、常に最新のソースを受け取れます。

## 要約のカスタマイズ

このスキルは、平易な英語で書かれたプロンプトファイルで、コンテンツの要約方法を制御します。
カスタマイズの方法は 2 つあります。

**会話で（おすすめ）：**
エージェントに希望を伝えます。「要約をもっと簡潔にして」「実行に移せる
知見に絞って」「もっとくだけた口調にして」など。エージェントがプロンプトを更新してくれます。

**直接編集（上級者向け）：**
`prompts/` フォルダー内のファイルを編集します。
- `summarize-podcast.md` — ポッドキャストのエピソードの要約方法
- `summarize-tweets.md` — X/Twitter の投稿の要約方法
- `summarize-blogs.md` — ブログ記事の要約方法
- `digest-intro.md` — ダイジェスト全体の形式と口調
- `translate.md` — 英語のコンテンツを中国語に翻訳する方法

これらはコードではなく、平易な英語の指示です。変更は次のダイジェストから反映されます。

## デフォルトのソース

### ポッドキャスト（6）
- [Latent Space](https://www.youtube.com/@LatentSpacePod)
- [Training Data](https://www.youtube.com/playlist?list=PLOhHNjZItNnMm5tdW61JpnyxeYH5NDDx8)
- [No Priors](https://www.youtube.com/@NoPriorsPodcast)
- [Unsupervised Learning](https://www.youtube.com/@RedpointAI)
- [The MAD Podcast with Matt Turck](https://www.youtube.com/@DataDrivenNYC)
- [AI & I by Every](https://www.youtube.com/playlist?list=PLuMcoKK9mKgHtW_o9h5sGO2vXrffKHwJL)

### X の AI ビルダー（26）
[Andrej Karpathy](https://x.com/karpathy), [Swyx](https://x.com/swyx), [Josh Woodward](https://x.com/joshwoodward), [Boris Cherny](https://x.com/bcherny), [Thibault Sottiaux](https://x.com/thsottiaux), [Peter Yang](https://x.com/petergyang), [Nan Yu](https://x.com/thenanyu), [Madhu Guru](https://x.com/realmadhuguru), [Amanda Askell](https://x.com/AmandaAskell), [Cat Wu](https://x.com/_catwu), [Thariq](https://x.com/trq212), [Google Labs](https://x.com/GoogleLabs), [Amjad Masad](https://x.com/amasad), [Guillermo Rauch](https://x.com/rauchg), [Alex Albert](https://x.com/alexalbert__), [Aaron Levie](https://x.com/levie), [Ryo Lu](https://x.com/ryolu_), [Garry Tan](https://x.com/garrytan), [Matt Turck](https://x.com/mattturck), [Zara Zhang](https://x.com/zarazhangrui), [Nikunj Kothari](https://x.com/nikunj), [Peter Steinberger](https://x.com/steipete), [Dan Shipper](https://x.com/danshipper), [Aditya Agarwal](https://x.com/adityaag), [Sam Altman](https://x.com/sama), [Claude](https://x.com/claudeai)

### 公式ブログ（2）
- [Anthropic Engineering](https://www.anthropic.com/engineering) — Anthropic チームによる技術的な深掘り記事
- [Claude Blog](https://claude.com/blog) — Claude からのプロダクトの発表と最新情報

## インストール

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

## 必要なもの

- AI エージェント（OpenClaw、Claude Code など）
- インターネット接続（中央のフィードを取得するため）

これだけです。API キーは不要です。すべてのコンテンツ（ブログ記事 + YouTube の文字起こし + X/Twitter の投稿）は
一元的に取得され、毎日更新されます。

## 仕組み

1. 中央のフィードが、すべてのソースの最新コンテンツで毎日更新されます
   （ブログ記事は Web スクレイピング、YouTube の文字起こしは Supadata、X/Twitter は公式 API で取得）
2. エージェントがフィードを取得します。HTTP リクエスト 1 回で、API キーは不要です
3. エージェントが、あなたの設定に沿って生のコンテンツを読みやすい要約にまとめ直します
4. ダイジェストがメッセージアプリに届きます（またはチャット内に表示されます）

出力の例は [examples/sample-digest.md](examples/sample-digest.md) を参照してください。

## プライバシー

- API キーはどこにも送信されません。すべてのコンテンツは一元的に取得されます
- Telegram やメールで配信する場合、それらのキーはローカルの `~/.follow-builders/.env` に保存されます
- スキルが読むのは公開コンテンツ（公開ブログ記事、公開 YouTube 動画、公開 X 投稿）だけです
- 設定、好み、閲覧履歴はあなたのマシンから出ません

## ライセンス

MIT
