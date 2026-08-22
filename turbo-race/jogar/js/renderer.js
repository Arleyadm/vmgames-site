"use strict";
/*
 * Responsavel por TODO o desenho do mundo 3D em um Canvas:
 *  - ceu em gradiente + montanhas/predios ao fundo (com parallax)
 *  - a estrada projetada em perspectiva (trapezios), grama, faixas de borda
 *    (rumble) e faixa central
 *  - cenario lateral, moedas e carros adversarios (desenhados de tras para
 *    frente para a sobreposicao ficar correta)
 *  - o carro do jogador na parte de baixo
 *
 * Porte 1:1 de Renderer.kt. O Canvas do Android virou o
 * CanvasRenderingContext2D: o "canvas" que era o primeiro parametro de cada
 * funcao agora e o "ctx". O Paint reaproveitado do Kotlin nao existe aqui —
 * cada desenho define fillStyle/strokeStyle na hora, que e o equivalente.
 */
class Renderer {

  constructor() {
    // ---- Configuracao definida quando o tamanho da tela e conhecido ----
    this.width = 0;
    this.height = 0;
    this.halfW = 0;
    this.halfH = 0;

    this.roadWidth = 2000;
    this.segmentLength = 200;
    this.lanes = 3;
    this.cameraHeight = 1000;
    this.cameraDepth = 0.96;
    this.drawDistance = 158;
    this.fogDensity = 4.35;
    this.roadSpeedEffect = 0;
    this.renderTime = 0;
    // "auto", "sun", "rain_light", "rain_heavy", "snow", "fog" ou "night".
    this.weatherOverride = "auto";

    // Reaproveitamos objetos de desenho para nao gerar lixo a cada frame.
    this.rect = Ret.novo(0, 0, 0, 0);
    this.skyShader = null;
    this.lastStageName = "";

    // ---- Sprites dos carros (opcionais) ----
    // No Android a GameView entregava os Bitmaps prontos. Aqui guardamos so os
    // NOMES dos recursos: Assets.img() faz o papel do getIdentifier +
    // decodeResource e devolve null enquanto a imagem nao chegou (mesma coisa
    // que o resId == 0 do Kotlin). Se uma posicao for null, o carro
    // correspondente e desenhado com formas.
    this.carSprites = [];
    this.playerRightSprites = [];
    this.playerLeftSprites = [];
    for (let i = 0; i < EnemyCar.SPRITE_COUNT; i++) {
      this.carSprites.push("car_" + i);
      this.playerLeftSprites.push("car_" + i + "_left");
      this.playerRightSprites.push("car_" + i + "_right");
    }
    this.rioLitoraneoBg = "rio_litoraneo_bg";
    this.stageBackgrounds = Renderer.STAGE_BACKGROUNDS;
    this.propSprites = Renderer.PROP_SPRITES;
    this.finishPortalSprite = "finish_portal_custom";
    this.coinSprite = "moeda";

    // Equivale ao spritePaint do Kotlin: alfa (0..255) aplicado ao proximo
    // drawImage e o isFilterBitmap (suavizacao ao ampliar a imagem).
    this.spritePaint = { alpha: 255, isFilterBitmap: false };

    // Filtro vermelho aplicado ao sprite do jogador quando ele bate (piscar).
    // No Android era um PorterDuffColorFilter(argb(170,255,60,60), SRC_ATOP).
    // Aqui usamos um canvas pequeno fora de tela: desenhamos o sprite nele e
    // cobrimos so os pixels do sprite com o vermelho usando
    // globalCompositeOperation = "source-atop". Foi o caminho escolhido porque
    // aplicar "source-atop" direto no canvas principal pintaria tambem o fundo
    // que ja foi desenhado (la nao existe area transparente para recortar).
    this.flashCanvas = document.createElement("canvas");
    this.flashCanvas.width = 1;
    this.flashCanvas.height = 1;
    this.flashCtx = this.flashCanvas.getContext("2d");
  }

  setup(w, h) {
    this.width = w;
    this.height = h;
    this.halfW = w / 2;
    this.halfH = h / 2;
    this.skyShader = null; // forca recriar o gradiente do ceu
  }

  // ---------------- Ajudantes do porte (o Android tinha estes prontos) ----------------

  /** Nome de recurso -> HTMLImageElement, ou null enquanto a imagem nao chegou. */
  bitmap(nome) {
    if (!nome) return null;
    return Assets.img(nome);
  }

  /** Equivale ao canvas.drawOval(rect, paint): monta a elipse inscrita no retangulo. */
  ovalDoRet(ctx, r) {
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const rx = Math.abs(r.right - r.left) / 2;
    const ry = Math.abs(r.bottom - r.top) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }

  /** Equivale ao canvas.drawLine(x1,y1,x2,y2,paint) com Paint.Style.STROKE. */
  linha(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // ---------------- Projecao em perspectiva ----------------

  project(p, camX, camY, camZ, virtualZ) {
    const vz = (virtualZ === undefined) ? p.world.z : virtualZ;
    p.camera.x = p.world.x - camX;
    p.camera.y = p.world.y - camY;
    p.camera.z = vz - camZ;
    if (p.camera.z < 0.1) p.camera.z = 0.1;
    p.screen.scale = this.cameraDepth / p.camera.z;
    p.screen.x = this.halfW + (p.screen.scale * p.camera.x * this.halfW);
    p.screen.y = this.halfH - (p.screen.scale * p.camera.y * this.halfH);
    p.screen.w = p.screen.scale * this.roadWidth * this.halfW;
  }

  exponentialFog(distance, density) {
    return 1 / Math.pow(Math.E, distance * distance * density);
  }

  // ---------------- Render principal ----------------

  render(ctx, segments, stage, player, baseIndex, basePercent, playerY, bgOffset, time, headlightsOn) {
    if (headlightsOn === undefined) headlightsOn = false;

    // 1) Fundo (ceu + montanhas/predios) com clima/hora variaveis.
    this.drawBackground(ctx, stage, bgOffset, time);
    this.drawPremiumAtmosphere(ctx, stage, bgOffset, time);

    // 2) Estrada (da frente para tras, com recorte por morro)
    let maxy = this.height;
    let x = 0;
    let dx = -(segments[baseIndex].curve * basePercent);
    const speedP = limitar(player.speed / player.maxSpeed, 0, 1.25);
    this.roadSpeedEffect = speedP;
    this.renderTime = time;
    const cameraLean = player.visualSteer * this.roadWidth * (0.045 + speedP * 0.018);
    const camXBase = player.x * this.roadWidth + cameraLean;
    const position = player.position;
    const dynamicCameraHeight = this.cameraHeight - speedP * 195 - Math.abs(player.visualSteer) * 14;

    const n = Math.min(this.drawDistance, segments.length);
    for (let i = 0; i < n; i++) {
      const virtualIndex = baseIndex + i;
      const seg = segments[virtualIndex % segments.length];
      seg.fog = this.exponentialFog(i / this.drawDistance, this.fogDensity);
      seg.clip = maxy;

      // Circuito em loop: quando passa do fim da lista, o mesmo segmento
      // e projetado com um Z virtual a frente da camera. Assim a volta
      // recomeca sem quebrar a perspectiva.
      this.project(seg.p1, camXBase - x, playerY + dynamicCameraHeight, position, virtualIndex * this.segmentLength);
      this.project(seg.p2, camXBase - x - dx, playerY + dynamicCameraHeight, position, (virtualIndex + 1) * this.segmentLength);

      x += dx;
      dx += seg.curve;

      // Descarta segmentos atras da camera, de costas ou cobertos por morro.
      if (seg.p1.camera.z <= this.cameraDepth ||
        seg.p2.screen.y >= seg.p1.screen.y ||
        seg.p2.screen.y >= maxy
      ) continue;

      this.drawSegmentBand(ctx, stage, seg);
      maxy = seg.p2.screen.y;
    }

    // 3) Cenario, moedas e carros (de tras para frente)
    for (let i = n - 1; i >= 0; i--) {
      const seg = segments[(baseIndex + i) % segments.length];
      const scale = seg.p1.screen.scale;
      if (scale <= 0) continue;
      const unit = scale * this.roadWidth * this.halfW;

      // Moedas
      for (let ci = 0; ci < seg.coins.length; ci++) {
        const coin = seg.coins[ci];
        if (coin.collected) continue;
        if (seg.p1.screen.y > seg.clip) continue;
        this.drawCoin(ctx, seg, coin, unit, time);
      }
      // Cenario lateral.
      // V48: nao cortamos mais placas/arvores/arbustos cedo demais pelo clip da pista.
      // O proprio drawSprite limita o objeto quando ele sai da tela, evitando o sumico
      // antes de o jogador chegar perto.
      for (let si = 0; si < seg.sprites.length; si++) {
        this.drawSprite(ctx, stage, seg, seg.sprites[si], unit);
      }
      // Carros adversarios
      for (let ai = 0; ai < seg.cars.length; ai++) {
        if (seg.p1.screen.y > seg.clip) continue;
        this.drawEnemy(ctx, seg, seg.cars[ai], unit);
      }
    }

    // 4) Escuridao especial da fase 3 do Brasil.
    // A pista fica escura; so ganha leitura visual quando o farol esta ligado.
    if (this.isBrazilStage3(stage)) {
      this.drawDeepDarkness(ctx, headlightsOn);
    } else if (this.isDarkWeatherStage(stage)) {
      this.drawNightVisibility(ctx, headlightsOn);
    }

    // 5) Sensacao de velocidade: em alta velocidade ja aparece rastro,
    // e no turbo fica ainda mais intenso.
    const speedEffect = limitar(player.speed / player.maxSpeed, 0, 1.25);
    if (speedEffect > 0.18 || player.turboActive) {
      this.drawSpeedStreaks(ctx, time, speedEffect, player.turboActive);
    }
    if (player.turboActive) {
      this.drawBoostVignette(ctx, time);
    }

    // 6) Carro do jogador
    this.drawPlayer(ctx, player, time, headlightsOn);

    // 7) Clima por cima da pista, mas antes do HUD.
    this.drawWeatherOverlay(ctx, stage, time);

    // 8) Acabamento retro: leve scanline para lembrar jogos arcade classicos.
    this.drawRetroOverlay(ctx);
  }

  drawRetroOverlay(ctx) {
    ctx.fillStyle = Cor.css(Cor.argb(22, 0, 0, 0));
    let y = 0;
    while (y < this.height) {
      ctx.fillRect(0, y, this.width, 1);
      y += 12;
    }
    ctx.fillStyle = Cor.css(Cor.argb(20, 255, 255, 255));
    ctx.fillRect(0, 0, this.width, this.height * 0.02);
  }

  drawPremiumAtmosphere(ctx, stage, bgOffset, time) {
    if (this.width <= 0 || this.height <= 0) return;
    const env = this.environmentOf(stage);

    // Luz cinematografica do ceu para deixar as pistas mais vivas mesmo quando ha PNG de fundo.
    let glowA;
    switch (env) {
      case "night": glowA = Cor.argb(92, 0x48, 0x2A, 0xB8); break;
      case "rain": glowA = Cor.argb(52, 0x9A, 0xC8, 0xFF); break;
      case "fog": glowA = Cor.argb(46, 255, 255, 255); break;
      case "snow": glowA = Cor.argb(62, 0xD8, 0xF0, 0xFF); break;
      case "sunset": glowA = Cor.argb(74, 0xFF, 0xA0, 0x42); break;
      default: glowA = Cor.argb(58, 0xFF, 0xF2, 0xA8); break;
    }
    // Gradiente 1: brilho diagonal do ceu.
    let grad = ctx.createLinearGradient(this.width * 0.15, 0, this.width * 0.88, this.height * 0.52);
    grad.addColorStop(0, Cor.css(glowA));
    grad.addColorStop(1, Cor.css(Cor.argb(0, 255, 255, 255)));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height * 0.62);

    // Gradiente 2: brilho no horizonte para integrar ceu, cenario e pista.
    grad = ctx.createLinearGradient(0, this.height * 0.43, 0, this.height * 0.74);
    grad.addColorStop(0, Cor.css(Cor.argb(env === "night" ? 34 : 42, 255, 255, 255)));
    grad.addColorStop(1, Cor.css(Cor.argb(0, 255, 255, 255)));
    ctx.fillStyle = grad;
    ctx.fillRect(0, this.height * 0.42, this.width, this.height * 0.74 - this.height * 0.42);

    // Particulas/poeira/luzes discretas em movimento: da vida sem pesar o jogo.
    let particleCount;
    switch (env) {
      case "rain": case "snow": case "fog": particleCount = 10; break;
      case "night": particleCount = 22; break;
      default: particleCount = 16; break;
    }
    let i = 0;
    while (i < particleCount) {
      const drift = (env === "night") ? bgOffset * 0.055 : bgOffset * 0.10;
      const x = ((i * 127 + drift + Math.sin(time * 0.9 + i) * this.width * 0.025) % this.width);
      const y = this.height * (0.30 + ((i * 37) % 34) / 100);
      const r = this.height * (0.0028 + (i % 3) * 0.0014);
      let cor;
      switch (env) {
        case "night": cor = Cor.argb(72 + (i % 3) * 20, 0xA8, 0xF2, 0xFF); break;
        case "sunset": cor = Cor.argb(48, 0xFF, 0xD0, 0x78); break;
        case "snow": cor = Cor.argb(42, 255, 255, 255); break;
        default: cor = Cor.argb(34, 255, 255, 255); break;
      }
      ctx.fillStyle = Cor.css(cor);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      i++;
    }

    // Passaros pequenos em fases claras, para as pistas parecerem mais vivas.
    if (env !== "night" && env !== "rain" && env !== "snow") {
      ctx.lineWidth = this.height * 0.0022;
      ctx.strokeStyle = Cor.css(Cor.argb(90, 0x20, 0x28, 0x32));
      let b = 0;
      while (b < 5) {
        const bx = ((b * 211 - bgOffset * 0.025 + time * 11) % (this.width + 120)) - 60;
        const by = this.height * (0.12 + (b % 3) * 0.052);
        const s = this.height * (0.012 + (b % 2) * 0.004);
        this.linha(ctx, bx - s, by, bx, by - s * 0.42);
        this.linha(ctx, bx, by - s * 0.42, bx + s, by);
        b++;
      }
    }
  }

  // ---------------- Fundo ----------------

  isRioLitoraneo(stage) {
    return stage.countryIndex === 0 && stage.numberInCountry === 2;
  }

  backgroundBitmapFor(stage) {
    const nome = this.stageBackgrounds[stage.name] ||
      (this.isRioLitoraneo(stage) ? this.rioLitoraneoBg : null);
    if (!nome) return null;
    const bmp = Assets.img(nome);
    if (bmp === null && this.lastStageName !== nome) {
      // O fundo da fase e a imagem mais pesada do jogo e entra sob demanda.
      // Pedimos o carregamento uma unica vez por fase (lastStageName guarda
      // qual ja foi pedido); no frame em que ela chegar, ja aparece.
      this.lastStageName = nome;
      Assets.imgAsync(nome);
    }
    return bmp;
  }

  drawBitmapStageBackground(ctx, bmp, parallax) {
    const srcW = bmp.naturalWidth;
    const srcH = bmp.naturalHeight;
    if (srcW <= 0 || srcH <= 0) return;

    // Center-crop cobrindo toda a tela, com margem extra para o parallax.
    // Tambem desenha copias laterais da arte para nunca aparecer faixa preta
    // quando o fundo desloca para a esquerda/direita.
    const coverWidth = this.width * 1.34;
    const scale = Math.max(coverWidth / srcW, this.height / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const shiftX = ((parallax * 0.16) % (this.width * 0.28)) - this.width * 0.14;
    const baseLeft = (this.width - drawW) * 0.5 + shiftX;
    const top = (this.height - drawH) * 0.44;
    this.spritePaint.alpha = 255;
    ctx.globalAlpha = 1;

    const offsets = [-1, 0, 1];
    for (let k = 0; k < offsets.length; k++) {
      const left = baseLeft + drawW * offsets[k];
      ctx.drawImage(bmp, 0, 0, srcW, srcH, left, top, drawW, drawH);
    }

    // Gradiente 3: velo leve para integrar melhor a estrada por cima.
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, Cor.css(Cor.argb(0, 255, 255, 255)));
    grad.addColorStop(1, Cor.css(Cor.argb(42, 255, 225, 190)));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawBackground(ctx, stage, bgOffset, time) {
    const env = this.environmentOf(stage);

    const bgBmp = this.backgroundBitmapFor(stage);
    if (bgBmp !== null) {
      this.drawBitmapStageBackground(ctx, bgBmp, bgOffset);

      // Ajuste fino por clima/horario: apenas um veu leve para a arte se integrar ao jogo.
      switch (env) {
        case "night":
          ctx.fillStyle = Cor.css(Cor.argb(56, 0x06, 0x08, 0x1E));
          ctx.fillRect(0, 0, this.width, this.height);
          break;
        case "rain":
          ctx.fillStyle = Cor.css(Cor.argb(30, 0x62, 0x78, 0x8F));
          ctx.fillRect(0, 0, this.width, this.height);
          break;
        case "fog":
          ctx.fillStyle = Cor.css(Cor.argb(48, 0xD7, 0xE3, 0xEA));
          ctx.fillRect(0, 0, this.width, this.height);
          break;
        case "snow":
          ctx.fillStyle = Cor.css(Cor.argb(18, 255, 255, 255));
          ctx.fillRect(0, 0, this.width, this.height);
          break;
        case "sunset":
          ctx.fillStyle = Cor.css(Cor.argb(16, 0xFF, 0xB2, 0x5A));
          ctx.fillRect(0, 0, this.width, this.height);
          break;
      }
      return;
    }

    // Mesmo que a fase venha com paleta escura, o fundo agora e calculado
    // pelo clima/horario para ter manha, tarde, noite, chuva e neve.
    let top;
    let bottom;
    switch (env) {
      case "night":
        top = Cor.rgb(0x06, 0x08, 0x1E);
        bottom = Cor.rgb(0x1A, 0x23, 0x4D);
        break;
      case "rain":
        top = Cor.rgb(0x2D, 0x39, 0x55);
        bottom = Cor.rgb(0x72, 0x7F, 0x93);
        break;
      case "fog":
        top = Cor.rgb(0xB8, 0xC8, 0xD6);
        bottom = Cor.rgb(0xE2, 0xEA, 0xEE);
        break;
      case "snow":
        top = Cor.rgb(0xB9, 0xD8, 0xF6);
        bottom = Cor.rgb(0xF3, 0xF8, 0xFF);
        break;
      case "sunset":
        top = Cor.rgb(0xFF, 0x83, 0x4D);
        bottom = Cor.rgb(0xFF, 0xD1, 0x75);
        break;
      case "afternoon":
        top = Cor.rgb(0x3B, 0x8D, 0xE8);
        bottom = Cor.rgb(0xB6, 0xE2, 0xFF);
        break;
      default: // morning
        top = Cor.rgb(0x73, 0xC7, 0xFF);
        bottom = Cor.rgb(0xFF, 0xEC, 0xB0);
        break;
    }

    // Gradiente 4: o ceu propriamente dito.
    const grad = ctx.createLinearGradient(0, 0, 0, this.height * 0.78);
    grad.addColorStop(0, Cor.css(top));
    grad.addColorStop(1, Cor.css(bottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Sol, lua ou brilho escondido atras de nuvens.
    const sunX = (this.width * 0.72 - bgOffset * 0.16) % (this.width + this.height * 0.30);
    switch (env) {
      case "night":
        ctx.fillStyle = Cor.css(Cor.rgb(0xEA, 0xF1, 0xFF));
        ctx.beginPath();
        ctx.arc(sunX, this.height * 0.20, this.height * 0.070, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = Cor.css(Cor.argb(255, 0x06, 0x08, 0x1E));
        ctx.beginPath();
        ctx.arc(sunX + this.height * 0.028, this.height * 0.18, this.height * 0.060, 0, Math.PI * 2);
        ctx.fill();
        this.drawStars(ctx, bgOffset);
        break;
      case "rain":
        ctx.fillStyle = Cor.css(Cor.argb(120, 0xD8, 0xE8, 0xFF));
        ctx.beginPath();
        ctx.arc(sunX, this.height * 0.20, this.height * 0.060, 0, Math.PI * 2);
        ctx.fill();
        this.drawClouds(ctx, bgOffset, true);
        break;
      case "fog":
        ctx.fillStyle = Cor.css(Cor.argb(82, 0xF3, 0xF8, 0xFF));
        ctx.beginPath();
        ctx.arc(sunX, this.height * 0.20, this.height * 0.052, 0, Math.PI * 2);
        ctx.fill();
        this.drawClouds(ctx, bgOffset, true);
        break;
      case "snow":
        ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xFF, 0xF2));
        ctx.beginPath();
        ctx.arc(sunX, this.height * 0.18, this.height * 0.080, 0, Math.PI * 2);
        ctx.fill();
        this.drawClouds(ctx, bgOffset, false);
        break;
      case "sunset":
        ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xF0, 0x95));
        ctx.beginPath();
        ctx.arc(sunX, this.height * 0.29, this.height * 0.115, 0, Math.PI * 2);
        ctx.fill();
        this.drawClouds(ctx, bgOffset, false);
        break;
      default:
        ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xF8, 0xC8));
        ctx.beginPath();
        ctx.arc(sunX, this.height * 0.20, this.height * 0.085, 0, Math.PI * 2);
        ctx.fill();
        this.drawClouds(ctx, bgOffset, false);
        break;
    }

    // Camada de montanhas/predios ao fundo com formas mais ousadas e variadas.
    const horizon = this.height * 0.56;
    let mountainBase;
    switch (env) {
      case "night": mountainBase = Cor.rgb(0x12, 0x16, 0x2A); break;
      case "rain": mountainBase = Cor.rgb(0x3F, 0x48, 0x5C); break;
      case "fog": mountainBase = Cor.rgb(0x9C, 0xAD, 0xB9); break;
      case "snow": mountainBase = Cor.rgb(0xD9, 0xE7, 0xF8); break;
      case "sunset": mountainBase = Cor.rgb(0xA7, 0x58, 0x52); break;
      default: mountainBase = stage.mountainColor; break;
    }

    // Camada distante.
    ctx.fillStyle = Cor.css(Cor.argb(190, Cor.red(mountainBase), Cor.green(mountainBase), Cor.blue(mountainBase)));
    ctx.beginPath();
    ctx.moveTo(-140, horizon);
    const farShift = (bgOffset * 0.28) % this.width;
    let px = -140 - farShift;
    let wave = 0;
    while (px < this.width + 260) {
      let span;
      switch (wave % 4) {
        case 0: span = 280; break;
        case 1: span = 220; break;
        case 2: span = 340; break;
        default: span = 180; break;
      }
      let alturaPico1;
      switch (wave % 5) {
        case 0: alturaPico1 = this.height * 0.08; break;
        case 1: alturaPico1 = this.height * 0.16; break;
        case 2: alturaPico1 = this.height * 0.11; break;
        case 3: alturaPico1 = this.height * 0.19; break;
        default: alturaPico1 = this.height * 0.10; break;
      }
      const peak1 = horizon - alturaPico1;
      let alturaPico2;
      switch (wave % 4) {
        case 0: alturaPico2 = this.height * 0.05; break;
        case 1: alturaPico2 = this.height * 0.09; break;
        case 2: alturaPico2 = this.height * 0.04; break;
        default: alturaPico2 = this.height * 0.12; break;
      }
      const peak2 = horizon - alturaPico2;
      ctx.lineTo(px + span * 0.34, peak1);
      ctx.lineTo(px + span * 0.62, peak2);
      ctx.lineTo(px + span, horizon);
      px += span;
      wave++;
    }
    ctx.lineTo(this.width + 260, horizon);
    ctx.lineTo(this.width + 260, this.height);
    ctx.lineTo(-140, this.height);
    ctx.closePath();
    ctx.fill();

    // Camada proxima.
    const nearColor = Cor.rgb(
      limitar(Math.trunc(Cor.red(mountainBase) * 0.82), 0, 255),
      limitar(Math.trunc(Cor.green(mountainBase) * 0.82), 0, 255),
      limitar(Math.trunc(Cor.blue(mountainBase) * 0.82), 0, 255)
    );
    ctx.fillStyle = Cor.css(nearColor);
    ctx.beginPath();
    ctx.moveTo(-140, horizon + this.height * 0.015);
    const nearShift = (bgOffset * 0.55) % this.width;
    px = -140 - nearShift;
    wave = 0;
    while (px < this.width + 260) {
      let span;
      switch (wave % 5) {
        case 0: span = 160; break;
        case 1: span = 230; break;
        case 2: span = 200; break;
        case 3: span = 300; break;
        default: span = 140; break;
      }
      let alturaPico1;
      switch (wave % 6) {
        case 0: alturaPico1 = this.height * 0.12; break;
        case 1: alturaPico1 = this.height * 0.21; break;
        case 2: alturaPico1 = this.height * 0.09; break;
        case 3: alturaPico1 = this.height * 0.18; break;
        case 4: alturaPico1 = this.height * 0.14; break;
        default: alturaPico1 = this.height * 0.24; break;
      }
      const peak1 = horizon - alturaPico1;
      let alturaPico2;
      switch (wave % 3) {
        case 0: alturaPico2 = this.height * 0.06; break;
        case 1: alturaPico2 = this.height * 0.11; break;
        default: alturaPico2 = this.height * 0.08; break;
      }
      const peak2 = horizon - alturaPico2;
      ctx.lineTo(px + span * 0.28, peak1);
      ctx.lineTo(px + span * 0.58, peak2);
      ctx.lineTo(px + span, horizon + this.height * 0.015);
      px += span;
      wave++;
    }
    ctx.lineTo(this.width + 260, horizon + this.height * 0.015);
    ctx.lineTo(this.width + 260, this.height);
    ctx.lineTo(-140, this.height);
    ctx.closePath();
    ctx.fill();

    // Neblina baixa em chuva/neve para dar profundidade.
    if (env === "rain" || env === "snow" || env === "fog") {
      let corNeblina;
      switch (env) {
        case "snow": corNeblina = Cor.argb(95, 255, 255, 255); break;
        case "fog": corNeblina = Cor.argb(132, 0xD8, 0xE2, 0xE8); break;
        default: corNeblina = Cor.argb(70, 0xB8, 0xC2, 0xD1); break;
      }
      ctx.fillStyle = Cor.css(corNeblina);
      ctx.fillRect(0, this.height * 0.43, this.width, this.height * 0.70 - this.height * 0.43);
    }
  }

  environmentOf(stage) {
    switch (this.weatherOverride) {
      case "sun": return "morning";
      case "rain_light": case "rain_heavy": return "rain";
      case "snow": return "snow";
      case "fog": return "fog";
      case "night": return "night";
    }
    const n = stage.name.toLowerCase();
    if (this.isBrazilStage3(stage)) return "night";
    if (this.isSnowStage(stage)) return "snow";
    if (this.isRainStage(stage)) return "rain";
    if (this.isFogStage(stage)) return "fog";
    if (this.isDarkWeatherStage(stage)) return "night";
    if (n.indexOf("pantanal") >= 0 || n.indexOf("sunset") >= 0 || n.indexOf("final") >= 0 || n.indexOf("toscana") >= 0) return "sunset";
    if (stage.numberInCountry % 3 === 0) return "afternoon";
    return "morning";
  }

  isDarkWeatherStage(stage) {
    if (this.weatherOverride === "night") return true;
    if (this.weatherOverride !== "auto") return false;
    const n = stage.name.toLowerCase();
    return stage.isNight || n.indexOf("night") >= 0 || n.indexOf("noite") >= 0 ||
      n.indexOf("neon") >= 0 || n.indexOf("shibuya") >= 0 || n.indexOf("vegas") >= 0;
  }

  isRainStage(stage) {
    if (this.weatherOverride === "rain_light" || this.weatherOverride === "rain_heavy") return true;
    if (this.weatherOverride !== "auto") return false;
    const n = stage.name.toLowerCase();
    return (stage.countryIndex === 0 && stage.numberInCountry === 1) ||
      n.indexOf("rain") >= 0 || n.indexOf("chuva") >= 0 || n.indexOf("new york") >= 0 ||
      n.indexOf("milano") >= 0 || n.indexOf("temporale") >= 0;
  }

  isFogStage(stage) {
    if (this.weatherOverride === "fog") return true;
    if (this.weatherOverride !== "auto") return false;
    const n = stage.name.toLowerCase();
    return n.indexOf("neblina") >= 0 || n.indexOf("curitiba") >= 0 || n.indexOf("pantanal") >= 0;
  }

  isSnowStage(stage) {
    if (this.weatherOverride === "snow") return true;
    if (this.weatherOverride !== "auto") return false;
    const n = stage.name.toLowerCase();
    return n.indexOf("snow") >= 0 || n.indexOf("neve") >= 0 || n.indexOf("alpino") >= 0 ||
      n.indexOf("fuji") >= 0 || n.indexOf("sapporo") >= 0 || n.indexOf("rocky") >= 0 ||
      n.indexOf("gramado") >= 0 || n.indexOf("dolomiti") >= 0;
  }

  isWetRoadStage(stage) {
    return this.isRainStage(stage) || this.isFogStage(stage) || this.isSnowStage(stage) || this.isDarkWeatherStage(stage);
  }

  drawClouds(ctx, bgOffset, dark) {
    const cloudColor = dark
      ? Cor.argb(118, 0x3A, 0x45, 0x5A)
      : Cor.argb(132, 255, 255, 255);
    const shadowColor = dark
      ? Cor.argb(72, 0x1D, 0x25, 0x38)
      : Cor.argb(54, 0xB8, 0xD7, 0xF2);

    const shift = (bgOffset * 0.055) % (this.width + this.height * 0.60);
    let i = 0;
    while (i < 5) {
      const baseX = -this.height * 0.45 + i * this.width * 0.33 - shift;
      const x = (baseX < -this.height * 0.55) ? baseX + this.width + this.height * 0.70 : baseX;
      const y = this.height * (0.105 + (i % 3) * 0.048);
      const s = this.height * (0.105 + (i % 2) * 0.020);

      // Sombra suave por baixo da nuvem.
      ctx.fillStyle = Cor.css(shadowColor);
      Ret.definir(this.rect, x - s * 0.92, y + s * 0.05, x + s * 1.25, y + s * 0.48);
      retanguloArredondado(ctx, this.rect, s * 0.24);
      ctx.fill();

      // Corpo principal mais "pintado", menos bolhas.
      ctx.fillStyle = Cor.css(cloudColor);
      Ret.definir(this.rect, x - s * 0.88, y - s * 0.06, x + s * 1.20, y + s * 0.34);
      retanguloArredondado(ctx, this.rect, s * 0.22);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - s * 0.50, y + s * 0.03, s * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - s * 0.10, y - s * 0.12, s * 0.43, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + s * 0.38, y - s * 0.06, s * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + s * 0.78, y + s * 0.08, s * 0.28, 0, Math.PI * 2);
      ctx.fill();

      // Pequeno brilho no topo para dar volume.
      ctx.fillStyle = Cor.css(dark ? Cor.argb(38, 0xA8, 0xBA, 0xD8) : Cor.argb(56, 255, 255, 255));
      Ret.definir(this.rect, x - s * 0.55, y - s * 0.19, x + s * 0.55, y + s * 0.02);
      retanguloArredondado(ctx, this.rect, s * 0.14);
      ctx.fill();

      i++;
    }
  }

  drawStars(ctx, bgOffset) {
    ctx.fillStyle = Cor.css(Cor.argb(210, 255, 255, 255));
    let i = 0;
    while (i < 42) {
      const x = ((i * 97 + bgOffset * 0.06) % this.width);
      const y = this.height * 0.055 + ((i * 53) % Math.trunc(this.height * 0.32));
      const r = (i % 5 === 0) ? 2.2 : 1.3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      i++;
    }
  }

  isBrazilStage3(stage) {
    return stage.countryIndex === 0 && stage.numberInCountry === 3;
  }

  drawDeepDarkness(ctx, headlightsOn) {
    ctx.fillStyle = Cor.css(headlightsOn
      ? Cor.argb(145, 0, 0, 0)
      : Cor.argb(222, 0, 0, 0));
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawNightVisibility(ctx, headlightsOn) {
    ctx.fillStyle = Cor.css(headlightsOn ? Cor.argb(44, 0, 0, 0) : Cor.argb(104, 0, 0, 0));
    ctx.fillRect(0, 0, this.width, this.height);
    if (!headlightsOn) {
      // Gradiente 5: escurece o rodape quando o farol esta apagado.
      const grad = ctx.createLinearGradient(0, this.height * 0.46, 0, this.height);
      grad.addColorStop(0, Cor.css(Cor.argb(0, 0, 0, 0)));
      grad.addColorStop(1, Cor.css(Cor.argb(82, 0, 0, 0)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, this.height * 0.46, this.width, this.height - this.height * 0.46);
    }
  }

  drawSpeedStreaks(ctx, time, speedPercent, turbo) {
    // Rastros laterais frios e discretos para dar velocidade sem as faixas amarelas/laranjas.
    const vanishX = this.width * 0.50;
    const pulse = ((time * (15.0 + speedPercent * 10.0)) % 1);
    const intensity = limitar((speedPercent - 0.22) / 0.62, 0, 1.45);
    const count = limitar(Math.trunc(8 + intensity * 10 + (turbo ? 4 : 0)), 8, 24);

    let i = 0;
    while (i < count) {
      const side = (i % 2 === 0) ? -1 : 1;
      const t = ((i / count) + pulse) % 1;

      const yNear = this.height * (0.58 + t * 0.39);
      const yFar = yNear - this.height * (0.040 + t * (0.050 + intensity * 0.030));

      const spreadNear = this.width * (0.18 + t * (0.50 + intensity * 0.11));
      const spreadFar = this.width * (0.07 + t * (0.16 + intensity * 0.045));
      const xNear = vanishX + side * spreadNear;
      const xFar = vanishX + side * spreadFar;

      const thickness = this.height * (0.0028 + t * (0.0055 + intensity * 0.0040));
      const alpha = limitar(Math.trunc(18 + (1 - t) * (24 + intensity * 38) + (turbo ? 18 : 0)), 14, 92);

      let cor;
      if (turbo && side < 0) cor = Cor.argb(alpha, 0x7C, 0xF6, 0xFF);
      else if (turbo && side > 0) cor = Cor.argb(alpha, 0x9A, 0xC8, 0xFF);
      else if (side < 0) cor = Cor.argb(alpha, 0xD9, 0xF7, 0xFF);
      else cor = Cor.argb(alpha, 0xB7, 0xD8, 0xFF);
      ctx.fillStyle = Cor.css(cor);

      ctx.beginPath();
      ctx.moveTo(xNear, yNear);
      ctx.lineTo(xNear + side * thickness, yNear + thickness * 0.55);
      ctx.lineTo(xFar + side * thickness * 0.42, yFar);
      ctx.lineTo(xFar, yFar - thickness * 0.22);
      ctx.closePath();
      ctx.fill();
      i++;
    }
  }

  drawWeatherOverlay(ctx, stage, time) {
    const rain = this.isRainStage(stage);
    const snow = this.isSnowStage(stage);
    const fog = this.isFogStage(stage);

    if (rain) {
      const heavyRain = this.weatherOverride === "rain_heavy";
      // Chuva leve/forte: rapida e diagonal, com intensidade aleatoria.
      ctx.lineWidth = this.height * (heavyRain ? 0.0034 : 0.0025);
      ctx.strokeStyle = Cor.css(Cor.argb(heavyRain ? 132 : 86, 0xD7, 0xE8, 0xFF));
      const rainDrops = heavyRain ? 104 : 54;
      let i = 0;
      while (i < rainDrops) {
        const x = ((i * 47 + time * 820) % (this.width + this.height * 0.30)) - this.height * 0.14;
        const y = ((i * 89 + time * 1040) % this.height);
        this.linha(ctx, x, y, x - this.height * 0.038, y + this.height * 0.098);
        i++;
      }

      // Gradiente 6: reflexo molhado discreto no rodape da camera.
      const grad = ctx.createLinearGradient(0, this.height * 0.52, 0, this.height);
      grad.addColorStop(0, Cor.css(Cor.argb(0, 0xB8, 0xD9, 0xFF)));
      grad.addColorStop(1, Cor.css(Cor.argb(36, 0xA6, 0xD7, 0xFF)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, this.height * 0.52, this.width, this.height - this.height * 0.52);
    }

    if (snow) {
      ctx.fillStyle = Cor.css(Cor.argb(188, 255, 255, 255));
      let i = 0;
      while (i < 44) {
        const x = ((i * 61 + Math.sin(time * 0.9 + i) * 34 + time * 22) % this.width);
        const y = ((i * 77 + time * 92) % this.height);
        const r = this.height * (0.0032 + (i % 3) * 0.0014);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        i++;
      }
      ctx.fillStyle = Cor.css(Cor.argb(30, 0xE8, 0xF8, 0xFF));
      ctx.fillRect(0, this.height * 0.50, this.width, this.height - this.height * 0.50);
    }

    if (fog) {
      this.drawFogLayer(ctx, time, 0.34, 0.72, 0.38);
    } else if (rain || snow) {
      this.drawFogLayer(ctx, time, 0.48, 0.68, snow ? 0.22 : 0.18);
    }
  }

  drawFogLayer(ctx, time, topRatio, bottomRatio, strength) {
    const top = this.height * topRatio;
    const bottom = this.height * bottomRatio;
    // Gradiente 7: a nevoa propriamente dita.
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, Cor.css(Cor.argb(0, 0xD8, 0xE2, 0xE8)));
    grad.addColorStop(1, Cor.css(Cor.argb(limitar(Math.trunc(145 * strength), 0, 145), 0xD8, 0xE2, 0xE8)));
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, this.width, bottom - top);

    let i = 0;
    while (i < 5) {
      const x = ((i * this.width * 0.31 + time * (18 + i * 4)) % (this.width * 1.22)) - this.width * 0.10;
      const y = top + (i % 3) * (bottom - top) * 0.22;
      const rw = this.width * (0.28 + i * 0.035);
      const rh = this.height * (0.035 + i * 0.004);
      ctx.fillStyle = Cor.css(Cor.argb(limitar(Math.trunc(30 * strength), 0, 48), 0xEC, 0xF3, 0xF6));
      Ret.definir(this.rect, x - rw, y - rh, x + rw, y + rh);
      this.ovalDoRet(ctx, this.rect);
      ctx.fill();
      i++;
    }
  }

  drawBoostVignette(ctx, time) {
    const pulse = (Math.sin(time * 10) * 0.5 + 0.5);
    const alpha = limitar(Math.trunc(34 + pulse * 24), 28, 64);
    ctx.fillStyle = Cor.css(Cor.argb(alpha, 0xFF, 0xA5, 0x24));
    ctx.fillRect(0, this.height * 0.84, this.width, this.height - this.height * 0.84);
    ctx.fillStyle = Cor.css(Cor.argb(Math.trunc(alpha * 0.75), 0xFF, 0xE0, 0x40));
    ctx.fillRect(0, this.height * 0.91, this.width, this.height - this.height * 0.91);
  }

  // ---------------- Faixa da estrada ----------------

  roadColors(stage, seg) {
    // Retorna [grama, rumble, asfalto, faixaCentral(ou -1)]
    switch (seg.colorType) {
      case SegmentColor.LIGHT: return [stage.grassLight, stage.rumbleLight, stage.roadLight, stage.laneColor];
      case SegmentColor.DARK: return [stage.grassDark, stage.rumbleDark, stage.roadDark, -1];
      case SegmentColor.START: return [stage.grassLight, Cor.WHITE, Cor.rgb(0x40, 0x40, 0x40), -1];
      case SegmentColor.FINISH: return [stage.grassLight, Cor.WHITE, Cor.rgb(0x20, 0x20, 0x20), -1];
    }
    return [stage.grassLight, stage.rumbleLight, stage.roadLight, stage.laneColor];
  }

  drawSegmentBand(ctx, stage, seg) {
    const c = this.roadColors(stage, seg);
    const y1 = seg.p1.screen.y, w1 = seg.p1.screen.w, x1 = seg.p1.screen.x;
    const y2 = seg.p2.screen.y, w2 = seg.p2.screen.w, x2 = seg.p2.screen.x;

    const r1 = w1 / Math.max(6, 2 * this.lanes);
    const r2 = w2 / Math.max(6, 2 * this.lanes);
    const l1 = w1 / Math.max(32, 8 * this.lanes);
    const l2 = w2 / Math.max(32, 8 * this.lanes);

    // Grama (faixa horizontal cobrindo a largura da tela)
    ctx.fillStyle = Cor.css(c[0]);
    ctx.fillRect(0, y2, this.width, y1 - y2);

    // Bordas zebradas (rumble)
    this.quad(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, c[1]);
    this.quad(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, c[1]);

    // Asfalto
    this.quad(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, c[2]);

    // V92: acabamento premium no asfalto com sombra lateral, brilho central e textura viva.
    if (!seg.isTunnel && seg.colorType !== SegmentColor.FINISH) {
      const sideShade = limitar(Math.trunc(28 + this.roadSpeedEffect * 18), 24, 54);
      this.quad(ctx, x1 - w1, y1, x1 - w1 * 0.78, y1, x2 - w2 * 0.68, y2, x2 - w2, y2, Cor.argb(sideShade, 0, 0, 0));
      this.quad(ctx, x1 + w1 * 0.78, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 * 0.68, y2, Cor.argb(sideShade, 0, 0, 0));

      let centerGlow;
      if (this.isDarkWeatherStage(stage)) centerGlow = Cor.argb(30, 0xA8, 0xF2, 0xFF);
      else if (this.isWetRoadStage(stage)) centerGlow = Cor.argb(34, 0xD8, 0xF2, 0xFF);
      else centerGlow = Cor.argb(18, 255, 255, 255);
      this.quad(ctx, x1 - w1 * 0.20, y1, x1 + w1 * 0.20, y1, x2 + w2 * 0.13, y2, x2 - w2 * 0.13, y2, centerGlow);

      if (seg.index % 4 === 0) {
        const texAlpha = limitar(Math.trunc(10 + this.roadSpeedEffect * 20), 10, 34);
        this.quad(ctx, x1 - w1 * 0.58, y1, x1 - w1 * 0.42, y1, x2 - w2 * 0.30, y2, x2 - w2 * 0.45, y2, Cor.argb(texAlpha, 255, 255, 255));
        this.quad(ctx, x1 + w1 * 0.34, y1, x1 + w1 * 0.55, y1, x2 + w2 * 0.48, y2, x2 + w2 * 0.28, y2, Cor.argb(Math.trunc(texAlpha * 0.75), 0x9A, 0xD6, 0xFF));
      }
    }

    // Bandas sutis de movimento no asfalto: reforcam a sensacao de velocidade da pista.
    if (this.roadSpeedEffect > 0.34 && !seg.isTunnel && seg.colorType !== SegmentColor.FINISH) {
      const flow = (Math.trunc(this.renderTime * (18 + this.roadSpeedEffect * 24)) + seg.index) % 9;
      if (flow === 0) {
        const alpha = limitar(Math.trunc(14 + this.roadSpeedEffect * 26), 12, 46);
        this.quad(
          ctx,
          x1 - w1 * 0.82, y1, x1 + w1 * 0.82, y1,
          x2 + w2 * 0.58, y2, x2 - w2 * 0.58, y2,
          Cor.argb(alpha, 255, 255, 255)
        );
      }
    }

    if (this.isWetRoadStage(stage) && !seg.isTunnel && seg.colorType !== SegmentColor.FINISH) {
      let wetAlpha;
      if (this.isRainStage(stage)) wetAlpha = 58;
      else if (this.isSnowStage(stage)) wetAlpha = 36;
      else if (this.isFogStage(stage)) wetAlpha = 28;
      else wetAlpha = 24;
      this.quad(
        ctx,
        x1 - w1 * 0.74, y1, x1 + w1 * 0.74, y1,
        x2 + w2 * 0.54, y2, x2 - w2 * 0.54, y2,
        Cor.argb(wetAlpha, 0xB6, 0xD8, 0xFF)
      );
      if (seg.index % 5 === 0) {
        this.quad(
          ctx,
          x1 - w1 * 0.44, y1, x1 - w1 * 0.12, y1,
          x2 - w2 * 0.08, y2, x2 - w2 * 0.36, y2,
          Cor.argb(Math.trunc(wetAlpha * 0.78), 255, 255, 255)
        );
        this.quad(
          ctx,
          x1 + w1 * 0.10, y1, x1 + w1 * 0.42, y1,
          x2 + w2 * 0.34, y2, x2 + w2 * 0.06, y2,
          Cor.argb(Math.trunc(wetAlpha * 0.62), 0x9A, 0xD6, 0xFF)
        );
      }
    }

    // Pit lane: uma faixa verde/azulada na direita. Entrar nela reabastece.
    if (seg.isPitStop) {
      const pitColor = (seg.index % 4 < 2) ? Cor.rgb(0x16, 0xB8, 0x72) : Cor.rgb(0x0E, 0x87, 0x66);
      this.quad(
        ctx,
        x1 + w1 * 0.35, y1, x1 + w1 * 0.95, y1,
        x2 + w2 * 0.95, y2, x2 + w2 * 0.35, y2,
        pitColor
      );
      if (seg.index % 8 < 4) {
        this.quad(
          ctx,
          x1 + w1 * 0.43, y1, x1 + w1 * 0.50, y1,
          x2 + w2 * 0.50, y2, x2 + w2 * 0.43, y2,
          Cor.WHITE
        );
      }
    }

    // Trechos de tunel: desenha paredes e teto para parecer um tunel real.
    if (seg.isTunnel) {
      const top1 = y1 - Math.max(this.height * 0.07, 18);
      const top2 = y2 - Math.max(this.height * 0.07, 12);
      // paredes laterais
      this.quad(ctx,
        x1 - w1 * 1.15, y1, x1 - w1 * 0.92, y1,
        x2 - w2 * 0.92, y2, x2 - w2 * 1.15, y2,
        Cor.rgb(0x22, 0x24, 0x2E)
      );
      this.quad(ctx,
        x1 + w1 * 0.92, y1, x1 + w1 * 1.15, y1,
        x2 + w2 * 1.15, y2, x2 + w2 * 0.92, y2,
        Cor.rgb(0x22, 0x24, 0x2E)
      );
      // teto
      this.quad(ctx,
        x1 - w1 * 1.15, top1, x1 + w1 * 1.15, top1,
        x2 + w2 * 1.15, top2, x2 - w2 * 1.15, top2,
        Cor.rgb(0x16, 0x18, 0x20)
      );
      // faixa interna escura
      ctx.fillStyle = Cor.css(Cor.argb(85, 0, 0, 0));
      ctx.fillRect(x2 - w2, y2, (x1 + w1) - (x2 - w2), y1 - y2);
      // luzes do teto
      if (seg.index % 6 < 3) {
        this.quad(ctx,
          x1 - w1 * 0.12, top1 + 4, x1 + w1 * 0.12, top1 + 4,
          x2 + w2 * 0.12, top2 + 4, x2 - w2 * 0.12, top2 + 4,
          Cor.rgb(0xFF, 0xF3, 0xC4)
        );
      }
    }

    // Faixa central (so nos segmentos claros)
    if (c[3] !== -1) {
      const laneW1 = (w1 * 2) / this.lanes;
      const laneW2 = (w2 * 2) / this.lanes;
      let lx1 = x1 - w1 + laneW1;
      let lx2 = x2 - w2 + laneW2;
      for (let lane = 1; lane < this.lanes; lane++) {
        this.quad(ctx, lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2, c[3]);
        lx1 += laneW1; lx2 += laneW2;
      }
    }

    // Faixa de chegada: padrao quadriculado
    if (seg.colorType === SegmentColor.FINISH) {
      this.drawCheckered(ctx, x1, y1, w1, x2, y2, w2);
    }

    // Nevoa ao fundo
    if (seg.fog < 1) {
      ctx.fillStyle = Cor.css(stage.fogColor, limitar(Math.trunc((1 - seg.fog) * 255), 0, 255));
      ctx.fillRect(0, y2, this.width, y1 - y2);
    }
  }

  drawCheckered(ctx, x1, y1, w1, x2, y2, w2) {
    const cols = 10;
    const rows = 2;

    for (let row = 0; row < rows; row++) {
      const ry1a = row / rows;
      const ry1b = (row + 1) / rows;
      const yy1a = y1 + (y2 - y1) * ry1a;
      const yy1b = y1 + (y2 - y1) * ry1b;
      const ww1a = w1 + (w2 - w1) * ry1a;
      const ww1b = w1 + (w2 - w1) * ry1b;
      const xx1a = x1 + (x2 - x1) * ry1a;
      const xx1b = x1 + (x2 - x1) * ry1b;

      for (let col = 0; col < cols; col++) {
        const ca = col / cols;
        const cb = (col + 1) / cols;

        const ax1 = (xx1a - ww1a) + (2 * ww1a) * ca;
        const bx1 = (xx1a - ww1a) + (2 * ww1a) * cb;
        const ax2 = (xx1b - ww1b) + (2 * ww1b) * ca;
        const bx2 = (xx1b - ww1b) + (2 * ww1b) * cb;

        const color = ((row + col) % 2 === 0) ? Cor.WHITE : Cor.rgb(0x08, 0x08, 0x08);
        this.quad(ctx, ax1, yy1a, bx1, yy1a, bx2, yy1b, ax2, yy1b, color);
      }
    }

    // Marcadores baixos laterais na linha de chegada para dar mais vida sem usar portal.
    const leftEdgeNear = x1 - w1 - this.height * 0.004;
    const rightEdgeNear = x1 + w1 + this.height * 0.004;
    const leftEdgeFar = x2 - w2 - this.height * 0.004;
    const rightEdgeFar = x2 + w2 + this.height * 0.004;
    const markerWNear = this.width * 0.020;
    const markerWFar = this.width * 0.010;
    for (let i = 0; i < 4; i++) {
      const t0 = i / 4;
      const t1 = (i + 1) / 4;
      const ly0 = y1 + (y2 - y1) * t0;
      const ly1 = y1 + (y2 - y1) * t1;
      const lxa0 = leftEdgeNear + (leftEdgeFar - leftEdgeNear) * t0;
      const lxa1 = leftEdgeNear + (leftEdgeFar - leftEdgeNear) * t1;
      const rxa0 = rightEdgeNear + (rightEdgeFar - rightEdgeNear) * t0;
      const rxa1 = rightEdgeNear + (rightEdgeFar - rightEdgeNear) * t1;
      const mw0 = markerWNear + (markerWFar - markerWNear) * t0;
      const mw1 = markerWNear + (markerWFar - markerWNear) * t1;
      const c = (i % 2 === 0) ? Cor.WHITE : Cor.rgb(0x20, 0x20, 0x20);
      this.quad(ctx, lxa0 - mw0, ly0, lxa0, ly0, lxa1, ly1, lxa1 - mw1, ly1, c);
      this.quad(ctx, rxa0, ly0, rxa0 + mw0, ly0, rxa1 + mw1, ly1, rxa1, ly1, c);
    }
  }

  /** Desenha um quadrilatero preenchido. */
  quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = Cor.css(color);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------- Moedas ----------------

  drawCoin(ctx, seg, coin, unit, time) {
    const cx = seg.p1.screen.x + seg.p1.screen.scale * coin.offset * this.roadWidth * this.halfW;
    const baseY = seg.p1.screen.y;
    const size = unit * 0.078;
    if (size < 1.5) return;

    const spin = (0.82 + 0.18 * Math.abs(Math.sin(time * 6 + coin.phase)));
    const floatY = baseY - size * 0.88 - Math.sin(time * 3 + coin.phase) * size * 0.12;

    // Brilho atras da moeda para destacar a nova arte Racing Arcade Coin.
    ctx.fillStyle = Cor.css(Cor.argb(72, 0xFF, 0xC8, 0x18));
    Ret.definir(this.rect, cx - size * 1.05, floatY - size * 1.05, cx + size * 1.05, floatY + size * 1.05);
    this.ovalDoRet(ctx, this.rect);
    ctx.fill();

    const bmp = this.bitmap(this.coinSprite);
    if (bmp !== null) {
      this.spritePaint.alpha = 255;
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      const drawW = size * 1.72 * spin;
      const drawH = size * 1.72;
      Ret.definir(this.rect, cx - drawW / 2, floatY - drawH / 2, cx + drawW / 2, floatY + drawH / 2);
      ctx.drawImage(bmp, 0, 0, bmp.naturalWidth, bmp.naturalHeight,
        this.rect.left, this.rect.top, drawW, drawH);
      ctx.imageSmoothingEnabled = false;
    } else {
      // Fallback simples caso a imagem seja removida.
      ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xC1, 0x07));
      Ret.definir(this.rect, cx - size * spin, floatY - size, cx + size * spin, floatY + size);
      this.ovalDoRet(ctx, this.rect);
      ctx.fill();
      ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xE0, 0x82));
      Ret.definir(this.rect, cx - size * spin * 0.5, floatY - size * 0.6, cx + size * spin * 0.5, floatY + size * 0.6);
      this.ovalDoRet(ctx, this.rect);
      ctx.fill();
    }
  }

  // ---------------- Cenario lateral ----------------

  propHeightFor(type) {
    switch (type) {
      case SpriteType.BUSH: case SpriteType.BUSH_ROUND: return 0.62;
      case SpriteType.BUSH_LIGHT: case SpriteType.BUSH_FLOWER: case SpriteType.GRASS_CLUMP: return 0.52;
      case SpriteType.TREE_ROUND: case SpriteType.TREE_OAK: case SpriteType.TREE_BIRCH: return 1.45;
      case SpriteType.TREE_PINE: case SpriteType.TREE_SNOW: return 1.78;
      case SpriteType.TREE_PALM: return 1.98;
      case SpriteType.TREE_CYPRESS: return 1.84;
      case SpriteType.CACTUS_DESERT: return 1.25;
      case SpriteType.SIGN_CANYON: return 0.90;
      case SpriteType.SIGN_CHEVRON: return 0.82;
      case SpriteType.SIGN_CHEVRON_HORIZONTAL: case SpriteType.GUARDRAIL_SIDE: return 0.74;
      case SpriteType.SIGN_CURVE: case SpriteType.SIGN_TURN_RIGHT: return 0.86;
      case SpriteType.SIGN_DIRECTIONAL: return 0.82;
      case SpriteType.PUDDLE_WATER: case SpriteType.PUDDLE_OIL: return 0.24;
      default: return 1.0;
    }
  }

  drawBitmapProp(ctx, bmp, sp, baseX, baseY, drawUnit, safeSizeFactor, farVisibility, clipY) {
    // V68: cenario lateral mais solido e imersivo.
    // - vegetacao entra mais perto do jogador;
    // - fade menos transparente para dar leitura melhor;
    // - arvores permanecem visualmente coladas ao chao.
    if (this.width <= 0 || this.height <= 0) return;

    let isTreeLike;
    switch (sp.type) {
      case SpriteType.TREE_PALM: case SpriteType.TREE_PINE: case SpriteType.TREE_ROUND: case SpriteType.TREE:
      case SpriteType.TREE_OAK: case SpriteType.TREE_CYPRESS: case SpriteType.TREE_SNOW: case SpriteType.TREE_BIRCH:
        isTreeLike = true; break;
      default: isTreeLike = false; break;
    }
    let isBushLike;
    switch (sp.type) {
      case SpriteType.BUSH: case SpriteType.BUSH_ROUND: case SpriteType.BUSH_LIGHT:
      case SpriteType.BUSH_FLOWER: case SpriteType.GRASS_CLUMP:
        isBushLike = true; break;
      default: isBushLike = false; break;
    }
    let minVisibleAlpha;
    if (isTreeLike) minVisibleAlpha = 220;
    else if (isBushLike) minVisibleAlpha = 205;
    else minVisibleAlpha = 0;

    const vis = limitar(farVisibility, 0, 1);
    let propAlpha;
    if (isTreeLike || isBushLike) {
      if (vis <= 0.02) propAlpha = 0;
      else if (vis < 0.16) propAlpha = limitar(Math.trunc(255 * (vis / 0.16)), 0, 255);
      else propAlpha = 255;
    } else {
      if (vis <= 0.01) propAlpha = 0;
      else propAlpha = limitar(Math.trunc(minVisibleAlpha + (255 - minVisibleAlpha) * vis), 0, 255);
    }
    if (propAlpha <= 8) return;

    const baseHeight = drawUnit * this.propHeightFor(sp.type) * safeSizeFactor;
    let spriteH = Math.max(2, baseHeight);

    let maxH;
    switch (sp.type) {
      case SpriteType.BUSH: case SpriteType.BUSH_ROUND: case SpriteType.BUSH_LIGHT:
      case SpriteType.BUSH_FLOWER: case SpriteType.GRASS_CLUMP:
        maxH = this.height * 0.22; break;
      case SpriteType.SIGN_CANYON: case SpriteType.SIGN_CHEVRON: case SpriteType.SIGN_CHEVRON_HORIZONTAL:
      case SpriteType.SIGN_CURVE: case SpriteType.SIGN_DIRECTIONAL: case SpriteType.SIGN_TURN_RIGHT:
      case SpriteType.SIGN_WARNING: case SpriteType.SIGN_BUMP: case SpriteType.SIGN_SPEED_LIMIT:
      case SpriteType.SIGN_SLIPPERY: case SpriteType.SIGN: case SpriteType.NEON_SIGN:
      case SpriteType.PIT_SIGN: case SpriteType.GUARDRAIL_SIDE:
        maxH = this.height * 0.24; break;
      case SpriteType.TREE_PALM: case SpriteType.TREE_PINE: case SpriteType.TREE_ROUND: case SpriteType.TREE:
      case SpriteType.TREE_OAK: case SpriteType.TREE_CYPRESS: case SpriteType.TREE_SNOW: case SpriteType.TREE_BIRCH:
        maxH = this.height * 0.53; break;
      case SpriteType.CACTUS_DESERT: case SpriteType.CACTUS:
        maxH = this.height * 0.36; break;
      default:
        maxH = this.height * 0.34; break;
    }
    spriteH = Math.min(spriteH, maxH);

    const aspect = bmp.naturalWidth / bmp.naturalHeight;
    let spriteW = spriteH * aspect;
    let maxW;
    switch (sp.type) {
      case SpriteType.BUSH: case SpriteType.BUSH_ROUND: case SpriteType.BUSH_LIGHT:
      case SpriteType.BUSH_FLOWER: case SpriteType.GRASS_CLUMP:
        maxW = this.width * 0.34; break;
      case SpriteType.SIGN_CANYON: case SpriteType.SIGN_CHEVRON: case SpriteType.SIGN_CHEVRON_HORIZONTAL:
      case SpriteType.SIGN_CURVE: case SpriteType.SIGN_DIRECTIONAL: case SpriteType.SIGN_TURN_RIGHT:
      case SpriteType.SIGN_WARNING: case SpriteType.SIGN_BUMP: case SpriteType.SIGN_SPEED_LIMIT:
      case SpriteType.SIGN_SLIPPERY: case SpriteType.SIGN: case SpriteType.NEON_SIGN:
      case SpriteType.PIT_SIGN: case SpriteType.GUARDRAIL_SIDE:
        maxW = this.width * 0.30; break;
      case SpriteType.TREE_PALM: case SpriteType.TREE_PINE: case SpriteType.TREE_ROUND: case SpriteType.TREE:
      case SpriteType.TREE_OAK: case SpriteType.TREE_CYPRESS: case SpriteType.TREE_SNOW: case SpriteType.TREE_BIRCH:
        maxW = this.width * 0.44; break;
      default:
        maxW = this.width * 0.34; break;
    }
    if (spriteW > maxW && aspect > 0) {
      spriteW = maxW;
      spriteH = spriteW / aspect;
    }

    let groundOffset;
    switch (sp.type) {
      case SpriteType.BUSH: case SpriteType.BUSH_ROUND: case SpriteType.BUSH_LIGHT:
      case SpriteType.BUSH_FLOWER: case SpriteType.GRASS_CLUMP:
        groundOffset = 0.010; break;
      case SpriteType.SIGN_CANYON: case SpriteType.SIGN_CHEVRON: case SpriteType.SIGN_CHEVRON_HORIZONTAL:
      case SpriteType.SIGN_CURVE: case SpriteType.SIGN_DIRECTIONAL: case SpriteType.SIGN_TURN_RIGHT:
      case SpriteType.SIGN_WARNING: case SpriteType.SIGN_BUMP: case SpriteType.SIGN_SPEED_LIMIT:
      case SpriteType.SIGN_SLIPPERY: case SpriteType.SIGN: case SpriteType.NEON_SIGN:
      case SpriteType.PIT_SIGN: case SpriteType.GUARDRAIL_SIDE:
        groundOffset = 0.042; break;
      case SpriteType.TREE_PALM: case SpriteType.TREE_PINE: case SpriteType.TREE_ROUND: case SpriteType.TREE:
      case SpriteType.TREE_OAK: case SpriteType.TREE_CYPRESS: case SpriteType.TREE_SNOW: case SpriteType.TREE_BIRCH:
        groundOffset = 0.052; break;
      default:
        groundOffset = 0.075; break;
    }

    const groundedY = limitar(baseY + drawUnit * groundOffset * safeSizeFactor, -this.height * 0.35, this.height * 1.08);
    const topY = groundedY - spriteH;
    if (groundedY < -4 || topY > this.height * 1.08) return;
    if (baseX < -this.width * 0.35 || baseX > this.width * 1.35) return;

    // Sombra sempre colada no pe do objeto: corrige a sensacao de "arvore flutuando".
    const shadowW = Math.max(drawUnit * 0.18, spriteW * (isTreeLike ? 0.48 : 0.40));
    const shadowH = Math.max(2, drawUnit * (isTreeLike ? 0.090 : 0.080) * safeSizeFactor);
    let shadowAlpha;
    if (isTreeLike) shadowAlpha = limitar(Math.trunc(92 * vis), 0, 92);
    else if (isBushLike) shadowAlpha = limitar(Math.trunc(78 * vis), 0, 78);
    else shadowAlpha = limitar(Math.trunc(70 * vis), 0, 70);
    ctx.fillStyle = Cor.css(Cor.argb(shadowAlpha, 0, 0, 0));
    Ret.definir(this.rect, baseX - shadowW, groundedY - shadowH * 0.42, baseX + shadowW, groundedY + shadowH * 0.42);
    this.ovalDoRet(ctx, this.rect);
    ctx.fill();

    Ret.definir(this.rect, baseX - spriteW / 2, topY, baseX + spriteW / 2, groundedY);

    this.spritePaint.alpha = propAlpha;
    ctx.globalAlpha = propAlpha / 255;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bmp, 0, 0, bmp.naturalWidth, bmp.naturalHeight,
      this.rect.left, this.rect.top, spriteW, groundedY - topY);
    this.spritePaint.alpha = 255;
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
  }

  drawRoadHazard(ctx, bmp, seg, sp, baseX, baseY, drawUnit, safeSizeFactor) {
    // Pocas/oleo precisam parecer pintados no asfalto: menores e com a base exatamente no chao.
    // As PNGs agora tambem foram cortadas no alpha real para nao sobrar transparencia embaixo.
    const widthFactor = (sp.type === SpriteType.PUDDLE_WATER) ? 0.30 : 0.27;
    const minHazardW = this.width * 0.032;
    const maxHazardW = this.width * 0.22;
    const hazardW = limitar(seg.p1.screen.w * widthFactor * safeSizeFactor, minHazardW, maxHazardW);
    const aspect = bmp.naturalHeight / bmp.naturalWidth;
    const hazardH = Math.max(this.height * 0.010, hazardW * aspect * 0.72);
    const floorY = limitar(baseY + drawUnit * 0.028, -this.height * 0.20, this.height * 1.02);
    Ret.definir(this.rect, baseX - hazardW / 2, floorY - hazardH, baseX + hazardW / 2, floorY);
    this.spritePaint.alpha = (sp.type === SpriteType.PUDDLE_WATER) ? 225 : 238;
    ctx.globalAlpha = this.spritePaint.alpha / 255;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bmp, 0, 0, bmp.naturalWidth, bmp.naturalHeight,
      this.rect.left, this.rect.top, hazardW, hazardH);
    this.spritePaint.alpha = 255;
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
  }

  drawSprite(ctx, stage, seg, sp, unit) {
    if (unit <= 0) return;
    if (this.width <= 0 || this.height <= 0) return;

    // Removidos globalmente: o portal de placas ocupava grande parte da tela
    // e a arvore redonda tinha um estilo cartunesco diferente do restante do
    // cenario. O filtro aqui garante que nao aparecam em nenhuma das 28 fases,
    // inclusive ao repetir uma pista com uma semente salva anteriormente.
    if (sp.type === SpriteType.PORTAL || sp.type === SpriteType.TREE_ROUND) return;

    /*
     * V49 - perspectiva lateral corrigida:
     * - arvores/placas/arbustos continuam visiveis ate perto;
     * - mas so aparecem quando ja existe distancia lateral suficiente da pista;
     * - no horizonte eles entram com fade e empurrados para fora da borda,
     *   evitando parecer que estao em cima do asfalto.
     */
    const isTunnel = sp.type === SpriteType.TUNNEL;
    const isPortal = sp.type === SpriteType.PORTAL;
    const isPuddle = sp.type === SpriteType.PUDDLE_WATER || sp.type === SpriteType.PUDDLE_OIL;
    const isCenterRoadObject = isTunnel || isPortal;
    const isRoadObject = isCenterRoadObject || isPuddle;

    const screenY = seg.p1.screen.y;
    if (!isRoadObject && screenY > this.height * 1.08) return;

    let isTreeLike;
    switch (sp.type) {
      case SpriteType.TREE_PALM: case SpriteType.TREE_PINE: case SpriteType.TREE_ROUND: case SpriteType.TREE:
      case SpriteType.TREE_OAK: case SpriteType.TREE_CYPRESS: case SpriteType.TREE_SNOW: case SpriteType.TREE_BIRCH:
        isTreeLike = true; break;
      default: isTreeLike = false; break;
    }
    let isBushLike;
    switch (sp.type) {
      case SpriteType.BUSH: case SpriteType.BUSH_ROUND: case SpriteType.BUSH_LIGHT:
      case SpriteType.BUSH_FLOWER: case SpriteType.GRASS_CLUMP:
        isBushLike = true; break;
      default: isBushLike = false; break;
    }

    let farVisibility;
    if (isRoadObject) {
      farVisibility = 1;
    } else {
      // As arvores so entram quando o segmento ja esta bem mais proximo do
      // piloto. Antes elas nasciam perto do horizonte, onde a pista e estreita,
      // e por alguns quadros pareciam estar plantadas no meio do asfalto.
      const yStart = isTreeLike ? 0.58 : (isBushLike ? 0.455 : 0.405);
      const ySpan = isTreeLike ? 0.22 : (isBushLike ? 0.255 : 0.235);
      const roadStart = isTreeLike ? this.width * 0.070 : ((isBushLike ? this.width * 0.035 : this.width * 0.028));
      const roadSpan = isTreeLike ? this.width * 0.125 : ((isBushLike ? this.width * 0.120 : this.width * 0.105));
      const yVisibility = limitar((screenY - this.height * yStart) / (this.height * ySpan), 0, 1);
      const roadVisibility = limitar((seg.p1.screen.w - roadStart) / roadSpan, 0, 1);
      let vis = Math.min(yVisibility, roadVisibility);
      // Arbustos preservam o ganho antigo. Arvores usam o alfa linear para
      // surgirem suavemente, sem o salto repentino de 16% de opacidade.
      if (isBushLike && vis > 0.04) {
        vis = 0.16 + vis * 0.84;
      }
      farVisibility = vis;
    }
    if (!isRoadObject && farVisibility <= (isTreeLike ? 0.06 : (isBushLike ? 0.02 : 0.04))) return;

    const safeSizeFactor = isRoadObject
      ? limitar(sp.sizeFactor, 0.90, 1.35)
      : limitar(sp.sizeFactor, 0.68, 1.30);

    const baseDrawUnit = isRoadObject
      ? limitar(unit, 4, this.height * 0.22)
      // Antes havia "return" quando o objeto chegava perto. Agora limitamos
      // o tamanho e continuamos desenhando ate sair da tela.
      : limitar(unit, 1.6, this.height * 0.182);

    const nearBoost = (!isRoadObject && screenY > this.height * 0.74)
      ? 1 + limitar(((screenY / this.height) - 0.74) / 0.34, 0, 1) * 0.20
      : 1;
    const drawUnit = baseDrawUnit * nearBoost;

    let baseX = seg.p1.screen.x + seg.p1.screen.scale * sp.offset * this.roadWidth * this.halfW;
    const baseY = limitar(seg.p1.screen.y, -this.height * 0.35, this.height + this.height * 0.08);

    if (!isRoadObject) {
      const side = (sp.offset < 0) ? -1 : 1;
      const roadEdge = seg.p1.screen.x + side * seg.p1.screen.w;
      let typeGap;
      switch (sp.type) {
        case SpriteType.TREE_PALM: case SpriteType.TREE_PINE: case SpriteType.TREE_ROUND: case SpriteType.TREE:
        case SpriteType.TREE_OAK: case SpriteType.TREE_CYPRESS: case SpriteType.TREE_SNOW: case SpriteType.TREE_BIRCH:
          typeGap = drawUnit * 0.82; break;
        case SpriteType.BUSH: case SpriteType.BUSH_ROUND: case SpriteType.BUSH_LIGHT:
        case SpriteType.BUSH_FLOWER: case SpriteType.GRASS_CLUMP:
          typeGap = drawUnit * 0.64; break;
        case SpriteType.SIGN_CANYON: case SpriteType.SIGN_CHEVRON: case SpriteType.SIGN_CHEVRON_HORIZONTAL:
        case SpriteType.SIGN_CURVE: case SpriteType.SIGN_DIRECTIONAL: case SpriteType.SIGN_TURN_RIGHT:
        case SpriteType.SIGN_WARNING: case SpriteType.SIGN_BUMP: case SpriteType.SIGN_SPEED_LIMIT:
        case SpriteType.SIGN_SLIPPERY: case SpriteType.SIGN: case SpriteType.NEON_SIGN:
        case SpriteType.PIT_SIGN: case SpriteType.GUARDRAIL_SIDE:
          typeGap = drawUnit * 0.98; break;
        default:
          typeGap = drawUnit * 0.82; break;
      }
      const perspectivePush = this.width * (isTreeLike ? 0.110 : (isBushLike ? 0.060 : 0.125)) * (1 - farVisibility);
      let roadGap;
      if (isTreeLike) roadGap = Math.max(typeGap, seg.p1.screen.w * 0.22, this.width * 0.020) + perspectivePush;
      else if (isBushLike) roadGap = Math.max(typeGap, seg.p1.screen.w * 0.14, this.width * 0.010) + perspectivePush;
      else roadGap = Math.max(typeGap, seg.p1.screen.w * 0.30, this.width * 0.018) + perspectivePush;
      baseX = (side < 0)
        ? Math.min(baseX, roadEdge - roadGap)
        : Math.max(baseX, roadEdge + roadGap);
      if (baseX < -drawUnit * 4.2 - this.width * 0.14 || baseX > this.width + drawUnit * 4.2 + this.width * 0.14) return;
    } else if (isCenterRoadObject) {
      baseX = seg.p1.screen.x;
    }

    const bmpProp = this.bitmap(this.propSprites[sp.type]);
    if (bmpProp !== null) {
      if (isPuddle) {
        this.drawRoadHazard(ctx, bmpProp, seg, sp, baseX, baseY, drawUnit, safeSizeFactor);
      } else {
        this.drawBitmapProp(ctx, bmpProp, sp, baseX, baseY, drawUnit, safeSizeFactor, farVisibility, seg.clip);
      }
      return;
    }

    switch (sp.type) {
      case SpriteType.TREE: {
        const spriteH = drawUnit * 1.15 * safeSizeFactor;
        const spriteW = drawUnit * 0.42 * safeSizeFactor;
        if (spriteH < 2) return;
        ctx.fillStyle = Cor.css(Cor.rgb(0x5A, 0x3A, 0x1E));
        ctx.fillRect(baseX - spriteW * 0.08, baseY - spriteH * 0.35, spriteW * 0.16, spriteH * 0.35);
        ctx.fillStyle = Cor.css(stage.treeColor);
        ctx.beginPath();
        ctx.moveTo(baseX, baseY - spriteH);
        ctx.lineTo(baseX - spriteW / 2, baseY - spriteH * 0.35);
        ctx.lineTo(baseX + spriteW / 2, baseY - spriteH * 0.35);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case SpriteType.PALM: {
        const spriteH = drawUnit * 1.25 * safeSizeFactor;
        if (spriteH < 2) return;
        ctx.fillStyle = Cor.css(Cor.rgb(0x8A, 0x6A, 0x3A));
        ctx.fillRect(baseX - drawUnit * 0.035, baseY - spriteH, drawUnit * 0.07, spriteH);
        ctx.fillStyle = Cor.css(stage.treeColor);
        ctx.beginPath();
        ctx.arc(baseX, baseY - spriteH, drawUnit * 0.28 * safeSizeFactor, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case SpriteType.CACTUS: {
        const spriteH = drawUnit * 0.95 * safeSizeFactor;
        if (spriteH < 2) return;
        ctx.fillStyle = Cor.css(stage.treeColor);
        ctx.fillRect(baseX - drawUnit * 0.065, baseY - spriteH, drawUnit * 0.13, spriteH);
        ctx.fillRect(baseX - drawUnit * 0.20, baseY - spriteH * 0.7, drawUnit * 0.14, spriteH * 0.3);
        ctx.fillRect(baseX + drawUnit * 0.06, baseY - spriteH * 0.6, drawUnit * 0.14, spriteH * 0.3);
        break;
      }
      case SpriteType.MOUNTAIN: {
        const spriteH = drawUnit * 1.35 * safeSizeFactor;
        if (spriteH < 2) return;
        const spread = spriteH * 0.58;
        const variant = seg.index % 4;
        ctx.fillStyle = Cor.css(stage.mountainColor);
        ctx.beginPath();
        ctx.moveTo(baseX - spread, baseY);
        switch (variant) {
          case 0:
            ctx.lineTo(baseX - spread * 0.55, baseY - spriteH * 0.55);
            ctx.lineTo(baseX - spread * 0.15, baseY - spriteH * 0.95);
            ctx.lineTo(baseX + spread * 0.20, baseY - spriteH * 0.48);
            break;
          case 1:
            ctx.lineTo(baseX - spread * 0.40, baseY - spriteH * 0.35);
            ctx.lineTo(baseX, baseY - spriteH);
            ctx.lineTo(baseX + spread * 0.26, baseY - spriteH * 0.62);
            break;
          case 2:
            ctx.lineTo(baseX - spread * 0.62, baseY - spriteH * 0.42);
            ctx.lineTo(baseX - spread * 0.12, baseY - spriteH * 0.82);
            ctx.lineTo(baseX + spread * 0.12, baseY - spriteH * 0.58);
            ctx.lineTo(baseX + spread * 0.38, baseY - spriteH * 0.92);
            break;
          default:
            ctx.lineTo(baseX - spread * 0.48, baseY - spriteH * 0.28);
            ctx.lineTo(baseX - spread * 0.08, baseY - spriteH * 0.72);
            ctx.lineTo(baseX + spread * 0.18, baseY - spriteH * 0.98);
            break;
        }
        ctx.lineTo(baseX + spread, baseY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = Cor.css(Cor.argb(55, 255, 255, 255));
        ctx.beginPath();
        ctx.moveTo(baseX - spread * 0.10, baseY - spriteH * 0.70);
        ctx.lineTo(baseX + spread * 0.02, baseY - spriteH * 0.92);
        ctx.lineTo(baseX + spread * 0.15, baseY - spriteH * 0.68);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case SpriteType.BUILDING: {
        const spriteH = drawUnit * (1.05 + safeSizeFactor * 0.78);
        const spriteW = drawUnit * 0.48 * safeSizeFactor;
        if (spriteH < 2) return;
        ctx.fillStyle = Cor.css(stage.mountainColor);
        ctx.fillRect(baseX - spriteW / 2, baseY - spriteH, spriteW, spriteH);
        ctx.fillStyle = Cor.css(stage.isNight ? Cor.rgb(0xFF, 0xE0, 0x6B) : Cor.rgb(0x9F, 0xB0, 0xC4));
        const rows = limitar(Math.trunc(spriteH / (drawUnit * 0.23)), 0, 8);
        let wy = baseY - spriteH + drawUnit * 0.14;
        for (let r = 0; r < rows; r++) {
          ctx.fillRect(baseX - spriteW * 0.30, wy, spriteW * 0.18, drawUnit * 0.075);
          ctx.fillRect(baseX + spriteW * 0.12, wy, spriteW * 0.18, drawUnit * 0.075);
          wy += drawUnit * 0.22;
        }
        break;
      }
      case SpriteType.SIGN: {
        const spriteH = drawUnit * 0.55;
        if (spriteH < 2) return;
        ctx.fillStyle = Cor.css(Cor.rgb(0x88, 0x88, 0x88));
        ctx.fillRect(baseX - drawUnit * 0.025, baseY - spriteH, drawUnit * 0.05, spriteH);
        ctx.fillStyle = Cor.css(Cor.rgb(0x2E, 0x86, 0xDE));
        ctx.fillRect(baseX - drawUnit * 0.24, baseY - spriteH - drawUnit * 0.26, drawUnit * 0.48, drawUnit * 0.26);
        break;
      }
      case SpriteType.NEON_SIGN: {
        const spriteH = drawUnit * 0.95 * safeSizeFactor;
        if (spriteH < 2) return;
        const neon = (seg.index % 2 === 0) ? Cor.rgb(0x00, 0xF5, 0xD4) : Cor.rgb(0xF5, 0x00, 0x90);
        ctx.fillStyle = Cor.css(Cor.rgb(0x22, 0x22, 0x2A));
        ctx.fillRect(baseX - drawUnit * 0.035, baseY - spriteH, drawUnit * 0.07, spriteH);
        ctx.fillStyle = Cor.css(neon);
        Ret.definir(this.rect, baseX - drawUnit * 0.24, baseY - spriteH - drawUnit * 0.32, baseX + drawUnit * 0.24, baseY - spriteH);
        retanguloArredondado(ctx, this.rect, drawUnit * 0.05);
        ctx.fill();
        break;
      }
      case SpriteType.PIT_SIGN: {
        const spriteH = drawUnit * 0.72 * safeSizeFactor;
        if (spriteH < 2) return;
        ctx.fillStyle = Cor.css(Cor.rgb(0xE8, 0xE8, 0xE8));
        ctx.fillRect(baseX - drawUnit * 0.030, baseY - spriteH, drawUnit * 0.06, spriteH);
        ctx.fillStyle = Cor.css(Cor.rgb(0x12, 0xB8, 0x72));
        Ret.definir(this.rect, baseX - drawUnit * 0.30, baseY - spriteH - drawUnit * 0.22, baseX + drawUnit * 0.30, baseY - spriteH);
        retanguloArredondado(ctx, this.rect, drawUnit * 0.04);
        ctx.fill();
        this.textLike(ctx, "PIT", baseX, baseY - spriteH - drawUnit * 0.055, drawUnit * 0.18, Cor.WHITE);
        break;
      }
      case SpriteType.PORTAL: {
        const bmp = this.bitmap(this.finishPortalSprite);
        if (bmp !== null) {
          // O portal precisa crescer muito ao se aproximar para transmitir
          // a sensacao de passar por dentro dele.
          const proximity = limitar(((seg.p1.screen.y / this.height) - 0.40) / 0.52, 0, 1);
          const growth = 1 + proximity * 2.55;
          const portalW = Math.min(this.width * 1.92, Math.max(this.width * 0.30, seg.p1.screen.w * 2.45 * growth));
          const aspect = bmp.naturalHeight / bmp.naturalWidth;
          const portalH = Math.min(this.height * 0.78, Math.max(this.height * 0.12, portalW * aspect));

          // Segura o portal no centro da visao para nao parecer que ele esta andando de lado.
          const portalX = this.width * 0.5 + (baseX - this.width * 0.5) * 0.18;
          const floorY = Math.min(this.height * 1.04, baseY + drawUnit * 0.02 + proximity * this.height * 0.12);
          Ret.definir(this.rect, portalX - portalW / 2, floorY - portalH, portalX + portalW / 2, floorY);
          this.spritePaint.alpha = 255;
          ctx.globalAlpha = 1;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(bmp, 0, 0, bmp.naturalWidth, bmp.naturalHeight,
            this.rect.left, this.rect.top, portalW, portalH);
          ctx.imageSmoothingEnabled = false;
        } else {
          // Fallback simples se a imagem nao carregar.
          const portalW = seg.p1.screen.w * 1.45;
          const portalH = Math.min(seg.p1.screen.w * 0.90, this.height * 0.26 * safeSizeFactor);
          const floorY = baseY;
          const topY = floorY - portalH;
          ctx.fillStyle = Cor.css(Cor.rgb(0x20, 0x20, 0x28));
          Ret.definir(this.rect, baseX - portalW * 0.45, topY, baseX + portalW * 0.45, topY + portalH * 0.25);
          retanguloArredondado(ctx, this.rect, portalH * 0.04);
          ctx.fill();
          ctx.fillStyle = Cor.css(Cor.WHITE);
          ctx.textAlign = "center";
          ctx.font = "bold " + (portalH * 0.16) + "px " + FONTE;
          // sem texto FINISH no fallback
        }
        break;
      }
      case SpriteType.TUNNEL: {
        const spriteH = drawUnit * 1.55 * safeSizeFactor;
        if (spriteH < 2) return;
        ctx.fillStyle = Cor.css(Cor.rgb(0x1A, 0x1C, 0x24));
        Ret.definir(this.rect, baseX - spriteH * 0.70, baseY - spriteH * 0.96, baseX + spriteH * 0.70, baseY + drawUnit * 0.04);
        retanguloArredondado(ctx, this.rect, spriteH * 0.42);
        ctx.fill();
        ctx.fillStyle = Cor.css(Cor.rgb(0x37, 0x3B, 0x46));
        Ret.definir(this.rect, baseX - spriteH * 0.52, baseY - spriteH * 0.78, baseX + spriteH * 0.52, baseY + drawUnit * 0.02);
        retanguloArredondado(ctx, this.rect, spriteH * 0.32);
        ctx.fill();
        ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xF0, 0xAE));
        Ret.definir(this.rect, baseX - spriteH * 0.20, baseY - spriteH * 0.90, baseX + spriteH * 0.20, baseY - spriteH * 0.82);
        retanguloArredondado(ctx, this.rect, spriteH * 0.05);
        ctx.fill();
        ctx.fillStyle = Cor.css(Cor.rgb(0x0A, 0x0B, 0x10));
        Ret.definir(this.rect, baseX - spriteH * 0.40, baseY - spriteH * 0.64, baseX + spriteH * 0.40, baseY + drawUnit * 0.01);
        retanguloArredondado(ctx, this.rect, spriteH * 0.24);
        ctx.fill();
        ctx.fillStyle = Cor.css(Cor.rgb(0x7A, 0x80, 0x92));
        ctx.fillRect(baseX - spriteH * 0.60, baseY - spriteH * 0.10, spriteH * 0.04, spriteH * 0.10 + drawUnit * 0.02);
        ctx.fillRect(baseX + spriteH * 0.56, baseY - spriteH * 0.10, spriteH * 0.04, spriteH * 0.10 + drawUnit * 0.02);
        break;
      }
      default:
        // Fallback definitivo para SpriteTypes novos.
        // Os PNGs personalizados sao desenhados antes do switch via propSprites.
        // Se algum PNG falhar, simplesmente nao desenha fallback geometrico.
        break;
    }
  }

  textLike(ctx, label, cx, baseline, size, color) {
    ctx.fillStyle = Cor.css(color);
    // Letras geometricas simples para nao depender de fonte externa no billboard.
    const w = size * 0.18;
    const gap = size * 0.08;
    let x = cx - size * 0.35;
    for (let i = 0; i < label.length; i++) {
      const ch = label.charAt(i);
      switch (ch) {
        case "P":
          ctx.fillRect(x, baseline - size, w, size);
          ctx.fillRect(x, baseline - size, size * 0.28, w);
          ctx.fillRect(x, baseline - size * 0.56, size * 0.28, w);
          ctx.fillRect(x + size * 0.22, baseline - size, size * 0.06, size * 0.44 + w);
          break;
        case "I":
          ctx.fillRect(x, baseline - size, size * 0.30, w);
          ctx.fillRect(x + size * 0.12, baseline - size, size * 0.06, size);
          ctx.fillRect(x, baseline - w, size * 0.30, w);
          break;
        case "T":
          ctx.fillRect(x, baseline - size, size * 0.34, w);
          ctx.fillRect(x + size * 0.14, baseline - size, size * 0.06, size);
          break;
      }
      x += size * 0.34 + gap;
    }
  }

  // ---------------- Carros ----------------

  /**
   * Desenha um sprite (imagem) de carro ancorado pela base, centrado em cx.
   * footprintW: largura desejada na tela; a altura segue a proporcao da imagem.
   */
  blitSprite(ctx, bmp, cx, bottomY, footprintW, flash) {
    const aspect = bmp.naturalHeight / bmp.naturalWidth;
    const w = footprintW;
    const h = w * aspect;
    Ret.definir(this.rect, cx - w / 2, bottomY - h, cx + w / 2, bottomY);
    ctx.globalAlpha = this.spritePaint.alpha / 255;
    if (flash) {
      // Aqui entra o equivalente do PorterDuffColorFilter(argb(170,255,60,60),
      // SRC_ATOP): pintamos o sprite num canvas pequeno fora de tela e cobrimos
      // apenas os pixels dele com o vermelho usando "source-atop".
      const cw = Math.max(1, Math.ceil(w));
      const ch = Math.max(1, Math.ceil(h));
      if (this.flashCanvas.width < cw) this.flashCanvas.width = cw;
      if (this.flashCanvas.height < ch) this.flashCanvas.height = ch;
      const fc = this.flashCtx;
      fc.setTransform(1, 0, 0, 1, 0, 0);
      fc.globalCompositeOperation = "source-over";
      fc.clearRect(0, 0, this.flashCanvas.width, this.flashCanvas.height);
      fc.drawImage(bmp, 0, 0, bmp.naturalWidth, bmp.naturalHeight, 0, 0, cw, ch);
      fc.globalCompositeOperation = "source-atop";
      fc.fillStyle = Cor.css(Renderer.FLASH_COLOR);
      fc.fillRect(0, 0, cw, ch);
      fc.globalCompositeOperation = "source-over";
      ctx.drawImage(this.flashCanvas, 0, 0, cw, ch, this.rect.left, this.rect.top, w, h);
    } else {
      ctx.drawImage(bmp, 0, 0, bmp.naturalWidth, bmp.naturalHeight, this.rect.left, this.rect.top, w, h);
    }
    ctx.globalAlpha = 1;
  }

  drawEnemy(ctx, seg, car, unit) {
    const cx = seg.p1.screen.x + seg.p1.screen.scale * car.offset * this.roadWidth * this.halfW;
    const baseY = seg.p1.screen.y;
    const bmp = this.bitmap(this.carSprites[car.spriteIndex]);
    if (bmp !== null) {
      // V50: escala com perspectiva, mas sem ficar pequeno demais perto
      // nem gigante na camera. O carro de IA perto deve parecer quase
      // do tamanho do carro do jogador, aumentando so um pouco ao aproximar.
      const aspect = bmp.naturalHeight / bmp.naturalWidth;
      let w = Math.max(3, unit * 0.40);
      const maxW = car.isRemote ? this.width * 0.325 : this.width * 0.305;
      if (w > maxW) w = maxW;
      let h = w * aspect;
      const maxH = this.height * 0.345;
      if (h > maxH && aspect > 0) {
        h = maxH;
        w = h / aspect;
      }
      if (car.isRemote) this.drawOpponentCircle(ctx, cx, baseY, w, h);
      if (car.aiTurboActive) this.drawEnemyTurboFx(ctx, cx, baseY, w, h);
      this.blitSprite(ctx, bmp, cx, baseY, w, false);
      if (car.isRemote || car.tauntTimer > 0) this.drawOpponentLabel(ctx, car, cx, baseY, w, h);
    } else {
      const carW = limitar(unit * 0.58, 3, this.width * 0.305);
      const carH = carW * 1.32;
      if (car.isRemote) this.drawOpponentCircle(ctx, cx, baseY, carW, carH);
      if (car.aiTurboActive) this.drawEnemyTurboFx(ctx, cx, baseY, carW, carH);
      this.drawCarShape(ctx, cx, baseY, carW, car.color, Cor.rgb(0x20, 0x20, 0x24), 0, false, car.aiTurboActive);
      if (car.isRemote || car.tauntTimer > 0) this.drawOpponentLabel(ctx, car, cx, baseY, carW, carH);
    }
  }

  drawEnemyTurboFx(ctx, cx, baseY, carW, carH) {
    if (carW < this.width * 0.018) return;
    ctx.fillStyle = Cor.css(Cor.argb(135, 0x4D, 0xC8, 0xFF));
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.28, baseY + carH * 0.05);
    ctx.lineTo(cx - carW * 0.06, baseY + carH * 0.36);
    ctx.lineTo(cx + carW * 0.04, baseY + carH * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = Cor.css(Cor.argb(110, 0xFF, 0xE0, 0x40));
    ctx.beginPath();
    ctx.moveTo(cx + carW * 0.12, baseY + carH * 0.04);
    ctx.lineTo(cx + carW * 0.34, baseY + carH * 0.32);
    ctx.lineTo(cx + carW * 0.28, baseY + carH * 0.04);
    ctx.closePath();
    ctx.fill();
  }

  drawOpponentCircle(ctx, cx, baseY, carW, carH) {
    if (carW < this.width * 0.014) return;
    const ringW = Math.max(this.width * 0.032, carW * 1.45);
    const ringH = Math.max(this.height * 0.010, carH * 0.34);
    ctx.lineWidth = Math.max(2, this.height * 0.0030);
    ctx.strokeStyle = Cor.css(Cor.argb(190, 0x35, 0xE8, 0xFF));
    Ret.definir(this.rect, cx - ringW / 2, baseY - ringH * 0.72, cx + ringW / 2, baseY + ringH * 0.28);
    this.ovalDoRet(ctx, this.rect);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, this.height * 0.0016);
    ctx.strokeStyle = Cor.css(Cor.argb(120, 255, 255, 255));
    const inset = ringW * 0.10;
    Ret.definir(this.rect, cx - ringW / 2 + inset, baseY - ringH * 0.55, cx + ringW / 2 - inset, baseY + ringH * 0.12);
    this.ovalDoRet(ctx, this.rect);
    ctx.stroke();
  }

  drawOpponentLabel(ctx, car, cx, baseY, carW, carH) {
    if (carW < this.width * 0.016) return;
    const bruto = (car.driverName || "").trim();
    const name = (bruto.length === 0 ? "Jogador" : bruto).substring(0, 14);
    const textSize = limitar(this.height * 0.020 + carW * 0.035, this.height * 0.014, this.height * 0.030);
    ctx.font = "bold " + textSize + "px " + FONTE;
    ctx.textAlign = "center";
    const padX = textSize * 0.55;
    const padY = textSize * 0.30;
    const labelW = Math.max(textSize * 4.0, ctx.measureText(name).width + padX * 2);
    const labelH = textSize + padY * 1.55;
    const labelY = baseY - carH - textSize * 0.74;
    Ret.definir(this.rect, cx - labelW / 2, labelY - labelH, cx + labelW / 2, labelY);
    ctx.fillStyle = Cor.css(Cor.argb(185, 0x04, 0x08, 0x16));
    retanguloArredondado(ctx, this.rect, labelH * 0.42);
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, this.height * 0.0017);
    ctx.strokeStyle = Cor.css(Cor.argb(210, 0x35, 0xE8, 0xFF));
    retanguloArredondado(ctx, this.rect, labelH * 0.42);
    ctx.stroke();
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(name, cx, labelY - padY * 0.72);

    if (car.tauntTimer > 0 && car.tauntText.trim().length > 0) {
      this.drawTauntBubble(ctx, car.tauntText, cx, this.rect.top - textSize * 0.46, textSize, car.tauntTimer);
    }
  }

  drawTauntBubble(ctx, rawText, cx, bottomY, textSize, timer) {
    const alpha = limitar(Math.trunc(limitar(timer / 1.85, 0.22, 1) * 235), 50, 235);
    const aparado = rawText.trim();
    const label = (aparado.length > 22) ? aparado.substring(0, 21) + "…" : aparado;
    ctx.font = "bold " + (textSize * 0.92) + "px " + FONTE;
    ctx.textAlign = "center";
    const padX = textSize * 0.72;
    const bubbleW = limitar(ctx.measureText(label).width + padX * 2, this.width * 0.13, this.width * 0.42);
    const bubbleH = textSize * 2.05;
    Ret.definir(this.rect, cx - bubbleW / 2, bottomY - bubbleH, cx + bubbleW / 2, bottomY);
    ctx.fillStyle = Cor.css(Cor.argb(alpha, 255, 255, 255));
    retanguloArredondado(ctx, this.rect, bubbleH * 0.34);
    ctx.fill();
    ctx.lineWidth = Math.max(1, this.height * 0.0015);
    ctx.strokeStyle = Cor.css(Cor.argb(alpha, 0x35, 0xE8, 0xFF));
    retanguloArredondado(ctx, this.rect, bubbleH * 0.34);
    ctx.stroke();
    ctx.fillStyle = Cor.css(Cor.argb(alpha, 255, 255, 255));
    ctx.beginPath();
    ctx.moveTo(cx - textSize * 0.38, bottomY - 1);
    ctx.lineTo(cx + textSize * 0.24, bottomY - 1);
    ctx.lineTo(cx - textSize * 0.10, bottomY + textSize * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = Cor.css(Cor.argb(alpha, 0x10, 0x14, 0x1F));
    ctx.fillText(label, cx, bottomY - bubbleH * 0.38);
  }

  drawPlayer(ctx, player, time, headlightsOn) {
    // Balanco (bounce) leve proporcional a velocidade.
    const speedP = player.speed / player.maxSpeed;
    const slopeVisual = limitar(player.currentSlope / 42, -1, 1);
    const bounceBase = Math.sin(time * (14 + speedP * 6)) * (1.7 + speedP * 4.0);
    const bounce = bounceBase * (1 - Math.abs(slopeVisual) * 0.65);
    const cx = this.halfW + player.x * 6;
    const roadFollowY = (-slopeVisual) * this.height * 0.028;
    const cy = this.height - this.height * 0.048 + roadFollowY + bounce;
    if (player.ghostMode) {
      const pulse = (Math.sin(time * 10) * 0.5 + 0.5);
      ctx.fillStyle = Cor.css(Cor.argb(Math.trunc(62 + pulse * 52), 0xB8, 0x7C, 0xFF));
      Ret.definir(this.rect, cx - this.width * 0.20, cy - this.height * 0.21, cx + this.width * 0.20, cy + this.height * 0.03);
      this.ovalDoRet(ctx, this.rect);
      ctx.fill();
    }

    const steerVisual = limitar(player.visualSteer, -1, 1);
    const centerBmp = this.bitmap(this.carSprites[player.car.id]);
    let bmp;
    if (steerVisual > 0.34) bmp = this.bitmap(this.playerRightSprites[player.car.id]) || centerBmp;
    else if (steerVisual < -0.34) bmp = this.bitmap(this.playerLeftSprites[player.car.id]) || centerBmp;
    else bmp = centerBmp;

    if (bmp !== null) {
      const aspect = bmp.naturalHeight / bmp.naturalWidth;
      // V82: o Obsidian GT (carro preto) estava pequeno apenas quando era o carro do jogador.
      // A IA continua com o tamanho antigo; aqui ajustamos so a escala visual do player.
      const playerSpriteScale = (player.car.id === 5) ? 1.22 : 1;
      let h = this.height * (0.312 + speedP * 0.030) * playerSpriteScale;
      let w = h / aspect;
      const maxW = this.width * ((player.car.id === 5) ? 0.385 : 0.34);
      if (w > maxW) {
        w = maxW;
        h = w * aspect;
      }
      this.drawPlayerShadow(ctx, cx, cy, w, h, slopeVisual);
      this.drawUnderglow(ctx, cx, cy, w, h, player.car.accentColor, player.turboActive);
      if (player.driftAmount > 0.05) {
        this.drawDriftFx(ctx, cx, cy, w, h, player.driftAmount, time, steerVisual);
      }
      if (headlightsOn) {
        this.drawHeadlightBeams(ctx, cx, cy, w, h, steerVisual);
      }
      if (player.turboActive) {
        this.drawTurboExhaust(ctx, cx, cy, w, h, time);
      }
      const flash = player.collisionFlash > 0 && Math.trunc(time * 20) % 2 === 0;
      if (player.ghostMode) this.spritePaint.alpha = 118;
      this.blitSprite(ctx, bmp, cx, cy, w, flash);
      this.spritePaint.alpha = 255;
    } else {
      const carW = this.width * 0.20;
      let body;
      if (player.ghostMode) {
        body = Cor.argb(135, Cor.red(player.car.bodyColor), Cor.green(player.car.bodyColor), Cor.blue(player.car.bodyColor));
      } else if (player.collisionFlash > 0 && Math.trunc(time * 20) % 2 === 0) {
        body = Cor.rgb(0xFF, 0x55, 0x55);
      } else {
        body = player.car.bodyColor;
      }
      this.drawPlayerShadow(ctx, cx, cy, carW, carW * 1.2, slopeVisual);
      this.drawUnderglow(ctx, cx, cy, carW, carW * 1.2, player.car.accentColor, player.turboActive);
      if (player.driftAmount > 0.05) {
        this.drawDriftFx(ctx, cx, cy, carW, carW * 1.2, player.driftAmount, time, steerVisual);
      }
      if (headlightsOn) {
        this.drawHeadlightBeams(ctx, cx, cy, carW, carW * 1.2, steerVisual);
      }
      this.drawCarShape(ctx, cx, cy, carW, body, player.car.accentColor, steerVisual, player.collisionFlash > 0, player.turboActive);
    }
  }

  drawUnderglow(ctx, cx, cy, carW, carH, accent, turbo) {
    const alpha = turbo ? 112 : 58;
    ctx.fillStyle = Cor.css(Cor.argb(alpha, Cor.red(accent), Cor.green(accent), Cor.blue(accent)));
    Ret.definir(this.rect, cx - carW * 0.42, cy - carH * 0.080, cx + carW * 0.42, cy + carH * 0.070);
    this.ovalDoRet(ctx, this.rect);
    ctx.fill();
  }

  drawDriftFx(ctx, cx, cy, carW, carH, amount, time, steer) {
    const a = limitar(amount, 0, 1);
    const wheelY = cy - carH * 0.03;
    const rearY = cy + carH * 0.03;
    const slide = steer * carW * 0.18;

    // V86: removidas as marcas pretas atras das rodas.
    // Mantemos apenas a fumaca da derrapagem para deixar o visual mais limpo.

    // Fumaca muito leve atras das rodas.
    const smokeAlpha = limitar(Math.trunc(34 + a * 66), 22, 100);
    for (let i = 0; i < 5; i++) {
      const phase = (Math.sin(time * 5.4 + i * 1.7) * 0.5 + 0.5);
      const off = (i % 2 === 0) ? -carW * 0.28 : carW * 0.28;
      const sx = cx + off - slide * (0.30 + i * 0.07);
      const sy = rearY + carH * (0.05 + i * 0.035);
      const rw = carW * (0.055 + a * 0.060 + phase * 0.025);
      const rh = carH * (0.022 + a * 0.030);
      ctx.fillStyle = Cor.css(Cor.argb(limitar(Math.trunc(smokeAlpha * (1 - i * 0.12)), 10, 105), 210, 214, 220));
      Ret.definir(this.rect, sx - rw, sy - rh, sx + rw, sy + rh);
      this.ovalDoRet(ctx, this.rect);
      ctx.fill();
    }
  }

  drawPlayerShadow(ctx, cx, cy, carW, carH, slopeVisual) {
    const shadowLift = slopeVisual * carH * 0.03;
    const shadowY = cy - carH * 0.06 + shadowLift;
    const shadowW = carW * (0.34 + Math.abs(slopeVisual) * 0.06);
    const shadowH = carH * 0.06;
    ctx.fillStyle = Cor.css(Cor.argb(limitar(Math.trunc(84 + Math.abs(slopeVisual) * 26), 70, 120), 0, 0, 0));
    Ret.definir(this.rect, cx - shadowW, shadowY - shadowH, cx + shadowW, shadowY + shadowH);
    this.ovalDoRet(ctx, this.rect);
    ctx.fill();
  }

  drawTurboExhaust(ctx, cx, cy, carW, carH, time) {
    const pulse = (Math.sin(time * 22) * 0.5 + 0.5);
    const baseY = cy - carH * 0.07;
    const flameH = carH * (0.18 + pulse * 0.05);
    const flameW = carW * 0.13;
    const offsets = [-carW * 0.16, carW * 0.16];

    for (let k = 0; k < offsets.length; k++) {
      const fx = cx + offsets[k];
      ctx.fillStyle = Cor.css(Cor.argb(175, 0xFF, 0x6A, 0x18));
      ctx.beginPath();
      ctx.moveTo(fx - flameW, baseY);
      ctx.lineTo(fx, baseY + flameH);
      ctx.lineTo(fx + flameW, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = Cor.css(Cor.argb(210, 0xFF, 0xE0, 0x40));
      ctx.beginPath();
      ctx.moveTo(fx - flameW * 0.45, baseY);
      ctx.lineTo(fx, baseY + flameH * 0.62);
      ctx.lineTo(fx + flameW * 0.45, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawHeadlightBeams(ctx, cx, cy, carW, carH, steer) {
    // O farol agora fica "colado" no asfalto. Ele nao sobe ate o ceu:
    // so clareia o trecho da pista logo a frente do carro.
    const lampY = cy - carH * 0.36;
    const nearY = cy - carH * 0.48;
    const midY = cy - carH * 0.66;
    const farY = cy - carH * 0.88;

    const leftLampX = cx - carW * 0.19;
    const rightLampX = cx + carW * 0.19;
    const steerShift = steer * carW * 0.11;

    // Mancha principal no chao.
    ctx.fillStyle = Cor.css(Cor.argb(74, 0xFF, 0xF1, 0x95));
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.24, nearY);
    ctx.lineTo(cx - carW * 0.52 + steerShift, midY);
    ctx.lineTo(cx - carW * 0.72 + steerShift, farY);
    ctx.lineTo(cx + carW * 0.72 + steerShift, farY);
    ctx.lineTo(cx + carW * 0.52 + steerShift, midY);
    ctx.lineTo(cx + carW * 0.24, nearY);
    ctx.closePath();
    ctx.fill();

    // Nucleo do feixe, mais curto e mais forte.
    ctx.fillStyle = Cor.css(Cor.argb(92, 0xFF, 0xFA, 0xC8));
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.15, nearY);
    ctx.lineTo(cx - carW * 0.32 + steerShift, midY);
    ctx.lineTo(cx - carW * 0.44 + steerShift, farY);
    ctx.lineTo(cx + carW * 0.44 + steerShift, farY);
    ctx.lineTo(cx + carW * 0.32 + steerShift, midY);
    ctx.lineTo(cx + carW * 0.15, nearY);
    ctx.closePath();
    ctx.fill();

    // Reflexo oval no asfalto, deixando claro que a luz esta no chao.
    ctx.fillStyle = Cor.css(Cor.argb(72, 0xFF, 0xF6, 0xB8));
    Ret.definir(
      this.rect,
      cx - carW * 0.40 + steerShift * 0.55,
      cy - carH * 0.66,
      cx + carW * 0.40 + steerShift * 0.55,
      cy - carH * 0.39
    );
    this.ovalDoRet(ctx, this.rect);
    ctx.fill();

    // Lampadas.
    ctx.fillStyle = Cor.css(Cor.argb(230, 0xFF, 0xF9, 0xC8));
    ctx.beginPath();
    ctx.arc(leftLampX, lampY, carW * 0.030, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rightLampX, lampY, carW * 0.030, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Desenha um carro visto por tras, usando formas geometricas.
   * cx: centro horizontal, bottomY: base (rodas),
   * carW: largura total, steer: inclinacao visual (-1..1).
   */
  drawCarShape(ctx, cx, bottomY, carW, bodyColor, accentColor, steer, brake, turbo) {
    const carH = carW * 0.78;
    const top = bottomY - carH;
    const skew = steer * carW * 0.025;

    // Sombra no chao
    ctx.fillStyle = Cor.css(Cor.argb(80, 0, 0, 0));
    Ret.definir(this.rect, cx - carW * 0.55, bottomY - carH * 0.05, cx + carW * 0.55, bottomY + carH * 0.08);
    this.ovalDoRet(ctx, this.rect);
    ctx.fill();

    // Rodas
    ctx.fillStyle = Cor.css(Cor.rgb(0x15, 0x15, 0x18));
    Ret.definir(this.rect, cx - carW * 0.52, bottomY - carH * 0.30, cx - carW * 0.30, bottomY);
    retanguloArredondado(ctx, this.rect, carW * 0.04);
    ctx.fill();
    Ret.definir(this.rect, cx + carW * 0.30, bottomY - carH * 0.30, cx + carW * 0.52, bottomY);
    retanguloArredondado(ctx, this.rect, carW * 0.04);
    ctx.fill();

    // Corpo (trapezio, mais largo embaixo)
    const botW = carW * 0.92;
    const midW = carW * 0.84;
    ctx.fillStyle = Cor.css(bodyColor);
    ctx.beginPath();
    ctx.moveTo(cx - botW / 2, bottomY - carH * 0.08);
    ctx.lineTo(cx + botW / 2, bottomY - carH * 0.08);
    ctx.lineTo(cx + midW / 2 + skew, top + carH * 0.42);
    ctx.lineTo(cx - midW / 2 + skew, top + carH * 0.42);
    ctx.closePath();
    ctx.fill();

    // Cabine / teto
    const cabW = carW * 0.58;
    ctx.fillStyle = Cor.css(this.darken(bodyColor, 0.8));
    ctx.beginPath();
    ctx.moveTo(cx - cabW / 2 + skew, top + carH * 0.42);
    ctx.lineTo(cx + cabW / 2 + skew, top + carH * 0.42);
    ctx.lineTo(cx + cabW * 0.40 + skew, top);
    ctx.lineTo(cx - cabW * 0.40 + skew, top);
    ctx.closePath();
    ctx.fill();

    // Vidro traseiro
    ctx.fillStyle = Cor.css(Cor.rgb(0x1A, 0x22, 0x2E));
    Ret.definir(this.rect, cx - cabW * 0.34 + skew, top + carH * 0.06, cx + cabW * 0.34 + skew, top + carH * 0.36);
    retanguloArredondado(ctx, this.rect, carW * 0.03);
    ctx.fill();

    // Faixa de detalhe (cor de destaque)
    ctx.fillStyle = Cor.css(accentColor);
    ctx.fillRect(cx - midW / 2 + skew, top + carH * 0.46, midW, carH * 0.06);

    // Para-choque + lanternas
    ctx.fillStyle = Cor.css(brake ? Cor.rgb(0xFF, 0x30, 0x30) : Cor.rgb(0xB0, 0x20, 0x20));
    Ret.definir(this.rect, cx - botW * 0.42, bottomY - carH * 0.22, cx - botW * 0.24, bottomY - carH * 0.10);
    retanguloArredondado(ctx, this.rect, carW * 0.02);
    ctx.fill();
    Ret.definir(this.rect, cx + botW * 0.24, bottomY - carH * 0.22, cx + botW * 0.42, bottomY - carH * 0.10);
    retanguloArredondado(ctx, this.rect, carW * 0.02);
    ctx.fill();
  }

  darken(color, factor) {
    const r = limitar(Math.trunc(Cor.red(color) * factor), 0, 255);
    const g = limitar(Math.trunc(Cor.green(color) * factor), 0, 255);
    const b = limitar(Math.trunc(Cor.blue(color) * factor), 0, 255);
    return Cor.rgb(r, g, b);
  }
}

/** Cor do "piscar" da batida: Color.argb(170, 0xFF, 0x3C, 0x3C) do Kotlin. */
Renderer.FLASH_COLOR = Cor.argb(170, 0xFF, 0x3C, 0x3C);

/*
 * Nomes de recurso do cenario lateral por SpriteType. E o mesmo mapa que a
 * GameView.loadCarSprites() montava no Android, so que guardando o nome em vez
 * do Bitmap ja decodificado — o Assets.img() decodifica quando precisa.
 */
Renderer.PROP_SPRITES = {};
Renderer.PROP_SPRITES[SpriteType.BUSH] = "arbustos";
Renderer.PROP_SPRITES[SpriteType.TREE_ROUND] = "arvore_folhosa";
Renderer.PROP_SPRITES[SpriteType.TREE_PINE] = "arvore_pinheiro";
Renderer.PROP_SPRITES[SpriteType.TREE_PALM] = "arvore_praia";
Renderer.PROP_SPRITES[SpriteType.CACTUS_DESERT] = "cacto_deserto";
Renderer.PROP_SPRITES[SpriteType.SIGN_CANYON] = "placa_canyon";
Renderer.PROP_SPRITES[SpriteType.SIGN_CHEVRON] = "placa_chevron";
Renderer.PROP_SPRITES[SpriteType.SIGN_CHEVRON_HORIZONTAL] = "placa_chevron_horizontal";
Renderer.PROP_SPRITES[SpriteType.SIGN_CURVE] = "placa_curva";
Renderer.PROP_SPRITES[SpriteType.SIGN_DIRECTIONAL] = "placa_direcional";
Renderer.PROP_SPRITES[SpriteType.TREE_OAK] = "tree_oak";
Renderer.PROP_SPRITES[SpriteType.TREE_CYPRESS] = "tree_cypress";
Renderer.PROP_SPRITES[SpriteType.TREE_SNOW] = "tree_snow";
Renderer.PROP_SPRITES[SpriteType.TREE_BIRCH] = "tree_birch";
Renderer.PROP_SPRITES[SpriteType.BUSH_ROUND] = "bush_round";
Renderer.PROP_SPRITES[SpriteType.BUSH_LIGHT] = "bush_light";
Renderer.PROP_SPRITES[SpriteType.BUSH_FLOWER] = "bush_flower";
Renderer.PROP_SPRITES[SpriteType.GRASS_CLUMP] = "grass_clump";
Renderer.PROP_SPRITES[SpriteType.GUARDRAIL_SIDE] = "guardrail_side";
Renderer.PROP_SPRITES[SpriteType.SIGN_TURN_RIGHT] = "sign_turn_right";
Renderer.PROP_SPRITES[SpriteType.SIGN_WARNING] = "sign_warning";
Renderer.PROP_SPRITES[SpriteType.SIGN_BUMP] = "sign_bump";
Renderer.PROP_SPRITES[SpriteType.SIGN_SPEED_LIMIT] = "sign_speed_limit";
Renderer.PROP_SPRITES[SpriteType.SIGN_SLIPPERY] = "sign_slippery";
Renderer.PROP_SPRITES[SpriteType.PUDDLE_WATER] = "puddle_water";
Renderer.PROP_SPRITES[SpriteType.PUDDLE_OIL] = "puddle_oil";

/** Fundo de cada fase, indexado pelo nome da fase — igual ao mapa do Kotlin. */
Renderer.STAGE_BACKGROUNDS = {
  "São Paulo Chuva": "rain_bg_brasil_01",
  "Rio de Janeiro": "stage_bg_02",
  "Brasília Racing": "stage_bg_03",
  "Salvador Axé": "stage_bg_04",
  "Recife Pontes": "stage_bg_05",
  "Fortaleza Beira Mar": "stage_bg_06",
  "Manaus Amazônia": "stage_bg_07",
  "Belo Horizonte": "stage_bg_08",
  "Curitiba Ecológica": "stage_bg_09",
  "Foz do Iguaçu": "stage_bg_10",

  "New York Skyline": "stage_bg_11",
  "Los Angeles Hills": "stage_bg_12",
  "Las Vegas Neon": "stage_bg_13",
  "San Francisco Bay": "stage_bg_14",
  "Miami Coast Run": "stage_bg_15",
  "Chicago Grand Prix": "stage_bg_16",

  "Tóquio Neon": "stage_bg_17",
  "Osaka Castle": "stage_bg_18",
  "Quioto Tradicional": "stage_bg_19",
  "Yokohama Harbor": "stage_bg_20",
  "Sapporo Snow Tower": "stage_bg_21",
  "Hiroshima Peace Run": "stage_bg_22",

  "Roma Antica": "stage_bg_23",
  "Costa Amalfitana": "stage_bg_24",
  "Toscana Hills": "stage_bg_25",
  "Milano Temporale": "stage_bg_26",
  "Dolomiti Ice Run": "stage_bg_27",
  "Italia Final Trophy": "stage_bg_28"
};

window.Renderer = Renderer;
