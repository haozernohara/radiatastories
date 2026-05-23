import { Sidebar } from "@/components/sidebar";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createDashboardClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  const timeStr = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffDays === 0) return `hoje ${timeStr}`;
  if (diffDays === 1) return `ontem ${timeStr}`;
  return (
    d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }) +
    " " +
    timeStr
  );
}

function QAScore({ score }: { score: number | null }) {
  if (score === null || score === 0) return <span className="text-muted-foreground">—</span>;
  const cls =
    score >= 8.5
      ? "text-green-400 font-medium"
      : score >= 7.0
        ? "text-yellow-400"
        : "text-red-400";
  return <span className={cls}>{score.toFixed(1)}</span>;
}

export default async function PostsPage() {
  const supabase = await createDashboardClient();
  const { data: posts } = await supabase
    .from("posts")
    .select(
      "id, title, anime_name, source_site, published_at, qa_scores, wp_post_id"
    )
    .order("published_at", { ascending: false })
    .limit(200);

  const postList = posts ?? [];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-semibold">Posts publicados</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {postList.length} posts · radiata.pro
            </p>
          </div>

          <Card>
            {postList.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Nenhum post publicado ainda. O pipeline ainda não rodou.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Anime</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Publicado</TableHead>
                    <TableHead className="text-right">QA</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {postList.map((post: any) => (
                    <TableRow key={post.id}>
                      <TableCell className="font-medium max-w-xs">
                        <span className="line-clamp-2 leading-snug">
                          {post.title}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {post.anime_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {post.source_site ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(post.published_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <QAScore
                          score={
                            post.qa_scores?.media != null
                              ? Number(post.qa_scores.media)
                              : null
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {post.wp_post_id && (
                          <a
                            href={`https://radiata.pro/?p=${post.wp_post_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            ver →
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
