// ============================================================
// Radiata — Motor de Oportunidades (Google Search Console API)
// ============================================================
// Le o Search Analytics do radiata.pro (GRATIS) e acha as palavras em
// "distancia de ataque" (posicao 5-20) — as que sobem mais rapido com um empurrao.
//
// Auth via service account (JWT RS256 -> access token), sem dependencia extra
// (usa node:crypto). Ativa quando GSC_SERVICE_ACCOUNT_JSON estiver setado.
// ============================================================

import crypto from 'node:crypto';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** Monta o JWT assinado (RS256) para o fluxo service-account. Puro (testável). */
export function buildSignedJwt(clientEmail: string, privateKey: string, now: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  const signingInput = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = buildSignedJwt(sa.client_email, sa.private_key, now);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    signal: AbortSignal.timeout(15000),
  });
  const d = (await res.json()) as { access_token?: string; error_description?: string };
  if (!d.access_token) throw new Error('GSC token: ' + (d.error_description ?? JSON.stringify(d)).slice(0, 200));
  return d.access_token;
}

export interface Opportunity {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscResult {
  configured: boolean;
  striking?: Opportunity[];
  total?: number;
  error?: string;
}

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

/**
 * Retorna as queries em distancia de ataque (posicao 5-20, com impressao real),
 * ordenadas por impressoes (maior potencial primeiro). Janela de 28 dias.
 */
export async function strikingDistance(days = 28): Promise<GscResult> {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) return { configured: false };
  let sa: ServiceAccount;
  try { sa = JSON.parse(raw); } catch { return { configured: false, error: 'GSC_SERVICE_ACCOUNT_JSON invalido (nao e JSON)' }; }
  const site = process.env.GSC_SITE_URL ?? 'sc-domain:radiata.pro';

  try {
    const token = await getAccessToken(sa);
    const body = {
      startDate: ymd(new Date(Date.now() - days * 86400000)),
      endDate: ymd(new Date()),
      dimensions: ['query', 'page'],
      rowLimit: 1000,
    };
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }
    );
    const d = (await res.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>; error?: { message: string } };
    if (d.error) return { configured: true, error: d.error.message };
    const rows: Opportunity[] = (d.rows ?? []).map((r) => ({
      query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
    }));
    const striking = rows
      .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 10)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 60);
    return { configured: true, striking, total: rows.length };
  } catch (err) {
    return { configured: true, error: String(err).slice(0, 200) };
  }
}
