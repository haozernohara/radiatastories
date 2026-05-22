// ============================================================
// Radiata Blog System — Debug: Fix Post Images
// ============================================================
// Uploads extra images to WP Media and injects them into the
// body of an existing post. Used to retrofit post 2091 (Frieren)
// which was published with only a featured image and no body images.
//
// POST /api/debug/fix-post-images
// Bearer CRON_SECRET required.
//
// Body:
//   wp_post_id   — WordPress post ID to update (required, e.g. 2091)
//   image_urls   — array of image URLs to upload (required, 2-4 items)
//   slug         — slug used for SEO filename (optional, default: post-{id})
//
// Returns: { ok, wp_post_id, images_injected, updated_link }
// ============================================================

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

import { uploadImageToWP, injectImagesIntoHtml, updatePostContent } from '@/lib/pipeline/wp-publisher';

const WP_URL = process.env.WP_URL ?? 'https://radiata.pro';

function wpAuthHeader(): string {
  return (
    'Basic ' +
    Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64')
  );
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const wpPostId: number = Number(body?.wp_post_id);
  const imageUrls: string[] = Array.isArray(body?.image_urls) ? body.image_urls : [];

  if (!wpPostId || wpPostId <= 0) {
    return Response.json({ error: 'Missing or invalid wp_post_id' }, { status: 400 });
  }
  if (imageUrls.length === 0) {
    return Response.json({ error: 'image_urls must be a non-empty array' }, { status: 400 });
  }

  const slug: string = body?.slug ?? `post-${wpPostId}`;

  // Step 1: Fetch current post content from WP API
  let currentContent: string;
  try {
    const res = await fetch(
      `${WP_URL}/wp-json/wp/v2/posts/${wpPostId}?context=edit`,
      {
        headers: {
          Authorization: wpAuthHeader(),
          'User-Agent': 'Radiata-Pipeline/1.0',
        },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) {
      return Response.json(
        { error: `WP fetch post failed: ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    currentContent = data?.content?.raw ?? data?.content?.rendered ?? '';
    if (!currentContent) {
      return Response.json({ error: 'Post content is empty or unavailable' }, { status: 422 });
    }
  } catch (err) {
    return Response.json({ error: `WP fetch post error: ${err}` }, { status: 502 });
  }

  // Step 2: Upload images to WP Media Library
  const uploaded: Array<{ id: number; source_url: string }> = [];
  for (let i = 0; i < Math.min(imageUrls.length, 4); i++) {
    const img = await uploadImageToWP(imageUrls[i], slug, i + 1);
    if (img) uploaded.push(img);
  }

  if (uploaded.length === 0) {
    return Response.json({
      error: 'No images could be uploaded — check URLs and WP auth',
    }, { status: 422 });
  }

  // Step 3: Inject figures into post content
  const updatedContent = injectImagesIntoHtml(currentContent, uploaded);

  // Step 4: Update post via WP API
  try {
    await updatePostContent(wpPostId, updatedContent);
  } catch (err) {
    return Response.json({ error: `Post update failed: ${err}` }, { status: 502 });
  }

  return Response.json({
    ok: true,
    wp_post_id: wpPostId,
    images_injected: uploaded.length,
    uploaded_media_ids: uploaded.map(img => img.id),
    post_link: `${WP_URL}/?p=${wpPostId}`,
  });
}
