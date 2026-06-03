import { Sidebar } from "@/components/sidebar";
import { createDashboardClient } from "@/lib/supabase/server";
import {
  getRecentPosts,
  getRecentRuns,
  getLatestRunCandidates,
  getDashboardStats,
} from "@/lib/dashboard/queries";
import { OverviewClient } from "@/components/dash/overview-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createDashboardClient();
  const [posts, runs, candidates, stats] = await Promise.all([
    getRecentPosts(supabase, 8),
    getRecentRuns(supabase, 8),
    getLatestRunCandidates(supabase, 4),
    getDashboardStats(supabase),
  ]);

  return (
    <div className="app dash">
      <Sidebar />
      <main className="main">
        <OverviewClient stats={stats} posts={posts} runs={runs} candidates={candidates} />
      </main>
    </div>
  );
}
