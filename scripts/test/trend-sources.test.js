import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateStarVelocity,
  collectGitHubTrends,
  collectHackerNewsTrends,
  collectRedditTrends,
  countRecentStargazers,
  parseAnySearchRedditMarkdown,
  resolveAnySearchCli,
  searchRedditViaAnySearch
} from '../lib/trend-sources.js';
import { createTrendState } from '../lib/trend-state.js';

test('Reddit reports failed when primary and fallback both fail', async () => {
  const primaryError = Object.assign(new Error('HTTP 403 Forbidden'), {
    backend: 'reddit-json',
    httpStatus: 403
  });
  const fallbackError = Object.assign(new Error('HTTP 503 Service Unavailable'), {
    backend: 'arctic-shift',
    httpStatus: 503
  });

  const result = await collectRedditTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    primarySearch: async () => {
      throw primaryError;
    },
    fallbackSearch: async () => {
      throw fallbackError;
    }
  });

  assert.deepEqual(result.items, []);
  assert.equal(result.health.status, 'failed');
  assert.equal(result.health.backend, 'reddit-json->arctic-shift');
  assert.equal(result.health.lastHttpStatus, 503);
  assert.equal(result.health.itemsBeforeFilter, 0);
  assert.equal(result.health.itemsAfterFilter, 0);
  assert.deepEqual(
    result.health.attempts.map(attempt => ({ backend: attempt.backend, httpStatus: attempt.httpStatus })),
    [
      { backend: 'reddit-json', httpStatus: 403 },
      { backend: 'arctic-shift', httpStatus: 503 }
    ]
  );
});

test('Reddit distinguishes a successful empty primary result from failure', async () => {
  const result = await collectRedditTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    primarySearch: async () => ({
      backend: 'anysearch',
      httpStatus: 200,
      items: [],
      itemsBeforeFilter: 6
    }),
    fallbackSearch: async () => {
      throw new Error('fallback should not run');
    }
  });

  assert.deepEqual(result.items, []);
  assert.equal(result.health.status, 'ok_no_new');
  assert.equal(result.health.backend, 'anysearch');
  assert.equal(result.health.lastHttpStatus, 200);
  assert.equal(result.health.itemsBeforeFilter, 6);
  assert.equal(result.health.itemsAfterFilter, 0);
});

test('Reddit preserves Arctic Shift source metadata in machine-readable health', async () => {
  const metadata = {
    official: false,
    uptimeSla: 'none',
    engagementDelayedHours: 36
  };
  const result = await collectRedditTrends({
    primarySearch: async () => {
      throw Object.assign(new Error('format failure'), { backend: 'anysearch' });
    },
    fallbackSearch: async () => ({
      backend: 'arctic-shift',
      httpStatus: 200,
      items: [],
      metadata
    })
  });

  assert.deepEqual(result.health.metadata, metadata);
});

test('GitHub stargazer counting stops when the 24-hour boundary is reached', async () => {
  const calls = [];
  const pages = new Map([
    [null, {
      edges: [
        { starredAt: '2026-07-15T23:00:00.000Z' },
        { starredAt: '2026-07-15T10:00:00.000Z' }
      ],
      pageInfo: { hasNextPage: true, endCursor: 'page-2' }
    }],
    ['page-2', {
      edges: [
        { starredAt: '2026-07-15T00:00:00.000Z' },
        { starredAt: '2026-07-14T23:59:59.000Z' }
      ],
      pageInfo: { hasNextPage: true, endCursor: 'page-3' }
    }]
  ]);

  const result = await countRecentStargazers({
    fullName: 'openai/codex',
    since: new Date('2026-07-15T00:00:00.000Z'),
    fetchPage: async ({ after }) => {
      calls.push(after);
      return pages.get(after);
    },
    maxPages: 5
  });

  assert.equal(result.stars24h, 3);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.partial, false);
  assert.deepEqual(calls, [null, 'page-2']);
});

test('GitHub star velocity uses repo age capped to 2-24 hours', () => {
  const now = new Date('2026-07-16T00:00:00.000Z');
  assert.equal(calculateStarVelocity(12, '2026-07-15T18:00:00.000Z', now), 2);
  assert.equal(calculateStarVelocity(5, '2026-07-15T23:00:00.000Z', now), 2.5);
  assert.equal(calculateStarVelocity(12, '2026-07-14T00:00:00.000Z', now), 0.5);
});

test('GitHub collector merges candidate sources and exposes two 24-hour rankings', async () => {
  const state = createTrendState();
  const metadata = {
    'watch/steady': {
      fullName: 'watch/steady',
      url: 'https://github.com/watch/steady',
      description: 'watched agent repo',
      createdAt: '2025-01-01T00:00:00.000Z',
      pushedAt: '2026-07-15T20:00:00.000Z',
      stars: 900
    },
    'new/rocket': {
      fullName: 'new/rocket',
      url: 'https://github.com/new/rocket',
      description: 'new coding agent',
      createdAt: '2026-07-15T18:00:00.000Z',
      pushedAt: '2026-07-15T22:00:00.000Z',
      stars: 40
    }
  };

  const result = await collectGitHubTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state,
    config: {
      repos: ['watch/steady'],
      discoveryTopics: ['coding-agent'],
      maxCandidates: 10,
      maxItems: 5,
      minStars24h: 1,
      maxGraphqlRequests: 10
    },
    ossCandidates: [{ ...metadata['new/rocket'], window: 'past_week' }],
    searchRepositories: async () => [metadata['new/rocket']],
    getRepository: async fullName => metadata[fullName],
    countStargazers: async ({ fullName }) => ({
      stars24h: fullName === 'watch/steady' ? 20 : 12,
      pagesFetched: 1,
      partial: false
    })
  });

  assert.equal(result.health.status, 'baseline_only');
  assert.equal(result.health.itemsBeforeFilter, 2);
  assert.equal(result.health.itemsAfterFilter, 2);
  assert.deepEqual(result.rankings.byStars24h.map(repo => repo.fullName), [
    'watch/steady',
    'new/rocket'
  ]);
  assert.deepEqual(result.rankings.byVelocity.map(repo => repo.fullName), [
    'new/rocket',
    'watch/steady'
  ]);
  assert.equal(result.rankings.byVelocity[0].starVelocity, 2);
  assert.deepEqual(new Set(result.repos[1].candidateSources), new Set(['ossinsight:past_week', 'github-search:coding-agent']));
});

test('GitHub reports ok_no_new when successful candidates are normally filtered out', async () => {
  const result = await collectGitHubTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state: createTrendState(),
    config: {
      repos: [],
      discoveryTopics: ['coding-agent'],
      maxPushAgeHours: 168
    },
    searchRepositories: async () => [{
      fullName: 'old/inactive',
      url: 'https://github.com/old/inactive',
      createdAt: '2025-01-01T00:00:00.000Z',
      pushedAt: '2026-07-01T00:00:00.000Z',
      stars: 10
    }],
    getRepository: async () => {
      throw new Error('complete search metadata should be reused');
    },
    countStargazers: async () => {
      throw new Error('normally filtered repository should not be evaluated');
    }
  });

  assert.deepEqual(result.repos, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.health.status, 'ok_no_new');
  assert.equal(result.health.lastHttpStatus, 200);
});

test('GitHub reports failed when every configured discovery backend fails', async () => {
  const result = await collectGitHubTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state: createTrendState(),
    config: {
      repos: [],
      discoveryTopics: ['coding-agent', 'mcp']
    },
    searchRepositories: async ({ topic }) => {
      throw new Error(`${topic} unavailable`);
    },
    getRepository: async () => {
      throw new Error('no candidates should be evaluated');
    },
    countStargazers: async () => {
      throw new Error('no candidates should be evaluated');
    }
  });

  assert.deepEqual(result.repos, []);
  assert.equal(result.health.status, 'failed');
  assert.equal(result.health.lastHttpStatus, null);
  assert.equal(result.health.lastSuccessAt, null);
});

test('Hacker News collector merges official and Algolia fixtures into a fresh deduplicated ranking', async () => {
  const state = createTrendState();
  const stories = {
    1: { id: 1, type: 'story', title: 'A new coding agent', url: 'https://example.test/agent', by: 'a', time: 1784152800, score: 20, descendants: 5 },
    2: { id: 2, type: 'story', title: 'An old coding agent', url: 'https://example.test/old', by: 'b', time: 1784070000, score: 99, descendants: 20 },
    3: { id: 3, type: 'story', title: 'Unrelated database release', url: 'https://example.test/db', by: 'c', time: 1784145600, score: 50, descendants: 10 }
  };

  const result = await collectHackerNewsTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state,
    config: {
      lists: ['newstories', 'topstories', 'beststories'],
      queries: ['coding agent', 'MCP browser automation'],
      interests: ['coding agent', 'mcp', 'browser automation'],
      windowHours: 24,
      maxItems: 10,
      minMomentum: 0,
      reemitMomentumDelta: 25
    },
    fetchStoryIds: async list => ({
      newstories: [1, 2],
      topstories: [1],
      beststories: [3]
    })[list],
    fetchStory: async id => stories[id],
    searchAlgolia: async query => query === 'coding agent'
      ? [{ objectID: '1', title: 'A new coding agent', url: 'https://example.test/agent', author: 'a', created_at_i: 1784152800, points: 22, num_comments: 6 }]
      : [{ objectID: '4', title: 'MCP browser automation', url: 'https://example.test/mcp', author: 'd', created_at_i: 1784156400, points: 10, num_comments: 2 }]
  });

  assert.equal(result.health.status, 'baseline_only');
  assert.deepEqual(result.items.map(item => item.id), ['1', '4']);
  assert.equal(result.items[0].momentum, 34);
  assert.equal(result.items[0].velocity, 17);
  assert.equal(result.items[1].momentum, 14);
  assert.equal(result.items[1].velocity, 7);
  assert.equal(result.health.itemsBeforeFilter, 4);
  assert.equal(result.health.itemsAfterFilter, 2);
});

test('Hacker News marks only items that survive maxItems truncation as emitted', async () => {
  const state = createTrendState();
  const stories = {
    1: { id: 1, type: 'story', title: 'Coding agent one', time: 1784156400, score: 30, descendants: 0 },
    2: { id: 2, type: 'story', title: 'Coding agent two', time: 1784156400, score: 20, descendants: 0 },
    3: { id: 3, type: 'story', title: 'Coding agent three', time: 1784156400, score: 10, descendants: 0 }
  };

  const result = await collectHackerNewsTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state,
    config: {
      lists: ['newstories'],
      queries: [],
      interests: ['coding agent'],
      maxItems: 1,
      minMomentum: 0
    },
    fetchStoryIds: async () => [1, 2, 3],
    fetchStory: async id => stories[id],
    searchAlgolia: async () => []
  });

  assert.deepEqual(result.items.map(item => item.id), ['1']);
  assert.equal(state.hackerNews['1'].lastEmittedAt, '2026-07-16T00:00:00.000Z');
  assert.equal(state.hackerNews['2'].lastEmittedAt, undefined);
  assert.equal(state.hackerNews['3'].lastEmittedAt, undefined);
});

test('Hacker News re-emission compares momentum with the last emitted value', async () => {
  const state = createTrendState();
  const emissions = [];

  for (const [index, momentum] of [10, 20, 40].entries()) {
    const result = await collectHackerNewsTrends({
      now: new Date(`2026-07-16T0${index}:00:00.000Z`),
      state,
      config: {
        lists: ['newstories'],
        queries: [],
        interests: ['coding agent'],
        maxItems: 1,
        minMomentum: 0,
        reemitMomentumDelta: 25
      },
      fetchStoryIds: async () => [1],
      fetchStory: async () => ({
        id: 1,
        type: 'story',
        title: 'Coding agent momentum',
        time: 1784156400,
        score: momentum,
        descendants: 0
      }),
      searchAlgolia: async () => []
    });
    emissions.push(result.items.length);
  }

  assert.deepEqual(emissions, [1, 0, 1]);
  assert.equal(state.hackerNews['1'].lastEmittedMomentum, 40);
});

test('Hacker News safely migrates legacy state without an emitted momentum baseline', async () => {
  const state = createTrendState();
  state.hackerNews['1'] = {
    firstSeenAt: '2026-07-15T20:00:00.000Z',
    lastSeenAt: '2026-07-15T22:00:00.000Z',
    lastEmittedAt: '2026-07-15T20:00:00.000Z',
    momentum: 20,
    points: 20,
    comments: 0
  };
  const emissions = [];

  for (const hour of ['00', '01']) {
    const result = await collectHackerNewsTrends({
      now: new Date(`2026-07-16T${hour}:00:00.000Z`),
      state,
      config: {
        lists: ['newstories'],
        queries: [],
        interests: ['coding agent'],
        maxItems: 1,
        reemitMomentumDelta: 25
      },
      fetchStoryIds: async () => [1],
      fetchStory: async () => ({
        id: 1,
        type: 'story',
        title: 'Coding agent legacy state',
        time: 1784156400,
        score: 40,
        descendants: 0
      }),
      searchAlgolia: async () => []
    });
    emissions.push(result.items.length);
  }

  assert.deepEqual(emissions, [1, 0]);
  assert.equal(state.hackerNews['1'].lastEmittedMomentum, 40);
});

test('AnySearch Reddit parser keeps only public post metadata from Markdown output', () => {
  const markdown = `## Search Results (2 results, 100ms)

### 1. Top Skills and MCPs?
- **URL**: https://www.reddit.com/r/ClaudeCode/comments/1uvbuss/top_skills_and_mcps/
- Subreddit: r/ClaudeCode Author: u/example Score: 5 | Comments: 12 Full post body and comments that must not be retained

### 2. Agent workflow
- **URL**: https://www.reddit.com/r/LocalLLaMA/comments/abc123/agent_workflow/
- Subreddit: r/LocalLLaMA Author: u/example2 Score: 9 | Comments: 3 More body text
`;

  assert.deepEqual(parseAnySearchRedditMarkdown(markdown), [
    {
      id: '1uvbuss',
      title: 'Top Skills and MCPs?',
      url: 'https://www.reddit.com/r/ClaudeCode/comments/1uvbuss/top_skills_and_mcps/',
      subreddit: 'ClaudeCode',
      score: 5,
      comments: 12
    },
    {
      id: 'abc123',
      title: 'Agent workflow',
      url: 'https://www.reddit.com/r/LocalLLaMA/comments/abc123/agent_workflow/',
      subreddit: 'LocalLLaMA',
      score: 9,
      comments: 3
    }
  ]);
});

test('AnySearch falls back on unparseable output but accepts an explicit zero-result response', async () => {
  let fallbackCalls = 0;
  const result = await collectRedditTrends({
    primarySearch: () => searchRedditViaAnySearch({
      queries: ['coding agent'],
      anySearchCli: '/test/anysearch_cli.py',
      execFileImpl: async () => ({ stdout: 'NONEMPTY FORMAT CHANGED' })
    }),
    fallbackSearch: async () => {
      fallbackCalls += 1;
      return { backend: 'arctic-shift', httpStatus: 200, items: [] };
    }
  });

  assert.equal(fallbackCalls, 1);
  assert.equal(result.health.status, 'degraded');
  assert.equal(result.health.backend, 'anysearch->arctic-shift');

  const explicitEmpty = await searchRedditViaAnySearch({
    queries: ['coding agent'],
    anySearchCli: '/test/anysearch_cli.py',
    execFileImpl: async () => ({ stdout: '## Search Results (0 results, 42ms)' })
  });
  assert.deepEqual(explicitEmpty.items, []);
  assert.equal(explicitEmpty.degraded, false);
});

test('AnySearch CLI resolution supports config, environment, home-relative skills, and PATH', async () => {
  assert.equal(await resolveAnySearchCli({
    anySearchCli: '/config/anysearch.py',
    env: { FOLLOW_BUILDERS_ANYSEARCH_CLI: '/env/anysearch.py' }
  }), '/config/anysearch.py');
  assert.equal(await resolveAnySearchCli({
    env: { FOLLOW_BUILDERS_ANYSEARCH_CLI: '/env/anysearch.py' }
  }), '/env/anysearch.py');

  const homeResolved = await resolveAnySearchCli({
    env: {},
    homeDir: '/home/alice',
    accessImpl: async candidate => {
      if (candidate !== '/home/alice/.codex/skills/anysearch/scripts/anysearch_cli.py') {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    }
  });
  assert.equal(homeResolved, '/home/alice/.codex/skills/anysearch/scripts/anysearch_cli.py');

  assert.equal(await resolveAnySearchCli({
    env: {},
    homeDir: '/home/alice',
    accessImpl: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    }
  }), 'anysearch');
});

test('Reddit collector enforces the 24-hour window, relevance, deduplication, and first-run baseline', async () => {
  const state = createTrendState();
  const result = await collectRedditTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state,
    config: {
      interests: ['coding agent', 'mcp'],
      minScore: 5,
      maxItems: 10
    },
    primarySearch: async () => ({
      backend: 'anysearch',
      httpStatus: 200,
      itemsBeforeFilter: 4,
      items: [
        { id: 'fresh1', title: 'Coding agent with MCP', url: 'https://www.reddit.com/r/mcp/comments/fresh1/x/', subreddit: 'mcp', score: 8, comments: 4, createdAt: '2026-07-15T22:00:00.000Z' },
        { id: 'fresh1', title: 'Coding agent duplicate', url: 'https://www.reddit.com/r/mcp/comments/fresh1/x/', subreddit: 'mcp', score: 7, comments: 3, createdAt: '2026-07-15T22:00:00.000Z' },
        { id: 'old1', title: 'Old coding agent', url: 'https://www.reddit.com/r/mcp/comments/old1/x/', subreddit: 'mcp', score: 50, comments: 20, createdAt: '2026-07-14T22:00:00.000Z' },
        { id: 'fresh2', title: 'Unrelated database', url: 'https://www.reddit.com/r/db/comments/fresh2/x/', subreddit: 'db', score: 20, comments: 10, createdAt: '2026-07-15T23:00:00.000Z' }
      ]
    }),
    fallbackSearch: async () => {
      throw new Error('fallback should not run');
    }
  });

  assert.equal(result.health.status, 'baseline_only');
  assert.deepEqual(result.items.map(item => item.id), ['fresh1']);
  assert.equal(result.health.itemsBeforeFilter, 4);
  assert.equal(result.health.itemsAfterFilter, 1);
  assert.equal(result.items[0].source, 'reddit');
  assert.equal(state.reddit.fresh1.lastEmittedAt, '2026-07-16T00:00:00.000Z');
});

test('Hacker News suppresses a seen item until momentum grows significantly', async () => {
  const state = createTrendState();
  let points = 20;
  const run = () => collectHackerNewsTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state,
    config: {
      lists: ['newstories'],
      queries: [],
      interests: ['coding agent'],
      windowHours: 24,
      reemitMomentumDelta: 25
    },
    fetchStoryIds: async () => [1],
    fetchStory: async () => ({
      id: 1,
      type: 'story',
      title: 'A new coding agent',
      url: 'https://example.test/agent',
      time: 1784152800,
      score: points,
      descendants: 5
    }),
    searchAlgolia: async () => []
  });

  assert.equal((await run()).health.status, 'baseline_only');
  assert.equal((await run()).health.status, 'ok_no_new');
  points = 50;
  const grown = await run();
  assert.equal(grown.health.status, 'ok_new');
  assert.deepEqual(grown.items.map(item => item.id), ['1']);
});

test('Reddit reports degraded when AnySearch fails and Arctic Shift succeeds', async () => {
  const primaryError = Object.assign(new Error('AnySearch quota exhausted'), { backend: 'anysearch' });
  const result = await collectRedditTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state: createTrendState(),
    config: { interests: ['coding agent'] },
    primarySearch: async () => {
      throw primaryError;
    },
    fallbackSearch: async () => ({
      backend: 'arctic-shift',
      httpStatus: 200,
      items: [{
        id: 'fallback1',
        title: 'Coding agent fallback',
        url: 'https://www.reddit.com/r/mcp/comments/fallback1/x/',
        subreddit: 'mcp',
        score: 1,
        comments: 0,
        createdAt: '2026-07-15T22:00:00.000Z'
      }]
    })
  });

  assert.equal(result.health.status, 'degraded');
  assert.equal(result.health.backend, 'anysearch->arctic-shift');
  assert.deepEqual(result.items.map(item => item.id), ['fallback1']);
});

test('GitHub reports blocked_auth when gh cannot access repository metadata', async () => {
  const result = await collectGitHubTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state: createTrendState(),
    config: { repos: ['openai/codex'], discoveryTopics: [], maxCandidates: 1 },
    ossCandidates: [],
    searchRepositories: async () => [],
    getRepository: async () => {
      throw new Error('To get started with GitHub CLI, please run: gh auth login');
    },
    countStargazers: async () => {
      throw new Error('should not run');
    }
  });

  assert.equal(result.health.status, 'blocked_auth');
  assert.equal(result.health.lastSuccessAt, null);
});

test('an empty verified Reddit result is ok_no_new even before a baseline entry exists', async () => {
  const result = await collectRedditTrends({
    now: new Date('2026-07-16T00:00:00.000Z'),
    state: createTrendState(),
    config: { interests: ['coding agent'] },
    primarySearch: async () => ({
      backend: 'anysearch+arctic-shift-verify',
      httpStatus: 200,
      itemsBeforeFilter: 20,
      items: []
    }),
    fallbackSearch: async () => {
      throw new Error('fallback should not run');
    }
  });

  assert.equal(result.health.status, 'ok_no_new');
  assert.equal(result.health.itemsBeforeFilter, 20);
  assert.equal(result.health.itemsAfterFilter, 0);
});
