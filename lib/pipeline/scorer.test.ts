// ============================================================
// Scorer — Unit Tests
// Uses node:test + node:assert/strict (no extra deps)
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTitle,
  computeTitleHash,
  scoreCandidates,
  getRecentHashes,
  getRecentlyPublishedSites,
} from './scorer.ts';
import type { RssItem } from './types.ts';

// --------------- Helpers ---------------

function makeItem(overrides: Partial<RssItem> = {}): RssItem {
  return {
    titulo: 'New Anime Season Announced For Spring 2025',
    url: 'https://example.com/article',
    data_publicacao: new Date().toISOString(),
    imagem_url: '',
    site_nome: 'ann',
    site_idioma: 'en',
    site_prioridade: 2,
    site_tipo: 'EN',
    ...overrides,
  };
}

// Mock Supabase builder — returns canned data
function mockSupabase(rows: unknown[]) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        gte: (_col: string, _val: string) => Promise.resolve({ data: rows }),
        order: (_col: string, _opts: unknown) => ({
          limit: (_n: number) => Promise.resolve({ data: rows }),
        }),
      }),
    }),
  };
}

// --------------- normalizeTitle ---------------

test('normalizeTitle: lowercases, strips diacritics, keeps only a-z0-9 space, trims', () => {
  const result = normalizeTitle('Café — Ação!');
  assert.equal(result, 'cafe acao');
});

test('normalizeTitle: collapses multiple spaces', () => {
  const result = normalizeTitle('One  Piece   Chapter');
  assert.equal(result, 'one piece chapter');
});

test('normalizeTitle: handles empty string', () => {
  assert.equal(normalizeTitle(''), '');
});

test('normalizeTitle: strips punctuation but keeps numbers', () => {
  const result = normalizeTitle('One Piece 1120: Eiichiro Oda revela...');
  assert.equal(result, 'one piece 1120 eiichiro oda revela');
});

// --------------- computeTitleHash ---------------

test('computeTitleHash: returns 32-char hex string', () => {
  const hash = computeTitleHash('One Piece 1120: Eiichiro Oda revela...');
  assert.equal(hash.length, 32);
  assert.match(hash, /^[0-9a-f]{32}$/);
});

test('computeTitleHash: same normalized titles produce same hash', () => {
  const h1 = computeTitleHash('Café Ação');
  const h2 = computeTitleHash('cafe acao');
  assert.equal(h1, h2);
});

test('computeTitleHash: different titles produce different hashes', () => {
  const h1 = computeTitleHash('One Piece Announces New Arc');
  const h2 = computeTitleHash('Dragon Ball Gets New Movie');
  assert.notEqual(h1, h2);
});

// --------------- scoreCandidates ---------------

test('scoreCandidates: returns top 3 maximum (truncation)', () => {
  const items: RssItem[] = [
    makeItem({ titulo: 'Anime One Season Announced For Spring', site_nome: 'ann' }),
    makeItem({ titulo: 'Anime Two Sequel Confirmed By Studio', site_nome: 'mal' }),
    makeItem({ titulo: 'Anime Three Trailer Released Online', site_nome: 'crunchyroll_en' }),
    makeItem({ titulo: 'Anime Four New Visual Revealed Today', site_nome: 'variety' }),
  ];
  const result = scoreCandidates(items, new Set(), []);
  assert.ok(result.length <= 3, `Expected max 3, got ${result.length}`);
});

test('scoreCandidates: drops items already in recentHashes (dedup)', () => {
  const item = makeItem({ titulo: 'Attack on Titan Final Season Confirmed' });
  const hash = computeTitleHash(item.titulo);
  const result = scoreCandidates([item], new Set([hash]), []);
  assert.equal(result.length, 0, 'Item in recentHashes should be dropped');
});

test('scoreCandidates: drops items with BAIXO_VALOR titles (score <= -50)', () => {
  // "weekly chart 1" matches BAIXO_VALOR (/weekly.*chart/i) → score = -60
  const item = makeItem({ titulo: 'Weekly Anime Chart Top 10 Results' });
  const result = scoreCandidates([item], new Set(), []);
  assert.equal(result.length, 0, 'BAIXO_VALOR item should be dropped');
});

test('scoreCandidates: applies cooldown penalty for recently used sites', () => {
  const item = makeItem({
    titulo: 'New Anime Announced For Summer Season',
    site_nome: 'ann',
    site_prioridade: 2,
  });
  // ann is the most recently published site (index 0 → penalty = 35)
  const resultWithCooldown = scoreCandidates([item], new Set(), ['ann']);
  const resultWithoutCooldown = scoreCandidates([item], new Set(), []);

  assert.equal(resultWithCooldown.length, 1);
  assert.equal(resultWithoutCooldown.length, 1);
  // With cooldown: cooldown = -35; without: cooldown = 0
  assert.equal(
    resultWithCooldown[0].score_total,
    resultWithoutCooldown[0].score_total - 35,
    'Cooldown at index 0 should subtract 35 from score_total'
  );
  assert.equal(resultWithCooldown[0].score_breakdown.cooldown, -35);
});

test('scoreCandidates: cooldown penalty decreases by 7 per position', () => {
  // Site at position 1 → penalty = Math.max(0, 35 - 1*7) = 28
  const item = makeItem({
    titulo: 'Dragon Ball New Movie Trailer Revealed',
    site_nome: 'mal',
    site_prioridade: 2,
  });
  const result = scoreCandidates([item], new Set(), ['ann', 'mal']);
  assert.equal(result.length, 1);
  assert.equal(result[0].score_breakdown.cooldown, -28);
});

test('scoreCandidates: cross-ref bonus — 2 sites reporting same article gets +20', () => {
  const items = [
    makeItem({ titulo: 'One Piece New Movie Announced Today', site_nome: 'ann', site_prioridade: 2 }),
    makeItem({ titulo: 'One Piece New Movie Announced Today', site_nome: 'mal', site_prioridade: 2 }),
  ];
  const result = scoreCandidates(items, new Set(), []);
  assert.equal(result.length, 1, 'Two items with same title should merge into 1 candidate');
  assert.equal(result[0].cross_ref_count, 2);
  // cross_ref = (2-1)*20 + crossSiteBonus(2) = 20 + 0 = 20
  assert.equal(result[0].score_breakdown.cross_ref, 20);
});

test('scoreCandidates: cross-ref bonus — 3 sites gets additional +10', () => {
  const items = [
    makeItem({ titulo: 'Attack on Titan Movie Confirmed Release', site_nome: 'ann', site_prioridade: 2 }),
    makeItem({ titulo: 'Attack on Titan Movie Confirmed Release', site_nome: 'mal', site_prioridade: 2 }),
    makeItem({ titulo: 'Attack on Titan Movie Confirmed Release', site_nome: 'crunchyroll_en', site_prioridade: 2 }),
  ];
  const result = scoreCandidates(items, new Set(), []);
  assert.equal(result.length, 1);
  assert.equal(result[0].cross_ref_count, 3);
  // cross_ref = (3-1)*20 + 10 = 50
  assert.equal(result[0].score_breakdown.cross_ref, 50);
});

test('scoreCandidates: cross-ref bonus — 4+ sites gets additional +15', () => {
  const items = [
    makeItem({ titulo: 'Naruto New Sequel Anime Announced Officially', site_nome: 'ann', site_prioridade: 2 }),
    makeItem({ titulo: 'Naruto New Sequel Anime Announced Officially', site_nome: 'mal', site_prioridade: 2 }),
    makeItem({ titulo: 'Naruto New Sequel Anime Announced Officially', site_nome: 'crunchyroll_en', site_prioridade: 2 }),
    makeItem({ titulo: 'Naruto New Sequel Anime Announced Officially', site_nome: 'variety', site_prioridade: 2 }),
  ];
  const result = scoreCandidates(items, new Set(), []);
  assert.equal(result.length, 1);
  assert.equal(result[0].cross_ref_count, 4);
  // cross_ref = (4-1)*20 + 15 = 75
  assert.equal(result[0].score_breakdown.cross_ref, 75);
});

test('scoreCandidates: JP source scores higher prioridade_site than EN', () => {
  const jpItem = makeItem({
    titulo: 'Bleach New Series Season Announced Today',
    site_nome: 'natalie',
    site_prioridade: 1,
  });
  const enItem = makeItem({
    titulo: 'My Hero Academia Season Six Confirmed Now',
    site_nome: 'ann',
    site_prioridade: 2,
  });
  const result = scoreCandidates([jpItem, enItem], new Set(), []);
  // JP: prioridade_site = (4-1)*10 = 30, EN: (4-2)*10 = 20
  const jpResult = result.find((r) => r.site_nome === 'natalie');
  const enResult = result.find((r) => r.site_nome === 'ann');
  assert.ok(jpResult, 'JP item should be in results');
  assert.ok(enResult, 'EN item should be in results');
  assert.equal(jpResult!.score_breakdown.prioridade_site, 30);
  assert.equal(enResult!.score_breakdown.prioridade_site, 20);
});

test('scoreCandidates: results are sorted by score_total descending', () => {
  const items: RssItem[] = [
    makeItem({ titulo: 'Anime Movie New Trailer Released Online', site_nome: 'ann', site_prioridade: 2 }),
    makeItem({ titulo: 'New Anime Season Announced For Summer', site_nome: 'natalie', site_prioridade: 1 }),
  ];
  const result = scoreCandidates(items, new Set(), []);
  if (result.length >= 2) {
    assert.ok(
      result[0].score_total >= result[1].score_total,
      'Results should be sorted descending by score_total'
    );
  }
});

// --------------- getRecentHashes ---------------

test('getRecentHashes: returns Set of title_hash strings from mock data', async () => {
  const rows = [
    { title_hash: 'abc123def456abc123def456abc12300' },
    { title_hash: 'deadbeefdeadbeefdeadbeefdeadbeef' },
  ];
  const supabase = mockSupabase(rows);
  const result = await getRecentHashes(supabase as Parameters<typeof getRecentHashes>[0]);
  assert.ok(result instanceof Set);
  assert.equal(result.size, 2);
  assert.ok(result.has('abc123def456abc123def456abc12300'));
  assert.ok(result.has('deadbeefdeadbeefdeadbeefdeadbeef'));
});

test('getRecentHashes: returns empty Set when no recent posts', async () => {
  const supabase = mockSupabase([]);
  const result = await getRecentHashes(supabase as Parameters<typeof getRecentHashes>[0]);
  assert.ok(result instanceof Set);
  assert.equal(result.size, 0);
});

// --------------- getRecentlyPublishedSites ---------------

test('getRecentlyPublishedSites: returns deduplicated list in order', async () => {
  const rows = [
    { source_site: 'ann' },
    { source_site: 'mal' },
    { source_site: 'ann' }, // duplicate — should be skipped
    { source_site: 'crunchyroll_en' },
  ];
  const supabase = mockSupabase(rows);
  const result = await getRecentlyPublishedSites(supabase as Parameters<typeof getRecentlyPublishedSites>[0]);
  assert.deepEqual(result, ['ann', 'mal', 'crunchyroll_en']);
});

test('getRecentlyPublishedSites: returns empty array when no posts', async () => {
  const supabase = mockSupabase([]);
  const result = await getRecentlyPublishedSites(supabase as Parameters<typeof getRecentlyPublishedSites>[0]);
  assert.deepEqual(result, []);
});
