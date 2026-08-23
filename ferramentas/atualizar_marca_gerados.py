"""Atualiza somente a marca nos HTML já gerados, sem refazer o conteúdo editorial."""

from pathlib import Path


RAIZ = Path(__file__).resolve().parents[1]
BLOG = RAIZ / "blog"

META_ATUAL = b'<meta name="theme-color" content="#08060f">'
META_NOVA = META_ATUAL + (
    b'\n<link rel="icon" type="image/png" sizes="512x512" '
    b'href="/blog/img/vmgames-icone.png">'
    b'\n<link rel="apple-touch-icon" sizes="192x192" '
    b'href="/blog/img/marca/icone-192.png">'
)

MARCA_ATUAL = (
    b'<a class="marca" href="/"><span class="vm">VM</span> '
    b'<span class="games">GAMES</span></a>'
)
MARCA_NOVA = (
    b'<a class="marca" href="/" aria-label="VM Games \xe2\x80\x94 p\xc3\xa1gina inicial">\n'
    b'      <img src="/blog/img/vmgames-assinatura-horizontal.webp" '
    b'width="410" height="100" alt="VM Games Studio">\n'
    b'    </a>'
)


def main() -> None:
    atualizados = 0
    ignorados: list[str] = []
    for pagina in BLOG.rglob("*.html"):
        dados = pagina.read_bytes()
        if b'/estilo.css?v=20260820-2' in dados:
            dados = dados.replace(
                b'/estilo.css?v=20260820-2', b'/estilo.css?v=20260823-1', 1
            )
            pagina.write_bytes(dados)
            atualizados += 1
        if b'width="300" height="60" alt="VM Games Studio"' in dados:
            pagina.write_bytes(
                dados.replace(
                    b'width="300" height="60" alt="VM Games Studio"',
                    b'width="410" height="100" alt="VM Games Studio"',
                    1,
                )
            )
            atualizados += 1
            continue
        if META_ATUAL not in dados or MARCA_ATUAL not in dados:
            ignorados.append(str(pagina.relative_to(RAIZ)))
            continue
        pagina.write_bytes(
            dados.replace(META_ATUAL, META_NOVA, 1).replace(MARCA_ATUAL, MARCA_NOVA, 1)
        )
        atualizados += 1

    print(f"Marca atualizada em {atualizados} páginas.")
    if ignorados:
        print(f"Páginas ignoradas: {len(ignorados)}")


if __name__ == "__main__":
    main()
