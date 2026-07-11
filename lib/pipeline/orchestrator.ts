// ============================================================
// Radiata Blog System — Pipeline Orchestrator
// Phase 1: Pipeline Core — Plan 06
// ============================================================
// Composes all six pipeline stages into a single cron-callable function.
// Uses dependency injection (runRssPipelineWithDeps) so tests can stub all stages.
//
// Key invariants:
//   - title_hash inserted into posts ONLY after publishPost resolves with id > 0 (Pitfall 2)
//   - Loop short-circuits on first successful publish (SCHED-03: max 1 post/run)
//   - dryRun=true stops before publishPost and returns status='skipped'
//   - completeRun always called (try/catch ensures it even on unexpected throws)
// ============================================================

import { RSS_SOURCES } from './rss-sources.ts';
import { fetchAllFeeds } from './rss-fetcher.ts';
import { getRecentHashes, getRecentlyPublishedSites, scoreCandidates } from './scorer.ts';
import { extractArticle, extractFromCrossRefs } from './extractor.ts';
import { rewriteArticle } from './ai-rewriter.ts';
import { qaReview } from './ai-qa.ts';
import { fetchAnilistImages } from './anilist.ts';
import { uploadImageToWP, injectImagesIntoHtml, injectVideoEmbed, publishPost, ensureTags } from './wp-publisher.ts';
import { buildNewsArticleSchema, ensureImageAlts, pingIndexNow } from './seo.ts';
import { createRun, completeRun, logStage, recordCandidates } from './state-logger.ts';
import type { RssSource, RssItem, ScoredCandidate, ExtractedArticle, RewriteResult, QAResult } from './types.ts';

// --------------- Types ---------------

export interface RunOptions {
  dryRun: boolean;
}

export interface RunResult {
  status: 'success' | 'failed' | 'skipped' | 'paused';
  runId: string;
  publishedPostId?: number;
  reason?: string;
}

// Deps type mirrors all injectable stage functions
export interface PipelineDeps {
  createRun: (supabase: any, systemType: string) => Promise<{ id: string; started_at: string }>;
  completeRun: (
    supabase: any,
    runId: string,
    opts: { status: 'success' | 'failed' | 'skipped' | 'paused'; posts_published?: number; candidates_found?: number; error_message?: string }
  ) => Promise<void>;
  logStage: (
    supabase: any,
    runId: string,
    stage: string,
    message: string,
    opts?: { level?: 'info' | 'warn' | 'error'; metadata?: object }
  ) => Promise<void>;
  recordCandidates: (supabase: any, runId: string, candidates: ScoredCandidate[], selectedHash?: string) => Promise<void>;
  fetchAllFeeds: (sources: RssSource[]) => Promise<RssItem[]>;
  getRecentHashes: (supabase: any) => Promise<Set<string>>;
  getRecentlyPublishedSites: (supabase: any) => Promise<string[]>;
  scoreCandidates: (items: RssItem[], recentHashes: Set<string>, recentSites: string[]) => ScoredCandidate[];
  extractArticle: (url: string) => Promise<ExtractedArticle>;
  extractFromCrossRefs: (refs: Array<{ url: string }>) => Promise<string[]>;
  fetchAnilistImages: (animeName: string) => Promise<string[]>;
  rewriteArticle: (article: ExtractedArticle, candidate: ScoredCandidate) => Promise<RewriteResult>;
  qaReview: (rewrite: RewriteResult) => Promise<QAResult>;
  uploadImageToWP: (imageUrl: string, slug: string, index: number) => Promise<{ id: number; source_url: string } | null>;
  injectImagesIntoHtml: (html: string, extras: Array<{ source_url: string }>) => string;
  injectVideoEmbed: (html: string, embedUrl: string) => string;
  publishPost: (opts: { rewrite: RewriteResult; featured_media_id: number; tag_ids: number[] }) => Promise<{ id: number; link: string }>;
  ensureTags: (tags: string[]) => Promise<number[]>;
  pingIndexNow: (url: string) => Promise<{ ok: boolean; status?: number; skipped?: boolean }>;
}

// --------------- Settings loader ---------------

async function loadSettings(supabase: any): Promise<{ paused: boolean }> {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'pipeline_paused_s1')
      .single();
    return { paused: data?.value === 'true' };
  } catch {
    return { paused: false };
  }
}

// --------------- Core orchestrator (with DI) ---------------

export async function runRssPipelineWithDeps(
  supabase: any,
  options: RunOptions,
  deps: PipelineDeps
): Promise<RunResult> {
  const run = await deps.createRun(supabase, 'rss');
  const runId = run.id;

  try {
    // Step 2: Check pause setting
    const settings = await loadSettings(supabase);
    if (settings.paused) {
      await deps.completeRun(supabase, runId, { status: 'paused' });
      return { status: 'paused', runId };
    }

    // Step 3: RSS fetch
    await deps.logStage(supabase, runId, 'rss_fetch', 'Buscando 20 feeds RSS');
    const items = await deps.fetchAllFeeds(RSS_SOURCES);
    await deps.logStage(supabase, runId, 'rss_fetch', `${items.length} artigos encontrados`);

    // Step 4: Scoring
    await deps.logStage(supabase, runId, 'scoring', 'Calculando top 3 candidatos');
    const recentHashes = await deps.getRecentHashes(supabase);
    const recentSites = await deps.getRecentlyPublishedSites(supabase);
    const top3 = deps.scoreCandidates(items, recentHashes, recentSites);
    await deps.recordCandidates(supabase, runId, top3);

    // Step 5: No candidates
    if (top3.length === 0) {
      await deps.completeRun(supabase, runId, {
        status: 'failed',
        error_message: 'Nenhum candidato elegível',
        candidates_found: 0,
      });
      return { status: 'failed', runId, reason: 'no eligible candidates' };
    }

    await deps.logStage(supabase, runId, 'scoring', `${top3.length} candidatos selecionados`);

    // Step 6: Candidate loop — stop on first success (SCHED-03)
    candidate_loop: for (const candidate of top3) {
      try {
        // 6a: Extract
        await deps.logStage(supabase, runId, 'extract', `Extraindo: ${candidate.url}`);
        const article = await deps.extractArticle(candidate.url);
        if (article.palavras < 200) {
          await deps.logStage(supabase, runId, 'extract', `Artigo muito curto (${article.palavras} palavras) — pulando`, { level: 'warn' });
          continue candidate_loop;
        }

        // 6c: Rewrite
        await deps.logStage(supabase, runId, 'rewrite', `Reescrevendo: ${candidate.titulo}`);
        let rewrite: RewriteResult;
        try {
          rewrite = await deps.rewriteArticle(article, candidate);
        } catch (err) {
          await deps.logStage(supabase, runId, 'rewrite', `Falha na reescrita: ${String(err)}`, { level: 'error' });
          continue candidate_loop;
        }

        // 6d: QA
        await deps.logStage(supabase, runId, 'qa', 'Revisão de qualidade');
        const qa = await deps.qaReview(rewrite);
        if (!qa.aprovado) {
          await deps.logStage(
            supabase, runId, 'qa',
            `QA reprovado: média ${qa.media} — ${qa.motivo_reprovacao ?? 'sem motivo'}`,
            { level: 'warn' }
          );
          continue candidate_loop;
        }

        // 6e: DRY RUN — stop before any WP mutation
        if (options.dryRun) {
          await deps.logStage(supabase, runId, 'publish', 'DRY_RUN — publicação simulada (sem postagem real)');
          await supabase
            .from('candidates')
            .update({ selected: true, status: 'selected' })
            .eq('run_id', runId)
            .eq('url', candidate.url);
          await deps.completeRun(supabase, runId, {
            status: 'skipped',
            posts_published: 0,
            candidates_found: top3.length,
          });
          return { status: 'skipped', runId };
        }

        // 6f: Image pipeline — AniList é a fonte PRIMÁRIA (anime certo garantido).
        // NUNCA usar article.body_images: são a origem de thumbnails de "posts
        // relacionados" de OUTROS animes (ex.: Frieren num post de Mushoku Tensei).
        const anilistImgs = await deps.fetchAnilistImages(rewrite.nome_anime);
        const imageUrls: string[] = [...new Set(anilistImgs.filter(Boolean))];
        if (imageUrls.length > 0) {
          await deps.logStage(supabase, runId, 'publish', `AniList: ${imageUrls.length} imagem(ns) do anime "${rewrite.nome_anime}"`);
        }
        // Garante uma 2ª imagem DISTINTA da destacada: quando o AniList só devolveu 1
        // (sem bannerImage) ou nada (caso de games, que não existem no AniList), completa
        // com a og:image da fonte — a imagem principal do próprio artigo, que é coerente
        // com a notícia. NUNCA usar article.body_images (origem do bug de anime errado).
        if (imageUrls.length < 2 && article.og_image && !imageUrls.includes(article.og_image)) {
          imageUrls.push(article.og_image);
          await deps.logStage(
            supabase, runId, 'publish',
            imageUrls.length === 1
              ? 'AniList vazio — usando a imagem principal da fonte'
              : 'Completando 2ª imagem (distinta) com a imagem da fonte',
            { level: imageUrls.length === 1 ? 'warn' : 'info' }
          );
        }

        const uploadedImages: Array<{ id: number; source_url: string }> = [];
        for (let i = 0; i < Math.min(imageUrls.length, 5); i++) {
          const img = await deps.uploadImageToWP(imageUrls[i], rewrite.slug, i + 1);
          if (img) uploadedImages.push(img);
        }

        if (uploadedImages.length === 0) {
          await deps.logStage(supabase, runId, 'publish', 'Nenhuma imagem válida — pulando candidato', { level: 'warn' });
          continue candidate_loop;
        }

        const [featuredImage, ...extraImages] = uploadedImages;

        // 6g: Tags
        const tagIds = await deps.ensureTags(rewrite.tags);

        // 6h: Inject extra images into HTML
        rewrite.conteudo_html = deps.injectImagesIntoHtml(rewrite.conteudo_html, extraImages);

        // 6h-bis: Inject the source trailer (YouTube) when the article had one.
        // videos_embed was extracted but previously dropped — fans want the trailer.
        if (article.videos_embed.length > 0) {
          rewrite.conteudo_html = deps.injectVideoEmbed(rewrite.conteudo_html, article.videos_embed[0]);
          await deps.logStage(supabase, runId, 'publish', 'Trailer do YouTube injetado no corpo');
        }

        // 6h-ter: Camada de SEO/GEO — alt nas imagens + schema NewsArticle (JSON-LD).
        // Faz Google e as IAs (AI Overviews/ChatGPT/Perplexity/Gemini) entenderem o post.
        rewrite.conteudo_html = ensureImageAlts(rewrite.conteudo_html, rewrite.nome_anime);
        rewrite.conteudo_html += buildNewsArticleSchema({
          titulo: rewrite.titulo,
          slug: rewrite.slug,
          meta: rewrite.meta_descricao,
          imageUrl: featuredImage.source_url ?? null,
          isoDate: new Date().toISOString(),
        });

        // 6i: Publish
        await deps.logStage(supabase, runId, 'publish', `Publicando: ${rewrite.titulo}`);
        let publishResult: { id: number; link: string };
        try {
          publishResult = await deps.publishPost({
            rewrite,
            featured_media_id: featuredImage.id,
            tag_ids: tagIds,
          });
        } catch (err) {
          await deps.logStage(supabase, runId, 'publish', `Falha na publicação: ${String(err)}`, { level: 'error' });
          continue candidate_loop;
        }

        // 6j: SUCCESS — title_hash written ONLY after confirmed publish (Pitfall 2)
        await supabase.from('posts').insert({
          title: rewrite.titulo,
          slug: rewrite.slug,
          wp_post_id: publishResult.id,
          published_at: new Date().toISOString(),
          score_final: candidate.score_total,
          source_site: candidate.site_nome,
          source_url: candidate.url,
          title_hash: candidate.hash,
          anime_name: rewrite.nome_anime,
          category_id: rewrite.categoria_id,
          system_type: 'rss',
          qa_scores: { ...qa.notas, media: qa.media, failsafe: qa.failsafe ?? false },
          images: uploadedImages.map(img => ({ wp_id: img.id, url: img.source_url })),
        });

        await supabase
          .from('candidates')
          .update({ selected: true, status: 'published' })
          .eq('run_id', runId)
          .eq('url', candidate.url);

        await deps.completeRun(supabase, runId, {
          status: 'success',
          posts_published: 1,
          candidates_found: top3.length,
        });

        await deps.logStage(supabase, runId, 'publish', `Publicado com sucesso: ${publishResult.link}`, {
          metadata: { wp_post_id: publishResult.id, link: publishResult.link },
        });

        // 6k: IndexNow — indexação instantânea (Bing/Yandex/etc). Best-effort.
        const idx = await deps.pingIndexNow(publishResult.link);
        await deps.logStage(
          supabase, runId, 'seo',
          idx.skipped ? 'IndexNow não configurado (pulado)' : `IndexNow: ${idx.ok ? 'enviado' : 'falhou'}${idx.status ? ` (${idx.status})` : ''}`,
          { level: idx.ok || idx.skipped ? 'info' : 'warn' }
        );

        return { status: 'success', runId, publishedPostId: publishResult.id };

      } catch (err) {
        await deps.logStage(
          supabase, runId, 'error',
          `Erro inesperado no candidato ${candidate.titulo}: ${String(err)}`,
          { level: 'error' }
        );
        continue candidate_loop;
      }
    }

    // Step 7: All candidates failed
    await deps.completeRun(supabase, runId, {
      status: 'failed',
      error_message: 'Todos os candidatos falharam',
      candidates_found: top3.length,
    });
    return { status: 'failed', runId, reason: 'all candidates failed' };

  } catch (err) {
    await deps.completeRun(supabase, runId, {
      status: 'failed',
      error_message: String(err),
    });
    return { status: 'failed', runId, reason: String(err) };
  }
}

// --------------- Public API (real deps) ---------------

export function runRssPipeline(
  supabase: any,
  options: RunOptions,
  callbacks?: { onRunCreated?: (runId: string) => void }
): Promise<RunResult> {
  return runRssPipelineWithDeps(supabase, options, {
    createRun: async (supabase: any, systemType: string) => {
      const run = await createRun(supabase, systemType);
      callbacks?.onRunCreated?.(run.id);
      return run;
    },
    completeRun,
    logStage,
    recordCandidates,
    fetchAllFeeds,
    getRecentHashes,
    getRecentlyPublishedSites,
    scoreCandidates,
    extractArticle,
    extractFromCrossRefs,
    fetchAnilistImages,
    rewriteArticle,
    qaReview,
    uploadImageToWP,
    injectImagesIntoHtml,
    injectVideoEmbed,
    publishPost,
    ensureTags,
    pingIndexNow,
  });
}
