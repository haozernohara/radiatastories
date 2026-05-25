"use client";

import { useState, useRef, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LogLine {
  stage: string;
  message: string;
  level: "info" | "warn" | "error";
  ts: string;
}

interface QueueItem {
  url: string;
  status: "pending" | "running" | "done" | "error";
  logs: LogLine[];
  result?: { link: string; titulo: string };
  error?: string;
}

const ICONS: Record<string, string> = {
  extract: "🔍", rewrite: "✍️", qa: "🔬", images: "🖼️", publish: "🚀", error: "❌",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function truncateUrl(url: string, max = 60) {
  try {
    const u = new URL(url);
    const path = u.hostname + u.pathname;
    return path.length > max ? path.slice(0, max) + "…" : path;
  } catch {
    return url.slice(0, max);
  }
}

async function runSingle(
  url: string,
  onLog: (log: LogLine) => void
): Promise<{ link: string; titulo: string }> {
  const res = await fetch("/api/temas/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "Erro de rede");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result: { link: string; titulo: string } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const ev = JSON.parse(t);
        if (ev.type === "log") onLog({ stage: ev.stage, message: ev.message, level: ev.level ?? "info", ts: ev.ts });
        else if (ev.type === "done") result = { link: ev.link, titulo: ev.titulo };
        else if (ev.type === "error") throw new Error(ev.message);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  if (!result) throw new Error("Pipeline não retornou resultado");
  return result;
}

export default function TemasPage() {
  const [rawInput, setRawInput] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const updateItem = useCallback((index: number, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  }, []);

  const parseUrls = (text: string) =>
    text.split("\n").map(l => l.trim()).filter(l => l.startsWith("http"));

  const urlCount = parseUrls(rawInput).length;

  async function handleRun() {
    const urls = parseUrls(rawInput);
    if (!urls.length || running) return;

    const initial: QueueItem[] = urls.map(url => ({ url, status: "pending", logs: [] }));
    setQueue(initial);
    setRunning(true);
    setExpandedIndex(0);

    for (let i = 0; i < urls.length; i++) {
      setExpandedIndex(i);
      updateItem(i, { status: "running" });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

      try {
        const result = await runSingle(urls[i], (log) => {
          setQueue(prev => prev.map((it, idx) =>
            idx === i ? { ...it, logs: [...it.logs, log] } : it
          ));
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        });
        updateItem(i, { status: "done", result });
      } catch (err) {
        updateItem(i, { status: "error", error: String(err) });
      }
    }

    setRunning(false);
    setExpandedIndex(null);
  }

  const doneCount = queue.filter(it => it.status === "done").length;
  const errorCount = queue.filter(it => it.status === "error").length;
  const allFinished = queue.length > 0 && !running && doneCount + errorCount === queue.length;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-5 max-w-3xl mx-auto">

          <div>
            <h1 className="text-2xl font-semibold">Temas Manuais</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Cole N links — um por linha. O sistema processa um por um, reescrevendo com Claude e publicando no radiata.pro.
            </p>
          </div>

          {/* Input card */}
          {!running && queue.length === 0 && (
            <Card>
              <CardContent className="pt-5 space-y-3">
                <label className="text-sm font-medium block">Links dos artigos (um por linha)</label>
                <textarea
                  rows={5}
                  placeholder={"https://www.aficionados.com.br/artigo-sobre-anime/\nhttps://www.animenewsnetwork.com/news/...\nhttps://crunchyroll.com/anime-news/..."}
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  disabled={running}
                  className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 resize-y font-mono"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {urlCount > 0
                      ? `${urlCount} link${urlCount !== 1 ? "s" : ""} detectado${urlCount !== 1 ? "s" : ""}`
                      : "Cole os links acima, um por linha"}
                  </p>
                  <Button onClick={handleRun} disabled={running || urlCount === 0} className="shrink-0">
                    {`▶ Processar ${urlCount > 0 ? urlCount : ""} post${urlCount !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Queue progress */}
          {queue.length > 0 && (
            <div className="space-y-2">
              {/* Status bar */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {running
                    ? `Processando ${queue.findIndex(it => it.status === "running") + 1} de ${queue.length}…`
                    : `${queue.length} item${queue.length !== 1 ? "s" : ""} processado${queue.length !== 1 ? "s" : ""}`}
                </span>
                {!running && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setQueue([]); setRawInput(""); }}
                  >
                    Nova fila
                  </Button>
                )}
              </div>

              {/* Queue items */}
              {queue.map((item, i) => (
                <Card
                  key={i}
                  className={cn(
                    "transition-colors",
                    item.status === "done" && "border-green-500/30",
                    item.status === "error" && "border-red-500/30",
                    item.status === "running" && "border-blue-500/40",
                  )}
                >
                  {/* Item header */}
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-3">
                        {/* Status icon */}
                        <span className="shrink-0 mt-0.5 text-base">
                          {item.status === "pending" && <span className="text-muted-foreground/40">○</span>}
                          {item.status === "running" && <span className="text-blue-400 animate-pulse">●</span>}
                          {item.status === "done" && <span className="text-green-400">✓</span>}
                          {item.status === "error" && <span className="text-red-400">✗</span>}
                        </span>

                        <div className="flex-1 min-w-0">
                          {/* Done: show title + link */}
                          {item.status === "done" && item.result ? (
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="text-sm font-medium truncate text-green-400">{item.result.titulo}</p>
                              <a
                                href={item.result.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-xs text-primary hover:underline shrink-0"
                              >
                                ver post →
                              </a>
                            </div>
                          ) : item.status === "error" ? (
                            <div>
                              <p className="text-xs font-mono text-muted-foreground truncate">{truncateUrl(item.url)}</p>
                              <p className="text-xs text-red-400 mt-0.5 line-clamp-1">{item.error}</p>
                            </div>
                          ) : (
                            <p className="text-xs font-mono text-muted-foreground truncate">{truncateUrl(item.url)}</p>
                          )}
                        </div>

                        {/* Expand toggle for logs */}
                        {item.logs.length > 0 && (
                          <span className="shrink-0 text-xs text-muted-foreground/50 mt-0.5">
                            {expandedIndex === i ? "▲" : "▼"}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </button>

                  {/* Live terminal (visible when running or expanded) */}
                  {(item.status === "running" || expandedIndex === i) && item.logs.length > 0 && (
                    <div className="border-t border-border">
                      <div className="px-4 py-3 font-mono text-xs max-h-48 overflow-y-auto space-y-0.5 bg-muted/20">
                        {item.logs.map((log, j) => (
                          <div key={j} className={cn(
                            "flex items-start gap-3 py-0.5",
                            log.level === "error" && "text-red-400",
                            log.level === "warn" && "text-yellow-400",
                            log.level === "info" && "text-foreground/70",
                          )}>
                            <span className="shrink-0 text-muted-foreground/50 w-16 text-[11px]">{fmt(log.ts)}</span>
                            <span className="shrink-0 w-4 text-center">{ICONS[log.stage] ?? "▸"}</span>
                            <span className="break-all leading-relaxed">{log.message}</span>
                          </div>
                        ))}
                        {item.status === "running" && (
                          <div className="flex items-center gap-2 text-blue-400/60 pt-1">
                            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" />
                            <span className="text-[11px]">processando…</span>
                          </div>
                        )}
                        {item.status === "running" && <div ref={bottomRef} />}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Summary */}
          {allFinished && (
            <Card className={cn(
              errorCount === 0 ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"
            )}>
              <CardContent className="pt-4 pb-4">
                <p className={cn("font-medium text-sm", errorCount === 0 ? "text-green-400" : "text-yellow-400")}>
                  {errorCount === 0
                    ? `✓ ${doneCount} post${doneCount !== 1 ? "s" : ""} publicado${doneCount !== 1 ? "s" : ""} com sucesso`
                    : `${doneCount} publicado${doneCount !== 1 ? "s" : ""} · ${errorCount} erro${errorCount !== 1 ? "s" : ""}`}
                </p>
                {doneCount > 0 && (
                  <ul className="mt-2 space-y-1">
                    {queue.filter(it => it.status === "done" && it.result).map((it, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                        <span className="text-green-400">↗</span>
                        <a href={it.result!.link} target="_blank" rel="noopener noreferrer"
                          className="hover:text-foreground hover:underline truncate">
                          {it.result!.titulo}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <div ref={!running ? bottomRef : undefined} />
        </div>
      </main>
    </div>
  );
}
