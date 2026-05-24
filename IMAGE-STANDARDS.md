# Radiata Blog — Padrão de Imagens

> Aprovado em 2026-05-23 com base no post benchmark:
> **"29 Melhores Animes Isekai"** → https://radiata.pro/melhores-animes-isekai-2/

---

## Regra geral

**Todo post publicado precisa ter imagem.** Sem exceção.

---

## Por tipo de artigo

### Notícia curta (`tipo_artigo = "noticia"`)

| Posição | Requisito |
|---------|-----------|
| Featured image | Obrigatória — imagem do anime ou do anúncio |
| No corpo | Mínimo 1 imagem adicional (após o 2º H2) |

O pipeline RSS já faz isso automaticamente via `injectImagesIntoHtml` no `wp-publisher.ts`.

---

### Artigo replicado / lista (`tipo_artigo = "lista"`)

| Posição | Requisito |
|---------|-----------|
| Featured image | Obrigatória — imagem temática representativa da lista |
| Por seção H2 | 1 imagem por anime/item, logo após o primeiro `</p>` |
| Seção de encerramento | Sem imagem (intencional) |

**O número de imagens deve ser similar ao artigo original.**  
Se o original tem 29 animes com imagem, o nosso post também deve ter.

---

## Critérios de qualidade

### Featured image
- Mínimo **50 KB** de tamanho de arquivo
- Sem watermark / marca d'água visível
- Sem texto sobreposto (títulos, logos)
- Preferir imagens de key visual oficial do anime ou coleção temática
- Fonte recomendada: `cdn.myanimelist.net/images/anime/` (imagens com sufixo `l.jpg`)
- Se a imagem original do artigo for ruim → buscar substituta no MAL

### Imagens de seção
- Preferir imagens `_cke.jpg` do Aficionados (recortadas em formato paisagem, limpas)
- Mínimo **20 KB**
- Usar `<figure class='wp-block-image size-large'>` com `loading='lazy'`

---

## Onde são injetadas no código

```
lib/pipeline/wp-publisher.ts     → injectImagesIntoHtml() — notícias automáticas
scripts/publish_benchmark.py     → inject_images() — artigos manuais de benchmark
```

### Posição de injeção (lista)
```html
<h2>N. Título do Anime (Ano)</h2>
<p><strong>Título original:</strong> ... | ...</p>   ← após este </p>
<figure class='wp-block-image size-large'>           ← imagem inserida aqui
  <img src='...' alt='anime isekai' loading='lazy'/>
</figure>
<p>Descrição do anime...</p>
```

---

## Verificação antes de publicar

```python
# Checar se todas as seções H2 têm <figure> (exceto conclusão)
parts = re.split(r'(<h2[^>]*>.*?</h2>)', html, flags=re.DOTALL)
for i in range(1, len(parts), 2):
    heading = re.sub('<[^>]+>', '', parts[i]).strip()
    has_img = '<figure' in (parts[i+1] if i+1 < len(parts) else '')[:600]
    if not has_img:
        print(f'MISSING: {heading}')
```

---

## Fontes de imagem aprovadas

| Fonte | Uso | Qualidade |
|-------|-----|-----------|
| `s.aficionados.com.br/imagens/` | Artigos replicados | Alta (`_cke.jpg` = recortado limpo) |
| `cdn.myanimelist.net/images/anime/` | Featured image, fallback | Alta (sufixo `l.jpg` = large) |
| `cdn.anilist.co/img/dir/anime/` | Fallback | Média-alta |
| `upload.wikimedia.org` | Featured genérica | Variável |

---

## Naming convention — filenames de imagem (SEO)

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Featured | `{post-slug}.jpg` | `melhores-animes-isekai.jpg` |
| Seção (por anime) | `{anime-kebab}.jpg` | `dragon-ball-z.jpg`, `sailor-moon.jpg` |

- Usar `_to_seo_slug(text)` do script para normalizar (remove acentos, espaços → `-`)
- Nunca usar padrão `radiata-{slug}-{idx:02d}` (sem nome do anime = sem SEO)
- Referência do workflow n8n: `nomeArquivo = slugFinal.ext`

---

## Problema documentado — imagens logo/vetor em vez de cenas (corrigido 2026-05-24)

**Sintoma:** Posts de cartoons ocidentais recebiam imagens de logo (pequenos, < 20KB) em vez de cenas dos shows.

**Causa:** `get_section_bytes()` priorizava `cover` (capa/logo) sobre `banner` (imagem landscape com cena real). Para shows ocidentais no AniList, `cover` é frequentemente a logo oficial em baixa resolução.

**Fix aplicado:**
- Ordem de tentativa: `banner` → `cover` → **Fandom wiki** → Wikipedia
- Filtro de tamanho: imagens < 20KB são rejeitadas (logos vetoriais)
- `wikipedia_image()` usa `pageimages` API (mais confiável que `page/summary`)
- `FANDOM_WIKIS` em `rewrite_drafts_v2.py` e `fix_post_images.py`: 26 shows mapeados com subdomínios e páginas de personagem verificados

**Shows ocidentais sem cobertura AniList:** ~30% dos cartoons ocidentais dos anos 90-00 (Code Lyoko, Xiaolin Showdown, Jimmy Neutron, Megas XLR, etc.) não têm imagem em nenhuma fonte disponível. Limitação conhecida.

---

## Problema documentado — Wikipedia retorna imagem não relacionada (corrigido 2026-05-24)

**Sintoma:** Seção "14. Recess (1997)" no post 2267 recebeu imagem de um computador Apple II em vez de uma cena do cartoon.

**Causa:** `wikipedia_image("Recess TV series")` retornou a imagem de infobox do artigo Wikipedia, que era uma imagem de equipamento de playground/computador — não um personagem ou cena do show.

**Fix aplicado em `get_section_bytes()` e `find_best_image()`:**
```python
# Para cartoons ocidentais, tenta variantes com sufixo para direcionar para cena
wiki_variants += [f"{search_title} cartoon", f"{search_title} TV series characters"]
```
A detecção de "cartoon ocidental vs anime" é feita verificando se o título contém palavras-chave de anime (naruto, bleach, jujutsu, etc.). Se não contém, assume ocidental e adiciona sufixos.

**Imagem final:** `https://images.mubicdn.net/images/film/266178/...` (54KB, cena real do show)

---

## Problema documentado — featured image com demônio (hentai, corrigido 2026-05-24)

**Sintoma:** Featured image do post de hentais mostrava demônio (banner do Urotsukidoji, primeiro show da lista).

**Causa:** O script pegava o banner do PRIMEIRO show em `section_images`. Para o post de hentais, Claude colocou Urotsukidoji primeiro (hentai de demônios = banner horrível).

**Fix aplicado:** Campo `featured_show_override` no TOPICS. Se definido, o script tenta esse show PRIMEIRO para a featured.
```python
772: {"featured_show_override": "Agent Aika", ...}  # banner de garotas de anime
```

---

## Problema documentado — slug com sufixo -2 (corrigido 2026-05-24)

**Sintoma:** Após deletar um post com `force=true` e criar outro com o mesmo slug, o WP adicionava `-2` ao novo slug (ex: `parte-1-2` em vez de `parte-1`). Isso quebra links internos.

**Causa:** WordPress mantém reserva de slug por um período após deleção, mesmo com force=true.

**Fix aplicado:** Após publicar, o script verifica se o slug retornado difere do desejado, e faz PATCH para corrigir:
```python
if published_slug != desired_slug:
    WP.post(f".../posts/{id}", json={"slug": desired_slug})
```

---

## Bug documentado — image injection offset (corrigido 2026-05-24)

**Sintoma:** A imagem do anime X aparecia embaixo do título do anime X+1  
(ex: imagem Dragon Ball Z aparecia depois de "2. Sailor Moon (1992)")

**Causa raiz em `inject_images()`:**
```python
# ERRADO — pula H2[0], então medias[1] (Dragon Ball Z) vai pro H2[1] (Sailor Moon)
for h2_end in h2_ends[1:]:
    media = valid[injected]  # valid comprime Nones → shifts adicionais
```

**Fix aplicado:**
```python
# CORRETO — H2[i] recebe medias[i+1] posicionalmente
section_medias = medias[1:]   # skip featured, mantém alinhamento posicional
for i, h2_end in enumerate(h2_ends):
    media = section_medias[i]  # None = sem imagem nessa seção, sem shift
    if not media: continue
    # injeta após primeiro </p> deste H2
```

**Regra:** `medias[0]` = featured (não injetada), `medias[N]` = imagem do H2[N-1]. Loop começa em H2[0], para quando `i >= len(section_medias)` (encerramento fica sem imagem naturalmente).

---

## Benchmark de referência

**Post:** [29 Melhores Animes Isekai](https://radiata.pro/melhores-animes-isekai-2/) — ID 2132  
**Resultado:** 29/30 seções com imagem, featured 154KB (Mushoku Tensei key visual)  
**Script usado:** `scripts/publish_benchmark.py`
