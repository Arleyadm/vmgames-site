"use strict";
/*
 * World Tour: escolha do pais e da fase. Porte de WorldTourActivity.kt.
 *
 * O comentario do Kotlin vale igual aqui: "World Tour em landscape. A tela foi
 * reorganizada em colunas para nao sobrepor botoes, textos e caixas."
 *
 * O que muda: no app cada pedaco da tela era uma View dentro de dois
 * LinearLayout lado a lado (peso 0.82 para a coluna da esquerda e 1.6 para a
 * coluna das fases). No navegador nao ha LinearLayout, entao buildContent()
 * calcula na mao exatamente os mesmos retangulos que aqueles pesos dariam e
 * render() pinta cada "View" no lugar dela. Os numeros de dp, sp e as cores
 * sao os mesmos do Kotlin, um a um.
 *
 * Diferencas obrigatorias em relacao ao app (nenhuma muda o conteudo):
 *  - o Android tinha ScrollView na tela toda e HorizontalScrollView na faixa
 *    de paises; no canvas nao ha rolagem, entao dp() usa uma densidade
 *    calculada a partir da altura e a faixa/celulas encolhem para caber;
 *  - maxLines do TextView vira reducao do tamanho da letra ate o texto caber;
 *  - o anuncio do TurboAds (V114) nao existe no navegador (ver PORTE.md).
 */

class TelaWorldTour {

  constructor(app) {
    this.app = app;
    this.save = app.save;
    this.menuSound = app.sound;
    this.currentCountryIndex = 0;

    // No Kotlin estes eram os campos de View (countryName, countryFlagImage,
    // progressStrip, stagesContainer, subtitle). Aqui viram os retangulos e os
    // textos que o render pinta.
    this.densidade = 1;
    this.retEsquerda = Ret.novo();
    this.retDireita = Ret.novo();
    this.retPrev = Ret.novo();
    this.retNext = Ret.novo();
    this.retCountryName = Ret.novo();
    this.retFlag = Ret.novo();
    this.retBack = Ret.novo();
    this.retsPais = [];   // um retangulo por caixa da faixa de progresso
    this.retsFase = [];   // { ret, globalIndex, unlockedStage, ... } por fase

    this.countryNameTexto = "";
    this.subtitleTexto = "";
    this.bannerNome = "worldtour_brazil";
    this.itensFases = [];
    this.currentStage = 0;

    // Qual botao esta com o dedo em cima (faz o papel do ripple do Android).
    this.pressionado = null;
  }

  // ---------------------------------------------------------
  // Ciclo de vida (onCreate + onNewIntent + onResume + onDestroy)
  // ---------------------------------------------------------

  /** onCreate + onNewIntent + onResume do Kotlin, juntos. */
  entrar(parametros) {
    this.save = this.app.save;
    this.menuSound = this.app.sound;
    const defaultCountry = StageCatalog.countryIndexForStage(Math.max(0, this.save.unlockedStages - 1));
    // O EXTRA_COUNTRY_INDEX do Intent vira uma chave do objeto de parametros.
    let pedido = defaultCountry;
    if (parametros && parametros[TelaWorldTour.EXTRA_COUNTRY_INDEX] !== undefined) {
      pedido = parametros[TelaWorldTour.EXTRA_COUNTRY_INDEX];
    } else if (parametros && parametros.countryIndex !== undefined) {
      pedido = parametros.countryIndex;
    }
    this.currentCountryIndex = limitar(Math.trunc(pedido), 0, StageCatalog.countryCount() - 1);
    this.pressionado = null;
    this.refreshUi();
    // onResume: hideSystemBars() fica de fora (tela cheia e do main.js).
    this.menuSound.startMusic("menu_music");
  }

  /** onDestroy do Kotlin: solta o motor de som mas deixa a musica do menu tocando. */
  sair() {
    this.pressionado = null;
    this.menuSound.releaseKeepMusic();
  }

  /** A tela e estatica; nao ha animacao para adiantar. */
  update(dt) {
  }

  // ---------------------------------------------------------
  // buildContent(): os retangulos que os pesos do LinearLayout dariam
  // ---------------------------------------------------------

  buildContent(largura, altura) {
    // A densidade sai da altura: a coluna da esquerda soma ~410dp de conteudo
    // (padding, titulo, subtitulo, navegacao, bandeira, faixa e VOLTAR), entao
    // 430dp de base deixa tudo dentro da tela sem precisar do ScrollView.
    this.densidade = altura / TelaWorldTour.ALTURA_BASE_DP;

    // rootScroll: setBackgroundColor(Color.rgb(10, 8, 24)); root: padding 18/14.
    const rootL = this.dp(18);
    const rootT = this.dp(14);
    const rootR = largura - this.dp(18);
    const rootB = altura - this.dp(14);

    // leftPanel peso 0.82 com marginEnd dp(12); rightPanel peso 1.6.
    const espaco = this.dp(12);
    const larguraUtil = (rootR - rootL) - espaco;
    const pesoTotal = 0.82 + 1.6;
    const larguraEsq = larguraUtil * (0.82 / pesoTotal);
    const larguraDir = larguraUtil * (1.6 / pesoTotal);

    Ret.definir(this.retEsquerda, rootL, rootT, rootL + larguraEsq, rootB);
    Ret.definir(this.retDireita, rootL + larguraEsq + espaco, rootT, rootL + larguraEsq + espaco + larguraDir, rootB);

    // ---- leftPanel: padding 16/14, gravity CENTER_HORIZONTAL ----
    const esqX0 = this.retEsquerda.left + this.dp(16);
    const esqX1 = this.retEsquerda.right - this.dp(16);
    const esqCentro = (esqX0 + esqX1) / 2;
    let y = this.retEsquerda.top + this.dp(14);

    // title: "WORLD TOUR", 25sp, bottom 6
    this.retTitulo = Ret.novo(esqX0, y, esqX1, y + this.sp(25) * 1.2);
    y = this.retTitulo.bottom + this.dp(6);

    // subtitle: 12.5sp, maxLines 2, bottom 10
    this.retSubtitulo = Ret.novo(esqX0, y, esqX1, y + this.sp(12.5) * 2.4);
    y = this.retSubtitulo.bottom + this.dp(10);

    // navRow: prev 0.7 | countryName 2.4 | next 0.7, altura dp(48), bottom 10
    const alturaNav = this.dp(48);
    const larguraNav = esqX1 - esqX0;
    const unidadeNav = larguraNav / (0.7 + 2.4 + 0.7);
    Ret.definir(this.retPrev, esqX0, y, esqX0 + unidadeNav * 0.7, y + alturaNav);
    Ret.definir(this.retCountryName, this.retPrev.right, y, this.retPrev.right + unidadeNav * 2.4, y + alturaNav);
    Ret.definir(this.retNext, this.retCountryName.right, y, esqX1, y + alturaNav);
    y = this.retPrev.bottom + this.dp(10);

    // countryFlagImage: altura dp(112), CENTER_CROP, bottom 10
    Ret.definir(this.retFlag, esqX0, y, esqX1, y + this.dp(112));
    y = this.retFlag.bottom + this.dp(10);

    // progressStrip: caixas lado a lado com padding 12/8 e rightMargin 8.
    this.retsPais = this.medirFaixaDePaises(esqX0, esqX1, y);
    y = y + this.alturaFaixa;
    y = y + this.dp(12);

    // back: "VOLTAR", altura dp(50), topMargin 4
    y = y + this.dp(4);
    Ret.definir(this.retBack, esqX0, y, esqX1, y + this.dp(50));

    // ---- rightPanel: padding 14/12 ----
    const dirX0 = this.retDireita.left + this.dp(14);
    const dirX1 = this.retDireita.right - this.dp(14);
    let dy = this.retDireita.top + this.dp(12);

    // stagesTitle: "FASES", 18sp, bottom 8
    this.retFasesTitulo = Ret.novo(dirX0, dy, dirX1, dy + this.sp(18) * 1.2);
    dy = this.retFasesTitulo.bottom + this.dp(8);

    this.montarGradeDeFases(dirX0, dirX1, dy, this.retDireita.bottom - this.dp(12));

    // O centro da coluna da esquerda e usado por varios textos centralizados.
    this.esqCentro = esqCentro;
  }

  /**
   * Mede as quatro caixas da faixa de paises. No Android elas ficavam num
   * HorizontalScrollView e podiam passar da largura; aqui, se nao couberem,
   * a letra e o padding encolhem juntos ate caber.
   */
  medirFaixaDePaises(x0, x1, y) {
    const ctx = TelaWorldTour.medidor();
    const textos = [];
    for (let index = 0; index < StageCatalog.countries.length; index++) {
      textos.push(this.textoDaCaixaDePais(index));
    }

    let fator = 1;
    if (ctx) {
      let necessario = 0;
      for (let i = 0; i < textos.length; i++) {
        ctx.font = this.sp(13) + "px " + FONTE;
        necessario += ctx.measureText(textos[i]).width + this.dp(12) * 2 + this.dp(8);
      }
      const disponivel = x1 - x0;
      if (necessario > disponivel && necessario > 0) fator = disponivel / necessario;
    }

    this.fatorFaixa = fator;
    this.textosFaixa = textos;
    this.alturaFaixa = this.dp(8) * 2 * fator + this.sp(13) * fator * 1.3;

    const rets = [];
    let x = x0;
    for (let i = 0; i < textos.length; i++) {
      let larguraTexto = 0;
      if (ctx) {
        ctx.font = (this.sp(13) * fator) + "px " + FONTE;
        larguraTexto = ctx.measureText(textos[i]).width;
      }
      const largura = larguraTexto + this.dp(12) * 2 * fator;
      rets.push(Ret.novo(x, y, x + largura, y + this.alturaFaixa));
      x = x + largura + this.dp(8) * fator;
    }
    return rets;
  }

  /**
   * stagesContainer: as fases do pais em linhas de 3 (chunked(3) do Kotlin).
   * Cada celula tem o botao (dp(88) no app) e, embaixo, o recorde.
   * Como nao ha rolagem, o botao encolhe quando as linhas nao cabem.
   */
  montarGradeDeFases(x0, x1, y0, yFim) {
    const lista = StageCatalog.stagesForCountry(this.currentCountryIndex);
    const linhas = Math.ceil(lista.length / 3);
    const larguraCelula = (x1 - x0) / 3 - this.dp(7);
    const alturaRecorde = this.sp(11.5) * 1.35;

    let alturaBotao = this.dp(88);
    const espaco = yFim - y0;
    const alturaLinha = alturaBotao + alturaRecorde + this.dp(8);
    if (linhas > 0 && linhas * alturaLinha > espaco) {
      alturaBotao = Math.max(this.dp(40), espaco / linhas - alturaRecorde - this.dp(8));
    }

    this.retsFase = [];
    this.alturaBotaoFase = alturaBotao;
    this.alturaRecordeFase = alturaRecorde;

    for (let i = 0; i < lista.length; i++) {
      const coluna = i % 3;
      const linha = Math.trunc(i / 3);
      const item = lista[i];
      const globalIndex = item.index;
      const stage = item.stage;
      const unlockedStage = this.save.isStageUnlocked(globalIndex);
      const x = x0 + coluna * (larguraCelula + this.dp(7));
      const y = y0 + linha * (alturaBotao + alturaRecorde + this.dp(8));
      this.retsFase.push({
        ret: Ret.novo(x, y, x + larguraCelula, y + alturaBotao),
        globalIndex: globalIndex,
        stage: stage,
        unlockedStage: unlockedStage,
        record: this.save.getHighScore(globalIndex)
      });
    }
  }

  // ---------------------------------------------------------
  // refreshUi(): os textos e o estado que a tela mostra
  // ---------------------------------------------------------

  refreshUi() {
    const country = StageCatalog.countryByIndex(this.currentCountryIndex);
    const unlocked = Math.max(1, this.save.unlockedStages);
    const currentStage = Math.max(0, unlocked - 1);
    this.countryNameTexto = country.name.toUpperCase();
    this.bannerNome = this.countryBannerFor(this.currentCountryIndex);
    this.subtitleTexto = "Seu carro avança pelo mundo conforme você se classifica entre os 5 melhores";
    this.currentStage = currentStage;
    this.itensFases = StageCatalog.stagesForCountry(this.currentCountryIndex);
  }

  /** Texto de uma caixa da faixa: carrinho no pais atual + bandeira + nome. */
  textoDaCaixaDePais(index) {
    const item = StageCatalog.countries[index];
    const car = (index === StageCatalog.countryIndexForStage(this.currentStage)) ? "🏎️ " : "";
    return car + this.flagEmojiFor(index) + " " + item.name;
  }

  // ---------------------------------------------------------
  // render(): pinta cada View no retangulo calculado
  // ---------------------------------------------------------

  render(ctx, largura, altura) {
    if (!this.itensFases || this.itensFases.length === 0) this.refreshUi();
    TelaWorldTour.guardarMedidor(ctx);
    this.buildContent(largura, altura);

    // rootScroll: setBackgroundColor(Color.rgb(10, 8, 24))
    ctx.fillStyle = Cor.css(Cor.rgb(10, 8, 24));
    ctx.fillRect(0, 0, largura, altura);

    // leftPanel: setBackgroundColor(Color.rgb(22, 20, 48))
    this.desenharFundo(ctx, this.retEsquerda, Cor.rgb(22, 20, 48));
    // rightPanel: setBackgroundColor(Color.rgb(12, 15, 32))
    this.desenharFundo(ctx, this.retDireita, Cor.rgb(12, 15, 32));

    // title: "WORLD TOUR", branco, 25sp, negrito, centralizado
    this.desenharTexto(ctx, "WORLD TOUR", this.esqCentro, Ret.centroY(this.retTitulo),
      this.sp(25), Cor.WHITE, "center", true);

    // subtitle: rgb(0, 245, 212), 12.5sp, ate 2 linhas
    this.desenharTextoEmDuasLinhas(ctx, this.subtitleTexto, this.retSubtitulo,
      this.sp(12.5), Cor.rgb(0, 245, 212));

    // navRow: os dois botoes de seta e o nome do pais no meio
    this.makeNavButton(ctx, this.retPrev, "◀", "prev");
    this.makeNavButton(ctx, this.retNext, "▶", "next");
    const tamanhoNome = this.tamanhoQueCabe(ctx, this.countryNameTexto,
      Ret.largura(this.retCountryName) - this.dp(6), this.sp(18), true);
    this.desenharTexto(ctx, this.countryNameTexto, Ret.centroX(this.retCountryName),
      Ret.centroY(this.retCountryName), tamanhoNome, Cor.WHITE, "center", true);

    // countryFlagImage: CENTER_CROP sobre fundo rgb(16, 18, 34), alpha 0.96
    this.desenharBandeira(ctx);

    // progressStrip: uma caixa por pais
    this.desenharFaixaDePaises(ctx);

    // back: "VOLTAR", fundo rgb(120, 25, 70), 16sp negrito
    this.desenharBotao(ctx, this.retBack, "VOLTAR", Cor.rgb(120, 25, 70), Cor.WHITE, this.sp(16), true, "voltar", 1);

    // stagesTitle: "FASES", rgb(255, 193, 7), 18sp negrito, alinhado a esquerda
    this.desenharTexto(ctx, "FASES", this.retFasesTitulo.left, Ret.centroY(this.retFasesTitulo),
      this.sp(18), Cor.rgb(255, 193, 7), "left", true);

    // stagesContainer: as celulas de fase
    this.desenharFases(ctx);
  }

  /** countryFlagImage: adjustViewBounds + CENTER_CROP + alpha 0.96. */
  desenharBandeira(ctx) {
    this.desenharFundo(ctx, this.retFlag, Cor.rgb(16, 18, 34));
    const img = Assets.img(this.bannerNome);
    if (!img || !img.width || !img.height) return;
    const destinoL = Ret.largura(this.retFlag);
    const destinoA = Ret.altura(this.retFlag);
    // CENTER_CROP: a imagem cobre o destino inteiro e sobra e cortada no centro.
    const escala = Math.max(destinoL / img.width, destinoA / img.height);
    const fonteL = destinoL / escala;
    const fonteA = destinoA / escala;
    const sx = (img.width - fonteL) / 2;
    const sy = (img.height - fonteA) / 2;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(img, sx, sy, fonteL, fonteA, this.retFlag.left, this.retFlag.top, destinoL, destinoA);
    ctx.globalAlpha = 1;
  }

  /** progressStrip: caixa por pais, com a cor de destaque no pais aberto. */
  desenharFaixaDePaises(ctx) {
    for (let index = 0; index < this.retsPais.length; index++) {
      const item = StageCatalog.countries[index];
      const ret = this.retsPais[index];
      const accessible = this.currentStage >= item.startIndex;
      const isCurrent = index === this.currentCountryIndex;
      const corFundo = isCurrent ? item.accent : Cor.rgb(28, 24, 52);
      const corTexto = accessible ? Cor.WHITE : Cor.rgb(140, 140, 160);
      this.desenharFundo(ctx, ret, corFundo);
      this.desenharTexto(ctx, this.textosFaixa[index], Ret.centroX(ret), Ret.centroY(ret),
        this.sp(13) * this.fatorFaixa, corTexto, "center", false);
    }
  }

  /** Cada fase: o botao com o nome e o estado, e embaixo o recorde. */
  desenharFases(ctx) {
    for (let i = 0; i < this.retsFase.length; i++) {
      const item = this.retsFase[i];
      const stage = item.stage;
      const unlockedStage = item.unlockedStage;
      // setBackgroundColor(if (unlockedStage) accent do pais else rgb(52, 52, 68))
      const corFundo = unlockedStage
        ? StageCatalog.countryByIndex(stage.countryIndex).accent
        : Cor.rgb(52, 52, 68);
      // alpha = if (unlockedStage) 1f else 0.65f
      const alfa = unlockedStage ? 1 : 0.65;
      const pressionadoAqui = this.pressionado && this.pressionado.tipo === "fase" && this.pressionado.indice === i;

      ctx.globalAlpha = alfa;
      this.desenharFundo(ctx, item.ret, pressionadoAqui ? Cor.darken(corFundo, 0.8) : corFundo);

      // text = "${numberInCountry}. ${name}\n${Liberada|Bloqueada 🔒}"
      const linha1 = stage.numberInCountry + ". " + stage.name;
      const linha2 = unlockedStage ? "Liberada" : "Bloqueada 🔒";
      const cx = Ret.centroX(item.ret);
      const cy = Ret.centroY(item.ret);
      const largura1 = Ret.largura(item.ret) - this.dp(8);
      const tamanho1 = this.tamanhoQueCabe(ctx, linha1, largura1, this.sp(13), false);
      const tamanho2 = this.tamanhoQueCabe(ctx, linha2, largura1, this.sp(13), false);
      this.desenharTexto(ctx, linha1, cx, cy - this.sp(13) * 0.7, tamanho1, Cor.WHITE, "center", false);
      this.desenharTexto(ctx, linha2, cx, cy + this.sp(13) * 0.7, tamanho2, Cor.WHITE, "center", false);
      ctx.globalAlpha = 1;

      // record: "Recorde: $record" ou "Sem recorde", rgb(210, 220, 240), 11.5sp
      const textoRecorde = item.record > 0 ? "Recorde: " + item.record : "Sem recorde";
      this.desenharTexto(ctx, textoRecorde, cx, item.ret.bottom + this.alturaRecordeFase / 2,
        this.sp(11.5), Cor.rgb(210, 220, 240), "center", false);
    }
  }

  // ---------------------------------------------------------
  // Toque (o que no Android eram os setOnClickListener)
  // ---------------------------------------------------------

  aoApontar(tipo, x, y) {
    const acao = TelaWorldTour.normalizarPonteiro(tipo);
    if (acao === "baixo") {
      this.pressionado = this.alvoEm(x, y);
      return;
    }
    if (acao === "mover") {
      // Saiu de cima do botao: o clique e cancelado, igual ao Android.
      if (this.pressionado && !Ret.contem(this.pressionado.ret, x, y)) this.pressionado = null;
      return;
    }
    if (acao !== "cima") return;
    const alvo = this.pressionado;
    this.pressionado = null;
    if (!alvo) return;
    if (!Ret.contem(alvo.ret, x, y)) return;
    this.acionar(alvo);
  }

  /** Qual "View" clicavel esta embaixo do dedo. */
  alvoEm(x, y) {
    if (Ret.contem(this.retPrev, x, y)) return { tipo: "prev", ret: this.retPrev };
    if (Ret.contem(this.retNext, x, y)) return { tipo: "next", ret: this.retNext };
    if (Ret.contem(this.retBack, x, y)) return { tipo: "voltar", ret: this.retBack };
    for (let i = 0; i < this.retsFase.length; i++) {
      if (Ret.contem(this.retsFase[i].ret, x, y)) {
        return { tipo: "fase", indice: i, ret: this.retsFase[i].ret };
      }
    }
    return null;
  }

  acionar(alvo) {
    if (alvo.tipo === "prev") {
      this.menuSound.playClick();
      this.moveCountry(-1);
      return;
    }
    if (alvo.tipo === "next") {
      this.menuSound.playClick();
      this.moveCountry(1);
      return;
    }
    if (alvo.tipo === "voltar") {
      // finish(): volta para o menu principal.
      this.menuSound.playClick();
      this.app.irPara("menu");
      return;
    }
    if (alvo.tipo === "fase") {
      const item = this.retsFase[alvo.indice];
      if (!item) return;
      if (!item.unlockedStage) return;   // if (!unlockedStage) return@setOnClickListener
      this.menuSound.playClick();
      this.startStageFromProfile(item.globalIndex);
    }
  }

  startStageFromProfile(stageIndex) {
    // V114: no app havia um anuncio antes de cada fase (TurboAds.showThenStart,
    // com onRewardCoins somando moedas) e a corrida abria assim que ele
    // terminasse — o anuncio nunca impedia de jogar. No navegador nao existe
    // anuncio (ver PORTE.md), entao o gancho continua aqui chamando direto.
    this.openStage(stageIndex);
  }

  openStage(stageIndex) {
    // V74: o nome agora fica somente em Configurações > Perfil do Piloto.
    // Ao tocar na fase, já inicia a corrida usando o nome salvo.
    const name = String(this.save.playerName || "").trim().slice(0, 14) || "Jogador";
    this.app.irPara("corrida", { stageIndex: stageIndex, playerName: name });
  }

  moveCountry(delta) {
    const next = limitar(this.currentCountryIndex + delta, 0, StageCatalog.countryCount() - 1);
    if (next === this.currentCountryIndex) return;
    this.currentCountryIndex = next;
    this.refreshUi();
  }

  // ---------------------------------------------------------
  // Recursos por pais
  // ---------------------------------------------------------

  /** No Kotlin devolvia um R.drawable; aqui devolve o nome do recurso. */
  countryBannerFor(countryIndex) {
    switch (countryIndex) {
      case 0: return "worldtour_brazil";
      case 1: return "worldtour_usa";
      case 2: return "worldtour_japan";
      default: return "worldtour_italy";
    }
  }

  flagEmojiFor(countryIndex) {
    switch (countryIndex) {
      case 0: return "🇧🇷";
      case 1: return "🇺🇸";
      case 2: return "🇯🇵";
      default: return "🇮🇹";
    }
  }

  // ---------------------------------------------------------
  // Ajudantes de desenho (o que no Android o proprio widget fazia)
  // ---------------------------------------------------------

  /** makeNavButton: fundo rgb(40, 38, 68), texto branco 20sp. */
  makeNavButton(ctx, ret, label, tipo) {
    this.desenharBotao(ctx, ret, label, Cor.rgb(40, 38, 68), Cor.WHITE, this.sp(20), false, tipo, 1);
  }

  desenharBotao(ctx, ret, texto, corFundo, corTexto, tamanho, negrito, tipo, alfa) {
    const pressionadoAqui = this.pressionado && this.pressionado.tipo === tipo;
    ctx.globalAlpha = (alfa === undefined) ? 1 : alfa;
    this.desenharFundo(ctx, ret, pressionadoAqui ? Cor.darken(corFundo, 0.8) : corFundo);
    const tamanhoFinal = this.tamanhoQueCabe(ctx, texto, Ret.largura(ret) - this.dp(8), tamanho, negrito);
    this.desenharTexto(ctx, texto, Ret.centroX(ret), Ret.centroY(ret), tamanhoFinal, corTexto, "center", negrito);
    ctx.globalAlpha = 1;
  }

  /** setBackgroundColor de uma View: um retangulo cheio, sem cantos arredondados. */
  desenharFundo(ctx, ret, cor) {
    ctx.fillStyle = Cor.css(cor);
    ctx.fillRect(ret.left, ret.top, Ret.largura(ret), Ret.altura(ret));
  }

  desenharTexto(ctx, texto, x, y, tamanho, cor, alinhamento, negrito) {
    ctx.font = (negrito ? "bold " : "") + tamanho + "px " + FONTE;
    ctx.fillStyle = Cor.css(cor);
    ctx.textAlign = alinhamento || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, x, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  /** maxLines = 2 do subtitulo: quebra no ultimo espaco que couber. */
  desenharTextoEmDuasLinhas(ctx, texto, ret, tamanho, cor) {
    const larguraMax = Ret.largura(ret);
    ctx.font = tamanho + "px " + FONTE;
    if (ctx.measureText(texto).width <= larguraMax) {
      this.desenharTexto(ctx, texto, Ret.centroX(ret), Ret.centroY(ret), tamanho, cor, "center", false);
      return;
    }
    const palavras = texto.split(" ");
    let linha1 = "";
    let corte = palavras.length;
    for (let i = 0; i < palavras.length; i++) {
      const tentativa = linha1 ? linha1 + " " + palavras[i] : palavras[i];
      if (ctx.measureText(tentativa).width > larguraMax) { corte = i; break; }
      linha1 = tentativa;
    }
    const linha2 = palavras.slice(corte).join(" ");
    const tamanho2 = this.tamanhoQueCabe(ctx, linha2, larguraMax, tamanho, false);
    const meio = Ret.centroY(ret);
    this.desenharTexto(ctx, linha1, Ret.centroX(ret), meio - tamanho * 0.65, tamanho, cor, "center", false);
    this.desenharTexto(ctx, linha2, Ret.centroX(ret), meio + tamanho * 0.65, tamanho2, cor, "center", false);
  }

  /** O TextView quebrava em varias linhas; aqui a letra encolhe ate caber. */
  tamanhoQueCabe(ctx, texto, larguraMax, tamanho, negrito) {
    if (larguraMax <= 0) return tamanho;
    ctx.font = (negrito ? "bold " : "") + tamanho + "px " + FONTE;
    const largura = ctx.measureText(texto).width;
    if (largura <= larguraMax) return tamanho;
    return Math.max(tamanho * 0.5, tamanho * (larguraMax / largura));
  }

  /** dp -> pixels, como resources.displayMetrics.density fazia no Android. */
  dp(value) {
    return value * this.densidade;
  }

  /** sp -> pixels. O jogo nao usa a escala de fonte do sistema. */
  sp(value) {
    return value * this.densidade;
  }

  // ---------------------------------------------------------
  // Apoio interno
  // ---------------------------------------------------------

  /**
   * O tamanho dos textos so pode ser medido com um contexto de canvas. O
   * ultimo contexto visto pelo render fica guardado para o buildContent poder
   * medir a faixa de paises antes de desenhar.
   */
  static guardarMedidor(ctx) {
    TelaWorldTour._medidor = ctx;
  }

  static medidor() {
    return TelaWorldTour._medidor || null;
  }

  /** Aceita os nomes de evento em portugues e os equivalentes em ingles. */
  static normalizarPonteiro(tipo) {
    const t = String(tipo || "").toLowerCase();
    if (t === "baixo" || t === "down" || t === "pressionar" || t === "start") return "baixo";
    if (t === "mover" || t === "move" || t === "arrastar") return "mover";
    if (t === "cima" || t === "up" || t === "soltar" || t === "end" || t === "clique" || t === "click") return "cima";
    return "";
  }
}

/** O EXTRA_COUNTRY_INDEX do Intent, agora chave do objeto de parametros. */
TelaWorldTour.EXTRA_COUNTRY_INDEX = "extra_country_index";

/** Altura de referencia em dp: a coluna da esquerda soma ~410dp de conteudo. */
TelaWorldTour.ALTURA_BASE_DP = 430;

TelaWorldTour._medidor = null;

window.TelaWorldTour = TelaWorldTour;
