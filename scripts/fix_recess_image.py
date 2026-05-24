#!/usr/bin/env python3
"""
fix_recess_image.py — Substitui a imagem errada de Recess (seção 14) no post 2267.

Problema: Wikipedia retornou imagem de computador (provavelmente screenshot do Apple II
do artigo "Recess (TV series)") em vez de uma cena do cartoon.

Fix: usar imagem direta da MUBI (cena real do show).
"""

import os, re, sys, base64, pathlib, unicodedata
import requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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

WP = requests.Session()
WP.headers.update({"Authorization": f"Basic {WP_AUTH}", "User-Agent": "Radiata/2.0"})
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"})

POST_ID    = 2267
DISPLAY_NUM = 14   # seção "14. Recess (1997)"
IMAGE_URL  = "https://images.mubicdn.net/images/film/266178/cache-548337-1745497119/image-w1280.jpg?size=800x"
FILENAME   = "recess.jpg"

def patch_html_section(html: str, display_num: int, media: dict) -> str:
    """Substitui ou insere <figure> na seção display_num."""
    pattern = re.compile(r'(<h2[^>]*>.*?</h2>)', re.DOTALL | re.IGNORECASE)
    parts = pattern.split(html)
    # display_num N → h2_idx = N-1 → target index = (N-1)*2 + 2
    h2_idx = display_num - 1
    target = h2_idx * 2 + 2
    if target >= len(parts):
        print(f"[ERRO] Seção {display_num} não encontrada (parts={len(parts)})")
        return html

    section = parts[target]
    alt  = media.get("alt", "Recess cartoon")
    new_fig = (f"\n<figure class='wp-block-image size-large'>"
               f"<img src='{media['url']}' alt='{alt}' loading='lazy'/>"
               f"</figure>")

    existing_fig = re.search(r'<figure[^>]*>.*?</figure>', section, re.DOTALL | re.IGNORECASE)
    if existing_fig:
        parts[target] = re.sub(
            r'<figure[^>]*>.*?</figure>', new_fig, section,
            count=1, flags=re.DOTALL | re.IGNORECASE
        )
        print(f"  [patch] Substituiu <figure> existente na seção {display_num}")
    else:
        p_end = section.find("</p>")
        if p_end == -1:
            print(f"  [WARN] Nenhum </p> encontrado na seção {display_num}, inserindo no início")
            parts[target] = new_fig + section
        else:
            parts[target] = section[:p_end+4] + new_fig + section[p_end+4:]
        print(f"  [patch] Inseriu <figure> nova após primeiro </p> na seção {display_num}")

    return "".join(parts)

# 1. Download imagem da MUBI
print(f"[1] Baixando imagem: {IMAGE_URL}")
r = HTTP.get(IMAGE_URL, timeout=20)
if not r.ok or len(r.content) < 5000:
    sys.exit(f"[ERRO] Falha ao baixar imagem: {r.status_code} ({len(r.content)} bytes)")
img_bytes = r.content
print(f"    OK — {len(img_bytes)//1024}KB")

# 2. Upload para WP media
print(f"[2] Fazendo upload '{FILENAME}' para WP...")
resp = WP.post(
    f"{WP_URL}/wp-json/wp/v2/media",
    data=img_bytes,
    headers={
        "Content-Disposition": f'attachment; filename="{FILENAME}"',
        "Content-Type": "image/jpeg",
    },
    timeout=35,
)
if not resp.ok:
    sys.exit(f"[ERRO] Upload falhou: {resp.status_code} {resp.text[:200]}")
media_obj = resp.json()
media = {"id": media_obj["id"], "url": media_obj["source_url"], "alt": "Recess cartoon cena"}
print(f"    media_id={media['id']} | {media['url']}")

# 3. Buscar HTML atual do post
print(f"[3] Buscando post {POST_ID}...")
r = WP.get(f"{WP_URL}/wp-json/wp/v2/posts/{POST_ID}", params={"context": "edit"}, timeout=15)
if not r.ok:
    sys.exit(f"[ERRO] Post não encontrado: {r.status_code}")
post = r.json()
html = post.get("content", {}).get("raw") or post.get("content", {}).get("rendered", "")
print(f"    HTML: {len(html)} chars")

# Verificação de segurança: garante que é o post certo
title = post.get("title", {}).get("rendered", "") or post.get("title", {}).get("raw", "")
print(f"    Título: {title}")
if "parte-1" not in post.get("slug","") and "parte 1" not in title.lower() and "classico" not in title.lower() and "90" not in title:
    sys.exit(f"[SEGURANÇA] Post {POST_ID} não parece ser Parte 1 dos clássicos. Slug={post.get('slug')}")

# 4. Patch HTML
print(f"[4] Aplicando patch na seção {DISPLAY_NUM}...")
new_html = patch_html_section(html, DISPLAY_NUM, media)
if new_html == html:
    sys.exit("[WARN] HTML não mudou — verifique se a seção foi encontrada")

# 5. Atualizar post
print(f"[5] Atualizando post {POST_ID}...")
upd = WP.post(
    f"{WP_URL}/wp-json/wp/v2/posts/{POST_ID}",
    json={"content": new_html},
    timeout=30,
)
if not upd.ok:
    sys.exit(f"[ERRO] Update falhou: {upd.status_code} {upd.text[:300]}")
result = upd.json()
print(f"\n[OK] Post atualizado!")
print(f"     ID  : {result['id']}")
print(f"     URL : {result.get('link','?')}")
print(f"     Seção {DISPLAY_NUM} agora tem imagem: {media['url']}")
