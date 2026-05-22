import { Sidebar } from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createDashboardClient } from "@/lib/supabase/server";
import {
  getRecentPosts,
  getRecentRuns,
  getLatestRunCandidates,
  getDashboardStats,
} from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

function formatRelative(iso: string): string {
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
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " +
    timeStr
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "idle")
    return <Badge variant="secondary">Aguardando</Badge>;
  if (status === "running")
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
        Rodando
      </Badge>
    );
  if (status === "completed")
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
        Concluído
      </Badge>
    );
  if (status === "failed") return <Badge variant="destructive">Falhou</Badge>;
  if (status === "paused")
    return <Badge variant="outline">Pausado</Badge>;
  return <Badge>{status}</Badge>;
}

export default async function DashboardPage() {
  const supabase = await createDashboardClient();
  const [posts, runs, candidates, stats] = await Promise.all([
    getRecentPosts(supabase, 20),
    getRecentRuns(supabase, 10),
    getLatestRunCandidates(supabase, 3),
    getDashboardStats(supabase),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Visão Geral</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Radiata Animes · radiata.pro
              </p>
            </div>
            <div className="flex gap-2">
              {/* Wired in Phase 2 */}
              <Button size="sm" variant="outline">
                ⏸ Pausar Sistema 1
              </Button>
              {/* Wired in Phase 2 */}
              <Button size="sm">▶ Rodar agora</Button>
            </div>
          </div>

          {/* Status cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Sistema 1 — RSS Automático
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-semibold">2 posts hoje</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Próximo run às 22:00 BRT
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <StatusBadge status="idle" />
                    <p className="text-xs text-muted-foreground">
                      Último: há 8h
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="opacity-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Sistema 2 — Temas Manuais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-semibold text-muted-foreground">
                      —
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Disponível na Fase 3
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    em breve
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Posts esta semana", value: String(stats.posts_week) },
              {
                label: "Taxa aprovação QA",
                value: `${stats.qa_approval_rate}%`,
              },
              {
                label: "Fontes RSS ativas",
                value: String(stats.rss_sources_count),
              },
              { label: "Score QA médio", value: stats.qa_avg.toFixed(1) },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-4">
                  <p className="text-2xl font-semibold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.label}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Separator />

          {/* Tabs */}
          <Tabs defaultValue="posts">
            <TabsList>
              <TabsTrigger value="posts">Posts publicados</TabsTrigger>
              <TabsTrigger value="execucoes">Execuções</TabsTrigger>
              <TabsTrigger value="candidatos">
                Candidatos (último run)
              </TabsTrigger>
            </TabsList>

            {/* Posts tab */}
            <TabsContent value="posts" className="mt-4">
              <Card>
                {posts.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    Nenhum post publicado ainda. O primeiro run automático fará a
                    primeira publicação.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Fonte</TableHead>
                        <TableHead>Publicado</TableHead>
                        <TableHead className="text-right">QA</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posts.map((post) => (
                        <TableRow key={post.id}>
                          <TableCell className="font-medium max-w-xs">
                            <span className="line-clamp-1">{post.title}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {post.source_site}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatRelative(post.published_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                post.qa_score >= 8.5
                                  ? "text-green-400 font-medium"
                                  : post.qa_score >= 7.0
                                    ? "text-yellow-400"
                                    : "text-red-400"
                              }
                            >
                              {post.qa_score}
                            </span>
                          </TableCell>
                          <TableCell>
                            <a
                              href={post.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              ver →
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </TabsContent>

            {/* Execuções tab */}
            <TabsContent value="execucoes" className="mt-4">
              <Card>
                {runs.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    Nenhuma execução registrada ainda.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Iniciado</TableHead>
                        <TableHead>Duração</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Post publicado</TableHead>
                        <TableHead className="text-right">Candidatos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="text-sm">
                            {formatRelative(run.started_at)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDuration(run.duration_seconds)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={run.status} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs">
                            <span className="line-clamp-1">
                              {run.post_title ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {run.candidates_found}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </TabsContent>

            {/* Candidatos tab */}
            <TabsContent value="candidatos" className="mt-4">
              {candidates.length === 0 ? (
                <Card>
                  <p className="p-6 text-sm text-muted-foreground">
                    Nenhum candidato registrado ainda.
                  </p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {candidates.map((c) => (
                    <Card
                      key={c.rank}
                      className={
                        c.selected ? "border-primary/60 bg-primary/5" : ""
                      }
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground">
                                #{c.rank}
                              </span>
                              {c.selected && (
                                <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                                  selecionado
                                </Badge>
                              )}
                            </div>
                            <p className="font-medium mt-1">{c.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {c.site_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-semibold">
                              {c.score_total}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              score total
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-4 text-xs text-muted-foreground border-t border-border pt-3">
                          <span>
                            Título:{" "}
                            <b className="text-foreground">
                              {c.score_breakdown.score_titulo}
                            </b>
                          </span>
                          <span>
                            Prioridade:{" "}
                            <b className="text-foreground">
                              {c.score_breakdown.prioridade_site}
                            </b>
                          </span>
                          <span>
                            Cross-ref:{" "}
                            <b className="text-foreground">
                              {c.score_breakdown.cross_ref}
                            </b>
                          </span>
                          <span>
                            Cooldown:{" "}
                            <b className="text-foreground">
                              {c.score_breakdown.cooldown}
                            </b>
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
