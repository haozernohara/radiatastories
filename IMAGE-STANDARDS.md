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

## Benchmark de referência

**Post:** [29 Melhores Animes Isekai](https://radiata.pro/melhores-animes-isekai-2/) — ID 2132  
**Resultado:** 29/30 seções com imagem, featured 154KB (Mushoku Tensei key visual)  
**Script usado:** `scripts/publish_benchmark.py`
