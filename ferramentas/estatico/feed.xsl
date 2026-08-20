<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" encoding="UTF-8" doctype-system="about:legacy-compat"/>

  <xsl:template match="/rss/channel">
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title><xsl:value-of select="title"/> — Feed RSS</title>
        <meta name="robots" content="noindex, follow"/>
        <style>
          :root{color-scheme:dark;--fundo:#08060f;--painel:#151126;--borda:#31284d;--texto:#f4f1ff;--fraco:#bdb5d5;--ciano:#00f5ff;--rosa:#ff2daa}
          *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% -20%,#29204d 0,var(--fundo) 42%);color:var(--texto);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
          a{color:var(--ciano)}.topo{border-bottom:1px solid var(--borda);background:rgba(8,6,15,.9)}.envolucro{width:min(900px,calc(100% - 32px));margin:auto}.topo .envolucro{display:flex;align-items:center;justify-content:space-between;padding:20px 0}.marca{font-weight:900;font-size:22px;text-decoration:none}.marca span{color:var(--rosa)}
          main{padding:48px 0 72px}h1{font-size:clamp(2rem,6vw,3.7rem);line-height:1.05;margin:0 0 16px}.intro{color:var(--fraco);font-size:1.1rem;max-width:720px}.caixa{margin:28px 0 42px;padding:22px;border:1px solid var(--borda);border-radius:16px;background:var(--painel)}.endereco{display:block;overflow-wrap:anywhere;padding:12px 14px;border-radius:9px;background:#08060f;color:#fff;font-family:ui-monospace,monospace}.acoes{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.botao{display:inline-block;padding:10px 16px;border-radius:999px;background:linear-gradient(90deg,var(--ciano),#73fff4);color:#08060f;font-weight:800;text-decoration:none}.botao.sec{background:transparent;color:var(--texto);border:1px solid var(--borda)}
          h2{margin-top:42px}.lista{display:grid;gap:14px}.item{display:block;padding:20px;border:1px solid var(--borda);border-radius:14px;background:rgba(21,17,38,.78);text-decoration:none;color:inherit}.item:hover{border-color:var(--ciano);transform:translateY(-1px)}.item h3{margin:0 0 6px;font-size:1.2rem;color:var(--texto)}.item p{margin:8px 0 0;color:var(--fraco)}.data{color:var(--ciano);font-size:.9rem}.rodape{padding:28px 0;border-top:1px solid var(--borda);color:var(--fraco)}
        </style>
      </head>
      <body>
        <header class="topo"><div class="envolucro"><a class="marca" href="/">VM <span>GAMES</span></a><a href="/blog/">Voltar ao blog</a></div></header>
        <main class="envolucro">
          <h1>Feed RSS da VM Games</h1>
          <p class="intro">Este endereço entrega automaticamente as novas matérias da VM Games. Para assinar, copie o link abaixo e cole em um leitor de RSS como Feedly, Inoreader, NewsBlur ou Thunderbird.</p>
          <section class="caixa">
            <strong>Endereço do feed</strong>
            <code class="endereco">https://vmgames.com.br/blog/feed.xml</code>
            <div class="acoes">
              <a class="botao" href="https://feedly.com/i/subscription/feed/https://vmgames.com.br/blog/feed.xml" rel="noopener noreferrer">Assinar no Feedly</a>
              <a class="botao sec" href="/blog/">Ler no site</a>
            </div>
          </section>
          <h2>Matérias mais recentes</h2>
          <div class="lista">
            <xsl:for-each select="item">
              <a class="item" href="{link}">
                <span class="data"><xsl:value-of select="pubDate"/></span>
                <h3><xsl:value-of select="title"/></h3>
                <p><xsl:value-of select="description"/></p>
              </a>
            </xsl:for-each>
          </div>
        </main>
        <footer class="rodape"><div class="envolucro">VM Games — notícias de games com fontes rastreáveis.</div></footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
