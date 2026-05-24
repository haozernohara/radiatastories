"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PipelineControls({ initialPaused }: { initialPaused: boolean }) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [triggering, setTriggering] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);

  async function handleTrigger() {
    if (triggering) return;
    setTriggering(true);

    try {
      const res = await fetch("/api/dashboard/trigger", { method: "POST" });

      // Already running — go see it
      if (res.status === 423) {
        router.push("/logs");
        return;
      }

      if (!res.ok || !res.body) {
        router.push("/logs");
        return;
      }

      // Read first NDJSON line to get the runId (arrives in ~100ms, before heavy work)
      const reader = res.body.getReader();
      const { value } = await reader.read();
      if (value) {
        const firstLine = new TextDecoder().decode(value, { stream: true }).split("\n")[0].trim();
        try {
          const data = JSON.parse(firstLine);
          if (data.runId) {
            router.push(`/logs?run_id=${data.runId}`);
            return;
          }
        } catch {}
      }
      router.push("/logs");
    } catch {
      router.push("/logs");
    }
    // Don't reset triggering — component unmounts on navigate
  }

  async function handleTogglePause() {
    if (togglingPause) return;
    setTogglingPause(true);
    try {
      const res = await fetch("/api/dashboard/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      });
      const data = await res.json();
      setPaused(data.paused);
    } finally {
      setTogglingPause(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={handleTogglePause} disabled={togglingPause}>
        {togglingPause ? "..." : paused ? "▶ Retomar Sistema 1" : "⏸ Pausar Sistema 1"}
      </Button>
      <Button size="sm" onClick={handleTrigger} disabled={triggering}>
        {triggering ? (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
            Iniciando...
          </span>
        ) : (
          "▶ Rodar agora"
        )}
      </Button>
    </div>
  );
}
