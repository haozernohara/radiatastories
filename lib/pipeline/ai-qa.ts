// ============================================================
// Radiata Blog System — AI QA Reviewer (Claude Haiku 4.5)
// Phase 1, Plan 04
// ============================================================
// PIPE-16: 6-criterion QA, avg >=7.0, none <5
// PIPE-17: Failsafe: if QA errors technically, auto-approve

import Anthropic from '@anthropic-ai/sdk';
import { extractJsonObject } from './json-extract.ts';
import { MODELS, type QAResult, type RewriteResult } from './types.ts';

// ---- Verbatim V8B "Agente Revisao" systemMessage ----
export const QA_SYSTEM_PROMPT = `# REVISOR DE POSTS — RADIATA.PRO

Você é o editor-chefe do Radiata Animes. Revisa posts antes da publicação.

## 6 CRITÉRIOS (nota 0-10 cada)

1. **HUMANIZACAO**: Tom natural, apaixonado por anime, voz de fã brasileiro? Usa expressões da comunidade?
2. **COERENCIA**: Informações consistentes? Sem contradições? Texto coeso e fluido?
3. **SEO_BASICO**: Título ≤60 chars? Meta 145-155 chars com keyword? H2/H3 distribuídos?
4. **COMPLETUDE**: Mínimo 1300 palavras com substância? Seções bem desenvolvidas? Contexto do anime incluído?
5. **FIDELIDADE**: Baseado nos fatos recebidos? Sem invenções? Sem promessas infundadas?
6. **PORTUGUES**: PT-BR correto e fluente? Sem erros gramaticais? Sem mistura desnecessária com inglês/japonês?

## REGRA
Aprovado se: média ≥ 7.0 E nenhum critério < 5.

## OUTPUT — JSON PURO (sem nada antes/depois)
\`\`\`json
{
  "aprovado": true,
  "notas": { "humanizacao": 8, "coerencia": 9, "seo_basico": 8, "completude": 8, "fidelidade": 9, "portugues": 9 },
  "media": 8.5,
  "motivo_reprovacao": null,
  "sugestoes_melhoria": []
}
\`\`\``;

// ---- PIPE-17 Failsafe object — auto-approves on any technical failure ----
const FAILSAFE: QAResult = {
  aprovado: true,
  notas: {
    humanizacao: 8,
    coerencia: 8,
    seo_basico: 8,
    completude: 8,
    fidelidade: 8,
    portugues: 8,
  },
  media: 8.0,
  motivo_reprovacao: null,
  failsafe: true,
};

// ---- User prompt builder (ported from V8B "Agente Revisao" promptType:define) ----
function buildQAPrompt(rewrite: RewriteResult): string {
  return `# POST PARA REVISAR — RADIATA.PRO

**Título:** ${rewrite.titulo}
**Slug:** ${rewrite.slug}
**Meta:** ${rewrite.meta_descricao}
**Categoria ID:** ${rewrite.categoria_id}
**Nome do anime:** ${rewrite.nome_anime}

**Conteúdo HTML (primeiros 8000 chars):**
${rewrite.conteudo_html.slice(0, 8000)}

---
Avalie nos 6 critérios e retorne APENAS o JSON de revisão (sem markdown, sem texto extra).`;
}

// ---- Core implementation (injectable client for testing) ----
export async function qaReviewWithClient(
  rewrite: RewriteResult,
  client: any
): Promise<QAResult> {
  try {
    const response = await client.messages.create({
      model: MODELS.QA,
      max_tokens: 1024,
      temperature: 0.1,
      system: QA_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildQAPrompt(rewrite) }],
    });

    const raw: string = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    const parsed: any = extractJsonObject(raw);

    const notas = parsed.notas;
    if (!notas || typeof notas !== 'object') {
      throw new Error('Missing or invalid "notas" in QA response');
    }

    // Defensive recomputation — do not trust the model's aprovado/media fields
    const criteria = Object.values(notas) as number[];
    if (criteria.length === 0) throw new Error('notas object is empty');

    const media_calc = criteria.reduce((a, b) => a + b, 0) / criteria.length;
    const min_calc = Math.min(...criteria);

    return {
      aprovado: media_calc >= 7.0 && min_calc >= 5,
      notas,
      media: media_calc,
      motivo_reprovacao: parsed.motivo_reprovacao ?? null,
    };
  } catch (err) {
    // PIPE-17: never throw — always resolve with failsafe approval
    console.warn('[ai-qa] failsafe triggered:', err);
    return FAILSAFE;
  }
}

// ---- Public API (uses real Anthropic client) ----
export async function qaReview(rewrite: RewriteResult): Promise<QAResult> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 60_000,
    maxRetries: 2,
  });
  return qaReviewWithClient(rewrite, anthropic);
}
