// ============================================================
// Radiata Blog System — RSS Feed Fetcher
// Phase 1: Pipeline Core — Plan 02
// ============================================================
// Fetches all 20 RSS feeds in parallel (capped at 5 concurrent),
// filters to the last 26h using epoch math, extracts image URLs
// via a fallback chain, and returns normalized RssItem[].
// ============================================================

import pLimit from 'p-limit';
import Parser from 'rss-parser';
import type { RssSource, RssItem } from './types';

// --------------- Shared parser instance (PIPE-01: 15s timeout) ---------------

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
      ['content:encoded', 'content:encoded'],
    ],
  },
});

// Concurrency cap: at most 5 simultaneous feed fetches (PIPE-01)
const limit = pLimit(5);

// 26-hour window in milliseconds (PIPE-02 — epoch math, never date strings)
const WINDOW_MS = 26 * 60 * 60 * 1000;

// --------------- Image URL extraction helper ---------------

/**
 * Extract the best image URL from a raw rss-parser item.
 * Fallback chain (mirrors V8B "Parser RSS" node):
 *   1. enclosure.url  if enclosure.type starts with 'image/'
 *   2. media:content.$?.url
 *   3. media:thumbnail.$?.url
 *   4. First <img src="..."> in content:encoded or content
 *   5. Empty string
 */
export function extractImageUrl(
  item: Record<string, unknown>,
  articleUrl: string
): string {
  // 1. enclosure — must be an image type
  const enclosure = item['enclosure'] as
    | { url?: string; type?: string }
    | undefined;
  if (enclosure?.url && enclosure?.type?.startsWith('image/')) {
    return resolveUrl(enclosure.url, articleUrl);
  }

  // 2. media:content (rss-parser stores namespace items as nested objects)
  const mediaContent = item['media:content'] as
    | { $?: { url?: string }; url?: string }
    | Array<{ $?: { url?: string }; url?: string }>
    | undefined;
  if (mediaContent) {
    const mc = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;
    const mcUrl = mc?.$?.url ?? (mc as Record<string, unknown>)?.['url'] as string | undefined;
    if (mcUrl) return resolveUrl(mcUrl, articleUrl);
  }

  // 3. media:thumbnail
  const mediaThumbnail = item['media:thumbnail'] as
    | { $?: { url?: string }; url?: string }
    | Array<{ $?: { url?: string }; url?: string }>
    | undefined;
  if (mediaThumbnail) {
    const mt = Array.isArray(mediaThumbnail)
      ? mediaThumbnail[0]
      : mediaThumbnail;
    const mtUrl = mt?.$?.url ?? (mt as Record<string, unknown>)?.['url'] as string | undefined;
    if (mtUrl) return resolveUrl(mtUrl, articleUrl);
  }

  // 4. First <img src="..."> from HTML content fields
  const html =
    ((item['content:encoded'] as string | undefined) ??
      (item['content'] as string | undefined) ??
      '');
  const imgMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (imgMatch?.[1]) return resolveUrl(imgMatch[1], articleUrl);

  return '';
}

/**
 * Resolve a potentially relative URL against a base (article) URL.
 * Mirrors V8B `new URL(...)` fallback logic.
 */
function resolveUrl(url: string, base: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  try {
    const b = new URL(base);
    return `${b.protocol}//${b.hostname}${url.startsWith('/') ? '' : '/'}${url}`;
  } catch {
    return '';
  }
}

// --------------- Core parsing logic (exported for testing) ---------------

/**
 * Parse raw rss-parser feed items for a given source into RssItem[].
 * This helper is the DI seam for unit tests — no network calls here.
 */
export function parseFeedItems(
  feedItems: Array<Record<string, unknown>>,
  source: RssSource
): RssItem[] {
  const now = Date.now();
  const result: RssItem[] = [];

  for (const item of feedItems) {
    const titulo = String(item['title'] ?? '').trim();
    const url = String(item['link'] ?? '').trim();

    // Skip if missing or short title, or missing url (matches V8B Parser RSS)
    if (!titulo || titulo.length < 10 || !url) continue;

    // 26h filter using epoch ms (PIPE-02 — never date strings)
    const isoDate = item['isoDate'] as string | undefined;
    const pubDate = item['pubDate'] as string | undefined;
    const dateStr = isoDate ?? pubDate;
    if (dateStr) {
      const pubMs = new Date(dateStr).getTime();
      if (!isNaN(pubMs) && now - pubMs > WINDOW_MS) continue;
    }

    const imagem_url = extractImageUrl(item, url);

    result.push({
      titulo,
      url,
      data_publicacao: dateStr ?? '',
      imagem_url,
      site_nome: source.nome,
      site_idioma: source.idioma,
      site_prioridade: source.prioridade,
      site_tipo: source.tipo,
    });
  }

  return result;
}

// --------------- Main export ---------------

/**
 * Fetch all RSS feeds in parallel (capped at 5 concurrent).
 * A single slow or broken feed never kills the batch (Promise.allSettled).
 * Returns deduplicated, time-filtered RssItem[].
 */
export async function fetchAllFeeds(sources: RssSource[]): Promise<RssItem[]> {
  const tasks = sources.map((source) =>
    limit(async () => {
      try {
        const feed = await parser.parseURL(source.url);
        // Cast to our generic record type for the parsing helper
        return parseFeedItems(
          feed.items as unknown as Array<Record<string, unknown>>,
          source
        );
      } catch {
        // PIPE-01: continue if a feed fails — return empty array silently
        return [] as RssItem[];
      }
    })
  );

  const results = await Promise.allSettled(tasks);

  return results
    .filter(
      (r): r is PromiseFulfilledResult<RssItem[]> => r.status === 'fulfilled'
    )
    .flatMap((r) => r.value);
}
