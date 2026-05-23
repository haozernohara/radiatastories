export const dynamic = 'force-dynamic';

import { createPipelineClient } from '@/lib/supabase/server';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('run_id');
  const listRuns = searchParams.get('runs') === 'true';

  const supabase = createPipelineClient();

  if (listRuns) {
    const { data: runs } = await supabase
      .from('pipeline_runs')
      .select('id, started_at, status, posts_published, candidates_found')
      .order('started_at', { ascending: false })
      .limit(30);
    return Response.json({ runs: runs ?? [] });
  }

  let run: any;
  if (runId) {
    const { data } = await supabase
      .from('pipeline_runs')
      .select('*')
      .eq('id', runId)
      .single();
    run = data;
  } else {
    const { data } = await supabase
      .from('pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    run = data;
  }

  if (!run) return Response.json({ run: null, logs: [] });

  const { data: logs } = await supabase
    .from('pipeline_logs')
    .select('stage, message, level, created_at, metadata')
    .eq('run_id', run.id)
    .order('created_at', { ascending: true });

  return Response.json({ run, logs: logs ?? [] });
}
