// ============================================================
// Radiata Blog System — AniList image enrichment
// ============================================================
// Busca banner + capa de um anime no AniList GraphQL para garantir
// pelo menos uma 2ª imagem no corpo do post quando a fonte original
// trouxe poucas imagens. Falha silenciosa -> retorna [] (nunca quebra o pipeline).
// ============================================================

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

const QUERY = `query($s:String){ Media(search:$s, type:ANIME){ bannerImage coverImage{ extraLarge large } } }`;

/**
 * Retorna URLs de imagem do AniList (banner primeiro, depois capa) para o anime.
 * Ordem pensada para virar imagem de CORPO (extras), não featured.
 */
export async function fetchAnilistImages(animeName: string): Promise<string[]> {
  const term = (animeName ?? '').trim();
  if (!term) return [];
  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { s: term } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { Media?: { bannerImage?: string | null; coverImage?: { extraLarge?: string | null; large?: string | null } } };
    };
    const media = json?.data?.Media;
    if (!media) return [];
    const urls: string[] = [];
    if (media.bannerImage) urls.push(media.bannerImage);
    const cover = media.coverImage?.extraLarge ?? media.coverImage?.large;
    if (cover) urls.push(cover);
    return urls;
  } catch {
    return [];
  }
}
