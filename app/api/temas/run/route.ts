export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { createPipelineClient } from '@/lib/supabase/server';
import { extractArticle } from '@/lib/pipeline/extractor';
import { rewriteArticle } from '@/lib/pipeline/ai-rewriter';
import { qaReview } from '@/lib/pipeline/ai-qa';
import { fetchAnilistImages } from '@/lib/pipeline/anilist';
import { uploadImageToWP, injectImagesIntoHtml, publishPost, ensureTags } from '@/lib/pipeline/wp-publisher';
import { createRun, completeRun } from '@/lib/pipeline/state-logger';
import type { ScoredCandidate } from '@/lib/pipeline/types';

function toSlug(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 75);
}

export async function POST(req: Request): Promise<Response> {
  let body: { url?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.url) return Response.json({ error: 'URL obrigatória' }, { status: 400 });

  const supabase = createPipelineClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')); } catch {}
      };
      const log = (stage: string, message: string, level: 'info' | 'warn' | 'error' = 'info') =>
        send({ type: 'log', stage, message, level, ts: new Date().toISOString() });

      let runId: string | null = null;

      try {
        const run = await createRun(supabase, 'manual');
        runId = run.id;

        // ── Stage 1: Extract ──────────────────────────────────────────────
        log('extract', `Extraindo conteúdo de ${body.url}`);
        const article = await extractArticle(body.url!);
        log('extract', `${article.palavras} palavras · ${article.body_images.length} imagens encontradas`);

        if (article.palavras < 100) {
          log('extract', 'Conteúdo muito curto — verifique a URL', 'warn');
        }

        const domain = (() => { try { return new URL(body.url!).hostname.replace('www.', ''); } catch { return 'fonte'; } })();

        const fakeCandidate: ScoredCandidate = {
          titulo: article.texto_limpo.split('\n')[0]?.slice(0, 100) || domain,
          url: body.url!,
          data_publicacao: new Date().toISOString(),
          imagem_url: article.og_image ?? '',
          site_nome: domain,
          site_idioma: 'pt',
          site_prioridade: 3,
          site_tipo: 'BR',
          hash: Buffer.from(body.url!).toString('base64').slice(0, 32),
          slug_base: toSlug(domain + '-' + Date.now()),
          cross_ref_count: 0,
          cross_ref_sites: [],
          score_titulo: 5,
          score_site_penalty: 0,
          score_total: 5,
          score_breakdown: { score_titulo: 5, prioridade_site: 3, cross_ref: 0, cooldown: 0 },
        };

        // ── Stage 2: Rewrite ──────────────────────────────────────────────
        log('rewrite', 'Reescrevendo com Claude Sonnet 4.6...');
        const rewrite = await rewriteArticle(article, fakeCandidate);
        log('rewrite', `"${rewrite.titulo}" · ${rewrite.conteudo_html.length} chars`);

        // ── Stage 3: QA ───────────────────────────────────────────────────
        log('qa', 'Revisão de qualidade...');
        const qa = await qaReview(rewrite);
        log('qa', qa.aprovado
          ? `Aprovado · média ${qa.media}`
          : `Média ${qa.media} — aprovação ignorada (publicação manual)`, qa.aprovado ? 'info' : 'warn');

        // ── Stage 4: Images ───────────────────────────────────────────────
        const imageUrls = [...new Set([article.og_image, ...article.body_images].filter(Boolean) as string[])];

        // Garantir 2ª imagem no corpo: enriquecer com banner/capa do AniList (como no cron diário).
        if (imageUrls.length < 3) {
          const anilistImgs = await fetchAnilistImages(rewrite.nome_anime);
          const fresh = anilistImgs.filter(u => u && !imageUrls.includes(u));
          if (fresh.length > 0) {
            log('images', `AniList: +${fresh.length} imagem(ns) para o corpo`);
            imageUrls.push(...fresh);
          }
        }

        log('images', `Enviando ${Math.min(imageUrls.length, 5)} imagens para o WordPress...`);

        const uploadedImages: Array<{ id: number; source_url: string }> = [];
        for (let i = 0; i < Math.min(imageUrls.length, 5); i++) {
          const img = await uploadImageToWP(imageUrls[i], rewrite.slug, i + 1);
          if (img) {
            uploadedImages.push(img);
            log('images', `✓ ${img.source_url.split('/').pop()?.slice(0, 50)}`);
          }
        }

        if (uploadedImages.length === 0) {
          log('images', 'Nenhuma imagem disponível — post ficará sem imagem de destaque', 'warn');
        }

        // ── Stage 5: Publish ──────────────────────────────────────────────
        const [featuredImage, ...extraImages] = uploadedImages;
        const tagIds = await ensureTags(rewrite.tags);
        if (extraImages.length > 0) {
          rewrite.conteudo_html = injectImagesIntoHtml(rewrite.conteudo_html, extraImages);
        }

        log('publish', `Publicando: "${rewrite.titulo}"`);
        const publishResult = await publishPost({
          rewrite,
          featured_media_id: featuredImage?.id ?? 0,
          tag_ids: tagIds,
        });

        await supabase.from('posts').insert({
          title: rewrite.titulo,
          slug: rewrite.slug,
          wp_post_id: publishResult.id,
          published_at: new Date().toISOString(),
          source_site: domain,
          source_url: body.url,
          title_hash: fakeCandidate.hash,
          anime_name: rewrite.nome_anime,
          category_id: rewrite.categoria_id,
          system_type: 'manual',
          qa_scores: { ...qa.notas, media: qa.media },
          images: uploadedImages.map(img => ({ wp_id: img.id, url: img.source_url })),
        });

        await completeRun(supabase, runId, { status: 'success', posts_published: 1 });
        log('publish', `Publicado! ${publishResult.link}`);
        send({ type: 'done', link: publishResult.link, titulo: rewrite.titulo });

      } catch (err) {
        const msg = String(err);
        if (runId) await completeRun(supabase, runId, { status: 'failed', error_message: msg }).catch(() => {});
        send({ type: 'error', message: msg });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}
