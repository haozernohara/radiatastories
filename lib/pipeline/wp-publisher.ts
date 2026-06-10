// ============================================================
// Radiata Blog System — WordPress Publisher
// Phase 1: Pipeline Core — Plan 05
// ============================================================
// Handles all WordPress REST API interactions:
//   - Image download, validation, SEO rename, and upload (PIPE-09, PIPE-10, PIPE-11)
//   - HTML body image injection after 2nd and 4th <p> (PIPE-12)
//   - Post publishing with featured_media, categories, tags (PIPE-18)
//   - Tag lookup / create
//   - Auth test helper for Vercel WP connectivity verification
//
// Critical pitfalls avoided:
//   - Content-Type header NOT set manually for FormData (auto-set with boundary)
//   - id > 0 checked on both media upload and post publish (STATE.md pitfall 5)
//   - Image Content-Type validated before upload (PIPE-10)
//   - Image size validated > 5KB before upload (PIPE-10)
// ============================================================

import type { RewriteResult } from './types';

// --------------- Auth helper (internal) ---------------

const WP_URL = process.env.WP_URL ?? 'https://radiata.pro';

function wpAuthHeader(): string {
  return (
    'Basic ' +
    Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64')
  );
}

// --------------- Auth test ---------------

/**
 * Verifies that Basic Auth from this server context reaches radiata.pro.
 * Used by the /api/debug/wp-auth route to confirm Cloudflare WAF does not
 * strip Authorization headers from Vercel's IP range (STATE.md critical pitfall).
 */
export async function testWpAuth(): Promise<{
  ok: boolean;
  status: number;
  userName?: string;
  body?: string;
}> {
  let res: Response;
  try {
    res = await fetch(`${WP_URL}/wp-json/wp/v2/users/me?context=edit`, {
      headers: {
        Authorization: wpAuthHeader(),
        'User-Agent': 'Radiata-Pipeline/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { ok: false, status: 0, body: String(err).slice(0, 500) };
  }

  if (res.status === 200) {
    const data = await res.json();
    return { ok: true, status: 200, userName: data.name };
  }

  const text = await res.text().catch(() => '');
  return { ok: false, status: res.status, body: text.slice(0, 500) };
}

// --------------- SEO filename helper ---------------

/**
 * Generates SEO-friendly filename from slug, index, and content-type.
 * Pattern: {slug}-{n}-radiata.{ext} (PIPE-09)
 */
export function seoFilename(slug: string, index: number, contentType: string): string {
  let ext: string;
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    ext = 'jpg';
  } else if (contentType === 'image/webp') {
    ext = 'webp';
  } else if (contentType === 'image/png') {
    ext = 'png';
  } else {
    // Fallback: derive from content-type or default to jpg
    const raw = contentType.split('/')[1];
    ext = raw ? raw.replace('jpeg', 'jpg') : 'jpg';
  }
  return `${slug}-${index}-radiata.${ext}`;
}

// --------------- Image upload ---------------

/**
 * Downloads an image from imageUrl, validates it, SEO-renames it, and uploads
 * it to the WordPress Media Library. Returns {id, source_url} on success, null
 * on any validation or upload failure.
 *
 * Validations (PIPE-10):
 *   - Content-Type must start with 'image/'
 *   - Buffer size must be >= 5120 bytes (>5KB)
 * Upload (PIPE-11):
 *   - Multipart FormData — Content-Type NOT set manually (boundary auto-appended)
 *   - response.id must be > 0 before trusting the result
 */
export async function uploadImageToWP(
  imageUrl: string,
  slug: string,
  index: number,
): Promise<{ id: number; source_url: string } | null> {
  let imgRes: Response;
  try {
    imgRes = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'Mozilla/5.0' }, // avoid CDN bot-block
    });
  } catch (err) {
    console.warn(`[wp-publisher] Failed to fetch image ${imageUrl}:`, err);
    return null;
  }

  if (!imgRes.ok) {
    console.warn(`[wp-publisher] Image fetch failed: ${imgRes.status} for ${imageUrl}`);
    return null;
  }

  // PIPE-10: Validate Content-Type
  const contentType = imgRes.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    console.warn(`[wp-publisher] Skipping ${imageUrl}: Content-Type is "${contentType}" (not image/*)`);
    return null;
  }

  // PIPE-10: Validate size > 5KB
  const buffer = await imgRes.arrayBuffer();
  if (buffer.byteLength < 5120) {
    console.warn(`[wp-publisher] Skipping ${imageUrl}: too small (${buffer.byteLength} bytes < 5120)`);
    return null;
  }

  // PIPE-09: SEO rename
  const filename = seoFilename(slug, index, contentType);

  // Build FormData — do NOT set Content-Type header (fetch adds boundary automatically)
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: contentType }), filename);

  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: wpAuthHeader(),
        // No Content-Type — fetch sets multipart/form-data + boundary automatically
      },
      body: fd,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error(`[wp-publisher] Media upload request failed for ${filename}:`, err);
    return null;
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    console.error(`[wp-publisher] Media upload failed: ${uploadRes.status} — ${errText.slice(0, 300)}`);
    return null;
  }

  const data = await uploadRes.json();

  // PIPE-11: Verify id > 0
  if (!data.id || data.id <= 0) {
    console.error('[wp-publisher] Media upload returned invalid id:', data.id);
    return null;
  }

  return { id: data.id, source_url: data.source_url };
}

// --------------- HTML body image injection ---------------

/**
 * Injects additional images into the HTML content body after the 2nd and 4th
 * </p> tags. Pure function — no IO. (PIPE-12)
 *
 * Implementation: split on </p> to get paragraph chunks, insert <figure> elements
 * at the correct positions, then re-join with </p>.
 *
 * @param html         - HTML string (post content)
 * @param extras       - Array of {source_url} objects from uploaded extra images
 * @returns            - Modified HTML string
 */
export function injectImagesIntoHtml(
  html: string,
  extras: Array<{ source_url: string }>,
): string {
  if (extras.length === 0) return html;

  // Split on </p>; each chunk is text content before a </p> tag
  const chunks = html.split('</p>');

  // Need at least 3 chunks for 2 paragraphs (chunk[0] + </p> + chunk[1] + </p> + rest)
  // Need at least 5 chunks for 4 paragraphs

  // Inject up to 3 body images: after the 2nd, 4th, and 6th </p> tags.
  // Each splice shifts subsequent indices by +1, so positions are adjusted cumulatively.
  const insertions = [
    { extra: extras[0], minChunks: 3, pos: 2 },
    { extra: extras[1], minChunks: 5, pos: 5 },
    { extra: extras[2], minChunks: 7, pos: 8 },
  ];

  let offset = 0;
  for (const { extra, minChunks, pos } of insertions) {
    if (!extra) break;
    if (chunks.length < minChunks + offset) break;
    const figure = `<figure class='wp-block-image'><img src='${extra.source_url}' alt='' /></figure>`;
    chunks.splice(pos + offset, 0, figure);
    offset++;
  }

  return chunks.join('</p>');
}

/**
 * Injects a single YouTube trailer embed into the HTML body.
 * Pure function — no IO. The trailer comes from the source article's
 * extracted videos_embed (a https://www.youtube.com/embed/{id} URL).
 *
 * Inserted after the 3rd </p> when the body is long enough, otherwise appended,
 * so it sits between paragraphs and not before the lead. No-op when embedUrl is
 * empty or already present (idempotent — safe to call twice).
 */
export function injectVideoEmbed(html: string, embedUrl: string): string {
  if (!embedUrl) return html;
  if (html.includes(embedUrl)) return html;

  const figure =
    `<figure class='wp-block-embed is-type-video is-provider-youtube'>` +
    `<div class='wp-block-embed__wrapper'>` +
    `<iframe width='560' height='315' src='${embedUrl}' title='Trailer' ` +
    `frameborder='0' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' ` +
    `allowfullscreen loading='lazy'></iframe></div></figure>`;

  const chunks = html.split('</p>');
  if (chunks.length <= 1) return html + figure;

  const pos = chunks.length >= 4 ? 3 : chunks.length - 1;
  chunks.splice(pos, 0, figure);
  return chunks.join('</p>');
}

// --------------- Post publisher ---------------

/**
 * Publishes a full WordPress post with featured image, categories, and tags.
 * Throws if the publish fails or returns an invalid id. (PIPE-18)
 *
 * id > 0 is verified before returning (STATE.md critical pitfall 5).
 */
export async function publishPost(opts: {
  rewrite: RewriteResult;
  featured_media_id: number;
  tag_ids: number[];
}): Promise<{ id: number; link: string }> {
  const { rewrite, featured_media_id, tag_ids } = opts;

  const body = {
    title: rewrite.titulo,
    content: rewrite.conteudo_html,
    status: 'publish',
    featured_media: featured_media_id,
    categories: [rewrite.categoria_id],
    tags: tag_ids,
    slug: rewrite.slug,
    excerpt: rewrite.meta_descricao,
  };

  let res: Response;
  try {
    res = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: wpAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    throw new Error(`WP publish request failed: ${err}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`WP publish failed: ${res.status} — ${errText.slice(0, 300)}`);
  }

  const data = await res.json();

  // PIPE-18 + STATE.md pitfall 5: verify id > 0
  if (!data.id || data.id <= 0) {
    throw new Error(`WP publish returned invalid id: ${data.id}`);
  }

  return { id: data.id, link: data.link };
}

// --------------- Post update ---------------

/**
 * Updates an existing WordPress post's content via PATCH.
 * Used to inject images into already-published posts.
 */
export async function updatePostContent(wpPostId: number, content: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${WP_URL}/wp-json/wp/v2/posts/${wpPostId}`, {
      method: 'PATCH',
      headers: {
        Authorization: wpAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new Error(`WP update post request failed: ${err}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`WP update post failed: ${res.status} — ${errText.slice(0, 300)}`);
  }
}

// --------------- Tag helper ---------------

/**
 * Looks up or creates WordPress tags by name. Returns an array of tag IDs.
 * Uses slugified tag names for lookup to avoid duplicate tag creation.
 */
export async function ensureTags(tags: string[]): Promise<number[]> {
  const ids: number[] = [];

  for (const tag of tags) {
    // Slugify: lowercase, strip accents, spaces to hyphens, remove non-alphanumeric
    const slugified = tag
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    if (!slugified) continue;

    // Look up existing tag
    let lookupRes: Response;
    try {
      lookupRes = await fetch(`${WP_URL}/wp-json/wp/v2/tags?slug=${encodeURIComponent(slugified)}`, {
        headers: { Authorization: wpAuthHeader() },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.warn(`[wp-publisher] Tag lookup failed for "${tag}":`, err);
      continue;
    }

    if (!lookupRes.ok) {
      console.warn(`[wp-publisher] Tag lookup HTTP ${lookupRes.status} for "${tag}"`);
      continue;
    }

    const existing = await lookupRes.json();

    if (Array.isArray(existing) && existing.length > 0) {
      ids.push(existing[0].id);
      continue;
    }

    // Create new tag
    let createRes: Response;
    try {
      createRes = await fetch(`${WP_URL}/wp-json/wp/v2/tags`, {
        method: 'POST',
        headers: {
          Authorization: wpAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: tag, slug: slugified }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.warn(`[wp-publisher] Tag create failed for "${tag}":`, err);
      continue;
    }

    if (!createRes.ok) {
      console.warn(`[wp-publisher] Tag create HTTP ${createRes.status} for "${tag}"`);
      continue;
    }

    const created = await createRes.json();
    if (created.id > 0) {
      ids.push(created.id);
    }
  }

  return ids;
}
