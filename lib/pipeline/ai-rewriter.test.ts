// ============================================================
// ai-rewriter.test.ts — Tests for rewriteArticleWithClient
// Uses node:test (built-in). Does NOT call the real Anthropic API.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteArticleWithClient, REWRITE_SYSTEM_PROMPT } from './ai-rewriter.ts';
import type { ExtractedArticle, ScoredCandidate } from './types.ts';

// --------------- Fixtures ---------------

const SAMPLE_ARTICLE: ExtractedArticle = {
  texto_limpo: 'One Piece está de volta com um capítulo incrível sobre o arco de Egghead.',
  palavras: 14,
  og_image: 'https://example.com/img.jpg',
  body_images: [],
  videos_embed: [],
};

const SAMPLE_CANDIDATE: ScoredCandidate = {
  titulo: 'One Piece Chapter 1100 Release Date and Spoilers',
  url: 'https://crunchyroll.com/one-piece-1100',
  site_nome: 'crunchyroll_en',
  site_idioma: 'en',
  site_prioridade: 2,
  site_tipo: 'EN',
  hash: 'abc123',
  slug_base: 'one-piece-capitulo-1100',
  cross_ref_count: 3,
  cross_ref_sites: ['animenewsnetwork', 'myanimelist'],
  score_titulo: 10,
  score_site_penalty: 0,
  score_total: 45,
  score_breakdown: { score_titulo: 10, prioridade_site: 20, cross_ref: 15, cooldown: 0 },
  data_publicacao: '2024-01-01T00:00:00Z',
  imagem_url: 'https://example.com/img.jpg',
};

const VALID_REWRITE_JSON = JSON.stringify({
  titulo: 'One Piece: O Capítulo Incrível de Egghead',
  slug: 'one-piece-capitulo-egghead',
  conteudo_html: '<h2>Contexto</h2><p>One Piece é uma das maiores obras do anime.</p>',
  meta_descricao: 'Confira tudo sobre o novo capítulo de One Piece no arco de Egghead com detalhes e análises.',
  tags: ['One Piece', 'Eiichiro Oda', 'Toei Animation', 'anime 2024'],
  categoria_id: 97,
  nome_anime: 'One Piece',
});

// --------------- Mock client factory ---------------

function makeMockClient(responseText: string) {
  return {
    messages: {
      create: async (_opts: any) => ({
        content: [{ type: 'text', text: responseText }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    },
  };
}

function makeThrowingClient(error: Error) {
  return {
    messages: {
      create: async (_opts: any) => {
        throw error;
      },
    },
  };
}

// --------------- Tests ---------------

test('parses valid mock response and returns RewriteResult', async () => {
  const client = makeMockClient(VALID_REWRITE_JSON);
  const result = await rewriteArticleWithClient(SAMPLE_ARTICLE, SAMPLE_CANDIDATE, client);

  assert.strictEqual(result.titulo, 'One Piece: O Capítulo Incrível de Egghead');
  assert.strictEqual(result.slug, 'one-piece-capitulo-egghead');
  assert.strictEqual(result.categoria_id, 97);
  assert.strictEqual(result.nome_anime, 'One Piece');
  assert.ok(Array.isArray(result.tags), 'tags should be an array');
  assert.ok(typeof result.conteudo_html === 'string');
  assert.ok(typeof result.meta_descricao === 'string');
});

test('throws when response is missing a required key (titulo)', async () => {
  const incompleteJson = JSON.stringify({
    // titulo is MISSING
    slug: 'one-piece-capitulo-egghead',
    conteudo_html: '<p>Conteúdo</p>',
    meta_descricao: 'Meta descrição de 145 caracteres para o post sobre One Piece no arco de Egghead.',
    tags: ['One Piece'],
    categoria_id: 97,
    nome_anime: 'One Piece',
  });

  const client = makeMockClient(incompleteJson);

  await assert.rejects(
    () => rewriteArticleWithClient(SAMPLE_ARTICLE, SAMPLE_CANDIDATE, client),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('titulo'), `Expected error about "titulo", got: ${err.message}`);
      return true;
    }
  );
});

test('throws when response is not valid JSON', async () => {
  const client = makeMockClient('Sorry, I cannot help with that request.');

  await assert.rejects(
    () => rewriteArticleWithClient(SAMPLE_ARTICLE, SAMPLE_CANDIDATE, client),
    (err: any) => {
      assert.ok(err instanceof Error);
      return true;
    }
  );
});

test('user prompt contains candidate.titulo substitution', async () => {
  let capturedOpts: any = null;
  const capturingClient = {
    messages: {
      create: async (opts: any) => {
        capturedOpts = opts;
        return {
          content: [{ type: 'text', text: VALID_REWRITE_JSON }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 200 },
        };
      },
    },
  };

  await rewriteArticleWithClient(SAMPLE_ARTICLE, SAMPLE_CANDIDATE, capturingClient);

  assert.ok(capturedOpts !== null, 'client.messages.create should have been called');
  const userContent = capturedOpts.messages[0].content as string;
  assert.ok(
    userContent.includes(SAMPLE_CANDIDATE.titulo),
    `Expected prompt to include candidate titulo "${SAMPLE_CANDIDATE.titulo}"`
  );
});

test('REWRITE_SYSTEM_PROMPT contains IDENTIDADE DO BLOG phrase', () => {
  assert.ok(
    REWRITE_SYSTEM_PROMPT.includes('IDENTIDADE DO BLOG'),
    'System prompt must contain "IDENTIDADE DO BLOG" (verbatim V8B content)'
  );
});

test('uses MODELS.REWRITE as model name', async () => {
  let capturedModel: string | null = null;
  const capturingClient = {
    messages: {
      create: async (opts: any) => {
        capturedModel = opts.model;
        return {
          content: [{ type: 'text', text: VALID_REWRITE_JSON }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 200 },
        };
      },
    },
  };

  await rewriteArticleWithClient(SAMPLE_ARTICLE, SAMPLE_CANDIDATE, capturingClient);

  assert.strictEqual(capturedModel, 'claude-sonnet-4-6');
});
