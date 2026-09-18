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
  return /^Source:\s+https?:\/\//.test(line);
}

function isBareUrl(line) {
  return /^https?:\/\//.test(line);
}

function isFooter(line) {
  return /^Generated through the Follow Builders skill: /.test(line) ||
    /^Reply to adjust your settings/.test(line);
}

function formatDigest(text) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const rawLines = normalized.split('\n').map(line => line.replace(/[ \t]+$/g, ''));
  const canonicalLines = rawLines.map(line => (isBareUrl(line) ? `Source: ${line}` : line));

  const compacted = [];
  for (const line of canonicalLines) {
    if (line.trim() === '') {
      if (compacted.length === 0 || compacted[compacted.length - 1] === '') {
        continue;
      }
      compacted.push('');
      continue;
    }
    compacted.push(line);
  }

  const spaced = [];
  for (const line of compacted) {
    const blockStart = isSectionHeading(line) || isItemTitle(line) || isFooter(line);
    const topLine = isHeader(line);

    if (line === '') {
      if (spaced.length > 0 && spaced[spaced.length - 1] !== '') {
        spaced.push('');
      }
      continue;
    }

    if (!topLine && blockStart && spaced.length > 0 && spaced[spaced.length - 1] !== '') {
      spaced.push('');
    }

    if (isSourceLine(line) && spaced[spaced.length - 1] === '') {
      spaced.pop();
    }

    spaced.push(line);
  }

  const tightened = [];
  for (let i = 0; i < spaced.length; i += 1) {
    const line = spaced[i];
    const prev = tightened[tightened.length - 1];

    if (
      line === '' &&
      isItemTitle(prev || '')
    ) {
      continue;
    }

    if (line === '' && spaced[i + 1] && isSourceLine(spaced[i + 1])) {
      continue;
    }

    tightened.push(line);
  }

  while (tightened[0] === '') tightened.shift();
  while (tightened[tightened.length - 1] === '') tightened.pop();

  const finalLines = [];
  for (let i = 0; i < tightened.length; i += 1) {
    const line = tightened[i];
    const next = tightened[i + 1];

    finalLines.push(line);

    if ((isHeader(line) || isSectionHeading(line)) && next && next !== '') {
      finalLines.push('');
    }
  }

  const deduped = [];
  for (const line of finalLines) {
    if (line === '' && (deduped.length === 0 || deduped[deduped.length - 1] === '')) {
      continue;
    }
    deduped.push(line);
  }

  while (deduped[0] === '') deduped.shift();
  while (deduped[deduped.length - 1] === '') deduped.pop();

  return `${deduped.join('\n')}\n`;
}

const input = await readInput();
process.stdout.write(formatDigest(input));
