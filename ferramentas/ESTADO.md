# Estado do blog da VM Games — passagem de bastão

**Escrito em 19/08/2026.** Documento de continuidade: serve para qualquer pessoa ou
assistente que pegue este projeto do zero, sem ter acompanhado a conversa em que ele foi
feito. O manual de operação é o [LEIAME.md](LEIAME.md) — aqui está o **estado**, as
**decisões** e o **que falta**.

---

## 1. Em uma frase

O blog editorial de games da VM Games está **no ar** em <https://vmgames.com.br/blog/>,
com três matérias reais publicadas, gerado por um gerador estático próprio em Python e
publicado pelo GitHub Pages junto com o resto do site.

**Último commit:** `2d81952` — "Blog editorial da VM Games: primeiras tres materias no ar".
Árvore limpa, 60 testes passando.

## 2. Onde tudo mora

| O quê | Onde |
|---|---|
| Repositório | `https://github.com/Arleyadm/vmgames-site`, branch `main` |
| Cópia local | `C:\Users\arley\Music\vmgames-site` |
| Publicação | GitHub Pages, `main` / raiz. `git push` publica em ~20 s |
| Domínio | `vmgames.com.br` (Registro.br, DNS apontando para os IPs do Pages) |
| Pré-visualização | alvo `vmgames-blog` no `.claude/launch.json`, porta **8128** |
| Python | Anaconda, `C:\Users\arley\anaconda3\python.exe`. Já tem yaml, jinja2, markdown, bleach, Pillow, lxml, requests, dateutil |

**Não existe Node nem npm nesta máquina.** Não proponha solução que dependa deles.

## 3. Decisões tomadas pelo Arley — não desfazer sem perguntar

1. **Site estático puro, sem framework, sem CDN, sem biblioteca no navegador.** É princípio
   antigo do site (está escrito no topo do `estilo.css`): quem visita não fala com nenhum
   terceiro além do GitHub. O blog seguiu a mesma regra.
2. **Um repositório só**, o público `vmgames-site`. Ele não quis criar repositório separado
   para o conteúdo. Consequência aceita e conhecida: os `.md` de rascunho ficam legíveis por
   quem procurar no repositório; o `robots.txt` só impede indexação.
3. **Coleta de notícia sob demanda, não robô agendado.** O gatilho é ele falar com o
   assistente. Não há GitHub Actions configurado, de propósito.
4. **Anúncios do AdSense nas duas laterais e dentro do texto** — pedido explícito dele.
5. **HTML gerado, não montado por JavaScript.** Notícia precisa chegar pronta no HTML, por
   causa de indexação rápida, Google News e leitura em internet ruim.

## 4. O combinado de trabalho

Quando o Arley disser **"poste 3 matérias"**, a rodada inteira é feita por quem estiver
atendendo, sem ele digitar mais nada:

1. `python ferramentas/coletar.py` — ver as pautas do momento.
2. `python ferramentas/ler.py <url>` em **cada** fonte da pauta escolhida — conferir os
   fatos na fonte, não no resumo do feed.
3. Escrever o `.md` em `conteudo/artigos/AAAA/MM/`, em português do Brasil, com fontes e
   horários de consulta reais.
4. `python ferramentas/capa.py <slug> <categoria>` — gerar a arte.
5. `python ferramentas/testes.py` — tem que passar.
6. `python ferramentas/build.py` e conferir a página.
7. `git add -A && git commit && git push origin main`.

Ele espera **design, texto e imagem** prontos. Não devolva pauta para ele escrever.

## 5. Regras editoriais que o código faz cumprir

O `build.py` **recusa a geração** (não avisa: recusa) quando falta título, resumo,
categoria, autor, status, arquivo de capa, texto alternativo, crédito da imagem, licença da
imagem, ou quando matéria publicada não tem nenhuma fonte. Isso é proposital — é o que
impede publicar imagem sem crédito ou notícia sem origem.

Regras que dependem de quem escreve:

- **Nunca inventar** fato, número, data, citação ou fonte.
- **1 fonte primária ou 2 secundárias independentes** para tratar algo como confirmado.
  Repercussão de uma apuração única (vários sites citando a mesma Bloomberg, por exemplo)
  **não** são fontes independentes — e isso deve ser dito no texto.
- Informação não oficial vai com `confiabilidade: rumor`, o que aciona sozinho o aviso no
  topo da matéria e o selo nas listagens.
- **Não copiar texto.** Citação direta, curta, entre aspas e atribuída; tradução
  identificada como tradução.
- **Erro em fonte não se repete.** Exemplo real: a GamesIndustry.biz escreveu que a Sony
  comprou a Bungie por "US$ 3,6 milhões" (foi bilhões). A matéria simplesmente não citou o
  valor.
- Imagem só de press kit, API licenciada, arte própria ou licença compatível. Sem isso,
  `capa.py` desenha a arte da casa, marcada "arte ilustrativa".

## 6. Armadilhas que já custaram tempo

1. **Autoescape do Jinja destrói o conteúdo.** O corpo da matéria e o JSON-LD precisam de
   `|safe` nos templates. Sem isso, o texto sai com as tags visíveis na tela e o Google
   recebe JSON inválido. É seguro porque o corpo passa por `bleach.clean()` com lista
   fechada de tags, e o JSON-LD sai de `json_para_script()` com `<`, `>` e `&` virados em
   `\uXXXX`. **Já quebrou uma vez, em produção zero, pego por inspeção.**
2. **`RobotFileParser.read()` do Python mente.** Ele busca o `robots.txt` com o User-Agent
   do urllib, que muitos sites respondem com 403, e devolve `can_fetch=False` em *qualquer*
   falha de leitura. Isso fez o coletor "obedecer" bloqueios inexistentes e derrubou o Xbox
   Wire Brasil, que é a única fonte oficial em português. A regra correta (RFC 9309) está
   implementada em `coletar.py::pode_buscar`. **Não voltar para `rp.read()`.**
3. **O console do Windows quebra acento em `print`.** Todo script que imprime precisa de
   `sys.stdout.reconfigure(encoding="utf-8")`. O arquivo em disco está certo mesmo quando a
   tela mostra lixo — conferir com `od -c` antes de sair consertando o que não está quebrado.
4. **Nunca usar `Set-Content` / `Out-File` do PowerShell** em arquivo de código: corrompe
   acento. Usar as ferramentas de edição ou heredoc no bash.
5. **`sugar-strike/jogar/` é área proibida.** É cópia byte a byte dos assets do app Android
   e é carregada dentro do WebView. Não tem barra de navegação, não recebe link do blog e
   **não pode receber AdSense**.
6. **`ads.txt` e `app-ads.txt` não se tocam.** Estão fixados como LF no `.gitattributes` e
   sustentam a receita do AdMob e do AdSense.
7. **Agrupar notícia por palavra em comum erra feio.** "Nintendo" e "Switch" bastavam para
   juntar duas notícias sem relação nenhuma, o que inflava a contagem de fontes e podia
   promover rumor a confirmado. Hoje a comparação é contra o núcleo do grupo e só vale
   palavra rara (≥6 letras, pouco frequente na coleta).

## 7. O que falta

Em ordem do que rende mais:

1. **Dois blocos de anúncio no AdSense** — um *In-article* e um *Display responsivo*. Só o
   Arley pode criar. Preencher `no_texto` e `entre_cards` em `conteudo/config.json`.
   Enquanto vazios, esses espaços não aparecem (de propósito).
2. **Search Console.** O domínio `vmgames.com.br` está verificado e a propriedade já
   registra dados. Em 23/08/2026, a tela de Sitemaps ainda mostrava zero envios; cadastrar
   `https://vmgames.com.br/sitemap.xml` é a única etapa pendente no painel.
3. **Conferência visual.** O painel do navegador estava fechado, então nada foi verificado
   por captura de tela — só por estrutura, medida e teste. É a primeira coisa a fazer com
   o painel aberto: home, matéria e celular.
4. **Painel administrativo.** Todo o miolo existe (estados, agendamento, correções,
   histórico via git, papéis nos autores); falta a interface web local. Deve rodar preso a
   `127.0.0.1`, com senha e os papéis `autor` / `editor` / `admin`.
5. **Publicação de matéria agendada.** Como o site é estático, `agendado` só entra no ar no
   próximo build. Automatizar exigiria um gatilho de hora em hora no GitHub Actions — hoje
   não existe.
6. **"Recomendadas" vira "Mais lidas"** só quando houver contagem real de leitura. Hoje o
   bloco é escolha editorial (`recomendada: true`) ou as mais recentes. Não renomear sem
   ter número de verdade.
7. **Newsletter.** Site estático não guarda e-mail. Hoje existe RSS. Newsletter de verdade
   exige serviço externo e cria obrigação de LGPD — decidir com o Arley antes.

## 8. Fontes que bloqueiam leitura automatizada

Confirmado no `robots.txt` de cada uma, em 19/08/2026: **IGN, Push Square, Pure Xbox,
Nintendo Life e Canaltech**. Estão cadastradas em `fontes.json` mas o coletor as pula. Não
insistir — o bloqueio é legítimo e deve ser respeitado.

Fontes que funcionam bem hoje: PlayStation Blog (inglês e espanhol), **Xbox Wire Brasil**
(oficial em português), Xbox Wire, Steam, Epic, blog do Google Play, Eurogamer, PC Gamer,
Polygon, GameSpot, Rock Paper Shotgun, VG247, GamesIndustry.biz, Adrenaline, Nintendo Blast
e Xbox Power.

A Nintendo **não tem feed oficial funcionando** — para assunto de Nintendo, exigir duas
fontes secundárias.

## 8.1 Identidade visual e imagens

- O novo kit oficial da VM Games foi fornecido por Arley em 23/08/2026. A assinatura
  horizontal fica no cabeçalho; ícone, logo para dados estruturados, OG padrão e as nove
  variações otimizadas ficam em `conteudo/midia/`. Consulte `ferramentas/MARCA.md`.
- As artes da marca, mesmo quando produzidas com IA, só podem ser usadas como identidade
  institucional autorizada. A regra editorial permanece: reportagem usa apenas imagem
  real/oficial, com fonte e crédito; nunca imagem gerada por IA como fato jornalístico.
- Para Discover, preservar `max-image-preview:large`, capas com ao menos 1200 px, crédito,
  `sitemap-noticias.xml` e títulos diretos. Não prometer indexação ou posição no Google.

## 9. Como conferir se está tudo de pé

```bash
python ferramentas/testes.py          # 60 testes
curl -s -o /dev/null -w "%{http_code}" https://vmgames.com.br/blog/
curl -s https://vmgames.com.br/ads.txt   # tem que continuar igual
```
