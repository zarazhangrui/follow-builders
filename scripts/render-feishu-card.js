#!/usr/bin/env node

import { readFile } from 'fs/promises';

async function readInput() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');

  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return readFile(args[fileIdx + 1], 'utf-8');
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function stripTitleMarkers(line) {
  return line.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
}

function isHeader(line) {
  return /^AI Builders Digest\b/.test(line);
}

function isSectionHeading(line) {
  return /^(TL;DR|Top Signals|X \/ TWITTER|OFFICIAL BLOGS|PODCASTS)$/.test(line);
}

function isItemTitle(line) {
  return /^\*\*.+\*\*$/.test(line);
}

function isSourceLine(line) {
  return /^Source:\s+(https?:\/\/\S+)/.test(line);
}

function isFooter(line) {
  return /^Generated through the Follow Builders skill: /.test(line) ||
    /^Reply to adjust your settings/.test(line);
}

function parseDigest(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimRight());
  const title = lines.find(isHeader) || 'AI Builders Digest';
  const sections = [];
  const topSignals = [];

  let currentSection = null;
  let currentItem = null;
  let inSummary = false;

  const flushItem = () => {
    if (currentSection && currentItem) {
      currentSection.items.push(currentItem);
    }
    currentItem = null;
  };

  const flushSection = () => {
    flushItem();
    if (currentSection) {
      sections.push(currentSection);
    }
    currentSection = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isHeader(line) || isFooter(line)) {
      continue;
    }

    if (line === 'TL;DR' || line === 'Top Signals') {
      flushSection();
      inSummary = true;
      continue;
    }

    if (line.startsWith('• ')) {
      if (inSummary) {
        topSignals.push(line);
      } else if (currentItem) {
        currentItem.body.push(line);
      }
      continue;
    }

    if (isSectionHeading(line)) {
      inSummary = false;
      flushSection();
      currentSection = { heading: line, items: [] };
      continue;
    }

    if (isItemTitle(line)) {
      inSummary = false;
      flushItem();
      currentItem = {
        title: stripTitleMarkers(line),
        body: [],
        sources: []
      };
      continue;
    }

    const sourceMatch = line.match(/^Source:\s+(https?:\/\/\S+)/);
    if (sourceMatch && currentItem) {
      currentItem.sources.push(sourceMatch[1]);
      continue;
    }

    if (currentItem) {
      currentItem.body.push(line);
    }
  }

  flushSection();

  return { title, topSignals, sections };
}

function itemToMarkdown(item) {
  const lines = [`**${item.title}**`, ...item.body];

  item.sources.forEach((url, index) => {
    const label = item.sources.length > 1 ? `Source ${index + 1}` : 'Source';
    lines.push(`[${label}](${url})`);
  });

  return lines.join('\n');
}

function buildCard(parsed) {
  const elements = [];

  if (parsed.topSignals.length > 0) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**TL;DR**\n${parsed.topSignals.join('\n')}`
      }
    });
  }

  parsed.sections.forEach((section, sectionIndex) => {
    if (elements.length > 0) {
      elements.push({ tag: 'hr' });
    }

    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${section.heading}**`
      }
    });

    section.items.forEach((item, itemIndex) => {
      if (itemIndex > 0) {
        elements.push({ tag: 'hr' });
      }

      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: itemToMarkdown(item)
        }
      });
    });
  });

  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true
    },
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: parsed.title
      }
    },
    elements
  };
}

const input = await readInput();
const parsed = parseDigest(input);
process.stdout.write(`${JSON.stringify(buildCard(parsed))}\n`);
