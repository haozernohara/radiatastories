// ============================================================
// Radiata Blog System — Pipeline Cron Route Handler
// Phase 1: Pipeline Core — Plan 06
// ============================================================
// Route callable by cron-job.org (GET) and the dashboard (POST).
//
// Responsibilities:
//   1. Validate Bearer CRON_SECRET
//   2. Acquire advisory lock (try_acquire_pipeline_lock) — returns 423 if held
//   3. Delegate to runRssPipeline
//   4. Release advisory lock in finally (never leaked — SCHED-02)
//
// Route handler pattern follows Next.js 16 App Router conventions:
//   node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
//
// Key invariants:
//   - maxDuration=300 so Vercel allows up to 5 minutes (INFRA-01)
//   - Advisory lock acquired BEFORE any other Supabase operation
//   - Lock released in finally even if runRssPipeline throws
//   - Concurrent calls return 423 (HTTP Locked — semantically correct)
// ============================================================

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { createPipelineClient } from '@/lib/supabase/server';
import { runRssPipeline } from '@/lib/pipeline/orchestrator';

async function handle(request: Request): Promise<Response> {
  // Step 1: Authenticate — reject callers without valid Bearer token
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createPipelineClient();

  // Step 2: Advisory lock — prevents concurrent pipeline runs (SCHED-02, T-01-20)
  const { data: locked, error: lockErr } = await supabase.rpc('try_acquire_pipeline_lock', {
    p_system: 'rss',
  });

  if (lockErr) {
    return Response.json({ status: 'failed', error: lockErr.message }, { status: 500 });
  }

  if (!locked) {
    // Another invocation is already running — return 423 Locked
    return Response.json({ status: 'already_running' }, { status: 423 });
  }

  try {
    // Step 3: Run the full pipeline
    const result = await runRssPipeline(supabase, {
      dryRun: process.env.PIPELINE_DRY_RUN === 'true',
    });
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error('[pipeline/run]', err);
    return Response.json({ status: 'failed', error: String(err) }, { status: 500 });
  } finally {
    // Step 4: Always release the advisory lock (never leaked)
    await supabase.rpc('release_pipeline_lock', { p_system: 'rss' });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
