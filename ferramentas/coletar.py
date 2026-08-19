# -*- coding: utf-8 -*-
"""
Coletor de pautas do blog da VM Games.

Lê os feeds cadastrados em conteudo/fontes.json, junta o que fala do mesmo
assunto e devolve uma lista de pautas ordenada por quanto a informação está
confirmada. NÃO escreve matéria e NÃO copia texto: guarda título, link, data,
veículo e um resumo curto, que é o material a partir do qual a matéria é
escrita depois, com texto próprio.

Regras que o coletor aplica sozinho:
  - conteudo/automacao.json com "ativa": false desliga tudo na hora;
  - robots.txt de cada domínio é consultado e obedecido;
  - assunto que já virou matéria não volta (dedupe por hash e por título);
  - 1 fonte primária OU 2 secundárias independentes = "confirmado";
    1 secundária sozinha = "rumor", e a matéria sai marcada como tal.

Uso:
    python ferramentas/coletar.py                  # mostra as pautas
    python ferramentas/coletar.py --quantas 8
    python ferramentas/coletar.py --categoria xbox
    python ferramentas/coletar.py --json pautas.json
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import json
import re
import sys
import unicodedata
import urllib.robotparser as robots
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from lxml import etree

RAIZ = Path(__file__).resolve().parent.parent
CONTEUDO = RAIZ / "conteudo"
DADOS = RAIZ / "ferramentas" / "dados"
BRASILIA = timezone(timedelta(hours=-3))

NS = {"a": "http://www.w3.org/2005/Atom",
      "dc": "http://purl.org/dc/elements/1.1/",
      "media": "http://search.yahoo.com/mrss/"}

# Palavras que não ajudam a identificar do que a notícia trata.
VAZIAS = set("""a o e de da do das dos em no na nos nas um uma para por com que se
ao aos as os pela pelo the of and to in on for is are with new this his her its
you your are was were será vai novo nova mais menos como sobre já ainda todos
tudo depois antes agora hoje ontem game games jogo jogos""".split())


def sem_acento(t: str) -> str:
    t = unicodedata.normalize("NFD", t.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def fichas(titulo: str) -> set:
    """Palavras que valem para comparar dois títulos."""
    palavras = re.findall(r"[a-z0-9]+", sem_acento(titulo))
    return {p for p in palavras if len(p) > 2 and p not in VAZIAS}


def parecidos(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


class Coletor:
    def __init__(self, verboso: bool = True):
        self.cfg = json.loads((CONTEUDO / "automacao.json").read_text(encoding="utf-8"))
        self.fontes = json.loads((CONTEUDO / "fontes.json").read_text(encoding="utf-8"))
        self.verboso = verboso
        self.ua = self.cfg.get("user_agent", "VMGamesBot/1.0")
        self.robos: dict[str, robots.RobotFileParser] = {}
        DADOS.mkdir(parents=True, exist_ok=True)
        self.arquivo_vistos = DADOS / "vistos.json"
        self.vistos = json.loads(self.arquivo_vistos.read_text(encoding="utf-8")) \
            if self.arquivo_vistos.exists() else {}

    # ---------- travas ----------

    def ligada(self) -> bool:
        return bool(self.cfg.get("ativa"))

    def pode_buscar(self, url: str) -> bool:
        """
        Respeita robots.txt seguindo a RFC 9309, que é onde a regra está escrita:

          200        -> vale o que o arquivo disser
          401 / 403  -> proibido tudo
          outros 4xx -> liberado (é o caso do 404: o site não tem robots.txt)
          5xx / erro -> proibido, por precaução

        Não dá para usar RobotFileParser.read() direto: ele busca com o
        User-Agent do urllib, que vários sites respondem com 403, e qualquer
        falha de leitura faz can_fetch() devolver False. O resultado era o
        coletor "obedecer" a bloqueios que não existiam.
        """
        p = urlparse(url)
        dominio = p.netloc
        if dominio not in self.robos:
            endereco = f"{p.scheme}://{dominio}/robots.txt"
            rp = robots.RobotFileParser()
            rp.set_url(endereco)
            try:
                r = requests.get(endereco, timeout=15, headers={"User-Agent": self.ua})
                if r.status_code == 200:
                    rp.parse(r.text.splitlines())
                elif r.status_code in (401, 403):
                    rp.disallow_all = True
                elif 400 <= r.status_code < 500:
                    rp.allow_all = True
                else:
                    rp.disallow_all = True
            except Exception:
                rp.disallow_all = True
            self.robos[dominio] = rp
        return self.robos[dominio].can_fetch(self.ua, url)

    # ---------- leitura ----------

    def baixar(self, url: str):
        if not self.pode_buscar(url):
            return None, "robots.txt proíbe"
        try:
            r = requests.get(url, timeout=25, headers={
                "User-Agent": self.ua,
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*",
            })
            if r.status_code != 200:
                return None, f"HTTP {r.status_code}"
            return r, None
        except Exception as e:
            return None, type(e).__name__

    @staticmethod
    def _data(texto: str | None):
        if not texto:
            return None
        texto = texto.strip()
        for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
                    "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
            try:
                d = datetime.strptime(texto.replace("GMT", "+0000"), fmt)
                if d.tzinfo is None:
                    d = d.replace(tzinfo=timezone.utc)
                return d.astimezone(BRASILIA)
            except ValueError:
                continue
        try:
            d = datetime.fromisoformat(texto.replace("Z", "+00:00"))
            return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(BRASILIA)
        except ValueError:
            return None

    @staticmethod
    def _limpar(texto: str, limite: int = 320) -> str:
        t = re.sub(r"<[^>]+>", " ", texto or "")
        t = re.sub(r"&[a-z]+;|&#\d+;", " ", t)
        t = re.sub(r"\s+", " ", t).strip()
        return t[:limite]

    def ler_feed(self, fonte: dict):
        url = fonte.get("feed")
        if not url:
            return []
        r, erro = self.baixar(url)
        if erro:
            if self.verboso:
                print(f"  ! {fonte['nome']}: {erro}", file=sys.stderr)
            return []
        try:
            raiz = etree.fromstring(r.content)
        except Exception:
            return []

        itens = raiz.findall(".//item")
        atom = False
        if not itens:
            itens = raiz.findall(".//a:entry", NS)
            atom = True

        saida = []
        for it in itens[:30]:
            if atom:
                titulo = (it.findtext("a:title", namespaces=NS) or "").strip()
                link_el = it.find("a:link", NS)
                link = link_el.get("href") if link_el is not None else ""
                data = self._data(it.findtext("a:updated", namespaces=NS)
                                  or it.findtext("a:published", namespaces=NS))
                resumo = self._limpar(it.findtext("a:summary", namespaces=NS)
                                      or it.findtext("a:content", namespaces=NS) or "")
                autor = it.findtext("a:author/a:name", namespaces=NS)
            else:
                titulo = (it.findtext("title") or "").strip()
                link = (it.findtext("link") or "").strip()
                data = self._data(it.findtext("pubDate"))
                resumo = self._limpar(it.findtext("description") or "")
                autor = it.findtext("dc:creator", namespaces=NS)
            if not titulo or not link:
                continue
            saida.append({
                "titulo": titulo,
                "link": link,
                "data": data,
                "resumo": resumo,
                "autor": (autor or "").strip() or None,
                "fonte": fonte["slug"],
                "veiculo": fonte["nome"],
                "tipo": fonte["tipo"],
                "idioma": fonte.get("idioma", "en"),
                "categoria": fonte.get("categoria_padrao", "noticias"),
                "hash": hashlib.sha256(link.encode("utf-8")).hexdigest()[:16],
                "fichas": fichas(titulo),
            })
        return saida

    def coletar(self, horas: int = 48):
        if not self.ligada():
            print("automação DESLIGADA em conteudo/automacao.json — nada foi buscado.")
            return []
        limite = datetime.now(BRASILIA) - timedelta(hours=horas)
        tudo = []
        with cf.ThreadPoolExecutor(max_workers=8) as ex:
            for lote in ex.map(self.ler_feed, self.fontes):
                tudo.extend(lote)
        recentes = [i for i in tudo if i["data"] is None or i["data"] >= limite]
        if self.verboso:
            print(f"  {len(tudo)} itens lidos, {len(recentes)} dentro de {horas}h")
        return recentes

    # ---------- agrupar por assunto ----------

    def agrupar(self, itens):
        # Palavra que aparece na coleta inteira não identifica assunto nenhum:
        # num dia de notícia de Switch, "nintendo" e "switch" estão em tudo.
        frequencia: dict[str, int] = {}
        for it in itens:
            for p in it["fichas"]:
                frequencia[p] = frequencia.get(p, 0) + 1
        teto = max(2, len(itens) // 40)

        grupos = []
        for it in sorted(itens, key=lambda x: (x["tipo"] != "primaria", x["data"] or datetime.min.replace(tzinfo=BRASILIA))):
            achou = None
            for g in grupos:
                # Compara com o núcleo (o primeiro item do grupo), não com a soma
                # de todos: senão o grupo vai engordando de palavra e passa a
                # atrair notícia que não tem nada a ver.
                comuns = it["fichas"] & g["nucleo"]
                # A mesma notícia em dois idiomas quase não repete palavra, mas
                # repete o nome próprio: "The Sinking City 2" sai igual em
                # inglês, espanhol e português. Dois nomes raros em comum bastam.
                raros = [p for p in comuns if len(p) >= 6 and frequencia.get(p, 0) <= teto]
                if parecidos(it["fichas"], g["nucleo"]) >= 0.42 or len(raros) >= 2:
                    achou = g
                    break
            if achou:
                achou["itens"].append(it)
                achou["fichas"] |= it["fichas"]
            else:
                grupos.append({"nucleo": set(it["fichas"]),
                               "fichas": set(it["fichas"]), "itens": [it]})

        pautas = []
        for g in grupos:
            veiculos = {i["fonte"] for i in g["itens"]}
            primarias = [i for i in g["itens"] if i["tipo"] == "primaria"]
            secundarias = [i for i in g["itens"] if i["tipo"] == "secundaria"]
            confirmado = bool(primarias) or len({i["fonte"] for i in secundarias}) >= 2
            principal = (primarias or g["itens"])[0]
            datas = [i["data"] for i in g["itens"] if i["data"]]
            pautas.append({
                "assunto": principal["titulo"],
                "categoria": principal["categoria"],
                "confiabilidade": "confirmado" if confirmado else "rumor",
                "tem_primaria": bool(primarias),
                "fontes_distintas": len(veiculos),
                "quando": max(datas).isoformat() if datas else None,
                "itens": [{k: v for k, v in i.items() if k != "fichas"} |
                          {"data": i["data"].isoformat() if i["data"] else None}
                          for i in g["itens"]],
                "chave": hashlib.sha256(
                    " ".join(sorted(g["fichas"])).encode("utf-8")).hexdigest()[:16],
            })
        pautas.sort(key=lambda p: (p["confiabilidade"] == "rumor",
                                   -p["fontes_distintas"],
                                   -(p["tem_primaria"])))
        return self.variar(pautas)

    @staticmethod
    def variar(pautas):
        """Intercala categorias. Sem isso o PlayStation Blog, que publica muito,
        toma a lista inteira e o resto do mundo dos games some da pauta."""
        por_cat: dict[str, list] = {}
        for p in pautas:
            por_cat.setdefault(p["categoria"], []).append(p)
        saida, restam = [], True
        while restam:
            restam = False
            for cat in list(por_cat):
                if por_cat[cat]:
                    saida.append(por_cat[cat].pop(0))
                    restam = restam or bool(por_cat[cat])
        return saida

    # ---------- antiduplicata ----------

    def ja_publicado(self):
        """Títulos e links que já viraram matéria — evita repetir assunto."""
        assinaturas, links = [], set()
        for arq in (CONTEUDO / "artigos").rglob("*.md"):
            texto = arq.read_text(encoding="utf-8")
            for m in re.finditer(r"^\s*titulo:\s*(.+)$", texto, re.M):
                assinaturas.append(fichas(m.group(1).strip().strip("\"'")))
            for m in re.finditer(r"url:\s*(https?://\S+)", texto):
                links.add(m.group(1).strip())
        return assinaturas, links

    def filtrar_novidades(self, pautas):
        assinaturas, links = self.ja_publicado()
        novas = []
        for p in pautas:
            if p["chave"] in self.vistos:
                continue
            if any(i["link"] in links for i in p["itens"]):
                continue
            marcas = fichas(p["assunto"])
            if any(parecidos(marcas, a) >= 0.5 for a in assinaturas):
                continue
            novas.append(p)
        return novas

    def marcar_visto(self, chave: str, virou: str = ""):
        self.vistos[chave] = {"quando": datetime.now(BRASILIA).isoformat(), "virou": virou}
        self.arquivo_vistos.write_text(
            json.dumps(self.vistos, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="Coleta pautas para o blog da VM Games.")
    ap.add_argument("--quantas", type=int, default=12)
    ap.add_argument("--horas", type=int, default=48)
    ap.add_argument("--categoria", default=None)
    ap.add_argument("--json", default=None, help="grava as pautas em um arquivo")
    ap.add_argument("--incluir-vistas", action="store_true")
    args = ap.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    c = Coletor()
    itens = c.coletar(args.horas)
    if not itens:
        return 1
    pautas = c.agrupar(itens)
    if not args.incluir_vistas:
        pautas = c.filtrar_novidades(pautas)
    if args.categoria:
        pautas = [p for p in pautas if p["categoria"] == args.categoria]
    pautas = pautas[: args.quantas]

    for n, p in enumerate(pautas, 1):
        marca = "confirmado" if p["confiabilidade"] == "confirmado" else "RUMOR"
        print(f"\n{n}. [{p['categoria']}] {p['assunto']}")
        print(f"   {marca} · {p['fontes_distintas']} fonte(s) · {p['quando'] or 'sem data'}")
        for i in p["itens"][:4]:
            print(f"   - ({i['tipo'][:4]}) {i['veiculo']}: {i['link']}")

    if args.json:
        Path(args.json).write_text(json.dumps(pautas, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\ngravado em {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
