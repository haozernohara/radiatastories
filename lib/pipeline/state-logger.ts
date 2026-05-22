// ============================================================
// Radiata Blog System — Pipeline State Logger
// Phase 1, Plan 03: Wave 2 — State Logger
// ============================================================
// DATA-03: All pipeline_logs writes go through this module
// PIPE-17: Observability failures must not block publication
//
// All four exported functions are BEST-EFFORT:
//   - They accept `supabase` as first param (unit-testable)
//   - They NEVER throw — errors are console.error'd and swallowed
//   - Callers can fire-and-forget if needed

import type { ScoredCandidate } from './types.ts';

// --------------- Internal helpers ---------------

/**
 * JSON-safe stringify that handles BigInt and Date objects.
 * Prevents "Do not know how to serialize a BigInt" errors on jsonb columns.
 */
function formatMetadata(obj: object): object {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Date) return value.toISOString();
      return value;
    })
  );
}

// --------------- Exported functions ---------------

/**
 * Insert a new pipeline_runs row with status='running'.
 * Returns { id, started_at } on success, or { id: '', started_at: '' } on error.
 * DATA-02: pipeline_runs is the run lifecycle table.
 */
export async function createRun(
  supabase: any,
  systemType: string = 'rss'
): Promise<{ id: string; started_at: string }> {
  try {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .insert({
        system_type: systemType,
        status: 'running',
        locked_at: new Date().toISOString(),
      })
      .select('id, started_at')
      .single();

    if (error) {
      console.error('[state-logger] createRun error:', error);
      return { id: '', started_at: '' };
    }

    return { id: data.id, started_at: data.started_at };
  } catch (err) {
    console.error('[state-logger] createRun exception:', err);
    return { id: '', started_at: '' };
  }
}

/**
 * Update a pipeline_runs row with the final status and metrics.
 * Best-effort: never throws.
 */
export async function completeRun(
  supabase: any,
  runId: string,
  opts: {
    status: 'success' | 'failed' | 'skipped' | 'paused';
    posts_published?: number;
    candidates_found?: number;
    error_message?: string;
  }
): Promise<void> {
  try {
    const { error } = await supabase
      .from('pipeline_runs')
      .update({
        ...opts,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    if (error) {
      console.error('[state-logger] completeRun error:', error);
    }
  } catch (err) {
    console.error('[state-logger] completeRun exception:', err);
  }
}

/**
 * Insert a pipeline_logs row for step-level tracing.
 * DATA-03: Single write path for all pipeline observability.
 * Best-effort: never throws.
 */
export async function logStage(
  supabase: any,
  runId: string,
  stage: string,
  message: string,
  opts?: {
    level?: 'info' | 'warn' | 'error';
    metadata?: object;
  }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      run_id: runId,
      stage,
      message,
      level: opts?.level ?? 'info',
      metadata: opts?.metadata ? formatMetadata(opts.metadata) : null,
    };

    const { error } = await supabase
      .from('pipeline_logs')
      .insert(payload);

    if (error) {
      console.error('[state-logger] logStage error:', stage, error);
    }
  } catch (err) {
    console.error('[state-logger] logStage exception:', stage, err);
  }
}

/**
 * Batch insert scored candidates for a pipeline run.
 * DATA-04: candidates table tracks all scored articles per run.
 * Sets selected=true on the row whose hash matches selectedHash.
 * Best-effort: never throws.
 */
export async function recordCandidates(
  supabase: any,
  runId: string,
  candidates: ScoredCandidate[],
  selectedHash?: string
): Promise<void> {
  if (candidates.length === 0) return;

  try {
    const rows = candidates.map(c => ({
      run_id: runId,
      title: c.titulo,
      url: c.url,
      site_name: c.site_nome,
      score_total: c.score_total,
      score_breakdown: c.score_breakdown,
      selected: c.hash === selectedHash,
    }));

    const { error } = await supabase
      .from('candidates')
      .insert(rows);

    if (error) {
      console.error('[state-logger] recordCandidates error:', error);
    }
  } catch (err) {
    console.error('[state-logger] recordCandidates exception:', err);
  }
}
