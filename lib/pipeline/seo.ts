// ============================================================
// Radiata Blog System — Camada de SEO / GEO (AI Search)
// ============================================================
// Ganhos que fazem o Google E as IAs (AI Overviews, ChatGPT, Perplexity,
// Gemini) entenderem e CITAREM os posts:
//   1. Schema JSON-LD NewsArticle  -> dados estruturados que buscadores/LLMs leem
//   2. Alt text nas imagens        -> SEO de imagem + acessibilidade
//   3. IndexNow                    -> indexação instantânea (Bing/Yandex/etc)
//
// Tudo aqui é best-effort e determinístico. Funções puras têm testes.
// ============================================================

const SELF_HOST = (process.env.WP_URL ?? 'https://radiata.pro').replace(/\/+$/, '');

// --------------- 1. Schema JSON-LD (NewsArticle) ---------------

export interface SchemaInput {
  titulo: string;
  slug: string;
  meta: string;
  imageUrl?: string | null;
  isoDate: string; // publicação (ISO)
}

/**
 * Monta um <script type="application/ld+json"> com schema NewsArticle.
 * A URL canônica é derivada do slug (permalink /slug/), então pode ser
 * gerada ANTES do publish. Escapa </script> para não quebrar o HTML.
 */
export function buildNewsArticleSchema(input: SchemaInput): string {
  const url = `${SELF_HOST}/${input.slug.replace(/^\/+|\/+$/g, '')}/`;
  const logo = process.env.RADIATA_LOGO_URL;

  const publisher: Record<string, unknown> = {
    '@type': 'Organization',
    name: 'Radiata Animes',
    url: SELF_HOST,
  };
  if (logo) publisher.logo = { '@type': 'ImageObject', url: logo };

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: input.titulo.slice(0, 110),
    description: input.meta,
    inLanguage: 'pt-BR',
    datePublished: input.isoDate,
    dateModified: input.isoDate,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    author: { '@type': 'Organization', name: 'Radiata Animes', url: SELF_HOST },
    publisher,
  };
  if (input.imageUrl) {
    schema.image = [input.imageUrl];
  }

  const json = JSON.stringify(schema).replace(/<\/script>/gi, '<\\/script>');
  return `<script type="application/ld+json">${json}</script>`;
}

// --------------- 2. Alt text nas imagens ---------------

/**
 * Preenche alt vazio (alt='' ou alt="") com um texto descritivo baseado no
 * nome do anime. Não mexe em imagens que já têm alt preenchido.
 */
export function ensureImageAlts(html: string, animeName: string): string {
  const alt = (animeName || 'Radiata Animes').replace(/["'<>]/g, '').trim();
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (/\balt\s*=\s*["'][^"']+["']/i.test(tag)) return tag; // já tem alt
    if (/\balt\s*=\s*["']\s*["']/i.test(tag)) {
      return tag.replace(/\balt\s*=\s*["']\s*["']/i, `alt='${alt}'`); // alt vazio
    }
    // sem atributo alt: adiciona
    return tag.replace(/<img\b/i, `<img alt='${alt}'`);
  });
}

// --------------- 3. IndexNow (indexação instantânea) ---------------

/**
 * Notifica os buscadores que suportam IndexNow (Bing, Yandex, Naver, Seznam,
 * Yep) sobre a nova URL. Google NÃO suporta IndexNow (usa sitemap/própria
 * infra), então isso complementa, não substitui, o sitemap.
 *
 * No-op seguro se INDEXNOW_KEY não estiver configurado (deploy nunca quebra).
 * Best-effort: nunca lança.
 */
export async function pingIndexNow(url: string): Promise<{ ok: boolean; status?: number; skipped?: boolean }> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return { ok: false, skipped: true };
  try {
    const host = new URL(url).host;
    const payload: Record<string, unknown> = {
      host,
      key,
      urlList: [url],
    };
    // keyLocation opcional: onde o arquivo <key>.txt está hospedado (mesmo host)
    if (process.env.INDEXNOW_KEY_LOCATION) payload.keyLocation = process.env.INDEXNOW_KEY_LOCATION;

    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.warn('[seo] pingIndexNow falhou:', err);
    return { ok: false };
  }
}
