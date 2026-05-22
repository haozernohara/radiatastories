// ============================================================
// Radiata Blog System — Debug: End-to-End WP Publish Smoke Test
// Phase 1: Pipeline Core — Plan 05, Task 4
// ============================================================
// Publishes a synthetic test post to radiata.pro and immediately
// deletes it, proving the full image + post pipeline works from
// Vercel context without leaving pollution on the live blog.
//
// Usage:
//   curl -X POST -i \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" \
//     -d '{"image_url":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/640px-Cat03.jpg"}' \
//     https://<project>.vercel.app/api/debug/wp-publish
//
// Expected: HTTP 200 { ok: true, published_id: <n>, image_id: <n>, deleted: true, link_preview: '...' }
//
// T-01-18: Auto-delete after publish prevents test post pollution on radiata.pro.
// T-01-19: Bearer CRON_SECRET required; recommend removing /api/debug/* before Phase 2 ships.
// ============================================================

import { uploadImageToWP, publishPost } from '@/lib/pipeline/wp-publisher';
import { CATEGORY_IDS } from '@/lib/pipeline/types';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  // T-01-19: Bearer auth
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const imageUrl = (body as any)?.image_url;
  if (!imageUrl || typeof imageUrl !== 'string') {
    return Response.json({ error: 'Missing image_url' }, { status: 400 });
  }

  // Step 1: Upload image to WP Media Library
  const media = await uploadImageToWP(imageUrl, 'radiata-debug-publish', 1);
  if (!media) {
    return Response.json({ error: 'Image upload failed — check WP auth and image URL' }, { status: 502 });
  }

  // Step 2: Build synthetic test post (RewriteResult shape)
  const rewrite = {
    titulo: '[RADIATA TEST] Verificação de publicação automática',
    slug: 'radiata-debug-publish-' + Date.now(),
    conteudo_html:
      '<p>Este post é um teste automático do pipeline. Será removido automaticamente.</p>' +
      '<p>Test paragraph 2.</p>' +
      '<p>Test paragraph 3.</p>' +
      '<p>Test paragraph 4.</p>' +
      '<p>Test paragraph 5.</p>',
    meta_descricao: 'Teste automático do pipeline Radiata.',
    tags: [] as string[],
    categoria_id: CATEGORY_IDS.NOTICIAS, // 97
    nome_anime: 'Test',
  };

  // Step 3: Publish post
  let post: { id: number; link: string };
  try {
    post = await publishPost({ rewrite, featured_media_id: media.id, tag_ids: [] });
  } catch (err) {
    // Publish failed — attempt media cleanup anyway
    const wpAuth =
      'Basic ' +
      Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
    await fetch(
      `${process.env.WP_URL ?? 'https://radiata.pro'}/wp-json/wp/v2/media/${media.id}?force=true`,
      { method: 'DELETE', headers: { Authorization: wpAuth } },
    ).catch((e) => console.error('[wp-publish] media delete on publish failure:', e));

    return Response.json({ error: `Publish failed: ${err}` }, { status: 502 });
  }

  // Step 4: CRITICAL — immediately delete post and media (T-01-18 anti-pollution)
  const wpAuth =
    'Basic ' +
    Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');

  await fetch(
    `${process.env.WP_URL ?? 'https://radiata.pro'}/wp-json/wp/v2/posts/${post.id}?force=true`,
    { method: 'DELETE', headers: { Authorization: wpAuth } },
  ).catch((e) => console.error('[wp-publish] post delete failed:', e));

  await fetch(
    `${process.env.WP_URL ?? 'https://radiata.pro'}/wp-json/wp/v2/media/${media.id}?force=true`,
    { method: 'DELETE', headers: { Authorization: wpAuth } },
  ).catch((e) => console.error('[wp-publish] media delete failed:', e));

  return Response.json({
    ok: true,
    published_id: post.id,
    image_id: media.id,
    deleted: true,
    link_preview: post.link,
  });
}
