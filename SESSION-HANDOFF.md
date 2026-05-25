# Radiata Blog — Handoff de Sessão
> Atualizado em 2026-05-24. Leia este arquivo inteiro antes de continuar qualquer trabalho.

---

## O que é este projeto

**Radiata Blog System** — substitui o n8n V8B. Pipeline automático que busca notícias de animes em ~20 fontes RSS, reescreve com Claude, e publica no WordPress (radiata.pro).

- **Stack:** Next.js 16 + TypeScript + Supabase + Vercel
- **Repo:** https://github.com/haozernohara/radiatastories (`master`)
- **Git local:** `radiata-dashboard/.git` — repo SEPARADO do monorepo pai
- **Deploy:** Vercel projeto `radiatastories` → https://radiatastories.vercel.app
- **WordPress:** https://radiata.pro (JNews Theme)
- **Pasta local:** `C:\Users\henri\OneDrive\Documentos\Radiata Claude Code\Blog Radiata\radiata-dashboard\`

---

## O que foi feito nesta sessão (2026-05-24)

### Feature principal: `scripts/rewrite_drafts_v2.py`

Script Python que reescreve rascunhos do WordPress **do zero** com Claude e os publica com imagens landscape de qualidade.

**Funcionamento:**
1. Claude Sonnet 4.6 escreve conteúdo 100% original baseado no tema (sem reaproveitar rascunho)
2. **AniList API** busca imagens por título (nunca ID hardcoded → elimina bug de duplicata)
3. **Pillow** faz center-crop da featured image para exatamente **1140×570px landscape**
4. **Wikipedia** como fallback para desenhos ocidentais que não estão no AniList
5. Cria posts NOVOS no WP (nova URL/slug) e deleta os velhos automaticamente

**Bugs resolvidos vs v1:**
- `_sanitize_html_field()` — Claude retorna aspas não-escapadas dentro do `conteudo_html` JSON
- `json.loads(strict=False)` — Claude retorna newlines literais dentro de strings JSON
- AniList por título → elimina IDs hardcoded errados que geravam imagens duplicadas
- Unicode: `sys.stdout.reconfigure(encoding='utf-8')` no Windows

---

## Status dos 4 posts reescritos — TODOS CONCLUIDOS

| Topic | WP ID | Título | Status | URL |
|-------|-------|--------|--------|-----|
| 771 | 2267 | 16 Clássicos dos Anos 90 e 2000 que Marcaram Gerações | ✅ Publicado | https://radiata.pro/classicos-anos-90-2000-desenhos-animados-parte-1/ |
| 1119 | 2302 | Clássicos dos Anos 90 e 2000: Parte 2 | ✅ Publicado | https://radiata.pro/classicos-anos-90-2000-desenhos-animados-parte-2/ |
| 778 | 2291 | Os Melhores Animes de 2020: Guia por Temporada | ✅ Publicado | https://radiata.pro/melhores-animes-de-2020-guia-por-temporada/ |
| 772 | 2312 | 8 Clássicos do Hentai que Todo Fã Deve Conhecer | ✅ Publicado | https://radiata.pro/classicos-do-hentai-anime-que-todo-fa-deve-conhecer/ |

---

## Próximos passos (em ordem de prioridade)

### P1 — Validar os 4 posts no site
Abrir os 4 URLs no browser e verificar:
- Featured image landscape 1140x570 aparece corretamente no topo
- Imagens nas seções do artigo (inline)
- Conteúdo em PT-BR humanizado, sem referências a fontes
- Encerramento com pergunta de engajamento

### P2 — Configurar cron-job.org (pipeline automático)
Criar 3 jobs em https://cron-job.org:
- URL: `https://radiatastories.vercel.app/api/pipeline/run`
- Método: GET
- Header: `Authorization: Bearer 81c667e4-5506-4482-b126-ecbe02184248`
- Horários: 07:00, 11:00, 15:00 (fuso: America/Sao_Paulo)

### P3 — Integrar ao dashboard Vercel (System 2)
Após validar, transformar o script em API route:
- Nova rota: `POST /api/dashboard/rewrite-draft` com `{post_id, topic_config}`
- Botão no dashboard: "Reescrever Rascunho" → seleciona o tema → publica
- Faz parte da **Phase 3 — Sistema de Temas Manuais** já planejada

### P4 — Phase 3: Sistema de Temas Manuais (dashboard)
Interface no dashboard para digitar um tema → Claude pesquisa + redige do zero → publicação manual

---

## Arquivos importantes

```
radiata-dashboard/
├── .env.local                        ← credenciais locais (nunca commitado)
├── SESSION-HANDOFF.md                ← este arquivo
├── IMAGE-STANDARDS.md                ← padrão de imagens aprovado
├── scripts/
│   ├── rewrite_drafts_v2.py          ← script de reescrita (VERSÃO ATUAL)
│   ├── rewrite_drafts.py             ← v1 (deprecated — mantido como referência)
│   ├── publish_benchmark.py          ← publica artigos replicados manualmente
│   └── rewrite_v2_log.txt            ← último log de execução
├── app/
│   ├── page.tsx                      ← dashboard principal
│   ├── posts/page.tsx                ← lista de posts publicados
│   ├── execucoes/page.tsx            ← histórico de runs
│   ├── logs/page.tsx                 ← viewer de logs ao vivo
│   └── api/
│       ├── pipeline/run/             ← endpoint do cron
│       ├── dashboard/trigger/        ← botão "Rodar agora"
│       ├── dashboard/pause/          ← botão "Pausar"
│       └── debug/                    ← rotas de debug
└── lib/pipeline/
    ├── orchestrator.ts               ← fluxo completo do pipeline
    ├── ai-rewriter.ts                ← Claude Sonnet 4.6
    ├── ai-qa.ts                      ← Claude Haiku 4.5
    ├── wp-publisher.ts               ← upload imagens + publicação WP
    ├── rss-fetcher.ts                ← busca ~20 feeds RSS
    └── extractor.ts                  ← extração de artigo via URL
```

---

## Credenciais (todas em .env.local)

| Var | Valor |
|-----|-------|
| WP_URL | https://radiata.pro |
| WP_USER | Henrique Prado |
| WP_APP_PASSWORD | C5ep JD2T EcH2 CFrW lpsG WHqS |
| ANTHROPIC_API_KEY | sk-ant-api03-... |
| CRON_SECRET | 81c667e4-5506-4482-b126-ecbe02184248 |
| PIPELINE_DRY_RUN | false |

---

## Posts publicados (histórico completo)

| ID WP | Título | Data | Sistema |
|-------|--------|------|---------|
| 2091 | Anime Expo 2026: Frieren e Sparks of Tomorrow | 2026-05-22 | RSS auto |
| 2096 | Buchigire Reijou — cast adicional | 2026-05-22 | RSS auto |
| 2117 | Rich Girl Caretaker estreia julho | 2026-05-23 | RSS auto |
| 2132 | 29 Melhores Animes Isekai (benchmark aprovado) | 2026-05-23 | Manual |
| 2267 | 16 Clássicos dos Anos 90 e 2000 — Parte 1 | 2026-05-24 | rewrite_drafts_v2.py |
| 2291 | Os Melhores Animes de 2020: Guia por Temporada | 2026-05-24 | rewrite_drafts_v2.py |
| 2302 | Clássicos dos Anos 90 e 2000: Parte 2 | 2026-05-24 | rewrite_drafts_v2.py |
| 2312 | 8 Clássicos do Hentai que Todo Fã Deve Conhecer | 2026-05-24 | rewrite_drafts_v2.py |

---

## Padrão de imagens (regra aprovada)

| Tipo | Featured | Seções |
|------|----------|--------|
| Notícia | 1 landscape ≥50KB | 1-2 inline |
| Lista/replicado | 1140×570px landscape (Pillow crop) | 1 por seção H2 |

- **Fonte featured:** AniList `bannerImage` → center-crop 1140×570 com Pillow
- **Fonte seções:** AniList `coverImage.extraLarge` (portrait OK para inline)
- **Fallback:** Wikipedia `originalimage` para séries ocidentais
- **Benchmark aprovado:** post ID 2132 em radiata.pro

---

## Decisões críticas (não mudar)

- `PIPELINE_DRY_RUN=false` em produção = publica de verdade
- Dashboard trigger sempre tem `dryRun: false` (hardcoded)
- Dedup hash gravado APÓS publish (Pitfall 2)
- Advisory lock é PRIMEIRA operação no handler
- Sub-repo `radiata-dashboard/.git` é SEPARADO do monorepo pai
- **Parser JSON:** usar `_sanitize_html_field()` + `json.loads(strict=False)` — Claude retorna newlines literais E aspas não-escapadas dentro de conteudo_html

---

## Contexto do usuário

- Henri — usa n8n, GHL, Claude Code no VS Code
- Objetivo: pipeline automático de posts de animes 3x/dia
- Feature de reescrita de rascunhos validada (4 posts publicados) → próximo: integrar ao dashboard Vercel
