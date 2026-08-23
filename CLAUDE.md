# Memória do projeto — Turbo Race no navegador

Atualizado em: 22 de agosto de 2026  
Estado público validado: `20260822-03`  
Último commit antes deste documento: `a7a0a65`

## Objetivo e preferência do responsável

Este repositório contém o site da VM Games e a versão jogável do Turbo Race para navegador. O responsável é Arley Vieira e normalmente conversa em português. Ele autorizou autonomia para investigar, corrigir, testar, criar commits e publicar. Quando uma alteração do Turbo Race estiver concluída, o fluxo esperado é testar, criar commit, enviar à branch `main`, esperar o GitHub Pages atualizar e conferir a versão pública.

Preserve o visual atual do menu, da garagem, da seleção de fases e do multiplayer. O jogo deve permanecer em modo paisagem no celular. Não restaure versões antigas da interface nem substitua grandes partes do jogo sem verificar o que já funciona.

### Regra editorial obrigatória para imagens

O responsável não aceita imagens criadas por inteligência artificial nas reportagens. Use somente imagens verdadeiras e relacionadas ao assunto, obtidas de fontes oficiais, assessorias, lojas ou páginas autorizadas. Registre no artigo a fonte, o crédito e a licença/origem editorial sempre que disponíveis. Não gere, não publique e não apresente arte de IA como imagem jornalística. Se não houver uma imagem real com uso seguro e origem verificável, mantenha a matéria sem nova imagem até encontrar uma fonte adequada.

## Repositório, publicação e referências

- Repositório local usado: `C:\Users\arley\Documents\Codex\2026-08-21\x20-c\work\vmgames-site-publish`
- Repositório remoto: `https://github.com/Arleyadm/vmgames-site.git`
- Branch de publicação: `main`
- Jogo público: `https://vmgames.com.br/turbo-race/jogar/index.html`
- Link da versão atual: `https://vmgames.com.br/turbo-race/jogar/index.html?build=20260822-03`
- Sala online: `wss://turbo-race-sala.onrender.com/corrida`
- O site é estático, sem etapa de build. O GitHub Pages publica cada push em `main`.
- Projeto Android de referência, somente leitura: `C:\Users\arley\Music\tudo turbo race\TurboRoadRacer_v113_FIX_ICON_DRIFT_OVERTAKE`

O projeto Android é a referência de comportamento e conteúdo, mas o trabalho atual é na versão web. Não altere o Android sem um pedido explícito.

## Arquitetura principal da versão web

O jogo está em `turbo-race/jogar/` e usa JavaScript puro, Canvas 2D, HTML e CSS.

- `index.html`: ordem dos scripts e identificador de cache `TURBO_RACE_BUILD`.
- `js/main.js`: ciclo principal das telas, redimensionamento e entrada global.
- `js/game.js`: corrida, controles, multiplayer em pista, sensores e ciclo de vida.
- `js/renderer.js`: pista, cenário, adversários e carro do jogador.
- `js/playercar.js`: física do carro.
- `js/hud.js`: HUD e telas durante a corrida.
- `js/trackgenerator.js`: geração da pista, obstáculos e vegetação.
- `js/online.js`: cliente WebSocket e sessão online.
- `js/data/save.js`: progresso e preferências no `localStorage`.
- `js/data/cars.js`: catálogo dos carros.
- `js/data/stages.js`: catálogo das 28 fases.
- `js/ui/menu.js`: menu principal.
- `js/ui/garage.js`: garagem e itens.
- `js/ui/online.js`: lista de salas, configurador e saguão.
- `js/ui/settings.js`: configurações, teclado e controle externo.
- `assets/`: imagens, músicas, efeitos e vídeos.

## Estado funcional atual

### Multiplayer

- O botão Multiplayer abre a tela `SALA ONLINE` com criação, entrada por código e qualquer sala.
- O criador configura nome da sala, 2 a 24 jogadores, pista, 1 a 10 voltas, clima, poças d'água e poças de óleo.
- Depois da criação, todos entram em um saguão de espera com código, lista de jogadores, estado pronto, botão de largada do mestre e provocações.
- A contagem regressiva é sincronizada e as regras da sala, inclusive número de voltas, são usadas por todos.
- Computador e celular usam o mesmo endpoint atual. `SaveManager.onlineServerUrl` migra automaticamente o endpoint antigo `turborace-servidor.onrender.com` para o novo.
- A interface foi feita para rolar por toque no celular. Não remova as correções de `pointermove`, `pointercancel`, roda do mouse e listas roláveis.

### Controles

Existem três modos de direção: toque lateral, botões na tela e inclinação do aparelho.

O painel de teclado foi preservado com os seis comandos principais: esquerda, direita, acelerar, frear/ré, turbo e pause.

O painel `CONTROLE BLUETOOTH / USB` reproduz as 13 opções do Android:

- esquerda e direita;
- acelerar e frear/ré;
- turbo e farol;
- GAS+, gelo e fantasma;
- trocar item e usar item;
- pause e select.

O mapeamento do controle usa a Gamepad API e é salvo separadamente do teclado por `SaveManager.getGamepadButton` e `setGamepadButton`. O analógico esquerdo continua virando o carro mesmo sem remapeamento.

O modo inclinação foi corrigido para usar `DeviceMotionEvent.accelerationIncludingGravity.y`, equivalente ao `event.values[1]` do acelerômetro Android. No navegador o sinal é invertido: o cálculo correto atual é `-gravidade.y / 6`. A alternativa por `DeviceOrientationEvent` também usa o sinal invertido. Não retire essa inversão: ela garante que inclinar à direita vire o carro à direita.

No iPhone, `TelaDeCorrida.pedirPermissaoSensor()` solicita permissão tanto de movimento quanto de orientação dentro do toque do jogador. A tela de configurações chama isso ao selecionar inclinação, e a corrida tenta novamente no primeiro toque caso o modo já estivesse salvo.

### Frost Hyper branco

O carro branco de 19.500 moedas é o `Frost Hyper`, id `9`. Seus sprites possuem muita margem transparente, portanto ele precisa de compensação visual.

- Garagem: `visualScale = 1.38`, com `maxH = 0.96` para o id 9.
- Jogador na corrida: `playerSpriteScale = 1.50` e `maxW = 0.43` para o id 9.
- Adversário/multiplayer: escala `1.36`, limite de largura multiplicado por `1.12` e limite vertical `0.39`.

Esses valores foram medidos pela área alfa realmente visível dos sprites e testados visualmente. Não volte aos antigos `1.14`/`1.20`, pois o carro volta a parecer pequeno.

### Cenário e interface

- A árvore de desenho infantil e o antigo painel/placa suspensa foram removidos do carregamento e da pista.
- Vegetação e arbustos foram reposicionados para ficarem no chão e surgirem mais perto do piloto, com transição menos estranha.
- A rolagem das listas e configurações funciona com mouse e toque.
- O botão `SAIR` retorna à home do site.
- O layout do multiplayer e do saguão atual foi aprovado; preserve esse design.

## Commits importantes desta sequência

- `9c352ab` — publicou o Turbo Race jogável no navegador.
- `a2721e2` — configurador e saguão online.
- `a2c30cf` — novo servidor das salas.
- `e7fed3c` — sincronização das salas salvas no celular.
- `4cbd7fa` — remoção da árvore infantil e do painel suspenso.
- `30913ff` — remoção das imagens antigas do carregamento.
- `43aef37` — ajustes do Frost Hyper e da vegetação.
- `a9bf153` — correção da rolagem das listas.
- `00dfb39` — configuração completa de teclado e controle Bluetooth/USB.
- `77cd057` — acelerômetro, permissões de inclinação e escala maior do Frost Hyper.
- `a7a0a65` — correção do sentido da inclinação.

## Procedimento seguro para continuar

1. Antes de editar, rode `git status --short` e preserve alterações que não sejam suas.
2. Leia os arquivos envolvidos e compare com o Android quando o pedido mencionar o projeto original.
3. Faça alterações localizadas; evite reescrever telas aprovadas.
4. Para cada JavaScript alterado, rode `node --check caminho/do/arquivo.js`.
5. Rode `git diff --check` e teste visualmente no navegador, incluindo rolagem e paisagem no celular quando aplicável.
6. Atualize `window.TURBO_RACE_BUILD` em `turbo-race/jogar/index.html` e o parâmetro `?v=` de cada script alterado. O próximo identificador deve ser posterior a `20260822-03`.
7. Crie um commit descritivo em português e envie para `main`.
8. Aguarde o GitHub Pages publicar. Confirme no HTML público o novo `TURBO_RACE_BUILD` e confira os arquivos com o novo `?v=`.
9. Informe ao responsável o link com `?build=...` e o hash do commit.

## Marca e imagens editoriais do site

- O kit oficial da VM Games está documentado em `ferramentas/MARCA.md` e publicado de
  forma otimizada a partir de `conteudo/midia/`.
- As artes enviadas pelo proprietário podem ser usadas como logo, ícone e material
  institucional. Não reutilizá-las como se fossem foto ou captura factual de reportagem.
- Em reportagens, usar somente imagens reais/oficiais e verificáveis, com crédito e URL
  da fonte. O usuário proibiu expressamente imagens geradas por IA nas matérias.
- O Search Console possui a propriedade verificada de `vmgames.com.br`. O sitemap raiz
  `https://vmgames.com.br/sitemap.xml` foi enviado e aceito pelo painel em 23/08/2026.

## Última validação conhecida

A versão `20260822-03` foi aberta no site público. O responsável confirmou que o modo inclinação passou a funcionar; depois relatou apenas o sentido invertido, corrigido em `a7a0a65`. O site público foi verificado contendo os dois sinais negativos do acelerômetro/orientação. O Frost Hyper maior e a tela de configuração de controles também foram validados visualmente antes da publicação.
