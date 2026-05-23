// Internal dashboard trigger — no CRON_SECRET needed (personal dashboard only).
// maxDuration=300 keeps the function alive while pipeline runs.
// Client fires this request, navigates away immediately; server continues running.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { createPipelineClient } from '@/lib/supabase/server';
import { runRssPipeline } from '@/lib/pipeline/orchestrator';

export async function POST(): Promise<Response> {
  const supabase = createPipelineClient();

  const { data: locked, error: lockErr } = await supabase.rpc('try_acquire_pipeline_lock', {
    p_system: 'rss',
  });

  if (lockErr) {
    return Response.json({ status: 'failed', error: lockErr.message }, { status: 500 });
  }

  if (!locked) {
    return Response.json({ status: 'already_running' }, { status: 423 });
  }

  try {
    const result = await runRssPipeline(supabase, { dryRun: false });
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error('[dashboard/trigger]', err);
    return Response.json({ status: 'failed', error: String(err) }, { status: 500 });
  } finally {
    await supabase.rpc('release_pipeline_lock', { p_system: 'rss' });
  }
}
