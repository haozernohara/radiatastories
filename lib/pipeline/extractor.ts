// ============================================================
// Radiata Blog System — Article Extractor
// Phase 1, Plan 03: Wave 2 — Content Extraction
// ============================================================
// PIPE-07: Fetch full article HTML, extract og:image + all body images
// PIPE-13: If source lacks images, fetch from cross-reference articles
// PIPE-14: Clean text extraction, min 200 words

import { parse } from 'node-html-parser';
import pLimit from 'p-limit';
import type { ExtractedArticle, ScoredCandidate } from './types.ts';

const NOISE_TAGS = 'script, style, nav, header, footer, aside';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const LOGO_PATTERN = /logo|avatar|icon/i;

// --------------- Internal helpers ---------------

/**
 * Resolve a possibly-relative URL against a base URL.
 * Handles: //... -> https:..., /path -> origin + path, absolute -> as-is
 */
function resolveUrl(maybeRelative: string, baseUrl: string): string {
  if (!maybeRelative) return maybeRelative;

  // Protocol-relative
  if (maybeRelative.startsWith('//')) {
    return 'https:' + maybeRelative;
  }

  // Already absolute
  if (/^https?:\/\//i.test(maybeRelative)) {
    return maybeRelative;
  }

  // Root-relative
  if (maybeRelative.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return base.protocol + '//' + base.hostname + maybeRelative;
    } catch {
      return maybeRelative;
    }
  }

  // Relative path — resolve against base
  try {
    return new URL(maybeRelative, baseUrl).href;
  } catch {
    return maybeRelative;
  }
}

/**
 * Extract all YouTube embed URLs from raw HTML string.
 * Handles: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
 * Returns deduplicated array of https://www.youtube.com/embed/{id} URLs.
 */
function extractYouTubeEmbeds(html: string): string[] {
  const seen = new Set<string>();
  const embeds: string[] = [];

  // Match youtube.com/embed/ID
  const embedRe = /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/g;
  let m: RegExpExecArray | null;
  while ((m = embedRe.exec(html)) !== null) {
    const url = `https://www.youtube.com/embed/${m[1]}`;
    if (!seen.has(url)) { seen.add(url); embeds.push(url); }
  }

  // Match youtube.com/watch?v=ID
  const watchRe = /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/g;
  while ((m = watchRe.exec(html)) !== null) {
    const url = `https://www.youtube.com/embed/${m[1]}`;
    if (!seen.has(url)) { seen.add(url); embeds.push(url); }
  }

  // Match youtu.be/ID
  const shortRe = /youtu\.be\/([A-Za-z0-9_-]{11})/g;
  while ((m = shortRe.exec(html)) !== null) {
    const url = `https://www.youtube.com/embed/${m[1]}`;
    if (!seen.has(url)) { seen.add(url); embeds.push(url); }
  }

  return embeds;
}

// --------------- Exported parser (also exported for testing) ---------------

/**
 * Parse raw HTML and extract all article content fields.
 * Does NOT make network calls — pure parsing from a string + base URL.
 */
export function _parseHtml(html: string, baseUrl: string): ExtractedArticle {
  const root = parse(html, { lowerCaseTagName: false, comment: false });

  // --- og:image fallback chain ---
  let og_image: string | null =
    root.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null;

  if (!og_image) {
    og_image =
      root.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ?? null;
  }

  // First inline <img> that is not logo/avatar/icon and starts with http
  if (!og_image) {
    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith('http') && !LOGO_PATTERN.test(src)) {
        og_image = src;
        break;
      }
    }
  }

  // --- Strip noise tags ---
  root.querySelectorAll(NOISE_TAGS).forEach(el => el.remove());

  // --- Clean text ---
  const texto_limpo = root.text.replace(/\s+/g, ' ').trim();
  const palavras = texto_limpo.split(/\s+/).filter(w => w.length > 2).length;

  // --- Body images (collected AFTER noise removal, deduped) ---
  const seen = new Set<string>();
  const body_images: string[] = [];

  for (const img of root.querySelectorAll('img')) {
    const rawSrc = img.getAttribute('src') ?? '';
    if (!rawSrc) continue;

    const resolved = resolveUrl(rawSrc, baseUrl);
    if (LOGO_PATTERN.test(resolved)) continue;
    if (!resolved.startsWith('http')) continue;
    if (seen.has(resolved)) continue;

    seen.add(resolved);
    body_images.push(resolved);
  }

  // --- YouTube embeds (from original HTML, before parsing mutations) ---
  const videos_embed = extractYouTubeEmbeds(html);

  return {
    texto_limpo,
    palavras,
    og_image,
    body_images,
    videos_embed,
  };
}

// --------------- Public API ---------------

const EMPTY_RESULT: ExtractedArticle = {
  texto_limpo: '',
  palavras: 0,
  og_image: null,
  body_images: [],
  videos_embed: [],
};

/**
 * Fetch a URL and extract article content.
 * Returns an empty ExtractedArticle on fetch failure or non-OK response.
 * PIPE-07: Uses modern Chrome User-Agent and Brazilian locale.
 * T-01-11: AbortSignal.timeout(20_000) prevents infinite streams.
 */
export async function extractArticle(url: string): Promise<ExtractedArticle> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent': CHROME_UA,
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8,ja;q=0.7',
      },
    });

    if (!res.ok) {
      console.warn(`[extractor] Non-OK response for ${url}: ${res.status}`);
      return EMPTY_RESULT;
    }

    const html = await res.text();
    return _parseHtml(html, url);
  } catch (err) {
    console.warn(`[extractor] Failed to fetch ${url}:`, err);
    return EMPTY_RESULT;
  }
}

/**
 * Fetch og:image from up to 5 cross-reference candidates (PIPE-13).
 * Used when the primary article has fewer than 3 total images.
 * Concurrency-limited to 3 parallel requests, 10s timeout each.
 */
export async function extractFromCrossRefs(
  refs: Array<{ url: string }>
): Promise<string[]> {
  const limit = pLimit(3);
  const seen = new Set<string>();
  const results: string[] = [];

  const tasks = refs.slice(0, 10).map(ref =>
    limit(async () => {
      try {
        const res = await fetch(ref.url, {
          signal: AbortSignal.timeout(10_000),
          headers: {
            'User-Agent': CHROME_UA,
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8,ja;q=0.7',
          },
        });
        if (!res.ok) return null;
        const html = await res.text();
        const { og_image } = _parseHtml(html, ref.url);
        return og_image;
      } catch {
        return null;
      }
    })
  );

  const images = await Promise.all(tasks);

  for (const img of images) {
    if (!img) continue;
    if (seen.has(img)) continue;
    if (results.length >= 5) break;
    seen.add(img);
    results.push(img);
  }

  return results;
}
