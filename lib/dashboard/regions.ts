/* ============================================================
   Radiata — regiões de origem + helpers de UI do painel
   ============================================================ */

export type RegionKey = "jp" | "us" | "br";

export interface Region {
  code: string;
  name: string;
  color: string; // CSS var token, ex: "var(--jp)"
  priority: string;
  lead: string;
  sources: string[];
}

export const REGIONS: Record<RegionKey, Region> = {
  jp: {
    code: "JP",
    name: "Japão",
    color: "var(--jp)",
    priority: "Prioridade máxima",
    lead: "Furo de 6–12h antes do BR",
    sources: ["Natalie (anime/mangá)", "MANTANWEB · Mainichi", "Oricon"],
  },
  us: {
    code: "US",
    name: "EUA / Internacional",
    color: "var(--us)",
    priority: "2ª prioridade",
    lead: "2–4h antes do BR",
    sources: ["Anime News Network", "Crunchyroll (EN)", "MyAnimeList", "Variety"],
  },
  br: {
    code: "BR",
    name: "Brasil",
    color: "var(--br)",
    priority: "Complemento",
    lead: "Garante o que já bomba aqui",
    sources: [
      "AnimeUnited", "IntoxiAnime", "TudoSobreAnime", "AnimeNew",
      "Mundo dos Animes", "Otakus Brasil", "JBox", "Aficionados",
      "Omelete", "Aninerd", "Crunchyroll BR", "Cúpula do Trovão",
    ],
  },
};

/** Cor do score QA por faixa (ver README do design). */
export function qaColor(v: number): string {
  if (v >= 8) return "var(--ok)";
  if (v >= 7) return "var(--neon)";
  if (v >= 5) return "var(--warn)";
  return "var(--fail)";
}

/** Mapeia o nome da fonte (source_site do Supabase) para a região. */
export function regionOf(site: string | null | undefined): RegionKey {
  const s = (site ?? "").toLowerCase();
  if (/natalie|mantan|oricon/.test(s)) return "jp";
  if (/ann|animenewsnetwork|crunchyroll_en|\bmal\b|myanimelist|variety/.test(s)) return "us";
  return "br";
}
