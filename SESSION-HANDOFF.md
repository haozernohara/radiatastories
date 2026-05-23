# Radiata Blog — Handoff de Sessão
> Gerado em 2026-05-23. Leia este arquivo inteiro antes de continuar qualquer trabalho.

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

## O que foi feito nesta sessão (2026-05-23)

### 1. Phase 2 — Dashboard completo
Commitado e deployado (`a99d888`):
- `/posts`, `/execucoes`, `/logs` criadas (antes eram 404)
- Botão **"Rodar agora"** → `POST /api/dashboard/trigger` (dryRun: false fixo)
- Botão **"Pausar Sistema 1"** → `POST /api/dashboard/pause` (salva em `settings` table)
- Viewer de logs ao vivo em `/logs` com polling 3s
- Componentes shadcn: badge, button, card, tabs, table, sidebar

### 2. Melhorias no `ai-rewriter.ts`
- Prompt **45% menor** — removidas redundâncias
- Novo campo `tipo_artigo: "noticia" | "lista"` no user prompt
- Para **listas**: passa 12.000 chars de conteúdo (vs 4.000 para notícias), estrutura H2 por anime com ficha técnica
- Funções `rewriteArticle` e `rewriteArticleWithClient` aceitam `tipo?: ArticleType`

### 3. Script `scripts/publish_benchmark.py`
Script Python para publicar artigos de benchmark/replicados diretamente:
- Lê credenciais de `.env.local` automaticamente
- Chama Claude Sonnet 4.6 com prompt de lista
- Parser JSON robusto (mirrors `json-extract.ts`, fallback `json5`)
- Upload de imagens para WP + injeção por seção
- **Uso:** `python scripts/publish_benchmark.py [extracted_json]`

### 4. Post benchmark publicado
- **URL:** https://radiata.pro/melhores-animes-isekai-2/
- **ID WordPress:** 2132
- **Título:** "29 Melhores Animes Isekai de Reencarnação e Magia"
- **Fonte:** https://www.aficionados.com.br/melhores-animes-isekai/
- 29 seções, 29 imagens injetadas, featured image 154KB (Mushoku Tensei key visual do MAL)
- Aprovado pelo usuário como **benchmark de qualidade**

### 5. `IMAGE-STANDARDS.md` criado
Documentação do padrão de imagens obrigatório (ver abaixo).

---

## BLOQUEIO CRÍTICO — WP_URL no Vercel

**O pipeline automático (cron + botão "Rodar agora") NÃO funciona.**

**Diagnóstico:** o env var `WP_URL` no Vercel está com valor literal `"WP_URL"` em vez de `"https://radiata.pro"`.

**Sintoma:**
```json
GET /api/debug/wp-auth  →  {"ok":false,"status":0,"body":"TypeError: Failed to parse URL from WP_URL/wp-json/..."}
```

**Fix (1 minuto manual):**
1. Acesse https://vercel.com/radiata-s-projects/radiatastories/settings/environment-variables
2. Encontre `WP_URL` → mude o valor para `https://radiata.pro`
3. Salve → Vercel redeploy automático
4. Verifique com:
```bash
curl "https://radiatastories.vercel.app/api/debug/wp-auth" \
  -H "Authorization: Bearer 81c667e4-5506-4482-b126-ecbe02184248"
# Esperado: {"ok":true,"status":200,"userName":"Henrique Prado"}
```

Todos os outros env vars estão corretos e funcionando (Supabase, Anthropic, CRON_SECRET).

---

## Próximos passos (em ordem de prioridade)

### P1 — Fix WP_URL no Vercel (manual, 1 min)
Ver bloqueio acima.

### P2 — Configurar cron-job.org (após P1)
Criar 3 jobs em https://cron-job.org:
- URL: `https://radiatastories.vercel.app/api/pipeline/run`
- Método: GET
- Header: `Authorization: Bearer 81c667e4-5506-4482-b126-ecbe02184248`
- Horários: 07:00, 11:00, 15:00 (fuso: America/Sao_Paulo)

### P3 — Testar pipeline completo
Após fix do WP_URL:
```bash
curl -X POST "https://radiatastories.vercel.app/api/pipeline/run" \
  -H "Authorization: Bearer 81c667e4-5506-4482-b126-ecbe02184248"
```
Monitorar em https://radiatastories.vercel.app/logs

### P4 — Phase 3: Sistema de Temas Manuais
- Interface no dashboard para o usuário digitar um tema
- Pipeline: Claude pesquisa + redige artigo do zero (sem RSS)
- Publicação manual via dashboard

### P5 — Continuar benchmarking com outros blogs
O usuário quer replicar artigos de outros blogs para melhorar o algoritmo de reescrita. Usar `scripts/publish_benchmark.py` com o JSON extraído de cada fonte.

---

## Padrão de imagens (regra aprovada)

| Tipo | Imagens |
|------|---------|
| Notícia (`noticia`) | Mínimo 1 featured + 1 no corpo |
| Lista/replicado (`lista`) | 1 por seção H2, igual ao original |
| Seção de encerramento | Sem imagem (intencional) |

- Featured mínimo 50KB, sem watermark
- Fonte recomendada: `cdn.myanimelist.net/images/anime/...l.jpg`
- Benchmark aprovado: post ID 2132 em radiata.pro
- Documentação completa: `IMAGE-STANDARDS.md`

---

## Estrutura de arquivos importante

```
radiata-dashboard/
├── .env.local                    ← credenciais locais (não commitado)
├── IMAGE-STANDARDS.md            ← padrão de imagens (novo)
├── SESSION-HANDOFF.md            ← este arquivo
├── app/
│   ├── page.tsx                  ← dashboard principal com PipelineControls
│   ├── posts/page.tsx            ← lista de posts publicados
│   ├── execucoes/page.tsx        ← histórico de runs
│   ├── logs/page.tsx             ← viewer de logs ao vivo
│   └── api/
│       ├── pipeline/run/         ← endpoint do cron (usa CRON_SECRET)
│       ├── dashboard/trigger/    ← botão "Rodar agora" (dryRun: false)
│       ├── dashboard/pause/      ← botão "Pausar"
│       ├── logs/                 ← polling de logs
│       └── debug/                ← rotas de debug (wp-auth, rss, extract, etc.)
├── lib/pipeline/
│   ├── orchestrator.ts           ← fluxo completo do pipeline
│   ├── ai-rewriter.ts            ← Claude Sonnet 4.6, suporta "noticia"|"lista"
│   ├── ai-qa.ts                  ← Claude Haiku 4.5, revisão de qualidade
│   ├── wp-publisher.ts           ← upload imagens + publicação WP
│   ├── rss-fetcher.ts            ← busca ~20 feeds RSS
│   ├── scorer.ts                 ← scoring e deduplicação
│   └── extractor.ts              ← extração de artigo via URL
└── scripts/
    └── publish_benchmark.py      ← publica artigos replicados manualmente
```

---

## Env vars (todas configuradas em Vercel exceto WP_URL)

| Var | Status |
|-----|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | OK |
| `SUPABASE_SERVICE_ROLE_KEY` | OK |
| `ANTHROPIC_API_KEY` | OK |
| `WP_URL` | **ERRO** — valor `"WP_URL"`, deve ser `"https://radiata.pro"` |
| `WP_USER` | OK (verificar após fix WP_URL) |
| `WP_APP_PASSWORD` | OK (verificar após fix WP_URL) |
| `CRON_SECRET` | OK — `81c667e4-5506-4482-b126-ecbe02184248` |
| `PIPELINE_DRY_RUN` | OK — `false` |

---

## Rotas de debug disponíveis

Todas requerem `Authorization: Bearer 81c667e4-5506-4482-b126-ecbe02184248`

| Rota | Método | Uso |
|------|--------|-----|
| `/api/debug/wp-auth` | GET | Testa conexão WP — esperado `{"ok":true}` |
| `/api/debug/rss` | GET | Lista top 3 candidatos RSS |
| `/api/debug/extract` | POST `{url}` | Extrai artigo |
| `/api/debug/rewrite` | POST `{url,...}` | Extrai + reescreve + QA |
| `/api/debug/force-publish` | POST | Publica URL específica sem QA |
| `/api/pipeline/run` | GET/POST | Pipeline completo |

---

## Posts publicados até agora

| ID | Título | Data |
|----|--------|------|
| 2091 | Anime Expo 2026: Frieren e Sparks of Tomorrow | 2026-05-22 |
| 2096 | Buchigire Reijou — cast adicional | 2026-05-22 |
| 2117 | Rich Girl Caretaker estreia julho (pipeline auto) | 2026-05-23 |
| 2132 | 29 Melhores Animes Isekai (**benchmark aprovado**) | 2026-05-23 |

---

## Contexto do usuário

- Henri — usa n8n, GHL, Claude Code no VS Code
- Objetivo: pipeline automático de posts de animes 3x/dia
- Está construindo benchmarking com artigos de outros blogs para evoluir o algoritmo
- Próximos blogs de benchmark a replicar: a definir pelo usuário
- Fluxo aprovado: artigo de lista com 1 img por seção = padrão de qualidade
