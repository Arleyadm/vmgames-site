"use strict";
/*
 * Desenha toda a interface (HUD) durante a corrida e as telas sobrepostas:
 *  - HUD: velocimetro, tempo, distancia, moedas, posicao e barra de turbo
 *  - Botoes na tela: pause + (dependendo do tipo de controle) virar/turbo/freio
 *  - Telas de contagem regressiva, pause e resultado (vitoria/derrota)
 *
 * As areas tocaveis (retangulos) sao publicas: o game.js le esses retangulos
 * para saber onde o jogador tocou e qual acao executar. Assim o desenho e o
 * toque ficam sempre coerentes (o mesmo retangulo serve para os dois).
 *
 * Porte de HUD.kt. Os RectF do Android viraram objetos {left, top, right,
 * bottom} criados com Ret.novo(...), com os MESMOS nomes de campo do Kotlin.
 */
class HUD {

  constructor() {
    this.w = 0;
    this.h = 0;

    // O Kotlin reaproveita um unico RectF (`rect`) e um Path (`path`). Aqui o
    // `rect` continua sendo um so; o `tmp` cobre os poucos lugares onde o
    // Android usava a sobrecarga drawRoundRect(l, t, r, b, rx, ry) lendo o
    // proprio `rect` como origem dos valores.
    this.rect = Ret.novo(0, 0, 0, 0);
    this.tmp = Ret.novo(0, 0, 0, 0);

    // Espelha o Paint de texto do Android: tamanho, negrito e familia atuais.
    this.textSize = 12;
    this.textBold = false;
    this.textFamily = FONTE;

    this.defeatBitmap = null;
    this.victoryBitmap = null;
    this.leftArrowBitmap = null;
    this.rightArrowBitmap = null;
    this.accelPedalBitmap = null;
    this.brakePedalBitmap = null;
    this.countdown3Bitmap = null;
    this.countdown2Bitmap = null;
    this.countdown1Bitmap = null;
    this.countdownGoBitmap = null;

    // ---- Areas tocaveis (preenchidas em setup()) ----
    this.pauseBtn = Ret.novo(0, 0, 0, 0);
    this.headlightBtn = Ret.novo(0, 0, 0, 0);

    // Botoes de controle (uso depende do tipo de controle escolhido)
    this.leftBtn = Ret.novo(0, 0, 0, 0);
    this.rightBtn = Ret.novo(0, 0, 0, 0);
    this.turboBtn = Ret.novo(0, 0, 0, 0);
    this.accelBtn = Ret.novo(0, 0, 0, 0);
    this.brakeBtn = Ret.novo(0, 0, 0, 0);
    this.reverseBtn = Ret.novo(0, 0, 0, 0);
    this.pitBoostBtn = Ret.novo(0, 0, 0, 0);
    this.freezeRivalsBtn = Ret.novo(0, 0, 0, 0);
    this.ghostModeBtn = Ret.novo(0, 0, 0, 0);

    // Botoes da tela de pause
    this.resumeBtn = Ret.novo(0, 0, 0, 0);
    this.restartBtn = Ret.novo(0, 0, 0, 0);
    this.musicBtn = Ret.novo(0, 0, 0, 0);
    this.menuBtn = Ret.novo(0, 0, 0, 0);

    // Botoes da tela de resultado (vitoria/derrota)
    this.btnPrimary = Ret.novo(0, 0, 0, 0);
    this.btnSecondary = Ret.novo(0, 0, 0, 0);
    this.btnTertiary = Ret.novo(0, 0, 0, 0);
    this.btnGarage = Ret.novo(0, 0, 0, 0);

    // Cores do tema neon
    this.cyan = Cor.rgb(0x00, 0xF5, 0xD4);
    this.magenta = Cor.rgb(0xF5, 0x00, 0x90);
    this.purple = Cor.rgb(0x8A, 0x2B, 0xE2);
    this.white = Cor.WHITE;
    this.panelBg = Cor.argb(0xCC, 0x0B, 0x06, 0x1A);

    this.controlType = SaveManager.CONTROL_TOUCH;
  }

  // ---- Substitutos do Canvas/Paint do Android ----

  /** Aplica tamanho + negrito + familia em ctx.font (o Paint do Android guardava isso). */
  _applyFont(ctx) {
    ctx.font = (this.textBold ? "bold " : "") + this.textSize + "px " + this.textFamily;
    // O Android desenha texto pela linha de base; o Canvas do navegador tambem,
    // mas so se ninguem tiver mexido no textBaseline antes da gente.
    ctx.textBaseline = "alphabetic";
  }

  /** Equivale a text.textSize = s. */
  _setTextSize(ctx, s) { this.textSize = s; this._applyFont(ctx); }

  /** Equivale a text.isFakeBoldText = b. */
  _setBold(ctx, b) { this.textBold = b; this._applyFont(ctx); }

  /** Troca a familia da fonte (FONTE ou FONTE_NUMEROS) mantendo tamanho e peso. */
  _setFamily(ctx, family) { this.textFamily = family; this._applyFont(ctx); }

  /** Equivale a canvas.drawOval(rect, paint): monta o caminho da elipse. */
  _oval(ctx, r) {
    ctx.beginPath();
    ctx.ellipse(Ret.centroX(r), Ret.centroY(r),
      Math.max(0, Ret.largura(r) / 2), Math.max(0, Ret.altura(r) / 2),
      0, 0, Math.PI * 2);
  }

  /** Equivale a canvas.drawArc(rect, start, sweep, false, paint) em graus. */
  _arco(ctx, r, startAngle, sweepAngle) {
    ctx.beginPath();
    ctx.ellipse(Ret.centroX(r), Ret.centroY(r),
      Math.max(0, Ret.largura(r) / 2), Math.max(0, Ret.altura(r) / 2),
      0, startAngle * Math.PI / 180, (startAngle + sweepAngle) * Math.PI / 180,
      sweepAngle < 0);
  }

  /** Equivale a rect.inset(dx, dy). */
  _inset(r, dx, dy) {
    r.left += dx; r.top += dy; r.right -= dx; r.bottom -= dy;
    return r;
  }

  /** Equivale a rect.setEmpty(). */
  _setEmpty(r) { return Ret.definir(r, 0, 0, 0, 0); }

  /** Equivale a canvas.drawLine(x1, y1, x2, y2, paint). */
  _linha(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /** Equivale a canvas.drawCircle(cx, cy, r, paint) preenchido. */
  _circulo(ctx, cx, cy, raio) {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0, raio), 0, Math.PI * 2);
  }

  /** Equivale a canvas.drawBitmap(bmp, null, dst, paint com alfa). */
  _desenharImagem(ctx, bmp, r, alpha) {
    if (bmp === null || bmp === undefined) return;
    const anterior = ctx.globalAlpha;
    if (alpha !== undefined && alpha !== null) ctx.globalAlpha = limitar(alpha, 0, 255) / 255;
    ctx.drawImage(bmp, r.left, r.top, Ret.largura(r), Ret.altura(r));
    ctx.globalAlpha = anterior;
  }

  /** Largura real da imagem (o Bitmap do Android tinha width/height diretos). */
  _larguraImagem(bmp) { return bmp.naturalWidth || bmp.width || 1; }

  /** Altura real da imagem. */
  _alturaImagem(bmp) { return bmp.naturalHeight || bmp.height || 1; }

  // ---- Bitmaps vindos de fora (Assets.img(...) ou null) ----

  setDefeatBitmap(bitmap) {
    this.defeatBitmap = bitmap || null;
  }

  setVictoryBitmap(bitmap) {
    this.victoryBitmap = bitmap || null;
  }

  setControlArrowBitmaps(left, right) {
    this.leftArrowBitmap = left || null;
    this.rightArrowBitmap = right || null;
  }

  setControlPedalBitmaps(accel, brake) {
    this.accelPedalBitmap = accel || null;
    this.brakePedalBitmap = brake || null;
  }

  setCountdownBitmaps(three, two, one, go) {
    this.countdown3Bitmap = three || null;
    this.countdown2Bitmap = two || null;
    this.countdown1Bitmap = one || null;
    this.countdownGoBitmap = go || null;
  }

  /** Calcula a posicao de todos os botoes a partir do tamanho da tela. */
  setup(width, height, controlType) {
    const w = width;
    const h = height;
    this.w = w;
    this.h = h;
    this.controlType = controlType;

    const unit = Math.min(w, h);
    const m = unit * 0.024;
    const sideW = unit * 0.176;
    const sideH = unit * 0.150;
    const actionSize = unit * 0.145;
    const reverseSize = 0;
    const smallH = sideH * 0.50;
    const gap = unit * 0.020;

    const p = unit * 0.066;
    // V64: pause abaixo do painel de pilotos, sem sobreposicao.
    Ret.definir(this.pauseBtn, w - m - p, h * 0.525, w - m, h * 0.525 + p);

    const headlightH = unit * 0.065;
    const headlightW = actionSize * 0.84;

    if (controlType === SaveManager.CONTROL_BUTTONS) {
      Ret.definir(this.leftBtn, m, h - m - sideH, m + sideW, h - m);
      Ret.definir(this.rightBtn, m + sideW + gap, h - m - sideH, m + sideW + gap + sideW, h - m);
      Ret.definir(this.brakeBtn, m, h - m - sideH - gap - smallH, m + sideW * 1.14, h - m - sideH - gap);
      const raceItemSize = Ret.altura(this.brakeBtn);
      // Um botao circular troca o item selecionado; o outro ativa o item.
      // Nao desenhamos mais GAS+/GELO/FANTASMA lado a lado.
      Ret.definir(this.pitBoostBtn, this.brakeBtn.right + gap, this.brakeBtn.top, this.brakeBtn.right + gap + raceItemSize, this.brakeBtn.bottom);
      Ret.definir(this.freezeRivalsBtn, this.pitBoostBtn.right + gap * 0.70, this.brakeBtn.top, this.pitBoostBtn.right + gap * 0.70 + raceItemSize, this.brakeBtn.bottom);
      this._setEmpty(this.ghostModeBtn);
      this._setEmpty(this.reverseBtn);

      Ret.definir(this.accelBtn, w - m - actionSize, h - m - actionSize, w - m, h - m);
      Ret.definir(this.turboBtn, w - m - actionSize, h - m - actionSize - gap - actionSize * 0.94, w - m, h - m - actionSize - gap);
      // V73: farol ao lado esquerdo do turbo, nao mais acima.
      Ret.definir(this.headlightBtn, this.turboBtn.left - gap - headlightW, Ret.centroY(this.turboBtn) - headlightH * 0.5, this.turboBtn.left - gap, Ret.centroY(this.turboBtn) + headlightH * 0.5);
    } else {
      Ret.definir(this.brakeBtn, m, h - m - actionSize, m + actionSize, h - m);
      const raceItemSize = actionSize * 0.92;
      // Um botao circular troca o item selecionado; o outro ativa o item.
      // Nao desenhamos mais GAS+/GELO/FANTASMA lado a lado.
      Ret.definir(this.pitBoostBtn, this.brakeBtn.right + gap, this.brakeBtn.top + actionSize * 0.10, this.brakeBtn.right + gap + raceItemSize, this.brakeBtn.top + actionSize * 0.10 + raceItemSize);
      Ret.definir(this.freezeRivalsBtn, this.pitBoostBtn.right + gap * 0.70, this.pitBoostBtn.top, this.pitBoostBtn.right + gap * 0.70 + raceItemSize, this.pitBoostBtn.bottom);
      this._setEmpty(this.ghostModeBtn);
      this._setEmpty(this.reverseBtn);
      Ret.definir(this.turboBtn, w - m - actionSize, h - m - actionSize, w - m, h - m);
      // V73: farol ao lado esquerdo do turbo, nao mais acima.
      Ret.definir(this.headlightBtn, this.turboBtn.left - gap - headlightW, Ret.centroY(this.turboBtn) - headlightH * 0.5, this.turboBtn.left - gap, Ret.centroY(this.turboBtn) + headlightH * 0.5);
      this._setEmpty(this.accelBtn);
      this._setEmpty(this.leftBtn);
      this._setEmpty(this.rightBtn);
    }
  }

  // =================== HUD durante a corrida ===================

  draw(ctx, state, player, headlightsOn, darkStage, controls, pitBoostAvailable, freezeRivalsAvailable, ghostModeAvailable, selectedRaceUpgradeLabel, selectedRaceUpgradeAvailable) {
    if (headlightsOn === undefined) headlightsOn = false;
    if (darkStage === undefined) darkStage = false;
    if (controls === undefined) controls = null;
    if (pitBoostAvailable === undefined) pitBoostAvailable = false;
    if (freezeRivalsAvailable === undefined) freezeRivalsAvailable = false;
    if (ghostModeAvailable === undefined) ghostModeAvailable = false;
    if (selectedRaceUpgradeLabel === undefined) selectedRaceUpgradeLabel = "";
    if (selectedRaceUpgradeAvailable === undefined) selectedRaceUpgradeAvailable = false;

    const w = this.w, h = this.h;
    const top = h * 0.020;

    const minutes = Math.trunc(state.timeLeft / 60);
    const seconds = Math.trunc(state.timeLeft % 60);
    const timeStr = minutes + ":" + String(seconds).padStart(2, "0");
    const dist = state.distanceMeters(player.position);

    // Relogio real central, grande e neon.
    this.drawCenterClock(ctx, timeStr, state.timeLeft <= 15);

    // Bloco de velocidade/marcha no canto direito.
    const speedBox = Ret.novo(w * 0.770, top, w * 0.982, h * 0.205);
    this.drawRetroSpeedMeter(ctx, player, speedBox);

    // Boxes compactos no topo esquerdo. V60: mais espacados para nao sobrepor.
    this.drawStatBox(ctx, w * 0.018, top, w * 0.094, h * 0.044, "VOLTA", state.currentLap + "/" + state.totalLaps, this.white);
    this.drawStatBox(ctx, w * 0.120, top, w * 0.084, h * 0.044, "POS", state.rank + "/" + state.totalRacers, this.white);
    this.drawStatBox(ctx, w * 0.018, h * 0.073, w * 0.094, h * 0.044, "MOEDAS", "" + state.coins, Cor.rgb(0xFF, 0xC1, 0x07));
    this.drawStatBox(ctx, w * 0.120, h * 0.073, w * 0.132, h * 0.044, "DIST", dist + "/" + state.totalMeters() + "m", this.white);

    this.drawTurboBar(ctx, player);
    this.drawFuelBar(ctx, state, player);
    this.drawPitNotice(ctx, state);
    this.drawControlButtons(ctx, player, controls, pitBoostAvailable, freezeRivalsAvailable, ghostModeAvailable, selectedRaceUpgradeLabel, selectedRaceUpgradeAvailable);
    this.drawTouchClickIndicators(ctx, controls);
    this.drawPauseButton(ctx);
    this.drawHeadlightButton(ctx, headlightsOn, darkStage);
  }

  drawCenterClock(ctx, timeStr, danger) {
    const w = this.w, h = this.h;
    const bw = w * 0.205;
    const bh = h * 0.082;
    const x = w / 2 - bw / 2;
    const y = h * 0.014;
    Ret.definir(this.rect, x, y, x + bw, y + bh);

    ctx.fillStyle = Cor.css(Cor.argb(210, 0x04, 0x04, 0x12));
    retanguloArredondado(ctx, this.rect, bh * 0.34);
    ctx.fill();

    ctx.lineWidth = h * 0.0048;
    ctx.strokeStyle = Cor.css(danger ? Cor.rgb(0xFF, 0x45, 0x45) : this.cyan);
    retanguloArredondado(ctx, this.rect, bh * 0.34);
    ctx.stroke();
    ctx.lineWidth = h * 0.0018;
    ctx.strokeStyle = Cor.css(Cor.argb(180, 0xF5, 0x00, 0x90));
    this._inset(this.rect, h * 0.007, h * 0.007);
    retanguloArredondado(ctx, this.rect, bh * 0.25);
    ctx.stroke();

    // Digitos com a fonte de largura fixa: o relogio nao "danca" a cada segundo.
    ctx.textAlign = "center";
    this._setFamily(ctx, FONTE_NUMEROS);
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.060);
    ctx.lineWidth = h * 0.0030;
    ctx.strokeStyle = Cor.css(Cor.argb(165, 0, 0, 0));
    ctx.strokeText(timeStr, w / 2 + h * 0.004, y + bh * 0.72 + h * 0.004);
    ctx.fillStyle = Cor.css(danger ? Cor.rgb(0xFF, 0xE0, 0x40) : Cor.WHITE);
    ctx.fillText(timeStr, w / 2, y + bh * 0.72);
    this._setFamily(ctx, FONTE);
    this._setBold(ctx, false);
  }

  /**
   * Minimapa em circuito: mostra o loop da pista, a posicao do jogador e os
   * adversarios. A linha branca no topo e a largada/chegada.
   */
  drawCircuitMap(ctx, stage, state, playerPos, leaderPos, leaderIsPlayer, trackLength, traffic) {
    const w = this.w, h = this.h;
    if (trackLength <= 0 || stage.mapNodes.length === 0) return;

    const panel = Ret.novo(w * 0.018, h * 0.300, w * 0.170, h * 0.485);
    ctx.fillStyle = Cor.css(this.panelBg);
    retanguloArredondado(ctx, panel, h * 0.022);
    ctx.fill();
    ctx.lineWidth = h * 0.004;
    ctx.strokeStyle = Cor.css(this.cyan);
    retanguloArredondado(ctx, panel, h * 0.022);
    ctx.stroke();

    const mapRect = Ret.novo(panel.left + h * 0.018, panel.top + h * 0.055, panel.right - h * 0.018, panel.bottom - h * 0.018);
    const nodes = stage.mapNodes;
    const screenPts = nodes.map(function (pt) {
      return [mapRect.left + pt.x * Ret.largura(mapRect), mapRect.top + pt.y * Ret.altura(mapRect)];
    });

    ctx.lineWidth = h * 0.013;
    ctx.strokeStyle = Cor.css(Cor.argb(0xAA, 0x11, 0x18, 0x28));
    ctx.beginPath();
    ctx.moveTo(screenPts[0][0], screenPts[0][1]);
    for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i][0], screenPts[i][1]);
    ctx.stroke();
    ctx.lineWidth = h * 0.0045;
    ctx.strokeStyle = Cor.css(this.white);
    ctx.stroke();

    const sx = screenPts[0][0];
    const sy = screenPts[0][1];
    if (screenPts.length > 1) {
      const nx = screenPts[1][0];
      const ny = screenPts[1][1];
      ctx.lineWidth = h * 0.005;
      ctx.strokeStyle = Cor.css(this.magenta);
      this._linha(ctx, sx, sy, (sx + nx) / 2, (sy + ny) / 2);
    }

    function pointAt(progress) {
      const pts = screenPts;
      if (pts.length === 1) return pts[0];
      const segments = pts.length - 1;
      const f = limitar(progress, 0, 0.9999) * segments;
      const idx = limitar(Math.trunc(f), 0, segments - 1);
      const t = f - idx;
      const a = pts[idx];
      const b = pts[idx + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }

    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0x95, 0x42));
    for (let i = 0; i < traffic.length; i++) {
      const car = traffic[i];
      const pos = pointAt(limitar(car.z / trackLength, 0, 1));
      this._circulo(ctx, pos[0], pos[1], h * 0.0048);
      ctx.fill();
    }

    // Lider da corrida: ponto vermelho.
    const lider = pointAt(limitar(leaderPos / trackLength, 0, 1));
    const lx = lider[0], ly = lider[1];
    if (!leaderIsPlayer) {
      ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0x3C, 0x3C));
      this._circulo(ctx, lx, ly, h * 0.0074);
      ctx.fill();
      ctx.lineWidth = h * 0.0022;
      ctx.strokeStyle = Cor.css(Cor.argb(220, 255, 255, 255));
      this._circulo(ctx, lx, ly, h * 0.0094);
      ctx.stroke();
    }

    // Jogador: ponto azul.
    const jog = pointAt(limitar(playerPos / trackLength, 0, 1));
    const px = jog[0], py = jog[1];
    ctx.fillStyle = Cor.css(Cor.rgb(0x3B, 0x9D, 0xFF));
    this._circulo(ctx, px, py, h * 0.0072);
    ctx.fill();
    ctx.lineWidth = h * 0.0022;
    ctx.strokeStyle = Cor.css(Cor.WHITE);
    this._circulo(ctx, px, py, h * 0.0092);
    ctx.stroke();

    // Se o proprio jogador estiver em primeiro, mostra tambem um anel vermelho por fora.
    if (leaderIsPlayer) {
      ctx.lineWidth = h * 0.0026;
      ctx.strokeStyle = Cor.css(Cor.rgb(0xFF, 0x3C, 0x3C));
      this._circulo(ctx, px, py, h * 0.0118);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.0125);
    ctx.fillStyle = Cor.css(this.white);
    ctx.fillText("MAPA", Ret.centroX(panel), panel.top + h * 0.020);
    this._setTextSize(ctx, h * 0.0105);
    ctx.fillStyle = Cor.css(Cor.rgb(0xB8, 0xC8, 0xE0));
    ctx.fillText(stage.name.substring(0, 18).toUpperCase(), Ret.centroX(panel), panel.top + h * 0.036);
    this._setBold(ctx, false);
  }

  drawStatBox(ctx, x, y, bw, bh, label, value, valueColor) {
    const h = this.h;
    Ret.definir(this.rect, x, y, x + bw, y + bh);
    ctx.fillStyle = Cor.css(this.panelBg);
    retanguloArredondado(ctx, this.rect, bh * 0.32);
    ctx.fill();
    ctx.lineWidth = h * 0.003;
    ctx.strokeStyle = Cor.css(Cor.argb(160, 77, 200, 255));
    retanguloArredondado(ctx, this.rect, bh * 0.32);
    ctx.stroke();

    ctx.textAlign = "left";
    this._setBold(ctx, false);
    this._setTextSize(ctx, h * 0.014);
    ctx.fillStyle = Cor.css(Cor.rgb(0xA8, 0xB2, 0xC8));
    ctx.fillText(label, x + bh * 0.24, y + bh * 0.30);

    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.021);
    ctx.fillStyle = Cor.css(valueColor);
    ctx.fillText(value, x + bh * 0.24, y + bh * 0.69);
    this._setBold(ctx, false);
  }

  /** Lista de jogadores/IA em tempo real. Atualiza conforme as posicoes mudam. */
  drawPlayerList(ctx, standings) {
    const w = this.w, h = this.h;
    if (standings.length === 0) return;

    const maxItems = 5;
    const panelX = w * 0.802;
    const panelY = h * 0.340;
    const panelW = w * 0.180;
    const rowH = h * 0.024;
    const headerH = h * 0.032;
    const panelH = headerH + rowH * maxItems + h * 0.012;

    Ret.definir(this.rect, panelX, panelY, panelX + panelW, panelY + panelH);
    ctx.fillStyle = Cor.css(Cor.argb(185, 0x05, 0x03, 0x12));
    retanguloArredondado(ctx, this.rect, h * 0.014);
    ctx.fill();

    ctx.lineWidth = h * 0.0028;
    ctx.strokeStyle = Cor.css(Cor.argb(190, 0x00, 0xF5, 0xD4));
    retanguloArredondado(ctx, this.rect, h * 0.014);
    ctx.stroke();

    ctx.textAlign = "left";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.016);
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xE0, 0x40));
    ctx.fillText("POSIÇÃO", panelX + h * 0.011, panelY + h * 0.024);

    const shown = standings.slice(0, maxItems);
    let y = panelY + headerH + h * 0.010;

    for (let i = 0; i < shown.length; i++) {
      const item = shown[i];
      const isHighlight = item.isLocalPlayer || item.isRemotePlayer;
      if (isHighlight) {
        ctx.fillStyle = Cor.css(item.isLocalPlayer
          ? Cor.argb(95, 0x00, 0xF5, 0xD4)
          : Cor.argb(80, 0xF5, 0x00, 0x90));
        Ret.definir(this.rect, panelX + h * 0.007, y - rowH * 0.70, panelX + panelW - h * 0.007, y + rowH * 0.18);
        retanguloArredondado(ctx, this.rect, h * 0.008);
        ctx.fill();
      }

      ctx.textAlign = "left";
      this._setBold(ctx, item.isLocalPlayer);
      this._setTextSize(ctx, h * 0.0145);
      ctx.fillStyle = Cor.css(item.isLocalPlayer
        ? Cor.WHITE
        : (item.isRemotePlayer ? Cor.rgb(0xFF, 0xA8, 0xE6) : Cor.rgb(0xC8, 0xD2, 0xEA)));

      const cleanName = item.name.substring(0, 8);
      ctx.fillText(item.position + "º", panelX + h * 0.014, y);
      ctx.fillText(cleanName, panelX + h * 0.046, y);

      if (item.isLocalPlayer) {
        ctx.textAlign = "right";
        this._setTextSize(ctx, h * 0.012);
        ctx.fillStyle = Cor.css(this.cyan);
        ctx.fillText("VOCÊ", panelX + panelW - h * 0.012, y);
      } else if (item.isRemotePlayer) {
        ctx.textAlign = "right";
        this._setTextSize(ctx, h * 0.012);
        ctx.fillStyle = Cor.css(this.magenta);
        ctx.fillText("P2", panelX + panelW - h * 0.012, y);
      }

      y += rowH;
    }

    this._setBold(ctx, false);
  }

  drawSelectedRaceUpgrade(ctx, label, enabled) {
    // Mantido apenas para compatibilidade. O item da corrida agora aparece
    // somente nas duas bolinhas do controle: uma para trocar e outra para usar.
  }

  drawPlayerSpeech(ctx, message, timer) {
    const w = this.w, h = this.h;
    if (!message || message.trim().length === 0 || timer <= 0) return;
    const p = limitar(timer / 2.0, 0, 1);
    const alpha = limitar(Math.trunc(235 * p), 0, 235);
    const boxW = Math.max(h * 0.42, w * 0.28);
    const boxH = h * 0.070;
    const cx = w * 0.50;
    const bottom = h * 0.735;
    Ret.definir(this.rect, cx - boxW * 0.5, bottom - boxH, cx + boxW * 0.5, bottom);

    ctx.fillStyle = Cor.css(Cor.argb(alpha, 255, 255, 255));
    retanguloArredondado(ctx, this.rect, h * 0.022);
    ctx.fill();
    ctx.lineWidth = h * 0.0026;
    ctx.strokeStyle = Cor.css(Cor.argb(alpha, 0x00, 0xF5, 0xFF));
    retanguloArredondado(ctx, this.rect, h * 0.022);
    ctx.stroke();
    // Rabinho do balao apontando para o carro.
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.018, bottom - h * 0.002);
    ctx.lineTo(cx + h * 0.018, bottom - h * 0.002);
    ctx.lineTo(cx, bottom + h * 0.030);
    ctx.closePath();
    ctx.fillStyle = Cor.css(Cor.argb(alpha, 255, 255, 255));
    ctx.fill();

    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.027);
    ctx.fillStyle = Cor.css(Cor.argb(alpha, 0x10, 0x14, 0x1F));
    ctx.fillText(message.substring(0, 26), cx, Ret.centroY(this.rect) + h * 0.010);
    this._setBold(ctx, false);
  }

  /** Aviso grande no centro da tela ao ultrapassar: exibe a posicao atual por 0,5s. */
  drawPositionFlash(ctx, label, progress) {
    const w = this.w, h = this.h;
    if (!label || label.trim().length === 0 || progress <= 0) return;

    const p = limitar(progress, 0, 1);
    const alpha = limitar(Math.trunc(255 * p), 0, 255);
    const scale = 0.86 + (1 - p) * 0.18;
    const centerY = h * 0.39;

    ctx.textAlign = "center";
    this._setBold(ctx, true);

    // sombra forte
    this._setTextSize(ctx, h * 0.118 * scale);
    ctx.fillStyle = Cor.css(Cor.argb(limitar(Math.trunc(180 * p), 0, 180), 0, 0, 0));
    ctx.fillText(label, w / 2 + h * 0.010, centerY + h * 0.012);

    // brilho externo
    this._setTextSize(ctx, h * 0.124 * scale);
    ctx.fillStyle = Cor.css(Cor.argb(limitar(Math.trunc(110 * p), 0, 110), 0x00, 0xF5, 0xD4));
    ctx.fillText(label, w / 2, centerY);

    // texto principal
    this._setTextSize(ctx, h * 0.112 * scale);
    ctx.fillStyle = Cor.css(Cor.argb(alpha, 0xFF, 0xE0, 0x40));
    ctx.fillText(label, w / 2, centerY);

    this._setTextSize(ctx, h * 0.034 * scale);
    ctx.fillStyle = Cor.css(Cor.argb(alpha, 255, 255, 255));
    let subtitle;
    if (label.indexOf("ÚLTIMA") >= 0) subtitle = "FINAL DA CORRIDA";
    else if (label.indexOf("VOLTA") === 0) subtitle = "NOVA VOLTA";
    else if (label.indexOf("PIT") >= 0) subtitle = "UPGRADE ESPECIAL";
    else if (label.indexOf("TURBO") >= 0) subtitle = "ENERGIA CHEIA";
    else subtitle = "POSIÇÃO ATUAL";
    ctx.fillText(subtitle, w / 2, centerY + h * 0.065);

    this._setBold(ctx, false);
  }

  drawTurboBar(ctx, player) {
    const w = this.w, h = this.h;
    // V59: turbo em quadrinhos, no mesmo estilo do tanque.
    const barX = w * 0.020;
    const barY = h * 0.170;
    const barW = w * 0.315;
    const barH = h * 0.047;
    const segments = 10;
    const filled = limitar(Math.trunc(Math.ceil(limitar(player.turboBar, 0, 1) * segments)), 0, segments);

    ctx.fillStyle = Cor.css(Cor.argb(0xD8, 0x04, 0x04, 0x12));
    Ret.definir(this.rect, barX, barY - h * 0.026, barX + barW, barY + barH + h * 0.015);
    retanguloArredondado(ctx, this.rect, h * 0.014);
    ctx.fill();
    ctx.lineWidth = h * 0.0026;
    ctx.strokeStyle = Cor.css(player.turboActive ? Cor.rgb(0xFF, 0xE0, 0x40) : this.cyan);
    retanguloArredondado(ctx, this.rect, h * 0.014);
    ctx.stroke();

    this._setBold(ctx, true);
    ctx.textAlign = "left";
    this._setTextSize(ctx, h * 0.0145);
    ctx.fillStyle = Cor.css(this.white);
    ctx.fillText("TURBO", barX + w * 0.006, barY - h * 0.006);

    ctx.textAlign = "right";
    this._setTextSize(ctx, h * 0.0145);
    ctx.fillStyle = Cor.css(player.turboActive ? Cor.rgb(0xFF, 0xE0, 0x40) : Cor.rgb(0xC8, 0xD4, 0xE8));
    ctx.fillText(player.turboActive ? "ATIVO" : (Math.trunc(player.turboBar * 100) + "%"), barX + barW - w * 0.006, barY - h * 0.006);

    const gap = barW * 0.012;
    const segW = (barW - gap * (segments + 1)) / segments;
    const segH = h * 0.020;
    let x = barX + gap;
    for (let i = 0; i < segments; i++) {
      Ret.definir(this.rect, x, barY + h * 0.006, x + segW, barY + h * 0.006 + segH);
      let color;
      if (i >= filled) color = Cor.argb(100, 0x25, 0x28, 0x36);
      else if (player.turboActive) color = Cor.rgb(0x4D, 0xC8, 0xFF);
      else if (filled <= 3) color = Cor.rgb(0xFF, 0x6B, 0x3A);
      else if (i >= 7) color = Cor.rgb(0xFF, 0xE0, 0x40);
      else color = this.cyan;
      ctx.fillStyle = Cor.css(color);
      retanguloArredondado(ctx, this.rect, h * 0.004);
      ctx.fill();
      if (i < filled) {
        ctx.fillStyle = Cor.css(Cor.argb(58, 255, 255, 255));
        Ret.definir(this.tmp, this.rect.left, this.rect.top, this.rect.right, Ret.centroY(this.rect));
        retanguloArredondado(ctx, this.tmp, h * 0.003);
        ctx.fill();
      }
      x += segW + gap;
    }
    this._setBold(ctx, false);
  }

  drawFuelBar(ctx, state, player) {
    const w = this.w, h = this.h;
    const barX = w * 0.770;
    const barY = h * 0.240;
    const barW = w * 0.212;
    const barH = h * 0.050;
    const maxLiters = player.maxFuelLiters();
    const liters = limitar(Math.trunc(limitar(state.fuel, 0, 1) * maxLiters), 0, Math.trunc(maxLiters));
    const lowFuelThreshold = Math.max(20, Math.round(maxLiters * 0.33));
    const lowFuel = liters <= lowFuelThreshold;

    ctx.fillStyle = Cor.css(Cor.argb(0xD8, 0x04, 0x04, 0x0A));
    Ret.definir(this.rect, barX, barY - h * 0.026, barX + barW, barY + barH + h * 0.018);
    retanguloArredondado(ctx, this.rect, h * 0.014);
    ctx.fill();
    ctx.lineWidth = h * 0.0024;
    ctx.strokeStyle = Cor.css(lowFuel ? Cor.rgb(0xFF, 0x65, 0x45) : Cor.rgb(0xC9, 0xD2, 0xE2));
    retanguloArredondado(ctx, this.rect, h * 0.014);
    ctx.stroke();

    this._setBold(ctx, true);
    ctx.textAlign = "left";
    this._setTextSize(ctx, h * 0.0145);
    ctx.fillStyle = Cor.css(this.white);
    ctx.fillText("TANQUE", barX + w * 0.006, barY - h * 0.006);

    ctx.textAlign = "right";
    this._setTextSize(ctx, h * 0.021);
    let corLitros;
    if (liters <= lowFuelThreshold) corLitros = Cor.rgb(0xFF, 0x4A, 0x36);
    else if (liters <= Math.round(maxLiters * 0.55)) corLitros = Cor.rgb(0xFF, 0xC1, 0x07);
    else corLitros = Cor.rgb(0x7C, 0xFF, 0x6B);
    ctx.fillStyle = Cor.css(corLitros);
    ctx.fillText(liters + "L", barX + barW - w * 0.006, barY - h * 0.006);

    const segments = 12;
    const gap = barW * 0.010;
    const segW = (barW - gap * (segments + 1)) / segments;
    const segH = h * 0.020;
    const filled = limitar(Math.trunc(Math.ceil(limitar(state.fuel, 0, 1) * segments)), 0, segments);
    let activeColor;
    if (liters <= lowFuelThreshold) activeColor = Cor.rgb(0xFF, 0x3B, 0x30);
    else if (liters <= Math.round(maxLiters * 0.55)) activeColor = Cor.rgb(0xFF, 0xC1, 0x07);
    else activeColor = Cor.rgb(0x7C, 0xFF, 0x6B);
    let x = barX + gap;
    for (let i = 0; i < segments; i++) {
      Ret.definir(this.rect, x, barY + h * 0.006, x + segW, barY + h * 0.006 + segH);
      ctx.fillStyle = Cor.css(i < filled ? activeColor : Cor.argb(100, 0x25, 0x28, 0x32));
      retanguloArredondado(ctx, this.rect, h * 0.004);
      ctx.fill();
      if (i < filled) {
        ctx.fillStyle = Cor.css(Cor.argb(52, 255, 255, 255));
        Ret.definir(this.tmp, this.rect.left, this.rect.top, this.rect.right, Ret.centroY(this.rect));
        retanguloArredondado(ctx, this.tmp, h * 0.003);
        ctx.fill();
      }
      x += segW + gap;
    }

    if (lowFuel) {
      ctx.textAlign = "center";
      this._setTextSize(ctx, h * 0.014);
      ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xD2, 0x42));
      ctx.fillText("COMBUSTÍVEL BAIXO", barX + barW * 0.5, barY + barH + h * 0.007);
    } else {
      ctx.textAlign = "center";
      this._setTextSize(ctx, h * 0.013);
      ctx.fillStyle = Cor.css(Cor.rgb(0x90, 0x9A, 0xAA));
      ctx.fillText("MAX " + Math.trunc(maxLiters) + "L", barX + barW * 0.5, barY + barH + h * 0.007);
    }
    this._setBold(ctx, false);
  }

  drawRetroSpeedMeter(ctx, player, speedBox) {
    const w = this.w, h = this.h;
    ctx.fillStyle = Cor.css(Cor.argb(0xE6, 0x04, 0x04, 0x0A));
    retanguloArredondado(ctx, speedBox, h * 0.018);
    ctx.fill();
    ctx.lineWidth = h * 0.0038;
    ctx.strokeStyle = Cor.css(Cor.rgb(0xC9, 0xD2, 0xE2));
    retanguloArredondado(ctx, speedBox, h * 0.018);
    ctx.stroke();

    const meter = Ret.novo(
      speedBox.left + w * 0.010,
      speedBox.top + h * 0.010,
      speedBox.right - w * 0.012,
      speedBox.top + h * 0.029
    );
    ctx.fillStyle = Cor.css(Cor.argb(220, 0x10, 0x11, 0x18));
    retanguloArredondado(ctx, meter, h * 0.008);
    ctx.fill();
    ctx.lineWidth = h * 0.0024;
    ctx.strokeStyle = Cor.css(Cor.rgb(0x55, 0x60, 0x74));
    retanguloArredondado(ctx, meter, h * 0.008);
    ctx.stroke();

    const maxKmh = player.maxDisplayKmh();
    const cruiseKmh = player.cruiseDisplayKmh();
    let extraSegments;
    if (maxKmh <= cruiseKmh) extraSegments = 0;
    else if (maxKmh <= 400) extraSegments = 4;
    else extraSegments = 8;
    const totalSegments = 28;
    const normalSegments = Math.max(8, totalSegments - extraSegments);
    const gap = Ret.largura(meter) * 0.0045;
    const segW = (Ret.largura(meter) - gap * (totalSegments + 1)) / totalSegments;

    const kmh = player.speedKmh();
    const normalFill = limitar(Math.trunc(Math.min(kmh, cruiseKmh) / cruiseKmh * normalSegments), 0, normalSegments);
    const extraFill = (maxKmh > cruiseKmh)
      ? limitar(Math.trunc(Math.max(0, kmh - cruiseKmh) / (maxKmh - cruiseKmh) * extraSegments), 0, extraSegments)
      : 0;

    let x = meter.left + gap;
    for (let i = 0; i < totalSegments; i++) {
      const seg = Ret.novo(x, meter.top + gap, x + segW, meter.bottom - gap);
      const isExtra = i >= normalSegments;
      const normalIndex = Math.min(i, normalSegments - 1);
      const t = (normalSegments > 1) ? normalIndex / (normalSegments - 1) : 1;
      const active = isExtra ? ((i - normalSegments) < extraFill) : (i < normalFill);
      let color;
      if (isExtra && active) color = Cor.rgb(0xFF, 0x34, 0x22);
      else if (isExtra) color = Cor.argb(82, 0x53, 0x10, 0x10);
      else if (t < 0.40) color = active ? Cor.rgb(0x79, 0xEE, 0x3D) : Cor.argb(92, 0x22, 0x3B, 0x18);
      else if (t < 0.67) color = active ? Cor.rgb(0xD8, 0xF2, 0x32) : Cor.argb(92, 0x3A, 0x41, 0x16);
      else if (t < 0.86) color = active ? Cor.rgb(0xFF, 0xA6, 0x1E) : Cor.argb(92, 0x4D, 0x2B, 0x10);
      else color = active ? Cor.rgb(0xFF, 0x3A, 0x28) : Cor.argb(92, 0x4A, 0x11, 0x10);
      ctx.fillStyle = Cor.css(color);
      retanguloArredondado(ctx, seg, h * 0.0032);
      ctx.fill();
      if (active && (isExtra || i >= normalSegments - 3)) {
        ctx.fillStyle = Cor.css(Cor.argb(56, 255, 255, 255));
        Ret.definir(this.tmp, seg.left, seg.top, seg.right, Ret.centroY(seg));
        retanguloArredondado(ctx, this.tmp, h * 0.0025);
        ctx.fill();
      }
      x += segW + gap;
    }

    const digitsLeft = speedBox.left + w * 0.016;
    const digitsRight = speedBox.right - w * 0.016;
    this._setBold(ctx, true);
    ctx.textAlign = "left";
    this._setTextSize(ctx, h * 0.017);
    ctx.fillStyle = Cor.css(Cor.rgb(0xCF, 0xD8, 0xE8));
    ctx.fillText("SPEED", digitsLeft, speedBox.top + h * 0.052);
    if (maxKmh > cruiseKmh) {
      this._setTextSize(ctx, h * 0.013);
      ctx.fillStyle = Cor.css(kmh > cruiseKmh ? Cor.rgb(0xFF, 0xB0, 0x42) : Cor.rgb(0x7C, 0x86, 0x98));
      ctx.fillText(kmh > cruiseKmh ? "OVERDRIVE" : "OVER", digitsLeft, speedBox.top + h * 0.070);
    }

    // Os digitos grandes usam a fonte de largura fixa para nao tremerem.
    ctx.textAlign = "right";
    this._setFamily(ctx, FONTE_NUMEROS);
    this._setTextSize(ctx, h * 0.074);
    ctx.fillStyle = Cor.css(Cor.argb(140, 0, 0, 0));
    ctx.fillText("" + kmh, digitsRight + h * 0.004, speedBox.top + h * 0.124 + h * 0.004);
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0x2D, 0x2D));
    ctx.fillText("" + kmh, digitsRight, speedBox.top + h * 0.124);
    this._setFamily(ctx, FONTE);

    this._setTextSize(ctx, h * 0.019);
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xE0, 0x40));
    ctx.fillText("km/h", digitsRight, speedBox.bottom - h * 0.014);

    // Marcha atual: R, 1, 2, 3, 4 e desbloqueia ate 8 pelo upgrade de motor.
    const gearBox = Ret.novo(speedBox.left + w * 0.012, speedBox.bottom - h * 0.054, speedBox.left + w * 0.072, speedBox.bottom - h * 0.010);
    ctx.fillStyle = Cor.css(Cor.argb(205, 0x08, 0x0A, 0x18));
    retanguloArredondado(ctx, gearBox, h * 0.012);
    ctx.fill();
    ctx.lineWidth = h * 0.0024;
    ctx.strokeStyle = Cor.css(Cor.rgb(0x00, 0xF5, 0xD4));
    retanguloArredondado(ctx, gearBox, h * 0.012);
    ctx.stroke();
    ctx.textAlign = "center";
    this._setTextSize(ctx, h * 0.012);
    ctx.fillStyle = Cor.css(Cor.rgb(0xA8, 0xB5, 0xC8));
    ctx.fillText("MARCHA", Ret.centroX(gearBox), gearBox.top + h * 0.014);
    this._setBold(ctx, true);
    this._setFamily(ctx, FONTE_NUMEROS);
    this._setTextSize(ctx, h * 0.026);
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(player.gearLabel(), Ret.centroX(gearBox), gearBox.bottom - h * 0.008);
    this._setFamily(ctx, FONTE);

    const markerY = meter.bottom + h * 0.016;
    this._setTextSize(ctx, h * 0.013);
    ctx.fillStyle = Cor.css(Cor.rgb(0x95, 0xA2, 0xB6));
    ctx.textAlign = "left";
    ctx.fillText("0", meter.left, markerY + h * 0.010);
    ctx.textAlign = "center";
    ctx.fillText("" + Math.trunc(cruiseKmh / 2), meter.left + Ret.largura(meter) * 0.42, markerY + h * 0.010);
    ctx.textAlign = "center";
    ctx.fillText("" + cruiseKmh, meter.left + Ret.largura(meter) * (normalSegments / totalSegments), markerY + h * 0.010);
    if (maxKmh > cruiseKmh) {
      ctx.textAlign = "right";
      ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0x88, 0x76));
      ctx.fillText("" + maxKmh, meter.right, markerY + h * 0.010);
    }
    this._setBold(ctx, false);
  }

  drawPitNotice(ctx, state) {
    const w = this.w, h = this.h;
    if (!state.inPitStop && !state.pitSignal && state.fuel > (20 / 60)) return;
    let label;
    if (state.inPitStop) label = "PITSTOP  •  REABASTECENDO";
    else if (state.pitSignal) label = "PITSTOP À DIREITA";
    else if (state.fuel <= 0.02) label = "SEM COMBUSTÍVEL — PROCURE O PITSTOP";
    else if (state.fuel <= (20 / 60)) label = "COMBUSTÍVEL BAIXO — 20L";
    else label = "COMBUSTÍVEL BAIXO";
    const bg = state.inPitStop ? Cor.argb(0xCC, 0x08, 0x5A, 0x3A) : Cor.argb(0xCC, 0x6A, 0x12, 0x2A);
    const bw = w * 0.42;
    const bh = h * 0.052;
    Ret.definir(this.rect, w / 2 - bw / 2, h * 0.245, w / 2 + bw / 2, h * 0.245 + bh);
    ctx.fillStyle = Cor.css(bg);
    retanguloArredondado(ctx, this.rect, bh * 0.30);
    ctx.fill();
    ctx.lineWidth = h * 0.004;
    ctx.strokeStyle = Cor.css(state.inPitStop ? Cor.rgb(0x7C, 0xFF, 0x6B) : Cor.rgb(0xFF, 0xC1, 0x07));
    retanguloArredondado(ctx, this.rect, bh * 0.30);
    ctx.stroke();

    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.024);
    ctx.fillStyle = Cor.css(this.white);
    ctx.fillText(label, w / 2, Ret.centroY(this.rect) + this.textSize * 0.35);
    this._setBold(ctx, false);
  }

  drawHeadlightButton(ctx, headlightsOn, darkStage) {
    const h = this.h;
    ctx.fillStyle = Cor.css(headlightsOn
      ? Cor.argb(0xCC, 0x8A, 0x5A, 0x08)
      : Cor.argb(0xAA, 0x18, 0x18, 0x26));
    retanguloArredondado(ctx, this.headlightBtn, h * 0.012);
    ctx.fill();

    ctx.lineWidth = h * 0.0035;
    ctx.strokeStyle = Cor.css(headlightsOn ? Cor.rgb(0xFF, 0xE0, 0x40) : Cor.rgb(0x8A, 0x8F, 0xA6));
    retanguloArredondado(ctx, this.headlightBtn, h * 0.012);
    ctx.stroke();

    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.0145);
    ctx.fillStyle = Cor.css(headlightsOn ? Cor.WHITE : Cor.rgb(0xC8, 0xD0, 0xE8));
    ctx.fillText(headlightsOn ? "FAROL" : "LUZ", Ret.centroX(this.headlightBtn), Ret.centroY(this.headlightBtn) - h * 0.001);
    this._setTextSize(ctx, h * 0.0115);
    ctx.fillText(headlightsOn ? "ON" : "OFF", Ret.centroX(this.headlightBtn), Ret.centroY(this.headlightBtn) + h * 0.017);

    if (darkStage && headlightsOn) {
      ctx.fillStyle = Cor.css(Cor.argb(120, 0xFF, 0xE0, 0x40));
      this._circulo(ctx, this.headlightBtn.left + h * 0.018, Ret.centroY(this.headlightBtn), h * 0.010);
      ctx.fill();
    }
    this._setBold(ctx, false);
  }

  drawPauseButton(ctx) {
    const h = this.h;
    ctx.fillStyle = Cor.css(Cor.argb(0xAA, 0x10, 0x0C, 0x26));
    retanguloArredondado(ctx, this.pauseBtn, h * 0.02);
    ctx.fill();
    ctx.fillStyle = Cor.css(this.white);
    const cx = Ret.centroX(this.pauseBtn); const cy = Ret.centroY(this.pauseBtn);
    const bw = Ret.largura(this.pauseBtn) * 0.12;
    const bh = Ret.altura(this.pauseBtn) * 0.42;
    ctx.fillRect(cx - bw * 2, cy - bh, bw * 1.5, bh * 2);
    ctx.fillRect(cx + bw * 0.5, cy - bh, bw * 1.5, bh * 2);
  }

  drawTouchClickIndicators(ctx, controls) {
    const w = this.w, h = this.h;
    if (controls === null || controls === undefined || this.controlType === SaveManager.CONTROL_BUTTONS) return;

    // V78: a area de toque e a tela toda dos lados; esta caixa verde e apenas indicacao visual.
    // Ela fica menor na vertical para nao parecer um botao gigante.
    const sideGlowW = w * 0.15;
    const topY = h * 0.56;
    const bottomY = h * 0.82;

    if (controls.left) {
      ctx.fillStyle = Cor.css(Cor.argb(58, 0x00, 0xF5, 0x70));
      Ret.definir(this.rect, 0, topY, sideGlowW, bottomY);
      retanguloArredondado(ctx, this.rect, h * 0.026);
      ctx.fill();
      ctx.lineWidth = h * 0.004;
      ctx.strokeStyle = Cor.css(Cor.argb(145, 0x00, 0xF5, 0x70));
      retanguloArredondado(ctx, this.rect, h * 0.026);
      ctx.stroke();

      if (this.leftArrowBitmap !== null) {
        const iconW = sideGlowW * 0.46;
        const iconH = (bottomY - topY) * 0.46;
        Ret.definir(this.rect,
          sideGlowW * 0.48 - iconW * 0.5,
          (topY + bottomY) * 0.5 - iconH * 0.5,
          sideGlowW * 0.48 + iconW * 0.5,
          (topY + bottomY) * 0.5 + iconH * 0.5
        );
        this._desenharImagem(ctx, this.leftArrowBitmap, this.rect, null);
      } else {
        ctx.textAlign = "center";
        this._setBold(ctx, true);
        this._setTextSize(ctx, h * 0.055);
        ctx.fillStyle = Cor.css(Cor.argb(220, 255, 255, 255));
        ctx.fillText("◀", sideGlowW * 0.48, (topY + bottomY) * 0.5 + this.textSize * 0.35);
        this._setBold(ctx, false);
      }
    }

    if (controls.right) {
      ctx.fillStyle = Cor.css(Cor.argb(58, 0x00, 0xF5, 0x70));
      Ret.definir(this.rect, w - sideGlowW, topY, w, bottomY);
      retanguloArredondado(ctx, this.rect, h * 0.026);
      ctx.fill();
      ctx.lineWidth = h * 0.004;
      ctx.strokeStyle = Cor.css(Cor.argb(145, 0x00, 0xF5, 0x70));
      retanguloArredondado(ctx, this.rect, h * 0.026);
      ctx.stroke();

      if (this.rightArrowBitmap !== null) {
        const iconW = sideGlowW * 0.46;
        const iconH = (bottomY - topY) * 0.46;
        Ret.definir(this.rect,
          w - sideGlowW * 0.48 - iconW * 0.5,
          (topY + bottomY) * 0.5 - iconH * 0.5,
          w - sideGlowW * 0.48 + iconW * 0.5,
          (topY + bottomY) * 0.5 + iconH * 0.5
        );
        this._desenharImagem(ctx, this.rightArrowBitmap, this.rect, null);
      } else {
        ctx.textAlign = "center";
        this._setBold(ctx, true);
        this._setTextSize(ctx, h * 0.055);
        ctx.fillStyle = Cor.css(Cor.argb(220, 255, 255, 255));
        ctx.fillText("▶", w - sideGlowW * 0.48, (topY + bottomY) * 0.5 + this.textSize * 0.35);
        this._setBold(ctx, false);
      }
    }
  }

  drawControlZonesBackground(ctx) {
    const h = this.h;
    if (this.controlType === SaveManager.CONTROL_BUTTONS) {
      // Base esquerda para setas + freio.
      Ret.definir(this.rect,
        this.leftBtn.left - h * 0.018,
        this.brakeBtn.top - h * 0.016,
        Math.max(Math.max(this.rightBtn.right, this.pitBoostBtn.right), this.freezeRivalsBtn.right) + h * 0.018,
        this.leftBtn.bottom + h * 0.016
      );
      ctx.fillStyle = Cor.css(Cor.argb(70, 0x02, 0x04, 0x10));
      retanguloArredondado(ctx, this.rect, h * 0.032);
      ctx.fill();
      ctx.lineWidth = h * 0.0022;
      ctx.strokeStyle = Cor.css(Cor.argb(90, 255, 255, 255));
      retanguloArredondado(ctx, this.rect, h * 0.032);
      ctx.stroke();

      // Base direita para farol + turbo + acelerador.
      Ret.definir(this.rect,
        Math.min(this.headlightBtn.left, this.turboBtn.left) - h * 0.018,
        this.turboBtn.top - h * 0.016,
        this.accelBtn.right + h * 0.018,
        this.accelBtn.bottom + h * 0.016
      );
      ctx.fillStyle = Cor.css(Cor.argb(70, 0x02, 0x04, 0x10));
      retanguloArredondado(ctx, this.rect, h * 0.032);
      ctx.fill();
      ctx.lineWidth = h * 0.0022;
      ctx.strokeStyle = Cor.css(Cor.argb(90, 255, 255, 255));
      retanguloArredondado(ctx, this.rect, h * 0.032);
      ctx.stroke();
    }
  }

  drawControlButtons(ctx, player, controls, pitBoostAvailable, freezeRivalsAvailable, ghostModeAvailable, selectedRaceUpgradeLabel, selectedRaceUpgradeAvailable) {
    if (pitBoostAvailable === undefined) pitBoostAvailable = false;
    if (freezeRivalsAvailable === undefined) freezeRivalsAvailable = false;
    if (ghostModeAvailable === undefined) ghostModeAvailable = false;
    if (selectedRaceUpgradeLabel === undefined) selectedRaceUpgradeLabel = "";
    if (selectedRaceUpgradeAvailable === undefined) selectedRaceUpgradeAvailable = false;

    this.drawControlZonesBackground(ctx);

    const turboPercent = limitar(Math.trunc(player.turboBar * 100), 0, 100);
    const turboSub = player.turboActive ? (Math.trunc(Math.ceil(player.turboTimer)) + "s") : (turboPercent + "%");
    let turboBg;
    if (player.turboActive) turboBg = Cor.argb(0xD6, 0x00, 0x92, 0xC8);
    else if (player.turboBar <= 0.10) turboBg = Cor.argb(0xAA, 0x5A, 0x22, 0x18);
    else turboBg = Cor.argb(0xAA, 0x0E, 0x5A, 0x7A);
    let turboBorder;
    if (player.turboActive) turboBorder = Cor.rgb(0xFF, 0xE0, 0x40);
    else if (player.turboBar <= 0.10) turboBorder = Cor.rgb(0xFF, 0x8A, 0x4A);
    else turboBorder = this.cyan;

    const turboPressed = player.turboActive || (controls !== null && controls !== undefined && controls.turbo === true);
    const brakePressed = (controls !== null && controls !== undefined && controls.brake === true);
    const accelPressed = (controls !== null && controls !== undefined && controls.accelerate === true) && this.controlType === SaveManager.CONTROL_BUTTONS;
    const leftPressed = (controls !== null && controls !== undefined && controls.left === true);
    const rightPressed = (controls !== null && controls !== undefined && controls.right === true);

    if (this.controlType === SaveManager.CONTROL_BUTTONS) {
      this.drawArrowPad(ctx, this.leftBtn, this.leftArrowBitmap, leftPressed);
      this.drawArrowPad(ctx, this.rightBtn, this.rightArrowBitmap, rightPressed);
      this.drawBrakeButton(ctx, this.brakeBtn, brakePressed);
      this.drawRaceItemButtons(ctx, selectedRaceUpgradeLabel, selectedRaceUpgradeAvailable);
      this.drawRoundButton(ctx, this.turboBtn, turboBg, turboBorder, "TURBO", turboSub, turboPressed);
      this.drawAccelButton(ctx, this.accelBtn, accelPressed);
    } else {
      this.drawRoundButton(ctx, this.turboBtn, turboBg, turboBorder, "TURBO", turboSub, turboPressed);
      this.drawBrakeButton(ctx, this.brakeBtn, brakePressed);
      this.drawRaceItemButtons(ctx, selectedRaceUpgradeLabel, selectedRaceUpgradeAvailable);
    }
  }

  drawRaceItemButtons(ctx, selectedLabel, available) {
    if (!available) return;
    const label = this.compactRaceItemLabel(selectedLabel);
    const bg = this.raceItemBgColor(selectedLabel);
    const border = this.raceItemBorderColor(selectedLabel);
    this.drawRoundButton(ctx, this.pitBoostBtn, bg, border, label, "ITEM", false);
    this.drawRoundButton(ctx, this.freezeRivalsBtn, Cor.argb(0xCC, 0x28, 0x12, 0x60), Cor.rgb(0xFF, 0xD2, 0x4D), "USAR", "OK", false);
  }

  compactRaceItemLabel(label) {
    switch (label.toUpperCase()) {
      case "FANTASMA": return "FANT";
      case "BOMBA": return "BOMBA";
      case "SEM ITEM": return "---";
      default: return label.toUpperCase().substring(0, 5);
    }
  }

  raceItemBgColor(label) {
    switch (label.toUpperCase()) {
      case "GAS+": return Cor.argb(0xCC, 0x00, 0x66, 0x88);
      case "GELO": return Cor.argb(0xCC, 0x22, 0x44, 0x88);
      case "FANTASMA": return Cor.argb(0xCC, 0x70, 0x20, 0xA8);
      case "BOMBA": return Cor.argb(0xCC, 0xA8, 0x20, 0x20);
      default: return Cor.argb(0xCC, 0x18, 0x18, 0x36);
    }
  }

  raceItemBorderColor(label) {
    switch (label.toUpperCase()) {
      case "GAS+": return this.cyan;
      case "GELO": return Cor.rgb(0x9A, 0xD6, 0xFF);
      case "FANTASMA": return Cor.rgb(0xE7, 0xB8, 0xFF);
      case "BOMBA": return Cor.rgb(0xFF, 0xD2, 0x4D);
      default: return Cor.argb(180, 255, 255, 255);
    }
  }

  brightenColor(color, factor) {
    const a = Cor.alpha(color);
    const rr = limitar(Math.trunc(Cor.red(color) * factor), 0, 255);
    const gg = limitar(Math.trunc(Cor.green(color) * factor), 0, 255);
    const bb = limitar(Math.trunc(Cor.blue(color) * factor), 0, 255);
    return Cor.argb(a, rr, gg, bb);
  }

  drawRoundButton(ctx, r, bg, border, label, subLabel, active) {
    const h = this.h;
    if (subLabel === undefined) subLabel = null;
    if (active === undefined) active = false;
    if (Ret.vazio(r)) return;

    // sombra
    ctx.fillStyle = Cor.css(Cor.argb(active ? 150 : 90, 0, 0, 0));
    Ret.definir(this.rect, r.left + h * 0.006, r.top + h * 0.010, r.right + h * 0.006, r.bottom + h * 0.010);
    this._oval(ctx, this.rect);
    ctx.fill();

    if (active) {
      ctx.fillStyle = Cor.css(Cor.argb(115, 0xFF, 0xF3, 0x6A));
      Ret.definir(this.rect, r.left - h * 0.012, r.top - h * 0.012, r.right + h * 0.012, r.bottom + h * 0.012);
      this._oval(ctx, this.rect);
      ctx.fill();
    }

    ctx.fillStyle = Cor.css(active ? this.brightenColor(bg, 1.38) : bg);
    this._oval(ctx, r);
    ctx.fill();
    ctx.lineWidth = active ? h * 0.009 : h * 0.006;
    ctx.strokeStyle = Cor.css(active ? Cor.rgb(0xFF, 0xF3, 0x6A) : border);
    this._oval(ctx, r);
    ctx.stroke();
    ctx.lineWidth = h * 0.0026;
    ctx.strokeStyle = Cor.css(Cor.argb(120, 255, 255, 255));
    Ret.definir(this.rect, r.left + h * 0.008, r.top + h * 0.008, r.right - h * 0.008, r.bottom - h * 0.008);
    this._oval(ctx, this.rect);
    ctx.stroke();

    ctx.fillStyle = Cor.css(this.white);
    ctx.textAlign = "center";
    this._setBold(ctx, true);
    if (subLabel === null) {
      this._setTextSize(ctx, label.length <= 1 ? h * 0.06 : h * 0.030);
      ctx.fillText(label, Ret.centroX(r), Ret.centroY(r) + this.textSize * 0.35);
    } else {
      this._setTextSize(ctx, h * 0.024);
      ctx.fillText(label, Ret.centroX(r), Ret.centroY(r) - h * 0.003);
      this._setTextSize(ctx, h * 0.017);
      ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xF2, 0xC2));
      ctx.fillText(subLabel, Ret.centroX(r), Ret.centroY(r) + h * 0.026);
    }
    this._setBold(ctx, false);
  }

  drawArrowPad(ctx, r, arrowBmp, active) {
    const w = this.w, h = this.h;
    if (active === undefined) active = false;
    if (Ret.vazio(r)) return;
    ctx.fillStyle = Cor.css(Cor.argb(active ? 135 : 78, 0, 0, 0));
    Ret.definir(this.rect, r.left + h * 0.004, r.top + h * 0.010, r.right + h * 0.004, r.bottom + h * 0.010);
    retanguloArredondado(ctx, this.rect, h * 0.030);
    ctx.fill();

    if (active) {
      ctx.fillStyle = Cor.css(Cor.argb(105, 0xFF, 0xF3, 0x6A));
      Ret.definir(this.rect, r.left - h * 0.010, r.top - h * 0.010, r.right + h * 0.010, r.bottom + h * 0.010);
      retanguloArredondado(ctx, this.rect, h * 0.036);
      ctx.fill();
    }

    ctx.fillStyle = Cor.css(active ? Cor.argb(220, 0x26, 0x32, 0x46) : Cor.argb(164, 0x14, 0x18, 0x24));
    retanguloArredondado(ctx, r, h * 0.030);
    ctx.fill();
    ctx.lineWidth = active ? h * 0.0070 : h * 0.0045;
    ctx.strokeStyle = Cor.css(active ? Cor.rgb(0xFF, 0xF3, 0x6A) : Cor.argb(180, 0xC8, 0xD4, 0xE8));
    retanguloArredondado(ctx, r, h * 0.030);
    ctx.stroke();
    ctx.lineWidth = h * 0.0020;
    ctx.strokeStyle = Cor.css(Cor.argb(90, 0x00, 0xF5, 0xD4));
    Ret.definir(this.rect, r.left + h * 0.008, r.top + h * 0.008, r.right - h * 0.008, r.bottom - h * 0.008);
    retanguloArredondado(ctx, this.rect, h * 0.024);
    ctx.stroke();

    if (arrowBmp !== null && arrowBmp !== undefined) {
      const pad = h * 0.016;
      Ret.definir(this.rect, r.left + pad, r.top + pad, r.right - pad, r.bottom - pad);
      this._desenharImagem(ctx, arrowBmp, this.rect, null);
    } else {
      ctx.fillStyle = Cor.css(this.white);
      ctx.textAlign = "center";
      this._setTextSize(ctx, h * 0.060);
      this._setBold(ctx, true);
      const label = (Ret.centroX(r) < w * 0.5) ? "◀" : "▶";
      ctx.fillText(label, Ret.centroX(r), Ret.centroY(r) + this.textSize * 0.35);
      this._setBold(ctx, false);
    }
  }

  drawAccelButton(ctx, r, active) {
    if (this.accelPedalBitmap !== null) {
      this.drawImageButton(ctx, r, this.accelPedalBitmap, active, Cor.argb(130, 0x22, 0x3A, 0x18), Cor.rgb(0xA8, 0xFF, 0x83));
    } else {
      this.drawRoundButton(ctx, r, Cor.argb(0xAA, 0x12, 0x5A, 0x2A), Cor.rgb(0x7C, 0xFF, 0x6B), "ACEL.", "GO", active);
    }
  }

  drawBrakeButton(ctx, r, active) {
    if (this.brakePedalBitmap !== null) {
      this.drawImageButton(ctx, r, this.brakePedalBitmap, active, Cor.argb(125, 0x3A, 0x1C, 0x22), Cor.rgb(0xFF, 0xA3, 0xBD));
    } else {
      this.drawPillButton(ctx, r, Cor.argb(0xAA, 0x6A, 0x12, 0x2A), this.magenta, "F/R", active);
    }
  }

  drawImageButton(ctx, r, bmp, active, bg, border) {
    const h = this.h;
    if (Ret.vazio(r)) return;

    ctx.fillStyle = Cor.css(Cor.argb(active ? 145 : 88, 0, 0, 0));
    Ret.definir(this.rect, r.left + h * 0.004, r.top + h * 0.010, r.right + h * 0.004, r.bottom + h * 0.010);
    retanguloArredondado(ctx, this.rect, h * 0.032);
    ctx.fill();

    if (active) {
      ctx.fillStyle = Cor.css(Cor.argb(95, 0xFF, 0xF3, 0x6A));
      Ret.definir(this.rect, r.left - h * 0.010, r.top - h * 0.010, r.right + h * 0.010, r.bottom + h * 0.010);
      retanguloArredondado(ctx, this.rect, h * 0.036);
      ctx.fill();
    }

    ctx.fillStyle = Cor.css(bg);
    retanguloArredondado(ctx, r, h * 0.030);
    ctx.fill();
    ctx.lineWidth = active ? h * 0.0068 : h * 0.0044;
    ctx.strokeStyle = Cor.css(active ? Cor.rgb(0xFF, 0xF3, 0x6A) : border);
    retanguloArredondado(ctx, r, h * 0.030);
    ctx.stroke();

    if (bmp !== null && bmp !== undefined) {
      const padX = Ret.largura(r) * 0.10;
      const padY = Ret.altura(r) * 0.12;
      const availableW = Math.max(1, Ret.largura(r) - padX * 2);
      const availableH = Math.max(1, Ret.altura(r) - padY * 2);
      const scale = Math.min(availableW / this._larguraImagem(bmp), availableH / this._alturaImagem(bmp));
      const drawW = this._larguraImagem(bmp) * scale;
      const drawH = this._alturaImagem(bmp) * scale;
      Ret.definir(this.rect,
        Ret.centroX(r) - drawW * 0.5,
        Ret.centroY(r) - drawH * 0.5,
        Ret.centroX(r) + drawW * 0.5,
        Ret.centroY(r) + drawH * 0.5
      );
      this._desenharImagem(ctx, bmp, this.rect, null);
    }
  }

  drawPillButton(ctx, r, bg, border, label, active) {
    const h = this.h;
    if (active === undefined) active = false;
    if (Ret.vazio(r)) return;
    ctx.fillStyle = Cor.css(Cor.argb(active ? 145 : 90, 0, 0, 0));
    Ret.definir(this.rect, r.left + h * 0.004, r.top + h * 0.008, r.right + h * 0.004, r.bottom + h * 0.008);
    retanguloArredondado(ctx, this.rect, Ret.altura(this.rect) * 0.50);
    ctx.fill();

    if (active) {
      ctx.fillStyle = Cor.css(Cor.argb(105, 0xFF, 0xF3, 0x6A));
      Ret.definir(this.rect, r.left - h * 0.010, r.top - h * 0.010, r.right + h * 0.010, r.bottom + h * 0.010);
      retanguloArredondado(ctx, this.rect, Ret.altura(this.rect) * 0.50);
      ctx.fill();
    }

    ctx.fillStyle = Cor.css(active ? this.brightenColor(bg, 1.35) : bg);
    retanguloArredondado(ctx, r, Ret.altura(r) * 0.50);
    ctx.fill();
    ctx.lineWidth = active ? h * 0.0070 : h * 0.0045;
    ctx.strokeStyle = Cor.css(active ? Cor.rgb(0xFF, 0xF3, 0x6A) : border);
    retanguloArredondado(ctx, r, Ret.altura(r) * 0.50);
    ctx.stroke();
    ctx.lineWidth = h * 0.0022;
    ctx.strokeStyle = Cor.css(Cor.argb(110, 255, 255, 255));
    Ret.definir(this.rect, r.left + h * 0.008, r.top + h * 0.006, r.right - h * 0.008, r.bottom - h * 0.006);
    retanguloArredondado(ctx, this.rect, Ret.altura(this.rect) * 0.50);
    ctx.stroke();

    ctx.fillStyle = Cor.css(this.white);
    ctx.textAlign = "center";
    this._setTextSize(ctx, h * 0.024);
    this._setBold(ctx, true);
    ctx.fillText(label, Ret.centroX(r), Ret.centroY(r) + this.textSize * 0.32);
    this._setBold(ctx, false);
  }

  // =================== Telas sobrepostas ===================

  /** Tutorial simples exibido no primeiro jogo. */
  drawTutorial(ctx) {
    const w = this.w, h = this.h;
    this.dimBackground(ctx);

    const card = Ret.novo(w * 0.12, h * 0.10, w * 0.88, h * 0.82);
    ctx.fillStyle = Cor.css(Cor.argb(224, 0x05, 0x08, 0x1C));
    retanguloArredondado(ctx, card, h * 0.034);
    ctx.fill();

    ctx.lineWidth = h * 0.0045;
    ctx.strokeStyle = Cor.css(this.cyan);
    retanguloArredondado(ctx, card, h * 0.034);
    ctx.stroke();
    ctx.lineWidth = h * 0.0020;
    ctx.strokeStyle = Cor.css(Cor.argb(170, 0xF5, 0x00, 0x90));
    Ret.definir(this.rect, card.left + h * 0.014, card.top + h * 0.014, card.right - h * 0.014, card.bottom - h * 0.014);
    retanguloArredondado(ctx, this.rect, h * 0.026);
    ctx.stroke();

    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.062);
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xE0, 0x40));
    ctx.fillText("COMO JOGAR", w / 2, card.top + h * 0.095);

    this._setBold(ctx, false);
    this._setTextSize(ctx, h * 0.024);
    ctx.fillStyle = Cor.css(Cor.rgb(0xDF, 0xE9, 0xFF));
    ctx.fillText("Dicas rápidas para sua primeira corrida", w / 2, card.top + h * 0.135);

    const items = [
      "Toque na tela para acelerar e controlar o carro",
      "Segure o TURBO para ganhar velocidade extra",
      "Colete moedas na pista para comprar melhorias",
      "Cuidado com o combustível durante a corrida",
      "Use a garagem para melhorar motor, tanque e estabilidade"
    ];

    let y = card.top + h * 0.215;
    const left = card.left + w * 0.105;
    const lineGap = h * 0.078;
    ctx.textAlign = "left";
    this._setTextSize(ctx, h * 0.027);
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const cy = y - h * 0.012;
      ctx.fillStyle = Cor.css(Cor.argb(95, 0x00, 0xF5, 0xD4));
      Ret.definir(this.rect, left - h * 0.045, cy - h * 0.024, left - h * 0.002, cy + h * 0.024);
      retanguloArredondado(ctx, this.rect, h * 0.014);
      ctx.fill();
      ctx.lineWidth = h * 0.002;
      ctx.strokeStyle = Cor.css(idx % 2 === 0 ? this.cyan : this.magenta);
      retanguloArredondado(ctx, this.rect, h * 0.014);
      ctx.stroke();

      ctx.textAlign = "center";
      this._setBold(ctx, true);
      this._setTextSize(ctx, h * 0.021);
      ctx.fillStyle = Cor.css(this.white);
      ctx.fillText("" + (idx + 1), Ret.centroX(this.rect), Ret.centroY(this.rect) + this.textSize * 0.34);

      ctx.textAlign = "left";
      this._setBold(ctx, false);
      this._setTextSize(ctx, h * 0.027);
      ctx.fillStyle = Cor.css(Cor.rgb(0xF1, 0xF5, 0xFF));
      ctx.fillText(item, left + h * 0.012, y);
      y += lineGap;
    }

    const btn = Ret.novo(w * 0.34, card.bottom - h * 0.12, w * 0.66, card.bottom - h * 0.045);
    this.drawMenuButton(ctx, btn, "COMEÇAR", this.cyan);

    ctx.textAlign = "center";
    this._setTextSize(ctx, h * 0.0145);
    ctx.fillStyle = Cor.css(Cor.rgb(0xB8, 0xC6, 0xDA));
    ctx.fillText("Toque em qualquer lugar para continuar", w / 2, card.bottom - h * 0.018);
    this._setBold(ctx, false);
  }

  /** Contagem regressiva no inicio usando os PNGs 3, 2, 1 e Vai! com efeitos. */
  drawCountdown(ctx, countdown) {
    const w = this.w, h = this.h;
    let label;
    let bmp;
    let phaseStart;
    let phaseEnd;
    if (countdown > 2.5) {
      label = "3";
      bmp = this.countdown3Bitmap;
      phaseStart = 3.5;
      phaseEnd = 2.5;
    } else if (countdown > 1.5) {
      label = "2";
      bmp = this.countdown2Bitmap;
      phaseStart = 2.5;
      phaseEnd = 1.5;
    } else if (countdown > 0.5) {
      label = "1";
      bmp = this.countdown1Bitmap;
      phaseStart = 1.5;
      phaseEnd = 0.5;
    } else {
      label = "VAI!";
      bmp = this.countdownGoBitmap;
      phaseStart = 0.5;
      phaseEnd = 0;
    }

    const segDuration = Math.max(0.001, phaseStart - phaseEnd);
    const localT = limitar((phaseStart - countdown) / segDuration, 0, 1);
    const pulse = limitar(Math.sin(localT * Math.PI), 0, 1);
    const flash = (label === "VAI!") ? (0.28 + pulse * 0.30) : (0.16 + pulse * 0.12);
    const centerX = w * 0.5;
    const centerY = h * 0.48;

    // Escurece levemente a tela para valorizar a arte.
    ctx.fillStyle = Cor.css(Cor.argb(limitar(Math.trunc(150 + flash * 55), 0, 255), 6, 5, 18));
    ctx.fillRect(0, 0, w, h);

    // Flash radial suave na hora do "VAI!".
    if (label === "VAI!") {
      ctx.fillStyle = Cor.css(Cor.argb(limitar(Math.trunc(45 + pulse * 55), 0, 255), 255, 255, 255));
      ctx.fillRect(0, 0, w, h);
    }

    // Painel holografico atras da arte.
    const panelW = w * 0.56;
    const panelH = h * 0.40;
    Ret.definir(this.rect, centerX - panelW / 2, centerY - panelH / 2, centerX + panelW / 2, centerY + panelH / 2);
    ctx.fillStyle = Cor.css(Cor.argb(limitar(Math.trunc(120 + flash * 40), 0, 255), 10, 8, 30));
    retanguloArredondado(ctx, this.rect, h * 0.028);
    ctx.fill();
    ctx.lineWidth = h * 0.004;
    ctx.strokeStyle = Cor.css(Cor.argb(210, 0x9C, 0x4D, 0xFF));
    retanguloArredondado(ctx, this.rect, h * 0.028);
    ctx.stroke();
    ctx.lineWidth = h * 0.002;
    ctx.strokeStyle = Cor.css(Cor.argb(220, 0xFF, 0x4D, 0xE8));
    this._inset(this.rect, h * 0.012, h * 0.012);
    retanguloArredondado(ctx, this.rect, h * 0.022);
    ctx.stroke();

    // Linhas laterais rapidas para dar sensacao de arrancada.
    // (No Android o Paint era so do HUD; aqui o ctx e compartilhado com o
    // Renderer, entao devolvemos o lineCap ao normal depois das linhas.)
    ctx.lineCap = "round";
    ctx.lineWidth = h * 0.006;
    ctx.strokeStyle = Cor.css(Cor.argb(limitar(Math.trunc(55 + pulse * 70), 0, 255), 255, 80, 220));
    for (let i = 0; i < 8; i++) {
      const yy = centerY - h * 0.13 + i * h * 0.035;
      const len = w * (0.05 + i * 0.005);
      this._linha(ctx, w * 0.08, yy, w * 0.08 + len, yy + h * 0.01);
      this._linha(ctx, w * 0.92 - len, yy + h * 0.01, w * 0.92, yy);
    }
    ctx.lineCap = "butt";

    if (bmp !== null && bmp !== undefined) {
      const baseScale = (label === "VAI!") ? 0.66 : 0.52;
      const scale = baseScale + pulse * ((label === "VAI!") ? 0.08 : 0.05);
      const maxW = w * scale;
      const maxH = h * ((label === "VAI!") ? 0.30 : 0.42);
      const aspect = this._larguraImagem(bmp) / this._alturaImagem(bmp);
      let drawW = maxW;
      let drawH = drawW / aspect;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * aspect;
      }
      const shadow = Ret.novo(centerX - drawW / 2 + h * 0.008, centerY - drawH / 2 + h * 0.010, centerX + drawW / 2 + h * 0.008, centerY + drawH / 2 + h * 0.010);
      const glowOuter = Ret.novo(centerX - drawW * 0.54, centerY - drawH * 0.54, centerX + drawW * 0.54, centerY + drawH * 0.54);
      const glowInner = Ret.novo(centerX - drawW * 0.515, centerY - drawH * 0.515, centerX + drawW * 0.515, centerY + drawH * 0.515);
      const dst = Ret.novo(centerX - drawW / 2, centerY - drawH / 2, centerX + drawW / 2, centerY + drawH / 2);

      this._desenharImagem(ctx, bmp, shadow, limitar(Math.trunc(100 + pulse * 60), 0, 255));
      this._desenharImagem(ctx, bmp, glowOuter, limitar(Math.trunc(72 + pulse * 38), 0, 255));
      this._desenharImagem(ctx, bmp, glowInner, limitar(Math.trunc(120 + pulse * 50), 0, 255));
      this._desenharImagem(ctx, bmp, dst, null);
    } else {
      // Fallback textual se o PNG nao existir.
      ctx.textAlign = "center";
      this._setBold(ctx, true);
      this._setTextSize(ctx, h * 0.31 * (1 + pulse * 0.04));
      ctx.fillStyle = Cor.css(Cor.argb(150, 0, 0, 0));
      ctx.fillText(label, centerX + h * 0.012, centerY + h * 0.012);
      this._setTextSize(ctx, h * 0.322 * (1 + pulse * 0.04));
      ctx.fillStyle = Cor.css(Cor.argb(140, 0x9C, 0x4D, 0xFF));
      ctx.fillText(label, centerX, centerY);
      this._setTextSize(ctx, h * 0.298 * (1 + pulse * 0.03));
      ctx.fillStyle = Cor.css(Cor.WHITE);
      ctx.fillText(label, centerX, centerY);
    }

    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.030);
    ctx.fillStyle = Cor.css(label === "VAI!" ? Cor.rgb(0xFF, 0xEF, 0x7A) : Cor.rgb(0xFF, 0x7A, 0xE9));
    ctx.fillText(label === "VAI!" ? "ACELERA!" : "PREPARE-SE", centerX, centerY + h * 0.205);
    this._setBold(ctx, false);
  }

  /** Tela de pause: Continuar / Reiniciar / Musica / Menu. */
  drawPaused(ctx, musicOn) {
    const w = this.w, h = this.h;
    this.dimBackground(ctx);
    this.title(ctx, "PAUSADO", h * 0.20);

    const bw = w * 0.34;
    const bh = h * 0.105;
    const cx = w / 2;
    let y = h * 0.305;
    const step = bh + h * 0.032;

    this.layoutButton(this.resumeBtn, cx, y, bw, bh); this.drawMenuButton(ctx, this.resumeBtn, "CONTINUAR", this.cyan); y += step;
    this.layoutButton(this.restartBtn, cx, y, bw, bh); this.drawMenuButton(ctx, this.restartBtn, "REINICIAR", this.purple); y += step;
    this.layoutButton(this.musicBtn, cx, y, bw, bh); this.drawMenuButton(ctx, this.musicBtn, musicOn ? "MÚSICA: ON" : "MÚSICA: OFF", Cor.rgb(0xFF, 0xD2, 0x4D)); y += step;
    this.layoutButton(this.menuBtn, cx, y, bw, bh); this.drawMenuButton(ctx, this.menuBtn, "MENU", this.magenta);
  }

  /**
   * Tela de resultado.
   * won: venceu a corrida?
   * hasNext: existe proxima fase desbloqueada?
   * Os botoes sao posicionados aqui e lidos pelo game.js com o mesmo criterio.
   */
  drawResult(ctx, state, won, hasNext) {
    const w = this.w, h = this.h;
    this.dimBackground(ctx);

    if (won) {
      this.drawVictoryResult(ctx, state, hasNext);
      return;
    }

    let titleText;
    if (state.finishedButMissedCut) titleText = "TENTE NOVAMENTE";
    else if (state.outcome === RaceOutcome.OUT_OF_FUEL) titleText = "SEM COMBUSTÍVEL";
    else titleText = "TEMPO ESGOTADO";

    // Card premium da derrota.
    const card = Ret.novo(w * 0.10, h * 0.08, w * 0.90, h * 0.72);
    ctx.fillStyle = Cor.css(Cor.argb(214, 0x14, 0x0C, 0x12));
    retanguloArredondado(ctx, card, h * 0.032);
    ctx.fill();
    ctx.lineWidth = h * 0.0055;
    ctx.strokeStyle = Cor.css(Cor.rgb(0xFF, 0x78, 0x78));
    retanguloArredondado(ctx, card, h * 0.032);
    ctx.stroke();
    ctx.lineWidth = h * 0.0022;
    ctx.strokeStyle = Cor.css(Cor.argb(180, 0xFF, 0xC1, 0x07));
    Ret.definir(this.rect, card.left + h * 0.016, card.top + h * 0.016, card.right - h * 0.016, card.bottom - h * 0.016);
    retanguloArredondado(ctx, this.rect, h * 0.022);
    ctx.stroke();

    this.title(ctx, titleText, h * 0.145);

    ctx.textAlign = "center";
    this._setTextSize(ctx, h * 0.027);
    ctx.fillStyle = Cor.css(this.white);
    let subtitle;
    if (state.finishedButMissedCut) subtitle = "Você terminou em " + state.rank + "º. Para avançar, precisa ficar entre os 5 melhores.";
    else if (state.outcome === RaceOutcome.OUT_OF_FUEL) subtitle = "O carro ficou sem combustível antes da bandeirada.";
    else subtitle = "A corrida acabou antes de você garantir a classificação.";
    ctx.fillText(subtitle, w / 2, h * 0.205);

    this.drawSadPilotScene(ctx);

    // As caixas tem 0.065h de altura, entao comecar em 0.60 fazia a borda de
    // baixo terminar exatamente em 0.665 — em cima da linha de ultrapassagens.
    // Sobem um tico para as duas coisas respirarem.
    const statY = h * 0.585;
    this.drawVictoryStat(ctx, w * 0.25, statY, "POSIÇÃO", state.rank + "º/" + state.totalRacers, Cor.rgb(0xFF, 0x78, 0x78));
    this.drawVictoryStat(ctx, w * 0.50, statY, "PONTOS", "" + state.score, Cor.rgb(0xFF, 0xC1, 0x07));
    this.drawVictoryStat(ctx, w * 0.75, statY, "MOEDAS", "" + this.animatedFinalCoins(state), this.magenta);

    ctx.textAlign = "center";
    this._setTextSize(ctx, h * 0.016);
    ctx.fillStyle = Cor.css(Cor.rgb(0xDF, 0xE7, 0xF6));
    ctx.fillText("Ultrapassagens: " + state.overtakes, w / 2, h * 0.672);
    this.drawRewardPanel(ctx, state, h * 0.685);

    const bw = w * 0.17;
    const bh = h * 0.078;
    const y = h * 0.805;
    this.layoutButton(this.btnPrimary, w * 0.31, y, bw, bh);
    this.drawMenuButton(ctx, this.btnPrimary, "REPETIR", this.purple);
    this.layoutButton(this.btnSecondary, w * 0.50, y, bw, bh);
    this.drawMenuButton(ctx, this.btnSecondary, "GARAGEM", this.cyan);
    this.layoutButton(this.btnTertiary, w * 0.69, y, bw, bh);
    this.drawMenuButton(ctx, this.btnTertiary, "MENU", this.magenta);
    this._setEmpty(this.btnGarage);
  }

  animatedFinalCoins(state) {
    const t = limitar(state.rewardAnimTime / 2.15, 0, 1);
    const eased = 1 - (1 - t) * (1 - t) * (1 - t);
    return state.collectedRaceCoins + Math.trunc(state.totalRewardCoins * eased);
  }

  drawRewardPanel(ctx, state, top) {
    const w = this.w, h = this.h;
    const panel = Ret.novo(w * 0.18, top, w * 0.82, top + h * 0.112);
    ctx.fillStyle = Cor.css(Cor.argb(208, 0x05, 0x05, 0x18));
    retanguloArredondado(ctx, panel, h * 0.020);
    ctx.fill();
    ctx.lineWidth = h * 0.0027;
    ctx.strokeStyle = Cor.css(Cor.argb(210, 0x00, 0xF5, 0xD4));
    retanguloArredondado(ctx, panel, h * 0.020);
    ctx.stroke();
    ctx.lineWidth = h * 0.0015;
    ctx.strokeStyle = Cor.css(Cor.argb(160, 0xF5, 0x00, 0x90));
    Ret.definir(this.rect, panel.left + h * 0.008, panel.top + h * 0.008, panel.right - h * 0.008, panel.bottom - h * 0.008);
    retanguloArredondado(ctx, this.rect, h * 0.015);
    ctx.stroke();

    const t = limitar(state.rewardAnimTime / 2.15, 0, 1);
    const eased = 1 - (1 - t) * (1 - t) * (1 - t);
    const animatedBonus = Math.trunc(state.totalRewardCoins * eased);
    const animatedTotal = state.collectedRaceCoins + animatedBonus;

    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.019);
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xE0, 0x40));
    ctx.fillText("PRÊMIO DA CORRIDA", w / 2, panel.top + h * 0.026);

    this._setBold(ctx, false);
    this._setTextSize(ctx, h * 0.0155);
    ctx.fillStyle = Cor.css(Cor.rgb(0xD9, 0xE8, 0xFF));
    const line1 = "Coletadas +" + state.collectedRaceCoins + " • Posição +" + state.positionBonusCoins + " • Ultrap. " + state.overtakes + "x +" + state.overtakeBonusCoins + " • Comb. " + state.fuelBlocksRemaining + "x +" + state.fuelBonusCoins;
    ctx.fillText(line1, w / 2, panel.top + h * 0.052);

    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.024);
    ctx.fillStyle = Cor.css(Cor.rgb(0x7C, 0xFF, 0x6B));
    ctx.fillText("CONTA DO PILOTO: " + animatedTotal + " moedas", w / 2, panel.top + h * 0.086);
    this._setBold(ctx, false);

    // Moedinhas subindo em direcao ao contador para dar sensacao de deposito.
    const startX = panel.left + Ret.largura(panel) * 0.20;
    const endX = panel.right - Ret.largura(panel) * 0.20;
    const startY = panel.bottom - h * 0.014;
    const endY = panel.top + h * 0.030;
    for (let i = 0; i < 7; i++) {
      const local = limitar((t - i * 0.075) / 0.62, 0, 1);
      if (local <= 0 || local >= 1) continue;
      const x = startX + (endX - startX) * local;
      const y = startY + (endY - startY) * local - Math.sin((local + i) * 3.14) * h * 0.010;
      const alpha = limitar(Math.trunc(210 * (1 - Math.abs(local - 0.55))), 40, 210);
      ctx.fillStyle = Cor.css(Cor.argb(alpha, 0xFF, 0xD2, 0x42));
      this._circulo(ctx, x, y, h * 0.006);
      ctx.fill();
      ctx.fillStyle = Cor.css(Cor.argb(alpha, 0xFF, 0xFF, 0xAA));
      this._circulo(ctx, x - h * 0.0015, y - h * 0.0015, h * 0.0025);
      ctx.fill();
    }
  }

  drawVictoryResult(ctx, state, hasNext) {
    const w = this.w, h = this.h;
    // Card principal premium.
    const card = Ret.novo(w * 0.12, h * 0.08, w * 0.88, h * 0.70);
    ctx.fillStyle = Cor.css(Cor.argb(210, 0x08, 0x07, 0x22));
    retanguloArredondado(ctx, card, h * 0.035);
    ctx.fill();

    ctx.lineWidth = h * 0.006;
    ctx.strokeStyle = Cor.css(this.cyan);
    retanguloArredondado(ctx, card, h * 0.035);
    ctx.stroke();
    ctx.lineWidth = h * 0.0025;
    ctx.strokeStyle = Cor.css(Cor.argb(160, 0xFF, 0xE0, 0x40));
    Ret.definir(this.rect, card.left + h * 0.018, card.top + h * 0.018, card.right - h * 0.018, card.bottom - h * 0.018);
    retanguloArredondado(ctx, this.rect, h * 0.026);
    ctx.stroke();

    // Raios/particulas de comemoracao.
    this.drawVictoryConfetti(ctx, card);

    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.078);
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xE0, 0x40));
    ctx.fillText("CLASSIFICADO!", w / 2, h * 0.17);

    this._setTextSize(ctx, h * 0.028);
    ctx.fillStyle = Cor.css(Cor.rgb(0xC8, 0xFF, 0xF4));
    ctx.fillText("Você ficou no TOP 5 e avançou para a próxima fase", w / 2, h * 0.215);
    this._setBold(ctx, false);

    this.drawVictoryImageScene(ctx);

    // Estatisticas em cartoes pequenos.
    const statY = h * 0.535;
    this.drawVictoryStat(ctx, w * 0.25, statY, "POSIÇÃO", state.rank + "º/" + state.totalRacers, this.cyan);
    this.drawVictoryStat(ctx, w * 0.50, statY, "PONTOS", "" + state.score, Cor.rgb(0xFF, 0xE0, 0x40));
    this.drawVictoryStat(ctx, w * 0.75, statY, "MOEDAS", "" + this.animatedFinalCoins(state), Cor.rgb(0xFF, 0xB8, 0x3D));

    this.drawRewardPanel(ctx, state, h * 0.615);

    if (state.newRecord) {
      ctx.fillStyle = Cor.css(Cor.argb(205, 0x7A, 0x38, 0x00));
      Ret.definir(this.rect, w * 0.39, h * 0.742, w * 0.61, h * 0.785);
      retanguloArredondado(ctx, this.rect, h * 0.015);
      ctx.fill();
      ctx.textAlign = "center";
      this._setBold(ctx, true);
      this._setTextSize(ctx, h * 0.024);
      ctx.fillStyle = Cor.css(Cor.WHITE);
      ctx.fillText("NOVO RECORDE!", w / 2, h * 0.771);
      this._setBold(ctx, false);
    }

    // Botoes menores e com opcao GARAGEM.
    const bw = hasNext ? w * 0.152 : w * 0.170;
    const bh = h * 0.076;
    const y = h * 0.808;
    if (hasNext) {
      this.layoutButton(this.btnPrimary, w * 0.22, y, bw, bh); this.drawMenuButton(ctx, this.btnPrimary, "PRÓXIMA", this.cyan);
      this.layoutButton(this.btnSecondary, w * 0.405, y, bw, bh); this.drawMenuButton(ctx, this.btnSecondary, "REPETIR", this.purple);
      this.layoutButton(this.btnTertiary, w * 0.590, y, bw, bh); this.drawMenuButton(ctx, this.btnTertiary, "GARAGEM", Cor.rgb(0xFF, 0xE0, 0x40));
      this.layoutButton(this.btnGarage, w * 0.775, y, bw, bh); this.drawMenuButton(ctx, this.btnGarage, "MENU", this.magenta);
    } else {
      this.layoutButton(this.btnPrimary, w * 0.31, y, bw, bh); this.drawMenuButton(ctx, this.btnPrimary, "REPETIR", this.purple);
      this.layoutButton(this.btnSecondary, w * 0.50, y, bw, bh); this.drawMenuButton(ctx, this.btnSecondary, "GARAGEM", this.cyan);
      this.layoutButton(this.btnTertiary, w * 0.69, y, bw, bh); this.drawMenuButton(ctx, this.btnTertiary, "MENU", this.magenta);
      this._setEmpty(this.btnGarage);
    }
  }

  drawVictoryStat(ctx, cx, top, label, value, border) {
    const w = this.w, h = this.h;
    const bw = w * 0.19;
    const bh = h * 0.065;
    Ret.definir(this.rect, cx - bw / 2, top, cx + bw / 2, top + bh);
    ctx.fillStyle = Cor.css(Cor.argb(185, 0x10, 0x0B, 0x2D));
    retanguloArredondado(ctx, this.rect, h * 0.015);
    ctx.fill();
    ctx.lineWidth = h * 0.003;
    ctx.strokeStyle = Cor.css(border);
    retanguloArredondado(ctx, this.rect, h * 0.015);
    ctx.stroke();

    ctx.textAlign = "center";
    this._setBold(ctx, false);
    this._setTextSize(ctx, h * 0.014);
    ctx.fillStyle = Cor.css(Cor.rgb(0x9E, 0xAB, 0xC9));
    ctx.fillText(label, cx, top + h * 0.022);

    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.025);
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(value, cx, top + h * 0.052);
    this._setBold(ctx, false);
  }

  drawVictoryConfetti(ctx, area) {
    const h = this.h;
    const colors = [this.cyan, this.magenta, Cor.rgb(0xFF, 0xE0, 0x40), Cor.rgb(0x7C, 0xFF, 0x6B)];
    for (let i = 0; i < 34; i++) {
      const x = area.left + ((i * 73) % 1000) / 1000 * Ret.largura(area);
      const y = area.top + ((i * 137) % 1000) / 1000 * Ret.altura(area);
      const c = colors[i % colors.length];
      ctx.fillStyle = Cor.css(Cor.argb(170, Cor.red(c), Cor.green(c), Cor.blue(c)));
      if (i % 3 === 0) {
        this._circulo(ctx, x, y, h * 0.005);
        ctx.fill();
      } else {
        Ret.definir(this.rect, x - h * 0.006, y - h * 0.003, x + h * 0.006, y + h * 0.003);
        retanguloArredondado(ctx, this.rect, h * 0.002);
        ctx.fill();
      }
    }
  }

  drawVictoryImageScene(ctx) {
    const w = this.w, h = this.h;
    const bmp = this.victoryBitmap;
    if (bmp === null || bmp === undefined) {
      this.drawChampionScene(ctx);
      return;
    }

    const cx = w * 0.50;
    const top = h * 0.255;
    const cardW = w * 0.62;
    const cardH = h * 0.235;
    Ret.definir(this.rect, cx - cardW / 2, top, cx + cardW / 2, top + cardH);

    ctx.fillStyle = Cor.css(Cor.argb(192, 0x09, 0x10, 0x22));
    retanguloArredondado(ctx, this.rect, h * 0.026);
    ctx.fill();
    ctx.lineWidth = h * 0.004;
    ctx.strokeStyle = Cor.css(Cor.argb(220, 0xFF, 0xE0, 0x40));
    retanguloArredondado(ctx, this.rect, h * 0.026);
    ctx.stroke();
    ctx.lineWidth = h * 0.0024;
    ctx.strokeStyle = Cor.css(Cor.argb(160, 0x00, 0xF5, 0xD4));
    const frame = Ret.novo(this.rect.left + h * 0.012, this.rect.top + h * 0.012, this.rect.right - h * 0.012, this.rect.bottom - h * 0.012);
    retanguloArredondado(ctx, frame, h * 0.020);
    ctx.stroke();

    const dst = Ret.novo(frame.left, frame.top, frame.right, frame.bottom);
    const srcAspect = this._larguraImagem(bmp) / this._alturaImagem(bmp);
    const dstAspect = Ret.largura(dst) / Ret.altura(dst);
    const draw = Ret.novo(dst.left, dst.top, dst.right, dst.bottom);
    if (srcAspect > dstAspect) {
      const scaledH = Ret.largura(dst) / srcAspect;
      const dy = (Ret.altura(dst) - scaledH) / 2;
      draw.top += dy;
      draw.bottom -= dy;
    } else {
      const scaledW = Ret.altura(dst) * srcAspect;
      const dx = (Ret.largura(dst) - scaledW) / 2;
      draw.left += dx;
      draw.right -= dx;
    }
    this._desenharImagem(ctx, bmp, draw, null);
  }

  drawSadPilotScene(ctx) {
    const w = this.w, h = this.h;
    const cx = w * 0.50;
    const top = h * 0.27;
    const cardW = w * 0.56;
    const cardH = h * 0.23;
    Ret.definir(this.rect, cx - cardW / 2, top, cx + cardW / 2, top + cardH);

    // Card para destacar a imagem de derrota.
    ctx.fillStyle = Cor.css(Cor.argb(188, 0x10, 0x0C, 0x1C));
    retanguloArredondado(ctx, this.rect, h * 0.024);
    ctx.fill();
    ctx.lineWidth = h * 0.0035;
    ctx.strokeStyle = Cor.css(Cor.argb(220, 0xFF, 0xC1, 0x07));
    retanguloArredondado(ctx, this.rect, h * 0.024);
    ctx.stroke();

    const bmp = this.defeatBitmap;
    if (bmp !== null && bmp !== undefined) {
      const margin = h * 0.012;
      const dst = Ret.novo(this.rect.left + margin, this.rect.top + margin, this.rect.right - margin, this.rect.bottom - margin);
      const srcAspect = this._larguraImagem(bmp) / this._alturaImagem(bmp);
      const dstAspect = Ret.largura(dst) / Ret.altura(dst);
      const draw = Ret.novo(dst.left, dst.top, dst.right, dst.bottom);
      if (srcAspect > dstAspect) {
        const scaledH = Ret.largura(dst) / srcAspect;
        const dy = (Ret.altura(dst) - scaledH) / 2;
        draw.top += dy;
        draw.bottom -= dy;
      } else {
        const scaledW = Ret.altura(dst) * srcAspect;
        const dx = (Ret.largura(dst) - scaledW) / 2;
        draw.left += dx;
        draw.right -= dx;
      }
      this._desenharImagem(ctx, bmp, draw, null);
    } else {
      // fallback simples se a imagem nao estiver disponivel
      ctx.fillStyle = Cor.css(Cor.argb(110, 0, 0, 0));
      this._oval(ctx, Ret.novo(cx - h * 0.09, top + h * 0.17, cx + h * 0.09, top + h * 0.22));
      ctx.fill();
      ctx.fillStyle = Cor.css(Cor.rgb(0xA8, 0x86, 0x22));
      Ret.definir(this.rect, cx - h * 0.05, top + h * 0.04, cx + h * 0.05, top + h * 0.16);
      retanguloArredondado(ctx, this.rect, h * 0.02);
      ctx.fill();
    }

    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xC1, 0x07));
    ctx.textAlign = "center";
    this._setTextSize(ctx, h * 0.038);
    this._setBold(ctx, true);
    ctx.fillText("TENTE NOVAMENTE", cx, top + cardH + h * 0.045);
    this._setBold(ctx, false);
  }

  drawChampionScene(ctx) {
    const w = this.w, h = this.h;
    const cx = w * 0.50;
    const trophyY = h * 0.365;

    // Halo atras do trofeu.
    ctx.fillStyle = Cor.css(Cor.argb(70, 0xFF, 0xE0, 0x40));
    this._circulo(ctx, cx, trophyY, h * 0.135);
    ctx.fill();
    ctx.fillStyle = Cor.css(Cor.argb(58, 0x00, 0xF5, 0xD4));
    this._circulo(ctx, cx, trophyY, h * 0.190);
    ctx.fill();

    // Podio moderno.
    const baseY = h * 0.505;
    ctx.fillStyle = Cor.css(Cor.rgb(0x26, 0x2A, 0x44));
    Ret.definir(this.rect, cx - h * 0.205, baseY - h * 0.018, cx + h * 0.205, baseY + h * 0.032);
    retanguloArredondado(ctx, this.rect, h * 0.015);
    ctx.fill();
    ctx.fillStyle = Cor.css(Cor.rgb(0x4A, 0x4F, 0x72));
    Ret.definir(this.rect, cx - h * 0.070, baseY - h * 0.120, cx + h * 0.070, baseY + h * 0.030);
    retanguloArredondado(ctx, this.rect, h * 0.012);
    ctx.fill();
    Ret.definir(this.rect, cx - h * 0.185, baseY - h * 0.075, cx - h * 0.085, baseY + h * 0.030);
    retanguloArredondado(ctx, this.rect, h * 0.012);
    ctx.fill();
    Ret.definir(this.rect, cx + h * 0.085, baseY - h * 0.052, cx + h * 0.185, baseY + h * 0.030);
    retanguloArredondado(ctx, this.rect, h * 0.012);
    ctx.fill();

    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.026);
    ctx.fillStyle = Cor.css(this.white);
    ctx.fillText("2", cx - h * 0.135, baseY - h * 0.028);
    ctx.fillText("1", cx, baseY - h * 0.074);
    ctx.fillText("3", cx + h * 0.135, baseY - h * 0.010);

    // Trofeu.
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xD1, 0x4A));
    Ret.definir(this.rect, cx - h * 0.040, trophyY - h * 0.060, cx + h * 0.040, trophyY + h * 0.018);
    retanguloArredondado(ctx, this.rect, h * 0.012);
    ctx.fill();
    Ret.definir(this.rect, cx - h * 0.026, trophyY + h * 0.012, cx + h * 0.026, trophyY + h * 0.065);
    retanguloArredondado(ctx, this.rect, h * 0.006);
    ctx.fill();
    Ret.definir(this.rect, cx - h * 0.070, trophyY + h * 0.058, cx + h * 0.070, trophyY + h * 0.085);
    retanguloArredondado(ctx, this.rect, h * 0.009);
    ctx.fill();

    ctx.lineWidth = h * 0.010;
    ctx.strokeStyle = Cor.css(Cor.rgb(0xFF, 0xE8, 0x8A));
    Ret.definir(this.rect, cx - h * 0.088, trophyY - h * 0.045, cx - h * 0.026, trophyY + h * 0.030);
    this._arco(ctx, this.rect, 90, 180);
    ctx.stroke();
    Ret.definir(this.rect, cx + h * 0.026, trophyY - h * 0.045, cx + h * 0.088, trophyY + h * 0.030);
    this._arco(ctx, this.rect, -90, 180);
    ctx.stroke();

    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.034);
    ctx.fillStyle = Cor.css(Cor.rgb(0x2A, 0x1A, 0x00));
    ctx.fillText("1", cx, trophyY - h * 0.010);

    // Bandeiras e sprays discretos.
    ctx.lineWidth = h * 0.006;
    ctx.strokeStyle = Cor.css(Cor.rgb(0xE8, 0xE8, 0xE8));
    this._linha(ctx, cx - h * 0.22, baseY - h * 0.13, cx - h * 0.22, baseY + h * 0.02);
    this._linha(ctx, cx + h * 0.22, baseY - h * 0.13, cx + h * 0.22, baseY + h * 0.02);
    ctx.fillStyle = Cor.css(this.magenta);
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.22, baseY - h * 0.13);
    ctx.lineTo(cx - h * 0.14, baseY - h * 0.105);
    ctx.lineTo(cx - h * 0.22, baseY - h * 0.080);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = Cor.css(this.cyan);
    ctx.beginPath();
    ctx.moveTo(cx + h * 0.22, baseY - h * 0.13);
    ctx.lineTo(cx + h * 0.14, baseY - h * 0.105);
    ctx.lineTo(cx + h * 0.22, baseY - h * 0.080);
    ctx.closePath();
    ctx.fill();

    this.drawSpray(ctx, cx - h * 0.21, baseY - h * 0.15, -1);
    this.drawSpray(ctx, cx + h * 0.21, baseY - h * 0.15, 1);

    this._setBold(ctx, false);
  }

  drawSpray(ctx, x, y, dir) {
    const h = this.h;
    ctx.fillStyle = Cor.css(Cor.rgb(0x61, 0x3A, 0x1F));
    Ret.definir(this.rect, x - h * 0.012, y + h * 0.03, x + h * 0.012, y + h * 0.08);
    retanguloArredondado(ctx, this.rect, h * 0.008);
    ctx.fill();
    ctx.fillStyle = Cor.css(Cor.rgb(0xF6, 0xE2, 0x9A));
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      const px = x + dir * h * (0.03 + 0.11 * t);
      const py = y - h * (0.02 + 0.10 * Math.sin(t * 1.4));
      this._circulo(ctx, px, py, h * (0.004 + 0.003 * (1 - t)));
      ctx.fill();
    }
  }

  // ---- Auxiliares de desenho ----

  dimBackground(ctx) {
    ctx.fillStyle = Cor.css(Cor.argb(0xCC, 0x05, 0x03, 0x12));
    ctx.fillRect(0, 0, this.w, this.h);
  }

  title(ctx, t, y) {
    const w = this.w, h = this.h;
    ctx.fillStyle = Cor.css(this.cyan);
    ctx.textAlign = "center";
    this._setBold(ctx, true);
    this._setTextSize(ctx, h * 0.10);
    ctx.fillText(t, w / 2, y);
    this._setBold(ctx, false);
  }

  layoutButton(r, cx, top, bw, bh) {
    Ret.definir(r, cx - bw / 2, top, cx + bw / 2, top + bh);
  }

  drawMenuButton(ctx, r, label, border) {
    const h = this.h;
    ctx.fillStyle = Cor.css(this.panelBg);
    retanguloArredondado(ctx, r, h * 0.025);
    ctx.fill();
    ctx.lineWidth = h * 0.006;
    ctx.strokeStyle = Cor.css(border);
    retanguloArredondado(ctx, r, h * 0.025);
    ctx.stroke();

    ctx.fillStyle = Cor.css(this.white);
    ctx.textAlign = "center";
    this._setBold(ctx, true);
    let tam;
    if (label.length >= 12) tam = h * 0.026;
    else if (label.length >= 8) tam = h * 0.031;
    else tam = h * 0.036;
    this._setTextSize(ctx, tam);
    ctx.fillText(label, Ret.centroX(r), Ret.centroY(r) + this.textSize * 0.35);
    this._setBold(ctx, false);
  }
}

window.HUD = HUD;
