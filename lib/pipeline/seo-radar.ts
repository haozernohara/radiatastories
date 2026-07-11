// ============================================================
// Radiata — Radar de SEO (motor caseiro, sem API paga)
// ============================================================
// Fontes 100% livres:
//   - Google Suggest (autocomplete): o que as pessoas realmente digitam.
//   - Sitemap dos concorrentes: revela a arquitetura de páginas deles.
//   - Análise on-page (regex): título, H1/H2, palavras, schema, imgs.
//   - Auditoria dos nossos posts (WP REST) com o mesmo critério.
// Tudo server-side. Funções puras (analyzeHtml, kwScore, topicsFromUrls) têm testes.
// ============================================================

const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

// --------------- 1) Google Suggest ---------------

/** Variações reais de busca a partir de uma seed. Endpoint livre, sem key. */
export async function googleSuggest(seed: string, max = 40): Promise<string[]> {
  const seeds = [seed, ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => `${seed} ${c}`)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of seeds) {
    if (out.length >= max) break;
    try {
      const u = `https://suggestqueries.google.com/complete/search?client=firefox&hl=pt-BR&gl=br&q=${encodeURIComponent(s)}`;
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = (await r.json()) as [string, string[]];
      for (const term of data[1] ?? []) {
        const t = term.toLowerCase().trim();
        if (t && !seen.has(t)) { seen.add(t); out.push(term); }
      }
    } catch { /* ignore */ }
  }
  return out.slice(0, max);
}

// --------------- 2) Análise on-page ---------------

export interface PageAnalysis {
  url: string;
  erro?: string;
  title: string;
  title_len: number;
  meta_len: number;
  h1: string[];
  h2_count: number;
  h2_sample: string[];
  palavras: number;
  imgs: number;
  schema: boolean;
  schema_types: string[];
}

/** Parse puro de HTML → sinais de SEO on-page. Sem rede (testável). */
export function analyzeHtml(url: string, html: string): PageAnalysis {
  const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? strip(titleM[1]) : '';
  const metaM = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
  const meta = metaM ? metaM[1].trim() : '';
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1])).filter(Boolean);
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => strip(m[1])).filter(Boolean);
  const body = html.replace(/<(script|style|nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const palavras = strip(body).split(' ').filter(Boolean).length;
  const imgs = (html.match(/<img\b/gi) ?? []).length;
  const schema = /application\/ld\+json/i.test(html);
  const schema_types = [...new Set([...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]))].slice(0, 8);
  return { url, title, title_len: title.length, meta_len: meta.length, h1: h1.slice(0, 3), h2_count: h2.length, h2_sample: h2.slice(0, 8), palavras, imgs, schema, schema_types };
}

export async function analyzePage(url: string): Promise<PageAnalysis> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
    const html = await r.text();
    return analyzeHtml(url, html);
  } catch (err) {
    return { url, erro: String(err).slice(0, 80), title: '', title_len: 0, meta_len: 0, h1: [], h2_count: 0, h2_sample: [], palavras: 0, imgs: 0, schema: false, schema_types: [] };
  }
}

/** Nota 0-100 de otimização on-page para uma keyword + notas explicativas. */
export function kwScore(page: PageAnalysis, keyword: string): { score: number; notes: string[] } {
  if (page.erro) return { score: 0, notes: [`fetch falhou: ${page.erro}`] };
  const kw = keyword.toLowerCase();
  let s = 0;
  const notes: string[] = [];
  if (kw && page.title.toLowerCase().includes(kw)) { s += 25; notes.push('kw no título ✓'); } else notes.push('kw fora do título ✗');
  if (kw && page.h1.some((h) => h.toLowerCase().includes(kw))) { s += 20; notes.push('kw no H1 ✓'); } else notes.push('kw fora do H1 ✗');
  if (kw && page.h2_sample.some((h) => h.toLowerCase().includes(kw))) { s += 15; notes.push('kw em H2 ✓'); } else notes.push('kw fora dos H2 ✗');
  if (page.title_len >= 40 && page.title_len <= 65) { s += 10; notes.push('título ok ✓'); } else notes.push(`título ${page.title_len} chars`);
  if (page.meta_len >= 120 && page.meta_len <= 160) { s += 10; notes.push('meta ok ✓'); } else notes.push(`meta ${page.meta_len} chars (ideal 120-160)`);
  if (page.palavras >= 600) { s += 10; notes.push(`${page.palavras} palavras ✓`); } else notes.push(`só ${page.palavras} palavras (raso)`);
  if (page.schema) { s += 10; notes.push('schema ✓'); } else notes.push('SEM schema ✗');
  return { score: s, notes };
}

// --------------- 3) Sitemap recon ---------------

export async function fetchSitemapUrls(domain: string, limit = 2000): Promise<string[]> {
  const d = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const candidates = [`https://${d}/sitemap.xml`, `https://${d}/sitemap_index.xml`, `https://${d}/wp-sitemap.xml`];
  let urls: string[] = [];
  for (const sm of candidates) {
    try {
      const r = await fetch(sm, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const xml = await r.text();
      const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => m[1].trim());
      const children = locs.filter((l) => l.endsWith('.xml'));
      if (children.length) {
        for (const cs of children.slice(0, 20)) {
          try {
            const rr = await fetch(cs, { headers: UA, signal: AbortSignal.timeout(15000) });
            const cx = await rr.text();
            urls.push(...[...cx.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => m[1].trim()));
          } catch { /* ignore */ }
        }
      } else {
        urls.push(...locs);
      }
      if (urls.length) break;
    } catch { /* ignore */ }
  }
  return urls.filter((u) => !u.endsWith('.xml')).slice(0, limit);
}

const STOP = new Set('de da do e o a os as com para no na em br www com html sobre 2023 2024 2025 2026'.split(' '));

/** Conta palavras dos slugs → infere os temas/arquitetura do concorrente. */
export function topicsFromUrls(urls: string[], top = 25): Array<{ termo: string; n: number }> {
  const c = new Map<string, number>();
  for (const u of urls) {
    let slug = u;
    try { slug = new URL(u).pathname.replace(/\/+$/, '').split('/').pop() ?? ''; } catch { /* ignore */ }
    for (const w of slug.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      if (w.length > 2 && !STOP.has(w)) c.set(w, (c.get(w) ?? 0) + 1);
    }
  }
  return [...c.entries()].map(([termo, n]) => ({ termo, n })).sort((a, b) => b.n - a.n).slice(0, top);
}

// --------------- 4) Auditoria dos nossos posts ---------------

const WP_URL = process.env.WP_URL ?? 'https://radiata.pro';
function wpAuth(): string {
  return 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
}

export interface AuditRow { title: string; link: string; score: number; flags: string[]; palavras: number; schema: boolean; }

export async function auditOurPosts(limit = 10): Promise<AuditRow[]> {
  const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=${limit}&_fields=link,title&status=publish`, {
    headers: { Authorization: wpAuth() }, signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return [];
  const posts = (await res.json()) as Array<{ link: string; title: { rendered: string } }>;
  const rows: AuditRow[] = [];
  for (const p of posts) {
    const kwFull = p.title.rendered.replace(/[:!].*$/, '').trim();
    const kw = (kwFull.split(' ')[0] ?? '').toLowerCase();
    const page = await analyzePage(p.link);
    const { score, notes } = kwScore(page, kw);
    const flags = notes.filter((n) => n.includes('✗') || n.includes('raso') || n.includes('SEM'));
    rows.push({ title: p.title.rendered, link: p.link, score, flags, palavras: page.palavras, schema: page.schema });
  }
  return rows;
}
