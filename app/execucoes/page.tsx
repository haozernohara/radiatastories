import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  return (
    d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatDuration(started: string, finished: string | null): string {
  if (!finished) return "—";
  const s = Math.round(
    (new Date(finished).getTime() - new Date(started).getTime()) / 1000
  );
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "running")
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
        Rodando
      </Badge>
    );
  if (status === "success")
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
        Sucesso
      </Badge>
    );
  if (status === "failed") return <Badge variant="destructive">Falhou</Badge>;
  if (status === "skipped") return <Badge variant="outline">Simulado</Badge>;
  if (status === "paused") return <Badge variant="outline">Pausado</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default async function ExecucoesPage() {
  const supabase = await createDashboardClient();
  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select(
      "id, started_at, finished_at, status, posts_published, candidates_found, error_message"
    )
    .order("started_at", { ascending: false })
    .limit(100);

  const runList = runs ?? [];
  const successCount = runList.filter((r: any) => r.status === "success").length;
  const failedCount = runList.filter((r: any) => r.status === "failed").length;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
          <div>
            <h1 className="text-2xl font-semibold">Execuções</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {runList.length} total · {successCount} com sucesso · {failedCount} com falha
            </p>
          </div>

          <Card>
            {runList.length === 0 ? (
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
                    <TableHead className="text-right">Candidatos</TableHead>
                    <TableHead className="text-right">Posts</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runList.map((run: any) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(run.started_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDuration(run.started_at, run.finished_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {run.candidates_found ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {run.posts_published > 0 ? (
                          <span className="text-green-400 font-medium">
                            {run.posts_published}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/logs?run_id=${run.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          logs →
                        </Link>
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
