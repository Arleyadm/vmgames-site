# Blog da VM Games — como funciona

O blog é gerado como HTML estático e publicado pelo mesmo GitHub Pages do resto do site.
Não há servidor, banco de dados nem build no navegador: `conteudo/` é a fonte da verdade,
`blog/` é saída descartável, e `git push` publica.

```
conteudo/                     ← fonte (é isto que importa)
  config.json                 nome do site, paginação, slots de anúncio
  categorias.json             as 12 categorias, com cor de cada uma
  autores/*.json              quem assina, com papel (admin | editor | autor)
  fontes.json                 feeds cadastrados, com tipo primária/secundária
  automacao.json              chave geral da automação
  paginas/*.md                política editorial, correções, autores
  artigos/AAAA/MM/*.md        as matérias
  midia/                      imagens (copiadas para /blog/img/)

ferramentas/
  build.py                    gera o blog
  coletar.py                  busca pautas nos feeds
  ler.py                      lê uma fonte para apuração
  capa.py                     desenha a arte de capa da casa
  testes.py                   60 testes
  modelos/                    templates das telas
  estatico/blog.css           o visual do blog

blog/                         ← saída gerada; apagada e refeita a cada build
```

## Comandos

```bash
python ferramentas/build.py           # gera o blog para produção
python ferramentas/build.py --dev     # marca reservas de anúncio na tela
python ferramentas/build.py --rascunhos   # inclui rascunhos, com noindex
python ferramentas/testes.py          # 60 testes; rode antes de publicar
python ferramentas/coletar.py         # lista as pautas do momento
python ferramentas/ler.py URL         # lê uma fonte para conferir os fatos
python ferramentas/capa.py slug categoria   # gera a arte de capa
python ferramentas/capa.py --marca    # logo, imagem OG e avatar
```

Pré-visualizar: alvo `vmgames-blog` no `.claude/launch.json`, porta 8128 →
<http://localhost:8128/blog/>

## Publicar

```bash
python ferramentas/testes.py && python ferramentas/build.py
git add -A && git commit -m "Blog: <o que entrou>" && git push origin main
```

O GitHub Pages republica sozinho, normalmente em menos de 20 segundos.

## Estados de uma matéria

`rascunho` → `revisao` → `aprovado` → `agendado` → `publicado`, com `rejeitado` e
`arquivado` como saídas. **Só `publicado` vai ao ar** — e `agendado` cujo horário já
passou, o que é verificado a cada build.

Como o site é estático, matéria agendada entra no ar no **próximo build**. Se quiser
agendamento sem ninguém na máquina, é preciso um gatilho de hora em hora (GitHub Actions);
hoje isso não está ligado.

## Campos obrigatórios

O build **recusa** e diz o arquivo e o campo quando falta: `titulo`, `resumo`, `categoria`,
`autor`, `status`, `capa.arquivo`, `capa.alt`, `capa.credito`, `capa.licenca`, e pelo menos
uma fonte em matéria publicada. Isso é proposital: é o que impede publicar imagem sem
crédito ou notícia sem origem.

## Automação

`coletar.py` lê os feeds de `fontes.json`, agrupa o que fala do mesmo assunto e classifica:

- **confirmado** — tem fonte primária, ou duas secundárias independentes;
- **rumor** — uma fonte secundária só. A matéria sai com aviso visível.

Ele respeita `robots.txt` (RFC 9309), se identifica com `User-Agent` próprio, e **não
publica nada**: entrega pauta com links. O texto é escrito depois, à mão.

Para desligar tudo: `conteudo/automacao.json` → `"ativa": false`.

Fontes que hoje **bloqueiam** leitura automatizada e por isso ficam fora: IGN, Push Square,
Pure Xbox, Nintendo Life e Canaltech. Não insista nelas — o bloqueio é do robots.txt deles.

## Anúncios

Configurados em `conteudo/config.json` → `anuncios`. Slot vazio **não** gera bloco: quadro
vazio no ar é pior que nenhum quadro.

| Posição | Chave | Situação |
|---|---|---|
| Lateral, topo | `lateral_topo` | usando o bloco 300×600 que já existe |
| Lateral, baixo | `lateral_baixo` | usando o segundo bloco 300×600 |
| Dentro do texto | `no_texto` | **falta criar** — bloco *In-article* no AdSense |
| Entre os cartões | `entre_cards` | **falta criar** — bloco *Display responsivo* |

Anúncios automáticos do Google seguem **desligados** de propósito, para o Google não
injetar peça por conta própria em cima da leitura.

## Rotina de publicação

1. `python ferramentas/coletar.py` — ver o que apareceu.
2. `python ferramentas/ler.py <url>` em cada fonte da pauta escolhida — conferir os fatos.
3. Escrever o `.md` em `conteudo/artigos/AAAA/MM/`, com as fontes e horários de consulta.
4. `python ferramentas/capa.py <slug> <categoria>` — gerar a arte.
5. `python ferramentas/testes.py` — tem que passar.
6. `python ferramentas/build.py` e conferir em <http://localhost:8128/blog/>.
7. `git push`.

## Imagens

Só entra imagem que pode ser publicada: arte própria, press kit, API licenciada ou licença
compatível — e sempre com crédito. Quando não há imagem utilizável, `capa.py` desenha a
arte da casa, assinada "arte ilustrativa", propositalmente abstrata para não ser confundida
com captura de jogo.

## Correções

Acrescente ao cabeçalho da matéria:

```yaml
atualizado_em: 2026-08-20T09:00:00-03:00
correcoes:
  - data: 2026-08-20T09:00:00-03:00
    texto: "O nome do estúdio é Guerrilla Games, e não Guerilla."
```

A correção aparece dentro da matéria e entra sozinha na página `/blog/correcoes.html`.
