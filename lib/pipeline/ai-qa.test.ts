// ============================================================
// ai-qa.test.ts — Tests for qaReviewWithClient
// Uses node:test (built-in). Does NOT call the real Anthropic API.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qaReviewWithClient, QA_SYSTEM_PROMPT } from './ai-qa.ts';
import type { RewriteResult } from './types.ts';

// --------------- Fixtures ---------------

const SAMPLE_REWRITE: RewriteResult = {
  titulo: 'One Piece: O Arco de Egghead Surpreende a Todos',
  slug: 'one-piece-arco-egghead',
  conteudo_html: '<h2>Contexto</h2><p>One Piece é uma das maiores obras do anime mundial.</p>',
  meta_descricao: 'Descubra tudo sobre o arco de Egghead de One Piece, com análises e detalhes do capítulo mais recente.',
  tags: ['One Piece', 'Eiichiro Oda', 'Toei Animation', 'anime 2024'],
  categoria_id: 97,
  nome_anime: 'One Piece',
};

// --------------- Mock client factory ---------------

function makeMockClient(responseText: string) {
  return {
    messages: {
      create: async (_opts: any) => ({
        content: [{ type: 'text', text: responseText }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 50, output_tokens: 80 },
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

test('approved when all criteria >= 7.0', async () => {
  const qaJson = JSON.stringify({
    aprovado: true,
    notas: {
      humanizacao: 8,
      coerencia: 9,
      seo_basico: 8,
      completude: 8,
      fidelidade: 9,
      portugues: 9,
    },
    media: 8.5,
    motivo_reprovacao: null,
  });

  const client = makeMockClient(qaJson);
  const result = await qaReviewWithClient(SAMPLE_REWRITE, client);

  assert.strictEqual(result.aprovado, true);
  assert.ok(result.media >= 7.0, `media should be >= 7.0, got: ${result.media}`);
  assert.strictEqual(result.failsafe, undefined, 'failsafe should not be set on success');
});

test('rejected when one criterion = 4 even if overall media >= 7', async () => {
  // humanizacao=4, but others are high enough for media >= 7
  // Media = (4+9+9+9+9+9) / 6 = 49/6 ≈ 8.17 >= 7.0
  // But min_calc = 4 < 5 → should be rejected
  const qaJson = JSON.stringify({
    aprovado: true, // model says approved, but we defensively recompute
    notas: {
      humanizacao: 4,
      coerencia: 9,
      seo_basico: 9,
      completude: 9,
      fidelidade: 9,
      portugues: 9,
    },
    media: 8.17,
    motivo_reprovacao: null,
  });

  const client = makeMockClient(qaJson);
  const result = await qaReviewWithClient(SAMPLE_REWRITE, client);

  assert.strictEqual(result.aprovado, false, 'Should be rejected because humanizacao = 4 < 5');
  assert.strictEqual(result.failsafe, undefined, 'failsafe should not be set');
});

test('returns failsafe when client throws', async () => {
  const client = makeThrowingClient(new Error('API timeout'));
  const result = await qaReviewWithClient(SAMPLE_REWRITE, client);

  assert.strictEqual(result.aprovado, true, 'failsafe should approve');
  assert.strictEqual(result.failsafe, true, 'failsafe flag must be set');
  assert.strictEqual(result.media, 8.0, 'failsafe media should be 8.0');
});

test('returns failsafe when JSON is unparseable', async () => {
  const client = makeMockClient('I cannot evaluate this content.');
  const result = await qaReviewWithClient(SAMPLE_REWRITE, client);

  assert.strictEqual(result.aprovado, true, 'failsafe should approve');
  assert.strictEqual(result.failsafe, true, 'failsafe flag must be set');
});

test('returns failsafe when notas key is missing', async () => {
  // Response is valid JSON but missing "notas" key
  const brokenJson = JSON.stringify({
    aprovado: true,
    media: 8.0,
    motivo_reprovacao: null,
    // notas is MISSING
  });

  const client = makeMockClient(brokenJson);
  const result = await qaReviewWithClient(SAMPLE_REWRITE, client);

  assert.strictEqual(result.aprovado, true, 'failsafe should approve');
  assert.strictEqual(result.failsafe, true, 'failsafe flag must be set');
});

test('failsafe result has failsafe:true', async () => {
  const client = makeThrowingClient(new Error('Connection refused'));
  const result = await qaReviewWithClient(SAMPLE_REWRITE, client);

  assert.strictEqual(result.failsafe, true);
  assert.deepStrictEqual(result.notas, {
    humanizacao: 8,
    coerencia: 8,
    seo_basico: 8,
    completude: 8,
    fidelidade: 8,
    portugues: 8,
  });
  assert.strictEqual(result.motivo_reprovacao, null);
});

test('QA_SYSTEM_PROMPT contains REVISOR DE POSTS phrase', () => {
  assert.ok(
    QA_SYSTEM_PROMPT.includes('REVISOR DE POSTS'),
    'QA system prompt must contain "REVISOR DE POSTS" (verbatim V8B content)'
  );
});

test('uses MODELS.QA as model name', async () => {
  let capturedModel: string | null = null;
  const capturingClient = {
    messages: {
      create: async (opts: any) => {
        capturedModel = opts.model;
        return {
          content: [{ type: 'text', text: JSON.stringify({
            aprovado: true,
            notas: { humanizacao: 8, coerencia: 8, seo_basico: 8, completude: 8, fidelidade: 8, portugues: 8 },
            media: 8.0,
            motivo_reprovacao: null,
          }) }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 80 },
        };
      },
    },
  };

  await qaReviewWithClient(SAMPLE_REWRITE, capturingClient);
  assert.strictEqual(capturedModel, 'claude-haiku-4-5');
});
