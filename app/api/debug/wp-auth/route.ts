// ============================================================
// Radiata Blog System — Debug: WordPress Auth Verification
// Phase 1: Pipeline Core — Plan 05, Task 2
// ============================================================
// Verifies that WordPress Basic Auth works from this server context
// (i.e., Cloudflare WAF on radiata.pro does NOT strip Authorization
// headers coming from Vercel's IP range).
//
// This is the highest-risk unknown in Phase 1 per STATE.md. Run this
// endpoint from the Vercel deployment BEFORE using any publisher logic.
//
// Usage:
//   curl -i -H "Authorization: Bearer $CRON_SECRET" \
//        https://<project>.vercel.app/api/debug/wp-auth
//
// Expected success: HTTP 200 { ok: true, status: 200, userName: 'Henrique Prado' }
// WAF strip: HTTP 502 { ok: false, status: 401, body: '...' }
// Wrong credentials: HTTP 502 { ok: false, status: 403, body: '...' }
// ============================================================

import { testWpAuth } from '@/lib/pipeline/wp-publisher';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  // T-01-19: Bearer auth — same secret as cron trigger
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await testWpAuth();

  return Response.json(result, { status: result.ok ? 200 : 502 });
}
