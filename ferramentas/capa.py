# -*- coding: utf-8 -*-
"""
Arte de capa da VM Games.

Serve para o caso mais comum do blog: a matéria não tem imagem que possa ser
publicada legalmente. Em vez de pegar captura de tela alheia, o blog desenha a
própria arte — abstrata, na cor da categoria, e assinada. Nunca imita captura
de jogo nem foto de acontecimento, justamente para ninguém confundir.

O desenho é determinístico: o mesmo slug gera sempre a mesma arte, então a capa
não muda sozinha entre uma geração e outra.

Uso:
    python ferramentas/capa.py <slug> <categoria> ["Rótulo opcional"]
    python ferramentas/capa.py --marca        # logo, OG padrão e avatar
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
MIDIA = RAIZ / "conteudo" / "midia"
CATEGORIAS = {c["slug"]: c for c in json.loads(
    (RAIZ / "conteudo" / "categorias.json").read_text(encoding="utf-8"))}

LARGURA, ALTURA = 1200, 675
FUNDO = (8, 6, 15)

FONTES_CANDIDATAS = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\seguisb.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
]


def fonte(tamanho: int):
    for caminho in FONTES_CANDIDATAS:
        if Path(caminho).exists():
            try:
                return ImageFont.truetype(caminho, tamanho)
            except OSError:
                continue
    return ImageFont.load_default()


def hexa(cor: str):
    c = cor.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


def misturar(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def desenhar_capa(slug: str, categoria_slug: str, rotulo: str | None = None,
                  largura: int = LARGURA, altura: int = ALTURA) -> Image.Image:
    cat = CATEGORIAS.get(categoria_slug)
    if not cat:
        raise SystemExit(f"categoria '{categoria_slug}' não existe em categorias.json")
    acento = hexa(cat["cor"])
    semente = int(hashlib.sha256(slug.encode("utf-8")).hexdigest()[:12], 16)
    rnd = random.Random(semente)

    base = Image.new("RGB", (largura, altura), FUNDO)
    d = ImageDraw.Draw(base)

    # 1. céu: gradiente vertical do fundo para um roxo profundo
    topo = misturar(FUNDO, (26, 20, 58), 1.0)
    for y in range(altura):
        t = y / altura
        d.line([(0, y), (largura, y)], fill=misturar(topo, FUNDO, t ** 0.75))

    # 2. brilho no horizonte, na cor da categoria
    horizonte = int(altura * 0.56)
    brilho = Image.new("RGB", (largura, altura), (0, 0, 0))
    bd = ImageDraw.Draw(brilho)
    cx = int(largura * (0.28 + rnd.random() * 0.44))
    bd.ellipse([cx - 420, horizonte - 210, cx + 420, horizonte + 120],
               fill=misturar((0, 0, 0), acento, 0.55))
    brilho = brilho.filter(ImageFilter.GaussianBlur(110))
    base = Image.blend(base, Image.blend(base, brilho, 0.62), 0.85)
    d = ImageDraw.Draw(base)

    # 3. grade em perspectiva — o aceno à pista do Turbo Race
    grade = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grade)
    fuga_x = cx
    for i in range(-16, 17):
        x_base = largura / 2 + i * (largura / 9)
        gd.line([(fuga_x, horizonte), (x_base, altura)],
                fill=(*acento, 46), width=2)
    y = horizonte
    passo = 3.0
    while y < altura:
        gd.line([(0, y), (largura, y)], fill=(*acento, 40), width=2)
        passo *= 1.32
        y += passo
    grade = grade.filter(ImageFilter.GaussianBlur(0.6))
    base = Image.alpha_composite(base.convert("RGBA"), grade).convert("RGB")
    d = ImageDraw.Draw(base)

    # 4. linha do horizonte
    d.line([(0, horizonte), (largura, horizonte)], fill=misturar(FUNDO, acento, 0.85), width=3)

    # 5. faixas diagonais de luz, posição vinda do slug
    faixas = Image.new("RGBA", (largura, altura), (0, 0, 0, 0))
    fd = ImageDraw.Draw(faixas)
    for _ in range(rnd.randint(3, 5)):
        x = rnd.randint(-200, largura)
        larg = rnd.randint(26, 90)
        incl = rnd.uniform(0.35, 0.75)
        desl = int(altura * incl)
        fd.polygon([(x, 0), (x + larg, 0), (x + larg - desl, altura), (x - desl, altura)],
                   fill=(*acento, rnd.randint(14, 30)))
    faixas = faixas.filter(ImageFilter.GaussianBlur(9))
    base = Image.alpha_composite(base.convert("RGBA"), faixas).convert("RGB")
    d = ImageDraw.Draw(base)

    # 6. formas geométricas soltas acima do horizonte.
    #    A faixa de cima à esquerda fica livre: é onde entra a etiqueta.
    for _ in range(rnd.randint(4, 7)):
        for _tentativa in range(12):
            cxx = rnd.randint(60, largura - 60)
            cyy = rnd.randint(50, horizonte - 40)
            if not (cxx < largura * 0.42 and cyy < altura * 0.26):
                break
        r = rnd.randint(10, 44)
        lados = rnd.choice([3, 4, 6])
        giro = rnd.uniform(0, math.tau)
        pontos = [(cxx + r * math.cos(giro + k * math.tau / lados),
                   cyy + r * math.sin(giro + k * math.tau / lados)) for k in range(lados)]
        d.polygon(pontos, outline=misturar(FUNDO, acento, rnd.uniform(0.45, 0.95)), width=2)

    # 7. vinheta, para o texto respirar
    vinheta = Image.new("L", (largura, altura), 0)
    vd = ImageDraw.Draw(vinheta)
    vd.rectangle([0, 0, largura, altura], fill=140)
    vd.ellipse([-largura * 0.25, -altura * 0.5, largura * 1.25, altura * 1.3], fill=0)
    vinheta = vinheta.filter(ImageFilter.GaussianBlur(120))
    base = Image.composite(Image.new("RGB", (largura, altura), FUNDO), base, vinheta)
    d = ImageDraw.Draw(base)

    escala = largura / LARGURA

    # 8. etiqueta da categoria
    texto = (rotulo or cat["nome"]).upper()
    f_cat = fonte(int(27 * escala))
    pad = int(17 * escala)
    caixa = d.textbbox((0, 0), texto, font=f_cat)
    lc, hc = caixa[2] - caixa[0], caixa[3] - caixa[1]
    x0, y0 = int(52 * escala), int(48 * escala)
    d.rounded_rectangle([x0, y0, x0 + lc + pad * 2, y0 + hc + pad * 2],
                        radius=int(11 * escala), fill=misturar(FUNDO, acento, 0.16),
                        outline=misturar(FUNDO, acento, 0.75), width=max(1, int(2 * escala)))
    d.text((x0 + pad, y0 + pad - caixa[1]), texto, font=f_cat, fill=acento)

    # 9. assinatura
    f_marca = fonte(int(34 * escala))
    y_marca = altura - int(74 * escala)
    d.text((int(52 * escala), y_marca), "VM", font=f_marca, fill=(0, 245, 255))
    largura_vm = d.textbbox((0, 0), "VM ", font=f_marca)[2]
    d.text((int(52 * escala) + largura_vm, y_marca), "GAMES", font=f_marca, fill=(255, 45, 170))

    f_nota = fonte(int(19 * escala))
    d.text((int(52 * escala), altura - int(34 * escala)),
           "arte ilustrativa", font=f_nota, fill=(120, 112, 160))

    return base


def salvar(img: Image.Image, destino: Path, qualidade: int = 82):
    destino.parent.mkdir(parents=True, exist_ok=True)
    if destino.suffix == ".webp":
        img.save(destino, "WEBP", quality=qualidade, method=6)
    else:
        img.save(destino, optimize=True)
    return destino


def gerar_artigo(slug: str, categoria: str, rotulo: str | None = None) -> str:
    capa = desenhar_capa(slug, categoria, rotulo)
    destino = MIDIA / "capas" / f"{slug}.webp"
    salvar(capa, destino)
    return f"/blog/img/capas/{slug}.webp"


def gerar_marca():
    """Logo da publicação, imagem OG padrão e avatar do autor."""
    # logo 512x512
    logo = Image.new("RGB", (512, 512), FUNDO)
    d = ImageDraw.Draw(logo)
    for y in range(512):
        d.line([(0, y), (512, y)], fill=misturar((20, 16, 46), FUNDO, y / 512))
    d.rounded_rectangle([36, 36, 476, 476], radius=64, outline=(42, 35, 80), width=4)
    f = fonte(126)
    d.text((256, 214), "VM", font=f, fill=(0, 245, 255), anchor="mm")
    d.text((256, 322), "GAMES", font=fonte(70), fill=(255, 45, 170), anchor="mm")
    salvar(logo, MIDIA / "vmgames-logo.png")

    # imagem OG padrão 1200x630
    og = desenhar_capa("vm-games-blog", "noticias", "Blog VM Games", 1200, 630)
    salvar(og, MIDIA / "og-padrao.png")

    # avatar do autor: monograma, não retrato — o blog não inventa foto de gente
    av = Image.new("RGB", (256, 256), (18, 16, 42))
    d = ImageDraw.Draw(av)
    for y in range(256):
        d.line([(0, y), (256, y)], fill=misturar((34, 29, 71), (18, 16, 42), y / 256))
    d.ellipse([12, 12, 244, 244], outline=(0, 245, 255), width=3)
    d.text((128, 124), "AV", font=fonte(96), fill=(244, 241, 255), anchor="mm")
    salvar(av, MIDIA / "autores" / "arley.webp")
    return [MIDIA / "vmgames-logo.png", MIDIA / "og-padrao.png", MIDIA / "autores" / "arley.webp"]


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--marca":
        for p in gerar_marca():
            print("gerado:", p.relative_to(RAIZ).as_posix())
    elif len(sys.argv) >= 3:
        rotulo = sys.argv[3] if len(sys.argv) > 3 else None
        print("gerado:", gerar_artigo(sys.argv[1], sys.argv[2], rotulo))
    else:
        print(__doc__)
