# -*- coding: utf-8 -*-
"""
Gerador do blog da VM Games.

Lê o conteúdo de conteudo/ (Markdown com cabeçalho YAML) e escreve HTML pronto
em blog/. Nada é montado no navegador: a matéria chega no HTML, o que é o que
faz diferença para leitura, para o Google e para quem tem internet ruim.

Uso:
    python ferramentas/build.py                 # gera o site para produção
    python ferramentas/build.py --dev           # mostra reserva de anúncio e avisos
    python ferramentas/build.py --rascunhos     # inclui rascunhos (com noindex)

A saída inteira é descartável: blog/ é apagado e refeito a cada execução.
Fonte da verdade é conteudo/.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

import bleach
import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

RAIZ = Path(__file__).resolve().parent.parent
CONTEUDO = RAIZ / "conteudo"
MODELOS = Path(__file__).resolve().parent / "modelos"
ESTATICO = Path(__file__).resolve().parent / "estatico"
SAIDA = RAIZ / "blog"

BRASILIA = timezone(timedelta(hours=-3), "Horário de Brasília")

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

STATUS_VALIDOS = {"rascunho", "revisao", "aprovado", "agendado",
                  "publicado", "rejeitado", "arquivado"}

# Endereços que o blog usa para si; nenhum artigo pode ocupá-los.
SLUGS_RESERVADOS = {
    "categoria", "tag", "autor", "autores", "busca", "pagina", "feed",
    "img", "sitemap", "sitemap-noticias", "indice-busca", "blog.css",
    "politica-editorial", "correcoes", "index",
}

TAGS_PERMITIDAS = [
    "p", "br", "hr", "strong", "em", "b", "i", "u", "s", "mark", "small", "sub", "sup",
    "h2", "h3", "h4", "ul", "ol", "li", "dl", "dt", "dd", "blockquote", "cite", "q",
    "a", "img", "figure", "figcaption", "picture", "source", "video",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    "code", "pre", "kbd", "samp", "abbr", "time", "span", "div", "section", "aside",
]
ATRIBUTOS_PERMITIDOS = {
    "*": ["class", "id", "title", "lang", "dir"],
    "a": ["href", "rel", "target"],
    "img": ["src", "alt", "width", "height", "loading", "decoding", "srcset", "sizes"],
    "video": ["src", "poster", "controls", "width", "height", "preload", "playsinline"],
    "source": ["src", "srcset", "type", "media"],
    "time": ["datetime"],
    "th": ["colspan", "rowspan", "scope"],
    "td": ["colspan", "rowspan"],
    "abbr": ["title"],
}


class ErroDeConteudo(Exception):
    """Problema no material escrito — a mensagem diz o arquivo e o que falta."""


# ----------------------------------------------------------------------------
# utilidades
# ----------------------------------------------------------------------------

def escorregar(texto: str) -> str:
    """
    Transforma um título em slug: sem acento, minúsculo, hifenizado.

    NFKD, e não NFD, porque só a decomposição de compatibilidade resolve
    caractere como "º" — em NFD ele sobrevive inteiro e some no filtro,
    virando "1-de-setembro" em vez de "1o-de-setembro".
    """
    t = unicodedata.normalize("NFKD", str(texto))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return re.sub(r"-{2,}", "-", t)


def ler_json(caminho: Path):
    with caminho.open(encoding="utf-8") as f:
        return json.load(f)


def como_data(valor, arquivo: str, campo: str):
    """Aceita datetime do YAML ou texto ISO; devolve sempre com fuso de Brasília."""
    if valor in (None, ""):
        return None
    if isinstance(valor, datetime):
        d = valor
    else:
        try:
            d = datetime.fromisoformat(str(valor).strip().replace("Z", "+00:00"))
        except ValueError:
            raise ErroDeConteudo(f"{arquivo}: '{campo}' não é uma data válida ({valor!r}). "
                                 f"Use o formato 2026-08-19T14:30:00-03:00.")
    if d.tzinfo is None:
        d = d.replace(tzinfo=BRASILIA)
    return d.astimezone(BRASILIA)


def data_legivel(d: datetime, completa: bool = False) -> str:
    if completa:
        return f"{d.day} de {MESES[d.month - 1]} de {d.year}, às {d:%H}h{d:%M}"
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def json_para_script(dados) -> str:
    """JSON-LD seguro dentro de <script>: nenhum '<' consegue fechar a tag."""
    bruto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    return (bruto.replace("<", "\\u003c")
                 .replace(">", "\\u003e")
                 .replace("&", "\\u0026"))


def cor_fraca(hexa: str, alfa: float = 0.13) -> str:
    h = hexa.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r}, {g}, {b}, {alfa})"


def rfc822(d: datetime) -> str:
    dias = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    meses = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return (f"{dias[d.weekday()]}, {d.day:02d} {meses[d.month - 1]} {d.year} "
            f"{d:%H:%M:%S} {d:%z}")


# ----------------------------------------------------------------------------
# leitura do conteúdo
# ----------------------------------------------------------------------------

def separar_cabecalho(bruto: str, arquivo: str):
    if not bruto.startswith("---"):
        raise ErroDeConteudo(f"{arquivo}: falta o cabeçalho YAML entre linhas '---'.")
    partes = bruto.split("---", 2)
    if len(partes) < 3:
        raise ErroDeConteudo(f"{arquivo}: cabeçalho YAML não foi fechado com '---'.")
    try:
        meta = yaml.safe_load(partes[1]) or {}
    except yaml.YAMLError as e:
        raise ErroDeConteudo(f"{arquivo}: cabeçalho YAML inválido — {e}")
    return meta, partes[2].strip()


def montar_markdown():
    return markdown.Markdown(
        extensions=["extra", "sane_lists", "smarty", "toc", "attr_list"],
        extension_configs={
            "toc": {"toc_depth": "2-3", "anchorlink": False, "permalink": False},
            "smarty": {"substitutions": {
                "left-double-quote": "&ldquo;", "right-double-quote": "&rdquo;",
                "left-single-quote": "&lsquo;", "right-single-quote": "&rsquo;",
            }},
        },
        output_format="html",
    )


def limpar_html(bruto: str) -> str:
    return bleach.clean(
        bruto,
        tags=TAGS_PERMITIDAS,
        attributes=ATRIBUTOS_PERMITIDOS,
        protocols=["http", "https", "mailto"],
        strip=True,
    )


def carregar_artigos(categorias, autores, incluir_rascunhos: bool):
    agora = datetime.now(BRASILIA)
    md = montar_markdown()
    artigos, vistos_slug, vistos_id = [], {}, {}

    for caminho in sorted((CONTEUDO / "artigos").rglob("*.md")):
        nome = caminho.relative_to(RAIZ).as_posix()
        meta, corpo = separar_cabecalho(caminho.read_text(encoding="utf-8"), nome)

        # --- campos obrigatórios -------------------------------------------
        for campo in ("titulo", "resumo", "categoria", "autor", "status"):
            if not meta.get(campo):
                raise ErroDeConteudo(f"{nome}: falta o campo obrigatório '{campo}'.")

        status = str(meta["status"]).strip()
        if status not in STATUS_VALIDOS:
            raise ErroDeConteudo(f"{nome}: status '{status}' não existe. "
                                 f"Use um destes: {', '.join(sorted(STATUS_VALIDOS))}.")

        slug = str(meta.get("slug") or escorregar(meta["titulo"]))
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise ErroDeConteudo(f"{nome}: slug '{slug}' tem caractere inválido. "
                                 f"Só minúscula, número e hífen.")
        if slug in SLUGS_RESERVADOS:
            raise ErroDeConteudo(f"{nome}: '{slug}' é um endereço reservado do blog. Escolha outro.")

        cat = categorias.get(str(meta["categoria"]))
        if not cat:
            raise ErroDeConteudo(f"{nome}: categoria '{meta['categoria']}' não existe em "
                                 f"conteudo/categorias.json.")
        autor = autores.get(str(meta["autor"]))
        if not autor:
            raise ErroDeConteudo(f"{nome}: autor '{meta['autor']}' não existe em conteudo/autores/.")

        publicado_em = como_data(meta.get("publicado_em"), nome, "publicado_em")
        agendado_para = como_data(meta.get("agendado_para"), nome, "agendado_para")
        atualizado_em = como_data(meta.get("atualizado_em"), nome, "atualizado_em")

        # --- o que entra no ar ---------------------------------------------
        no_ar = status == "publicado"
        if status == "agendado":
            if not agendado_para:
                raise ErroDeConteudo(f"{nome}: status 'agendado' exige 'agendado_para'.")
            if agendado_para <= agora:
                no_ar, publicado_em = True, publicado_em or agendado_para
        if not no_ar and not incluir_rascunhos:
            continue
        if no_ar and not publicado_em:
            raise ErroDeConteudo(f"{nome}: matéria publicada precisa de 'publicado_em'.")
        if not publicado_em:
            publicado_em = agendado_para or agora

        # --- imagem de capa: crédito é obrigatório --------------------------
        capa = meta.get("capa") or {}
        if not capa.get("arquivo"):
            raise ErroDeConteudo(f"{nome}: falta 'capa.arquivo'. Toda matéria precisa de imagem.")
        if not capa.get("alt"):
            raise ErroDeConteudo(f"{nome}: falta 'capa.alt' — o texto alternativo da capa.")
        if not capa.get("credito"):
            raise ErroDeConteudo(f"{nome}: falta 'capa.credito'. Imagem sem crédito não publica.")
        if not capa.get("licenca"):
            raise ErroDeConteudo(f"{nome}: falta 'capa.licenca' (propria, press-kit, api, "
                                 f"licenca-cc ou arte-padrao).")

        # --- vídeo oficial opcional -----------------------------------------
        video = None
        video_meta = meta.get("video") or {}
        if video_meta:
            video_id = str(video_meta.get("youtube_id") or "").strip()
            if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
                raise ErroDeConteudo(f"{nome}: video.youtube_id não é um ID válido do YouTube.")
            if not video_meta.get("titulo") or not video_meta.get("canal"):
                raise ErroDeConteudo(f"{nome}: vídeo precisa de 'titulo' e 'canal'.")
            video_data = como_data(video_meta.get("publicado_em"), nome, "video.publicado_em")
            video = {
                "youtube_id": video_id,
                "titulo": str(video_meta["titulo"]).strip(),
                "canal": str(video_meta["canal"]).strip(),
                "descricao": str(video_meta.get("descricao") or meta["resumo"]).strip(),
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "thumbnail": f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
                "publicado_iso": video_data.isoformat() if video_data else None,
            }

        # --- fontes ----------------------------------------------------------
        fontes = []
        for f in (meta.get("fontes") or []):
            if not f.get("url") or not f.get("veiculo"):
                raise ErroDeConteudo(f"{nome}: cada fonte precisa de 'url' e 'veiculo'.")
            consultado = como_data(f.get("consultado_em"), nome, "fontes.consultado_em")
            data_fonte = como_data(f.get("data_fonte"), nome, "fontes.data_fonte")
            fontes.append({
                "url": f["url"], "veiculo": f["veiculo"], "titulo": f.get("titulo"),
                "autor": f.get("autor"), "tipo": f.get("tipo", "secundaria"),
                "data_legivel": data_legivel(data_fonte, True) if data_fonte else None,
                "consultado_legivel": data_legivel(consultado, True) if consultado else "—",
            })

        exemplo = bool(meta.get("exemplo"))
        if no_ar and not fontes and not exemplo:
            raise ErroDeConteudo(f"{nome}: matéria publicada precisa listar ao menos uma fonte.")

        # --- corpo ------------------------------------------------------------
        md.reset()
        corpo_html = limpar_html(md.convert(corpo))
        sumario = []
        for t in md.toc_tokens:
            sumario.append({"id": t["id"], "texto": t["name"], "nivel": 2})
            for filho in t.get("children", []):
                sumario.append({"id": filho["id"], "texto": filho["name"], "nivel": 3})

        palavras = len(re.findall(r"\w+", re.sub(r"<[^>]+>", " ", corpo_html)))

        tags = []
        for t in (meta.get("tags") or []):
            tags.append({"nome": str(t), "slug": escorregar(t)})

        correcoes = []
        for c in (meta.get("correcoes") or []):
            d = como_data(c.get("data"), nome, "correcoes.data")
            correcoes.append({"iso": d.isoformat() if d else "",
                              "legivel": data_legivel(d, True) if d else "",
                              "texto": c.get("texto", "")})

        ident = str(meta.get("id") or f"{publicado_em:%Y-%m-%d}-{slug}")
        if slug in vistos_slug:
            raise ErroDeConteudo(f"{nome}: o slug '{slug}' já é usado por {vistos_slug[slug]}.")
        if ident in vistos_id:
            raise ErroDeConteudo(f"{nome}: o id '{ident}' já é usado por {vistos_id[ident]}.")
        vistos_slug[slug], vistos_id[ident] = nome, nome

        artigos.append({
            "arquivo": nome,
            "id": ident,
            "slug": slug,
            "url": f"/blog/{slug}/",
            "titulo": str(meta["titulo"]).strip(),
            "subtitulo": (meta.get("subtitulo") or "").strip(),
            "resumo": str(meta["resumo"]).strip(),
            "status": status,
            "no_ar": no_ar,
            "tipo": meta.get("tipo", "noticia"),
            "categoria": cat,
            "tags": tags,
            "autor": autor,
            "destaque": bool(meta.get("destaque")),
            "recomendada": bool(meta.get("recomendada")),
            "patrocinado": bool(meta.get("patrocinado")),
            "patrocinador": meta.get("patrocinador"),
            "confiabilidade": meta.get("confiabilidade", "confirmado"),
            "exemplo": exemplo,
            "publicado": publicado_em,
            "atualizado": atualizado_em,
            "data_iso": publicado_em.isoformat(),
            "atualizado_iso": atualizado_em.isoformat() if atualizado_em else None,
            "data_legivel": data_legivel(publicado_em),
            "data_completa": data_legivel(publicado_em, True),
            "atualizado_completa": data_legivel(atualizado_em, True) if atualizado_em else None,
            "tempo_leitura": max(1, round(palavras / 200)),
            "capa": {
                "url": capa["arquivo"] if capa["arquivo"].startswith("/") else f"/blog/img/{capa['arquivo']}",
                "alt": capa["alt"],
                "legenda": capa.get("legenda", ""),
                "credito": capa["credito"],
                "fonte_url": capa.get("fonte_url"),
                "licenca": capa["licenca"],
            },
            "video": video,
            "fontes": fontes,
            "correcoes": correcoes,
            "sumario": sumario,
            "corpo_html": corpo_html,
            "texto_busca": re.sub(r"<[^>]+>", " ", corpo_html)[:1200],
            "seo": meta.get("seo") or {},
            "slugs_antigos": meta.get("slugs_antigos") or [],
            "origem": meta.get("origem", "manual"),
        })

    artigos.sort(key=lambda a: a["publicado"], reverse=True)
    return artigos


# ----------------------------------------------------------------------------
# páginas
# ----------------------------------------------------------------------------

class Paginacao:
    def __init__(self, atual, total, base):
        self.atual, self.total, self.base = atual, total, base

    def url(self, n):
        return self.base if n == 1 else f"{self.base}pagina/{n}/"

    @property
    def anterior(self):
        return self.url(self.atual - 1) if self.atual > 1 else None

    @property
    def proxima(self):
        return self.url(self.atual + 1) if self.atual < self.total else None

    @property
    def numeros(self):
        if self.total <= 7:
            return list(range(1, self.total + 1))
        n = {1, self.total, self.atual}
        n.update({self.atual - 1, self.atual + 1})
        n = sorted(x for x in n if 1 <= x <= self.total)
        saida, anterior = [], 0
        for x in n:
            if anterior and x - anterior > 1:
                saida.append(0)          # reticências
            saida.append(x)
            anterior = x
        return saida


class Construtor:
    def __init__(self, dev: bool, rascunhos: bool):
        self.dev = dev
        self.rascunhos = rascunhos
        self.cfg = ler_json(CONTEUDO / "config.json")
        self.site = self.cfg["site"]
        self.base_url = self.site["url"].rstrip("/")
        self.lista_categorias = ler_json(CONTEUDO / "categorias.json")
        self.categorias = {c["slug"]: c for c in self.lista_categorias}
        self.autores = {}
        for arq in sorted((CONTEUDO / "autores").glob("*.json")):
            a = ler_json(arq)
            self.autores[a["slug"]] = a
        self.artigos = carregar_artigos(self.categorias, self.autores, rascunhos)
        self.publicados = [a for a in self.artigos if a["no_ar"]]
        self.jinja = Environment(
            loader=FileSystemLoader(str(MODELOS)),
            autoescape=select_autoescape(["html", "xml"]),
            trim_blocks=False, lstrip_blocks=False,
        )
        self.escritos = 0

    # ---------- infraestrutura ----------

    def escrever(self, destino: str, conteudo: str):
        caminho = SAIDA / destino if not destino.startswith("/") else RAIZ / destino.lstrip("/")
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(conteudo, encoding="utf-8", newline="\n")
        self.escritos += 1

    def contexto(self, **extra):
        base = {
            "site": self.site,
            "categorias": self.lista_categorias,
            "anuncios": self.cfg["anuncios"],
            "anuncios_ativos": bool(self.cfg["anuncios"]["ativos"]),
            "dev": self.dev,
            "aviso_dev": self.dev and any(a["exemplo"] for a in self.publicados),
            "secao": "blog",
            "acento": None,
            "acento_fraco": None,
            "og_imagem": self.base_url + self.site["og_padrao"],
            "dados_estruturados": [],
            "nao_indexar": False,
            "lateral": self.lateral(),
            "categoria_atual": None,
            "pagina_atual": None,
        }
        base.update(extra)
        if base.get("acento"):
            base["acento_fraco"] = cor_fraca(base["acento"])
        return base

    def render(self, modelo, destino, **ctx):
        self.escrever(destino, self.jinja.get_template(modelo).render(**self.contexto(**ctx)))

    def lateral(self):
        recomendadas = [a for a in self.publicados if a["recomendada"]][: self.cfg["blocos"]["mais_lidas"]]
        if not recomendadas:
            recomendadas = self.publicados[: self.cfg["blocos"]["mais_lidas"]]
        return {
            "mais_lidas": recomendadas,
            "ultimas": self.publicados[: self.cfg["blocos"]["ultimas"]],
        }

    def organizacao(self):
        return {
            "@type": "Organization",
            "@id": f"{self.base_url}/#organizacao",
            "name": "VM Games",
            "url": self.base_url + "/",
            "logo": {"@type": "ImageObject", "url": self.base_url + self.site["logo"]},
            "email": self.site["email"],
            "address": {"@type": "PostalAddress", "addressLocality": "Catalão",
                        "addressRegion": "GO", "addressCountry": "BR"},
        }

    def migalhas_ld(self, itens):
        return {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "name": it["nome"],
                 "item": self.base_url + it["url"]}
                for i, it in enumerate(itens)
            ],
        }

    # ---------- telas ----------

    def gerar_home(self):
        cfg = self.cfg
        destaque = next((a for a in self.publicados if a["destaque"]), None)
        if not destaque and self.publicados:
            destaque = self.publicados[0]
        restantes = [a for a in self.publicados if a is not destaque]
        n_sec = cfg["blocos"]["destaques_secundarios"]
        secundarios = restantes[:n_sec]
        resto = restantes[n_sec:]

        por_pagina = cfg["paginacao"]["home"]
        total = max(1, -(-len(resto) // por_pagina)) if resto else 1

        por_categoria = []
        for c in self.lista_categorias:
            desta = [a for a in self.publicados if a["categoria"]["slug"] == c["slug"]]
            if len(desta) >= 3:
                por_categoria.append({"categoria": c, "artigos": desta[:3]})
        por_categoria = por_categoria[:3]

        ld = [
            json_para_script({
                "@context": "https://schema.org", "@type": "WebSite",
                "name": "Blog VM Games", "url": f"{self.base_url}/blog/",
                "inLanguage": "pt-BR",
                "publisher": self.organizacao(),
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": {"@type": "EntryPoint",
                               "urlTemplate": f"{self.base_url}/blog/busca/?q={{search_term_string}}"},
                    "query-input": "required name=search_term_string",
                },
            })
        ]

        self.render(
            "home.html", "index.html",
            titulo_aba=f"{self.site['titulo']} — {self.site['subtitulo']}",
            descricao=self.site["descricao"],
            canonical=f"{self.base_url}/blog/",
            pagina_atual="home",
            destaque=destaque, secundarios=secundarios,
            recentes=resto[:por_pagina],
            por_categoria=por_categoria,
            pag=Paginacao(1, total, "/blog/"),
            dados_estruturados=ld,
        )

        for n in range(2, total + 1):
            fatia = resto[(n - 1) * por_pagina: n * por_pagina]
            self.render(
                "listagem.html", f"pagina/{n}/index.html",
                titulo_aba=f"Todas as notícias — página {n} — Blog VM Games",
                descricao=f"Página {n} das notícias publicadas no blog da VM Games.",
                canonical=f"{self.base_url}/blog/pagina/{n}/",
                titulo_pagina="Todas as notícias",
                subtitulo_pagina=f"página {n} de {total}",
                artigos=fatia, ficha_autor=None, rss="/blog/feed.xml",
                migalhas=[{"nome": "Início", "url": "/"}, {"nome": "Blog", "url": "/blog/"},
                          {"nome": f"Página {n}", "url": f"/blog/pagina/{n}/"}],
                pag=Paginacao(n, total, "/blog/"),
            )

    def gerar_listagem(self, artigos, base, titulo, subtitulo, descricao, migalhas,
                       acento=None, categoria_atual=None, ficha_autor=None, rss=None):
        por_pagina = self.cfg["paginacao"]["listagem"]
        total = max(1, -(-len(artigos) // por_pagina))
        for n in range(1, total + 1):
            fatia = artigos[(n - 1) * por_pagina: n * por_pagina]
            destino = "index.html" if n == 1 else f"pagina/{n}/index.html"
            caminho = base.replace("/blog/", "", 1).strip("/")
            saida = f"{caminho}/{destino}" if caminho else destino
            url = base if n == 1 else f"{base}pagina/{n}/"
            self.render(
                "listagem.html", saida,
                titulo_aba=(titulo if n == 1 else f"{titulo} — página {n}") + " — Blog VM Games",
                descricao=descricao,
                canonical=self.base_url + url,
                titulo_pagina=titulo,
                subtitulo_pagina=subtitulo if n == 1 else f"página {n} de {total}",
                artigos=fatia, migalhas=migalhas, ficha_autor=ficha_autor if n == 1 else None,
                rss=rss, acento=acento, categoria_atual=categoria_atual,
                nao_indexar=(not artigos or (base.startswith("/blog/tag/") and len(artigos) < 2)),
                pag=Paginacao(n, total, base),
                dados_estruturados=[json_para_script(self.migalhas_ld(migalhas))],
            )

    def gerar_categorias(self):
        for c in self.lista_categorias:
            desta = [a for a in self.publicados if a["categoria"]["slug"] == c["slug"]]
            self.gerar_listagem(
                desta, f"/blog/categoria/{c['slug']}/", c["nome"], c["descricao"],
                f"{c['descricao']} Notícias de {c['nome'].lower()} no blog da VM Games.",
                [{"nome": "Início", "url": "/"}, {"nome": "Blog", "url": "/blog/"},
                 {"nome": c["nome"], "url": f"/blog/categoria/{c['slug']}/"}],
                acento=c["cor"], categoria_atual=c["slug"],
            )

    def gerar_tags(self):
        mapa = {}
        for a in self.publicados:
            for t in a["tags"]:
                mapa.setdefault(t["slug"], {"nome": t["nome"], "artigos": []})["artigos"].append(a)
        for slug, d in mapa.items():
            self.gerar_listagem(
                d["artigos"], f"/blog/tag/{slug}/", f"#{d['nome']}",
                f"{len(d['artigos'])} matéria(s) marcadas com {d['nome']}",
                f"Tudo o que o blog da VM Games publicou sobre {d['nome']}.",
                [{"nome": "Início", "url": "/"}, {"nome": "Blog", "url": "/blog/"},
                 {"nome": f"#{d['nome']}", "url": f"/blog/tag/{slug}/"}],
            )

    def gerar_autores(self):
        for slug, autor in self.autores.items():
            desta = [a for a in self.publicados if a["autor"]["slug"] == slug]
            ld = json_para_script({
                "@context": "https://schema.org", "@type": "ProfilePage",
                "mainEntity": {
                    "@type": "Person", "name": autor["nome"], "description": autor["bio"],
                    "jobTitle": autor["cargo"], "url": f"{self.base_url}/blog/autor/{slug}/",
                    "image": self.base_url + autor["foto"],
                    "worksFor": self.organizacao(),
                },
            })
            por_pagina = self.cfg["paginacao"]["listagem"]
            total = max(1, -(-len(desta) // por_pagina))
            for n in range(1, total + 1):
                fatia = desta[(n - 1) * por_pagina: n * por_pagina]
                destino = f"autor/{slug}/index.html" if n == 1 else f"autor/{slug}/pagina/{n}/index.html"
                url = f"/blog/autor/{slug}/" if n == 1 else f"/blog/autor/{slug}/pagina/{n}/"
                self.render(
                    "listagem.html", destino,
                    titulo_aba=f"{autor['nome']} — Blog VM Games",
                    descricao=autor["bio"][:200],
                    canonical=self.base_url + url,
                    titulo_pagina=f"Matérias de {autor['nome']}",
                    subtitulo_pagina=f"{len(desta)} publicada(s)",
                    artigos=fatia, ficha_autor=autor if n == 1 else None, rss=None,
                    migalhas=[{"nome": "Início", "url": "/"}, {"nome": "Blog", "url": "/blog/"},
                              {"nome": autor["nome"], "url": f"/blog/autor/{slug}/"}],
                    pag=Paginacao(n, total, f"/blog/autor/{slug}/"),
                    dados_estruturados=[ld],
                )

    def gerar_artigos(self):
        for a in self.artigos:
            relacionados = [x for x in self.publicados
                            if x is not a and x["categoria"]["slug"] == a["categoria"]["slug"]]
            if len(relacionados) < self.cfg["blocos"]["relacionados"]:
                marcas = {t["slug"] for t in a["tags"]}
                for x in self.publicados:
                    if x is a or x in relacionados:
                        continue
                    if marcas & {t["slug"] for t in x["tags"]}:
                        relacionados.append(x)
            relacionados = relacionados[: self.cfg["blocos"]["relacionados"]]

            url = self.base_url + a["url"]
            migalhas = [
                {"nome": "Início", "url": "/"},
                {"nome": "Blog", "url": "/blog/"},
                {"nome": a["categoria"]["nome"], "url": f"/blog/categoria/{a['categoria']['slug']}/"},
                {"nome": a["titulo"], "url": a["url"]},
            ]
            artigo_ld = {
                "@context": "https://schema.org",
                "@type": "NewsArticle" if a["tipo"] in ("noticia", "lancamento") else "Article",
                "headline": a["titulo"][:110],
                "description": a["resumo"],
                "image": [self.base_url + a["capa"]["url"]],
                "datePublished": a["data_iso"],
                "dateModified": a["atualizado_iso"] or a["data_iso"],
                "inLanguage": "pt-BR",
                "mainEntityOfPage": {"@type": "WebPage", "@id": url},
                "author": {"@type": "Person", "name": a["autor"]["nome"],
                           "url": f"{self.base_url}/blog/autor/{a['autor']['slug']}/"},
                "publisher": self.organizacao(),
                "articleSection": a["categoria"]["nome"],
                "keywords": ", ".join(t["nome"] for t in a["tags"]),
                "isAccessibleForFree": True,
            }
            if a["patrocinado"]:
                artigo_ld["sponsor"] = {"@type": "Organization", "name": a["patrocinador"] or "Anunciante"}
            if a["correcoes"]:
                artigo_ld["correction"] = [c["texto"] for c in a["correcoes"]]

            dados_ld = [json_para_script(artigo_ld),
                        json_para_script(self.migalhas_ld(migalhas))]
            if a["video"]:
                video_ld = {
                    "@context": "https://schema.org", "@type": "VideoObject",
                    "name": a["video"]["titulo"], "description": a["video"]["descricao"],
                    "thumbnailUrl": [a["video"]["thumbnail"]],
                    "embedUrl": f"https://www.youtube-nocookie.com/embed/{a['video']['youtube_id']}",
                    "contentUrl": a["video"]["url"],
                    "publisher": {"@type": "Organization", "name": a["video"]["canal"]},
                }
                if a["video"]["publicado_iso"]:
                    video_ld["uploadDate"] = a["video"]["publicado_iso"]
                dados_ld.append(json_para_script(video_ld))

            self.render(
                "artigo.html", f"{a['slug']}/index.html",
                titulo_aba=(a["seo"].get("titulo") or a["titulo"]) + " — VM Games",
                og_titulo=a["titulo"],
                descricao=a["seo"].get("descricao") or a["resumo"],
                canonical=a["seo"].get("canonical") or url,
                og_tipo="article",
                og_imagem=self.base_url + a["capa"]["url"],
                og_imagem_alt=a["capa"]["alt"],
                acento=a["categoria"]["cor"],
                categoria_atual=a["categoria"]["slug"],
                nao_indexar=not a["no_ar"],
                a=a, relacionados=relacionados, migalhas=migalhas,
                compartilhar={
                    "url": url,
                    "titulo": a["titulo"].replace("&", "e"),
                    "whatsapp": f"{a['titulo']} {url}".replace(" ", "%20").replace("&", "e"),
                },
                dados_estruturados=dados_ld,
            )

            # endereços antigos continuam funcionando
            for antigo in a["slugs_antigos"]:
                self.escrever(f"{antigo}/index.html",
                              f'<!doctype html>\n<html lang="pt-BR">\n<head>\n'
                              f'<meta charset="utf-8">\n'
                              f'<title>{html.escape(a["titulo"])} — VM Games</title>\n'
                              f'<link rel="canonical" href="{url}">\n'
                              f'<meta name="robots" content="noindex, follow">\n'
                              f'<meta http-equiv="refresh" content="0; url={url}">\n'
                              f'</head>\n<body>\n'
                              f'<p>Esta matéria mudou de endereço. '
                              f'<a href="{url}">Ir para a página nova</a>.</p>\n'
                              f'</body>\n</html>\n')

    def gerar_busca(self):
        indice = [{
            "titulo": a["titulo"], "resumo": a["resumo"], "url": a["url"],
            "categoria": a["categoria"]["nome"], "cor": a["categoria"]["cor"],
            "capa": a["capa"]["url"], "iso": a["data_iso"], "data": a["data_legivel"],
            "tags": [t["nome"] for t in a["tags"]], "texto": a["texto_busca"],
        } for a in self.publicados]
        self.escrever("indice-busca.json", json.dumps(indice, ensure_ascii=False, separators=(",", ":")))
        self.render(
            "busca.html", "busca/index.html",
            titulo_aba="Buscar no blog — VM Games",
            descricao="Busque por notícias, análises e guias publicados no blog da VM Games.",
            canonical=f"{self.base_url}/blog/busca/",
            total_artigos=len(self.publicados),
            nao_indexar=True,
            migalhas=[{"nome": "Início", "url": "/"}, {"nome": "Blog", "url": "/blog/"},
                      {"nome": "Buscar", "url": "/blog/busca/"}],
        )

    def bloco_correcoes(self) -> str:
        """Lista, em Markdown, toda matéria que já foi corrigida."""
        linhas = []
        for a in self.publicados:
            for c in a["correcoes"]:
                linhas.append(f"- **{c['legivel']}** — [{a['titulo']}]({a['url']}): {c['texto']}")
        if not linhas:
            return ("*Nenhuma correção registrada até agora.* Esta lista é gerada"
                    " automaticamente a partir das matérias: assim que a primeira correção"
                    " for feita, ela aparece aqui sozinha.")
        return "\n".join(linhas)

    def bloco_autores(self) -> str:
        partes = []
        for slug, a in self.autores.items():
            quantos = sum(1 for x in self.publicados if x["autor"]["slug"] == slug)
            partes.append(
                f"### [{a['nome']}](/blog/autor/{slug}/)\n\n"
                f"*{a['cargo']}* — {quantos} matéria(s) publicada(s).\n\n"
                f"{a['bio']}\n\n"
                f"Contato: [{a['email']}](mailto:{a['email']})"
            )
        return "\n\n".join(partes)

    def gerar_paginas_fixas(self):
        md = montar_markdown()
        for arq in sorted((CONTEUDO / "paginas").glob("*.md")):
            nome = arq.relative_to(RAIZ).as_posix()
            meta, corpo = separar_cabecalho(arq.read_text(encoding="utf-8"), nome)
            md.reset()
            atualizada = como_data(meta.get("atualizada_em"), nome, "atualizada_em")
            corpo = corpo.replace("{{lista-correcoes}}", self.bloco_correcoes())
            corpo = corpo.replace("{{lista-autores}}", self.bloco_autores())
            self.render(
                "pagina.html", f"{meta['slug']}.html",
                titulo_aba=f"{meta['titulo']} — Blog VM Games",
                descricao=meta.get("descricao", ""),
                canonical=f"{self.base_url}/blog/{meta['slug']}.html",
                titulo_pagina=meta["titulo"],
                subtitulo_pagina=meta.get("subtitulo"),
                atualizada_em=data_legivel(atualizada) if atualizada else None,
                atualizada_iso=atualizada.isoformat() if atualizada else None,
                corpo_html=limpar_html(md.convert(corpo)),
                migalhas=[{"nome": "Início", "url": "/"}, {"nome": "Blog", "url": "/blog/"},
                          {"nome": meta["titulo"], "url": f"/blog/{meta['slug']}.html"}],
            )

    # ---------- arquivos para robôs ----------

    def gerar_feed(self):
        itens = []
        for a in self.publicados[:30]:
            url = self.base_url + a["url"]
            itens.append(f"""    <item>
      <title>{xml_escape(a['titulo'])}</title>
      <link>{url}</link>
      <guid isPermaLink="true">{url}</guid>
      <pubDate>{rfc822(a['publicado'])}</pubDate>
      <dc:creator>{xml_escape(a['autor']['nome'])}</dc:creator>
      <category>{xml_escape(a['categoria']['nome'])}</category>
      <description>{xml_escape(a['resumo'])}</description>
      <enclosure url="{self.base_url + a['capa']['url']}" type="image/webp" length="0"/>
    </item>""")
        agora = datetime.now(BRASILIA)
        self.escrever("feed.xml", f"""<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/blog/feed.xsl"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog VM Games</title>
    <link>{self.base_url}/blog/</link>
    <atom:link href="{self.base_url}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <description>{xml_escape(self.site['descricao'])}</description>
    <language>pt-BR</language>
    <lastBuildDate>{rfc822(agora)}</lastBuildDate>
    <ttl>60</ttl>
{chr(10).join(itens)}
  </channel>
</rss>
""")

    def gerar_sitemaps(self):
        agora = datetime.now(BRASILIA)
        limite = agora - timedelta(hours=48)

        urls = [(f"{self.base_url}/blog/", agora, "hourly", "1.0")]
        for a in self.publicados:
            urls.append((self.base_url + a["url"], a["atualizado"] or a["publicado"], "weekly", "0.8"))
        for c in self.lista_categorias:
            if any(a["categoria"]["slug"] == c["slug"] for a in self.publicados):
                urls.append((f"{self.base_url}/blog/categoria/{c['slug']}/", agora, "daily", "0.6"))
        for slug in self.autores:
            urls.append((f"{self.base_url}/blog/autor/{slug}/", agora, "weekly", "0.4"))
        for nome in ("politica-editorial", "correcoes", "autores"):
            urls.append((f"{self.base_url}/blog/{nome}.html", agora, "monthly", "0.3"))

        imagens = {self.base_url + a["url"]: a for a in self.publicados}
        corpo = "\n".join(
            f"  <url><loc>{u}</loc><lastmod>{d:%Y-%m-%d}</lastmod>"
            f"<changefreq>{f}</changefreq><priority>{p}</priority>"
            + (f"<image:image><image:loc>{self.base_url + imagens[u]['capa']['url']}</image:loc>"
               f"<image:title>{xml_escape(imagens[u]['titulo'])}</image:title>"
               f"<image:caption>{xml_escape(imagens[u]['capa']['legenda'])}</image:caption>"
               f"</image:image>" if u in imagens else "")
            + "</url>"
            for u, d, f, p in urls)
        self.escrever("sitemap.xml",
                      '<?xml version="1.0" encoding="UTF-8"?>\n'
                      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
                      '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
                      f"{corpo}\n</urlset>\n")

        recentes = [a for a in self.publicados if a["publicado"] >= limite]
        noticias = "\n".join(f"""  <url>
    <loc>{self.base_url + a['url']}</loc>
    <news:news>
      <news:publication>
        <news:name>VM Games</news:name>
        <news:language>pt</news:language>
      </news:publication>
      <news:publication_date>{a['data_iso']}</news:publication_date>
      <news:title>{xml_escape(a['titulo'])}</news:title>
    </news:news>
  </url>""" for a in recentes)
        self.escrever("sitemap-noticias.xml",
                      '<?xml version="1.0" encoding="UTF-8"?>\n'
                      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
                      '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n'
                      f"{noticias}\n</urlset>\n")

        # sitemap geral do site, na raiz
        paginas_site = ["/", "/sobre.html", "/privacidade.html", "/termos.html",
                        "/turbo-race/", "/sky-vanguard/", "/sugar-strike/",
                        "/sugar-strike/jogar/", "/blog/"]
        linhas = "\n".join(f"  <url><loc>{self.base_url}{p}</loc></url>" for p in paginas_site)
        self.escrever("/sitemap.xml",
                      '<?xml version="1.0" encoding="UTF-8"?>\n'
                      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                      f"  <sitemap><loc>{self.base_url}/blog/sitemap.xml</loc></sitemap>\n"
                      f"  <sitemap><loc>{self.base_url}/blog/sitemap-noticias.xml</loc></sitemap>\n"
                      f"  <sitemap><loc>{self.base_url}/sitemap-site.xml</loc></sitemap>\n"
                      "</sitemapindex>\n")
        self.escrever("/sitemap-site.xml",
                      '<?xml version="1.0" encoding="UTF-8"?>\n'
                      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                      f"{linhas}\n</urlset>\n")

        self.escrever("/robots.txt", f"""# VM Games — {self.base_url}
User-agent: *
Allow: /
Disallow: /conteudo/
Disallow: /ferramentas/
Disallow: /blog/busca/

Sitemap: {self.base_url}/sitemap.xml
Sitemap: {self.base_url}/blog/sitemap.xml
Sitemap: {self.base_url}/blog/sitemap-noticias.xml
""")

    def atualizar_home_do_site(self):
        """
        Reescreve o bloco "Últimas do blog" da index.html do site, entre os
        marcadores. Mexe só no que está entre eles — o resto da página, que é
        escrito à mão, não é tocado.
        """
        pagina = RAIZ / "index.html"
        if not pagina.exists():
            return
        texto = pagina.read_text(encoding="utf-8")
        inicio = "<!-- ULTIMAS-DO-BLOG:inicio"
        fim = "<!-- ULTIMAS-DO-BLOG:fim -->"
        i, f = texto.find(inicio), texto.find(fim)
        if i < 0 or f < 0:
            return
        j = texto.find("-->", i) + 3

        if not self.publicados:
            miolo = ""
        else:
            cartoes = []
            for a in self.publicados[:3]:
                cartoes.append(f"""
    <a class="cartao" href="{a['url']}">
      <div class="capa"><img src="{a['capa']['url']}" alt="{html.escape(a['capa']['alt'], quote=True)}" loading="lazy"></div>
      <div class="info">
        <span class="genero">{html.escape(a['categoria']['nome'])}</span>
        <h3>{html.escape(a['titulo'])}</h3>
        <p>{html.escape(a['resumo'])}</p>
        <span class="selo">{a['data_legivel']}</span>
      </div>
    </a>""")
            miolo = f"""
  <div class="secao-titulo" id="blog">
    <h2>Últimas do blog</h2>
    <span><a href="/blog/">ver todas as notícias</a></span>
  </div>

  <div class="grade">{"".join(cartoes)}
  </div>
"""
        pagina.write_text(texto[:j] + miolo + "\n  " + texto[f:], encoding="utf-8", newline="")
        self.escritos += 1

    # ---------- estáticos ----------

    def copiar_estaticos(self):
        shutil.copy2(ESTATICO / "blog.css", SAIDA / "blog.css")
        shutil.copy2(ESTATICO / "feed.xsl", SAIDA / "feed.xsl")
        shutil.copy2(ESTATICO / "interacoes.js", SAIDA / "interacoes.js")
        origem = CONTEUDO / "midia"
        if origem.exists():
            shutil.copytree(origem, SAIDA / "img", dirs_exist_ok=True)

    # ---------- orquestra ----------

    def construir(self):
        if SAIDA.exists():
            shutil.rmtree(SAIDA)
        SAIDA.mkdir(parents=True)
        self.copiar_estaticos()
        self.gerar_home()
        self.gerar_artigos()
        self.gerar_categorias()
        self.gerar_tags()
        self.gerar_autores()
        self.gerar_busca()
        if (CONTEUDO / "paginas").exists():
            self.gerar_paginas_fixas()
        self.gerar_feed()
        self.gerar_sitemaps()
        self.atualizar_home_do_site()
        return self


def main():
    ap = argparse.ArgumentParser(description="Gera o blog da VM Games.")
    ap.add_argument("--dev", action="store_true",
                    help="marca a pré-visualização: mostra reserva de anúncio e avisos")
    ap.add_argument("--rascunhos", action="store_true",
                    help="inclui rascunhos e matérias em revisão, com noindex")
    args = ap.parse_args()

    try:
        c = Construtor(dev=args.dev, rascunhos=args.rascunhos).construir()
    except ErroDeConteudo as e:
        print(f"\n  ERRO DE CONTEUDO\n  {e}\n", file=sys.stderr)
        return 1

    publicados = len(c.publicados)
    rascunhos = len(c.artigos) - publicados
    print(f"blog gerado: {c.escritos} arquivos | {publicados} publicadas"
          + (f" | {rascunhos} rascunho(s) incluídos" if rascunhos else "")
          + (" | modo dev" if args.dev else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
