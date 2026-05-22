// ============================================================
// Radiata Blog System — Shared TypeScript Types
// Phase 1: Pipeline Core
// ============================================================

// --------------- Source Definitions ---------------

export interface RssSource {
  nome: string;
  url: string;
  idioma: 'ja' | 'en' | 'pt';
  prioridade: 1 | 2 | 3;
  tipo: 'JP' | 'EN' | 'BR';
}

// --------------- Pipeline Data Shapes ---------------

export interface RssItem {
  titulo: string;
  url: string;
  data_publicacao: string;
  imagem_url: string;
  site_nome: string;
  site_idioma: string;
  site_prioridade: number;
  site_tipo: string;
}

export interface ScoredCandidate extends RssItem {
  hash: string;
  slug_base: string;
  cross_ref_count: number;
  cross_ref_sites: string[];
  score_titulo: number;
  score_site_penalty: number;
  score_total: number;
  score_breakdown: {
    score_titulo: number;
    prioridade_site: number;
    cross_ref: number;
    cooldown: number;
  };
}

export interface ExtractedArticle {
  texto_limpo: string;
  palavras: number;
  og_image: string | null;
  body_images: string[];
  videos_embed: string[];
}

export interface RewriteResult {
  titulo: string;
  slug: string;
  conteudo_html: string;
  meta_descricao: string;
  tags: string[];
  categoria_id: number;
  nome_anime: string;
}

export interface QAResult {
  aprovado: boolean;
  notas: {
    humanizacao: number;
    coerencia: number;
    seo_basico: number;
    completude: number;
    fidelidade: number;
    portugues: number;
  };
  media: number;
  motivo_reprovacao: string | null;
  failsafe?: boolean;
}

// --------------- Database Row Shapes ---------------

export interface PipelineRun {
  id: string;
  system_type: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed' | 'skipped' | 'paused';
  posts_published: number;
  candidates_found: number;
  error_message: string | null;
  locked_at: string | null;
}

export interface PublishedPost {
  id: string;
  title: string;
  slug: string;
  wp_post_id: number;
  published_at: string;
  score_final: number | null;
  source_site: string | null;
  source_url: string | null;
  title_hash: string;
  anime_name: string | null;
  category_id: number | null;
  system_type: string;
  qa_scores: Record<string, number> | null;
  images: Array<{ wp_id: number; url: string; filename: string }> | null;
  created_at: string;
}

// --------------- Constants ---------------

export const MODELS = {
  REWRITE: 'claude-sonnet-4-6',
  QA: 'claude-haiku-4-5',
} as const;

export const CATEGORY_IDS = {
  NOTICIAS: 97,
  GUIA_TEMPORADA: 109,
  MANGAS: 108,
  ANIMES: 9,
  ACAO: 100,
  COMEDIA: 102,
  FANTASIA: 103,
  ISEKAI: 104,
  ROMANCE: 101,
  TERROR: 99,
  ECCHI: 106,
  HENTAI: 105,
} as const;
