/**
 * Tests for lib/dashboard/queries.ts
 * Run: node --experimental-strip-types --test lib/dashboard/queries.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRecentPosts,
  getRecentRuns,
  getLatestRunCandidates,
  getDashboardStats,
} from './queries.ts';

// --- Helpers ---

function makeSupabase(overrides: Record<string, any> = {}) {
  const defaultChain = {
    select: () => defaultChain,
    order: () => defaultChain,
    limit: () => defaultChain,
    single: async () => ({ data: null, error: null }),
    eq: () => defaultChain,
    gte: () => defaultChain,
    lte: () => defaultChain,
    then: undefined as any,
  };

  // Make the chain thenable so `await supabase.from(...).select(...)` works
  const makeChain = (finalData: any) => {
    const chain: any = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => chain,
      gte: () => chain,
      lte: () => chain,
      single: async () => ({ data: finalData?.[0] ?? null, error: null }),
    };
    // Make awaitable: returns { data, error }
    chain[Symbol.for('nodejs.rejection')] = undefined;
    Object.defineProperty(chain, 'then', {
      get() {
        return (resolve: Function) => resolve({ data: finalData, error: null });
      },
    });
    return chain;
  };

  const sb: any = {
    from: (table: string) => {
      if (overrides[table] !== undefined) {
        return makeChain(overrides[table]);
      }
      return makeChain(null);
    },
  };
  return sb;
}

// --- Export existence ---

test('all four exports exist and are functions', () => {
  assert.equal(typeof getRecentPosts, 'function');
  assert.equal(typeof getRecentRuns, 'function');
  assert.equal(typeof getLatestRunCandidates, 'function');
  assert.equal(typeof getDashboardStats, 'function');
});

// --- getRecentPosts ---

test('getRecentPosts: returns empty array when Supabase returns null', async () => {
  const sb = makeSupabase({ posts: null });
  const result = await getRecentPosts(sb);
  assert.deepEqual(result, []);
});

test('getRecentPosts: returns empty array when Supabase returns empty array', async () => {
  const sb = makeSupabase({ posts: [] });
  const result = await getRecentPosts(sb);
  assert.deepEqual(result, []);
});

test('getRecentPosts: qa_score derived from qa_scores.media', async () => {
  const sb = makeSupabase({
    posts: [
      {
        id: 'abc',
        title: 'Test Post',
        source_site: 'ANN',
        published_at: '2026-05-19T10:00:00Z',
        qa_scores: { media: 8.5 },
        wp_post_id: 123,
      },
    ],
  });
  const result = await getRecentPosts(sb);
  assert.equal(result.length, 1);
  assert.equal(result[0].qa_score, 8.5);
  assert.equal(result[0].link, 'https://radiata.pro/?p=123');
  assert.equal(result[0].source_site, 'ANN');
});

test('getRecentPosts: qa_score fallback to 0 when qa_scores is null', async () => {
  const sb = makeSupabase({
    posts: [
      {
        id: 'xyz',
        title: 'No QA Post',
        source_site: null,
        published_at: '2026-05-18T12:00:00Z',
        qa_scores: null,
        wp_post_id: 456,
      },
    ],
  });
  const result = await getRecentPosts(sb);
  assert.equal(result[0].qa_score, 0);
  assert.equal(result[0].source_site, '—');
});

test('getRecentPosts: qa_score fallback to 0 when qa_scores has no media field', async () => {
  const sb = makeSupabase({
    posts: [
      {
        id: 'xyz2',
        title: 'Partial QA',
        source_site: 'Crunchyroll',
        published_at: '2026-05-18T12:00:00Z',
        qa_scores: { humanizacao: 8 },
        wp_post_id: 789,
      },
    ],
  });
  const result = await getRecentPosts(sb);
  assert.equal(result[0].qa_score, 0);
});

// --- getRecentRuns ---

test('getRecentRuns: returns empty array when Supabase returns null', async () => {
  const sb = makeSupabase({ pipeline_runs: null });
  const result = await getRecentRuns(sb);
  assert.deepEqual(result, []);
});

test('getRecentRuns: returns empty array when Supabase returns empty array', async () => {
  const sb = makeSupabase({ pipeline_runs: [] });
  const result = await getRecentRuns(sb);
  assert.deepEqual(result, []);
});

test('getRecentRuns: duration_seconds computed from timestamps', async () => {
  const sb = makeSupabase({
    pipeline_runs: [
      {
        id: 'run1',
        started_at: '2026-05-19T10:00:00Z',
        finished_at: '2026-05-19T10:02:30Z',
        status: 'completed',
        posts_published: 0,
        candidates_found: 3,
      },
    ],
    posts: [],
  });
  const result = await getRecentRuns(sb);
  assert.equal(result.length, 1);
  assert.equal(result[0].duration_seconds, 150); // 2m 30s
  assert.equal(result[0].post_title, null);
});

test('getRecentRuns: duration_seconds is null when no finished_at', async () => {
  const sb = makeSupabase({
    pipeline_runs: [
      {
        id: 'run2',
        started_at: '2026-05-19T10:00:00Z',
        finished_at: null,
        status: 'running',
        posts_published: 0,
        candidates_found: 0,
      },
    ],
    posts: [],
  });
  const result = await getRecentRuns(sb);
  assert.equal(result[0].duration_seconds, null);
});

// --- getLatestRunCandidates ---

test('getLatestRunCandidates: returns empty array when no pipeline runs', async () => {
  const sb = makeSupabase({ pipeline_runs: null, candidates: null });
  const result = await getLatestRunCandidates(sb);
  assert.deepEqual(result, []);
});

test('getLatestRunCandidates: returns empty array when candidates table is empty', async () => {
  const sb = makeSupabase({ pipeline_runs: [{ id: 'run1' }], candidates: [] });
  const result = await getLatestRunCandidates(sb);
  assert.deepEqual(result, []);
});

// --- getDashboardStats ---

test('getDashboardStats: returns zeros when no posts', async () => {
  const sb = makeSupabase({ posts: [] });
  const result = await getDashboardStats(sb);
  assert.equal(result.posts_week, 0);
  assert.equal(result.qa_approval_rate, 0);
  assert.equal(result.rss_sources_count, 20);
  assert.equal(result.qa_avg, 0);
});

test('getDashboardStats: returns zeros when posts is null', async () => {
  const sb = makeSupabase({ posts: null });
  const result = await getDashboardStats(sb);
  assert.equal(result.posts_week, 0);
  assert.equal(result.qa_approval_rate, 0);
  assert.equal(result.rss_sources_count, 20);
  assert.equal(result.qa_avg, 0);
});

test('getDashboardStats: computes approval rate and avg correctly', async () => {
  const sb = makeSupabase({
    posts: [
      { qa_scores: { media: 8.5 }, published_at: new Date().toISOString() },
      { qa_scores: { media: 7.0 }, published_at: new Date().toISOString() },
      { qa_scores: { media: 6.0 }, published_at: new Date().toISOString() },
      { qa_scores: null, published_at: new Date().toISOString() },
    ],
  });
  const result = await getDashboardStats(sb);
  assert.equal(result.posts_week, 4);
  // scores: [8.5, 7.0, 6.0, 0] -> approved (>=7): 2 -> 50%
  assert.equal(result.qa_approval_rate, 50);
  // avg: (8.5+7.0+6.0+0)/4 = 21.5/4 = 5.375 -> toFixed(1) = 5.4
  assert.equal(result.qa_avg, 5.4);
  assert.equal(result.rss_sources_count, 20);
});

// --- Error handling (simulate Supabase throwing) ---

test('getRecentPosts: returns empty array when Supabase throws', async () => {
  const sb = { from: () => { throw new Error('connection error'); } };
  const result = await getRecentPosts(sb);
  assert.deepEqual(result, []);
});

test('getDashboardStats: returns zeros when Supabase throws', async () => {
  const sb = { from: () => { throw new Error('connection error'); } };
  const result = await getDashboardStats(sb);
  assert.equal(result.posts_week, 0);
  assert.equal(result.rss_sources_count, 20);
});
