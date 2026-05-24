#!/usr/bin/env python3
"""
rewrite_drafts_v2.py — Reescreve posts do zero com Claude + imagens via AniList/Wikipedia.

Melhorias sobre v1:
- AniList API (busca por título, nunca ID hardcoded) → sem bug de imagem duplicada
- Pillow: featured image cropada exatamente para 1140x570 (landscape de qualidade)
- Cria posts NOVOS (nunca atualiza) e deleta os velhos após publicar
- Claude escreve do zero baseado no tema, sem reaproveitar conteúdo anterior
- Wikipedia fallback para desenhos ocidentais

Uso:
  python scripts/rewrite_drafts_v2.py           # todos os 4 temas
  python scripts/rewrite_drafts_v2.py 771 778   # temas específicos (por ID do draft original)
"""

import json, os, re, sys, base64, pathlib, time, unicodedata
import requests
import anthropic as anthropic_sdk
from PIL import Image
from io import BytesIO

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ─── Load .env.local ───────────────────────────────────────────────────────────

def load_env():
    env = pathlib.Path(__file__).parent.parent / ".env.local"
    if not env.exists():
        sys.exit(f"[ERRO] .env.local nao encontrado em {env}")
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

load_env()

WP_URL  = os.environ.get("WP_URL", "https://radiata.pro")
WP_USER = os.environ["WP_USER"]
WP_PASS = os.environ["WP_APP_PASSWORD"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

WP_AUTH = base64.b64encode(f"{WP_USER}:{WP_PASS}".encode()).decode()
WP = requests.Session()
WP.headers.update({"Authorization": f"Basic {WP_AUTH}", "User-Agent": "Radiata/2.0"})
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": _UA})  # Chrome UA required for Fandom/Wikipedia

FEATURED_W, FEATURED_H = 1140, 570  # target featured image size

# ─── Temas ────────────────────────────────────────────────────────────────────

TOPICS = {
    771: {
        "label": "Desenhos classicos - Parte 1",
        "old_post_id": 2267,
        "keep_categories": [97],
        "system_extra": "",
        "user_prompt": """\
**Tema:** Os melhores desenhos animados clássicos dos anos 90 e início dos anos 2000 — Parte 1 de 2.

**Instruções:**
- Escolha 16 títulos icônicos desta era para cobrir nesta Parte 1 (a Parte 2 cobrirá outros títulos diferentes).
- Misture animes japoneses e desenhos ocidentais populares no Brasil da época.
- Ficha técnica de cada um: <strong>Gêneros:</strong> ... | <strong>Estúdio:</strong> ... | <strong>Episódios:</strong> ...
- Para séries ocidentais, NÃO use "Título original em japonês".
- search_title: título em inglês exato para busca no AniList/Wikipedia (ex: "Dragon Ball Z", "Dexter's Laboratory").

Exemplos de títulos desta era (escolha entre estes e outros que julgar relevantes):
Dragon Ball Z, Sailor Moon, Pokémon, Rurouni Kenshin, Yu Yu Hakusho, Saint Seiya, Dexter's Laboratory,
The Powerpuff Girls, Johnny Bravo, Courage the Cowardly Dog, Kim Possible, Hey Arnold!, Rugrats,
The Fairly OddParents, Recess, Pepper Ann, Rocket Power, The Wild Thornberrys, As Branquelas, Irmão do Jorel.""",
    },
    1119: {
        "label": "Desenhos classicos - Parte 2",
        "old_post_id": 2302,
        "keep_categories": [97],
        "system_extra": "",
        "user_prompt": """\
**Tema:** Os melhores desenhos animados clássicos dos anos 90 e início dos anos 2000 — Parte 2 de 2.

**Instruções:**
- Escolha 16 títulos DIFERENTES dos que foram cobertos na Parte 1 (a Parte 1 cobriu: Dragon Ball Z, Sailor Moon, Pokémon, Dexter's Laboratory, The Powerpuff Girls, Johnny Bravo, Kim Possible, Hey Arnold!, etc.)
- Foque em outros títulos igualmente icônicos da era.
- No 1o paragrafo mencione que é a continuação da Parte 1 e inclua o link: https://radiata.pro/classicos-anos-90-2000-desenhos-animados-parte-1/
- Ficha: <strong>Gêneros:</strong> ... | <strong>Estúdio:</strong> ... | <strong>Episódios:</strong> ...
- search_title: título em inglês exato para busca no AniList/Wikipedia.

Exemplos de títulos para Parte 2 (diferentes da Parte 1):
InuYasha, Bleach (início), Digimon, Yu-Gi-Oh!, Avatar: The Last Airbender, Code Lyoko, Winx Club,
Ben 10, Samurai Jack, Static Shock, Justice League, Teen Titans, Danny Phantom, My Life as a Teenage Robot,
The Adventures of Jimmy Neutron, Chalkzone, Generator Rex, Xiaolin Showdown, Megas XLR.""",
    },
    778: {
        "label": "Animes de 2020",
        "old_post_id": 2291,
        "keep_categories": [109],
        "system_extra": "",
        "user_prompt": """\
**Tema:** Os melhores animes de 2020 — guia por temporada (Inverno, Primavera, Verão, Outono).

**Instruções:**
- Selecione 22 animes de destaque de 2020 distribuídos pelas 4 temporadas.
- Formato da ficha: <strong>Título original:</strong> ... | <strong>Temporada 2020:</strong> Inverno/Primavera/Verão/Outono | <strong>Gêneros:</strong> ... | <strong>Episódios:</strong> ...
- Na introdução mencione o contexto especial de 2020 (pandemia, quarentena, maratonas de anime).
- search_title: título em inglês ou japonês romanizado exato para busca no AniList.

Inclua obrigatoriamente (são os maiores destaques do ano):
Jujutsu Kaisen, Re:Zero Season 2, Tower of God, Fruits Basket Season 2, Kaguya-sama Love is War Season 2,
Dorohedoro, Keep Your Hands Off Eizouken!, ID:Invaded, Toilet-Bound Hanako-kun, Darwin's Game,
Deca-Dence, The God of High School, Akudama Drive, Hypnosis Mic, Haikyuu!! To the Top,
Golden Kamuy Season 3, Great Pretender, Mewkledreamy, Majutsushi Orphen, Adachi to Shimamura.""",
    },
    772: {
        "label": "Hentais classicos",
        "old_post_id": 2312,
        "keep_categories": [108, 98, 105],
        "system_extra": "Tom maduro, informativo e respeitoso. Contextualize a importância histórica de cada obra no gênero.",
        "featured_show_override": "Agent Aika",  # banner tem garotas de anime, não demônios
        "user_prompt": """\
**Tema:** Hentais clássicos e obras de destaque do gênero que todo fã deve conhecer.

**Instruções:**
- Cubra 6-8 títulos clássicos e influentes do gênero hentai/ecchi anime.
- Ficha: <strong>Gêneros:</strong> ... | <strong>Episódios/Formato:</strong> ... | <strong>Estúdio:</strong> ...
- Cada descrição deve ter 4-5 frases: trama, importância histórica, por que é referência no gênero.
- search_title: título em inglês para busca no AniList/MAL.

Inclua os clássicos mais importantes:
Bible Black, La Blue Girl, Urotsukidoji Legend of the Overfiend, Futari Ecchi,
Words Worth, Cream Lemon, Countdown: Akira, Agent Aika.""",
    },
}

# ─── System prompt ─────────────────────────────────────────────────────────────

BASE_SYSTEM = """\
# AGENTE REDATOR — RADIATA.PRO

## BLOG
Radiata Animes (radiata.pro) — notícias, recomendações e curiosidades para otakus brasileiros (15-35 anos).
Tom: entusiasmado, voz de fã apaixonado. Use "galera", "pessoal", "que saga!", "nakama". Informal mas informativo.
JNews Theme: featured image aparece automaticamente — NAO repita imagem no inicio de conteudo_html.

## MISSAO
Escrever conteudo 100% original em PT-BR. Nao copiar, referenciar nem mencionar nenhuma fonte.
Minimo 1.400 palavras. Titulo: ate 60 chars. Slug: kebab-case sem acento, max 75 chars.

## ESTRUTURA (tipo lista)
1. INTRO (150-200 palavras): contexto do tema, por que a lista e imperdivel, para quem e
2. Para CADA item:
   <h2>N. Nome do Titulo (Ano)</h2>
   <p>[ficha tecnica com <strong>tags</strong> conforme instrucao]</p>
   <p>4-5 frases envolventes: trama + curiosidade + por que vale. Tom Radiata.</p>
3. ENCERRAMENTO: H2 "Qual voce vai maratonar, galera?" + pergunta de engajamento

## SOBRE section_images
- Um item por H2 de conteudo (NAO contar o H2 de encerramento)
- search_title: titulo exato em ingles para buscar no AniList/Wikipedia
- Ordem identica a dos H2s no conteudo_html

## REGRAS JSON CRITICAS
R1: Aspas SIMPLES em atributos HTML dentro de conteudo_html
R2: Output comeca com { e termina com } — sem markdown, sem texto antes ou depois
R3: Sem virgula final antes de } ou ]

## SAIDA — EXATAMENTE 8 CHAVES
{"titulo":"...","slug":"...","conteudo_html":"...","meta_descricao":"...","tags":["..."],"categoria_id":97,"section_images":[{"show_name":"...","search_title":"..."},...]}

## PROIBICOES
Mencionar fontes | Inventar fatos | "Conclusao" como H2 | Aspas duplas em attrs HTML | Truncar"""

# ─── Claude call ───────────────────────────────────────────────────────────────

def rewrite_with_claude(topic_id: int) -> dict:
    cfg = TOPICS[topic_id]
    client = anthropic_sdk.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=360.0)
    system = BASE_SYSTEM
    if cfg["system_extra"]:
        system += f"\n\n## INSTRUCOES ESPECIAIS\n{cfg['system_extra']}"

    user = cfg["user_prompt"] + "\n\n---\nRetorne APENAS o JSON com 8 chaves. section_images: um item por H2 de conteudo (nao o encerramento)."

    print(f"  [claude] Enviando para Claude Sonnet 4.6...")
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=16000,
        temperature=0.4,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    raw = "".join(b.text for b in msg.content if b.type == "text")
    print(f"  [claude] {len(raw)} chars, stop={msg.stop_reason}")

    debug = pathlib.Path(__file__).parent / f"claude_raw_v2_{topic_id}.json"
    debug.write_text(raw, encoding="utf-8")

    return parse_json(raw)

# ─── JSON parser ───────────────────────────────────────────────────────────────

def _repair_quotes(s: str) -> str:
    result, i = [], 0
    while i < len(s):
        ch = s[i]
        if ch != '"':
            result.append(ch); i += 1; continue
        result.append('"'); i += 1
        while i < len(s):
            c = s[i]
            if c == '\\':
                result.append(c); i += 1
                if i < len(s): result.append(s[i]); i += 1
                continue
            if c == '"':
                j = i + 1
                while j < len(s) and s[j] in ' \t\n\r': j += 1
                if j < len(s) and s[j] in ':,}]':
                    result.append('"'); i += 1; break
                result.append('\\"'); i += 1; continue
            result.append(c); i += 1
    return ''.join(result)

def _sanitize_html_field(s: str) -> str:
    """Replace all double-quotes inside the conteudo_html JSON value with single-quotes.

    Finds the value region between '"conteudo_html": "' and the first '", "' that
    precedes a known top-level key. Replaces " in that region so standard json.loads works.
    """
    open_m = re.search(r'"conteudo_html"\s*:\s*"', s)
    if not open_m:
        return s
    val_start = open_m.end()  # index right after the opening "

    # Find closing boundary: the first '", "known_key"' after val_start
    rest = s[val_start:]
    boundary = None
    for key in ["meta_descricao", "tags", "categoria_id", "section_images", "nome_anime"]:
        m = re.search(rf'",\s*"{key}"', rest)
        if m and (boundary is None or m.start() < boundary[0]):
            boundary = (m.start(), m.group())

    if boundary is None:
        return s

    val_end = val_start + boundary[0]  # position of closing "
    html_content = s[val_start:val_end]

    # Replace " inside the HTML with '
    clean_html = html_content.replace('"', "'")
    return s[:val_start] + clean_html + s[val_end:]


def parse_json(raw: str) -> dict:
    cleaned = raw.strip()
    cleaned = re.sub(r'^```json\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'^```\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```\s*$', '', cleaned)
    start = cleaned.find("{")
    end   = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"Nenhum JSON. Raw[:200]: {cleaned[:200]!r}")
    candidate = cleaned[start:end]
    candidate = re.sub(r',\s*(?=[}\]])', '', candidate)

    # Primary fix: replace " inside conteudo_html value with '
    sanitized = _sanitize_html_field(candidate)

    for fn in [
        lambda s: json.loads(s, strict=False),
        lambda s: json.loads(_repair_quotes(s), strict=False),
        json.loads,
    ]:
        for src in [sanitized, candidate]:
            try: return fn(src)
            except (json.JSONDecodeError, Exception): pass
    try:
        import json5
        for src in [sanitized, candidate]:
            try: return json5.loads(src)
            except Exception: pass
    except ImportError: pass
    raise ValueError(f"JSON parse falhou. Start: {candidate[:300]!r}")

# ─── AniList API ───────────────────────────────────────────────────────────────

_anilist_cache: dict[str, dict] = {}

ANILIST_QUERY = """
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id
    bannerImage
    coverImage { extraLarge large }
  }
}
"""

def anilist_images(title: str) -> dict:
    """Returns {'banner': url|None, 'cover': url|None} from AniList."""
    key = title.lower().strip()
    if key in _anilist_cache:
        return _anilist_cache[key]
    time.sleep(0.4)
    try:
        r = HTTP.post(
            "https://graphql.anilist.co",
            json={"query": ANILIST_QUERY, "variables": {"search": title}},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        if r.ok:
            data = r.json().get("data", {}).get("Media")
            if data:
                ci = data.get("coverImage") or {}
                result = {
                    "banner": data.get("bannerImage"),
                    "cover":  ci.get("extraLarge") or ci.get("large"),
                }
                _anilist_cache[key] = result
                return result
    except Exception as e:
        print(f"  [anilist] '{title}': {e}")
    _anilist_cache[key] = {"banner": None, "cover": None}
    return _anilist_cache[key]

# ─── Wikipedia fallback ────────────────────────────────────────────────────────

def wikipedia_image(title: str) -> str | None:
    """Gets image URL from Wikipedia — uses pageimages API first (more reliable)."""
    time.sleep(0.3)
    # pageimages API: returns thumbnail of the main article image
    try:
        r = HTTP.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query", "titles": title, "prop": "pageimages",
                "pithumbsize": 600, "format": "json", "redirects": 1,
            },
            timeout=12,
        )
        if r.ok:
            pages = r.json().get("query", {}).get("pages", {})
            for page in pages.values():
                src = page.get("thumbnail", {}).get("source")
                if src:
                    return src
    except Exception as e:
        print(f"  [wikipedia-pg] '{title}': {e}")
    # Fallback: REST summary API
    try:
        r2 = HTTP.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{requests.utils.quote(title)}",
            timeout=12,
        )
        if r2.ok:
            d = r2.json()
            return d.get("originalimage", {}).get("source") or d.get("thumbnail", {}).get("source")
    except Exception as e:
        print(f"  [wikipedia-rest] '{title}': {e}")
    return None

# ─── Fandom wiki fallback (cartoons ocidentais) ────────────────────────────────
# Subdomínios verificados em 2026-05-24 — NUNCA usar aliases errados (ex: 'xiaolin', 'winxclub')

FANDOM_WIKIS: dict[str, tuple[str, str]] = {
    # Português (como Claude gera em show_name)
    "Avatar: A Lenda de Aang":       ("avatar",              "Avatar: The Last Airbender"),
    "Liga da Justiça":               ("dcau",                "Justice League"),
    "As Aventuras de Jimmy Neutron": ("jimmyneutron",        "Jimmy Neutron"),
    # Inglês / misto
    "Samurai Jack":                  ("samuraijack",         "Samurai Jack (character)"),
    "Danny Phantom":                 ("dannyphantom",        "Danny Phantom"),
    "Teen Titans 2003":              ("teentitans",          "Teen Titans"),
    "Teen Titans":                   ("teentitans",          "Teen Titans"),
    "Ben 10":                        ("ben10",               "Ben 10"),
    "Avatar: The Last Airbender":    ("avatar",              "Avatar: The Last Airbender"),
    "Static Shock":                  ("static",              "Virgil Hawkins (DCAU)"),   # dcau.fandom retorna vazio
    "Justice League":                ("dcau",                "Justice League"),
    "Code Lyoko":                    ("codelyoko",           "Code Lyoko"),
    "Winx Club":                     ("winx",                "Bloom"),                   # 'winxclub' errado
    "Xiaolin Showdown":              ("xiaolinpedia",        "Omi"),                     # 'xiaolin' errado
    "My Life as a Teenage Robot":    ("mlaatr",              "My Life as a Teenage Robot"),
    "Megas XLR":                     ("megasxlr",            "Megas XLR"),
    "Dexter's Laboratory":           ("dexterslaboratory",   "Dexter"),                  # 'dexters-lab' errado
    "Johnny Bravo":                  ("johnnybravo",         "Johnny Bravo (character)"),
    "Courage the Cowardly Dog":      ("courage",             "Courage the Cowardly Dog"),
    "Hey Arnold!":                   ("heyarnold",           "Hey Arnold!"),
    "Rugrats":                       ("rugrats",             "Rugrats"),
    "The Fairly OddParents":         ("fairlyoddparents",    "The Fairly OddParents"),
    "Recess":                        ("recessatschool",      "Recess"),
    "Kim Possible":                  ("kimpossible",         "Kim Possible"),
    "The Wild Thornberrys":          ("wildthornberrys",     "The Wild Thornberrys"),
    "The Powerpuff Girls":           ("powerpuffgirls",      "The Powerpuff Girls"),
    "Dexter's Laboratory":           ("dexterslaboratory",   "Dexter"),
}

_LOGO_FANDOM_SKIP = {
    "logo", "wordmark", ".svg", "icon", "stub", "badge", "emblem",
    "flag", "map", "shield", "button", "star", "portal", "commons",
    "background", "nav", "blank", "placeholder", "default",
}

def fandom_best_image(show_name: str, search_title: str = "") -> bytes | None:
    """Busca melhor imagem no Fandom wiki do show (maior por pixels, sem logos)."""
    entry = FANDOM_WIKIS.get(show_name) or FANDOM_WIKIS.get(search_title)
    if not entry:
        return None
    subdomain, page_title = entry
    time.sleep(0.4)
    try:
        api = f"https://{subdomain}.fandom.com/api.php"
        r = HTTP.get(api, params={
            "action": "parse", "page": page_title, "prop": "images",
            "format": "json", "redirects": 1,
        }, timeout=15)
        if not r.ok:
            return None
        all_imgs = r.json().get("parse", {}).get("images", [])
        candidates = [
            img for img in all_imgs
            if not any(kw in img.lower() for kw in _LOGO_FANDOM_SKIP)
            and img.lower().rsplit(".", 1)[-1] in ("jpg", "jpeg", "png", "webp")
        ]
        if not candidates:
            return None

        sized: list[tuple[int, str]] = []
        for i in range(0, min(len(candidates), 20), 5):
            batch = candidates[i:i+5]
            titles_param = "|".join(f"File:{f}" for f in batch)
            r2 = HTTP.get(api, params={
                "action": "query", "titles": titles_param,
                "prop": "imageinfo", "iiprop": "url|size",
                "iiurlwidth": 600, "format": "json",
            }, timeout=12)
            if r2.ok:
                for page in r2.json().get("query", {}).get("pages", {}).values():
                    info = (page.get("imageinfo") or [{}])[0]
                    url  = info.get("thumburl") or info.get("url")
                    area = (info.get("width", 0) or 0) * (info.get("height", 0) or 0)
                    if url:
                        sized.append((area, url))
            time.sleep(0.3)

        sized.sort(reverse=True)
        for area, url in sized:
            raw = download_image(url)
            if raw and len(raw) > 30 * 1024:
                print(f"  [fandom:{subdomain}] {url.split('/')[-1][:45]} ({len(raw)//1024}KB)")
                return raw
    except Exception as e:
        print(f"  [fandom] '{show_name}': {e}")
    return None

# ─── Image processing (Pillow crop to 1140x570) ────────────────────────────────

def download_image(url: str) -> bytes | None:
    try:
        r = HTTP.get(url, timeout=20)
        if r.ok and len(r.content) > 3000:
            return r.content
    except Exception as e:
        print(f"  [download] {url[:60]}: {e}")
    return None

def crop_to_featured(img_bytes: bytes) -> bytes:
    """Center-crop image to exactly FEATURED_W x FEATURED_H (1140x570)."""
    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    w, h = img.size

    # Scale up to fill target dimensions (cover behavior)
    scale = max(FEATURED_W / w, FEATURED_H / h)
    nw, nh = int(w * scale), int(h * scale)
    img = img.resize((nw, nh), Image.LANCZOS)

    # Center crop
    left = (nw - FEATURED_W) // 2
    top  = (nh - FEATURED_H) // 2
    img  = img.crop((left, top, left + FEATURED_W, top + FEATURED_H))

    out = BytesIO()
    img.save(out, format="JPEG", quality=90, optimize=True)
    return out.getvalue()

def get_featured_bytes(search_title: str) -> tuple[bytes | None, str]:
    """Download and crop to 1140x570. Returns (bytes, source_desc)."""
    imgs = anilist_images(search_title)

    # Prefer banner (landscape), fall back to cover
    for url, desc in [(imgs.get("banner"), "anilist-banner"), (imgs.get("cover"), "anilist-cover")]:
        if not url:
            continue
        raw = download_image(url)
        if raw:
            return crop_to_featured(raw), desc

    # Wikipedia fallback
    url = wikipedia_image(search_title)
    if url:
        raw = download_image(url)
        if raw:
            try:
                return crop_to_featured(raw), "wikipedia"
            except Exception:
                pass

    return None, "none"

_LOGO_SIZE_KB = 20  # imagens < 20KB provavelmente são logos vetoriais

def get_section_bytes(search_title: str, show_name: str = "") -> bytes | None:
    """Download best image for inline section.

    Ordem: AniList banner > AniList cover > Fandom wiki > Wikipedia.
    Imagens < 20KB são rejeitadas (logos/vetor) e tentamos o próximo fallback.
    """
    imgs = anilist_images(search_title)

    # Tenta banner primeiro (landscape com cena real), depois cover (pode ser logo)
    for url, label in [(imgs.get("banner"), "banner"), (imgs.get("cover"), "cover")]:
        if not url:
            continue
        raw = download_image(url)
        if not raw:
            continue
        if len(raw) >= _LOGO_SIZE_KB * 1024:
            return raw
        print(f"  [skip-logo] {label} '{search_title}': {len(raw)//1024}KB < {_LOGO_SIZE_KB}KB")

    # Fandom wiki (cartoons ocidentais têm ótimas imagens aqui)
    raw = fandom_best_image(show_name or search_title, search_title)
    if raw:
        return raw

    # Wikipedia — tenta título simples e variantes com "cartoon scene" / "anime"
    # para evitar imagens de computadores, logos ou artefatos não relacionados
    wiki_variants = [search_title]
    tl = search_title.lower()
    if not any(kw in tl for kw in ("anime", "manga", "jujutsu", "bleach", "naruto")):
        # Provavelmente cartoon ocidental — adiciona sufixos para direcionar para cena
        wiki_variants += [f"{search_title} cartoon", f"{search_title} TV series characters"]
    for variant in wiki_variants:
        url = wikipedia_image(variant)
        if url:
            raw = download_image(url)
            if raw:
                return raw
    return None

# ─── WP image upload ───────────────────────────────────────────────────────────

CT = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
_used_source_urls: set[str] = set()  # global dedup across posts

def _to_seo_slug(text: str) -> str:
    """Convert any text to SEO-friendly kebab-case slug (no accents, max 60 chars)."""
    s = unicodedata.normalize("NFD", text.lower().strip())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]
    return s

def upload_image_bytes(img_bytes: bytes, filename: str, content_type: str = "image/jpeg") -> dict | None:
    try:
        resp = WP.post(
            f"{WP_URL}/wp-json/wp/v2/media",
            data=img_bytes,
            headers={"Content-Disposition": f'attachment; filename="{filename}"', "Content-Type": content_type},
            timeout=35,
        )
        resp.raise_for_status()
        m = resp.json()
        return {"id": m["id"], "url": m.get("source_url", "")}
    except Exception as e:
        print(f"  [upload] {filename}: {e}")
        return None

def process_section_image(search_title: str, slug: str, idx: int) -> dict | None:
    """Download section cover image and upload to WP."""
    raw = get_section_bytes(search_title)
    if not raw:
        return None
    fname = f"radiata-{slug[:24]}-{idx:02d}.jpg"
    result = upload_image_bytes(raw, fname)
    if result:
        print(f"  [img {idx:02d}] Section cover OK  — media_id={result['id']} ({len(raw)//1024}KB)")
    return result

# ─── Image injection ───────────────────────────────────────────────────────────

def inject_images(html: str, medias: list) -> str:
    """Insert section images after first <p> of each H2.

    medias[0]  = featured image (shown auto by JNews — NOT injected into body)
    medias[1]  = image for H2[0] (first content section)
    medias[2]  = image for H2[1] (second content section)
    ...
    Positional: if medias[i+1] is None, that H2 gets no image (no shift).
    Stops naturally before the encerramento H2 (section_images never includes it).
    """
    section_medias = medias[1:]  # skip featured, keep positional alignment
    if not any(m for m in section_medias):
        return html
    h2_ends = [m.end() for m in re.finditer(r"</h2>", html, re.IGNORECASE)]
    if not h2_ends:
        return html
    result, offset = html, 0
    for i, h2_end in enumerate(h2_ends):
        if i >= len(section_medias):
            break
        media = section_medias[i]
        if not media:
            continue
        adj   = h2_end + offset
        p_end = result.find("</p>", adj)
        if p_end == -1:
            continue
        p_end += 4
        alt = media.get("name", "anime")
        fig = (
            f"<figure class='wp-block-image size-large'>"
            f"<img src='{media['url']}' alt='{alt}' loading='lazy'/>"
            f"</figure>"
        )
        result  = result[:p_end] + fig + result[p_end:]
        offset += len(fig)
    return result

# ─── WP helpers ────────────────────────────────────────────────────────────────

def get_or_create_tag(name: str) -> int:
    slug = re.sub(r"[^a-z0-9]", "-", name.lower().strip())
    slug = re.sub(r"-+", "-", slug).strip("-")[:50]
    r = WP.get(f"{WP_URL}/wp-json/wp/v2/tags", params={"slug": slug, "per_page": 1}, timeout=10)
    if r.ok and r.json():
        return r.json()[0]["id"]
    try:
        resp = WP.post(f"{WP_URL}/wp-json/wp/v2/tags", json={"name": name, "slug": slug}, timeout=15)
        resp.raise_for_status()
        return resp.json()["id"]
    except Exception as e:
        print(f"  [tag] '{name}': {e}")
        return 0

def wp_create_post(payload: dict) -> dict:
    r = WP.post(f"{WP_URL}/wp-json/wp/v2/posts", json=payload, timeout=30)
    r.raise_for_status()
    return r.json()

def wp_delete_post(post_id: int):
    r = WP.delete(f"{WP_URL}/wp-json/wp/v2/posts/{post_id}?force=true", timeout=15)
    if r.ok:
        print(f"  [delete] post {post_id} deletado")
    else:
        print(f"  [delete] post {post_id} falhou: HTTP {r.status_code}")

# ─── Process one topic ─────────────────────────────────────────────────────────

def process(topic_id: int) -> dict:
    cfg = TOPICS[topic_id]
    sep = "=" * 60
    print(f"\n{sep}")
    print(f"TOPIC {topic_id}: {cfg['label']}")
    print(sep)

    # 1. Claude rewrite (fresh, no source content)
    print("\n[1/5] Escrevendo com Claude do zero...")
    rw = rewrite_with_claude(topic_id)
    required = ["titulo","slug","conteudo_html","meta_descricao","tags","categoria_id","section_images"]
    missing = [k for k in required if k not in rw]
    if missing:
        raise ValueError(f"Claude nao retornou: {missing}")

    sections = rw["section_images"]
    print(f"  Titulo  : {rw['titulo']}")
    print(f"  Slug    : {rw['slug']}")
    print(f"  HTML    : {len(rw['conteudo_html'])} chars")
    print(f"  Secoes  : {len(sections)}")

    # 2. Featured image (1140x570)
    print(f"\n[2/5] Buscando featured image 1140x570...")
    featured_media = None

    # Se configurado, tenta show específico primeiro (evita banners de demônios/vilões)
    override = cfg.get("featured_show_override")
    featured_candidates = (
        [{"search_title": override, "show_name": override}] + sections
        if override else sections
    )

    for sec in featured_candidates:
        st = sec.get("search_title", sec.get("show_name", ""))
        feat_bytes, source = get_featured_bytes(st)
        if feat_bytes:
            # SEO filename = post slug (mesma convenção do workflow n8n: slugFinal.ext)
            fname = f"{rw['slug'][:75]}.jpg"
            featured_media = upload_image_bytes(feat_bytes, fname)
            if featured_media:
                featured_media["name"] = sec.get("show_name", "")
                print(f"  [featured] {source} | {len(feat_bytes)//1024}KB | media_id={featured_media['id']} | {fname}")
                break
        print(f"  [featured] '{st}': sem imagem landscape, tentando proximo...")

    if not featured_media:
        print("  [featured] Nenhuma imagem de destaque encontrada")

    # 3. Section images
    print(f"\n[3/5] Buscando imagens das secoes ({len(sections)} titulos)...")
    medias: list = [featured_media]  # [0] = featured (not injected into body)
    for i, sec in enumerate(sections):
        st   = sec.get("search_title", sec.get("show_name", ""))
        name = sec.get("show_name", "?")
        raw  = get_section_bytes(st, show_name=name)

        if raw:
            fname = f"{_to_seo_slug(name)}.jpg"
            m = upload_image_bytes(raw, fname)
            if m:
                m["name"] = name
                print(f"  [{i:02d}] {name[:40]:<40} | OK media_id={m['id']} ({len(raw)//1024}KB) | {fname}")
                medias.append(m)
                continue
        print(f"  [{i:02d}] {name[:40]:<40} | -- sem imagem")
        medias.append(None)
        time.sleep(0.1)

    ok = sum(1 for m in medias[1:] if m)
    print(f"  {ok}/{len(sections)} imagens de secao enviadas")

    # 4. Inject images
    print(f"\n[4/5] Injetando imagens no HTML...")
    final_html = inject_images(rw["conteudo_html"], medias)
    print(f"  HTML final: {len(final_html)} chars")

    # Verificação: quais H2s ficaram sem <figure> (exceto encerramento)
    parts = re.split(r'(<h2[^>]*>.*?</h2>)', final_html, flags=re.DOTALL | re.IGNORECASE)
    missing_imgs = []
    for pi in range(1, len(parts) - 2, 2):  # pula encerramento (último H2)
        heading = re.sub('<[^>]+>', '', parts[pi]).strip()
        has_fig = '<figure' in (parts[pi + 1] if pi + 1 < len(parts) else '')[:800]
        if not has_fig:
            missing_imgs.append(heading)
    if missing_imgs:
        print(f"  [WARN] H2s sem imagem: {missing_imgs}")
    else:
        print(f"  [OK] Todas as secoes tem imagem")

    # 5. Publish NEW post
    print(f"\n[5/5] Publicando novo post...")
    tag_ids = [t for t in (get_or_create_tag(n) for n in rw.get("tags",[])[:8]) if t]
    featured_id = featured_media["id"] if featured_media else 0

    result = wp_create_post({
        "title":          rw["titulo"],
        "slug":           rw["slug"][:75],
        "content":        final_html,
        "excerpt":        rw.get("meta_descricao",""),
        "status":         "publish",
        "categories":     cfg["keep_categories"],
        "tags":           tag_ids,
        "featured_media": featured_id,
    })

    print(f"\n[PUBLICADO]")
    print(f"   Novo ID : {result['id']}")
    print(f"   URL     : {result.get('link','?')}")

    # Fix automático de slug: WP às vezes adiciona -2, -3 ao slug quando o anterior
    # ainda está reservado. Patcha de volta para o slug original.
    published_slug = result.get("slug", "")
    desired_slug = rw["slug"][:75]
    if published_slug != desired_slug:
        print(f"  [slug-fix] WP usou '{published_slug}', patching para '{desired_slug}'...")
        fix_r = WP.post(
            f"{WP_URL}/wp-json/wp/v2/posts/{result['id']}",
            json={"slug": desired_slug}, timeout=15,
        )
        if fix_r.ok:
            result = fix_r.json()
            print(f"  [slug-fix] OK → {result.get('link','?')}")
        else:
            print(f"  [slug-fix] falhou: HTTP {fix_r.status_code}")

    # 6. Delete old post
    old_id = cfg["old_post_id"]
    print(f"\n[DELETE] Removendo post antigo (ID {old_id})...")
    wp_delete_post(old_id)

    return result

# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    ids = [int(x) for x in sys.argv[1:]] if len(sys.argv) > 1 else list(TOPICS.keys())
    print(f"Processando topics: {ids}")
    results = []
    for tid in ids:
        if tid not in TOPICS:
            print(f"\n[skip] topic_id={tid} nao configurado"); continue
        try:
            r = process(tid)
            results.append({"id": tid, "status": "ok",
                            "new_post_id": r["id"], "url": r.get("link","")})
        except Exception as e:
            import traceback; traceback.print_exc()
            results.append({"id": tid, "status": "erro", "error": str(e)})

    print(f"\n{'='*60}")
    print("RESUMO FINAL")
    print(f"{'='*60}")
    for r in results:
        icon = "[OK]  " if r["status"] == "ok" else "[ERRO]"
        info = r.get("url") or r.get("error")
        print(f"  {icon} topic {r['id']}: {info}")

if __name__ == "__main__":
    main()
