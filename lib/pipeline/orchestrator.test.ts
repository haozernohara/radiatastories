// ============================================================
// Radiata Blog System — Orchestrator Tests
// Phase 1: Pipeline Core — Plan 06
// ============================================================
// Uses node:test with fully stubbed deps (no network, no Anthropic, no WP).
// Covers all 6 specified scenarios.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runRssPipelineWithDeps } from './orchestrator.ts';
import type { PipelineDeps } from './orchestrator.ts';
import type { ScoredCandidate, ExtractedArticle, RewriteResult, QAResult } from './types.ts';

// --------------- Shared test fixtures ---------------

function makeCandidate(overrides: Partial<ScoredCandidate> = {}): ScoredCandidate {
  return {
    titulo: 'Test Anime Announcement',
    url: 'https://example.com/article-1',
    data_publicacao: new Date().toISOString(),
    imagem_url: 'https://example.com/img.jpg',
    site_nome: 'ANN',
    site_idioma: 'en',
    site_prioridade: 2,
    site_tipo: 'EN',
    hash: 'hash-abc-1',
    slug_base: 'test-anime-announcement',
    cross_ref_count: 2,
    cross_ref_sites: ['https://cr.com'],
    score_titulo: 30,
    score_site_penalty: 0,
    score_total: 50,
    score_breakdown: { score_titulo: 30, prioridade_site: 20, cross_ref: 0, cooldown: 0 },
    ...overrides,
  };
}

function makeArticle(overrides: Partial<ExtractedArticle> = {}): ExtractedArticle {
  return {
    texto_limpo: 'A '.repeat(300), // > 200 words
    palavras: 300,
    og_image: 'https://example.com/og.jpg',
    body_images: ['https://example.com/b1.jpg', 'https://example.com/b2.jpg'],
    videos_embed: [],
    ...overrides,
  };
}

function makeRewrite(overrides: Partial<RewriteResult> = {}): RewriteResult {
  return {
    titulo: 'Anime Reescrito em PT-BR',
    slug: 'anime-reescrito-pt-br',
    conteudo_html: '<p>Conteúdo do post.</p><p>Mais texto.</p><p>Terceiro paragrafo.</p>',
    meta_descricao: 'Meta descricao do post de anime com 150 chars aproximadamente para o SEO.',
    tags: ['anime', 'anuncio'],
    categoria_id: 97,
    nome_anime: 'Test Anime',
    ...overrides,
  };
}

function makeQA(overrides: Partial<QAResult> = {}): QAResult {
  return {
    aprovado: true,
    notas: { humanizacao: 8, coerencia: 8, seo_basico: 8, completude: 8, fidelidade: 8, portugues: 8 },
    media: 8.0,
    motivo_reprovacao: null,
    ...overrides,
  };
}

// --------------- Supabase mock factory ---------------

interface MockSupabaseCalls {
  postsInserted: any[];
  candidatesUpdated: any[];
  settingKey?: string;
}

function makeMockSupabase(
  pausedValue: string = 'false',
  calls: MockSupabaseCalls = { postsInserted: [], candidatesUpdated: [] }
): any {
  return {
    from: (table: string) => ({
      select: (col?: string) => ({
        eq: (k: string, v: string) => ({
          single: async () => ({
            data: table === 'settings' ? { value: pausedValue } : null,
            error: null,
          }),
        }),
        order: () => ({ limit: async () => ({ data: [], error: null }) }),
        gte: () => ({ data: [], error: null }),
      }),
      insert: async (row: any) => {
        if (table === 'posts') calls.postsInserted.push(row);
        return { data: null, error: null };
      },
      update: (values: any) => ({
        eq: (k1: string, v1: string) => ({
          eq: async (k2: string, v2: string) => {
            if (table === 'candidates') calls.candidatesUpdated.push({ values, k1, v1, k2, v2 });
            return { data: null, error: null };
          },
        }),
      }),
    }),
    rpc: async () => ({ data: null, error: null }),
  };
}

// --------------- No-op stubs ---------------

const noopLogStage: PipelineDeps['logStage'] = async () => {};
const noopRecordCandidates: PipelineDeps['recordCandidates'] = async () => {};
const noopCompleteRun: PipelineDeps['completeRun'] = async () => {};
const noopCreateRun: PipelineDeps['createRun'] = async () => ({ id: 'run-test-id', started_at: new Date().toISOString() });

function makeBaseDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    createRun: noopCreateRun,
    completeRun: noopCompleteRun,
    logStage: noopLogStage,
    recordCandidates: noopRecordCandidates,
    fetchAllFeeds: async () => [],
    getRecentHashes: async () => new Set(),
    getRecentlyPublishedSites: async () => [],
    scoreCandidates: () => [],
    extractArticle: async () => makeArticle(),
    extractFromCrossRefs: async () => [],
    fetchAnilistImages: async () => [],
    rewriteArticle: async () => makeRewrite(),
    qaReview: async () => makeQA(),
    uploadImageToWP: async () => ({ id: 101, source_url: 'https://radiata.pro/wp-content/uploads/img.jpg' }),
    injectImagesIntoHtml: (html) => html,
    injectVideoEmbed: (html) => html,
    publishPost: async () => ({ id: 9999, link: 'https://radiata.pro/anime-reescrito/' }),
    ensureTags: async () => [1, 2],
    pingIndexNow: async () => ({ ok: false, skipped: true }),
    ...overrides,
  };
}

// ============================================================
// Test scenarios
// ============================================================

describe('runRssPipelineWithDeps', () => {

  // Scenario 1: paused
  test('returns paused when pipeline_paused_s1=true, logStage never called', async () => {
    const logCalls: string[] = [];
    const supabase = makeMockSupabase('true');

    const result = await runRssPipelineWithDeps(
      supabase,
      { dryRun: false },
      makeBaseDeps({
        logStage: async (_sb, _id, stage) => { logCalls.push(stage); },
      })
    );

    assert.equal(result.status, 'paused');
    assert.equal(result.runId, 'run-test-id');
    assert.equal(logCalls.length, 0, 'logStage must not be called when paused');
  });

  // Scenario 2: empty top3
  test('returns failed with reason=no eligible candidates when top3 is empty', async () => {
    const extractCalls: string[] = [];
    const supabase = makeMockSupabase('false');

    const result = await runRssPipelineWithDeps(
      supabase,
      { dryRun: false },
      makeBaseDeps({
        scoreCandidates: () => [],
        extractArticle: async (url) => { extractCalls.push(url); return makeArticle(); },
      })
    );

    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'no eligible candidates');
    assert.equal(extractCalls.length, 0, 'extractArticle must not be called when no candidates');
  });

  // Scenario 3: dryRun=true, publishPost never called, posts.insert never called
  test('dryRun=true: returns skipped, publishPost and posts.insert never called', async () => {
    let publishCalled = false;
    const calls = { postsInserted: [] as any[], candidatesUpdated: [] as any[] };
    const supabase = makeMockSupabase('false', calls);
    const candidate = makeCandidate();

    const result = await runRssPipelineWithDeps(
      supabase,
      { dryRun: true },
      makeBaseDeps({
        fetchAllFeeds: async () => [candidate],
        scoreCandidates: () => [candidate],
        extractArticle: async () => makeArticle(),
        rewriteArticle: async () => makeRewrite(),
        qaReview: async () => makeQA({ aprovado: true }),
        publishPost: async () => { publishCalled = true; return { id: 1, link: 'x' }; },
      })
    );

    assert.equal(result.status, 'skipped');
    assert.equal(publishCalled, false, 'publishPost must NOT be called in dryRun');
    assert.equal(calls.postsInserted.length, 0, 'posts.insert must NOT be called in dryRun');
  });

  // Scenario 4: first candidate rewrite throws, second succeeds — posts.insert called once with second candidate's hash
  test('live run: rewrite failure on first candidate, success on second; posts.insert called once with second hash', async () => {
    const calls = { postsInserted: [] as any[], candidatesUpdated: [] as any[] };
    const supabase = makeMockSupabase('false', calls);

    const candidate1 = makeCandidate({ titulo: 'Candidate 1', url: 'https://ex.com/1', hash: 'hash-1' });
    const candidate2 = makeCandidate({ titulo: 'Candidate 2', url: 'https://ex.com/2', hash: 'hash-2' });

    let publishCallCount = 0;

    const result = await runRssPipelineWithDeps(
      supabase,
      { dryRun: false },
      makeBaseDeps({
        fetchAllFeeds: async () => [candidate1, candidate2],
        scoreCandidates: () => [candidate1, candidate2],
        rewriteArticle: async (_article, cand) => {
          if (cand.url === 'https://ex.com/1') throw new Error('AI timeout');
          return makeRewrite({ slug: 'candidate-2-slug' });
        },
        qaReview: async () => makeQA({ aprovado: true }),
        publishPost: async () => { publishCallCount++; return { id: 8888, link: 'https://radiata.pro/candidate-2/' }; },
      })
    );

    assert.equal(result.status, 'success');
    assert.equal(result.publishedPostId, 8888);
    assert.equal(publishCallCount, 1, 'publishPost called exactly once');
    assert.equal(calls.postsInserted.length, 1, 'posts.insert called exactly once');
    assert.equal(calls.postsInserted[0].title_hash, 'hash-2', 'title_hash must be second candidate hash');
  });

  // Scenario 5: qa.aprovado=false on first, second succeeds
  test('live run: qa failure on first, success on second', async () => {
    const calls = { postsInserted: [] as any[], candidatesUpdated: [] as any[] };
    const supabase = makeMockSupabase('false', calls);

    const candidate1 = makeCandidate({ url: 'https://ex.com/c1', hash: 'hash-c1' });
    const candidate2 = makeCandidate({ url: 'https://ex.com/c2', hash: 'hash-c2' });

    let qaCallCount = 0;

    const result = await runRssPipelineWithDeps(
      supabase,
      { dryRun: false },
      makeBaseDeps({
        fetchAllFeeds: async () => [candidate1, candidate2],
        scoreCandidates: () => [candidate1, candidate2],
        qaReview: async (_rewrite) => {
          qaCallCount++;
          // First call: fail. Subsequent calls: pass.
          return qaCallCount === 1
            ? makeQA({ aprovado: false, media: 4.5, motivo_reprovacao: 'Texto muito curto' })
            : makeQA({ aprovado: true });
        },
        publishPost: async () => ({ id: 7777, link: 'https://radiata.pro/c2/' }),
      })
    );

    assert.equal(result.status, 'success');
    assert.equal(qaCallCount, 2, 'qaReview called twice (once per candidate)');
    assert.equal(calls.postsInserted.length, 1);
    assert.equal(calls.postsInserted[0].title_hash, 'hash-c2');
  });

  // Scenario 6: all candidates have palavras < 200 → status='failed', reason='all candidates failed'
  test('live run: all candidates fail (palavras < 200) → status=failed', async () => {
    const supabase = makeMockSupabase('false');
    const candidates = [
      makeCandidate({ url: 'https://ex.com/s1', hash: 'hs1' }),
      makeCandidate({ url: 'https://ex.com/s2', hash: 'hs2' }),
      makeCandidate({ url: 'https://ex.com/s3', hash: 'hs3' }),
    ];

    const result = await runRssPipelineWithDeps(
      supabase,
      { dryRun: false },
      makeBaseDeps({
        fetchAllFeeds: async () => candidates,
        scoreCandidates: () => candidates,
        extractArticle: async () => makeArticle({ palavras: 150, texto_limpo: 'short' }),
      })
    );

    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'all candidates failed');
  });

  // Scenario: trailer + 2nd-image supplement (task #4)
  test('live run: injects trailer from videos_embed and supplements 2nd image with og:image', async () => {
    const supabase = makeMockSupabase('false');
    const candidates = [makeCandidate({ url: 'https://ex.com/t1', hash: 'ht1' })];
    const videoCalls: Array<[string, string]> = [];
    const uploaded: string[] = [];

    const result = await runRssPipelineWithDeps(
      supabase,
      { dryRun: false },
      makeBaseDeps({
        fetchAllFeeds: async () => candidates,
        scoreCandidates: () => candidates,
        extractArticle: async () =>
          makeArticle({
            og_image: 'https://src.example/og-scene.jpg',
            videos_embed: ['https://www.youtube.com/embed/abc12345678'],
          }),
        // AniList returns only ONE image (no banner) → og:image must fill the 2nd slot
        fetchAnilistImages: async () => ['https://anilist.example/cover.jpg'],
        uploadImageToWP: async (url) => { uploaded.push(url); return { id: 200 + uploaded.length, source_url: url }; },
        injectVideoEmbed: (html, embedUrl) => { videoCalls.push([html, embedUrl]); return html + `<!--video:${embedUrl}-->`; },
      })
    );

    assert.equal(result.status, 'success');
    // og:image was appended as the distinct 2nd image
    assert.ok(uploaded.includes('https://anilist.example/cover.jpg'), 'AniList cover should be uploaded');
    assert.ok(uploaded.includes('https://src.example/og-scene.jpg'), 'og:image should supplement as 2nd image');
    // trailer injected exactly once with the extracted embed URL
    assert.equal(videoCalls.length, 1, 'injectVideoEmbed should be called once');
    assert.equal(videoCalls[0][1], 'https://www.youtube.com/embed/abc12345678');
  });

});
