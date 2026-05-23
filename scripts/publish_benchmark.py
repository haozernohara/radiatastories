"""
publish_benchmark.py — Publica artigo de benchmark diretamente no WordPress.

Uso:
  python scripts/publish_benchmark.py [extracted_json]

Padrão: ~/temp/isekai_extracted.json
Credenciais: radiata-dashboard/.env.local
"""

import json, os, re, sys, base64, pathlib
import requests
import anthropic as anthropic_sdk
import json5

# --------------- Load .env.local ---------------

def load_env_local():
    env_path = pathlib.Path(__file__).parent.parent / ".env.local"
    if not env_path.exists():
        sys.exit(f"[ERRO] .env.local não encontrado em {env_path}")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

load_env_local()

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
WP_URL            = os.environ.get("WP_URL", "https://radiata.pro")
WP_USER           = os.environ["WP_USER"]
WP_APP_PASSWORD   = os.environ["WP_APP_PASSWORD"]

WP_AUTH = base64.b64encode(f"{WP_USER}:{WP_APP_PASSWORD}".encode()).decode()
WP_SESS = requests.Session()
WP_SESS.headers.update({
    "Authorization": f"Basic {WP_AUTH}",
    "User-Agent": "Radiata-Pipeline/2.0",
})

# --------------- WP helpers ---------------

def wp_post(path: str, **kwargs) -> dict:
    r = WP_SESS.post(f"{WP_URL}/wp-json/wp/v2/{path}", **kwargs, timeout=30)
    r.raise_for_status()
    return r.json()

def get_or_create_tag(name: str) -> int:
    slug = re.sub(r"[^a-z0-9]", "-", name.lower().strip())
    slug = re.sub(r"-+", "-", slug).strip("-")[:50]
    r = WP_SESS.get(f"{WP_URL}/wp-json/wp/v2/tags", params={"slug": slug, "per_page": 1})
    if r.ok:
        tags = r.json()
        if tags:
            return tags[0]["id"]
    try:
        result = wp_post("tags", json={"name": name, "slug": slug})
        return result.get("id", 0)
    except Exception as e:
        print(f"  [warn] Tag '{name}': {e}")
        return 0

# --------------- Claude rewrite ---------------

# --------------- JSON extractor (mirrors json-extract.ts logic) ---------------

def extract_json_object(raw: str) -> dict:
    """
    Extracts first JSON object from LLM output.
    Handles: markdown fences, trailing commas, double quotes inside HTML attrs.
    Mirrors the TypeScript extractJsonObject + repairUnescapedQuotes functions.
    """
    cleaned = raw.strip()
    # Strip code fences
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^```\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```\s*$', '', cleaned)
    # Strip <details> blocks
    cleaned = re.sub(r'<details>[\s\S]*?</details>', '', cleaned, flags=re.IGNORECASE).strip()

    start = cleaned.find("{")
    end   = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"Nenhum JSON encontrado. Inicio: {cleaned[:80]!r}")

    candidate = cleaned[start:end]
    # Strip trailing commas before } or ]
    candidate = re.sub(r',\s*(?=[}\]])', '', candidate)
    # Fix double quotes inside HTML tags → single quotes
    candidate = re.sub(r'<[^>]+>', lambda m: m.group(0).replace('"', "'"), candidate)

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    # Fallback 1: repair unescaped quotes
    try:
        return json.loads(_repair_unescaped_quotes(candidate))
    except json.JSONDecodeError:
        pass
    # Fallback 2: json5 (tolerant parser)
    return json5.loads(candidate)


def _repair_unescaped_quotes(s: str) -> str:
    """State-machine: escape unescaped " inside JSON string values."""
    result = []
    i = 0
    while i < len(s):
        ch = s[i]
        if ch != '"':
            result.append(ch)
            i += 1
            continue

        # Start of a JSON string
        result.append('"')
        i += 1
        while i < len(s):
            c = s[i]
            if c == '\\':
                result.append(c)
                i += 1
                if i < len(s):
                    result.append(s[i])
                    i += 1
                continue
            if c == '"':
                j = i + 1
                while j < len(s) and s[j] in ' \t\n\r':
                    j += 1
                nxt = s[j] if j < len(s) else ''
                if nxt in ':,}]':
                    result.append('"')
                    i += 1
                    break
                result.append('\\"')
                i += 1
                continue
            result.append(c)
            i += 1
    return ''.join(result)


# --------------- Claude prompt ---------------

SYSTEM_PROMPT = """\
# AGENTE REDATOR — RADIATA.PRO

## BLOG
Radiata Animes (radiata.pro) — notícias, recomendações e curiosidades de animes para otakus brasileiros (15-35 anos).
Tom: entusiasmado, voz de fã apaixonado. Use "galera", "pessoal", "que saga!", "vixi", "nakama". Informal mas informativo.
JNews Theme: featured image aparece automaticamente — NÃO a repita no conteudo_html.

## MISSÃO
Reescrever completamente em PT-BR humanizado. Nunca mencionar a fonte original. Nunca inventar fatos.
Mínimo 1.300 palavras. Título: até 60 chars. Slug: kebab-case sem acento, max 75 chars.

## ESTRUTURA — tipo_artigo = "lista"
1. INTRO (150-200 palavras) — explique o gênero/tema, por que a lista é essencial, para quem é
2. Para cada item use exatamente:
   <h2>N. Título do Anime (Ano)</h2>
   <p><strong>Título original:</strong> ... | <strong>Gêneros:</strong> ... | <strong>Episódios:</strong> ... | <strong>Nota IMDb:</strong> ...</p>
   <p>2-3 frases envolventes: trama resumida + por que vale assistir. Tom Radiata.</p>
3. ENCERRAMENTO — H2 como "Qual você vai maratonar, galera?" + pergunta de engajamento OBRIGATÓRIA

## CATEGORIAS
97=Notícias | 109=Temporada | 108=Mangás | 9=Animes
100=Ação | 102=Comédia | 103=Fantasia | 104=Isekai | 101=Romance | 99=Terror | 106=Ecchi

## TAGS
Inclua: gênero principal, palavras-chave temáticas, ano relevante.

## REGRAS JSON CRÍTICAS
R1: Aspas SIMPLES em atributos HTML dentro de conteudo_html
R2: Output começa direto com { e termina com } — sem markdown
R3: Sem vírgula final antes de }

## SAÍDA — EXATAMENTE 7 CHAVES
{"titulo":"...","slug":"...","conteudo_html":"...","meta_descricao":"...","tags":["..."],"categoria_id":104,"nome_anime":"Vários"}

## PROIBIÇÕES
Mencionar fonte | Inventar fatos | "Conclusão" | Aspas duplas em attrs HTML | Truncar com "..."
O post DEVE ser completo com pergunta de engajamento no final."""


def rewrite_with_claude(article_text: str) -> dict:
    client = anthropic_sdk.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=300.0)

    user_prompt = f"""\
**tipo_artigo:** lista
**Título:** 29 melhores animes isekai (de reencarnação e magia)
**Slug sugerido:** melhores-animes-isekai

**CONTEÚDO:**
{article_text}

---
INSTRUÇÕES:
1. Escreva TODOS os 29 itens — não omita nenhum
2. Retorne APENAS o JSON com as 7 chaves, sem markdown"""

    print("[claude] Enviando para Claude Sonnet 4.6 (max 16k tokens, timeout 300s)...")
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=16000,
        temperature=0.4,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = "".join(b.text for b in msg.content if b.type == "text")
    print(f"[claude] {len(raw)} chars, stop_reason={msg.stop_reason}")

    parsed = extract_json_object(raw)
    for k in ["titulo", "slug", "conteudo_html", "meta_descricao", "tags", "categoria_id", "nome_anime"]:
        if k not in parsed:
            raise ValueError(f"Chave ausente: {k}")
    return parsed

# --------------- Image upload ---------------

CT_MAP = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

def upload_image(url: str, idx: int) -> dict | None:
    fname = url.split("/")[-1].split("?")[0]
    ext   = pathlib.Path(fname).suffix.lower()
    ct    = CT_MAP.get(ext, "image/jpeg")
    dest  = f"radiata-isekai-{idx:02d}{ext}"

    print(f"  [{idx:02d}] Baixando {fname}...")
    try:
        r = requests.get(url, headers={"User-Agent": "Radiata-Pipeline/2.0"}, timeout=15)
        if not r.ok or len(r.content) < 5000:
            print(f"  [{idx:02d}] Skip ({r.status_code}, {len(r.content)} bytes)")
            return None
    except Exception as e:
        print(f"  [{idx:02d}] Download falhou: {e}")
        return None

    print(f"  [{idx:02d}] Upload {dest} ({len(r.content)//1024}KB)...")
    try:
        resp = WP_SESS.post(
            f"{WP_URL}/wp-json/wp/v2/media",
            data=r.content,
            headers={"Content-Disposition": f'attachment; filename="{dest}"', "Content-Type": ct},
            timeout=30,
        )
        resp.raise_for_status()
        media = resp.json()
        print(f"  [{idx:02d}] ✓ id={media['id']}")
        return {"id": media["id"], "source_url": media.get("source_url", "")}
    except Exception as e:
        print(f"  [{idx:02d}] Upload falhou: {e}")
        return None

# --------------- Inject images into HTML ---------------

def inject_images(html: str, imgs: list[dict]) -> str:
    """Insert uploaded images after the metadata <p> of each <h2> section."""
    section_imgs = [m for m in imgs if m]
    if len(section_imgs) < 2:
        return html

    per_section = section_imgs[1:]  # skip featured (index 0)
    h2_ends = [m.end() for m in re.finditer(r"</h2>", html)]

    result, offset = html, 0
    for i, pos in enumerate(h2_ends):
        if i >= len(per_section) or not per_section[i]:
            continue
        # Find end of first <p> after this h2 (the metadata paragraph)
        adj = pos + offset
        p_end = result.find("</p>", adj)
        if p_end == -1:
            continue
        p_end += 4

        fig = (
            f"<figure class='wp-block-image size-large'>"
            f"<img src='{per_section[i]['source_url']}' alt='anime isekai' loading='lazy'/>"
            f"</figure>"
        )
        result = result[:p_end] + fig + result[p_end:]
        offset += len(fig)

    return result

# --------------- Main ---------------

def main():
    json_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path.home() / "temp" / "isekai_extracted.json"
    print(f"[load] {json_path}")
    data = json.loads(json_path.read_text(encoding="utf-8"))

    # Build condensed article text for Claude
    lines = [f"Título: {data['title']}\n"]
    if data.get("intro"):
        lines.append(f"Introdução:\n{data['intro'][:500]}\n")
    for s in data["sections"]:
        lines.append(f"## {s['heading']}\n{s['text'][:450]}\n")
    article_text = "\n".join(lines)
    print(f"[load] {len(data['sections'])} seções, {len(article_text)} chars de conteúdo")

    # Step 1: Rewrite
    print("\n[1/4] Reescrevendo com Claude...")
    rewritten = rewrite_with_claude(article_text)
    print(f"  titulo   : {rewritten['titulo']}")
    print(f"  slug     : {rewritten['slug']}")
    print(f"  categoria: {rewritten['categoria_id']}")
    print(f"  html     : {len(rewritten['conteudo_html'])} chars")

    # Step 2: Upload images
    print(f"\n[2/4] Uploading {len(data['images'][:20])} imagens...")
    uploaded = [upload_image(url, i) for i, url in enumerate(data["images"][:20])]
    ok = [u for u in uploaded if u]
    print(f"  {len(ok)} enviadas com sucesso")

    featured_id = ok[0]["id"] if ok else 0

    # Step 3: Inject images
    print("\n[3/4] Injetando imagens no HTML...")
    final_html = inject_images(rewritten["conteudo_html"], uploaded)
    print(f"  HTML: {len(final_html)} chars")

    # Step 4: Publish
    print("\n[4/4] Publicando no WordPress...")
    tag_ids = [t for t in (get_or_create_tag(n) for n in rewritten["tags"][:8]) if t]
    print(f"  tags: {tag_ids}")

    try:
        result = wp_post("posts", json={
            "title":          rewritten["titulo"],
            "slug":           rewritten["slug"][:75],
            "content":        final_html,
            "excerpt":        rewritten["meta_descricao"],
            "status":         "publish",
            "categories":     [int(rewritten["categoria_id"])],
            "tags":           tag_ids,
            "featured_media": featured_id,
        })
        print(f"\n✅ PUBLICADO! ID={result['id']}")
        print(f"   URL: {result.get('link','')}")
    except Exception as e:
        print(f"\n❌ Publicação falhou: {e}")
        out = pathlib.Path.home() / "temp" / "failed_post.json"
        out.write_text(json.dumps({
            "titulo": rewritten["titulo"],
            "html_length": len(final_html),
            "error": str(e),
        }, indent=2), encoding="utf-8")
        print(f"   Debug salvo em {out}")

if __name__ == "__main__":
    main()
