export const dynamic = 'force-dynamic';

import { createPipelineClient } from '@/lib/supabase/server';

export async function GET(): Promise<Response> {
  const supabase = createPipelineClient();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'pipeline_paused_s1')
    .single();
  return Response.json({ paused: data?.value === 'true' });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = createPipelineClient();
  const { paused } = (await request.json()) as { paused: boolean };
  await supabase
    .from('settings')
    .upsert({ key: 'pipeline_paused_s1', value: String(paused) }, { onConflict: 'key' });
  return Response.json({ paused });
}
