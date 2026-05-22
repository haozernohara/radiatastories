// ============================================================
// Radiata Blog System — Debug: Force Publish from URL
// ============================================================
// Extracts, rewrites, and publishes a specific article URL,
// bypassing QA. Use to manually publish articles like Buchigire
// that fail the automated QA score threshold.
//
// POST /api/debug/force-publish
// Bearer CRON_SECRET required.
//
// Body:
//   url        — article URL to extract and rewrite (required)
//   titulo     — original title hint (optional)
//   site_nome  — source site name (optional, default: 'manual')
//   slug_base  — slug hint (optional)
//
// Returns: { ok, wp_post_id, link, titulo, rewrite_words }
// ============================================================

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { createPipelineClient } from '@/lib/supabase/server';
import { extractArticle, extractFromCrossRefs } from '@/lib/pipeline/extractor';
import { rewriteArticle } from '@/lib/pipeline/ai-rewriter';
import {
  uploadImageToWP,
  injectImagesIntoHtml,
  publishPost,
  ensureTags,
} from '@/lib/pipeline/wp-publisher';
import type { ScoredCandidate } from '@/lib/pipeline/types';

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

  if (!body?.url || typeof body.url !== 'string') {
    return Response.json({ error: 'Missing required field: url' }, { status: 400 });
  }

  const articleUrl: string = body.url;
  const siteName: string = body.site_nome ?? 'manual';
  const slugBase: string = body.slug_base ?? 'radiata-manual';

  // Step 1: Extract article
  let article;
  try {
    article = await extractArticle(articleUrl);
  } catch (err) {
    return Response.json({ error: `Extraction failed: ${err}` }, { status: 502 });
  }

  if (article.palavras < 100) {
    return Response.json({
      error: `Article too short: ${article.palavras} words extracted`,
    }, { status: 422 });
  }

  // Step 2: Build synthetic ScoredCandidate
  const candidate: ScoredCandidate = {
    titulo: body.titulo ?? 'Sem título',
    url: articleUrl,
    slug_base: slugBase,
    site_nome: siteName,
    site_idioma: 'en',
    site_prioridade: 2,
    site_tipo: 'EN',
    hash: '',
    cross_ref_count: 1,
    cross_ref_sites: [],
    score_titulo: 0,
    score_site_penalty: 0,
    score_total: 0,
    score_breakdown: {
      score_titulo: 0,
      prioridade_site: 0,
      cross_ref: 0,
      cooldown: 0,
    },
    data_publicacao: new Date().toISOString(),
    imagem_url: article.og_image ?? '',
  };

  // Step 3: Rewrite
  let rewrite;
  try {
    rewrite = await rewriteArticle(article, candidate);
  } catch (err) {
    return Response.json({ error: `Rewrite failed: ${err}` }, { status: 502 });
  }

  // Step 4: Image pipeline
  const imageUrls: string[] = [
    ...new Set(
      [article.og_image, ...article.body_images].filter(Boolean) as string[]
    ),
  ];

  // Backfill from cross-refs if fewer than 3 images
  if (imageUrls.length < 3 && body.cross_ref_urls?.length > 0) {
    const extras = await extractFromCrossRefs(
      (body.cross_ref_urls as string[]).map((url: string) => ({ url }))
    );
    imageUrls.push(...extras);
  }

  const uploadedImages: Array<{ id: number; source_url: string }> = [];
  for (let i = 0; i < Math.min(imageUrls.length, 5); i++) {
    const img = await uploadImageToWP(imageUrls[i], rewrite.slug, i + 1);
    if (img) uploadedImages.push(img);
  }

  if (uploadedImages.length === 0) {
    return Response.json({
      error: 'No valid images could be uploaded. Check image URLs in the article.',
    }, { status: 422 });
  }

  const [featuredImage, ...extraImages] = uploadedImages;

  // Step 5: Tags + inject images into HTML
  const tagIds = await ensureTags(rewrite.tags);
  rewrite.conteudo_html = injectImagesIntoHtml(rewrite.conteudo_html, extraImages);

  // Step 6: Publish
  let publishResult: { id: number; link: string };
  try {
    publishResult = await publishPost({
      rewrite,
      featured_media_id: featuredImage.id,
      tag_ids: tagIds,
    });
  } catch (err) {
    return Response.json({ error: `Publish failed: ${err}` }, { status: 502 });
  }

  // Step 7: Record in Supabase (title_hash written only after successful publish)
  const supabase = createPipelineClient();
  await supabase.from('posts').insert({
    title: rewrite.titulo,
    slug: rewrite.slug,
    wp_post_id: publishResult.id,
    published_at: new Date().toISOString(),
    score_final: 0,
    source_site: siteName,
    source_url: articleUrl,
    title_hash: Buffer.from(rewrite.titulo.toLowerCase()).toString('hex').slice(0, 32),
    anime_name: rewrite.nome_anime,
    category_id: rewrite.categoria_id,
    system_type: 'manual',
    qa_scores: null,
    images: uploadedImages.map(img => ({ wp_id: img.id, url: img.source_url })),
  });

  return Response.json({
    ok: true,
    wp_post_id: publishResult.id,
    link: publishResult.link,
    titulo: rewrite.titulo,
    rewrite_words: rewrite.conteudo_html.split(/\s+/).length,
    images_uploaded: uploadedImages.length,
  });
}
