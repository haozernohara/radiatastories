"use client";

// ============================================================
// Aba "Radar SEO" — motor caseiro (sem API paga)
// Keyword Radar (Google Suggest) · Auditoria dos nossos posts ·
// Comparar (engenharia reversa página 1 vs nós) · Recon de concorrente.
// ============================================================
import { useState } from "react";

type AuditRow = { title: string; link: string; score: number; flags: string[]; palavras: number; schema: boolean };
type Cmp = { page: { title: string; palavras: number; h2_count: number; imgs: number; schema_types: string[]; erro?: string }; score: number; notes: string[] };

const scoreColor = (s: number) => (s >= 80 ? "#22c55e" : s >= 60 ? "#eab308" : "#ef4444");

export default function RadarSeoPage() {
  return (
    <main style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <header>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Radar SEO</h1>
          <p style={{ color: "var(--muted, #94a3b8)", fontSize: 14, marginTop: 4 }}>
            Motor caseiro, sem API paga. Palavras-chave reais (Google Suggest), auditoria dos nossos posts e engenharia reversa da página 1.
          </p>
        </header>
        <Oportunidades />
        <KeywordRadar />
        <Auditoria />
        <Comparar />
        <Recon />
      </div>
    </main>
  );
}

function Box({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid var(--border,#26304a)", borderRadius: 12, padding: 18, background: "var(--card,#0f1524)" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{title}</h2>
      {desc ? <p style={{ fontSize: 12.5, color: "var(--muted,#94a3b8)", marginBottom: 12 }}>{desc}</p> : null}
      {children}
    </section>
  );
}
const inputS: React.CSSProperties = { flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border,#26304a)", background: "var(--bg,#0b1120)", color: "inherit" };
const btnS: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: "linear-gradient(90deg,#d946ef,#6366f1)", color: "#fff", fontWeight: 600, cursor: "pointer" };

type Opp = { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number };
function Oportunidades() {
  const [data, setData] = useState<{ configured: boolean; striking?: Opp[]; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try { setData(await (await fetch(`/api/gsc`)).json()); } finally { setLoading(false); }
  };
  return (
    <Box title="Oportunidades — distância de ataque (GSC)" desc="Palavras onde já aparecemos na posição 5-20 no Google: um empurrão sobe pra página 1. Maior ROI de SEO.">
      <button style={btnS} onClick={run} disabled={loading}>{loading ? "Consultando…" : "Buscar oportunidades"}</button>
      {data && !data.configured && (
        <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: "var(--muted,#94a3b8)" }}>
          <b>Search Console ainda não conectado.</b> Para ligar (grátis):<br />
          1. Google Cloud → ative <b>Search Console API</b> → crie um <b>Service Account</b> → gere a chave JSON.<br />
          2. No Search Console do radiata.pro → Configurações → Usuários → adicione o e-mail do service account (leitura).<br />
          3. Na Vercel, adicione as variáveis <code>GSC_SERVICE_ACCOUNT_JSON</code> (o JSON inteiro) e <code>GSC_SITE_URL</code> (ex: <code>sc-domain:radiata.pro</code>).
        </div>
      )}
      {data?.error && <div style={{ marginTop: 12, color: "#ef4444", fontSize: 12.5 }}>Erro: {data.error}</div>}
      {data?.striking && data.striking.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--muted,#94a3b8)", padding: "0 0 4px" }}>
            <span style={{ width: 44 }}>pos</span><span style={{ flex: 1 }}>query</span><span style={{ width: 60, textAlign: "right" }}>impr.</span><span style={{ width: 50, textAlign: "right" }}>cliques</span>
          </div>
          {data.striking.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 12, fontSize: 12.5, padding: "3px 0", borderBottom: "1px solid var(--border,#1c2438)" }}>
              <span style={{ width: 44, fontWeight: 700, color: o.position <= 10 ? "#eab308" : "#94a3b8" }}>{o.position.toFixed(1)}</span>
              <span style={{ flex: 1 }}>{o.query}</span>
              <span style={{ width: 60, textAlign: "right" }}>{Math.round(o.impressions)}</span>
              <span style={{ width: 50, textAlign: "right" }}>{Math.round(o.clicks)}</span>
            </div>
          ))}
        </div>
      )}
      {data?.striking && data.striking.length === 0 && <div style={{ marginTop: 12, fontSize: 13 }}>Conectado, mas ainda sem queries em distância de ataque nessa janela.</div>}
    </Box>
  );
}

function KeywordRadar() {
  const [q, setQ] = useState("melhores animes isekai");
  const [terms, setTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/radar?action=suggest&q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setTerms(d.terms ?? []);
    } finally { setLoading(false); }
  };
  return (
    <Box title="Keyword Radar" desc="O que as pessoas realmente digitam no Google (Google Suggest).">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input style={inputS} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex: melhores animes de romance" onKeyDown={(e) => e.key === "Enter" && run()} />
        <button style={btnS} onClick={run} disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
      </div>
      {terms.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {terms.map((t) => (
            <span key={t} style={{ fontSize: 12.5, padding: "4px 10px", borderRadius: 20, background: "var(--bg,#0b1120)", border: "1px solid var(--border,#26304a)" }}>{t}</span>
          ))}
        </div>
      )}
    </Box>
  );
}

function Auditoria() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/radar?action=audit&limit=10`);
      const d = await r.json();
      setRows(d.rows ?? []);
    } finally { setLoading(false); }
  };
  return (
    <Box title="Auditoria dos nossos posts" desc="Nota on-page 0-100 dos últimos 10 posts (keyword no título/H1/H2, tamanho, schema).">
      <button style={btnS} onClick={run} disabled={loading}>{loading ? "Analisando…" : "Rodar auditoria"}</button>
      {rows.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r) => (
            <div key={r.link} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border,#1c2438)" }}>
              <span style={{ fontWeight: 700, color: scoreColor(r.score), width: 40 }}>{r.score}</span>
              <a href={r.link} target="_blank" rel="noreferrer" style={{ flex: 1, color: "inherit", textDecoration: "none" }}>{r.title}</a>
              <span style={{ fontSize: 11.5, color: r.flags.length ? "#f59e0b" : "#22c55e" }}>{r.flags.length ? r.flags.join(", ") : "ok"}</span>
            </div>
          ))}
        </div>
      )}
    </Box>
  );
}

function Comparar() {
  const [kw, setKw] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [res, setRes] = useState<{ a: Cmp; b: Cmp } | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    if (!a || !b) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/radar?action=compare&kw=${encodeURIComponent(kw)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
      setRes(await r.json());
    } finally { setLoading(false); }
  };
  const card = (label: string, c: Cmp) => (
    <div style={{ flex: 1, minWidth: 240, border: "1px solid var(--border,#26304a)", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: "var(--muted,#94a3b8)" }}>{label}</div>
      {c.page.erro ? <div style={{ color: "#ef4444" }}>erro: {c.page.erro}</div> : (
        <>
          <div style={{ fontWeight: 700, fontSize: 22, color: scoreColor(c.score) }}>{c.score}<span style={{ fontSize: 12, color: "var(--muted,#94a3b8)" }}>/100</span></div>
          <div style={{ fontSize: 12.5, margin: "4px 0" }}>{c.page.palavras} palavras · {c.page.h2_count} H2 · {c.page.imgs} imgs</div>
          <div style={{ fontSize: 11, color: "var(--muted,#94a3b8)" }}>schema: {c.page.schema_types.join(", ") || "não"}</div>
          <div style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>{c.notes.join(" · ")}</div>
        </>
      )}
    </div>
  );
  return (
    <Box title="Comparar (engenharia reversa)" desc="Cole a keyword, a URL de um concorrente da página 1 e a nossa URL. O motor faz o de-para.">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input style={inputS} value={kw} onChange={(e) => setKw(e.target.value)} placeholder="keyword (ex: melhores animes isekai)" />
        <input style={inputS} value={a} onChange={(e) => setA(e.target.value)} placeholder="URL do concorrente (página 1)" />
        <input style={inputS} value={b} onChange={(e) => setB(e.target.value)} placeholder="Nossa URL (radiata.pro/...)" />
        <button style={btnS} onClick={run} disabled={loading}>{loading ? "Comparando…" : "Comparar"}</button>
      </div>
      {res && <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>{card("Concorrente", res.a)}{card("Nós", res.b)}</div>}
    </Box>
  );
}

function Recon() {
  const [domain, setDomain] = useState("animenew.com.br");
  const [res, setRes] = useState<{ total: number; topics: { termo: string; n: number }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/radar?action=sitemap&domain=${encodeURIComponent(domain)}`);
      setRes(await r.json());
    } finally { setLoading(false); }
  };
  return (
    <Box title="Recon de concorrente" desc="Lê o sitemap e revela a arquitetura de conteúdo deles (temas mais recorrentes).">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input style={inputS} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="dominio.com.br" />
        <button style={btnS} onClick={run} disabled={loading}>{loading ? "Lendo…" : "Analisar"}</button>
      </div>
      {res && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{res.total} URLs no sitemap. Temas mais recorrentes:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(res.topics ?? []).map((t) => (
              <span key={t.termo} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 6, background: "var(--bg,#0b1120)", border: "1px solid var(--border,#26304a)" }}>{t.termo} <b>{t.n}</b></span>
            ))}
          </div>
        </div>
      )}
    </Box>
  );
}
