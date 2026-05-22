// ============================================================
// Radiata Blog System — Debug RSS Endpoint
// Phase 1: Pipeline Core — Plan 02
// ============================================================
// Manual smoke-test endpoint: fetches all RSS feeds, scores them,
// and returns the TOP 3 candidates for the current moment.
//
// Usage:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://<domain>/api/debug/rss
//
// Route handler signature follows Next.js 16 conventions confirmed at:
//   node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
// ============================================================

import { createPipelineClient } from '@/lib/supabase/server';
import { fetchAllFeeds } from '@/lib/pipeline/rss-fetcher';
import { getRecentHashes, getRecentlyPublishedSites, scoreCandidates } from '@/lib/pipeline/scorer';
import { RSS_SOURCES } from '@/lib/pipeline/rss-sources';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  // T-01-07: Reject unauthenticated callers
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createPipelineClient();

  // Fetch all feeds in parallel (PIPE-01: p-limit(5), silent fail per feed)
  const items = await fetchAllFeeds(RSS_SOURCES);

  // Query rolling 26h dedup window and recently published sites from Supabase
  const recentHashes = await getRecentHashes(supabase);
  const recentSites = await getRecentlyPublishedSites(supabase);

  // Score and rank — returns top 3 (read-only, no Supabase writes)
  const top3 = scoreCandidates(items, recentHashes, recentSites);

  return Response.json(
    {
      items_fetched: items.length,
      unique_after_dedup_and_filter: top3.length,
      top3,
    },
    { status: 200 }
  );
}
