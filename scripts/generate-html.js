#!/usr/bin/env node

/**
 * ============================================================================
 * Follow Builders — HTML Digest Generator
 * ============================================================================
 * Reads the JSON output from prepare-digest.js and generates a styled HTML
 * page using the AI Builders Digest design system.
 *
 * Usage: node generate-html.js [output-path]
 *   Default output: ~/.follow-builders/output/index.html
 * ============================================================================
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DIR = join(homedir(), '.follow-builders');
const OUTPUT_DIR = join(USER_DIR, 'output');
const DEFAULT_OUTPUT = join(OUTPUT_DIR, 'index.html');

// Parse CLI flags
const summariesIdx = process.argv.indexOf('--summaries');
const SUMMARIES_FILE = summariesIdx > -1 ? process.argv[summariesIdx + 1] : null;

// ─── Helpers ───────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  return esc(str).replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateCN(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatDateEN(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function avatarInitials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarImg(handle) {
  return `https://unavatar.io/x/${handle}`;
}

function renderSummaryHTML(text) {
  if (!text) return '';
  let html = esc(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(https?:\/\/[^\s<>"']+)/g,
    '<a class="inline-link" href="$1" target="_blank" rel="noopener">↗</a>');
  return html;
}

// ─── i18n Translations ───────────────────────────────────────

const I18N = {
  sidebarTagline:        { zh: 'AI builder 社区精选日报',   en: 'AI Builders Daily Digest' },
  sidebarNavLabel:       { zh: '本期内容',                 en: 'In This Issue' },
  navBuilders:           { zh: 'X Builder 动态',           en: 'X Builders' },
  navBlogs:              { zh: '官方博客',                 en: 'Official Blogs' },
  navPodcasts:           { zh: '播客',                     en: 'Podcasts' },
  navXArticles:          { zh: 'X 长文',                   en: 'X Articles' },
  switchLangAria:        { zh: '切换语言',                 en: 'Switch Language' },
  switchLangTitle:       { zh: '切换中文/English',         en: 'Switch Chinese/English' },
  tweetsUnit:            { zh: '条推文',                   en: 'tweets' },
  heroTagline:           { zh: 'AI builder 社区每日精选，给真正在 building 的人。',
                           en: 'Daily curated picks from the AI builder community, for those actually building.' },
  statTweets:            { zh: '推文',                     en: 'Tweets' },
  statBlogs:             { zh: '博客',                     en: 'Blogs' },
  statPodcasts:          { zh: '播客',                     en: 'Podcasts' },
  sectionBuilderActivity:{ zh: 'Builder 动态',             en: 'Builder Activity' },
  sectionBuilderDesc:    { zh: '今日活跃 AI builder 及其推文', en: "Today's active AI builders and their posts" },
  buildersUnit:          { zh: '位',                       en: 'builders' },
  sectionXArticles:      { zh: 'X 长文',                   en: 'X Articles' },
  sectionXArticlesDesc:  { zh: 'Builder 深度分享',         en: 'Deep dives from builders' },
  articlesUnit:          { zh: '篇',                       en: 'articles' },
  sectionBlogs:          { zh: '官方博客',                 en: 'Official Blogs' },
  sectionBlogsDesc:      { zh: 'AI 实验室官方更新',        en: 'Official AI lab updates' },
  postsUnit:             { zh: '篇',                       en: 'posts' },
  sectionPodcasts:       { zh: '播客',                     en: 'Podcasts' },
  sectionPodcastsDesc:   { zh: '值得收听的深度对话',       en: 'Deep conversations worth your time' },
  episodesUnit:          { zh: '期',                       en: 'episodes' },
  viewTweet:             { zh: '查看推文',                 en: 'View Tweet' },
  viewTweetN:            { zh: '推文',                     en: 'Tweet' },
  readMore:              { zh: '阅读全文 →',               en: 'Read More →' },
  listen:                { zh: '收听本期 →',               en: 'Listen →' },
  expandText:            { zh: '展开阅读 ▾',               en: 'Expand ▾' },
  collapseText:          { zh: '收起 ▴',                   en: 'Collapse ▴' },
  quotedTweet:           { zh: '↩ 引用推文',               en: '↩ Quoted Tweet' },
  viewAllBuilders:       { zh: '查看全部 N 位 Builder ▾',  en: 'View All N Builders ▾' },
  brandBuilders:         { zh: 'Builders',                 en: 'Builders' },
  brandDigest:           { zh: 'Digest',                   en: 'Digest' },
};

function renderTweetMedia(media, tweetUrl) {
  if (!Array.isArray(media) || media.length === 0) return '';
  const imgs = media.slice(0, 3).map(m => {
    const imgTag = `<img src="${escAttr(m.url || m)}" alt="" loading="lazy" onerror="this.style.display='none'" style="max-height:120px;border-radius:8px;object-fit:cover">`;
    if (tweetUrl) return `<a href="${escAttr(tweetUrl)}" target="_blank" rel="noopener">${imgTag}</a>`;
    return imgTag;
  }).join('');
  return `<div class="bc-media-strip">${imgs}</div>`;
}

function renderQuoteTweetContext(tweet) {
  if (!tweet.isQuote) return '';
  const quoted = tweet.quotedTweet;

  // Build link: prefer quoted tweet URL, fall back to quoting tweet URL
  let quoteUrl = tweet.url || '#';
  if (quoted && quoted.authorHandle && tweet.quotedTweetId) {
    quoteUrl = `https://x.com/${quoted.authorHandle}/status/${tweet.quotedTweetId}`;
  }

  const labelLink = `<a class="qt-label-link" href="${escAttr(quoteUrl)}" target="_blank" rel="noopener"><span data-i18n-zh="↩ 引用推文" data-i18n-en="↩ Quoted Tweet">↩ 引用推文</span></a>`;
  if (quoted && quoted.text) {
    const author = quoted.authorName ? `<span class="qt-author">${esc(quoted.authorName)}</span>` : '';
    return `<blockquote class="quote-tweet-preview"><span class="qt-label">${labelLink}</span>${author}<p class="qt-text">${esc(quoted.text.slice(0, 200))}</p></blockquote>`;
  }
  return `<blockquote class="quote-tweet-preview"><span class="qt-label">${labelLink}</span><p class="qt-text">${esc(tweet.text.slice(0, 160))}</p></blockquote>`;
}

function renderExpandableSection(fullText, previewLen) {
  if (!fullText) return '';
  previewLen = previewLen || 150;
  const needsExpand = fullText.length > previewLen;
  const preview = needsExpand ? fullText.slice(0, previewLen).replace(/\*\*/g, '').trim() + '…' : fullText.replace(/\*\*/g, '');
  const id = 'exp-' + Math.random().toString(36).slice(2, 8);
  if (!needsExpand) return `<p class="exp-content">${renderSummaryHTML(preview)}</p>`;
  return `<div class="expandable" id="${id}">
    <div class="exp-preview">
      <p class="exp-content">${renderSummaryHTML(preview)}</p>
      <button class="exp-toggle" data-i18n-zh="展开阅读 ▾" data-i18n-en="Expand ▾" onclick="var d=document.getElementById('${id}');d.querySelector('.exp-preview').style.display='none';d.querySelector('.exp-full').style.display='block';">展开阅读 ▾</button>
    </div>
    <div class="exp-full" style="display:none;">
      <p class="exp-content">${renderSummaryHTML(fullText.replace(/\*\*/g, '').trim())}</p>
      <button class="exp-toggle" data-i18n-zh="收起 ▴" data-i18n-en="Collapse ▴" onclick="var d=document.getElementById('${id}');d.querySelector('.exp-full').style.display='none';d.querySelector('.exp-preview').style.display='block';">收起 ▴</button>
    </div>
  </div>`;
}

// ─── Builder Card (Featured) ───────────────────────────────

function buildBuilderFeatured(b, idx, summaries, builderArticleMap) {
  const initials = avatarInitials(b.name);
  const handle = b.handle.replace('@', '');
  const tweets = b.tweets || [];

  // Build tweet link data
  let tweetLinks = [];
  if (summaries && summaries[handle] && summaries[handle].summary) {
    const twu = summaries[handle].tweets_with_urls;
    if (Array.isArray(twu) && twu.length > 0) tweetLinks = twu;
  } else {
    tweetLinks = tweets.slice(0, 5).map(t => ({ url: t.url, text: t.text }));
  }

  // Summary text — bilingual when both available
  let summaryZh = '';
  let summaryEn = '';
  if (summaries && summaries[handle] && summaries[handle].summary) {
    summaryZh = summaries[handle].summary;
    summaryEn = summaries[handle].summary_en || '';
  }
  if (!summaryZh && tweets.length > 0) {
    // Fallback: use raw tweet text
    const raw = tweets[0].text.replace(/https:\/\/t\.co\/\w+/g, '').replace(/\n+/g, ' ').trim();
    summaryZh = raw.length > 120 ? raw.slice(0, 120) + '…' : raw;
    summaryEn = summaryZh; // same fallback for EN
  }
  // If EN not explicitly set, fall back to ZH
  if (!summaryEn) summaryEn = summaryZh;

  const tweetButtons = tweetLinks.length > 0
    ? `<div class="bc-tweet-links">${tweetLinks.map((tw, i) => {
        const preview = String(tw.text || '').replace(/https?:\/\/\S+/g, '').replace(/\n+/g, ' ').trim();
        const label = tweetLinks.length > 1 ? `推文 ${i + 1}` : '查看推文';
        return `<a class="bc-tweet-btn" href="${escAttr(tw.url)}" target="_blank" rel="noopener" title="${escAttr(preview.slice(0, 80))}">↗ ${label}</a>`;
      }).join('')}</div>`
    : '';

  const firstMedia = tweets.find(t => t.media && t.media.length > 0);
  const mediaStrip = firstMedia ? renderTweetMedia(firstMedia.media, firstMedia.url) : '';
  const firstQuote = tweets.find(t => t.isQuote);
  const quoteBlock = firstQuote ? renderQuoteTweetContext(firstQuote) : '';

  // X Article cross-reference
  var handleLower3 = handle.toLowerCase();
  var articleEntries3 = (builderArticleMap || {})[handleLower3] || [];
  var articleButtons3 = '';
  if (articleEntries3.length > 0) {
    articleButtons3 = '<div class="bc-article-links">' + articleEntries3.map(function(a) {
      return '<a class="bc-article-btn" href="' + escAttr(a.url || a.tweetUrl || '#') + '" target="_blank" rel="noopener">' + esc(a.title || 'X Article') + '</a>';
    }).join('') + '</div>';
  }
  if (articleEntries3.length > 0 && articleEntries3[0].title) {
    var artTitle3 = articleEntries3[0].title;
    if (summaryZh && summaryZh.indexOf(artTitle3) < 0 && summaryZh.indexOf('X 长文') < 0) {
      summaryZh = 'X ' + artTitle3 + '. ' + summaryZh;
      if (summaryEn) summaryEn = 'X Article "' + artTitle3 + '". ' + summaryEn;
    }
  }

  return `<article class="builder-card-rich">
    <div class="bc-header">
      <img class="bc-avatar" src="${escAttr(avatarImg(handle))}" alt="${esc(b.name)} avatar" loading="lazy"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <div class="bc-avatar-fallback" style="display:none;" aria-hidden="true">${esc(initials)}</div>
      <div>
        <div class="bc-name">${esc(b.name)} <span class="bc-handle">@${esc(handle)}</span></div>
        <div class="bc-role">${esc(b.bio ? b.bio.replace(/https?:\/\/\S+/g, '').trim() : 'Builder')}</div>
      </div>
    </div>
    <p class="bi-zh bc-summary">${renderSummaryHTML(summaryZh)}</p>
    <p class="bi-en bc-summary">${renderSummaryHTML(summaryEn)}</p>
    ${mediaStrip}
    ${quoteBlock}
    ${tweetButtons}
    ${articleButtons3}
  </article>`;
}

// ─── Builder Row (Compact) ─────────────────────────────────

function buildBuilderCompact(b, summaries, builderArticleMap) {
  const initials = avatarInitials(b.name);
  const handle = b.handle.replace('@', '');
  const tweets = b.tweets || [];
  const tweet = tweets[0] || null;

  let summaryZh = '';
  let summaryEn = '';
  if (summaries && summaries[handle] && summaries[handle].summary) {
    summaryZh = summaries[handle].summary.replace(/\*\*/g, '').trim();
    summaryEn = (summaries[handle].summary_en || '').replace(/\*\*/g, '').trim();
  } else if (tweet) {
    const raw = tweet.text.replace(/https:\/\/t\.co\/\w+/g, '').replace(/\n+/g, ' ').trim().slice(0, 100);
    summaryZh = raw;
    summaryEn = raw;
  }
  if (!summaryEn) summaryEn = summaryZh;

  const tweetButtons = tweets.slice(0, 5).map((t, i) => {
    const label = tweets.length > 1 ? `推文 ${i + 1}` : '推文';
    return `<a class="bc-tweet-btn" href="${escAttr(t.url)}" target="_blank" rel="noopener" title="${escAttr((t.text || '').slice(0, 80))}">↗ ${label}</a>`;
  }).join('');

  // X Article cross-reference
  var handleLowerCp = handle.toLowerCase();
  var articleEntriesCp = (builderArticleMap || {})[handleLowerCp] || [];
  var articleButtonsCp2 = '';
  if (articleEntriesCp.length > 0) {
    articleButtonsCp2 = articleEntriesCp.map(function(a) {
    }).join('');
  }

  return `<a class="builder-compact-row" href="${escAttr(tweet ? tweet.url : '#')}" target="_blank" rel="noopener" aria-label="${esc(b.name)} - view on X">
    <img class="bcr-avatar" src="${escAttr(avatarImg(handle))}" alt="" loading="lazy"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
    <div class="bcr-avatar-fallback" style="display:none;" aria-hidden="true">${esc(initials)}</div>
    <div class="bcr-info"><span class="bcr-name">${esc(b.name)}</span> <span class="bcr-handle">@${esc(handle)}</span>
      · <span class="bcr-role">${esc(b.bio ? b.bio.replace(/https?:\/\/\S+/g, '').trim() : '')}</span></div>
    <span class="bcr-summary bi-zh">${esc(summaryZh)}</span>
    <span class="bcr-summary bi-en">${esc(summaryEn)}</span>
    <span class="bcr-links">${tweetButtons}${articleButtonsCp2}</span>
  </a>`;
}

// ─── Blog Card ─────────────────────────────────────────────

function buildBlogCard(blog, blogSummary) {
  const summaryZh = blogSummary?.summary_zh || null;
  const summaryEn = blogSummary?.summary_en || null;

  const zhBlock = summaryZh
    ? renderExpandableSection(summaryZh, 150)
    : `<p class="blog-summary bi-zh">${esc((blog.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 200) + '…')}</p>`;

  const enBlock = summaryEn
    ? `<div class="bi-en">${renderExpandableSection(summaryEn, 150)}</div>`
    : (summaryZh ? '' : `<p class="blog-summary bi-en">${esc((blog.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 200) + '…')}</p>`);

  return `<article class="blog-card">
    <div class="blog-body">
      <span class="blog-source-tag">${esc(blog.name)}</span>
      <h3>${esc(blog.title)}</h3>
      ${zhBlock}
      ${enBlock}
      <a class="blog-link" href="${escAttr(blog.url)}" target="_blank" rel="noopener"><span data-i18n-zh="阅读全文 →" data-i18n-en="Read More →">阅读全文 →</span></a>
    </div>
  </article>`;
}

// ─── Podcast Card ──────────────────────────────────────────

function buildPodcastCard(podcast, podcastSummary) {
  const summaryZh = podcastSummary?.summary_zh || null;
  const summaryEn = podcastSummary?.summary_en || null;

  const zhBlock = summaryZh
    ? renderExpandableSection(summaryZh, 200)
    : `<p class="pc-summary bi-zh">${esc((podcast.transcript || '').replace(/Speaker \d \| [\d:]+\n/g, '').trim().slice(0, 500) + '…')}</p>`;

  const enBlock = summaryEn
    ? `<div class="bi-en">${renderExpandableSection(summaryEn, 200)}</div>`
    : (summaryZh ? '' : `<p class="pc-summary bi-en">${esc((podcast.transcript || '').replace(/Speaker \d \| [\d:]+\n/g, '').trim().slice(0, 500) + '…')}</p>`);

  return `<article class="podcast-card">
    <div class="pc-cover-wrap">
      <div class="pc-cover" style="background:linear-gradient(135deg,#f97316,#ec4899);border-radius:12px;width:120px;height:120px;display:flex;align-items:center;justify-content:center;font-size:48px;color:#fff;">🎙</div>
    </div>
    <div class="pc-body">
      <span class="pc-source">${esc(podcast.name)}</span>
      <h3>${esc(podcast.title)}</h3>
      ${zhBlock}
      ${enBlock}
      <a class="pc-link" href="${escAttr(podcast.url)}" target="_blank" rel="noopener"><span data-i18n-zh="收听本期 →" data-i18n-en="Listen →">收听本期 →</span></a>
    </div>
  </article>`;
}

// ─── X Article Card ────────────────────────────────────────

function buildXArticleCard(entry, xArticleSummary) {
  const handle = entry.handle.replace('@', '');
  const article = entry.article || {};

  const summaryZh = xArticleSummary?.summary_zh || null;
  const summaryEn = xArticleSummary?.summary_en || null;

  let zhHtml, enHtml;
  if (summaryZh) {
    zhHtml = `<p class="article-summary bi-zh">${renderSummaryHTML(summaryZh)}</p>`;
    enHtml = summaryEn
      ? `<p class="article-summary bi-en">${renderSummaryHTML(summaryEn)}</p>`
      : '';
  } else {
    const fallback = article.text
      ? article.text.replace(/\*\*/g, '').replace(/\n+/g, ' ').trim().slice(0, 300) + '…'
      : (article.url ? `X 长文 (${article.url.replace(/https?:\/\/(x\.com|twitter\.com)\//, '').slice(0, 40)})` : '点击链接阅读完整文章');
    zhHtml = `<p class="article-summary bi-zh">${esc(fallback)}</p>`;
    enHtml = `<p class="article-summary bi-en">${esc(article.text ? fallback : 'Click to read the full X article')}</p>`;
  }

  return `<article class="article-card">
    <div class="bc-header">
      <img class="bc-avatar" src="${escAttr(avatarImg(handle))}" alt="${esc(entry.name)}" loading="lazy"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <div class="bc-avatar-fallback" style="display:none;" aria-hidden="true">${esc(avatarInitials(entry.name))}</div>
      <div>
        <div class="bc-name">${esc(entry.name)} <span class="bc-handle">@${esc(handle)}</span></div>
        <div class="bc-role">${esc((entry.bio || '').replace(/https?:\/\/\S+/g, '').trim())}</div>
      </div>
    </div>
    <h3 class="article-title">${esc(article.title || '')}</h3>
    ${zhHtml}
    ${enHtml}
    <a class="article-link" href="${escAttr(article.url || '#')}" target="_blank" rel="noopener"><span data-i18n-zh="阅读全文 →" data-i18n-en="Read More →">阅读全文 →</span></a>
  </article>`;
}

// ─── Main Generator ────────────────────────────────────────

async function generate() {
  // Step 1: Run prepare-digest.js to get fresh data
  const scriptDir = join(__dirname);
  let raw;
  try {
    raw = execSync(`node ${join(scriptDir, 'prepare-digest.js')} 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 60000
    });
  } catch (err) {
    console.error('Failed to run prepare-digest.js:', err.message);
    process.exit(1);
  }

  const data = JSON.parse(raw);
  if (data.status !== 'ok') {
    console.error('prepare-digest returned error status');
    process.exit(1);
  }

  const { x: builders, blogs, podcasts, stats, config, xArticles } = data;

  // Load Chinese summaries if --summaries flag provided
  let builderSummaries = null;
  let blogSummaries = [];
  let podcastSummaries = [];
  let xArticleSummaries = [];
  if (SUMMARIES_FILE) {
    try {
      const summariesRaw = await readFile(SUMMARIES_FILE, 'utf-8');
      const parsed = JSON.parse(summariesRaw);
      if (parsed.builders) {
        builderSummaries = parsed.builders;
        blogSummaries = parsed.blogs || [];
        podcastSummaries = parsed.podcasts || [];
        xArticleSummaries = parsed.xArticles || [];
      } else {
        builderSummaries = parsed;
      }
      console.log(`Loaded summaries: ${Object.keys(builderSummaries || {}).length} builders, ${blogSummaries.length} blogs, ${podcastSummaries.length} podcasts, ${xArticleSummaries.length} xArticles`);
    } catch (err) {
      console.error('Failed to load summaries file:', err.message);
    }
  }

  // Build handle→summary map for X Articles
  // Build handle-to-articles cross-reference map
  const builderArticleMap = {};
  for (const xa of (xArticles || [])) {
    const h = (xa.handle || '').replace('@', '').toLowerCase();
    if (!h) continue;
    if (!builderArticleMap[h]) builderArticleMap[h] = [];
    builderArticleMap[h].push({
      title: (xa.article || {}).title || '',
      url: (xa.article || {}).url || '',
      tweetUrl: xa.tweetUrl || null
    });
  }

  const xArticleSummaryMap = {};
  for (const xas of xArticleSummaries) {
    xArticleSummaryMap[xas.handle.replace('@', '')] = xas;
  }

  // Determine output path — skip --summaries flag and its value
  let outputPath = DEFAULT_OUTPUT;
  for (const arg of process.argv) {
    if (arg.endsWith('.html') || arg.endsWith('.htm')) {
      outputPath = arg;
      break;
    }
  }
  await mkdir(dirname(outputPath), { recursive: true });

  // Build date
  const today = new Date();
  const dateCN = formatDateCN(today);
  const dateEN = formatDateEN(today);
  const dateISO = formatDate(today);

  // Featured builders (top 6)
  const featured = builders.slice(0, 6).map((b, i) => buildBuilderFeatured(b, i, builderSummaries, builderArticleMap)).join('\n');

  // Remaining builders (same card format)
  const remaining = builders.slice(6).map((b, i) => buildBuilderFeatured(b, i + 6, builderSummaries, builderArticleMap)).join('\n');
  const compactSection = remaining
    ? `<details class="view-all-wrapper">
        <summary data-i18n-zh="查看全部 ${stats.xBuilders} 位 Builder ▾" data-i18n-en="View All ${stats.xBuilders} Builders ▾">查看全部 ${stats.xBuilders} 位 Builder ▾</summary>
        <div class="builder-featured-grid">${remaining}</div>
       </details>`
    : '';

  // X Articles
  const xArticlesList = xArticles || [];
  const articleCards = xArticlesList.map(a => {
    const h = (a.handle || '').replace('@', '');
    return buildXArticleCard(a, xArticleSummaryMap[h] || null);
  }).join('\n');
  const hasArticles = xArticlesList.length > 0;
  const articleSection = hasArticles
    ? `<section class="section-panel" id="section-x-articles" aria-labelledby="articles-heading">
        <div class="section-panel-header">
          <div class="section-icon icon-blog" aria-hidden="true">📄</div>
          <h2 id="articles-heading"><span data-i18n="sectionXArticles">X 长文</span></h2>
          <span class="section-desc"><span data-i18n="sectionXArticlesDesc">Builder 深度分享</span></span>
          <span class="section-badge">${stats.xArticles || xArticlesList.length} <span data-i18n="articlesUnit">篇</span></span>
        </div>
        <div class="article-grid">${articleCards}</div>
       </section>`
    : '';
  const articlesNav = hasArticles
    ? `\n                <a href="#section-x-articles" class="nav-x">📄 <span data-i18n="navXArticles">X 长文</span> <span class="nav-badge">${stats.xArticles || xArticlesList.length}</span></a>`
    : '';

  // Blogs
  const blogCards = blogs.map((b, i) => buildBlogCard(b, blogSummaries[i] || null)).join('\n');

  // Podcasts
  const podcastCards = podcasts.map((p, i) => buildPodcastCard(p, podcastSummaries[i] || null)).join('\n');

  // Build the full HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Builders Digest — ${dateISO}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        :root {
            --bg: #050711;
            --bg-2: #080d1a;
            --surface: rgba(15, 23, 42, 0.72);
            --surface-solid: #101827;
            --surface-2: rgba(30, 41, 59, 0.64);
            --border: rgba(148, 163, 184, 0.22);
            --border-strong: rgba(148, 163, 184, 0.36);
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --text-soft: #cbd5e1;
            --blue: #3b82f6;
            --cyan: #22d3ee;
            --violet: #8b5cf6;
            --green: #22c55e;
            --orange: #f97316;
            --pink: #ec4899;
            --x-accent: #3b82f6;
            --blog-accent: #22c55e;
            --podcast-accent: #f97316;
            --glow-blue: rgba(59, 130, 246, 0.25);
            --glow-violet: rgba(139, 92, 246, 0.22);
            --glow-green: rgba(34, 197, 94, 0.18);
            --glow-orange: rgba(249, 115, 22, 0.2);
            --radius-sm: 12px;
            --radius-md: 18px;
            --radius-lg: 22px;
            --radius-xl: 24px;
            --sidebar-w: 268px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        body {
            font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg);
            background-image:
                radial-gradient(ellipse 80% 60% at 50% -8%, rgba(139, 92, 246, 0.08) 0%, transparent 70%),
                radial-gradient(ellipse 60% 50% at 85% 15%, rgba(59, 130, 246, 0.06) 0%, transparent 65%),
                radial-gradient(ellipse 40% 60% at 15% 60%, rgba(34, 211, 238, 0.04) 0%, transparent 70%);
            color: var(--text);
            line-height: 1.8;
            min-height: 100vh;
        }

                .top-header {
            display: flex; align-items: center; gap: 14px;
            max-width: 1400px; margin: 0 auto; padding: 12px 24px;
            position: sticky; top: 0; z-index: 100;
            background: rgba(5, 7, 17, 0.85); backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            border-bottom: 1px solid var(--border);
        }
        .header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .header-left .brand-icon {
            width: 32px; height: 32px; border-radius: 7px; flex-shrink: 0;
            background: linear-gradient(135deg, #8b5cf6, #3b82f6);
            display: flex; align-items: center; justify-content: center;
            font-weight: 800; font-size: 12px; color: #fff;
            box-shadow: 0 0 16px rgba(139, 92, 246, 0.3);
        }
        .header-brand { display: flex; flex-direction: column; min-width: 0; }
        .header-title { font-weight: 700; font-size: 14px; color: var(--text); letter-spacing: -0.2px; }
        .header-date { font-size: 10px; color: var(--text-muted); }
        .header-nav { display: flex; gap: 4px; flex-shrink: 0; }
        .header-nav a {
            display: flex; align-items: center; gap: 4px;
            padding: 5px 8px; border-radius: 6px; text-decoration: none;
            color: var(--text-soft); font-size: 11px; font-weight: 500;
            border: 1px solid transparent; transition: all 0.2s; white-space: nowrap;
        }
        .header-nav a:hover { background: var(--surface-2); border-color: var(--border); color: var(--text); }
        .header-nav .nav-badge {
            font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 100px;
            background: var(--surface-solid); border: 1px solid var(--border); color: var(--text-muted);
            font-family: 'JetBrains Mono', monospace;
        }
        .header-nav a.nav-x .nav-badge { border-color: rgba(59, 130, 246, 0.4); color: var(--blue); }
        .header-nav a.nav-podcast .nav-badge { border-color: rgba(249, 115, 22, 0.4); color: var(--orange); }

        .lang-toggle {
            display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0;
            background: var(--surface-2); border: 1px solid var(--border);
            border-radius: 100px; padding: 2px; cursor: pointer;
            font-size: 10px; font-weight: 600; font-family: 'JetBrains Mono',monospace;
            color: var(--text-muted); transition: all 0.2s; user-select: none;
        }
        .lang-toggle:hover { border-color: var(--border-strong); color: var(--text); }
        .lang-toggle .lt-option { padding: 3px 8px; border-radius: 100px; transition: all 0.2s; }
        .lang-toggle .lt-option.active { background: var(--violet); color: #fff; box-shadow: 0 0 10px rgba(139, 92, 246, 0.3); }

        .main-grid {
            max-width: 1400px; margin: 0 auto; padding: 14px 24px 48px;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
            gap: 12px;
        }
        .main-grid > .section-panel { grid-column: 1 / -1; }
        .main-grid > .section-panel#section-x { grid-column: 1 / -1; }
        .main-grid > .section-panel#section-blogs { grid-column: 1 / -1; }
        .main-grid > .section-panel#section-podcast { grid-column: 1 / -1; }

        .hero-compact {
            text-align: center; padding: 24px 24px 8px; grid-column: 1 / -1;
        }
        .hero-compact .hero-badge {
            display: inline-flex; align-items: center; gap: 6px;
            background: var(--surface-2); border: 1px solid var(--border);
            border-radius: 100px; padding: 4px 12px;
            font-size: 10px; font-weight: 600; color: var(--violet);
            letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 8px;
        }
        .hero-compact .hero-badge::before {
            content: ''; width: 5px; height: 5px; border-radius: 50%;
            background: var(--green); animation: heroPulse 2s ease-in-out infinite;
        }
        @keyframes heroPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .hero-compact .hero-title {
            font-size: clamp(24px, 3.5vw, 36px); font-weight: 800; letter-spacing: -0.8px; line-height: 1.1;
            background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, #94a3b8 100%);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
            margin-bottom: 4px;
        }
        .hero-compact .hero-subtitle { font-size: 12px; color: var(--text-muted); max-width: 480px; margin: 0 auto; }

        .section-panel {        .section-panel {
            background: var(--surface); backdrop-filter: blur(18px);
            border: 1px solid var(--border); border-radius: var(--radius-lg);
            padding: 24px 24px 20px; display: flex; flex-direction: column; gap: 16px;
        }
        .section-panel-header { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
        .section-panel-header .section-icon {
            width: 32px; height: 32px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font-size: 15px; font-weight: 700; flex-shrink: 0;
        }
        .section-icon.icon-x { background: linear-gradient(135deg,#3b82f6,#8b5cf6); color: #fff; }
        .section-icon.icon-blog { background: linear-gradient(135deg,#22c55e,#22d3ee); color: #000; }
        .section-icon.icon-podcast { background: linear-gradient(135deg,#f97316,#ec4899); color: #fff; }
        .section-panel-header h2 { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; color: var(--text); }
        .section-panel-header .section-desc { font-size: 12px; color: var(--text-muted); flex: 1; }
        .section-panel-header .section-badge {
            font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 100px;
            background: var(--surface-2); border: 1px solid var(--border); color: var(--text-muted);
            font-family: 'JetBrains Mono',monospace; white-space: nowrap;
        }

        .builder-featured-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; }
        .builder-card-rich {
            background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md);
            padding: 18px 20px; transition: all 0.2s; display: flex; flex-direction: column; gap: 10px;
        }
        .builder-card-rich:hover { border-color: rgba(59,130,246,0.45); box-shadow: 0 0 22px rgba(59,130,246,0.1); transform: translateY(-1px); }
        .builder-card-rich .bc-header { display: flex; align-items: center; gap: 10px; }
        .builder-card-rich .bc-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); flex-shrink: 0; background: var(--surface-solid); }
        .builder-card-rich .bc-avatar-fallback { width:40px;height:40px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;background:var(--surface-solid);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--text-muted); }
        .builder-card-rich .bc-name { font-weight: 700; font-size: 14px; color: var(--text); letter-spacing: -0.2px; }
        .builder-card-rich .bc-handle { font-size: 12px; color: var(--text-muted); font-weight: 400; }
        .builder-card-rich .bc-role { font-size: 11px; color: var(--text-muted); font-weight: 500; }
        .builder-card-rich .bc-summary { font-size: 13px; color: var(--text-soft); line-height: 1.6; }
        .builder-card-rich .bc-links { display: flex; flex-wrap: wrap; gap: 5px; }
        .bc-link {
            display: inline-flex; align-items: center; gap: 3px; padding: 4px 10px;
            background: var(--surface-solid); border: 1px solid var(--border); border-radius: 6px;
            font-size: 10px; color: var(--blue); text-decoration: none; font-family: 'JetBrains Mono',monospace; transition: all 0.2s;
        }
        .bc-link:hover { border-color: var(--blue); background: rgba(59,130,246,0.1); color: var(--cyan); }

        .bc-tweet-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
        .bc-tweet-btn {
            display: inline-flex; align-items: center; gap: 3px; padding: 4px 10px;
            background: var(--surface-solid); border: 1px solid var(--border); border-radius: 6px;
            font-size: 10px; color: var(--blue); text-decoration: none;
            font-family: 'JetBrains Mono',monospace; transition: all 0.2s;
        }
        .bc-tweet-btn:hover { border-color: var(--blue); background: rgba(59,130,246,0.1); color: var(--cyan); }

        .bc-article-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
        .bc-article-btn {
            display: inline-flex; align-items: center; gap: 3px; padding: 4px 10px;
            background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.28); border-radius: 6px;
            font-size: 10px; color: var(--green); text-decoration: none;
            font-family: inherit; transition: all 0.2s;
        }
        .bc-article-btn:hover { border-color: var(--green); background: rgba(34,197,94,0.14); color: #4ade80; }

        .inline-link {
            color: var(--blue); text-decoration: none;
            font-size: 11px; vertical-align: super;
            transition: color 0.15s; margin: 0 2px;
        }
        .inline-link:hover { color: var(--cyan); }

        .bc-media-strip { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
        .bc-media-strip a { display: contents; }
        .bc-media-strip img { border-radius: 8px; max-height: 120px; object-fit: cover; border: 1px solid var(--border); transition: border-color 0.2s; }
        .bc-media-strip img:hover { border-color: var(--border-strong) !important; }

        .quote-tweet-preview {
            border-left: 2px solid var(--border); padding: 6px 10px; margin: 6px 0;
            border-radius: 0 8px 8px 0; background: rgba(148,163,184,0.04);
            font-size: 11px; color: var(--text-muted);
        }
        .qt-label { font-size: 9px; font-weight: 700; color: var(--violet); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px; }
        .qt-label-link { color: var(--violet); text-decoration: none; transition: color 0.15s; }
        .qt-label-link:hover { color: var(--blue); text-decoration: underline; }
        .qt-author { font-weight: 600; color: var(--text-soft); font-size: 11px; }
        .qt-text { margin-top: 2px; line-height: 1.5; }
        .qt-badge { font-size: 9px; font-weight: 600; color: var(--violet); background: rgba(139,92,246,0.1); padding: 2px 6px; border-radius: 4px; }

        .exp-content { font-size: 13px; color: var(--text-soft); line-height: 1.8; }
        .exp-toggle {
            background: none; border: none; color: var(--blue); cursor: pointer;
            font-size: 12px; font-weight: 600; padding: 4px 0; font-family: inherit;
            transition: color 0.15s; margin-top: 4px;
        }
        .exp-toggle:hover { color: var(--cyan); }

        .article-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; }
        .article-card {
            background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md);
            padding: 18px 20px; transition: all 0.2s; display: flex; flex-direction: column; gap: 10px;
        }
        .article-card:hover { border-color: rgba(34,197,94,0.45); box-shadow: 0 0 22px rgba(34,197,94,0.08); transform: translateY(-1px); }
        .article-card .bc-header { display: flex; align-items: center; gap: 10px; }
        .article-card .bc-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); flex-shrink: 0; background: var(--surface-solid); }
        .article-card .bc-avatar-fallback { width:36px;height:36px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;background:var(--surface-solid);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--text-muted); }
        .article-card .bc-name { font-weight: 700; font-size: 13px; color: var(--text); letter-spacing: -0.2px; }
        .article-card .bc-handle { font-size: 11px; color: var(--text-muted); font-weight: 400; }
        .article-card .bc-role { font-size: 10px; color: var(--text-muted); font-weight: 500; }
        .article-card .article-title { font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; line-height: 1.35; }
        .article-card .article-summary { font-size: 12px; color: var(--text-muted); line-height: 1.6; }        .article-card .article-link { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--green); text-decoration: none; font-weight: 600; transition: opacity 0.2s; margin-top: auto; }
        .article-card .article-link:hover { opacity: 0.7; }

        .builders-compact { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
        .builder-compact-row {
            display: flex; align-items: center; gap: 10px; padding: 10px 14px;
            background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
            transition: border-color 0.2s; text-decoration: none; color: inherit; flex-wrap: wrap;
        }
        .builder-compact-row:hover { border-color: var(--border-strong); }
        .builder-compact-row .bcr-avatar { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--border); flex-shrink: 0; background: var(--surface-solid); }
        .builder-compact-row .bcr-avatar-fallback { width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);flex-shrink:0;background:var(--surface-solid);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:var(--text-muted); }
        .builder-compact-row .bcr-info { flex: 1; min-width: 0; }
        .builder-compact-row .bcr-name { font-weight: 600; font-size: 13px; color: var(--text); letter-spacing: -0.2px; }
        .builder-compact-row .bcr-handle { font-size: 11px; color: var(--text-muted); }
        .builder-compact-row .bcr-role { font-size: 11px; color: var(--text-muted); }
        .builder-compact-row .bcr-summary { font-size: 11px; color: var(--text-muted); line-height: 1.4; flex-basis: 100%; margin-top: 2px; }
        .builder-compact-row .bcr-links { display: flex; gap: 4px; flex-wrap: wrap; flex-shrink: 0; }

        .view-all-wrapper { margin-top: 4px; }
        .view-all-wrapper>summary {
            cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
            padding: 9px 16px; border-radius: 10px; border: 1px solid var(--border);
            background: var(--surface-2); color: var(--text-soft); font-size: 12px;
            font-weight: 600; transition: all 0.2s; user-select: none; font-family: 'Inter',sans-serif;
        }
        .view-all-wrapper>summary:hover { border-color: var(--border-strong); color: var(--text); }

        .blog-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
        .blog-card {
            background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md);
            overflow: hidden; transition: all 0.2s; display: flex; flex-direction: column;
        }
        .blog-card:hover { border-color: rgba(34,197,94,0.45); box-shadow: 0 0 22px rgba(34,197,94,0.08); transform: translateY(-1px); }
        .blog-card .blog-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .blog-card .blog-source-tag { font-size: 10px; font-weight: 700; color: var(--green); text-transform: uppercase; letter-spacing: 0.5px; }
        .blog-card h3 { font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; line-height: 1.35; }
        .blog-card .blog-summary { font-size: 12px; color: var(--text-muted); line-height: 1.55; flex:1; }        .blog-card .blog-link { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--green); text-decoration: none; font-weight: 600; transition: opacity 0.2s; margin-top: auto; }
        .blog-card .blog-link:hover { opacity: 0.7; }

        .podcast-card {
            background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md);
            overflow: hidden; transition: all 0.2s; display: flex; gap: 0;
        }
        .podcast-card:hover { border-color: rgba(249,115,22,0.45); box-shadow: 0 0 22px rgba(249,115,22,0.08); transform: translateY(-1px); }
        .podcast-card .pc-cover-wrap {
            flex-shrink: 0; width: 160px; min-height: 180px;
            position: relative; background: var(--surface-solid);
            border-right: 1px solid var(--border);
            display: flex; align-items: center; justify-content: center;
        }
        .podcast-card .pc-body { padding: 20px 22px; flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .podcast-card .pc-source { font-size: 11px; font-weight: 700; color: var(--orange); text-transform: uppercase; letter-spacing: 0.5px; }
        .podcast-card h3 { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.2px; line-height: 1.35; }
        .podcast-card .pc-summary { font-size: 12px; color: var(--text-muted); line-height: 1.6; }        .podcast-card .pc-link { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--orange); text-decoration: none; font-weight: 600; transition: opacity 0.2s; margin-top: auto; }
        .podcast-card .pc-link:hover { opacity: 0.7; }

        .page-footer { text-align: center; padding: 24px; border-top: 1px solid var(--border); margin-top: 8px; font-size: 11px; color: var(--text-muted); }
        .page-footer a { color: var(--violet); text-decoration: none; font-weight: 500; }
        .page-footer a:hover { text-decoration: underline; }

        @media (max-width: 1100px) {
            .main-grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); padding: 10px 12px 32px; }
            .top-header { padding: 8px 12px; }
            .blog-grid { grid-template-columns: repeat(2,1fr); }
            .builder-featured-grid { grid-template-columns: 1fr 1fr; }
            .podcast-card { flex-direction: column; }
            .podcast-card .pc-cover-wrap { width:100%; min-height:120px; border-right:none; border-bottom:1px solid var(--border); }
        }

        @media (max-width: 767px) {
            .main-grid { grid-template-columns: 1fr; padding: 6px 6px 24px; gap: 6px; }
            .top-header { padding: 6px 8px; gap: 6px; }
            .header-nav { display: none; }
            .hero-compact { padding: 14px 8px 6px; }
            .hero-compact .hero-title { font-size: 20px; }
            .builder-featured-grid { grid-template-columns: 1fr; }
            .blog-grid { grid-template-columns: 1fr; }
            .podcast-card { flex-direction: column; }
            .podcast-card .pc-cover-wrap { width:100%; min-height:100px; border-right:none; border-bottom:1px solid var(--border); }
            .podcast-card .pc-body { padding: 14px 16px; }
            .builder-card-rich { padding: 14px 16px; }
        }

        /* Language toggle: hide non-active language */
        body.lang-zh .bi-en { display: none !important; }
        body.lang-en .bi-zh { display: none !important; }

        @media (prefers-reduced-motion: reduce) {
            .hero-badge::before { animation: none; }
            * { transition-duration: 0.01ms !important; }
        }
    </style>
</head>
<body class="lang-zh">
    <!-- TOP HEADER -->
    <header class="top-header">
        <div class="header-left">
            <div class="brand-icon" aria-hidden="true">AI</div>
            <div class="header-brand">
                <span class="header-title"><span data-i18n="brandBuilders">Builders</span> <span data-i18n="brandDigest">Digest</span></span>
                <span class="header-date" data-i18n-zh="${dateCN} · ${stats.totalTweets} 条推文 · ${stats.podcastEpisodes} 期播客" data-i18n-en="${dateEN} · ${stats.totalTweets} tweets · ${stats.podcastEpisodes} episodes">${dateCN} · ${stats.totalTweets} <span data-i18n="tweetsUnit">条推文</span> · ${stats.podcastEpisodes} <span data-i18n="episodesUnit">期播客</span></span>
            </div>
        </div>
        <nav class="header-nav">
            <a href="#section-x" class="nav-x"><span data-i18n="navBuilders">X Builders</span> <span class="nav-badge">${stats.xBuilders}</span></a>${articlesNav}
            <a href="#section-podcast" class="nav-podcast"><span data-i18n="navPodcasts">Podcasts</span> <span class="nav-badge">${stats.podcastEpisodes}</span></a>
        </nav>
        <button class="lang-toggle" onclick="toggleLang()" aria-label="Switch Language" data-i18n-aria="switchLangAria" title="Switch Chinese/English" data-i18n-title="switchLangTitle">
          <span class="lt-option active" id="lt-zh">ZH</span>
          <span class="lt-option" id="lt-en">EN</span>
        </button>
    </header>

    <!-- MAIN GRID -->
    <main class="main-grid">
            <!-- Hero -->
            <section class="hero-compact">
                <div class="hero-badge">Daily Digest</div>
                <h1 class="hero-title">AI Builders Digest</h1>
                <p class="hero-subtitle"><span data-i18n="heroTagline">AI builder community daily picks, for those actually building.</span></p>
            </section>

            <!-- X / Twitter -->
            <section class="section-panel" id="section-x" aria-labelledby="x-heading">
                <div class="section-panel-header">
                    <div class="section-icon icon-x" aria-hidden="true">✕</div>
                    <h2 id="x-heading"><span data-i18n="sectionBuilderActivity">Builder 动态</span></h2>
                    <span class="section-desc"><span data-i18n="sectionBuilderDesc">今日活跃 AI builder 及其推文</span></span>
                    <span class="section-badge">${stats.xBuilders} <span data-i18n="buildersUnit">位</span></span>
                </div>
                <div class="builder-featured-grid">
                    ${featured}
                </div>
                ${compactSection}
            </section>

            ${articleSection}
            <!-- Blogs -->
            <section class="section-panel" id="section-blogs" aria-labelledby="blogs-heading">
                <div class="section-panel-header">
                    <div class="section-icon icon-blog" aria-hidden="true">📝</div>
                    <h2 id="blogs-heading"><span data-i18n="sectionBlogs">官方博客</span></h2>
                    <span class="section-desc"><span data-i18n="sectionBlogsDesc">AI 实验室官方更新</span></span>
                    <span class="section-badge">${stats.blogPosts} <span data-i18n="postsUnit">篇</span></span>
                </div>
                <div class="blog-grid">
                    ${blogCards}
                </div>
            </section>

            <!-- Podcast -->
            <section class="section-panel" id="section-podcast" aria-labelledby="podcast-heading">
                <div class="section-panel-header">
                    <div class="section-icon icon-podcast" aria-hidden="true">🎙</div>
                    <h2 id="podcast-heading"><span data-i18n="sectionPodcasts">播客</span></h2>
                    <span class="section-desc"><span data-i18n="sectionPodcastsDesc">值得收听的深度对话</span></span>
                    <span class="section-badge">${stats.podcastEpisodes} <span data-i18n="episodesUnit">期</span></span>
                </div>
                ${podcastCards}
            </section>
    </main>

    <script>
      // Embedded i18n translations map (populated at build time)
      var I18N = ${JSON.stringify(I18N)};

      function applyLanguage(lang) {
        if (lang === 'en') {
          document.body.classList.replace('lang-zh', 'lang-en');
          document.getElementById('lt-zh').classList.remove('active');
          document.getElementById('lt-en').classList.add('active');
        } else {
          document.body.classList.replace('lang-en', 'lang-zh');
          document.getElementById('lt-en').classList.remove('active');
          document.getElementById('lt-zh').classList.add('active');
        }
        // Force hide non-active language elements (CSS nesting workaround)
        var hideClass = lang === 'en' ? 'bi-zh' : 'bi-en';
        var showClass = lang === 'en' ? 'bi-en' : 'bi-zh';
        document.querySelectorAll('.' + hideClass).forEach(function(el) { el.style.display = 'none'; });
        document.querySelectorAll('.' + showClass).forEach(function(el) { el.style.display = ''; });
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
          var key = el.getAttribute('data-i18n');
          if (I18N[key] && I18N[key][lang]) el.textContent = I18N[key][lang];
        });
        document.querySelectorAll('[data-i18n-zh]').forEach(function(el) {
          var val = el.getAttribute(lang === 'en' ? 'data-i18n-en' : 'data-i18n-zh');
          if (val) el.textContent = val;
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
          var key = el.getAttribute('data-i18n-aria');
          if (I18N[key] && I18N[key][lang]) el.setAttribute('aria-label', I18N[key][lang]);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
          var key = el.getAttribute('data-i18n-title');
          if (I18N[key] && I18N[key][lang]) el.setAttribute('title', I18N[key][lang]);
        });
        document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
      }

      function toggleLang() {
        var next = document.body.classList.contains('lang-zh') ? 'en' : 'zh';
        applyLanguage(next);
        try { localStorage.setItem('digest-lang', next); } catch(e){}
      }

      (function() {
        try {
          var saved = localStorage.getItem('digest-lang') || 'zh';
          applyLanguage(saved);
        } catch(e){}
      })();
    </script>
    <footer class="page-footer">
        <p>Generated by <a href="https://github.com/zarazhangrui/follow-builders" target="_blank" rel="noopener">Follow Builders</a></p>
        <p style="margin-top:6px;">© ${new Date().getFullYear()} AI Builders Digest</p>
    </footer>
</body>
</html>`;

  // Write output
  await writeFile(outputPath, html);
  console.log(`HTML digest written to: ${outputPath}`);
  return outputPath;
}

generate().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
