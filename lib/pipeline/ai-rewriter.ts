// ============================================================
// Radiata Blog System — AI Rewriter (Claude Sonnet 4.6)
// Phase 1, Plan 04
// ============================================================
// PIPE-15: Claude Sonnet 4.6 rewrite: PT-BR, min 1300 words, JNews structure

import Anthropic from '@anthropic-ai/sdk';
import { extractJsonObject } from './json-extract.ts';
import { MODELS, type ExtractedArticle, type RewriteResult, type ScoredCandidate } from './types.ts';

// --------------- buscar_posts tool ---------------

const WP_URL_INTERNAL = process.env.WP_URL ?? 'https://radiata.pro';

const BUSCAR_POSTS_TOOL = {
  name: 'buscar_posts',
  description: 'Busca posts publicados no blog Radiata.pro por termos relevantes. Use para encontrar artigos relacionados ao tema e incluir links internos contextuais.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Termos de busca (ex: nome do anime, personagem, estúdio)' },
    },
    required: ['query'],
  },
} as const;

async function executeBuscarPosts(query: string): Promise<string> {
  try {
    const url = `${WP_URL_INTERNAL}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=3&_fields=id,link,title,slug&status=publish`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return JSON.stringify([]);
    const posts: any[] = await res.json();
    return JSON.stringify(
      posts.map((p) => ({ titulo: p.title?.rendered ?? p.slug, link: p.link }))
    );
  } catch {
    return JSON.stringify([]);
  }
}

// ---- System prompt — handles "noticia" and "lista" article types ----
export const REWRITE_SYSTEM_PROMPT = `# AGENTE REDATOR — RADIATA.PRO

## BLOG
**Radiata Animes** (radiata.pro) — notícias, recomendações e curiosidades de animes para otakus brasileiros (15-35 anos).
Tom: entusiasmado, voz de fã apaixonado. Use "galera", "pessoal", "que saga!", "vixi", "nakama". Informal mas informativo.

**JNews Theme:** a featured image aparece automaticamente no topo — NÃO a repita no \`conteudo_html\`. Use \`<figure class='wp-block-image'>\` para imagens extras dentro do conteúdo.

---

## MISSÃO
Reescrever completamente em PT-BR humanizado. Nunca mencionar a fonte original. Nunca inventar fatos.
Mínimo **1.300 palavras**. Título: até 60 chars. Slug: kebab-case sem acento, max 75 chars.

---

## ESTRUTURA — ESCOLHA CONFORME \`tipo_artigo\` NO PROMPT DO USUÁRIO

### tipo_artigo = "noticia" (padrão quando não especificado)
1. **INTRO** (150-200 palavras) — contexto + gancho da notícia. Sem "neste artigo" ou "vamos ver"
2. **H2: Contexto do Anime** — estúdio, episódios, nota MAL se souber
3. **H2: [Título descritivo da notícia]** — detalhe completo do anúncio/evento
4. **H2: O Que Esperar** — impacto, reações, expectativas dos fãs; H3 para subseções
5. **ENCERRAMENTO** (150-200 palavras) — título criativo (ex: "Radiata Diz:", "O Veredicto:"), nunca "Conclusão". Termina com pergunta de engajamento OBRIGATÓRIA.

### tipo_artigo = "lista"
1. **INTRO** (150-200 palavras) — explique o gênero/tema, por que a lista é essencial, para quem é
2. **Para cada item** (use exatamente este formato HTML):
\`\`\`
<h2>N. Título do Anime (Ano)</h2>
<p><strong>Título original:</strong> ... | <strong>Gêneros:</strong> ... | <strong>Episódios:</strong> ... | <strong>Nota IMDb:</strong> ...</p>
<p>2-3 frases envolventes no tom Radiata: trama resumida + por que vale assistir.</p>
\`\`\`
3. **ENCERRAMENTO** — H2 com título como "Qual você vai maratonar, galera?" + pergunta de engajamento OBRIGATÓRIA

---

## LINKS INTERNOS (via tool \`buscar_posts\`)
Faça 2-3 buscas, inclua 2-3 links contextuais no corpo. Anchor text natural (ex: "o épico Re:Zero"). Nunca "Leia também", "clique aqui" ou "saiba mais".

---

## SEO
Keyword principal: no título + primeiros 100 palavras + pelo menos 1 H2.
Meta descrição: 145-155 chars, começa com a keyword, é atraente.

---

## CATEGORIAS
97=Notícias | 109=Temporada | 108=Mangás | 9=Animes
100=Ação | 102=Comédia | 103=Fantasia | 104=Isekai | 101=Romance | 99=Terror | 106=Ecchi

## TAGS
Inclua: nome PT-BR, nome JP, estúdio (se souber), gênero principal, ano relevante (ex: "anime 2026").

---

## ⚠️ REGRAS JSON — CRÍTICAS

**R1 — Aspas em HTML:** dentro de \`conteudo_html\` use SEMPRE aspas SIMPLES em atributos:
✅ \`<a href='https://radiata.pro/re-zero'>Re:Zero</a>\`  ❌ \`href="..."\` quebra o JSON

**R2 — Sem texto fora do JSON:** começa direto com \`{\`, termina com \`}\`. Sem markdown, sem prefixo.

**R3 — Sem vírgula final:** \`{ "a": 1, "b": 2 }\` ✅  vs  \`{ "a": 1, "b": 2, }\` ❌

---

## SAÍDA — EXATAMENTE 7 CHAVES
\`{"titulo":"...","slug":"...","conteudo_html":"...","meta_descricao":"...","tags":["..."],"categoria_id":104,"nome_anime":"..."}\`

## PROIBIÇÕES
- Mencionar a fonte/site de origem | Inventar fatos
- "É importante notar", "Vale ressaltar" repetido | "Conclusão" como título de seção
- Aspas duplas em atributos HTML | Truncar com "..." ou "[continua]"
- Repetir a featured image no início do conteudo_html

**O post deve ser COMPLETO do início ao fim, com a pergunta de engajamento no final.**`;

export type ArticleType = 'noticia' | 'lista';

// ---- User prompt builder ----
function buildUserPrompt(
  article: ExtractedArticle,
  candidate: ScoredCandidate,
  tipo?: ArticleType
): string {
  const tipoArtigo: ArticleType = tipo ?? 'noticia';
  const temVideo = article.videos_embed.length > 0 ? 'sim' : 'não';
  const videoPrincipal = article.videos_embed[0] ?? '';
  const crossRefSites = candidate.cross_ref_sites.join(', ') || '';
  // For lista articles pass more content so Claude sees all items
  const maxChars = tipoArtigo === 'lista' ? 12000 : 4000;
  const conteudoBruto = article.texto_limpo.slice(0, maxChars);

  return `**tipo_artigo:** ${tipoArtigo}
**Título original:** ${candidate.titulo}
**Site:** ${candidate.site_nome} (${candidate.site_tipo} — idioma: ${candidate.site_idioma})
**Reportada por ${candidate.cross_ref_count || 1} site(s):** ${crossRefSites}
**Palavras extraídas:** ${article.palavras}${temVideo === 'sim' ? `\n**Vídeo embed:** ${videoPrincipal}` : ''}
**Slug base sugerido:** ${candidate.slug_base}

**CONTEÚDO DO ARTIGO ORIGINAL:**
${conteudoBruto}

---
INSTRUÇÕES:
1. Use buscar_posts para encontrar 2-3 posts do Radiata.pro relacionados e inclua links internos
2. Escreva o post completo (mínimo 1300 palavras) seguindo a estrutura do sistema para \`${tipoArtigo}\`${temVideo === 'sim' ? '\n3. Inclua o vídeo embed após o 2º H2' : ''}
${tipoArtigo === 'lista' ? '3. Escreva TODOS os itens da lista — não omita nenhum\n4. ' : '3. '}Retorne APENAS o JSON com as 7 chaves, sem markdown`;
}

// ---- Required keys for a valid RewriteResult ----
const REQUIRED_KEYS: (keyof RewriteResult)[] = [
  'titulo',
  'slug',
  'conteudo_html',
  'meta_descricao',
  'tags',
  'categoria_id',
  'nome_anime',
];

// ---- Parse helper (shared by tool-use loop and tests) ----
function parseRewriteResponse(rawText: string): any {
  return extractJsonObject(rawText);
}

// ---- Core implementation (injectable client for testing) ----
export async function rewriteArticleWithClient(
  article: ExtractedArticle,
  candidate: ScoredCandidate,
  client: any,
  tipo?: ArticleType
): Promise<RewriteResult> {
  const userPrompt = buildUserPrompt(article, candidate, tipo);

  const messages: any[] = [{ role: 'user', content: userPrompt }];
  let rawText = '';

  // Tool-use loop — max 3 iterations to prevent runaway tool calls
  for (let iter = 0; iter < 3; iter++) {
    const response = await client.messages.create({
      model: MODELS.REWRITE,
      max_tokens: 16000,
      temperature: 0.4,
      system: REWRITE_SYSTEM_PROMPT,
      messages,
      tools: [BUSCAR_POSTS_TOOL],
    });

    if (response.stop_reason === 'tool_use') {
      // Append assistant message with all content blocks
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool call and collect results
      const toolResults: any[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === 'buscar_posts') {
          const result = await executeBuscarPosts((block.input as any).query ?? '');
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // stop_reason === 'end_turn' (or max_tokens) — extract JSON from text blocks
    rawText = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    break;
  }

  // Extract and parse JSON
  const parsed = parseRewriteResponse(rawText) as any;

  // Validate all 7 required keys are present
  for (const key of REQUIRED_KEYS) {
    if (!(key in parsed) || parsed[key] === undefined || parsed[key] === null) {
      throw new Error(`RewriteResult missing required key: "${key}"`);
    }
  }

  // Coerce types
  const categoriaId = typeof parsed.categoria_id === 'number'
    ? parsed.categoria_id
    : parseInt(String(parsed.categoria_id), 10);

  if (isNaN(categoriaId)) {
    throw new Error(`RewriteResult.categoria_id is not a valid number: ${parsed.categoria_id}`);
  }

  const tags: string[] = Array.isArray(parsed.tags)
    ? parsed.tags.map(String)
    : [String(parsed.tags)];

  // Trim titulo and slug to max lengths
  const titulo = String(parsed.titulo).slice(0, 60);
  const slug = String(parsed.slug).slice(0, 75);

  return {
    titulo,
    slug,
    conteudo_html: String(parsed.conteudo_html),
    meta_descricao: String(parsed.meta_descricao),
    tags,
    categoria_id: categoriaId,
    nome_anime: String(parsed.nome_anime),
  };
}

// ---- Public API (uses real Anthropic client) ----
export async function rewriteArticle(
  article: ExtractedArticle,
  candidate: ScoredCandidate,
  tipo?: ArticleType
): Promise<RewriteResult> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 90_000,
    maxRetries: 4,
  });
  return rewriteArticleWithClient(article, candidate, anthropic, tipo);
}
