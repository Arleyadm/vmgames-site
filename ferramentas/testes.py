# -*- coding: utf-8 -*-
"""
Testes do blog da VM Games.

Rode antes de publicar:

    python ferramentas/testes.py

Não depende de pytest — é um arquivo só, com um contador de falhas. Cada teste
diz em português o que está garantindo, porque a maior parte deles existe por
causa de um erro que já aconteceu de verdade.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
import traceback
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

import build  # noqa: E402
from build import BRASILIA, Construtor, ErroDeConteudo, escorregar  # noqa: E402

RAIZ = build.RAIZ
SAIDA = build.SAIDA
ARTIGOS = build.CONTEUDO / "artigos"
TEMP = ARTIGOS / "_testes"

falhas: list[str] = []
passou = 0


def checar(condicao, descricao, detalhe=""):
    global passou
    if condicao:
        passou += 1
        print(f"  ok   {descricao}")
    else:
        falhas.append(f"{descricao} — {detalhe}")
        print(f"  FALHA {descricao}\n        {detalhe}")


def erro_esperado(texto_md: str, descricao: str, trecho_da_mensagem: str):
    """Escreve uma matéria propositalmente errada e exige que o build recuse."""
    TEMP.mkdir(parents=True, exist_ok=True)
    arq = TEMP / "caso.md"
    arq.write_text(texto_md, encoding="utf-8")
    try:
        Construtor(dev=False, rascunhos=False)
        checar(False, descricao, "o build aceitou conteúdo que deveria ser recusado")
    except ErroDeConteudo as e:
        checar(trecho_da_mensagem.lower() in str(e).lower(), descricao,
               f"recusou, mas com outra mensagem: {e}")
    except Exception as e:
        checar(False, descricao, f"erro inesperado: {type(e).__name__}: {e}")
    finally:
        shutil.rmtree(TEMP, ignore_errors=True)


CABECALHO_BOM = """---
titulo: Matéria de teste
resumo: Resumo de teste com tamanho suficiente para servir de descrição.
status: publicado
tipo: noticia
categoria: noticias
autor: arley
publicado_em: 2026-08-19T10:00:00-03:00
capa:
  arquivo: capas/geforce-now-chega-ao-firefox.webp
  alt: Arte de teste
  credito: VM Games
  licenca: arte-padrao
fontes:
  - url: https://exemplo.com/noticia
    veiculo: Exemplo
    consultado_em: 2026-08-19T10:00:00-03:00
---

Corpo da matéria de teste.
"""


def sem(chave: str) -> str:
    """Devolve o cabeçalho bom sem uma das linhas — para testar obrigatoriedade."""
    return "\n".join(l for l in CABECALHO_BOM.split("\n")
                     if not l.strip().startswith(chave))


# ---------------------------------------------------------------------------
print("\n1. Validação do conteúdo — o build precisa recusar material incompleto")
# ---------------------------------------------------------------------------

erro_esperado(sem("resumo:"), "matéria sem resumo é recusada", "resumo")
erro_esperado(sem("credito:"), "imagem sem crédito é recusada", "credito")
erro_esperado(sem("alt:"), "capa sem texto alternativo é recusada", "alt")
erro_esperado(CABECALHO_BOM.replace("categoria: noticias", "categoria: inexistente"),
              "categoria inventada é recusada", "não existe")
erro_esperado(CABECALHO_BOM.replace("autor: arley", "autor: fulano"),
              "autor inexistente é recusado", "não existe")
erro_esperado(CABECALHO_BOM.replace("status: publicado", "status: quase"),
              "status fora da lista é recusado", "não existe")
erro_esperado(CABECALHO_BOM.replace("titulo: Matéria de teste",
                                    "titulo: Busca\nslug: busca"),
              "slug reservado do blog é recusado", "reservado")
erro_esperado(CABECALHO_BOM.replace("titulo: Matéria de teste",
                                    "titulo: Teste\nslug: Slug Com Espaço"),
              "slug com caractere inválido é recusado", "inválido")
erro_esperado(CABECALHO_BOM.replace("publicado_em: 2026-08-19T10:00:00-03:00",
                                    "publicado_em: ontem de manhã"),
              "data escrita errada é recusada", "não é uma data")
erro_esperado(re.sub(r"fontes:.*?---", "---", CABECALHO_BOM, flags=re.S),
              "matéria publicada sem fonte é recusada", "fonte")
# Slug repetido precisa de dois arquivos, então não passa por erro_esperado().
TEMP.mkdir(parents=True, exist_ok=True)
try:
    for n in ("um", "dois"):
        (TEMP / f"{n}.md").write_text(
            CABECALHO_BOM.replace("titulo: Matéria de teste",
                                  f"titulo: Repetida {n}\nslug: slug-repetido"),
            encoding="utf-8")
    try:
        Construtor(dev=False, rascunhos=False)
        checar(False, "slug repetido em duas matérias é recusado",
               "o build aceitou dois arquivos com o mesmo endereço")
    except ErroDeConteudo as e:
        checar("já é usado" in str(e), "slug repetido em duas matérias é recusado", str(e))
finally:
    shutil.rmtree(TEMP, ignore_errors=True)

# ---------------------------------------------------------------------------
print("\n2. Agendamento — o que está no futuro não pode vazar para o ar")
# ---------------------------------------------------------------------------

futuro = (datetime.now(BRASILIA) + timedelta(days=3)).isoformat()
passado = (datetime.now(BRASILIA) - timedelta(hours=2)).isoformat()

TEMP.mkdir(parents=True, exist_ok=True)
try:
    (TEMP / "agendada.md").write_text(
        CABECALHO_BOM.replace("status: publicado", f"status: agendado\nagendado_para: {futuro}")
                     .replace("titulo: Matéria de teste", "titulo: Ainda nao saiu"),
        encoding="utf-8")
    c = Construtor(dev=False, rascunhos=False)
    checar(all(a["slug"] != "ainda-nao-saiu" for a in c.publicados),
           "matéria agendada para o futuro fica fora do ar",
           f"vazou: {[a['slug'] for a in c.publicados]}")

    (TEMP / "agendada.md").write_text(
        CABECALHO_BOM.replace("status: publicado", f"status: agendado\nagendado_para: {passado}")
                     .replace("titulo: Matéria de teste", "titulo: Ja passou da hora"),
        encoding="utf-8")
    c = Construtor(dev=False, rascunhos=False)
    checar(any(a["slug"] == "ja-passou-da-hora" for a in c.publicados),
           "matéria agendada com hora vencida entra no ar",
           "não entrou")

    (TEMP / "agendada.md").write_text(
        CABECALHO_BOM.replace("status: publicado", "status: rascunho")
                     .replace("titulo: Matéria de teste", "titulo: Rascunho secreto"),
        encoding="utf-8")
    c = Construtor(dev=False, rascunhos=False)
    checar(all(a["slug"] != "rascunho-secreto" for a in c.publicados),
           "rascunho não é publicado", "vazou para o ar")
finally:
    shutil.rmtree(TEMP, ignore_errors=True)

# ---------------------------------------------------------------------------
print("\n3. Slug")
# ---------------------------------------------------------------------------

checar(escorregar("Ação, coração & cia!") == "acao-coracao-cia",
       "slug tira acento e pontuação", escorregar("Ação, coração & cia!"))
checar(escorregar("1º de setembro") == "1o-de-setembro",
       "slug trata ordinal", escorregar("1º de setembro"))

# ---------------------------------------------------------------------------
print("\n4. Geração — o site que sai do build")
# ---------------------------------------------------------------------------

c = Construtor(dev=False, rascunhos=False).construir()
paginas = sorted(SAIDA.rglob("*.html"))
checar(len(paginas) > 0, "o build escreveu páginas", "nenhuma página gerada")
checar((SAIDA / "index.html").exists(), "a home do blog existe")
checar((SAIDA / "feed.xml").exists(), "o feed RSS existe")
checar((SAIDA / "feed.xsl").exists(), "o feed RSS tem apresentação para navegadores")
checar((SAIDA / "interacoes.js").exists(), "o JavaScript de interações foi copiado")
checar((SAIDA / "sitemap.xml").exists(), "o sitemap do blog existe")
checar((SAIDA / "sitemap-noticias.xml").exists(), "o sitemap de notícias existe")
checar((RAIZ / "robots.txt").exists(), "o robots.txt da raiz existe")
checar((RAIZ / "sitemap.xml").exists(), "o sitemap da raiz existe")
checar((SAIDA / "blog.css").exists(), "o CSS do blog foi copiado")

for relativo in ("index.html", "sobre.html", "turbo-race/index.html",
                 "sky-vanguard/index.html", "sugar-strike/index.html"):
    pagina_principal = (RAIZ / relativo).read_text(encoding="utf-8")
    checar('rel="canonical"' in pagina_principal,
           f"{relativo} tem endereço canonical")
    checar('type="application/ld+json"' in pagina_principal,
           f"{relativo} tem dados estruturados")
    checar('property="og:image"' in pagina_principal,
           f"{relativo} tem imagem social")

textos = {p: p.read_text(encoding="utf-8") for p in paginas}

escapadas = [p.relative_to(RAIZ).as_posix() for p, t in textos.items() if "&lt;p&gt;" in t]
checar(not escapadas, "nenhuma página mostra tag HTML escapada na tela",
       f"páginas com texto escapado: {escapadas[:3]}")

ruins = []
for p, t in textos.items():
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', t, re.S):
        try:
            json.loads(m.group(1))
        except Exception as e:
            ruins.append(f"{p.name}: {e}")
checar(not ruins, "todo dado estruturado é JSON válido", str(ruins[:2]))

sem_titulo = [p.name for p, t in textos.items() if "<title>" not in t]
checar(not sem_titulo, "toda página tem <title>", str(sem_titulo[:3]))

sem_desc = [p.name for p, t in textos.items()
            if 'name="description"' not in t and "redirect" not in t
            and 'http-equiv="refresh"' not in t]
checar(not sem_desc, "toda página tem meta description", str(sem_desc[:3]))

sem_canonical = [p.name for p, t in textos.items() if 'rel="canonical"' not in t]
checar(not sem_canonical, "toda página tem canonical", str(sem_canonical[:3]))

sem_lang = [p.name for p, t in textos.items() if 'lang="pt-BR"' not in t]
checar(not sem_lang, "toda página declara o idioma", str(sem_lang[:3]))

muitos_h1 = [p.name for p, t in textos.items() if t.count("<h1") > 1]
checar(not muitos_h1, "nenhuma página tem mais de um <h1>", str(muitos_h1[:3]))

sem_pular = [p.name for p, t in textos.items()
             if "pular-para-conteudo" not in t and 'http-equiv="refresh"' not in t]
checar(not sem_pular, "toda página tem link de pular para o conteúdo", str(sem_pular[:3]))

sem_alt = []
for p, t in textos.items():
    for tag in re.findall(r"<img[^>]*>", t):
        if "alt=" not in tag:
            sem_alt.append(f"{p.name}: {tag[:60]}")
checar(not sem_alt, "toda imagem tem atributo alt", str(sem_alt[:3]))

noindex_nofollow = [p.name for p, t in textos.items() if 'content="noindex, nofollow"' in t]
checar(not noindex_nofollow, "páginas fora do índice ainda permitem seguir links",
       str(noindex_nofollow[:3]))

# ---------------------------------------------------------------------------
print("\n5. Matérias publicadas")
# ---------------------------------------------------------------------------

home_blog = (SAIDA / "index.html").read_text(encoding="utf-8")
checar('data-interacoes="blog"' in home_blog, "a home do blog tem curtidas e comentários")
checar('data-compartilhar-nativo' in home_blog, "a home do blog tem compartilhamento")

for a in c.publicados:
    pagina = SAIDA / a["slug"] / "index.html"
    checar(pagina.exists(), f"a página de “{a['slug']}” foi gerada")
    t = textos.get(pagina, "")
    checar("Fontes consultadas" in t, f"“{a['slug']}” lista as fontes no fim")
    checar(a["capa"]["credito"] in t, f"“{a['slug']}” mostra o crédito da imagem")
    checar('class="migalhas"' in t, f"“{a['slug']}” tem breadcrumbs")
    checar(f'data-interacoes="noticia:{a["slug"]}"' in t,
           f"“{a['slug']}” tem curtidas e comentários")
    checar('data-compartilhar-nativo' in t, f"“{a['slug']}” tem compartilhamento")
    if a["confiabilidade"] == "rumor":
        checar("aviso rumor" in t, f"“{a['slug']}” avisa que é rumor")

# ---------------------------------------------------------------------------
print("\n6. Imagens e links internos existem de verdade")
# ---------------------------------------------------------------------------

def existe_no_site(caminho: str) -> bool:
    caminho = caminho.split("#")[0].split("?")[0]
    if not caminho.startswith("/"):
        return True
    alvo = RAIZ / caminho.lstrip("/")
    if alvo.is_dir():
        return (alvo / "index.html").exists()
    if caminho.endswith("/"):
        return (alvo / "index.html").exists()
    return alvo.exists()

faltando_img = set()
for p, t in textos.items():
    for src in re.findall(r'<img[^>]+src="([^"]+)"', t):
        if src.startswith("/") and not existe_no_site(src):
            faltando_img.add(src)
checar(not faltando_img, "toda imagem referenciada existe no disco", str(sorted(faltando_img)[:4]))

quebrados = set()
for p, t in textos.items():
    for href in re.findall(r'href="(/[^"]*)"', t):
        if href.startswith("/blog/busca/?") or href.startswith("mailto"):
            continue
        if not existe_no_site(href):
            quebrados.add(href)
checar(not quebrados, "nenhum link interno aponta para página inexistente",
       str(sorted(quebrados)[:5]))

# ---------------------------------------------------------------------------
print("\n7. Arquivos para robôs")
# ---------------------------------------------------------------------------

from xml.etree import ElementTree as ET  # noqa: E402

for arq in ("feed.xml", "sitemap.xml", "sitemap-noticias.xml"):
    try:
        ET.fromstring((SAIDA / arq).read_text(encoding="utf-8"))
        checar(True, f"{arq} é XML válido")
    except Exception as e:
        checar(False, f"{arq} é XML válido", str(e))

feed = (SAIDA / "feed.xml").read_text(encoding="utf-8")
checar('xml-stylesheet type="text/xsl" href="/blog/feed.xsl"' in feed,
       "o feed aponta para sua apresentação visual")
apresentacao_feed = (SAIDA / "feed.xsl").read_text(encoding="utf-8")
checar('href="https://feedly.com/i/discover"' in apresentacao_feed,
       "o botão abre a página funcional de fontes do Feedly")
checar(feed.count("<item>") == min(30, len(c.publicados)),
       "o feed traz todas as matérias publicadas",
       f"{feed.count('<item>')} itens para {len(c.publicados)} matérias")

noticias = (SAIDA / "sitemap-noticias.xml").read_text(encoding="utf-8")
sitemap = (SAIDA / "sitemap.xml").read_text(encoding="utf-8")
checar(sitemap.count("<image:image>") == len(c.publicados),
       "o sitemap descreve a capa de toda matéria",
       f"{sitemap.count('<image:image>')} imagens para {len(c.publicados)} matérias")
limite = datetime.now(BRASILIA) - timedelta(hours=48)
esperadas = sum(1 for a in c.publicados if a["publicado"] >= limite)
checar(noticias.count("<url>") == esperadas,
       "o sitemap de notícias só tem matéria das últimas 48h",
       f"{noticias.count('<url>')} para {esperadas} esperadas")

robots = (RAIZ / "robots.txt").read_text(encoding="utf-8")
checar("Sitemap:" in robots, "o robots.txt aponta os sitemaps")
checar("Disallow: /conteudo/" in robots, "o robots.txt esconde a pasta de conteúdo")

indice = json.loads((SAIDA / "indice-busca.json").read_text(encoding="utf-8"))
checar(len(indice) == len(c.publicados), "o índice de busca tem todas as matérias",
       f"{len(indice)} para {len(c.publicados)}")
checar(all(u["url"].startswith("/blog/") for u in indice),
       "todo item do índice de busca aponta para o blog")
pagina_inicial = (SAIDA / "index.html").read_text(encoding="utf-8")
checar('class="busca-cabecalho"' in pagina_inicial and
       'action="/blog/busca/"' in pagina_inicial and
       'name="q"' in pagina_inicial,
       "o cabeçalho oferece busca acessível em todas as páginas")

# ---------------------------------------------------------------------------
print("\n8. Anúncios")
# ---------------------------------------------------------------------------

cfg = c.cfg["anuncios"]
home = (SAIDA / "index.html").read_text(encoding="utf-8")
if cfg["ativos"] and cfg["lateral_topo"]:
    checar('data-ad-slot="%s"' % cfg["lateral_topo"] in home,
           "o anúncio lateral aparece na home")
    checar(home.count("adsbygoogle.js") == 1,
           "o script do AdSense é carregado uma vez só",
           f"{home.count('adsbygoogle.js')} vezes")
vazios = [p.name for p, t in textos.items() if 'data-ad-slot=""' in t]
checar(not vazios, "nenhum bloco de anúncio sai com slot vazio", str(vazios[:3]))
css_blog = (SAIDA / "blog.css").read_text(encoding="utf-8")
checar(".publicidade:not(.lateral) .adsbygoogle" in css_blog and "width: 100%" in css_blog,
       "anúncios responsivos nunca ficam com largura zero")

com_video = [a for a in c.publicados if a.get("video")]
checar(bool(com_video), "há matérias com vídeo oficial incorporado")
for a in com_video:
    pagina_video = (SAIDA / a["slug"] / "index.html").read_text(encoding="utf-8")
    checar(f'data-youtube-id="{a["video"]["youtube_id"]}"' in pagina_video,
           f'“{a["slug"]}” oferece reprodução do vídeo na própria página')
    checar("youtube-nocookie.com/embed/" in pagina_video and '"@type":"VideoObject"' in pagina_video,
           f'“{a["slug"]}” usa player privativo e dados estruturados de vídeo')

# ---------------------------------------------------------------------------
print("\n9. Endereços antigos")
# ---------------------------------------------------------------------------

com_antigos = [a for a in c.publicados if a["slugs_antigos"]]
if com_antigos:
    for a in com_antigos:
        for antigo in a["slugs_antigos"]:
            p = SAIDA / antigo / "index.html"
            checar(p.exists() and "canonical" in p.read_text(encoding="utf-8"),
                   f"o endereço antigo “{antigo}” redireciona com canonical")
else:
    print("  --   nenhuma matéria trocou de endereço ainda (nada a testar)")

# ---------------------------------------------------------------------------
print()
if falhas:
    print(f"{passou} testes passaram, {len(falhas)} FALHARAM:\n")
    for f in falhas:
        print("  -", f)
    sys.exit(1)
print(f"{passou} testes passaram. Nada quebrado.")
