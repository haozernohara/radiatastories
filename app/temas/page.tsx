"use client";

import { useState, useRef } from "react";
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

const ICONS: Record<string, string> = {
  extract: "🔍", rewrite: "✍️", qa: "🔬", images: "🖼️", publish: "🚀", error: "❌",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function TemasPage() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [result, setResult] = useState<{ link: string; titulo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const append = (log: LogLine) => {
    setLogs(p => [...p, log]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  async function handleRun() {
    if (!url.trim() || running) return;
    setRunning(true);
    setLogs([]);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/temas/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok || !res.body) {
        setError((await res.text()) || "Erro ao conectar com o servidor");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

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
            if (ev.type === "log") append({ stage: ev.stage, message: ev.message, level: ev.level ?? "info", ts: ev.ts });
            else if (ev.type === "done") setResult({ link: ev.link, titulo: ev.titulo });
            else if (ev.type === "error") setError(ev.message);
          } catch {}
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-5 max-w-3xl mx-auto">

          <div>
            <h1 className="text-2xl font-semibold">Temas Manuais</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Cole o link de qualquer artigo — o sistema extrai, reescreve em PT-BR com Claude, busca imagens e publica no radiata.pro.
            </p>
          </div>

          {/* Input card */}
          <Card>
            <CardContent className="pt-5 space-y-3">
              <label className="text-sm font-medium block">URL do artigo original</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://www.aficionados.com.br/artigo-sobre-anime/"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleRun()}
                  disabled={running}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                />
                <Button onClick={handleRun} disabled={running || !url.trim()} className="shrink-0">
                  {running ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                      Processando...
                    </span>
                  ) : "▶ Reescrever e Publicar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Compatível com: Aficionados, ANN, Crunchyroll, MAL, AnimeUnited, Omelete e outros. O pipeline
                extrai o texto, reescreve com tom Radiata, faz QA com Claude Haiku, sobe as imagens com nomes SEO e publica.
              </p>
            </CardContent>
          </Card>

          {/* Live terminal */}
          {(logs.length > 0 || running) && (
            <Card className="font-mono text-xs">
              <div className="px-3 py-2 border-b border-border bg-muted/30 rounded-t-lg flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                <span className="ml-2 text-muted-foreground text-[11px]">pipeline — tema manual</span>
                {running && <span className="ml-auto text-blue-400 text-[11px] animate-pulse">● rodando</span>}
                {result && <span className="ml-auto text-green-400 text-[11px]">✓ publicado</span>}
              </div>
              <div className="p-4 min-h-32 max-h-[45vh] overflow-y-auto space-y-0.5">
                {running && logs.length === 0 && (
                  <p className="text-muted-foreground">Inicializando pipeline...</p>
                )}
                {logs.map((log, i) => (
                  <div key={i} className={cn(
                    "flex items-start gap-3 py-0.5",
                    log.level === "error" && "text-red-400",
                    log.level === "warn" && "text-yellow-400",
                    log.level === "info" && "text-foreground/80",
                  )}>
                    <span className="shrink-0 text-muted-foreground/60 w-16 text-[11px]">{fmt(log.ts)}</span>
                    <span className="shrink-0 w-4 text-center">{ICONS[log.stage] ?? "▸"}</span>
                    <span className="break-all leading-relaxed">{log.message}</span>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </Card>
          )}

          {/* Success */}
          {result && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="pt-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-green-400">✓ Post publicado com sucesso!</p>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{result.titulo}</p>
                </div>
                <a href={result.link} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline shrink-0">
                  ver post →
                </a>
              </CardContent>
            </Card>
          )}

          {/* Error */}
          {error && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="pt-4">
                <p className="text-sm text-red-400 font-medium">Erro no pipeline</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">{error}</p>
              </CardContent>
            </Card>
          )}

        </div>
      </main>
    </div>
  );
}
