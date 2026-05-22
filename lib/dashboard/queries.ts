/**
 * Dashboard query layer — read-only Supabase queries for the dashboard Server Component.
 * All functions accept a `supabase` client as first param (pure, no internal client creation).
 * All functions are try/catch wrapped and return empty arrays/zeros on error — never throw.
 */

export interface DashboardPost {
  id: string;
  title: string;
  source_site: string;
  published_at: string;
  qa_score: number;
  wp_post_id: number | null;
  link: string;
}

export interface DashboardRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  posts_published: number;
  candidates_found: number;
  duration_seconds: number | null;
  post_title: string | null;
}

export interface ScoreBreakdown {
  score_titulo: number;
  prioridade_site: number;
  cross_ref: number;
  cooldown: number;
}

export interface DashboardCandidate {
  rank: number;
  title: string;
  site_name: string;
  score_total: number;
  score_breakdown: ScoreBreakdown;
  selected: boolean;
}

export interface DashboardStats {
  posts_week: number;
  qa_approval_rate: number;
  rss_sources_count: number;
  qa_avg: number;
}

export async function getRecentPosts(supabase: any, limit = 20): Promise<DashboardPost[]> {
  try {
    const { data } = await supabase
      .from('posts')
      .select('id, title, source_site, published_at, qa_scores, wp_post_id')
      .order('published_at', { ascending: false })
      .limit(limit);

    return (data ?? []).map((p: any) => ({
      id: p.id,
      title: p.title,
      source_site: p.source_site ?? '—',
      published_at: p.published_at,
      qa_score: p.qa_scores?.media ? Number(p.qa_scores.media) : 0,
      wp_post_id: p.wp_post_id,
      link: `https://radiata.pro/?p=${p.wp_post_id}`,
    }));
  } catch {
    return [];
  }
}

export async function getRecentRuns(supabase: any, limit = 10): Promise<DashboardRun[]> {
  try {
    const { data: runs } = await supabase
      .from('pipeline_runs')
      .select('id, started_at, finished_at, status, posts_published, candidates_found')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (!runs) return [];

    // Get post titles for successful runs
    const postTitles: Record<string, string> = {};
    for (const run of runs.filter((r: any) => r.posts_published > 0)) {
      const { data: posts } = await supabase
        .from('posts')
        .select('title')
        .gte('published_at', run.started_at)
        .lte('published_at', run.finished_at ?? new Date().toISOString())
        .limit(1);
      if (posts?.[0]) postTitles[run.id] = posts[0].title;
    }

    return runs.map((r: any) => ({
      id: r.id,
      started_at: r.started_at,
      finished_at: r.finished_at,
      status: r.status,
      posts_published: r.posts_published ?? 0,
      candidates_found: r.candidates_found ?? 0,
      duration_seconds: r.finished_at
        ? Math.round(
            (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000
          )
        : null,
      post_title: postTitles[r.id] ?? null,
    }));
  } catch {
    return [];
  }
}

export async function getLatestRunCandidates(supabase: any, limit = 3): Promise<DashboardCandidate[]> {
  try {
    // Get most recent run
    const { data: latestRun } = await supabase
      .from('pipeline_runs')
      .select('id')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (!latestRun) return [];

    const { data } = await supabase
      .from('candidates')
      .select('title, site_name, score_total, score_breakdown, selected')
      .eq('run_id', latestRun.id)
      .order('score_total', { ascending: false })
      .limit(limit);

    return (data ?? []).map((c: any, i: number) => ({
      rank: i + 1,
      title: c.title,
      site_name: c.site_name ?? '—',
      score_total: c.score_total ?? 0,
      score_breakdown: c.score_breakdown ?? {
        score_titulo: 0,
        prioridade_site: 0,
        cross_ref: 0,
        cooldown: 0,
      },
      selected: c.selected ?? false,
    }));
  } catch {
    return [];
  }
}

export async function getDashboardStats(supabase: any): Promise<DashboardStats> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: posts } = await supabase
      .from('posts')
      .select('qa_scores, published_at')
      .gte('published_at', sevenDaysAgo);

    const postList = posts ?? [];
    const posts_week = postList.length;
    const qa_scores = postList.map((p: any) =>
      p.qa_scores?.media ? Number(p.qa_scores.media) : 0
    );
    const qa_approved = qa_scores.filter((s: number) => s >= 7).length;
    const qa_approval_rate =
      posts_week > 0 ? Math.round((qa_approved / posts_week) * 100) : 0;
    const qa_avg =
      posts_week > 0
        ? Number(
            (qa_scores.reduce((a: number, b: number) => a + b, 0) / posts_week).toFixed(1)
          )
        : 0;

    return { posts_week, qa_approval_rate, rss_sources_count: 20, qa_avg };
  } catch {
    return { posts_week: 0, qa_approval_rate: 0, rss_sources_count: 20, qa_avg: 0 };
  }
}
