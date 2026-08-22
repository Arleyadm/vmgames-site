"use strict";
/*
 * Telas de vídeo em tela cheia. Porte de IntroActivity.kt e das quatro
 * Activities de zeramento: BrazilEndingActivity.kt, USEndingActivity.kt,
 * JapanEndingActivity.kt e ItalyEndingActivity.kt.
 *
 * As cinco telas eram Activities separadas, mas o corpo delas era o mesmo:
 * um vídeo ocupando a tela inteira, dois rótulos e (nas de zeramento) um par
 * de botões que só aparece depois do vídeo terminar. Aqui elas viram uma
 * classe só, e a tabela TELAS_DE_VIDEO guarda o que mudava de uma para a
 * outra — os textos, o país seguinte e o modo de preenchimento da tela.
 *
 * A abertura (menu_intro) fica parada no primeiro quadro esperando o toque;
 * as quatro de zeramento começam sozinhas e NÃO dão para pular: o Kotlin
 * bloqueia o botão voltar de propósito (registerBackHandler), e aqui o Escape
 * e os cliques são ignorados até o vídeo acabar.
 *
 * O que o Android fazia com TextureView + MediaPlayer, o navegador faz com um
 * elemento <video> criado por código e colocado em app.camadaHtml, a <div>
 * que fica por cima do canvas. Os rótulos e os botões também são HTML, na
 * mesma pilha do FrameLayout do Kotlin: vídeo embaixo, rótulos e painel de
 * ações por cima.
 */

/** Índices de país do World Tour, iguais aos companion object das Activities. */
const NEXT_COUNTRY_USA = 1;
const NEXT_COUNTRY_JAPAN = 2;
const NEXT_COUNTRY_ITALY = 3;
const COUNTRY_ITALY = 3;

/**
 * O que muda de uma tela de vídeo para a outra.
 *
 * ajuste "cover" é o FitCenterVideoView + VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
 * da intro (preenche a tela e corta só as bordas necessárias);
 * "contain" é o applyVideoTransform das telas de zeramento (mostra o vídeo
 * inteiro e deixa sobrar preto).
 */
const TELAS_DE_VIDEO = {
  "menu_intro": {
    esperaToque: true,
    ajuste: "cover"
  },
  "finalizacao_brasil": {
    esperaToque: false,
    ajuste: "contain",
    rotuloTopo: "BRASIL CONCLUÍDO",
    rotuloTopoFim: "BRASIL ZERADO!",
    rotuloRodape: "Assista ao zeramento completo do Brasil",
    botaoSeguinte: "PRÓXIMO PAÍS",
    paisSeguinte: NEXT_COUNTRY_USA,
    toqueAposFim: "seguinte"
  },
  "finalizacao_estados_unidos": {
    esperaToque: false,
    ajuste: "contain",
    rotuloTopo: "ESTADOS UNIDOS CONCLUÍDO",
    rotuloTopoFim: "ESTADOS UNIDOS ZERADO!",
    rotuloRodape: "Assista ao zeramento completo dos Estados Unidos",
    botaoSeguinte: "PRÓXIMO PAÍS",
    paisSeguinte: NEXT_COUNTRY_JAPAN,
    toqueAposFim: "seguinte"
  },
  "finalizacao_japao": {
    esperaToque: false,
    ajuste: "contain",
    rotuloTopo: "JAPÃO CONCLUÍDO",
    rotuloTopoFim: "JAPÃO ZERADO!",
    rotuloRodape: "Assista ao zeramento completo do Japão",
    botaoSeguinte: "PRÓXIMO PAÍS",
    paisSeguinte: NEXT_COUNTRY_ITALY,
    toqueAposFim: "seguinte"
  },
  "final_italia": {
    esperaToque: false,
    ajuste: "contain",
    rotuloTopo: "ITÁLIA CONCLUÍDA",
    rotuloTopoFim: "CAMPEONATO ZERADO!",
    rotuloRodape: "Assista ao vídeo final do campeonato",
    botaoSeguinte: "WORLD TOUR",
    paisSeguinte: COUNTRY_ITALY,
    // A Itália é a última: tocar fora dos botões volta para o menu principal,
    // não para o "próximo país".
    toqueAposFim: "menu"
  }
};

class TelaDeVideo {

  constructor(app) {
    this.app = app;

    // Estado da abertura (IntroActivity).
    this.prepared = false;
    this.started = false;
    this.openMenuDone = false;

    // Estado das telas de zeramento.
    this.alreadyFinished = false;
    this.videoCompleted = false;
    this.sourceVideoW = 16;
    this.sourceVideoH = 9;

    // Elementos HTML criados em buildLayout().
    this.root = null;
    this.videoView = null;
    this.tapBlocker = null;
    this.topLabel = null;
    this.bottomLabel = null;
    this.actionsPanel = null;

    this.nome = "menu_intro";
    this.depois = "menu";
    this.config = TELAS_DE_VIDEO["menu_intro"];
    this.aoTeclar = null;
  }

  /** Equivale ao onCreate() das cinco Activities. */
  entrar(parametros) {
    const p = parametros || {};
    this.nome = p.nome || "menu_intro";
    this.depois = p.depois || "menu";
    this.config = TELAS_DE_VIDEO[this.nome] || TELAS_DE_VIDEO["menu_intro"];

    this.prepared = false;
    this.started = false;
    this.openMenuDone = false;
    this.alreadyFinished = false;
    this.videoCompleted = false;
    this.sourceVideoW = 16;
    this.sourceVideoH = 9;

    this.hideSystemBars();
    this.buildLayout();
    this.registerBackHandler();

    if (this.config.esperaToque) {
      this.setupIntroVideo();
    } else {
      this.startPlayer();
    }
  }

  /**
   * V114 / Android 16: com targetSdk 36 o sistema não chama mais
   * onBackPressed(). Sem este registro, o botão voltar fecharia a tela e
   * pularia o vídeo de zeramento.
   *
   * A versão antiga da ItalyEndingActivity chamava super.onBackPressed()
   * antes da checagem, o que fechava a Activity e deixava pular o vídeo final
   * — as outras três telas não faziam isso. As quatro se comportam igual.
   *
   * No navegador quem faz o papel do botão voltar é o Escape: ele é engolido
   * (stopPropagation + preventDefault) enquanto o vídeo não termina.
   */
  registerBackHandler() {
    const self = this;
    this.aoTeclar = function (ev) {
      if (ev.key !== "Escape") return;
      if (self.config.esperaToque) return; // a abertura não bloqueia nada
      ev.preventDefault();
      ev.stopPropagation();
      // Não pula o zeramento antes de terminar.
      if (self.videoCompleted) self.openMainMenu();
    };
    // Fase de captura para chegar antes de qualquer tratador global do app.
    window.addEventListener("keydown", this.aoTeclar, true);
  }

  /** Monta a pilha de elementos que no Kotlin era o FrameLayout da tela. */
  buildLayout() {
    const self = this;

    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.left = "0";
    this.root.style.top = "0";
    this.root.style.width = "100%";
    this.root.style.height = "100%";
    this.root.style.overflow = "hidden";
    this.root.style.background = Cor.css(Cor.BLACK);

    this.videoView = document.createElement("video");
    this.videoView.style.position = "absolute";
    this.videoView.style.left = "0";
    this.videoView.style.top = "0";
    this.videoView.style.width = "100%";
    this.videoView.style.height = "100%";
    this.videoView.style.background = Cor.css(Cor.BLACK);
    this.videoView.setAttribute("playsinline", "");
    this.videoView.playsInline = true;   // no iPhone, sem isso o vídeo abre em tela cheia do sistema
    this.videoView.controls = false;
    this.videoView.loop = false;         // isLooping = false
    this.videoView.volume = 1;           // setVolume(1f, 1f)
    this.videoView.preload = "auto";
    this.applyVideoTransform();
    this.root.appendChild(this.videoView);

    if (this.config.esperaToque) {
      // O tapBlocker do activity_intro.xml: uma camada transparente por cima
      // do vídeo, que some quando o vídeo começa a rodar.
      this.tapBlocker = document.createElement("div");
      this.tapBlocker.style.position = "absolute";
      this.tapBlocker.style.left = "0";
      this.tapBlocker.style.top = "0";
      this.tapBlocker.style.width = "100%";
      this.tapBlocker.style.height = "100%";
      this.tapBlocker.style.background = Cor.css(Cor.TRANSPARENT);
      this.root.appendChild(this.tapBlocker);
    } else {
      this.topLabel = document.createElement("div");
      this.topLabel.textContent = this.config.rotuloTopo;
      this.topLabel.style.position = "absolute";
      this.topLabel.style.left = "0";
      this.topLabel.style.right = "0";
      this.topLabel.style.top = this.dp(18);
      this.topLabel.style.textAlign = "center";
      this.topLabel.style.color = Cor.css(Cor.WHITE);
      this.topLabel.style.font = "21px " + FONTE;   // o Kotlin nao poe negrito neste rotulo
      this.topLabel.style.textShadow = "0 0 10px " + Cor.css(Cor.rgb(0, 245, 212));
      this.topLabel.style.opacity = "0.92";
      this.root.appendChild(this.topLabel);

      this.bottomLabel = document.createElement("div");
      this.bottomLabel.textContent = this.config.rotuloRodape;
      this.bottomLabel.style.position = "absolute";
      this.bottomLabel.style.left = "0";
      this.bottomLabel.style.right = "0";
      this.bottomLabel.style.bottom = this.dp(18);
      this.bottomLabel.style.textAlign = "center";
      this.bottomLabel.style.color = Cor.css(Cor.argb(215, 255, 255, 255));
      this.bottomLabel.style.font = "13px " + FONTE;
      this.bottomLabel.style.textShadow = "0 0 8px " + Cor.css(Cor.BLACK);
      this.root.appendChild(this.bottomLabel);

      this.actionsPanel = document.createElement("div");
      this.actionsPanel.style.position = "absolute";
      this.actionsPanel.style.left = "0";
      this.actionsPanel.style.right = "0";
      this.actionsPanel.style.bottom = "0";
      this.actionsPanel.style.display = "none";   // visibility = View.GONE
      this.actionsPanel.style.flexDirection = "row";
      this.actionsPanel.style.alignItems = "center";
      this.actionsPanel.style.justifyContent = "center";
      this.actionsPanel.style.padding = this.dp(10) + " " + this.dp(18) + " " + this.dp(22) + " " + this.dp(18);

      const nextBtn = this.makeActionButton(this.config.botaoSeguinte, function () { self.openNextCountryMenu(); });
      const menuBtn = this.makeActionButton("MENU PRINCIPAL", function () { self.openMainMenu(); });
      nextBtn.style.flex = "1";
      nextBtn.style.marginRight = this.dp(10);
      menuBtn.style.flex = "1";
      menuBtn.style.marginLeft = this.dp(10);
      this.actionsPanel.appendChild(nextBtn);
      this.actionsPanel.appendChild(menuBtn);
      this.root.appendChild(this.actionsPanel);
    }

    // Antes do vídeo terminar, toque na tela não pula.
    // Depois do vídeo, tocar fora dos botões também leva para o próximo país.
    // Na abertura, o toque é o que dá a partida no vídeo.
    this.root.addEventListener("click", function () { self.cliqueNaTela(); });

    const camada = this.app.camadaHtml || document.body;
    camada.appendChild(this.root);
  }

  /**
   * No app isso escondia as barras do sistema. No navegador a tela cheia so
   * pode ser pedida dentro de um toque do jogador, e quem faz isso e o main.js;
   * aqui fica so o gancho com o mesmo nome do Kotlin.
   */
  hideSystemBars() { /* nada a fazer no navegador */ }

  /** Equivale ao makeActionButton das telas de zeramento. */
  makeActionButton(label, action) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.height = this.dp(54);
    btn.style.border = "none";
    btn.style.color = Cor.css(Cor.WHITE);
    btn.style.font = "bold 15px " + FONTE;
    btn.style.textTransform = "none";       // isAllCaps = false
    btn.style.background = Cor.css(Cor.argb(225, 0x14, 0x9A, 0x6A));
    btn.style.cursor = "pointer";
    btn.addEventListener("click", function (ev) {
      // O clique do botão não pode virar também o clique da tela inteira.
      ev.stopPropagation();
      action();
    });
    return btn;
  }

  /**
   * Porte do setupIntroVideo(): prepara o vídeo da abertura e para no primeiro
   * quadro, esperando o toque.
   */
  setupIntroVideo() {
    const self = this;
    const videoResId = Assets.caminhoVideo("menu_intro");
    if (!videoResId) {
      // Permite enviar o projeto sem vídeo para o arquivo ficar menor.
      // Depois é só recolocar assets/video/menu_intro.mp4.
      this.prepared = false;
      this.videoView.style.display = "none";
      return;
    }

    this.videoView.src = videoResId;

    this.videoView.onloadeddata = function () {
      self.prepared = true;
      self.applyVideoTransform();
      // Mostra o primeiro frame e fica aguardando clique (seekTo(1) do Kotlin,
      // que é 1 milissegundo).
      try { self.videoView.currentTime = 0.001; } catch (_) {}
      self.videoView.pause();
    };

    this.videoView.onended = function () {
      self.openMenu();
    };

    this.videoView.onerror = function () {
      // O Kotlin mostrava um Toast: "Vídeo inicial não carregou. Abrindo menu."
      // No navegador não existe Toast; a tela só segue direto para o menu.
      self.openMenu();
    };

    this.videoView.load();
  }

  /** Porte do startIntroVideo(): o toque do jogador dá a partida na abertura. */
  startIntroVideo() {
    if (this.openMenuDone || this.started) return;
    if (!this.prepared) {
      this.openMenu();
      return;
    }

    this.started = true;
    if (this.tapBlocker) this.tapBlocker.style.display = "none";
    try { this.videoView.currentTime = 0; } catch (_) {}
    this.tocar();
  }

  /** Porte do openMenu() da IntroActivity. */
  openMenu() {
    if (this.openMenuDone) return;
    this.openMenuDone = true;
    this.app.irPara(this.depois);
  }

  /**
   * Porte do startPlayer() das telas de zeramento: o vídeo começa sozinho
   * assim que a tela abre.
   */
  startPlayer() {
    const self = this;
    if (this.alreadyFinished || this.videoCompleted) return;
    this.releasePlayer();

    const videoResId = Assets.caminhoVideo(this.nome);
    if (!videoResId) {
      // O Kotlin avisava por Toast que o vídeo não estava no arquivo e abria as
      // opções na hora. Aqui é igual, sem o Toast.
      this.showFinishedOptions();
      return;
    }

    this.videoView.src = videoResId;

    this.videoView.onloadedmetadata = function () {
      self.prepared = true;
      self.videoCompleted = false;
      self.sourceVideoW = self.videoView.videoWidth > 0 ? self.videoView.videoWidth : 16;
      self.sourceVideoH = self.videoView.videoHeight > 0 ? self.videoView.videoHeight : 9;
      self.applyVideoTransform();
      self.tocar();
    };

    this.videoView.onresize = function () {
      // Equivale ao setOnVideoSizeChangedListener.
      if (self.videoView.videoWidth > 0 && self.videoView.videoHeight > 0) {
        self.sourceVideoW = self.videoView.videoWidth;
        self.sourceVideoH = self.videoView.videoHeight;
        self.applyVideoTransform();
      }
    };

    this.videoView.onended = function () {
      self.showFinishedOptions();
    };

    this.videoView.onerror = function () {
      // Mesmo caminho do setOnErrorListener: sem vídeo, já mostra as opções.
      self.showFinishedOptions();
    };

    this.videoView.load();
  }

  /**
   * Dá o play tratando a trava de autoplay do navegador.
   *
   * No Android o mp.start() sempre tocava com som. No navegador, um vídeo com
   * áudio só toca sozinho depois de um toque do jogador — nas telas de
   * zeramento o vídeo começa sem toque nenhum. Se o play for recusado, o vídeo
   * roda sem som, que é melhor do que ficar parado numa tela que não dá para
   * pular.
   */
  tocar() {
    const self = this;
    const promessa = this.videoView.play();
    if (promessa && typeof promessa.catch === "function") {
      promessa.catch(function () {
        self.videoView.muted = true;
        const segunda = self.videoView.play();
        if (segunda && typeof segunda.catch === "function") {
          segunda.catch(function () {
            // Nem mudo o navegador deixou tocar: segue como se fosse erro.
            if (self.config.esperaToque) self.openMenu();
            else self.showFinishedOptions();
          });
        }
      });
    }
  }

  /**
   * Porte do applyVideoTransform(): a matriz de escala do TextureView aqui é
   * o object-fit do <video>, que faz a mesma conta de proporção.
   */
  applyVideoTransform() {
    if (!this.videoView) return;
    this.videoView.style.objectFit = this.config.ajuste;
    this.videoView.style.objectPosition = "center";
  }

  /** Porte do showFinishedOptions(). */
  showFinishedOptions() {
    if (this.videoCompleted || this.alreadyFinished) return;
    this.videoCompleted = true;
    this.prepared = false;
    if (this.bottomLabel) this.bottomLabel.style.display = "none";
    if (this.topLabel) this.topLabel.textContent = this.config.rotuloTopoFim;
    if (this.actionsPanel) this.actionsPanel.style.display = "flex";
  }

  /** Porte do openNextCountryMenu(): abre o World Tour já no país seguinte. */
  openNextCountryMenu() {
    if (this.alreadyFinished) return;
    this.alreadyFinished = true;
    this.releasePlayer();
    this.app.irPara("worldtour", { countryIndex: this.config.paisSeguinte });
  }

  /** Porte do openMainMenu(). */
  openMainMenu() {
    if (this.alreadyFinished) return;
    this.alreadyFinished = true;
    this.releasePlayer();
    this.app.irPara("menu");
  }

  /**
   * O root.setOnClickListener das cinco telas, num lugar só.
   * A abertura dá a partida no vídeo; as de zeramento só respondem depois que
   * o vídeo termina.
   */
  cliqueNaTela() {
    if (this.config.esperaToque) {
      this.startIntroVideo();
      return;
    }
    if (!this.videoCompleted) return;   // não pula o zeramento
    if (this.config.toqueAposFim === "menu") this.openMainMenu();
    else this.openNextCountryMenu();
  }

  /** Porte do releasePlayer(). */
  releasePlayer() {
    this.prepared = false;
    if (!this.videoView) return;
    this.videoView.onended = null;
    this.videoView.onerror = null;
    this.videoView.onloadeddata = null;
    this.videoView.onloadedmetadata = null;
    this.videoView.onresize = null;
    try { this.videoView.pause(); } catch (_) {}
    try { this.videoView.removeAttribute("src"); this.videoView.load(); } catch (_) {}
  }

  /** Equivale ao onDestroy(): solta o player e tira o HTML de cima do canvas. */
  sair() {
    this.releasePlayer();
    if (this.aoTeclar) {
      window.removeEventListener("keydown", this.aoTeclar, true);
      this.aoTeclar = null;
    }
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
    this.videoView = null;
    this.tapBlocker = null;
    this.topLabel = null;
    this.bottomLabel = null;
    this.actionsPanel = null;
  }

  /** Nada a atualizar por quadro: o próprio <video> toca sozinho. */
  update(dt) {
  }

  /**
   * O fundo da tela era o FrameLayout preto do Kotlin. O vídeo e os rótulos
   * são HTML e ficam por cima do canvas, então aqui só sobra pintar o preto —
   * é o que aparece nas faixas que o vídeo não cobre.
   */
  render(ctx, largura, altura) {
    ctx.fillStyle = Cor.css(Cor.BLACK);
    ctx.fillRect(0, 0, largura, altura);
  }

  /**
   * Toque no canvas. O HTML por cima já trata o clique, mas quando a camada
   * HTML estiver com pointer-events desligado o toque chega por aqui — e o
   * efeito tem que ser o mesmo. Os dois caminhos passam pelos mesmos guardas
   * (started, openMenuDone, videoCompleted, alreadyFinished), então não tem
   * risco de a ação acontecer duas vezes.
   */
  aoApontar(tipo, x, y) {
    if (tipo !== "baixo") return;
    this.cliqueNaTela();
  }

  /**
   * Porte do dp(): no Android multiplicava pela densidade da tela. No
   * navegador o px do CSS já é escalado pelo devicePixelRatio, então o número
   * do Kotlin vale direto.
   */
  dp(value) {
    return value + "px";
  }
}

window.TelaDeVideo = TelaDeVideo;
window.TELAS_DE_VIDEO = TELAS_DE_VIDEO;
