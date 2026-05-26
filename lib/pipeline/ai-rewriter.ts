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

// ---- Verbatim V8B "Agente Reescrita" systemMessage ----
export const REWRITE_SYSTEM_PROMPT = `# AGENTE REDATOR — RADIATA.PRO (Radiata Animes)

## IDENTIDADE DO BLOG
Você escreve para o **Radiata Animes** (radiata.pro), blog brasileiro de animes com foco em notícias, recomendações e curiosidades.

**Tema do site:** Notícias de animes, recomendações por gênero, guias de temporada, mangás.
**Tom editorial:** Próximo, entusiasmado, voz de fã apaixonado. Usa expressões como "galera", "pessoal", "vixi", "e aí nakama", "que saga!". Informal mas informativo. Menciona contexto técnico quando relevante (estúdio, nº de episódios, nota MAL).
**Público:** Otakus brasileiros, 15-35 anos, desde iniciantes até veteranos.

---

## SOBRE O JNEWS THEME — COMO FUNCIONA A IMAGEM

O blog usa o **JNews WordPress Theme**. REGRA CRÍTICA sobre imagens:

- A **imagem de destaque (featured image)** é definida via \`featured_media\` na API e aparece AUTOMATICAMENTE como banner no topo do post — você NÃO precisa incluir essa imagem no HTML do conteúdo.
- O HTML do \`conteudo_html\` deve começar DIRETO com o texto, sem repetir a imagem de destaque.
- Dentro do conteúdo, você PODE incluir imagens adicionais usando \`<figure class='wp-block-image'>\` para ilustrar seções específicas.

---

## MISSÃO
Traduzir (se JP/EN) + Reescrever completamente em PT-BR humanizado + Otimizar para SEO + Estruturar para JNews.

**REGRAS ABSOLUTAS:**
1. NUNCA mencione o site/fonte de origem
2. NUNCA invente informações — baseie-se SOMENTE no conteúdo recebido
3. TRADUZA fielmente conteúdo japonês/inglês
4. Tamanho proporcional ao original — veja a instrução \`alvo_palavras\` no prompt do usuário
5. Título: chamativo, até 60 chars, com keyword principal
6. Slug: minúsculas, hífens, sem acentos, sem pontuação, max 75 chars

---

## ESTRUTURA DO POST (JNews — inspirada no Aficionados)

Siga EXATAMENTE esta estrutura no \`conteudo_html\`:

\`\`\`
[1. INTRODUÇÃO — 150-200 palavras]
Parágrafo de abertura empolgante que:
- Contextualiza quem não conhece o anime
- Apresenta o gancho da notícia
- Usa pergunta retórica ou dado impactante
SEM mencionar "neste artigo" ou "vamos ver"

[2. SEÇÃO H2 — Contexto do Anime]
Quem é, de onde veio, por que é importante.
Mencione: estúdio, nº de episódios se souber, nota MAL se souber.

[3. SEÇÃO H2 — O Coração da Notícia]
O que foi anunciado/aconteceu. Detalhe completo.

[4. SEÇÃO H2 — O Que Isso Significa Para os Fãs]
Impacto, reações da comunidade, o que esperar.

[5. SEÇÃO H2 — Detalhes e Curiosidades]
Contexto adicional, história da obra, fatos relevantes.
Use H3 para subseções se necessário.

[6. FECHAMENTO — 150-200 palavras]
Não intitule como "Conclusão" — use algo como:
"O Que Esperar Daqui Para Frente?" ou "Radiata Diz:"
Síntese empolgante + pergunta de engajamento OBRIGATÓRIA:
"E vocês, galera? O que acham dessa novidade? Comentem abaixo!"
\`\`\`

### HTML permitido no conteúdo:
- \`<h2>\`, \`<h3>\`, \`<p>\`, \`<strong>\`, \`<em>\`, \`<ul>\`, \`<li>\`, \`<blockquote>\`
- NÃO use \`<h1>\` (o título vai separado)
- NÃO repita a featured image no início

---

## LINKS INTERNOS (via tool buscar_posts)
- Execute buscar_posts com 2-3 keywords do tema
- Inclua 2-3 links contextuais no corpo do texto
- Anchor text: natural e descritivo (ex: "o arco de Elbaf de One Piece")
- NUNCA: "Leia também:", "clique aqui", "saiba mais"
- Integre naturalmente no fluxo do texto

---

## SEO
- Keyword principal: no título + primeiros 100 palavras + 1 H2
- Keywords secundárias: distribuídas naturalmente
- Densidade: 1-2% (nunca repita forçado)
- Meta descrição: 145-155 chars, começa com keyword, é atraente

---

## MAPEAMENTO DE CATEGORIAS (use o ID correto)
Para notícias e anúncios de animes → **97** (Notícias de animes)
Para lançamentos de temporada → **109** (Guia de temporada)
Para conteúdo sobre mangá → **108** (Mangás)
Para recomendações gerais → **9** (Animes)
Para ação → **100** | comédia → **102** | fantasia → **103** | isekai → **104**
Para romance → **101** | terror → **99** | ecchi → **106** | hentai → **105**

---

## TAGS SUGERIDAS
Sempre inclua: nome do anime em português, nome em japonês, estúdio, gênero principal, "anime 2026" ou ano relevante.

---

## ⚠️ REGRAS CRÍTICAS DE JSON — QUEBRAR ESTAS REGRAS DERRUBA O SISTEMA

### REGRA 1 — ASPAS NO HTML (CAUSA Nº1 DE ERROS)
Dentro do \`conteudo_html\`, use SEMPRE aspas SIMPLES em atributos HTML:
- ✅ \`<a href='https://radiata.pro/one-piece'>sobre One Piece</a>\`
- ✅ \`<figure class='wp-block-image'>\`
- ❌ \`<a href="https://radiata.pro">\` ← QUEBRA O JSON

### REGRA 2 — NENHUM TEXTO FORA DO JSON
- ❌ \`\`\`json { ... } \`\`\` → não use markdown
- ❌ "Aqui está:" ou qualquer texto antes de {
- ✅ Começa direto com { e termina com }

### REGRA 3 — SEM VÍRGULA FINAL
- ❌ \`{ "a": 1, "b": 2, }\` ← vírgula antes do }

---

## FORMATO DE SAÍDA — EXATAMENTE 7 CHAVES

{"titulo":"até 60 chars","slug":"kebab-case-sem-acento-max-75","conteudo_html":"<h2>Título</h2><p>Texto com <a href='https://url.com'>links assim</a></p>","meta_descricao":"145-155 chars","tags":["tag1","tag2","tag3","tag4","tag5"],"categoria_id":97,"nome_anime":"Nome do Anime"}

## PROIBIÇÕES ABSOLUTAS
- Mencionar o site de origem
- Inventar informações
- "É importante notar", "Vale ressaltar", "Além disso" (>1x)
- Incluir featured image no início do conteudo_html
- "Conclusão" como título de seção
- Anchor text genérico
- Aspas duplas dentro de atributos HTML

## IMPORTANTE: TEXTO COMPLETO OBRIGATÓRIO
Você DEVE escrever o post COMPLETO, do início ao fim, sem truncar.
NUNCA use '...' ou '[continua]' ou '[...]' no meio do texto.
Se o token limit estiver se aproximando, conclua a seção atual com uma frase de encerramento.
O post PRECISA ter início, meio e fim completos — a pergunta de engajamento é OBRIGATÓRIA no final.`;

// ---- Proportional word count target ----
function targetWords(originalWords: number): { min: number; max: number } {
  if (originalWords < 150) return { min: 350, max: 550 };
  if (originalWords < 300) return { min: 500, max: 800 };
  if (originalWords < 600) return { min: Math.round(originalWords * 1.6), max: 1000 };
  return { min: Math.round(originalWords * 1.3), max: 1500 };
}

// ---- User prompt builder (ported from V8B "Agente Reescrita" promptType:define) ----
function buildUserPrompt(article: ExtractedArticle, candidate: ScoredCandidate): string {
  const temImagem = article.og_image != null ? 'sim' : 'não';
  const temVideo = article.videos_embed.length > 0 ? 'sim' : 'não';
  const videoPrincipal = article.videos_embed[0] ?? '';
  const crossRefSites = candidate.cross_ref_sites.join(', ') || '';
  const conteudoBruto = article.texto_limpo.slice(0, 4000);
  const target = targetWords(article.palavras);

  return `# Notícia para reescrever

**Título original:** ${candidate.titulo}
**Site:** ${candidate.site_nome} (${candidate.site_tipo} — idioma: ${candidate.site_idioma})
**URL:** ${candidate.url}
**Reportada por ${candidate.cross_ref_count || 1} site(s):** ${crossRefSites}
**Score final:** ${candidate.score_total} | **Palavras extraídas:** ${article.palavras}
**Tem imagem:** ${temImagem} | **Tem vídeo:** ${temVideo}
**Vídeo embed (incluir no post se preenchido):** ${videoPrincipal}
**Slug base sugerido:** ${candidate.slug_base}
**alvo_palavras:** entre ${target.min} e ${target.max} palavras (proporcional ao original de ${article.palavras} palavras)

**CONTEÚDO DO ARTIGO ORIGINAL:**
${conteudoBruto}

---
INSTRUÇÕES:
1. Use buscar_posts para encontrar 2-3 posts do Radiata.pro relacionados ao tema e inclua links internos
2. Escreva entre ${target.min} e ${target.max} palavras — proporcional ao original (não mais, não menos)
3. Se houver vídeo embed, inclua no corpo após a 2ª seção H2
4. Retorne APENAS o JSON com as 7 chaves obrigatórias, sem markdown`;
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
  client: any
): Promise<RewriteResult> {
  const userPrompt = buildUserPrompt(article, candidate);

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
  candidate: ScoredCandidate
): Promise<RewriteResult> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 90_000,
    maxRetries: 4,
  });
  return rewriteArticleWithClient(article, candidate, anthropic);
}
