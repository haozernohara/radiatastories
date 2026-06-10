// ============================================================
// Radiata Blog System — Scorer
// Phase 1: Pipeline Core — Plan 02
// ============================================================
// Ports V8B "Consolida Dedup Hash" + "Filtra TOP 3 candidatos" nodes.
// Read-only: this module NEVER writes to Supabase.
// ============================================================

import md5 from 'md5';
import type { RssItem, ScoredCandidate } from './types';

// --------------- Keyword arrays (verbatim from V8B "Filtra TOP 3 candidatos") ---------------

const BAIXO_VALOR: RegExp[] = [
  /\btv\s*(animation|anime)\s*ranking/i,
  /\branking\b.*\d+/i,
  /weekly.*chart/i,
  /monthly.*chart/i,
  /\btop\s*\d+\s*(anime|manga|series)/i,
  /sales\s+(figures?|data|report)/i,
  /\bbox\s*office\s*(result|report)/i,
  /merchandise|\bfigure\s*announce/i,
  /\bplush\b|\bgacha\b|\bcollab.*cafe/i,
  /annual.*ranking|\bBD.*ranking/i,
  // --- Japonês: baixo valor (merchandise/ranking/colab) ---
  /グッズ|フィギュア|ぬいぐるみ|アクリル|キーホルダー|缶バッジ/, // goods/figure/plush/acrylic/keychain/badge
  /ランキング|売上|チャート/,                                  // ranking/sales/chart
  /カフェ|コラボカフェ|予約受付|発売記念|抽選/,                  // cafe/collab-cafe/preorder/sale-commemoration/lottery
];

const ALTO_VALOR: RegExp[] = [
  /anunci|announce/i,
  /revel|reveal/i,
  /confirm/i,
  /new\s+(tv|anime|series|film|movie)/i,
  /temporada|season/i,
  /estreia|premiere/i,
  /trailer/i,
  /key\s*visual/i,
  /new\s*visual/i,
  /sequel|prequel|adaptation/i,
  /release\s*date/i,
  /cast|staff/i,
  /live.action|film|movie/i,
  /novo\s*anime|nova\s*série|nova\s*temporada/i,
  // --- Japonês: alto valor (furo de notícia) ---
  /発表|決定|解禁|公開/,        // announced/decided/unveiled/revealed
  /続編|新作|新シリーズ|第\d期|期決定/, // sequel/new-work/new-series/season-N/season-confirmed
  /アニメ化|実写化|映画化|劇場版/,   // anime-adaptation/live-action/film-adaptation/theatrical
  /予告|ティザー|PV|本予告|特報/,    // trailer/teaser/PV/main-trailer/special-announcement
  /放送|配信|キャスト|声優|ビジュアル|キービジュアル/, // broadcast/streaming/cast/voice-actor/visual/key-visual
];

// --------------- Title normalization (verbatim from V8B "normalizarTitulo") ---------------

/**
 * Normalize a title for dedup comparison:
 *   lowercase → NFD → strip diacritics → keep [a-z0-9 ] → collapse spaces → trim
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip Latin combining diacritical marks only
    // Keep a-z0-9, whitespace AND Japanese (hiragana/katakana/kanji) so JP titles
    // produce distinct hashes instead of all collapsing to md5('') and colliding.
    .replace(/[^a-z0-9\s぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * MD5 hash of the normalized title (32-char hex string).
 */
export function computeTitleHash(title: string): string {
  return md5(normalizeTitle(title));
}

// --------------- Slug generator (verbatim from V8B "gerarSlug") ---------------

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 80);
}

// --------------- Supabase read helpers ---------------

// Minimal Supabase-compatible interface — accepts both real SupabaseClient and test mocks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = any;

/**
 * Query recently published title hashes from the `posts` table.
 * Uses a rolling 26h window via epoch math (never date strings — PIPE-02).
 */
export async function getRecentHashes(supabase: SupabaseLike): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('posts')
    .select('title_hash')
    .gte('published_at', cutoff);
  const rows = (data ?? []) as Array<{ title_hash: string }>;
  return new Set(rows.map((r) => r.title_hash));
}

/**
 * Query the 5 most recently published site names from `posts`.
 * Deduplicated preserving first-seen (most-recent) order.
 */
export async function getRecentlyPublishedSites(
  supabase: SupabaseLike,
  limitCount = 5
): Promise<string[]> {
  const { data } = await supabase
    .from('posts')
    .select('source_site')
    .order('published_at', { ascending: false })
    .limit(limitCount);

  if (!data) return [];

  const rows = data as Array<{ source_site: string }>;

  // Deduplicate preserving first-seen order (most recent first)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    if (row.source_site && !seen.has(row.source_site)) {
      seen.add(row.source_site);
      result.push(row.source_site);
    }
  }
  return result;
}

// --------------- Scoring helpers ---------------

/**
 * Score a title based on ALTO_VALOR / BAIXO_VALOR keyword arrays.
 * Returns -60 immediately on any BAIXO_VALOR match.
 * Returns +15 per ALTO_VALOR match (cumulative).
 */
function scoreTitulo(titulo: string): number {
  for (const pattern of BAIXO_VALOR) {
    if (pattern.test(titulo)) return -60;
  }
  let score = 0;
  for (const pattern of ALTO_VALOR) {
    if (pattern.test(titulo)) score += 15;
  }
  return score;
}

/**
 * Additional cross-site bonus for viral articles.
 * count >= 4 → +15, count >= 3 → +10, else 0
 */
function crossSiteBonus(count: number): number {
  if (count >= 4) return 15;
  if (count >= 3) return 10;
  return 0;
}

// --------------- Main export ---------------

/**
 * Score and rank RSS items:
 * 1. Consolidate duplicates by hash (cross-reference)
 * 2. Filter out already-published hashes (recentHashes)
 * 3. Score each unique candidate
 * 4. Drop score_titulo <= -50
 * 5. Sort descending by score_total, return top 3
 *
 * This function is READ-ONLY — it never writes to Supabase.
 */
export function scoreCandidates(
  items: RssItem[],
  recentHashes: Set<string>,
  recentSites: string[]
): ScoredCandidate[] {
  // --- Step 1: Build cross-reference map (hash → best item + site count) ---
  // V8B "Consolida Dedup Hash": counts per-site, keeps lowest prioridade item
  type Entry = {
    count: number;
    sites: string[];
    item_ref: RssItem;
  };
  const contagem = new Map<string, Entry>();

  for (const item of items) {
    if (!item.titulo || !item.url) continue;
    const h = computeTitleHash(item.titulo);

    if (!contagem.has(h)) {
      contagem.set(h, { count: 0, sites: [], item_ref: item });
    }
    const entry = contagem.get(h)!;
    entry.count += 1;
    if (!entry.sites.includes(item.site_nome)) {
      entry.sites.push(item.site_nome);
    }
    // Keep highest-priority item (lowest prioridade number = JP=1 > EN=2 > BR=3)
    if ((item.site_prioridade ?? 3) < (entry.item_ref.site_prioridade ?? 3)) {
      entry.item_ref = item;
    }
  }

  // --- Step 2: Build site cooldown penalty map ---
  // V8B: position 0 = most recent = -35, 1 = -28, 2 = -21, 3 = -14, 4 = -7
  // Accumulate MAX penalty when same site appears at multiple positions
  const sitePenalty = new Map<string, number>();
  recentSites.forEach((site, idx) => {
    const penalty = Math.max(0, 35 - idx * 7);
    sitePenalty.set(site, Math.max(sitePenalty.get(site) ?? 0, penalty));
  });

  // --- Step 3: Score unique candidates ---
  const scored: ScoredCandidate[] = [];

  for (const [h, entry] of contagem) {
    // Filter: drop hashes already published (rolling 26h dedup — PIPE-03)
    if (recentHashes.has(h)) continue;

    const item = entry.item_ref;
    const count = entry.count;

    const score_titulo = scoreTitulo(item.titulo);
    // Drop low-value candidates (V8B uses > -50, which means <= -50 gets dropped)
    if (score_titulo <= -50) continue;

    // prioridade_site: JP(1)=30, EN(2)=20, BR(3)=10
    const prioridade_site = (4 - (item.site_prioridade ?? 3)) * 10;

    // cross_ref: (count - 1) * 20 + crossSiteBonus
    const cross_ref = (count - 1) * 20 + crossSiteBonus(count);

    // cooldown: negative of site penalty
    const penalty = sitePenalty.get(item.site_nome) ?? 0;
    const cooldown = -penalty;

    const score_total = score_titulo + prioridade_site + cross_ref + cooldown;

    scored.push({
      ...item,
      hash: h,
      slug_base: generateSlug(item.titulo),
      cross_ref_count: count,
      cross_ref_sites: entry.sites,
      score_titulo,
      score_site_penalty: cooldown,
      score_total,
      score_breakdown: {
        score_titulo,
        prioridade_site,
        cross_ref,
        cooldown,
      },
    });
  }

  // --- Step 4: Sort descending by score_total, return top 3 ---
  return scored.sort((a, b) => b.score_total - a.score_total).slice(0, 3);
}
