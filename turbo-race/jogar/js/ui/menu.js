"use strict";
/*
 * Menu principal. Porte de MainActivity.kt + game/MenuBackgroundView.kt.
 *
 * Menu principal em landscape.
 * O video inicial fica somente na tela "video" (IntroActivity).
 * Depois do video terminar, esta tela mostra as opcoes com imagem de fundo fixa.
 *
 * No app o layout era o activity_main.xml: um FrameLayout preto com a imagem
 * menu_bg_turbo_race (fitCenter), um veu #55020812 por cima e duas colunas —
 * a da esquerda com titulo, subtitulo e o contador de moedas dentro do
 * panel_glass; a da direita com os cinco ImageButton de 360x60dp. Aqui o jogo
 * inteiro e um canvas so, entao tudo isso e desenhado a mao e o toque e
 * testado contra os retangulos guardados em [this.rects].
 *
 * As medidas em dp do XML sao mantidas: [dp] converte o dp do layout para
 * pixel usando um aparelho de referencia de 800x360dp (a proporcao em que o
 * activity_main.xml foi desenhado — os botoes de 360dp ocupam exatamente a
 * coluna de peso 1.05).
 */

/** Carrinho do fundo animado. Porte de MenuBackgroundView.MiniCar. */
class MiniCar {
  constructor(x, y, speed, w, color) {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.w = w;
    this.color = color;
  }
}

/**
 * Fundo animado da tela inicial: um ceu em gradiente, uma "pista" embaixo e
 * varios carrinhos (formas geometricas) passando da direita para a esquerda em
 * velocidades diferentes. E so um efeito visual leve, sem relacao com a corrida.
 *
 * No Android o proprio View se redesenhava com postInvalidateOnAnimation(); aqui
 * quem chama onDraw e o laco do canvas, mas o dt continua sendo medido dentro do
 * onDraw (com o mesmo teto de 0.05s) para o porte ficar igual ao Kotlin.
 *
 * Ele so aparece enquanto a imagem menu_bg_turbo_race nao esta carregada — no
 * app essa imagem era um recurso local e ja estava pronta no primeiro frame.
 */
class MenuBackgroundView {
  constructor() {
    this.rect = Ret.novo(0, 0, 0, 0);
    this.cars = [];
    this.skyShader = null;
    this.skyHeight = 0;   // altura usada no gradiente atual (para refaze-lo se a janela mudar)

    this.lastFrame = 0;
    this.running = false;
    this.laneOffset = 0;

    this.palette = [
      Cor.rgb(0x00, 0xF5, 0xD4),
      Cor.rgb(0xF5, 0x00, 0x90),
      Cor.rgb(0xFF, 0xC1, 0x07),
      Cor.rgb(0x4D, 0xC8, 0xFF),
      Cor.rgb(0xE0, 0x3A, 0x3A)
    ];
  }

  start() {
    this.running = true;
    this.lastFrame = performance.now() * 1000000;  // o Kotlin usava System.nanoTime()
  }

  stop() { this.running = false; }

  ensureCars(width, height) {
    if (this.cars.length > 0 || width === 0) return;
    const roadTop = height * 0.6;
    for (let it = 0; it < 7; it++) {
      const lane = it % 4;
      const y = roadTop + height * 0.06 * lane + height * 0.02;
      const w = width * (0.10 + 0.04 * (lane % 2));
      const speed = width * (0.10 + 0.05 * (it % 3));
      const x = (width * (it / 7)) + (Math.random() * width);
      this.cars.push(new MiniCar(x, y, speed, w, this.palette[it % this.palette.length]));
    }
  }

  onDraw(ctx, width, height) {
    this.ensureCars(width, height);

    // Tempo desde o ultimo frame.
    const now = performance.now() * 1000000;
    let dt = (now - this.lastFrame) / 1000000000;
    this.lastFrame = now;
    if (dt > 0.05) dt = 0.05;

    // Ceu
    if ((this.skyShader === null || this.skyHeight !== height) && height > 0) {
      this.skyShader = ctx.createLinearGradient(0, 0, 0, height);
      this.skyShader.addColorStop(0, Cor.css(Cor.rgb(0x12, 0x06, 0x2A)));
      this.skyShader.addColorStop(1, Cor.css(Cor.rgb(0x2A, 0x0E, 0x4A)));
      this.skyHeight = height;
    }
    ctx.fillStyle = this.skyShader;
    ctx.fillRect(0, 0, width, height);

    // Pista (faixa inferior) + linhas centrais animadas
    const roadTop = height * 0.6;
    ctx.fillStyle = Cor.css(Cor.rgb(0x1A, 0x1A, 0x22));
    ctx.fillRect(0, roadTop, width, height - roadTop);

    this.laneOffset = (this.laneOffset + dt * width * 0.4) % (width * 0.12);
    ctx.fillStyle = Cor.css(Cor.argb(0x66, 0x00, 0xF5, 0xD4));
    const dashY = height * 0.82;
    let dx = -this.laneOffset;
    while (dx < width) {
      ctx.fillRect(dx, dashY, width * 0.06, height * 0.01);
      dx += width * 0.12;
    }

    // Carrinhos passando
    for (const c of this.cars) {
      if (this.running) {
        c.x -= c.speed * dt;
        if (c.x < -c.w * 1.5) {
          c.x = width + c.w;
          c.y = roadTop + height * 0.06 * Math.trunc(Math.random() * 4) + height * 0.02;
          c.speed = width * (0.10 + 0.06 * Math.random());
          c.color = this.palette[Math.trunc(Math.random() * this.palette.length)];
        }
      }
      this.drawMiniCar(ctx, c);
    }
  }

  drawMiniCar(ctx, c) {
    const h = c.w * 0.55;
    const rect = this.rect;
    // Sombra
    ctx.fillStyle = Cor.css(Cor.argb(0x55, 0, 0, 0));
    Ret.definir(rect, c.x - c.w * 0.5, c.y + h * 0.45, c.x + c.w * 0.5, c.y + h * 0.6);
    ctx.beginPath();
    ctx.ellipse(Ret.centroX(rect), Ret.centroY(rect), Ret.largura(rect) / 2, Ret.altura(rect) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Corpo
    ctx.fillStyle = Cor.css(c.color);
    Ret.definir(rect, c.x - c.w * 0.5, c.y, c.x + c.w * 0.5, c.y + h);
    retanguloArredondado(ctx, rect, h * 0.3);
    ctx.fill();
    // Teto
    ctx.fillStyle = Cor.css(Cor.argb(0xCC, 0x10, 0x10, 0x18));
    Ret.definir(rect, c.x - c.w * 0.22, c.y - h * 0.35, c.x + c.w * 0.28, c.y + h * 0.35);
    retanguloArredondado(ctx, rect, h * 0.2);
    ctx.fill();
    // Farol traseiro (a esquerda, pois vai para a esquerda)
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0x55, 0x55));
    ctx.beginPath();
    ctx.arc(c.x - c.w * 0.45, c.y + h * 0.5, h * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Desenha a imagem dentro do retangulo do jeito que o android:scaleType="fitCenter"
 * fazia: cabe inteira, mantendo a proporcao, centralizada (o que sobra fica preto,
 * igual ao android:background="#000000" do FrameLayout).
 */
function desenharFitCenter(ctx, img, r) {
  const escala = Math.min(Ret.largura(r) / img.width, Ret.altura(r) / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  ctx.drawImage(img, Ret.centroX(r) - w / 2, Ret.centroY(r) - h / 2, w, h);
}

/**
 * Escreve o texto centralizado em cx com espacamento entre letras.
 * Faz o papel do android:letterSpacing (que e em "em", ou seja, fracao do
 * tamanho da fonte). O Canvas 2D so ganhou ctx.letterSpacing ha pouco tempo,
 * entao desenhamos letra a letra para funcionar em qualquer navegador.
 */
function desenharTextoEspacado(ctx, texto, cx, y, espacamento) {
  const letras = Array.from(texto);
  let total = 0;
  for (const ch of letras) total += ctx.measureText(ch).width + espacamento;
  total -= espacamento;
  const alinhamentoAnterior = ctx.textAlign;
  ctx.textAlign = "left";
  let x = cx - total / 2;
  for (const ch of letras) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + espacamento;
  }
  ctx.textAlign = alinhamentoAnterior;
}

class TelaDeMenu {

  constructor(app) {
    this.app = app;
    this.save = app.save;
    this.sound = app.sound;

    /** Fundo animado, usado enquanto a imagem do menu nao chegou. */
    this.fundo = new MenuBackgroundView();

    /**
     * Retangulos dos cinco botoes, na mesma ordem em que o onCreate do Kotlin
     * registrava os cliques: play, multiplayer, garage, settings, exit.
     */
    this.rects = {
      btnPlay: Ret.novo(0, 0, 0, 0),
      btnMultiplayer: Ret.novo(0, 0, 0, 0),
      btnGarage: Ret.novo(0, 0, 0, 0),
      btnSettings: Ret.novo(0, 0, 0, 0),
      btnExit: Ret.novo(0, 0, 0, 0)
    };
    /** Ordem de navegacao pelo teclado (a mesma ordem visual do XML). */
    this.ordem = ["btnPlay", "btnMultiplayer", "btnGarage", "btnSettings", "btnExit"];
    /** Imagem de cada botao (android:src do ImageButton). */
    this.imagens = {
      btnPlay: "menu_btn_play",
      btnMultiplayer: "menu_btn_multiplayer",
      btnGarage: "menu_btn_garage",
      btnSettings: "menu_btn_settings",
      btnExit: "menu_btn_exit"
    };
    /** Texto de reserva quando a imagem do botao ainda nao carregou. */
    this.rotulos = {
      btnPlay: "JOGAR",
      btnMultiplayer: "MULTIJOGADOR",
      btnGarage: "GARAGEM",
      btnSettings: "CONFIGURAÇÕES",
      btnExit: "SAIR"
    };

    this.pressionado = null;   // botao com o dedo em cima (faz o papel do state_pressed)
    this.foco = -1;            // botao destacado pelo teclado; -1 = nenhum

    this.coinsText = "🪙 0";   // igual ao binding.coinsText do onResume

    // Aviso curto no rodape. E o substituto do Toast do Android.
    this.aviso = "";
    this.avisoTempo = 0;

    this.painel = Ret.novo(0, 0, 0, 0);
    this.moedasRet = Ret.novo(0, 0, 0, 0);
    this.tela = Ret.novo(0, 0, 0, 0);
  }

  // ---------------------------------------------------------------- ciclo de vida

  /** Equivale ao onResume. */
  entrar() {
    this.hideSystemBars();
    this.coinsText = "🪙 " + this.save.coins;
    this.sound.startMusic("menu_music");
    this.fundo.start();
    this.pressionado = null;
  }

  /** Equivale ao onDestroy: solta os efeitos mas deixa a musica do menu tocando. */
  sair() {
    this.sound.releaseKeepMusic();
    this.fundo.stop();
  }

  /**
   * No app isso escondia as barras do sistema. No navegador a tela cheia so
   * pode ser pedida dentro de um toque do jogador, e quem faz isso e o main.js;
   * aqui fica so o gancho com o mesmo nome do Kotlin.
   */
  hideSystemBars() { /* nada a fazer no navegador */ }

  update(dt) {
    if (this.avisoTempo > 0) {
      this.avisoTempo -= dt;
      if (this.avisoTempo <= 0) this.aviso = "";
    }
  }

  /** Mostra um aviso curto no rodape. Faz o papel do Toast.LENGTH_SHORT. */
  mostrarAviso(texto) {
    this.aviso = texto;
    this.avisoTempo = 2.5;
  }

  // ---------------------------------------------------------------- medidas

  /**
   * Recalcula os retangulos do layout. O activity_main.xml foi desenhado para
   * um aparelho de 800x360dp: 28dp de padding lateral, 18dp em cima e embaixo,
   * coluna esquerda de peso 1, 18dp de margem e coluna direita de peso 1.05
   * com botoes de 360x60dp separados por 7dp.
   */
  medir(largura, altura) {
    // 1dp em pixels. Escolhemos o menor dos dois lados para o menu caber
    // inteiro em qualquer proporcao, do mesmo jeito que o fitCenter faz.
    const dp = Math.min(altura / 360, largura / 800);

    const padX = 28 * dp;
    const padY = 18 * dp;
    const margemEntreColunas = 18 * dp;

    const conteudo = largura - padX * 2 - margemEntreColunas;
    const colunaEsquerda = conteudo * (1 / 2.05);
    const colunaDireita = conteudo * (1.05 / 2.05);

    // Painel de vidro da esquerda (android:background="@drawable/panel_glass",
    // layout_height="match_parent" dentro do LinearLayout com padding).
    Ret.definir(this.painel, padX, padY, padX + colunaEsquerda, altura - padY);

    // Botoes: 360x60dp com 7dp entre eles. Somados dao 328dp, 4dp a mais que os
    // 324dp livres num aparelho de 360dp de altura — o Android espremia com os
    // pesos, aqui reduzimos tudo na mesma proporcao.
    let bh = 60 * dp;
    let bw = Math.min(360 * dp, colunaDireita);
    let espaco = 7 * dp;
    const disponivel = altura - padY * 2;
    const somaDosBotoes = bh * 5 + espaco * 4;
    if (somaDosBotoes > disponivel) {
      const encolher = disponivel / somaDosBotoes;
      bh *= encolher;
      bw *= encolher;
      espaco *= encolher;
    }

    const centroDireita = padX + colunaEsquerda + margemEntreColunas + colunaDireita / 2;
    const blocoAltura = bh * 5 + espaco * 4;
    let topo = (altura - blocoAltura) / 2;   // android:gravity="center" da coluna
    for (const nome of this.ordem) {
      Ret.definir(this.rects[nome], centroDireita - bw / 2, topo, centroDireita + bw / 2, topo + bh);
      topo += bh + espaco;
    }

    return { dp: dp, padX: padX, padY: padY };
  }

  // ---------------------------------------------------------------- desenho

  render(ctx, largura, altura) {
    const m = this.medir(largura, altura);
    const dp = m.dp;
    Ret.definir(this.tela, 0, 0, largura, altura);

    // android:background="#000000" do FrameLayout
    ctx.fillStyle = Cor.css(Cor.BLACK);
    ctx.fillRect(0, 0, largura, altura);

    // ImageView menuBackgroundImage: menu_bg_turbo_race em fitCenter.
    // Assets.img devolve null enquanto nao carregou (igual ao resId == 0 do
    // Kotlin); nesse caso entra o fundo animado do MenuBackgroundView.
    const bg = Assets.img("menu_bg_turbo_race");
    if (bg) {
      desenharFitCenter(ctx, bg, this.tela);
    } else {
      this.fundo.onDraw(ctx, largura, altura);
    }

    // View de veu por cima do fundo: android:background="#55020812"
    ctx.fillStyle = Cor.css(Cor.argb(0x55, 0x02, 0x08, 0x12));
    ctx.fillRect(0, 0, largura, altura);

    this.desenharPainelEsquerdo(ctx, dp);
    this.desenharBotoes(ctx, dp);
    this.desenharAviso(ctx, largura, altura, dp);
  }

  /** Coluna da esquerda: panel_glass com titulo, subtitulo e moedas. */
  desenharPainelEsquerdo(ctx, dp) {
    const p = this.painel;

    // drawable/panel_glass: cantos de 22dp, gradiente #D80B1432 -> #C4140630
    // (angle 270 = de cima para baixo) e contorno de 1.5dp em #8800F5FF.
    const vidro = ctx.createLinearGradient(0, p.top, 0, p.bottom);
    vidro.addColorStop(0, Cor.css(Cor.argb(0xD8, 0x0B, 0x14, 0x32)));
    vidro.addColorStop(1, Cor.css(Cor.argb(0xC4, 0x14, 0x06, 0x30)));
    retanguloArredondado(ctx, p, 22 * dp);
    ctx.fillStyle = vidro;
    ctx.fill();
    ctx.strokeStyle = Cor.css(Cor.argb(0x88, 0x00, 0xF5, 0xFF));
    ctx.lineWidth = 1.5 * dp;
    ctx.stroke();

    // Alturas do bloco central (android:gravity="center" do LinearLayout).
    const tituloTam = 32 * dp;      // textSize 32sp
    const subTam = 12 * dp;         // textSize 12sp
    const moedasTam = 18 * dp;      // textSize 18sp
    const moedasAltura = moedasTam + 16 * dp;   // paddingTop/Bottom de 8dp
    const total = tituloTam + 8 * dp + subTam + 18 * dp + moedasAltura;

    const cx = Ret.centroX(p);
    let y = Ret.centroY(p) - total / 2;

    // titleText: "TURBO RACE", neon_cyan, bold, letterSpacing 0.06,
    // com sombra de raio 20 em neon_magenta.
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = "bold " + tituloTam + "px " + FONTE;
    ctx.shadowColor = Cor.css(Cor.argb(0xFF, 0xFF, 0x2D, 0xAA));
    ctx.shadowBlur = 20 * dp;
    ctx.fillStyle = Cor.css(Cor.argb(0xFF, 0x00, 0xF5, 0xFF));
    y += tituloTam;
    desenharTextoEspacado(ctx, "TURBO RACE", cx, y, tituloTam * 0.06);
    ctx.shadowBlur = 0;

    // Subtitulo fixo do XML: "ARCADE LOOP RACING", text_dim, letterSpacing 0.28.
    y += 8 * dp + subTam;
    ctx.font = subTam + "px " + FONTE;
    ctx.fillStyle = Cor.css(Cor.argb(0xFF, 0xD2, 0xC7, 0xF0));
    desenharTextoEspacado(ctx, "ARCADE LOOP RACING", cx, y, subTam * 0.28);

    // coinsText dentro do panel_glass_pink: paddingStart/End 20dp, 8dp em cima
    // e embaixo, texto em amber (#FFD24D) e negrito.
    y += 18 * dp;
    ctx.font = "bold " + moedasTam + "px " + FONTE;
    const larguraDoTexto = ctx.measureText(this.coinsText).width;
    Ret.definir(this.moedasRet,
      cx - larguraDoTexto / 2 - 20 * dp, y,
      cx + larguraDoTexto / 2 + 20 * dp, y + moedasAltura);
    const rosa = ctx.createLinearGradient(0, this.moedasRet.top, 0, this.moedasRet.bottom);
    rosa.addColorStop(0, Cor.css(Cor.argb(0xD8, 0x17, 0x08, 0x2F)));
    rosa.addColorStop(1, Cor.css(Cor.argb(0xC4, 0x2C, 0x07, 0x3B)));
    retanguloArredondado(ctx, this.moedasRet, 22 * dp);
    ctx.fillStyle = rosa;
    ctx.fill();
    ctx.strokeStyle = Cor.css(Cor.argb(0x88, 0xFF, 0x2D, 0xAA));
    ctx.lineWidth = 1.5 * dp;
    ctx.stroke();
    ctx.fillStyle = Cor.css(Cor.argb(0xFF, 0xFF, 0xD2, 0x4D));
    ctx.fillText(this.coinsText, cx, y + 8 * dp + moedasTam * 0.82);
  }

  /** Coluna da direita: os cinco ImageButton em fitCenter. */
  desenharBotoes(ctx, dp) {
    for (let i = 0; i < this.ordem.length; i++) {
      const nome = this.ordem[i];
      const r = this.rects[nome];

      // O Android trocava a imagem no state_pressed; aqui encolhemos um
      // tiquinho o botao para dar a mesma sensacao de afundar.
      const encolhe = (this.pressionado === nome) ? 0.96 : 1;
      const cx = Ret.centroX(r);
      const cy = Ret.centroY(r);
      const w = Ret.largura(r) * encolhe;
      const h = Ret.altura(r) * encolhe;
      const alvo = Ret.novo(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);

      // Destaque de quem esta selecionado pelo teclado (o Android tinha foco
      // de D-pad de graca; no canvas precisamos desenhar).
      if (this.foco === i) {
        retanguloArredondado(ctx, r, 12 * dp);
        ctx.strokeStyle = Cor.css(Cor.argb(0xFF, 0x00, 0xF5, 0xFF));
        ctx.lineWidth = 2 * dp;
        ctx.stroke();
      }

      const img = Assets.img(this.imagens[nome]);
      if (img) {
        desenharFitCenter(ctx, img, alvo);
      } else {
        // Reserva enquanto a imagem nao chega: caixa de vidro com o rotulo.
        const vidro = ctx.createLinearGradient(0, alvo.top, 0, alvo.bottom);
        vidro.addColorStop(0, Cor.css(Cor.argb(0xD8, 0x17, 0x08, 0x2F)));
        vidro.addColorStop(1, Cor.css(Cor.argb(0xC4, 0x2C, 0x07, 0x3B)));
        retanguloArredondado(ctx, alvo, 14 * dp);
        ctx.fillStyle = vidro;
        ctx.fill();
        ctx.strokeStyle = Cor.css(Cor.argb(0x88, 0x00, 0xF5, 0xFF));
        ctx.lineWidth = 1.5 * dp;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.font = "bold " + (20 * dp) + "px " + FONTE;
        ctx.fillStyle = Cor.css(Cor.WHITE);
        ctx.fillText(this.rotulos[nome], Ret.centroX(alvo), Ret.centroY(alvo) + 7 * dp);
      }
    }
  }

  /** Aviso curto no rodape (o Toast do Android). */
  desenharAviso(ctx, largura, altura, dp) {
    if (this.avisoTempo <= 0 || !this.aviso) return;

    const tam = 16 * dp;
    ctx.font = "bold " + tam + "px " + FONTE;
    const w = ctx.measureText(this.aviso).width + 40 * dp;
    const h = tam + 20 * dp;
    const caixa = Ret.novo(largura / 2 - w / 2, altura - h - 24 * dp, largura / 2 + w / 2, altura - 24 * dp);

    // Some devagar no ultimo meio segundo, como o Toast fazia.
    const alfa = limitar(this.avisoTempo / 0.5, 0, 1);
    retanguloArredondado(ctx, caixa, 14 * dp);
    ctx.fillStyle = Cor.css(Cor.argb(Math.round(0xE0 * alfa), 0x0B, 0x14, 0x32));
    ctx.fill();
    ctx.strokeStyle = Cor.css(Cor.argb(Math.round(0x88 * alfa), 0xFF, 0x2D, 0xAA));
    ctx.lineWidth = 1.5 * dp;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = Cor.css(Cor.WHITE, Math.round(255 * alfa));
    ctx.fillText(this.aviso, Ret.centroX(caixa), Ret.centroY(caixa) + tam * 0.36);
  }

  // ---------------------------------------------------------------- toque

  /** tipo: "baixo" | "move" | "cima". Faz o papel do setOnClickListener. */
  aoApontar(tipo, x, y) {
    if (tipo === "baixo") {
      this.pressionado = this.botaoEm(x, y);
      if (this.pressionado) {
        this.foco = this.ordem.indexOf(this.pressionado);
        this.sound.playClick();
      }
      return;
    }
    if (tipo === "move") {
      // Saiu de cima do botao com o dedo apoiado: cancela, igual ao Android.
      if (this.pressionado && this.botaoEm(x, y) !== this.pressionado) this.pressionado = null;
      return;
    }
    if (tipo === "cima") {
      const alvo = this.pressionado;
      this.pressionado = null;
      if (alvo && this.botaoEm(x, y) === alvo) this.acionar(alvo);
    }
  }

  /** Nome do botao sob o ponto, ou null. */
  botaoEm(x, y) {
    for (const nome of this.ordem) {
      if (Ret.contem(this.rects[nome], x, y)) return nome;
    }
    return null;
  }

  /** Os mesmos destinos dos setOnClickListener do onCreate, na mesma ordem. */
  acionar(nome) {
    switch (nome) {
      case "btnPlay":
        this.app.irPara("worldtour");
        break;
      case "btnMultiplayer":
        // No app isso abria a MultiplayerActivity (Bluetooth local). O navegador
        // nao fala Bluetooth classico, entao o multijogador aqui e a sala online
        // por WebSocket — ver PORTE.md e js/online.js.
        this.app.irPara("online");
        break;
      case "btnGarage":
        this.app.irPara("garagem");
        break;
      case "btnSettings":
        this.app.irPara("config");
        break;
      case "btnExit":
        // Na versão web, sair do jogo devolve o jogador à home da VM Games.
        window.location.assign("https://vmgames.com.br/");
        break;
    }
  }

  // ---------------------------------------------------------------- teclado

  /** Navegacao pelo teclado; o D-pad do Android fazia isso sozinho. */
  aoTeclar(evento, apertou) {
    if (!apertou) return;
    const codigo = evento.code;
    if (codigo === "ArrowDown" || codigo === "ArrowRight") {
      this.foco = (this.foco + 1) % this.ordem.length;
      this.sound.playClick();
    } else if (codigo === "ArrowUp" || codigo === "ArrowLeft") {
      this.foco = (this.foco <= 0 ? this.ordem.length : this.foco) - 1;
      this.sound.playClick();
    } else if (codigo === "Enter" || codigo === "NumpadEnter" || codigo === "Space") {
      if (this.foco >= 0) {
        this.sound.playClick();
        this.acionar(this.ordem[this.foco]);
      }
    } else if (codigo === "Escape") {
      // Equivale ao botao Voltar do aparelho no menu principal: sairia do jogo.
      this.acionar("btnExit");
    }
  }
}

window.MiniCar = MiniCar;
window.MenuBackgroundView = MenuBackgroundView;
window.desenharFitCenter = desenharFitCenter;
window.desenharTextoEspacado = desenharTextoEspacado;
window.TelaDeMenu = TelaDeMenu;
