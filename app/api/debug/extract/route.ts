// ============================================================
// Radiata Blog System — Debug: Article Extraction Smoke Test
// Phase 1, Plan 03: Task 3
// ============================================================
// T-01-10: Bearer-protected endpoint to prevent SSRF misuse.
// Never exposed publicly without IP allowlisting.
// Usage: POST /api/debug/extract { "url": "https://..." }
//        Authorization: Bearer <CRON_SECRET>

import { extractArticle } from '@/lib/pipeline/extractor';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  // T-01-10: Bearer auth — same secret as cron trigger (CRON_SECRET)
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const url = (body as any)?.url;
  if (!url || typeof url !== 'string') {
    return Response.json({ error: 'Missing url' }, { status: 400 });
  }

  const result = await extractArticle(url);

  return Response.json({
    palavras: result.palavras,
    og_image: result.og_image,
    body_images_count: result.body_images.length,
    videos_count: result.videos_embed.length,
    texto_preview: result.texto_limpo.slice(0, 300),
  });
}
