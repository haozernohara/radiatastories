// ============================================================
// Radar de SEO — API (motor caseiro, sem API paga)
//   GET ?action=suggest&q=...            -> variações de busca (Google Suggest)
//   GET ?action=sitemap&domain=...       -> arquitetura do concorrente
//   GET ?action=compare&kw=..&a=..&b=..  -> engenharia reversa: página 1 vs nós
//   GET ?action=audit                    -> auditoria dos nossos posts
// ============================================================
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import {
  googleSuggest,
  fetchSitemapUrls,
  topicsFromUrls,
  analyzePage,
  kwScore,
  auditOurPosts,
} from '@/lib/pipeline/seo-radar';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') ?? 'suggest';

  try {
    if (action === 'suggest') {
      const q = searchParams.get('q')?.trim();
      if (!q) return Response.json({ error: 'informe ?q=' }, { status: 400 });
      return Response.json({ seed: q, terms: await googleSuggest(q) });
    }

    if (action === 'sitemap') {
      const domain = searchParams.get('domain')?.trim();
      if (!domain) return Response.json({ error: 'informe ?domain=' }, { status: 400 });
      const urls = await fetchSitemapUrls(domain);
      return Response.json({ domain, total: urls.length, topics: topicsFromUrls(urls), sample: urls.slice(0, 15) });
    }

    if (action === 'compare') {
      const kw = searchParams.get('kw')?.trim() ?? '';
      const a = searchParams.get('a')?.trim();
      const b = searchParams.get('b')?.trim();
      if (!a || !b) return Response.json({ error: 'informe ?a= e ?b=' }, { status: 400 });
      const [pa, pb] = await Promise.all([analyzePage(a), analyzePage(b)]);
      return Response.json({
        keyword: kw,
        a: { page: pa, ...kwScore(pa, kw) },
        b: { page: pb, ...kwScore(pb, kw) },
      });
    }

    if (action === 'audit') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 10), 20);
      return Response.json({ rows: await auditOurPosts(limit) });
    }

    return Response.json({ error: 'action inválida' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
