"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/dash/icons";
import { REGIONS, type RegionKey, qaColor, regionOf } from "@/lib/dashboard/regions";
import type {
  DashboardPost,
  DashboardRun,
  DashboardCandidate,
  DashboardStats,
} from "@/lib/dashboard/queries";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const RK: RegionKey[] = ["jp", "us", "br"];

type Freq = Record<RegionKey, { on: boolean; n: number }>;
type DaySchedule = Record<string, Partial<Record<RegionKey, boolean>>>;

function fmtTime(iso: string) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `hoje · ${t}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " · " + t;
}

export function OverviewClient({
  stats,
  posts,
  runs,
  candidates,
}: {
  stats: DashboardStats;
  posts: DashboardPost[];
  runs: DashboardRun[];
  candidates: DashboardCandidate[];
}) {
  const [sys1, setSys1] = useState(true);
  const [freq, setFreq] = useState<Freq>({ jp: { on: true, n: 3 }, us: { on: true, n: 2 }, br: { on: true, n: 1 } });
  const [tab, setTab] = useState<"posts" | "runs" | "cand">("posts");
  const [running, setRunning] = useState(false);

  // calendário
  const now = new Date();
  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const [cy, setCy] = useState(today.y);
  const [cm, setCm] = useState(today.m);
  const [sel, setSel] = useState<string | null>(null);
  const [sched, setSched] = useState<DaySchedule>({});

  // hidratar preferências salvas (UI-first; back-end vem na Fase 3)
  useEffect(() => {
    try {
      const f = localStorage.getItem("radiata_freq");
      if (f) setFreq(JSON.parse(f));
      const s = localStorage.getItem("radiata_sched");
      if (s) setSched(JSON.parse(s));
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("radiata_freq", JSON.stringify(freq)); } catch {} }, [freq]);
  useEffect(() => { try { localStorage.setItem("radiata_sched", JSON.stringify(sched)); } catch {} }, [sched]);

  // dias já publicados (a partir dos runs reais)
  const published = useMemo(() => {
    const o: Record<string, number> = {};
    for (const r of runs) {
      if (r.posts_published > 0) {
        const d = new Date(r.started_at);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        o[k] = (o[k] ?? 0) + r.posts_published;
      }
    }
    return o;
  }, [runs]);

  function setRegion(rk: RegionKey, patch: Partial<{ on: boolean; n: number }>) {
    setFreq((f) => ({ ...f, [rk]: { ...f[rk], ...patch } }));
  }
  function toggleDay(rk: RegionKey) {
    if (!sel) return;
    setSched((s) => ({ ...s, [sel]: { ...(s[sel] || {}), [rk]: !(s[sel] || {})[rk] } }));
  }

  async function runNow() {
    setRunning(true);
    try {
      await fetch("/api/dashboard/trigger", { method: "POST" });
    } catch {}
    setTimeout(() => setRunning(false), 2000);
  }

  // grade do calendário
  const first = new Date(cy, cm, 1).getDay();
  const ndays = new Date(cy, cm + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= ndays; d++) cells.push(d);

  const selData = sel ? sched[sel] || {} : null;
  const selDay = sel ? parseInt(sel.split("-")[2]) : null;

  const kpis = [
    { icon: "file" as const, val: String(stats.posts_week), label: "Posts esta semana", trend: "via pipeline RSS" },
    { icon: "shield" as const, val: String(Math.round(stats.qa_approval_rate)), unit: "%", label: "Taxa de aprovação QA", trend: "média móvel" },
    { icon: "rss" as const, val: String(stats.rss_sources_count), label: "Fontes RSS ativas", trend: "JP 3 · US 4 · BR 12" },
    { icon: "flame" as const, val: stats.qa_avg.toFixed(1), label: "Score QA médio", trend: "alvo ≥ 7.0" },
  ];

  return (
    <div className="view">
      {/* header */}
      <div className="view-head">
        <div>
          <h1 className="view-title">Visão Geral</h1>
          <div className="view-sub">Radiata Animes · <b>radiata.pro</b> · piloto automático</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn" onClick={() => setSys1((s) => !s)}>
            {sys1 ? <Icon.pause /> : <Icon.play />} {sys1 ? "Pausar Sistema 1" : "Retomar Sistema 1"}
          </button>
          <button className="btn btn-primary" onClick={runNow} disabled={running}>
            <Icon.play /> {running ? "Rodando…" : "Rodar agora"}
          </button>
        </div>
      </div>

      {/* system cards */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
        <div className="card syscard">
          <div className="s-head">
            <div className="k-ico"><Icon.zap /></div>
            <span className="s-name">Sistema 1 — RSS Automático</span>
            <div className="spacer" />
            <span className={"pill " + (sys1 ? "ok" : "warn")}><i className="dot" />{sys1 ? "Ativo" : "Pausado"}</span>
          </div>
          <div className="s-big">{sys1 ? "Rodando automaticamente" : "Pausado"}</div>
          <div style={{ fontSize: 12.5, color: "var(--tx-2)" }}>Escolhe o melhor do mundo · 1 post por execução</div>
        </div>
        <div className="card syscard">
          <div className="s-head">
            <div className="k-ico"><Icon.edit /></div>
            <span className="s-name">Sistema 2 — Temas Manuais</span>
            <div className="spacer" />
            <span className="pill run"><i className="dot" />Agendamento novo</span>
          </div>
          <div className="s-big">Você cola os links</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 12.5, color: "var(--tx-2)" }}>Reescreve e agenda a data</div>
            <a href="/temas" className="tbl"><span className="t-link">abrir Temas <Icon.cright style={{ width: 13, height: 13 }} /></span></a>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {kpis.map((k, i) => {
          const I = Icon[k.icon];
          return (
            <div className="card kpi" key={i}>
              <div className="k-top"><div className="k-ico"><I /></div></div>
              <div className="k-val">{k.val}{k.unit ? <small>{k.unit}</small> : null}</div>
              <div className="k-label">{k.label}</div>
              <div className="k-trend">{k.trend}</div>
            </div>
          );
        })}
      </div>

      {/* frequência por origem */}
      <div className="section-head">
        <div>
          <div className="sh-title">Frequência por origem</div>
          <div className="sh-sub">Quantas vezes por dia o robô puxa de cada região</div>
        </div>
        <span className="pill run"><i className="dot" />funcionalidade nova</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {RK.map((rk) => (
          <RegionFreq key={rk} rk={rk} state={freq[rk]} setRegion={setRegion} />
        ))}
      </div>

      {/* calendário */}
      <div className="section-head">
        <div>
          <div className="sh-title">Calendário de fontes</div>
          <div className="sh-sub">Defina de quais origens ele puxa em cada dia · ✓ = já publicou</div>
        </div>
      </div>
      <div className="card">
        <div className="cal-head">
          <div className="cal-nav">
            <button className="btn icon-btn btn-ghost" onClick={() => { if (cm === 0) { setCm(11); setCy(cy - 1); } else setCm(cm - 1); }}><Icon.cleft /></button>
            <div className="cal-month">{MONTHS[cm]} {cy}</div>
            <button className="btn icon-btn btn-ghost" onClick={() => { if (cm === 11) { setCm(0); setCy(cy + 1); } else setCm(cm + 1); }}><Icon.cright /></button>
          </div>
          <div className="seg"><button className="active">Mês</button></div>
        </div>
        <div className="cal-grid">
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((d, i) => {
            if (d === null) return <div key={"e" + i} className="cal-cell empty" />;
            const key = `${cy}-${cm}-${d}`;
            const s = sched[key] || {};
            const isToday = cy === today.y && cm === today.m && d === today.d;
            const pub = published[key];
            return (
              <div key={key} className={"cal-cell" + (isToday ? " today" : "") + (sel === key ? " sel" : "")} onClick={() => setSel(key)}>
                <span className="d-num">{d}</span>
                {pub ? <span className="cal-pub"><Icon.check style={{ width: 11, height: 11 }} />{pub}</span> : null}
                <div className="cal-dots">
                  {s.jp ? <i style={{ background: "var(--jp)", boxShadow: "0 0 6px var(--jp)" }} /> : null}
                  {s.us ? <i style={{ background: "var(--us)", boxShadow: "0 0 6px var(--us)" }} /> : null}
                  {s.br ? <i style={{ background: "var(--br)", boxShadow: "0 0 6px var(--br)" }} /> : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="legend">
          <span><i style={{ background: "var(--jp)" }} />Japão</span>
          <span><i style={{ background: "var(--us)" }} />EUA</span>
          <span><i style={{ background: "var(--br)" }} />Brasil</span>
          <span style={{ color: "var(--ok)" }}><Icon.check style={{ width: 12, height: 12 }} />Publicado</span>
        </div>
        {selData ? (
          <div className="day-editor">
            <div className="de-head">
              <div className="de-title">{selDay} de {MONTHS[cm]} — origens deste dia</div>
              {published[sel!] ? <span className="pill ok"><Icon.check style={{ width: 12, height: 12 }} />publicado</span> : <span className="pill run"><i className="dot" />agendado</span>}
            </div>
            <div className="de-sources">
              {RK.map((rk) => {
                const r = REGIONS[rk];
                const on = !!selData[rk];
                return (
                  <div key={rk} className={"de-src" + (on ? " on" : "")} style={{ ["--rc" as string]: r.color }} onClick={() => toggleDay(rk)}>
                    <span className="chk">{on ? <Icon.check style={{ width: 12, height: 12 }} /> : null}</span>
                    {r.name} · {freq[rk].n}x
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* atividade recente */}
      <div className="section-head"><div className="sh-title">Atividade recente</div></div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={tab === "posts" ? "active" : ""} onClick={() => setTab("posts")}>Posts publicados</button>
        <button className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>Execuções</button>
        <button className={tab === "cand" ? "active" : ""} onClick={() => setTab("cand")}>Candidatos (último run)</button>
      </div>
      {tab === "posts" ? <MiniPosts posts={posts} /> : tab === "runs" ? <MiniRuns runs={runs} /> : <MiniCandidates candidates={candidates} />}
    </div>
  );
}

function RegionFreq({ rk, state, setRegion }: { rk: RegionKey; state: { on: boolean; n: number }; setRegion: (rk: RegionKey, p: Partial<{ on: boolean; n: number }>) => void }) {
  const r = REGIONS[rk];
  const [open, setOpen] = useState(false);
  return (
    <div className="card freq-card" style={{ ["--rc" as string]: r.color }}>
      <div className="f-head">
        <div className="row" style={{ gap: 13, alignItems: "center" }}>
          <div className="f-flag">{r.code}</div>
          <div>
            <div className="f-name">{r.name}</div>
            <div className="f-meta">{r.priority} · {r.sources.length} fontes</div>
          </div>
        </div>
        <div className={"switch" + (state.on ? " on" : "")} style={{ ["--rc" as string]: r.color }} onClick={() => setRegion(rk, { on: !state.on })} />
      </div>
      <div style={{ fontSize: 12, color: "var(--tx-2)", fontFamily: "var(--ff-mono)", opacity: state.on ? 1 : 0.45 }}>{r.lead}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, opacity: state.on ? 1 : 0.45, pointerEvents: state.on ? "auto" : "none" }}>
        <div className="stepper">
          <button onClick={() => setRegion(rk, { n: Math.max(0, state.n - 1) })} disabled={state.n <= 0}>–</button>
          <div className="val"><b>{state.n}</b><span>x / dia</span></div>
          <button onClick={() => setRegion(rk, { n: Math.min(12, state.n + 1) })} disabled={state.n >= 12}>+</button>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => !o)}>
          <Icon.rss style={{ width: 13, height: 13 }} /> {open ? "ocultar" : "ver fontes"}
        </button>
      </div>
      {open ? (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 2, display: "flex", flexWrap: "wrap", gap: 7 }}>
          {r.sources.map((s, i) => (
            <span key={i} style={{ fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--tx-2)", background: "var(--bg-1)", border: "1px solid var(--line)", padding: "4px 8px", borderRadius: 7 }}>{s}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RegionChip({ site }: { site: string }) {
  const rk = regionOf(site);
  const r = REGIONS[rk];
  return <span className="region" style={{ ["--rc" as string]: r.color }}><i className="flag" />{r.code}</span>;
}

function ScoreMeter({ v }: { v: number }) {
  const c = qaColor(v);
  return (
    <span className="qa">
      <span className="qa-bar"><i style={{ width: (v / 10 * 100) + "%", background: c, boxShadow: "0 0 8px " + c }} /></span>
      <span className="qa-val" style={{ color: c }}>{v.toFixed(1)}</span>
    </span>
  );
}

function MiniPosts({ posts }: { posts: DashboardPost[] }) {
  if (!posts.length) return <div className="card empty-state"><Icon.file /><div>Nenhum post ainda.</div></div>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Título</th><th>Origem</th><th>Publicado</th><th style={{ textAlign: "right" }}>QA</th><th /></tr></thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id}>
              <td><div className="t-title">{p.title}</div></td>
              <td><RegionChip site={p.source_site} /></td>
              <td><span className="t-time">{fmtTime(p.published_at)}</span></td>
              <td style={{ textAlign: "right" }}><ScoreMeter v={p.qa_score} /></td>
              <td style={{ textAlign: "right" }}>{p.link ? <a href={p.link} target="_blank" rel="noreferrer" className="t-link">ver <Icon.cright style={{ width: 12, height: 12 }} /></a> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniRuns({ runs }: { runs: DashboardRun[] }) {
  if (!runs.length) return <div className="card empty-state"><Icon.activity /><div>Nenhuma execução ainda.</div></div>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Iniciado</th><th>Duração</th><th>Status</th><th style={{ textAlign: "right" }}>Posts</th></tr></thead>
        <tbody>
          {runs.slice(0, 6).map((r) => (
            <tr key={r.id}>
              <td><span className="t-time">{fmtTime(r.started_at)}</span></td>
              <td><span className="t-time">{r.duration_seconds != null ? Math.round(r.duration_seconds) + "s" : "—"}</span></td>
              <td>{r.status === "success" ? <span className="pill ok"><i className="dot" />Sucesso</span> : r.status === "running" ? <span className="pill run"><i className="dot" />Rodando</span> : <span className="pill fail"><i className="dot" />Falhou</span>}</td>
              <td style={{ textAlign: "right", fontFamily: "var(--ff-mono)", color: r.posts_published ? "var(--ok)" : "var(--tx-3)" }}>{r.posts_published}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniCandidates({ candidates }: { candidates: DashboardCandidate[] }) {
  if (!candidates.length) return <div className="card empty-state"><Icon.flame /><div>Nenhum candidato do último run.</div></div>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th style={{ width: 40 }}>#</th><th>Manchete</th><th>Fonte</th><th style={{ textAlign: "right" }}>Score</th></tr></thead>
        <tbody>
          {candidates.map((c, i) => (
            <tr key={i}>
              <td style={{ fontFamily: "var(--ff-mono)", color: c.selected ? "var(--neon)" : "var(--tx-3)", fontWeight: 700 }}>{c.selected ? <Icon.check style={{ width: 14, height: 14 }} /> : c.rank}</td>
              <td><div className="t-title">{c.title}</div></td>
              <td><RegionChip site={c.site_name} /></td>
              <td style={{ textAlign: "right", fontFamily: "var(--ff-mono)", fontWeight: 700, color: c.score_total < 0 ? "var(--fail)" : "var(--tx-0)" }}>{c.score_total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
