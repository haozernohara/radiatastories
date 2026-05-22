// ============================================================
// Radiata Blog System — Debug: Extract → Rewrite → QA
// Phase 1, Plan 04
// ============================================================
// POST /api/debug/rewrite
// Bearer auth required (CRON_SECRET env var).
// Takes a live article URL and runs the full AI layer end-to-end.
//
// Body: { url: string, titulo?: string, site_nome?: string,
//         site_prioridade?: number, slug_base?: string }
// Query: ?full=1 to include full conteudo_html in response

import { extractArticle } from '@/lib/pipeline/extractor';
import { rewriteArticle } from '@/lib/pipeline/ai-rewriter';
import { qaReview } from '@/lib/pipeline/ai-qa';
import type { ScoredCandidate } from '@/lib/pipeline/types';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  // Bearer auth check
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body?.url || typeof body.url !== 'string') {
    return Response.json({ error: 'Missing required field: url' }, { status: 400 });
  }

  // Extract article from URL
  const article = await extractArticle(body.url);

  // Build a synthetic ScoredCandidate from body fields + extraction defaults
  const candidate: ScoredCandidate = {
    titulo: body.titulo ?? 'Sem título',
    url: body.url,
    slug_base: body.slug_base ?? 'test',
    site_nome: body.site_nome ?? 'test',
    site_idioma: 'pt',
    site_prioridade: body.site_prioridade ?? 2,
    site_tipo: 'BR',
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
    data_publicacao: '',
    imagem_url: article.og_image ?? '',
  };

  // Run AI rewrite
  const rewrite = await rewriteArticle(article, candidate);

  // Run QA (never throws — PIPE-17 failsafe)
  const qa = await qaReview(rewrite);

  // Build response — strip conteudo_html unless ?full=1 requested
  const showFull = new URL(request.url).searchParams.get('full') === '1';

  return Response.json({
    extract: {
      palavras: article.palavras,
      og_image: article.og_image,
    },
    rewrite: {
      titulo: rewrite.titulo,
      slug: rewrite.slug,
      word_count_html: rewrite.conteudo_html.split(/\s+/).length,
      categoria_id: rewrite.categoria_id,
      ...(showFull ? { conteudo_html: rewrite.conteudo_html } : {}),
    },
    qa: {
      aprovado: qa.aprovado,
      media: qa.media,
      ...(qa.failsafe ? { failsafe: qa.failsafe } : {}),
    },
  });
}
