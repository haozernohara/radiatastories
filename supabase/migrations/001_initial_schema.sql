-- ============================================================
-- Radiata Blog System — Initial Schema
-- Phase 1: Pipeline Core
-- ============================================================

-- DATA-01: Published posts
CREATE TABLE IF NOT EXISTS posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  slug          text NOT NULL,
  wp_post_id    integer NOT NULL,
  published_at  timestamptz NOT NULL DEFAULT now(),
  score_final   integer,
  source_site   text,
  source_url    text,
  title_hash    char(32) NOT NULL,          -- MD5, used for dedup
  anime_name    text,
  category_id   integer,
  system_type   text NOT NULL DEFAULT 'rss' CHECK (system_type IN ('rss', 'tema')),
  qa_scores     jsonb,                       -- {humanizacao, coerencia, seo, completude, fidelidade, portugues, avg}
  images        jsonb,                       -- [{wp_id, url, filename}]
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON posts (published_at);       -- for 26h rolling window queries
CREATE INDEX ON posts (title_hash);         -- for dedup lookups
CREATE INDEX ON posts (source_site, published_at); -- for cooldown scoring

-- DATA-02: Pipeline run tracking
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_type       text NOT NULL DEFAULT 'rss',
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  status            text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed', 'skipped', 'paused')),
  posts_published   integer DEFAULT 0,
  candidates_found  integer DEFAULT 0,
  error_message     text,
  locked_at         timestamptz             -- when advisory lock was acquired
);
CREATE INDEX ON pipeline_runs (started_at);

-- DATA-03: Step-level logs with Realtime
CREATE TABLE IF NOT EXISTS pipeline_logs (
  id          bigserial PRIMARY KEY,        -- bigserial for guaranteed ordering
  run_id      uuid REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  stage       text NOT NULL,                -- rss_fetch|scoring|rewrite|qa|publish|error
  level       text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  message     text NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON pipeline_logs (run_id, created_at);

-- Enable Realtime on pipeline_logs
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_logs;

-- DATA-04: Candidate articles per run
CREATE TABLE IF NOT EXISTS candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  title           text NOT NULL,
  url             text NOT NULL,
  site_name       text,
  score_total     integer,
  score_breakdown jsonb,  -- {score_titulo, prioridade_site, cross_ref, cooldown}
  status          text DEFAULT 'pending',
  selected        boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON candidates (run_id);

-- DATA-05: Topics for Sistema 2 (schema created now; used in Phase 3)
CREATE TABLE IF NOT EXISTS topics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tema          text NOT NULL,
  status        text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'publicado', 'erro')),
  data_agendada date,
  observacoes   text,
  wp_post_id    integer,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- DATA-06: Key-value settings
CREATE TABLE IF NOT EXISTS settings (
  key    text PRIMARY KEY,
  value  text NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('pipeline_paused_s1', 'false'),
  ('pipeline_paused_s2', 'false'),
  ('max_posts_dia', '3'),
  ('janela_horas', '26')
ON CONFLICT (key) DO NOTHING;

-- DATA-07: Advisory lock RPCs
CREATE OR REPLACE FUNCTION try_acquire_pipeline_lock(p_system text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_key integer;
BEGIN
  v_key := CASE p_system WHEN 'rss' THEN 1 WHEN 'themes' THEN 2 ELSE 99 END;
  RETURN pg_try_advisory_lock(v_key);
END;
$$;

CREATE OR REPLACE FUNCTION release_pipeline_lock(p_system text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_key integer;
BEGIN
  v_key := CASE p_system WHEN 'rss' THEN 1 WHEN 'themes' THEN 2 ELSE 99 END;
  PERFORM pg_advisory_unlock(v_key);
END;
$$;

-- INFRA-03: Permissive RLS for v1 (single-user, no public auth)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow all operations from service role (pipeline) and anon (dashboard reads)
CREATE POLICY "allow_all" ON posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON pipeline_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON pipeline_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON candidates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON topics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON settings FOR ALL USING (true) WITH CHECK (true);
