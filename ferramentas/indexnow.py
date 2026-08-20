# -*- coding: utf-8 -*-
"""Notifica o IndexNow sobre as URLs públicas do site após uma publicação."""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET


RAIZ = Path(__file__).resolve().parent.parent
HOST = "vmgames.com.br"
BASE = f"https://{HOST}"
CHAVE = "6d4b919c84c34842a52e1df7ab63e570"
ARQUIVO_CHAVE = RAIZ / f"{CHAVE}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"


def urls_publicas() -> list[str]:
    namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls: set[str] = set()
    for caminho in (RAIZ / "sitemap-site.xml", RAIZ / "blog" / "sitemap.xml"):
        raiz = ET.fromstring(caminho.read_text(encoding="utf-8"))
        urls.update(no.text for no in raiz.findall("s:url/s:loc", namespace) if no.text)
    return sorted(urls)


def enviar(urls: list[str]) -> int:
    if ARQUIVO_CHAVE.read_text(encoding="utf-8").strip() != CHAVE:
        raise RuntimeError("arquivo de verificação do IndexNow está ausente ou inválido")
    corpo = json.dumps({
        "host": HOST,
        "key": CHAVE,
        "keyLocation": f"{BASE}/{CHAVE}.txt",
        "urlList": urls,
    }).encode("utf-8")
    requisicao = urllib.request.Request(
        ENDPOINT, data=corpo, method="POST",
        headers={"Content-Type": "application/json; charset=utf-8",
                 "User-Agent": "VMGames-IndexNow/1.0"},
    )
    with urllib.request.urlopen(requisicao, timeout=30) as resposta:
        return resposta.status


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="apenas lista as URLs")
    args = parser.parse_args()
    urls = urls_publicas()
    if args.dry_run:
        print("\n".join(urls))
        print(f"\n{len(urls)} URLs prontas para envio")
        return 0
    status = enviar(urls)
    print(f"IndexNow respondeu HTTP {status} para {len(urls)} URLs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
