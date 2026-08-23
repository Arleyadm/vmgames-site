"""Localiza a imagem social declarada por uma pagina oficial.

Uso: python ferramentas/coletar_imagens_reais.py URL [URL ...]
"""

from __future__ import annotations

import html
import re
import sys
import urllib.request
import urllib.parse


PADROES = (
    re.compile(
        r'<meta[^>]+(?:property|name)=["\']og:image["\'][^>]+'
        r'content=["\']([^"\']+)',
        re.IGNORECASE,
    ),
    re.compile(
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+'
        r'(?:property|name)=["\']og:image["\']',
        re.IGNORECASE,
    ),
)


def carregar_pagina(url: str) -> str:
    requisicao = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(requisicao, timeout=30).read().decode("utf-8", "ignore")


def imagem_social(url: str, pagina: str) -> str:
    for padrao in PADROES:
        resultado = padrao.search(pagina)
        if resultado:
            return html.unescape(resultado.group(1))
    return ""


def imagens_da_pagina(url: str, pagina: str) -> list[str]:
    candidatas = re.findall(r'<img[^>]+(?:src|data-src)=["\']([^"\']+)', pagina, re.I)
    unicas: list[str] = []
    for candidata in candidatas:
        absoluta = urllib.parse.urljoin(url, html.unescape(candidata))
        if absoluta.startswith(("http://", "https://")) and absoluta not in unicas:
            unicas.append(absoluta)
    return unicas


for endereco in sys.argv[1:]:
    try:
        pagina = carregar_pagina(endereco)
        social = imagem_social(endereco, pagina)
        imagens = imagens_da_pagina(endereco, pagina)
        print(f"{endereco}|{social}|{' ; '.join(imagens[:20])}")
    except Exception as erro:  # pragma: no cover - diagnostico de rede
        print(f"{endereco}|ERRO:{erro}")
