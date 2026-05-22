// ============================================================
// RSS Fetcher — Unit Tests
// Uses node:test + node:assert/strict (no extra deps)
// Injects fixture data via parseFeedItems() — no network calls
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedItems, extractImageUrl } from './rss-fetcher.ts';
import type { RssSource } from './types.ts';

const SOURCE: RssSource = {
  nome: 'testsite',
  url: 'https://example.com/feed',
  idioma: 'en',
  prioridade: 2,
  tipo: 'EN',
};

// Helper: create a minimal feed item with a date N hours ago
function itemWithAge(hoursAgo: number, overrides: Record<string, unknown> = {}) {
  const pub = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  return {
    title: 'New Anime Season Revealed For Winter 2025',
    link: 'https://example.com/article-1',
    isoDate: pub,
    ...overrides,
  };
}

// --------------- Test 1: 26h filter ---------------

test('parseFeedItems: excludes items older than 26 hours', () => {
  const items = [
    itemWithAge(25), // within window — should pass
    itemWithAge(27), // too old (27h > 26h) — should be excluded
  ];

  const result = parseFeedItems(items, SOURCE);
  assert.equal(result.length, 1, 'Only the item within 26h should be included');
  assert.equal(result[0].titulo, 'New Anime Season Revealed For Winter 2025');
});

test('parseFeedItems: includes items without a date (no date = not filtered)', () => {
  const items = [
    {
      title: 'Anime Sequel Confirmed By Studio',
      link: 'https://example.com/no-date',
      // no isoDate / pubDate
    },
  ];

  const result = parseFeedItems(items, SOURCE);
  assert.equal(result.length, 1, 'Items with no date should not be excluded by age filter');
  assert.equal(result[0].data_publicacao, '');
});

// --------------- Test 2: image fallback chain ---------------

test('extractImageUrl: prefers enclosure when type is image/', () => {
  const item = {
    enclosure: { url: 'https://cdn.example.com/img.jpg', type: 'image/jpeg' },
    'media:content': { $: { url: 'https://cdn.example.com/media.jpg' } },
  };
  const url = extractImageUrl(item, 'https://example.com/article');
  assert.equal(url, 'https://cdn.example.com/img.jpg');
});

test('extractImageUrl: skips enclosure when type is not image/, falls back to media:content', () => {
  const item = {
    enclosure: { url: 'https://cdn.example.com/audio.mp3', type: 'audio/mpeg' },
    'media:content': { $: { url: 'https://cdn.example.com/media.jpg' } },
  };
  const url = extractImageUrl(item, 'https://example.com/article');
  assert.equal(url, 'https://cdn.example.com/media.jpg');
});

test('extractImageUrl: falls back to media:thumbnail when no media:content', () => {
  const item = {
    'media:thumbnail': { $: { url: 'https://cdn.example.com/thumb.jpg' } },
  };
  const url = extractImageUrl(item, 'https://example.com/article');
  assert.equal(url, 'https://cdn.example.com/thumb.jpg');
});

test('extractImageUrl: extracts first <img src> from content:encoded', () => {
  const item = {
    'content:encoded':
      '<p>Some text</p><img src="https://cdn.example.com/body.jpg" alt="test">',
  };
  const url = extractImageUrl(item, 'https://example.com/article');
  assert.equal(url, 'https://cdn.example.com/body.jpg');
});

test('extractImageUrl: returns empty string when no image found', () => {
  const url = extractImageUrl({}, 'https://example.com/article');
  assert.equal(url, '');
});

// --------------- Test 3: broken-feed resilience ---------------

test('parseFeedItems: skips items with missing or short titles', () => {
  const items = [
    { title: '', link: 'https://example.com/1', isoDate: new Date().toISOString() },
    { title: 'Short', link: 'https://example.com/2', isoDate: new Date().toISOString() },
    {
      title: 'One Piece Chapter Confirmed This Month',
      link: 'https://example.com/3',
      isoDate: new Date().toISOString(),
    },
  ];

  const result = parseFeedItems(items, SOURCE);
  assert.equal(result.length, 1, 'Only items with title >= 10 chars should be included');
  assert.equal(result[0].titulo, 'One Piece Chapter Confirmed This Month');
});

test('parseFeedItems: skips items with missing URL', () => {
  const items = [
    {
      title: 'Anime Movie Gets New Trailer Release',
      link: '',
      isoDate: new Date().toISOString(),
    },
    {
      title: 'Dragon Ball Announces New Sequel Series',
      link: 'https://example.com/valid',
      isoDate: new Date().toISOString(),
    },
  ];

  const result = parseFeedItems(items, SOURCE);
  assert.equal(result.length, 1, 'Items without URL should be skipped');
  assert.equal(result[0].url, 'https://example.com/valid');
});

test('parseFeedItems: maps all source metadata correctly', () => {
  const items = [
    {
      title: 'Naruto New Movie Trailer Released Online Today',
      link: 'https://example.com/naruto',
      isoDate: new Date().toISOString(),
    },
  ];

  const result = parseFeedItems(items, SOURCE);
  assert.equal(result.length, 1);
  const item = result[0];
  assert.equal(item.site_nome, 'testsite');
  assert.equal(item.site_idioma, 'en');
  assert.equal(item.site_prioridade, 2);
  assert.equal(item.site_tipo, 'EN');
});

test('parseFeedItems: resolves protocol-relative image URLs', () => {
  const items = [
    {
      title: 'Attack on Titan Final Season Movie Announced',
      link: 'https://example.com/aot',
      isoDate: new Date().toISOString(),
      enclosure: { url: '//cdn.example.com/img.jpg', type: 'image/jpeg' },
    },
  ];

  const result = parseFeedItems(items, SOURCE);
  assert.equal(result[0].imagem_url, 'https://cdn.example.com/img.jpg');
});
