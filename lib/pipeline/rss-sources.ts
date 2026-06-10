// ============================================================
// Radiata Blog System — RSS Source Definitions
// Ported verbatim from V8B node "Lista fontes RSS"
// Order: JP first (priority 1), EN second (priority 2), BR last (priority 2-3)
// ============================================================

import type { RssSource } from './types';

export const RSS_SOURCES: RssSource[] = [
  // === JAPONESES (chegam 6-12h antes no BR — EXCLUSIVIDADE) ===
  // 2026-06: feeds antigos morreram (natalie/feed=404, mantanweb=offline, oricon=410).
  // Substituídos pelos feeds JP atuais que retornam notícia fresca.
  { nome: 'natalie',        url: 'https://natalie.mu/comic/feed/news',                    idioma: 'ja', prioridade: 1, tipo: 'JP' },
  { nome: 'animeanime',     url: 'https://animeanime.jp/rss/index.rdf',                   idioma: 'ja', prioridade: 1, tipo: 'JP' },
  // === INTERNACIONAIS (2-4h antes dos BR) ===
  { nome: 'ann',            url: 'https://www.animenewsnetwork.com/all/rss.xml',          idioma: 'en', prioridade: 2, tipo: 'EN' },
  { nome: 'crunchyroll_en', url: 'https://www.crunchyroll.com/newsrss',                   idioma: 'en', prioridade: 2, tipo: 'EN' },
  { nome: 'mal',            url: 'https://myanimelist.net/rss/news.xml',                  idioma: 'en', prioridade: 2, tipo: 'EN' },
  { nome: 'variety',        url: 'https://variety.com/t/anime/feed/',                     idioma: 'en', prioridade: 2, tipo: 'EN' },
  // === BRASILEIROS (complemento) ===
  { nome: 'animeunited',    url: 'https://www.animeunited.com.br/feed/',                  idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'intoxianime',    url: 'https://www.intoxianime.com/feed/',                     idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'tudosobreanime', url: 'https://tudosobreanime.com.br/feed/',                   idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'animenew_br',    url: 'https://animenew.com.br/feed/',                         idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'mundodosanimes', url: 'https://mundodosanimes.com/feed/',                      idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'otakusbrasil',   url: 'https://otakusbrasil.com/feed/',                        idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'jbox',           url: 'https://www.jbox.com.br/feed/',                         idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'aficionados',    url: 'https://www.aficionados.com.br/feed/',                  idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'omelete',        url: 'https://www.omelete.com.br/rss/mangas-animes',          idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'aninerd',        url: 'https://aninerd.com.br/feed/',                          idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'crunchyroll_br', url: 'https://www.crunchyroll.com/pt-br/rss/anime',           idioma: 'pt', prioridade: 2, tipo: 'BR' },
  { nome: 'cupulatrovao',   url: 'https://cupulatrovao.com.br/feed/',                     idioma: 'pt', prioridade: 3, tipo: 'BR' },
  { nome: 'animenewbr2',    url: 'https://animenew.com.br/noticias/feed/',                idioma: 'pt', prioridade: 3, tipo: 'BR' },
];
