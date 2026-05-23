"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ---- Types ----

interface PipelineRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  posts_published: number;
  candidates_found: number;
  error_message: string | null;
}

interface LogEntry {
  stage: string;
  message: string;
  level: "info" | "warn" | "error";
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface RecentRun {
  id: string;
  started_at: string;
  status: string;
  posts_published: number;
}

// ---- Helpers ----

const STAGE_ICONS: Record<string, string> = {
  rss_fetch: "📡",
  scoring: "🎯",
  extract: "🔍",
  rewrite: "✍️",
  qa: "🔬",
  publish: "🚀",
  error: "❌",
};

const STAGE_LABELS: Record<string, string> = {
  rss_fetch: "RSS",
  scoring: "Score",
  extract: "Extração",
  rewrite: "Reescrita",
  qa: "QA",
  publish: "Publicar",
  error: "Erro",
};

function stageIcon(stage: string): string {
  return STAGE_ICONS[stage] ?? "▸";
}

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function elapsedFrom(started: string, to?: string): string {
  const s = Math.round(
    ((to ? new Date(to) : new Date()).getTime() - new Date(started).getTime()) /
      1000
  );
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "running")
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse">
        Rodando
      </Badge>
    );
  if (status === "success")
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
        Concluído
      </Badge>
    );
  if (status === "failed")
    return <Badge variant="destructive">Falhou</Badge>;
  if (status === "skipped")
    return <Badge variant="outline">Simulado (dry run)</Badge>;
  if (status === "paused")
    return <Badge variant="outline">Pausado</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

// ---- Main Component ----

function LogsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paramRunId = searchParams.get("run_id");

  const [run, setRun] = useState<PipelineRun | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(paramRunId);
  const [elapsed, setElapsed] = useState("");
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = run?.status === "running";

  // Load list of recent runs on mount
  useEffect(() => {
    fetch("/api/logs?runs=true")
      .then((r) => r.json())
      .then((d) => setRecentRuns(d.runs ?? []));
  }, []);

  // Fetch logs for the selected (or latest) run
  const fetchLogs = useCallback(async () => {
    const url = selectedRunId
      ? `/api/logs?run_id=${selectedRunId}`
      : `/api/logs`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.run) {
      setRun(data.run);
      setSelectedRunId(data.run.id);
    }
    setLogs(data.logs ?? []);
    setLoading(false);
    // Scroll to bottom when new logs arrive
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, [selectedRunId]);

  // Polling — every 3s when running, stop when done
  useEffect(() => {
    fetchLogs();
    if (pollRef.current) clearTimeout(pollRef.current);

    function scheduleNext() {
      pollRef.current = setTimeout(async () => {
        await fetchLogs();
        // Re-read run state after update via closure — re-schedule only if still running
        setRun((r) => {
          if (r?.status === "running") scheduleNext();
          return r;
        });
      }, 3000);
    }

    scheduleNext();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [fetchLogs]);

  // Elapsed timer (ticks every second when running)
  useEffect(() => {
    if (!run) return;
    const tick = () => {
      setElapsed(elapsedFrom(run.started_at, run.finished_at ?? undefined));
    };
    tick();
    if (!isRunning) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [run, isRunning]);

  function handleSelectRun(id: string) {
    router.push(`/logs?run_id=${id}`);
    setSelectedRunId(id);
    setLogs([]);
    setLoading(true);
  }

  // ---- Render ----

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4 max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Logs ao vivo</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Acompanhe o pipeline em tempo real
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                fetch("/api/dashboard/trigger", { method: "POST" }).catch(
                  () => {}
                );
                setSelectedRunId(null);
                setLogs([]);
                setLoading(true);
                // Reload latest run after a short delay
                setTimeout(() => fetchLogs(), 1500);
              }}
            >
              ▶ Novo run
            </Button>
          </div>

          {/* Run selector */}
          {recentRuns.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Execução:</span>
              {recentRuns.slice(0, 8).map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelectRun(r.id)}
                  className={cn(
                    "text-xs px-2 py-1 rounded border transition-colors",
                    selectedRunId === r.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {new Date(r.started_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}{" "}
                  {new Date(r.started_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {r.status === "success" && " ✓"}
                  {r.status === "failed" && " ✗"}
                  {r.status === "running" && " ●"}
                </button>
              ))}
            </div>
          )}

          {/* Run summary card */}
          {run && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={run.status} />
                    <span className="text-muted-foreground font-mono text-xs">
                      {run.id.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-normal">
                    {isRunning && (
                      <span className="text-blue-400 font-medium">
                        ⚡ {elapsed}
                      </span>
                    )}
                    {!isRunning && run.finished_at && (
                      <span>{elapsed}</span>
                    )}
                    <span>
                      {run.candidates_found ?? 0} candidatos
                    </span>
                    {run.posts_published > 0 && (
                      <span className="text-green-400">
                        {run.posts_published} publicado
                      </span>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-xs text-muted-foreground">
                  Iniciado:{" "}
                  {new Date(run.started_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
                {run.error_message && (
                  <p className="text-xs text-red-400 mt-1">
                    Erro: {run.error_message}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Log terminal */}
          <Card className="font-mono text-xs">
            <div className="p-1 border-b border-border bg-muted/30 rounded-t-lg flex items-center gap-2 px-3 py-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              <span className="ml-2 text-muted-foreground text-[11px]">
                pipeline_logs
              </span>
              {isRunning && (
                <span className="ml-auto text-blue-400 text-[11px] animate-pulse">
                  ● polling 3s
                </span>
              )}
            </div>
            <div className="p-4 min-h-48 max-h-[60vh] overflow-y-auto space-y-0.5">
              {loading && (
                <p className="text-muted-foreground">Carregando logs...</p>
              )}
              {!loading && logs.length === 0 && !run && (
                <p className="text-muted-foreground">
                  Nenhuma execução registrada. Clique em ▶ Novo run para
                  iniciar.
                </p>
              )}
              {!loading && logs.length === 0 && run && (
                <p className="text-muted-foreground">
                  Aguardando primeiros logs...
                </p>
              )}
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3 py-0.5",
                    log.level === "error" && "text-red-400",
                    log.level === "warn" && "text-yellow-400",
                    log.level === "info" && "text-foreground/80"
                  )}
                >
                  <span className="shrink-0 text-muted-foreground/60 w-16 text-[11px]">
                    {formatTime(log.created_at)}
                  </span>
                  <span className="shrink-0 w-4 text-center">
                    {stageIcon(log.stage)}
                  </span>
                  <span className="shrink-0 text-muted-foreground w-16 text-[11px] pt-px">
                    {stageLabel(log.stage)}
                  </span>
                  <span className="break-all leading-relaxed">
                    {log.message}
                    {log.metadata?.link != null && (
                      <a
                        href={String(log.metadata.link as string)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline"
                      >
                        ver post →
                      </a>
                    )}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Carregando logs...</p>
        </main>
      </div>
    }>
      <LogsContent />
    </Suspense>
  );
}
