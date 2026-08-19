# -*- coding: utf-8 -*-
"""
Lê uma fonte para apuração.

Baixa a página, confere o robots.txt antes (mesma regra do coletor) e imprime
o texto legível, o título e a data de publicação. Serve para conferir o que a
fonte realmente diz antes de escrever a matéria — nunca para copiar o texto.

Uso:
    python ferramentas/ler.py https://exemplo.com/noticia
    python ferramentas/ler.py URL --limite 6000
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime

import requests
from lxml import html as lhtml

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from coletar import Coletor, BRASILIA  # noqa: E402

LIXO = ("script", "style", "nav", "header", "footer", "aside", "form",
        "noscript", "iframe", "svg", "figure")


def ler(url: str, limite: int = 9000):
    c = Coletor(verboso=False)
    if not c.pode_buscar(url):
        raise SystemExit(f"robots.txt de {url} não permite a leitura automatizada.")
    r = requests.get(url, timeout=30, headers={
        "User-Agent": c.ua,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    })
    r.raise_for_status()
    doc = lhtml.fromstring(r.content)

    titulo = (doc.findtext(".//title") or "").strip()
    meta = {}
    for m in doc.xpath("//meta"):
        chave = m.get("property") or m.get("name")
        if chave in ("og:title", "og:description", "description",
                     "article:published_time", "article:modified_time", "author"):
            meta[chave] = (m.get("content") or "").strip()

    for tag in LIXO:
        for el in doc.xpath(f"//{tag}"):
            el.getparent().remove(el)

    principal = doc.xpath("//article") or doc.xpath("//main") or [doc.body]
    texto = principal[0].text_content()
    texto = re.sub(r"[ \t]+", " ", texto)
    texto = re.sub(r"\n\s*\n+", "\n\n", texto).strip()

    return {
        "url": r.url,
        "titulo": meta.get("og:title") or titulo,
        "publicado": meta.get("article:published_time"),
        "atualizado": meta.get("article:modified_time"),
        "autor": meta.get("author"),
        "descricao": meta.get("og:description") or meta.get("description"),
        "texto": texto[:limite],
        "consultado_em": datetime.now(BRASILIA).isoformat(timespec="seconds"),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--limite", type=int, default=9000)
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    d = ler(args.url, args.limite)
    print("=" * 72)
    print("TÍTULO   :", d["titulo"])
    print("PUBLICADO:", d["publicado"])
    print("AUTOR    :", d["autor"])
    print("CONSULTA :", d["consultado_em"])
    print("URL      :", d["url"])
    print("=" * 72)
    print(d["texto"])
