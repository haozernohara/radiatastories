#!/usr/bin/env python3
"""
fix_post_images.py — Patcha imagens específicas em posts WP existentes.

Para cada seção listada em FIXES, tenta por ordem:
1. AniList banner (landscape, > 50KB)
2. AniList cover (> 30KB)
3. Wikipedia parse API → lista TODAS as imagens do artigo, filtra logos,
   ordena por pixels (maior = mais provável ser cena/arte real) e baixa a melhor
4. Repetição com títulos alternativos

Depois patcha o HTML do post (substitui logo ou insere figure ausente).

Usage:
  python scripts/fix_post_images.py          # todos os posts de FIXES
  python scripts/fix_post_images.py 2302     # só o post 2302
  python scripts/fix_post_images.py 2302 2267  # ambos
"""

import json, os, re, sys, base64, pathlib, time, unicodedata
import requests
from io import BytesIO

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ─── Load .env.local ──────────────────────────────────────────────────────────

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

WP_AUTH = base64.b64encode(f"{WP_USER}:{WP_PASS}".encode()).decode()
WP  = requests.Session()
WP.headers.update({"Authorization": f"Basic {WP_AUTH}", "User-Agent": "Radiata/2.0"})
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": _UA})

# ─── FIXES: quais seções consertar em cada post ───────────────────────────────
# (display_num, show_name, search_title_anilist, [alt_wikipedia_titles])
# display_num = número que aparece no H2 (ex: "4. Avatar" → 4)

FIXES = {
    2302: [  # Parte 2
        (4,  "Avatar: A Lenda de Aang",       "Avatar: The Last Airbender",          ["Avatar: The Last Airbender"]),
        (5,  "Samurai Jack",                   "Samurai Jack",                        ["Samurai Jack (TV series)"]),
        (6,  "Teen Titans 2003",               "Teen Titans 2003",                    ["Teen Titans (TV series)", "Teen Titans"]),
        (7,  "Danny Phantom",                  "Danny Phantom",                       ["Danny Phantom"]),
        (8,  "Ben 10",                         "Ben 10",                              ["Ben 10 (TV series)"]),
        (9,  "Static Shock",                   "Static Shock",                        ["Static Shock (TV series)"]),
        (10, "Liga da Justiça",                "Justice League Unlimited",            ["Justice League (TV series)", "Justice League animated series"]),
        (11, "Code Lyoko",                     "Code Lyoko",                          ["Code Lyoko"]),
        (12, "Winx Club",                      "Winx Club",                           ["Winx Club"]),
        (13, "Xiaolin Showdown",               "Xiaolin Showdown",                    ["Xiaolin Showdown"]),
        (14, "My Life as a Teenage Robot",     "My Life as a Teenage Robot",          ["My Life as a Teenage Robot (TV series)"]),
        (15, "As Aventuras de Jimmy Neutron",  "Jimmy Neutron: Boy Genius",           ["The Adventures of Jimmy Neutron: Boy Genius"]),
        (16, "Megas XLR",                      "Megas XLR",                           ["Megas XLR (TV series)"]),
    ],
    2267: [  # Parte 1
        (7,  "Dexter's Laboratory",            "Dexter's Laboratory",                 ["Dexter's Laboratory"]),
        (9,  "Johnny Bravo",                   "Johnny Bravo",                        ["Johnny Bravo (TV series)"]),
        (10, "Courage the Cowardly Dog",       "Courage the Cowardly Dog",            ["Courage the Cowardly Dog"]),
        (11, "Hey Arnold!",                    "Hey Arnold!",                         ["Hey Arnold! (TV series)", "Hey Arnold"]),
        (12, "Rugrats",                        "Rugrats",                             ["Rugrats (TV series)"]),
        (13, "The Fairly OddParents",          "The Fairly OddParents",               ["The Fairly OddParents"]),
        (14, "Recess",                         "Recess TV series",                    ["Recess (TV series)", "Recess (season 1)"]),
        (15, "Kim Possible",                   "Kim Possible",                        ["Kim Possible (TV series)"]),
        (16, "The Wild Thornberrys",           "The Wild Thornberrys",                ["The Wild Thornberrys"]),
    ],
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _to_seo_slug(text: str) -> str:
    s = unicodedata.normalize("NFD", text.lower().strip())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]
    return s

def download_image(url: str) -> bytes | None:
    try:
        r = HTTP.get(url, timeout=20)
        if r.ok and len(r.content) > 5000:
            return r.content
    except Exception as e:
        print(f"    [dl] {url[:60]}: {e}")
    return None

# ─── AniList ──────────────────────────────────────────────────────────────────

_anilist_cache: dict = {}

ANILIST_QUERY = """
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id bannerImage coverImage { extraLarge large }
  }
}
"""

def anilist_images(title: str) -> dict:
    key = title.lower().strip()
    if key in _anilist_cache:
        return _anilist_cache[key]
    time.sleep(0.4)
    try:
        r = HTTP.post(
            "https://graphql.anilist.co",
            json={"query": ANILIST_QUERY, "variables": {"search": title}},
            headers={"Content-Type": "application/json"}, timeout=15,
        )
        if r.ok:
            data = r.json().get("data", {}).get("Media")
            if data:
                ci = data.get("coverImage") or {}
                result = {"banner": data.get("bannerImage"),
                          "cover":  ci.get("extraLarge") or ci.get("large")}
                _anilist_cache[key] = result
                return result
    except Exception as e:
        print(f"    [anilist] '{title}': {e}")
    _anilist_cache[key] = {"banner": None, "cover": None}
    return _anilist_cache[key]

# ─── Fandom wiki: mapeamento de show → subdomínio ────────────────────────────
# Fandom tem imagens de personagens muito melhores que Wikipedia para cartoons

FANDOM_WIKIS = {
    # Subdomínio correto verificado em 2026-05-24 — NUNCA usar 'winxclub', 'xiaolin', etc.
    "Samurai Jack":                 ("samuraijack",         "Samurai Jack (character)"),
    "Danny Phantom":                ("dannyphantom",        "Danny Phantom"),
    "Teen Titans 2003":             ("teentitans",          "Teen Titans"),
    "Ben 10":                       ("ben10",               "Ben 10"),
    "Avatar: A Lenda de Aang":      ("avatar",              "Avatar: The Last Airbender"),
    "Static Shock":                 ("static",              "Virgil Hawkins (DCAU)"),   # dcau.fandom retorna vazio
    "Liga da Justiça":              ("dcau",                "Justice League"),
    "Code Lyoko":                   ("codelyoko",           "Code Lyoko"),
    "Winx Club":                    ("winx",                "Bloom"),                   # 'winxclub' errado → 'winx'
    "Xiaolin Showdown":             ("xiaolinpedia",        "Omi"),                     # 'xiaolin' errado → 'xiaolinpedia'
    "My Life as a Teenage Robot":   ("mlaatr",              "My Life as a Teenage Robot"),
    "As Aventuras de Jimmy Neutron":("jimmyneutron",        "Jimmy Neutron"),
    "Megas XLR":                    ("megasxlr",            "Megas XLR"),
    "Dexter's Laboratory":          ("dexterslaboratory",   "Dexter"),                  # 'dexters-lab' errado
    "Johnny Bravo":                 ("johnnybravo",         "Johnny Bravo (character)"),# page 'Johnny Bravo' retorna vazio
    "Courage the Cowardly Dog":     ("courage",             "Courage the Cowardly Dog"),
    "Hey Arnold!":                  ("heyarnold",           "Hey Arnold!"),
    "Rugrats":                      ("rugrats",             "Rugrats"),
    "The Fairly OddParents":        ("fairlyoddparents",    "The Fairly OddParents"),
    "Recess":                       ("recessatschool",      "Recess"),
    "Kim Possible":                 ("kimpossible",         "Kim Possible"),
    "The Wild Thornberrys":         ("wildthornberrys",     "The Wild Thornberrys"),
}

_LOGO_FANDOM_SKIP = {
    "logo", "wordmark", ".svg", "icon", "stub", "badge", "emblem",
    "flag", "map", "shield", "button", "star", "portal", "commons",
    "background", "nav", "blank", "placeholder", "default",
}

def fandom_best_image(show_name: str) -> bytes | None:
    """Busca melhor imagem no Fandom wiki do show (maior por pixels, filtrada)."""
    entry = FANDOM_WIKIS.get(show_name)
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

        # Pega URLs e tamanhos em lotes de 5
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
                print(f"    [fandom:{subdomain}] {url.split('/')[-1][:45]} ({len(raw)//1024}KB, {area//1000}Kpx)")
                return raw
    except Exception as e:
        print(f"    [fandom] '{show_name}': {e}")
    return None

# ─── Wikipedia scene image (estratégia melhorada) ─────────────────────────────

# Keywords que indicam logo/ícone — imagens com esses tokens no nome são puladas
_LOGO_SKIP = {
    "logo", "wordmark", ".svg", "icon", "stub", "badge", "emblem", "seal",
    "flag", "map", "shield", "crest", "award", "wikimedia", "commons",
    "wikipedia", "wikidata", "button", "star", "symbol", "featured",
    "globe", "redirect", "file-", "portal",
}

def _get_wiki_image_info(filename: str) -> tuple[int, str | None]:
    """Retorna (width*height, thumburl) para um arquivo do Wikipedia."""
    try:
        r = HTTP.get("https://en.wikipedia.org/w/api.php", params={
            "action": "query", "titles": f"File:{filename}",
            "prop": "imageinfo", "iiprop": "url|size",
            "iiurlwidth": 700, "format": "json",
        }, timeout=10)
        if r.ok:
            for page in r.json().get("query", {}).get("pages", {}).values():
                info = (page.get("imageinfo") or [{}])[0]
                url  = info.get("thumburl") or info.get("url")
                area = (info.get("width", 0) or 0) * (info.get("height", 0) or 0)
                return area, url
    except Exception:
        pass
    return 0, None

def wikipedia_best_scene(title: str) -> bytes | None:
    """Pega a melhor imagem não-logo de um artigo Wikipedia (ordena por pixels)."""
    time.sleep(0.5)
    try:
        r = HTTP.get("https://en.wikipedia.org/w/api.php", params={
            "action": "parse", "page": title, "prop": "images",
            "format": "json", "redirects": 1,
        }, timeout=15)
        if not r.ok:
            return None

        all_imgs = r.json().get("parse", {}).get("images", [])
        candidates = [
            img for img in all_imgs
            if not any(kw in img.lower() for kw in _LOGO_SKIP)
            and img.lower().rsplit(".", 1)[-1] in ("jpg", "jpeg", "png", "webp")
        ]
        if not candidates:
            return None

        # Pega info (pixels, url) em lotes de 5
        sized: list[tuple[int, str]] = []
        for i in range(0, min(len(candidates), 20), 5):
            batch = candidates[i:i + 5]
            for fname in batch:
                area, url = _get_wiki_image_info(fname)
                if url:
                    sized.append((area, url))
            time.sleep(0.3)

        # Ordena pela maior área de pixels (melhor imagem primeiro)
        sized.sort(reverse=True)

        for area, url in sized:
            raw = download_image(url)
            if raw and len(raw) > 30 * 1024:  # > 30KB
                print(f"    [wiki-scene] {url.split('/')[-1][:50]} ({len(raw)//1024}KB, {area//1000}Kpx)")
                return raw

    except Exception as e:
        print(f"    [wiki-scene] '{title}': {e}")
    return None

# ─── Find best image for a show ───────────────────────────────────────────────

def find_best_image(show_name: str, anilist_title: str, wiki_titles: list[str]) -> bytes | None:
    """
    Ordem de tentativa:
    1. AniList banner > 50KB
    2. AniList cover > 30KB
    3. Fandom wiki (imagens de personagens/cenas)
    4. Wikipedia (parse API, filtra logos, ordena por pixels)
    """
    imgs = anilist_images(anilist_title)

    if imgs.get("banner"):
        raw = download_image(imgs["banner"])
        if raw and len(raw) > 50 * 1024:
            print(f"    → AniList banner ({len(raw)//1024}KB)")
            return raw
        if raw:
            print(f"    [skip] banner {len(raw)//1024}KB < 50KB")

    if imgs.get("cover"):
        raw = download_image(imgs["cover"])
        if raw and len(raw) > 30 * 1024:
            print(f"    → AniList cover ({len(raw)//1024}KB)")
            return raw
        if raw:
            print(f"    [skip] cover {len(raw)//1024}KB < 30KB")

    # Fandom wiki — melhor fonte para cartoons ocidentais
    raw = fandom_best_image(show_name)
    if raw:
        return raw

    # Wikipedia — tenta título + variantes "cartoon" / "TV series characters"
    # para evitar imagens de computadores/logos sem relação com o show
    extra_variants: list[str] = []
    tl = anilist_title.lower()
    if not any(kw in tl for kw in ("anime", "manga", "jujutsu", "bleach", "naruto")):
        extra_variants = [f"{anilist_title} cartoon", f"{anilist_title} TV series characters"]
    for wt in [anilist_title] + wiki_titles + extra_variants:
        print(f"    Tentando Wikipedia '{wt}'...")
        raw = wikipedia_best_scene(wt)
        if raw:
            return raw

    return None

# ─── WP helpers ───────────────────────────────────────────────────────────────

def upload_image(raw: bytes, filename: str) -> dict | None:
    try:
        r = WP.post(
            f"{WP_URL}/wp-json/wp/v2/media",
            data=raw,
            headers={"Content-Disposition": f'attachment; filename="{filename}"',
                     "Content-Type": "image/jpeg"},
            timeout=35,
        )
        r.raise_for_status()
        m = r.json()
        return {"id": m["id"], "url": m.get("source_url", ""), "name": filename.replace(".jpg", "")}
    except Exception as e:
        print(f"    [upload] {filename}: {e}")
        return None

def wp_get_post(post_id: int) -> dict:
    r = WP.get(f"{WP_URL}/wp-json/wp/v2/posts/{post_id}?context=edit", timeout=15)
    r.raise_for_status()
    return r.json()

def wp_update_post(post_id: int, content: str) -> bool:
    r = WP.post(f"{WP_URL}/wp-json/wp/v2/posts/{post_id}",
                json={"content": content}, timeout=30)
    if r.ok:
        return True
    print(f"  [wp-update] HTTP {r.status_code}: {r.text[:200]}")
    return False

# ─── HTML patching ────────────────────────────────────────────────────────────

def patch_html_section(html: str, h2_idx: int, media: dict) -> str:
    """
    Substitui ou insere <figure> na seção H2 de índice h2_idx (0-based).

    Estrutura do split com re.split(r'(<h2...>.*?</h2>)', html):
      [pre_text, h2[0], section[0], h2[1], section[1], ...]
    Seção de h2_idx está em parts[h2_idx*2 + 2].
    """
    pattern = re.compile(r'(<h2[^>]*>.*?</h2>)', re.DOTALL | re.IGNORECASE)
    parts = pattern.split(html)

    target = h2_idx * 2 + 2
    if target >= len(parts):
        print(f"  [patch] H2 index {h2_idx} fora do range ({len(parts)} parts)")
        return html

    section = parts[target]
    alt = media.get("name", "anime")
    new_fig = (
        f"\n<figure class='wp-block-image size-large'>"
        f"<img src='{media['url']}' alt='{alt}' loading='lazy'/>"
        f"</figure>"
    )

    if re.search(r'<figure', section, re.IGNORECASE):
        # Substitui figure existente (logo → cena)
        patched = re.sub(
            r"<figure[^>]*>.*?</figure>",
            new_fig, section, count=1, flags=re.DOTALL | re.IGNORECASE,
        )
        action = "substituiu"
    else:
        # Insere depois do primeiro </p>
        p_end = section.find("</p>")
        if p_end == -1:
            print(f"  [patch] sem </p> na secao {h2_idx}")
            return html
        patched = section[:p_end + 4] + new_fig + section[p_end + 4:]
        action = "inseriu"

    parts[target] = patched
    print(f"  [patch] H2[{h2_idx}] {action} figure")
    return "".join(parts)

# ─── Fix one post ─────────────────────────────────────────────────────────────

def fix_post(post_id: int):
    fixes = FIXES.get(post_id)
    if not fixes:
        print(f"Nenhum fix definido para post {post_id}")
        return

    sep = "=" * 60
    print(f"\n{sep}")
    print(f"FIXANDO POST {post_id}")
    print(sep)

    post = wp_get_post(post_id)
    html = post.get("content", {}).get("raw", "") or post.get("content", {}).get("rendered", "")
    if not html:
        print("  [ERRO] Conteudo vazio")
        return

    print(f"  HTML original: {len(html)} chars")
    changed = False

    for (display_num, show_name, anilist_title, wiki_alts) in fixes:
        h2_idx = display_num - 1  # display_num 1-based → 0-based
        print(f"\n  [{display_num:02d}] {show_name}")

        raw = find_best_image(show_name, anilist_title, wiki_alts)
        if not raw:
            print(f"    NENHUMA IMAGEM — seção ficará sem figura")
            continue

        fname = f"{_to_seo_slug(show_name)}.jpg"
        media = upload_image(raw, fname)
        if not media:
            continue

        media["name"] = show_name
        print(f"    upload OK → media_id={media['id']} | {fname} | {len(raw)//1024}KB")

        html = patch_html_section(html, h2_idx, media)
        changed = True

    if not changed:
        print("\n  Nenhuma imagem encontrada, post nao atualizado.")
        return

    print(f"\n  HTML patchado: {len(html)} chars")
    print("  Salvando post...")
    if wp_update_post(post_id, html):
        link = post.get("link", "?")
        print(f"  [SALVO] {link}")
    else:
        print("  [ERRO] Falha ao salvar")

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    target_ids = [int(x) for x in sys.argv[1:]] if sys.argv[1:] else list(FIXES.keys())
    print(f"Posts a fixar: {target_ids}")

    for pid in target_ids:
        try:
            fix_post(pid)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"\n[ERRO] post {pid}: {e}")

    print(f"\n{'='*60}")
    print("CONCLUIDO")

if __name__ == "__main__":
    main()
