"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PipelineControls({
  initialPaused,
}: {
  initialPaused: boolean;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [triggering, setTriggering] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);

  async function handleTrigger() {
    if (triggering) return;
    setTriggering(true);
    // Fire-and-forget: server continues running even after navigation
    fetch("/api/dashboard/trigger", { method: "POST" }).catch(() => {});
    // Navigate immediately to live logs
    router.push("/logs");
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
      <Button
        size="sm"
        variant="outline"
        onClick={handleTogglePause}
        disabled={togglingPause}
      >
        {togglingPause
          ? "..."
          : paused
            ? "▶ Retomar Sistema 1"
            : "⏸ Pausar Sistema 1"}
      </Button>
      <Button size="sm" onClick={handleTrigger} disabled={triggering}>
        {triggering ? "Iniciando..." : "▶ Rodar agora"}
      </Button>
    </div>
  );
}
