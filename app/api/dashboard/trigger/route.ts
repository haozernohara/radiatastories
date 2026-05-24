// Internal dashboard trigger — no CRON_SECRET needed (personal dashboard only).
// maxDuration=300 keeps the function alive while pipeline runs.
// Streams runId as first NDJSON line so client can navigate to /logs?run_id=X immediately.
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')); } catch {}
      };

      try {
        // runRssPipeline calls onRunCreated as soon as the run row is created (~100ms),
        // so the client gets the runId before any heavy work starts.
        const result = await runRssPipeline(supabase, { dryRun: false }, {
          onRunCreated: (runId) => send({ runId }),
        });
        send({ done: true, status: result.status });
      } catch (err) {
        console.error('[dashboard/trigger]', err);
        send({ error: String(err) });
      } finally {
        await supabase.rpc('release_pipeline_lock', { p_system: 'rss' });
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
}
