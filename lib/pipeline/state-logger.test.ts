import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// These imports will fail until state-logger.ts is created (RED phase)
import { createRun, completeRun, logStage, recordCandidates } from './state-logger.ts';
import type { ScoredCandidate } from './types.ts';

// --------------- Mock Supabase builder ---------------

/**
 * Creates a mock Supabase client that records all calls.
 * Supports chaining: .from().insert().select().single(), .from().update().eq(), etc.
 */
function createMockSupabase(options: {
  insertResult?: { data?: unknown; error?: { message: string } | null };
  updateResult?: { data?: unknown; error?: { message: string } | null };
  singleResult?: { data?: unknown; error?: { message: string } | null };
} = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const chainObj = {
    _insertPayload: null as unknown,
    _updatePayload: null as unknown,
    _eqArgs: null as unknown,

    insert(payload: unknown) {
      calls.push({ method: 'insert', args: [payload] });
      this._insertPayload = payload;
      return this;
    },
    update(payload: unknown) {
      calls.push({ method: 'update', args: [payload] });
      this._updatePayload = payload;
      return this;
    },
    eq(field: string, value: unknown) {
      calls.push({ method: 'eq', args: [field, value] });
      this._eqArgs = [field, value];
      return this;
    },
    select(fields: string) {
      calls.push({ method: 'select', args: [fields] });
      return this;
    },
    async single() {
      calls.push({ method: 'single', args: [] });
      return options.singleResult ?? { data: { id: 'mock-uuid-123', started_at: '2026-05-19T17:00:00Z' }, error: null };
    },
    // Make chainObj awaitable for update/insert chains without .single()
    then(resolve: (val: unknown) => void) {
      const result = options.insertResult ?? options.updateResult ?? { data: null, error: null };
      resolve(result);
    },
  };

  const supabase = {
    _calls: calls,
    from(table: string) {
      calls.push({ method: 'from', args: [table] });
      return chainObj;
    },
  };

  return supabase;
}

// --------------- createRun tests ---------------

describe('createRun', () => {
  it('returns { id, started_at } on success', async () => {
    const supabase = createMockSupabase({
      singleResult: { data: { id: 'run-abc', started_at: '2026-05-19T10:00:00Z' }, error: null },
    });

    const result = await createRun(supabase as any);
    assert.equal(result.id, 'run-abc');
    assert.equal(result.started_at, '2026-05-19T10:00:00Z');
  });

  it('inserts into pipeline_runs table with status=running', async () => {
    const supabase = createMockSupabase();
    await createRun(supabase as any, 'rss');

    const fromCall = supabase._calls.find(c => c.method === 'from');
    assert.ok(fromCall, 'should call .from()');
    assert.equal(fromCall.args[0], 'pipeline_runs');

    const insertCall = supabase._calls.find(c => c.method === 'insert');
    assert.ok(insertCall, 'should call .insert()');
    const payload = insertCall.args[0] as any;
    assert.equal(payload.system_type, 'rss');
    assert.equal(payload.status, 'running');
  });

  it('does not throw on Supabase error, returns empty id', async () => {
    const supabase = createMockSupabase({
      singleResult: { data: null, error: { message: 'connection refused' } },
    });

    // Should not throw
    let result: { id: string; started_at: string } | undefined;
    await assert.doesNotReject(async () => {
      result = await createRun(supabase as any);
    });
    assert.ok(result !== undefined);
    assert.equal(result!.id, '');
  });
});

// --------------- completeRun tests ---------------

describe('completeRun', () => {
  it('calls .update() with correct fields including finished_at', async () => {
    const supabase = createMockSupabase();

    await completeRun(supabase as any, 'run-123', {
      status: 'success',
      posts_published: 1,
      candidates_found: 3,
    });

    const updateCall = supabase._calls.find(c => c.method === 'update');
    assert.ok(updateCall, 'should call .update()');
    const payload = updateCall.args[0] as any;
    assert.equal(payload.status, 'success');
    assert.equal(payload.posts_published, 1);
    assert.equal(payload.candidates_found, 3);
    assert.ok(payload.finished_at, 'should set finished_at');

    const eqCall = supabase._calls.find(c => c.method === 'eq');
    assert.ok(eqCall, 'should call .eq()');
    assert.equal((eqCall.args as any[])[0], 'id');
    assert.equal((eqCall.args as any[])[1], 'run-123');
  });

  it('does not throw on Supabase error', async () => {
    const supabase = createMockSupabase({
      updateResult: { error: { message: 'timeout' } },
    });

    await assert.doesNotReject(async () => {
      await completeRun(supabase as any, 'run-999', { status: 'failed' });
    });
  });
});

// --------------- logStage tests ---------------

describe('logStage', () => {
  it('inserts into pipeline_logs with level=info by default', async () => {
    const supabase = createMockSupabase();

    await logStage(supabase as any, 'run-abc', 'rss_fetch', 'Fetching 20 RSS feeds');

    const fromCall = supabase._calls.find(c => c.method === 'from');
    assert.equal(fromCall?.args[0], 'pipeline_logs');

    const insertCall = supabase._calls.find(c => c.method === 'insert');
    assert.ok(insertCall, 'should call .insert()');
    const payload = insertCall.args[0] as any;
    assert.equal(payload.run_id, 'run-abc');
    assert.equal(payload.stage, 'rss_fetch');
    assert.equal(payload.message, 'Fetching 20 RSS feeds');
    assert.equal(payload.level, 'info');
  });

  it('uses provided level when specified', async () => {
    const supabase = createMockSupabase();
    await logStage(supabase as any, 'run-abc', 'error', 'Something went wrong', { level: 'error' });

    const insertCall = supabase._calls.find(c => c.method === 'insert');
    const payload = insertCall?.args[0] as any;
    assert.equal(payload.level, 'error');
  });

  it('includes metadata when provided', async () => {
    const supabase = createMockSupabase();
    await logStage(supabase as any, 'run-abc', 'scoring', 'Scored candidates', {
      metadata: { top_score: 95, candidates_count: 3 },
    });

    const insertCall = supabase._calls.find(c => c.method === 'insert');
    const payload = insertCall?.args[0] as any;
    assert.ok(payload.metadata, 'should include metadata');
  });

  it('does not throw on Supabase error', async () => {
    const supabase = createMockSupabase({
      insertResult: { error: { message: 'network error' } },
    });

    await assert.doesNotReject(async () => {
      await logStage(supabase as any, 'run-abc', 'rss_fetch', 'Test');
    });
  });
});

// --------------- recordCandidates tests ---------------

describe('recordCandidates', () => {
  const mockCandidate = (hash: string): ScoredCandidate => ({
    hash,
    titulo: `Test Anime Article ${hash}`,
    url: `https://example.com/article-${hash}`,
    site_nome: 'Crunchyroll',
    site_idioma: 'en',
    site_prioridade: 1,
    site_tipo: 'EN',
    data_publicacao: '2026-05-19T10:00:00Z',
    imagem_url: '',
    slug_base: `test-anime-article-${hash}`,
    cross_ref_count: 2,
    cross_ref_sites: ['ANN', 'MAL'],
    score_titulo: 80,
    score_site_penalty: 0,
    score_total: 95,
    score_breakdown: {
      score_titulo: 80,
      prioridade_site: 15,
      cross_ref: 20,
      cooldown: 0,
    },
  });

  it('batch inserts all candidates into the candidates table', async () => {
    const supabase = createMockSupabase();
    const candidates = [mockCandidate('hash1'), mockCandidate('hash2'), mockCandidate('hash3')];

    await recordCandidates(supabase as any, 'run-xyz', candidates);

    const fromCall = supabase._calls.find(c => c.method === 'from');
    assert.equal(fromCall?.args[0], 'candidates');

    const insertCall = supabase._calls.find(c => c.method === 'insert');
    assert.ok(insertCall, 'should call .insert()');
    const rows = insertCall.args[0] as any[];
    assert.equal(rows.length, 3);
  });

  it('sets selected=true on the candidate whose hash matches selectedHash', async () => {
    const supabase = createMockSupabase();
    const candidates = [mockCandidate('hash1'), mockCandidate('hash2'), mockCandidate('hash3')];

    await recordCandidates(supabase as any, 'run-xyz', candidates, 'hash2');

    const insertCall = supabase._calls.find(c => c.method === 'insert');
    const rows = insertCall?.args[0] as any[];
    const selected = rows.find(r => r.selected === true);
    assert.ok(selected, 'one row should have selected=true');
    assert.equal(selected.url, 'https://example.com/article-hash2');
  });

  it('sets selected=false on all candidates when no selectedHash given', async () => {
    const supabase = createMockSupabase();
    const candidates = [mockCandidate('hash1'), mockCandidate('hash2')];

    await recordCandidates(supabase as any, 'run-xyz', candidates);

    const insertCall = supabase._calls.find(c => c.method === 'insert');
    const rows = insertCall?.args[0] as any[];
    assert.ok(rows.every(r => r.selected === false), 'all rows should have selected=false');
  });

  it('does not throw on Supabase error', async () => {
    const supabase = createMockSupabase({
      insertResult: { error: { message: 'constraint violation' } },
    });

    await assert.doesNotReject(async () => {
      await recordCandidates(supabase as any, 'run-xyz', [mockCandidate('hash1')]);
    });
  });
});
