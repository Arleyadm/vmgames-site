"use strict";
/*
 * Garagem. Porte de GarageActivity.kt + game/CarPreviewView.kt.
 *
 * Navega pelos carros (◀ ▶), mostra os atributos (velocidade, aceleração,
 * controle e turbo) e permite COMPRAR com moedas ou SELECIONAR um carro já
 * desbloqueado. As compras e o carro selecionado ficam salvos.
 *
 * O que muda em relacao ao app:
 *  - o activity_garage.xml nao existe no navegador; os tres paineis (carro,
 *    atributos e melhorias) sao desenhados no Canvas com os mesmos pesos
 *    (1.12 / 0.92 / 1.15), as mesmas margens e as mesmas cores dos drawables
 *    panel_garage_neon, panel_glass e panel_glass_pink;
 *  - o Toast virou uma faixa no rodape que some sozinha depois de 2 segundos;
 *  - a ScrollView das melhorias virou um arrasto dentro do proprio painel —
 *    pelo mesmo motivo do Kotlin: o gesto nao pode arrastar a garagem inteira.
 *
 * Nada de preco e inventado aqui: quem calcula tudo e o SaveManager.
 */

/* ------------------------------------------------------------------ */
/* Cores dos recursos (res/values/colors.xml e res/drawable/*.xml)     */
/* ------------------------------------------------------------------ */

const GARAGEM_BG_DARK      = 0xFF050016; // @color/bg_dark
const GARAGEM_NEON_CYAN    = 0xFF00F5FF; // @color/neon_cyan
const GARAGEM_NEON_MAGENTA = 0xFFFF2DAA; // @color/neon_magenta
const GARAGEM_AMBER        = 0xFFFFD24D; // @color/amber
const GARAGEM_TEXT_DIM     = 0xFFD2C7F0; // @color/text_dim

// panel_garage_neon: gradiente na horizontal (angle 0) + borda azul clara.
const GARAGEM_PANEL_NEON_INICIO = 0xCC05051A;
const GARAGEM_PANEL_NEON_MEIO   = 0x88142640;
const GARAGEM_PANEL_NEON_FIM    = 0x66000412;
const GARAGEM_PANEL_NEON_BORDA  = 0x884DC8FF;

// panel_glass: gradiente de cima para baixo (angle 270) + borda ciano.
const GARAGEM_PANEL_GLASS_INICIO = 0xD80B1432;
const GARAGEM_PANEL_GLASS_FIM    = 0xC4140630;
const GARAGEM_PANEL_GLASS_BORDA  = 0x8800F5FF;

// panel_glass_pink: mesmo desenho, tons de rosa.
const GARAGEM_PANEL_PINK_INICIO = 0xD817082F;
const GARAGEM_PANEL_PINK_FIM    = 0xC42C073B;
const GARAGEM_PANEL_PINK_BORDA  = 0x88FF2DAA;

// btn_garage_rect: normal, pressionado e desabilitado.
const GARAGEM_BOTAO_BORDA          = 0xCC00F5FF;
const GARAGEM_BOTAO_PRESS_INICIO   = 0xFF00F5FF;
const GARAGEM_BOTAO_PRESS_FIM      = 0xFFFF2DAA;
const GARAGEM_BOTAO_DESAB_FUNDO    = 0x66313144;
const GARAGEM_BOTAO_DESAB_BORDA    = 0x667B8190;
const GARAGEM_BOTAO_PRECO          = 0xFFFFF176; // ForegroundColorSpan do preco

/* ------------------------------------------------------------------ */
/* CarPreviewView.kt                                                    */
/* ------------------------------------------------------------------ */

/**
 * Mostra um único carro desenhado com formas geométricas (mesmo estilo do jogo)
 * na tela da Garagem. Basta chamar [setCar] para trocar o carro exibido.
 */
class CarPreviewView {

  constructor() {
    this.car = null;

    // Cache do sprite do carro exibido.
    this.carBmp = null;
    this.carBmpId = -1;

    // Diferenca do porte: quando o jogador comprou uma pintura, o sprite recebe
    // uma demao da cor por cima (no app a cor so aparecia no desenho geometrico).
    this.pintado = false;
    this.telaDePintura = null;
    this.pinturaAplicada = -1;
  }

  setCar(car, pintado) {
    this.car = car;
    if (car.id !== this.carBmpId) {
      this.carBmpId = car.id;
      this.carregarBitmap(car.id);
    }
    this.pintado = !!pintado;
  }

  /**
   * Equivale ao resources.getIdentifier() do Kotlin: prefere o carro inclinado
   * (car_<id>_right) e cai para a traseira (car_<id>) quando ele nao existe.
   * O Assets.img devolve null enquanto a imagem ainda esta carregando, entao a
   * busca e refeita ate a imagem chegar — no Android o decodeResource era
   * imediato e isso nao era preciso.
   */
  carregarBitmap(carId) {
    const angleBmp = Assets.img("car_" + carId + "_right");
    const rearBmp = Assets.img("car_" + carId);
    this.carBmp = (angleBmp !== null && angleBmp !== undefined) ? angleBmp : (rearBmp || null);
  }

  /** onDraw do Kotlin. O retangulo `ret` faz o papel dos limites da View. */
  onDraw(ctx, ret) {
    const c = this.car;
    if (!c) return;

    if (this.carBmp === null) this.carregarBitmap(this.carBmpId);

    const width = Ret.largura(ret);
    const height = Ret.altura(ret);

    ctx.save();
    ctx.translate(ret.left, ret.top);

    const cx = width / 2;
    const cy = height * 0.62;
    const carW = width * 0.62;
    const carH = carW * 0.8;
    const top = cy - carH;

    // Brilho de fundo (halo)
    const halo = ctx.createRadialGradient(cx, cy - carH * 0.4, 0, cx, cy - carH * 0.4, Math.max(1, carW));
    halo.addColorStop(0, Cor.css(Cor.argb(0x55, Cor.red(c.accentColor), Cor.green(c.accentColor), Cor.blue(c.accentColor))));
    halo.addColorStop(1, Cor.css(Cor.TRANSPARENT));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    // Se houver imagem (car_<id>.png), desenha ela centralizada e encerra.
    const bmp = this.carBmp;
    if (bmp && bmp.width > 0 && bmp.height > 0) {
      const aspect = bmp.height / bmp.width;
      // O Frost Hyper tem mais margem transparente no topo do sprite inclinado.
      // Compensamos somente o desenho, sem mudar atributos ou colisao do carro.
      const visualScale = (c.id === 9) ? 1.14 : 1;
      let sw = width * 0.74 * visualScale;
      let sh = sw * aspect;
      const maxH = height * ((c.id === 9) ? 0.90 : 0.82);
      if (sh > maxH) { sh = maxH; sw = sh / aspect; }
      const centerY = height * 0.54;
      const pintado = this.pintarSprite(bmp, c.accentColor);
      ctx.drawImage(pintado || bmp, 0, 0, bmp.width, bmp.height, cx - sw / 2, centerY - sh / 2, sw, sh);
      ctx.restore();
      return;
    }

    // Sombra
    ctx.fillStyle = Cor.css(Cor.argb(0x66, 0, 0, 0));
    this.oval(ctx, cx - carW * 0.55, cy - carH * 0.04, cx + carW * 0.55, cy + carH * 0.10);
    ctx.fill();

    // Rodas
    ctx.fillStyle = Cor.css(Cor.rgb(0x15, 0x15, 0x18));
    retanguloArredondado(ctx, Ret.novo(cx - carW * 0.52, cy - carH * 0.30, cx - carW * 0.30, cy), carW * 0.04);
    ctx.fill();
    retanguloArredondado(ctx, Ret.novo(cx + carW * 0.30, cy - carH * 0.30, cx + carW * 0.52, cy), carW * 0.04);
    ctx.fill();

    // Corpo
    const botW = carW * 0.92;
    const midW = carW * 0.84;
    ctx.beginPath();
    ctx.moveTo(cx - botW / 2, cy - carH * 0.08);
    ctx.lineTo(cx + botW / 2, cy - carH * 0.08);
    ctx.lineTo(cx + midW / 2, top + carH * 0.42);
    ctx.lineTo(cx - midW / 2, top + carH * 0.42);
    ctx.closePath();
    ctx.fillStyle = Cor.css(c.bodyColor);
    ctx.fill();

    // Cabine
    const cabW = carW * 0.58;
    ctx.beginPath();
    ctx.moveTo(cx - cabW / 2, top + carH * 0.42);
    ctx.lineTo(cx + cabW / 2, top + carH * 0.42);
    ctx.lineTo(cx + cabW * 0.40, top);
    ctx.lineTo(cx - cabW * 0.40, top);
    ctx.closePath();
    ctx.fillStyle = Cor.css(this.darken(c.bodyColor, 0.8));
    ctx.fill();

    // Vidro
    ctx.fillStyle = Cor.css(Cor.rgb(0x1A, 0x22, 0x2E));
    retanguloArredondado(ctx, Ret.novo(cx - cabW * 0.34, top + carH * 0.06, cx + cabW * 0.34, top + carH * 0.36), carW * 0.03);
    ctx.fill();

    // Faixa de detalhe
    ctx.fillStyle = Cor.css(c.accentColor);
    ctx.fillRect(cx - midW / 2, top + carH * 0.46, midW, carH * 0.06);

    // Lanternas
    ctx.fillStyle = Cor.css(Cor.rgb(0xB0, 0x20, 0x20));
    retanguloArredondado(ctx, Ret.novo(cx - botW * 0.42, cy - carH * 0.22, cx - botW * 0.24, cy - carH * 0.10), carW * 0.02);
    ctx.fill();
    retanguloArredondado(ctx, Ret.novo(cx + botW * 0.24, cy - carH * 0.22, cx + botW * 0.42, cy - carH * 0.10), carW * 0.02);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Demao de pintura no sprite. Faz o papel do PorterDuffColorFilter SRC_ATOP:
   * desenha o carro numa tela fora do ecra e pinta a cor por cima so onde o
   * carro existe. Devolve null quando nao ha pintura comprada.
   */
  pintarSprite(bmp, cor) {
    if (!this.pintado) return null;
    if (this.telaDePintura && this.pinturaAplicada === cor &&
        this.telaDePintura.width === bmp.width && this.telaDePintura.height === bmp.height) {
      return this.telaDePintura;
    }
    let tela = this.telaDePintura;
    if (!tela) { tela = document.createElement("canvas"); this.telaDePintura = tela; }
    tela.width = bmp.width;
    tela.height = bmp.height;
    const g = tela.getContext("2d");
    g.clearRect(0, 0, tela.width, tela.height);
    g.drawImage(bmp, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = Cor.css(cor, 0x66);
    g.fillRect(0, 0, tela.width, tela.height);
    g.globalCompositeOperation = "source-over";
    this.pinturaAplicada = cor;
    return tela;
  }

  /** drawOval do Android: elipse inscrita no retangulo. */
  oval(ctx, left, top, right, bottom) {
    ctx.beginPath();
    ctx.ellipse((left + right) / 2, (top + bottom) / 2,
      Math.max(0, (right - left) / 2), Math.max(0, (bottom - top) / 2), 0, 0, Math.PI * 2);
  }

  darken(color, factor) {
    const r = limitar(Math.trunc(Cor.red(color) * factor), 0, 255);
    const g = limitar(Math.trunc(Cor.green(color) * factor), 0, 255);
    const b = limitar(Math.trunc(Cor.blue(color) * factor), 0, 255);
    return Cor.rgb(r, g, b);
  }
}

/* ------------------------------------------------------------------ */
/* GarageActivity.kt                                                    */
/* ------------------------------------------------------------------ */

class TelaDaGaragem {

  constructor(app) {
    this.app = app;
    this.save = app.save;
    this.menuSound = app.sound;
    this.index = 0;

    // "Views" do activity_garage.xml. Cada uma guarda o que o Kotlin escrevia
    // no binding: texto, cor, retangulo na tela e se aceita clique.
    this.carPreview = new CarPreviewView();
    this.carName = "Carro";
    this.coinsText = "🪙 0";
    this.upgradeInfo = "Informações";

    this.barSpeed = this.novaBarra();
    this.barAccel = this.novaBarra();
    this.barControl = this.novaBarra();
    this.barTurbo = this.novaBarra();

    // Mesma ordem dos setOnClickListener do onCreate.
    this.btnPrev = {
      ret: Ret.novo(), src: "btn_prev", isEnabled: true, alpha: 1, naLista: false,
      aoClicar: () => {
        this.index = (this.index - 1 + CarCatalog.cars.length) % CarCatalog.cars.length;
        this.updateUi();
      }
    };
    this.btnNext = {
      ret: Ret.novo(), src: "btn_next", isEnabled: true, alpha: 1, naLista: false,
      aoClicar: () => {
        this.index = (this.index + 1) % CarCatalog.cars.length;
        this.updateUi();
      }
    };
    this.btnAction = {
      ret: Ret.novo(), text: "COMPRAR / USAR", fundo: "btn_generic_large",
      isEnabled: true, alpha: 1, naLista: false,
      aoClicar: () => this.onAction()
    };
    this.btnUpgradeSpeed = this.novoBotaoDaLista(() => this.buyUpgrade(SaveManager.UPGRADE_SPEED));
    this.btnUpgradeStability = this.novoBotaoDaLista(() => this.buyUpgrade(SaveManager.UPGRADE_STABILITY));
    this.btnUpgradeTurbo = this.novoBotaoDaLista(() => this.buyUpgrade(SaveManager.UPGRADE_TURBO));
    this.btnUpgradeTank = this.novoBotaoDaLista(() => this.buyUpgrade(SaveManager.UPGRADE_TANK));
    this.btnUpgradeMotor = this.novoBotaoDaLista(() => this.buyUpgrade(SaveManager.UPGRADE_MOTOR));
    this.btnUpgradeTires = this.novoBotaoDaLista(() => this.buyTireGripItem());
    this.btnUpgradeBox = this.novoBotaoDaLista(() => this.buyBoxFreeItem());
    this.btnPaint = this.novoBotaoDaLista(() => this.buyPaint());
    this.btnPitBoostItem = this.novoBotaoDaLista(() => this.buyPitBoostItem());
    this.btnFreezeRivalsItem = this.novoBotaoDaLista(() => this.buyFreezeRivalsItem());
    this.btnGhostModeItem = this.novoBotaoDaLista(() => this.buyGhostModeItem());
    this.btnExplodeRivalsItem = this.novoBotaoDaLista(() => this.buyExplodeRivalsItem());
    this.btnBack = {
      ret: Ret.novo(), src: "btn_back", isEnabled: true, alpha: 1, naLista: false,
      aoClicar: () => this.app.irPara("menu")
    };

    // A ordem visual da lista e a do XML, nao a dos listeners.
    this.upgradesList = [
      this.btnUpgradeSpeed, this.btnUpgradeStability, this.btnUpgradeTurbo,
      this.btnUpgradeTank, this.btnUpgradeMotor, this.btnUpgradeTires,
      this.btnUpgradeBox, this.btnPaint, this.btnPitBoostItem,
      this.btnFreezeRivalsItem, this.btnGhostModeItem, this.btnExplodeRivalsItem
    ];
    this.botoes = [this.btnBack, this.btnPrev, this.btnNext, this.btnAction].concat(this.upgradesList);

    // A lista de upgrades rola dentro do próprio painel.
    // Isso evita que o gesto arraste a garagem inteira ao tentar ver o último item.
    this.upgradesListScroll = 0;
    this.upgradesListMax = 0;
    this.upgradesListRet = Ret.novo();
    this.arrastandoLista = false;

    // Estado do ponteiro (o Android resolvia sozinho com o onClick).
    this.pressionado = null;
    this.arrastou = false;
    this.ponteiroX = 0;
    this.ponteiroY = 0;
    this.ponteiroInicialX = 0;
    this.ponteiroInicialY = 0;

    // Faixa que substitui o Toast.
    this.toastTexto = "";
    this.toastTempo = 0;

    // Medidas: refeitas quando a tela muda de tamanho.
    this.larguraMedida = 0;
    this.alturaMedida = 0;
    this.esc = 1;
  }

  novaBarra() {
    return { ret: Ret.novo(), max: 15, progress: 0, color: Cor.WHITE };
  }

  novoBotaoDaLista(aoClicar) {
    return {
      ret: Ret.novo(), naLista: true, aoClicar: aoClicar,
      titleText: "", compactSubtitle: "", priceText: "",
      color: Cor.rgb(0x45, 0x5A, 0x64), isEnabled: false, alpha: 1
    };
  }

  // ---------------------------------------------------------
  // Ciclo de vida (onCreate / onResume / onDestroy)
  // ---------------------------------------------------------

  entrar(parametros) {
    this.index = limitar(this.save.selectedCarId, 0, CarCatalog.cars.length - 1);
    this.upgradesListScroll = 0;
    this.toastTempo = 0;
    this.updateUi();
    // onResume: a musica do menu continua tocando entre as telas.
    this.menuSound.startMusic("menu_music");
  }

  sair() {
    // onDestroy do Kotlin: solta o motor mas deixa a musica do menu tocando.
    this.menuSound.releaseKeepMusic();
  }

  update(dt) {
    if (this.toastTempo > 0) this.toastTempo = Math.max(0, this.toastTempo - dt);
  }

  /** Toast.makeText(...).show(): faixa curta no rodape (LENGTH_SHORT = 2s). */
  mostrarToast(texto) {
    this.toastTexto = texto;
    this.toastTempo = 2.0;
  }

  // ---------------------------------------------------------
  // Acoes
  // ---------------------------------------------------------

  onAction() {
    const car = CarCatalog.cars[this.index];
    if (!this.save.isCarUnlocked(car.id)) {
      // Tenta comprar.
      if (this.save.spendCoins(car.price)) {
        this.save.unlockCar(car.id);
        this.save.selectedCarId = car.id;
        this.mostrarToast(car.name + " desbloqueado!");
      } else {
        this.mostrarToast("Moedas insuficientes");
      }
    } else {
      // Já é seu: seleciona.
      this.save.selectedCarId = car.id;
      this.mostrarToast(car.name + " selecionado");
    }
    this.updateUi();
  }

  buyUpgrade(type) {
    const car = CarCatalog.cars[this.index];
    if (!this.save.isCarUnlocked(car.id)) {
      this.mostrarToast("Compre este carro primeiro");
      return;
    }
    const label = this.upgradeLabel(type);
    const level = this.save.getUpgradeLevel(car.id, type);
    if (level >= SaveManager.UPGRADE_MAX_LEVEL) {
      this.mostrarToast(label + " já está no máximo");
      return;
    }
    const cost = this.save.getUpgradeCost(car.id, type);
    if (this.save.buyUpgrade(car.id, type)) {
      this.mostrarToast(label + " melhorado para Nv." + (level + 1));
    } else {
      this.mostrarToast("Moedas insuficientes: precisa de " + cost);
    }
    this.updateUi();
  }

  buyPaint() {
    const car = CarCatalog.cars[this.index];
    if (!this.save.isCarUnlocked(car.id)) {
      this.mostrarToast("Compre este carro primeiro");
      return;
    }
    const cost = this.save.getPaintCost(car.id);
    if (this.save.buyNextPaint(car.id)) {
      this.mostrarToast("Cor alterada: " + this.save.getPaintName(car.id));
    } else {
      this.mostrarToast("Moedas insuficientes: precisa de " + cost);
    }
    this.updateUi();
  }

  buyPitBoostItem() {
    const cost = this.save.pitBoostItemCost;
    if (this.save.buyPitBoostItem()) {
      this.mostrarToast("Tanque Extra comprado! Vai aparecer como botão GAS+ na corrida.");
    } else {
      this.mostrarToast("Moedas insuficientes: precisa de " + cost);
    }
    this.updateUi();
  }

  buyTireGripItem() {
    const cost = this.save.tireGripItemCost;
    if (this.save.buyTireGripItem()) {
      this.mostrarToast("Pneus Pro comprados! Válido para 1 corrida.");
    } else {
      this.mostrarToast("Moedas insuficientes: precisa de " + cost);
    }
    this.updateUi();
  }

  buyBoxFreeItem() {
    const cost = this.save.boxFreeItemCost;
    if (this.save.buyBoxFreeItem()) {
      this.mostrarToast("Box Livre comprado! Válido para 1 corrida.");
    } else {
      this.mostrarToast("Moedas insuficientes: precisa de " + cost);
    }
    this.updateUi();
  }

  buyFreezeRivalsItem() {
    const cost = this.save.freezeRivalsItemCost;
    if (this.save.buyFreezeRivalsItem()) {
      this.mostrarToast("Congelar Rivais comprado! Vai aparecer como botão GELO na corrida.");
    } else {
      this.mostrarToast("Moedas insuficientes: precisa de " + cost);
    }
    this.updateUi();
  }

  buyGhostModeItem() {
    const cost = this.save.ghostModeItemCost;
    if (this.save.buyGhostModeItem()) {
      this.mostrarToast("Fantasma comprado! Invisível e invencível por 10 segundos.");
    } else {
      this.mostrarToast("Moedas insuficientes: precisa de " + cost);
    }
    this.updateUi();
  }

  buyExplodeRivalsItem() {
    const cost = this.save.explodeRivalsItemCost;
    if (this.save.buyExplodeRivalsItem()) {
      this.mostrarToast("Explodir Rivais comprado! Para os carros por 5 segundos.");
    } else {
      this.mostrarToast("Moedas insuficientes: precisa de " + cost);
    }
    this.updateUi();
  }

  // ---------------------------------------------------------
  // Estado da tela
  // ---------------------------------------------------------

  updateUi() {
    const car = CarCatalog.cars[this.index];
    const unlocked = this.save.isCarUnlocked(car.id);
    const selected = this.save.selectedCarId === car.id;
    const speedLv = this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_SPEED);
    const stabilityLv = this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_STABILITY);
    const turboLv = this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_TURBO);
    const tankLv = this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_TANK);
    const motorLv = this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_MOTOR);
    const previewCar = Object.assign({}, car, { accentColor: this.save.getPaintColor(car.id, car.accentColor) });

    this.carPreview.setCar(previewCar, this.save.getPaintIndex(car.id) !== 0);
    this.carName = car.name;
    this.coinsText = "🪙 " + this.save.coins;

    this.setBar(this.barSpeed, car.speed + speedLv + motorLv, Cor.rgb(0xF5, 0x00, 0x90));
    this.setBar(this.barAccel, car.accel + motorLv, Cor.rgb(0xFF, 0xC1, 0x07));
    this.setBar(this.barControl, car.control + stabilityLv, Cor.rgb(0x4D, 0xC8, 0xFF));
    this.setBar(this.barTurbo, car.turbo + turboLv, Cor.rgb(0x00, 0xF5, 0xD4));

    const cap = this.garageSpeedCapKmh(car.id);
    const currentMax = this.currentGarageSpeedKmh(car.id, speedLv, motorLv);
    const gears = limitar(4 + motorLv, 4, 8);
    // Mesma informação do app, escrita mais curta: a coluna do meio é estreita
    // e as frases longas do Android quebravam em sete linhas, empurrando metade
    // do texto para fora da caixa.
    this.upgradeInfo = unlocked
      ? ("Vel " + speedLv + " · Motor " + motorLv + " · " + gears + " marchas" +
         "\nMáx " + currentMax + " km/h (teto " + cap + ")" +
         "\nTanque +" + (tankLv * 10) + "% · Turbo " + (3.0 + turboLv * 0.6).toFixed(1) + "s" +
         "\nGAS+ " + this.save.pitBoostItems + " · GELO " + this.save.freezeRivalsItems +
         " · " + this.save.getPaintName(car.id))
      : ("Compre este carro para liberar upgrades. Todos começam em 320 km/h e evoluem até " + cap + " km/h.");

    this.configureUpgradeButton(this.btnUpgradeSpeed, "Velocidade", SaveManager.UPGRADE_SPEED, unlocked);
    this.configureUpgradeButton(this.btnUpgradeStability, "Controle", SaveManager.UPGRADE_STABILITY, unlocked);
    this.configureUpgradeButton(this.btnUpgradeTurbo, "Turbo", SaveManager.UPGRADE_TURBO, unlocked);
    this.configureUpgradeButton(this.btnUpgradeTank, "Tanque", SaveManager.UPGRADE_TANK, unlocked);
    this.configureUpgradeButton(this.btnUpgradeMotor, "Motor", SaveManager.UPGRADE_MOTOR, unlocked);
    this.configureStoreButton(
      this.btnUpgradeTires,
      "Pneus Pro",
      "x" + this.save.tireGripItems + " 1 corrida",
      this.save.tireGripItemCost,
      Cor.rgb(0x21, 0x21, 0x21),
      unlocked
    );
    this.configureStoreButton(
      this.btnUpgradeBox,
      "Box Livre",
      "x" + this.save.boxFreeItems + " 1 corrida",
      this.save.boxFreeItemCost,
      Cor.rgb(0x00, 0x96, 0x88),
      unlocked
    );
    this.configureStoreButton(
      this.btnPaint,
      "Pintura",
      "Cor " + this.save.getPaintName(car.id),
      this.save.getPaintCost(car.id),
      Cor.rgb(0x3F, 0x51, 0xB5),
      unlocked
    );
    this.configureStoreButton(
      this.btnPitBoostItem,
      "GAS+",
      "x" + this.save.pitBoostItems + " tanque",
      this.save.pitBoostItemCost,
      Cor.rgb(0xEF, 0x6C, 0x00),
      unlocked
    );
    this.configureStoreButton(
      this.btnFreezeRivalsItem,
      "GELO",
      "x" + this.save.freezeRivalsItems + " congela 6s",
      this.save.freezeRivalsItemCost,
      Cor.rgb(0x00, 0x96, 0x88),
      unlocked
    );
    this.configureStoreButton(
      this.btnGhostModeItem,
      "FANTASMA",
      "x" + this.save.ghostModeItems + " invencível 10s",
      this.save.ghostModeItemCost,
      Cor.rgb(0x7E, 0x57, 0xC2),
      unlocked
    );
    this.configureStoreButton(
      this.btnExplodeRivalsItem,
      "BOMBA",
      "x" + this.save.explodeRivalsItems + " para 5s",
      this.save.explodeRivalsItemCost,
      Cor.rgb(0xD5, 0x00, 0x00),
      unlocked
    );

    this.btnAction.text = !unlocked
      ? ("COMPRAR • " + car.price + " moedas")
      : (selected ? "SELECIONADO ✓" : "USAR ESTE CARRO");
    this.btnAction.fundo = selected ? "btn_generic_secondary" : "btn_generic_large";
    this.btnAction.isEnabled = !selected;
    this.btnAction.alpha = this.btnAction.isEnabled ? 1 : 0.88;
  }

  garageSpeedCapKmh(carId) {
    switch (carId) {
      case 0: return 400;
      case 1: return 500;
      case 2: return 600;
      case 3: return 700;
      case 4: return 800;
      case 5: return 900;
      case 6: return 1000;
      case 7: return 1100;
      case 8: return 1200;
      default: return 1500;
    }
  }

  currentGarageSpeedKmh(carId, speedLv, motorLv) {
    const cap = this.garageSpeedCapKmh(carId);
    const progress = limitar((speedLv + motorLv) / 10, 0, 1);
    return limitar(Math.trunc(320 + (cap - 320) * progress), 320, cap);
  }

  setBar(bar, value, color) {
    bar.max = 15;
    bar.progress = limitar(value, 0, 15);
    bar.color = color;
  }

  configureUpgradeButton(button, title, type, unlocked) {
    const car = CarCatalog.cars[this.index];
    const level = this.save.getUpgradeLevel(car.id, type);
    const max = this.save.getUpgradeMaxLevel(type);
    const canBuy = unlocked && level < max;
    let subtitle;
    if (type === SaveManager.UPGRADE_TIRES && level >= max) subtitle = "sem deslizar • MAX";
    else if (type === SaveManager.UPGRADE_TIRES) subtitle = "evita água/óleo";
    else if (type === SaveManager.UPGRADE_BOX && level >= max) subtitle = "box sem frear • MAX";
    else if (type === SaveManager.UPGRADE_BOX) subtitle = "passa no box livre";
    else if (level >= max) subtitle = "Nv." + level + "/" + max + " • MAX";
    else subtitle = "Nv." + level + "/" + max;
    const price = (level >= max) ? null : this.save.getUpgradeCost(car.id, type);
    this.configureGarageButton(
      button,
      title,
      subtitle,
      price,
      this.upgradeColor(type),
      canBuy
    );
  }

  configureStoreButton(button, title, subtitle, price, color, unlocked) {
    this.configureGarageButton(
      button,
      title,
      subtitle,
      price,
      color,
      unlocked
    );
  }

  configureGarageButton(button, title, subtitle, price, color, enabled) {
    const titleText = title.toUpperCase();
    const compactSubtitle = subtitle
      .replace("Velocidade", "Vel")
      .replace("Controle", "Ctrl")
      .replace("Estabilidade", "Ctrl")
      .replace("Congela", "Gelo");
    const priceText = (price !== null && price !== undefined) ? ("  •  " + price + " 🪙") : "";
    // O SpannableString do Kotlin virou tres pedacos desenhados a mao: o titulo
    // em negrito 1.08x, o subtitulo normal e o preco em amarelo (0xFFF176).
    button.titleText = titleText;
    button.compactSubtitle = compactSubtitle;
    button.priceText = priceText;
    button.color = color;
    button.isEnabled = enabled;
    button.alpha = enabled ? 1 : 0.42;
  }

  upgradeColor(type) {
    switch (type) {
      case SaveManager.UPGRADE_SPEED: return Cor.rgb(0xD8, 0x1B, 0x60);
      case SaveManager.UPGRADE_STABILITY: return Cor.rgb(0x02, 0x88, 0xD1);
      case SaveManager.UPGRADE_TURBO: return Cor.rgb(0x8E, 0x24, 0xAA);
      case SaveManager.UPGRADE_TANK: return Cor.rgb(0x2E, 0x7D, 0x32);
      case SaveManager.UPGRADE_MOTOR: return Cor.rgb(0xEF, 0x6C, 0x00);
      case SaveManager.UPGRADE_TIRES: return Cor.rgb(0x21, 0x21, 0x21);
      case SaveManager.UPGRADE_BOX: return Cor.rgb(0x00, 0x96, 0x88);
      default: return Cor.rgb(0x45, 0x5A, 0x64);
    }
  }

  upgradeLabel(type) {
    switch (type) {
      case SaveManager.UPGRADE_SPEED: return "Velocidade";
      case SaveManager.UPGRADE_STABILITY: return "Estabilidade";
      case SaveManager.UPGRADE_TURBO: return "Turbo";
      case SaveManager.UPGRADE_TANK: return "Tanque";
      case SaveManager.UPGRADE_MOTOR: return "Motor";
      case SaveManager.UPGRADE_TIRES: return "Pneus Pro";
      case SaveManager.UPGRADE_BOX: return "Box Livre";
      default: return "Melhoria";
    }
  }

  // ---------------------------------------------------------
  // Medidas: o que o activity_garage.xml resolvia sozinho
  // ---------------------------------------------------------

  /**
   * Refaz os retangulos de tudo. Os numeros sao os mesmos dp do XML; o "dp"
   * daqui e a altura da tela dividida por 360, que e a altura util de um
   * celular deitado — assim o desenho fica com as proporcoes do app.
   */
  medir(largura, altura) {
    if (this.larguraMedida === largura && this.alturaMedida === altura) return;
    this.larguraMedida = largura;
    this.alturaMedida = altura;
    const esc = altura / 360;
    this.esc = esc;
    const dp = (v) => v * esc;

    const padStart = dp(16), padEnd = dp(16), padTop = dp(10), padBottom = dp(12);

    // ---- Cabecalho: btnBack (120x58) + titulo + moedas (120) ----
    const headerTop = padTop;
    const headerH = dp(58);
    Ret.definir(this.btnBack.ret, padStart, headerTop, padStart + dp(120), headerTop + headerH);
    const moedasH = dp(16 * 1.35 + 14); // texto 16sp + padding 7dp em cima e embaixo
    this.coinsRet = Ret.novo(
      largura - padEnd - dp(120),
      headerTop + (headerH - moedasH) / 2,
      largura - padEnd,
      headerTop + (headerH + moedasH) / 2
    );
    this.tituloRet = Ret.novo(this.btnBack.ret.right, headerTop, this.coinsRet.left, headerTop + headerH);

    // ---- Linha dos tres paineis (pesos 1.12 / 0.92 / 1.15) ----
    const linhaTop = headerTop + headerH + dp(8);
    const linhaBottom = altura - padBottom;
    const margens = dp(8) + dp(4) + dp(8) + dp(4);
    const disponivel = largura - padStart - padEnd - margens;
    const w1 = disponivel * (1.12 / 3.19);
    const w2 = disponivel * (0.92 / 3.19);
    const w3 = disponivel * (1.15 / 3.19);

    let x = padStart;
    this.painel1 = Ret.novo(x, linhaTop, x + w1, linhaBottom);
    x += w1 + dp(8) + dp(4);
    this.painel2 = Ret.novo(x, linhaTop, x + w2, linhaBottom);
    x += w2 + dp(8) + dp(4);
    this.painel3 = Ret.novo(x, linhaTop, x + w3, linhaBottom);

    // ---- Painel 1: preview + ◀ nome ▶ (padding 10dp) ----
    const p1l = this.painel1.left + dp(10), p1r = this.painel1.right - dp(10);
    const p1t = this.painel1.top + dp(10), p1b = this.painel1.bottom - dp(10);
    const linhaNavH = dp(46);
    this.previewRet = Ret.novo(p1l, p1t, p1r, p1b - linhaNavH - dp(6));
    // As setas tinham 94dp fixos. Nesta coluna, que é estreita, as duas
    // sozinhas comiam a linha inteira e o nome do carro ficava com largura
    // NEGATIVA — por isso ele aparecia por cima das setas. Agora cada seta pega
    // no máximo 28% da linha, e o nome sempre fica com o meio sobrando.
    const larguraDaLinha = p1r - p1l;
    const larguraDaSeta = Math.min(dp(94), larguraDaLinha * 0.28);
    Ret.definir(this.btnPrev.ret, p1l, p1b - linhaNavH, p1l + larguraDaSeta, p1b);
    Ret.definir(this.btnNext.ret, p1r - larguraDaSeta, p1b - linhaNavH, p1r, p1b);
    this.carNameRet = Ret.novo(this.btnPrev.ret.right + dp(6), p1b - linhaNavH, this.btnNext.ret.left - dp(6), p1b);

    // ---- Painel 2: atributos, informacoes e botao de acao (padding 12dp) ----
    const p2l = this.painel2.left + dp(12), p2r = this.painel2.right - dp(12);
    let y = this.painel2.top + dp(12);
    this.atributosTituloY = y + dp(15);
    y += dp(15 * 1.25) + dp(6);
    const barras = [this.barSpeed, this.barAccel, this.barControl, this.barTurbo];
    this.rotulosY = [];
    // Rótulo e barra ficaram um tico mais baixos que no XML (15/14dp → 13/12dp)
    // e o botão de ação encolheu de 54 para 46dp. Isso libera cerca de 25dp para
    // a caixa de informações, que antes só comportava uma linha e escondia a
    // velocidade máxima e os itens comprados.
    for (let i = 0; i < barras.length; i++) {
      this.rotulosY.push(y + dp(11));
      y += dp(13);
      Ret.definir(barras[i].ret, p2l, y, p2r, y + dp(12));
      y += dp(12) + (i === barras.length - 1 ? dp(6) : dp(4));
    }
    Ret.definir(this.btnAction.ret, p2l, this.painel2.bottom - dp(10) - dp(46), p2r, this.painel2.bottom - dp(10));
    this.infoRet = Ret.novo(p2l, y, p2r, this.btnAction.ret.top - dp(6));

    // ---- Painel 3: titulo + lista rolante (padding 12dp) ----
    const p3l = this.painel3.left + dp(12), p3r = this.painel3.right - dp(12);
    let y3 = this.painel3.top + dp(12);
    this.melhoriasTituloY = y3 + dp(14);
    y3 += dp(14 * 1.25) + dp(6);
    Ret.definir(this.upgradesListRet, p3l, y3, p3r - dp(5), this.painel3.bottom - dp(12));
    this.itemAltura = dp(52);
    this.itemEspaco = dp(5);
    const conteudo = this.upgradesList.length * this.itemAltura + (this.upgradesList.length - 1) * this.itemEspaco;
    this.upgradesListMax = Math.max(0, conteudo - Ret.altura(this.upgradesListRet));
    this.upgradesListScroll = limitar(this.upgradesListScroll, 0, this.upgradesListMax);
    this.posicionarLista();
  }

  /** Coloca cada botao da lista no lugar, ja descontando a rolagem. */
  posicionarLista() {
    let y = this.upgradesListRet.top - this.upgradesListScroll;
    for (const botao of this.upgradesList) {
      Ret.definir(botao.ret, this.upgradesListRet.left, y, this.upgradesListRet.right, y + this.itemAltura);
      y += this.itemAltura + this.itemEspaco;
    }
  }

  // ---------------------------------------------------------
  // Toque
  // ---------------------------------------------------------

  aoApontar(tipo, x, y) {
    this.medir(this.app.largura, this.app.altura);

    if (tipo === "baixo") {
      this.ponteiroX = x;
      this.ponteiroY = y;
      this.ponteiroInicialX = x;
      this.ponteiroInicialY = y;
      this.arrastou = false;
      this.pressionado = this.botaoEm(x, y);
      this.arrastandoLista = Ret.contem(this.upgradesListRet, x, y) && this.upgradesListMax > 0;
      return;
    }

    if (tipo === "mover" || tipo === "move") {
      if (this.arrastandoLista) {
        const dy = y - this.ponteiroY;
        this.upgradesListScroll = limitar(this.upgradesListScroll - dy, 0, this.upgradesListMax);
        this.posicionarLista();
      }
      this.ponteiroX = x;
      this.ponteiroY = y;
      if (Math.abs(x - this.ponteiroInicialX) > this.esc * 8 || Math.abs(y - this.ponteiroInicialY) > this.esc * 8) {
        this.arrastou = true;
        this.pressionado = null;
      }
      return;
    }

    if (tipo === "cima") {
      const alvo = this.botaoEm(x, y);
      if (!this.arrastou && alvo && alvo === this.pressionado && alvo.isEnabled !== false) {
        this.menuSound.playClick();
        alvo.aoClicar();
      }
      this.pressionado = null;
      this.arrastandoLista = false;
      return;
    }

    // "cancelar" e qualquer outro tipo: solta tudo sem disparar clique.
    this.pressionado = null;
    this.arrastandoLista = false;
  }

  /** Roda do mouse/trackpad sobre a lista de melhorias. */
  aoGirarRoda(delta, x, y) {
    this.medir(this.app.largura, this.app.altura);
    if (x !== undefined && y !== undefined && !Ret.contem(this.upgradesListRet, x, y)) return;
    this.upgradesListScroll = limitar(this.upgradesListScroll + delta, 0, this.upgradesListMax);
    this.posicionarLista();
  }

  botaoEm(x, y) {
    for (const botao of this.botoes) {
      // Item da lista so conta se o toque estiver dentro da area que rola.
      if (botao.naLista && !Ret.contem(this.upgradesListRet, x, y)) continue;
      if (Ret.contem(botao.ret, x, y)) return botao;
    }
    return null;
  }

  // ---------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------

  render(ctx, largura, altura) {
    this.medir(largura, altura);
    const dp = (v) => v * this.esc;

    // @color/bg_dark
    ctx.fillStyle = Cor.css(GARAGEM_BG_DARK);
    ctx.fillRect(0, 0, largura, altura);

    // ---- Cabecalho ----
    this.desenharImagemAjustada(ctx, Assets.img(this.btnBack.src), this.btnBack.ret, this.pressionado === this.btnBack);
    if (!Assets.img(this.btnBack.src)) this.desenharBotaoDeReserva(ctx, this.btnBack.ret, "VOLTAR");

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + dp(24) + "px " + FONTE;
    if ("letterSpacing" in ctx) ctx.letterSpacing = dp(2.4) + "px"; // letterSpacing 0.10 de 24sp
    ctx.fillStyle = Cor.css(GARAGEM_NEON_CYAN);
    ctx.fillText("GARAGEM", Ret.centroX(this.tituloRet), Ret.centroY(this.tituloRet));
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.restore();

    // Moedas com o fundo panel_glass_pink.
    this.desenharPainel(ctx, this.coinsRet, GARAGEM_PANEL_PINK_INICIO, GARAGEM_PANEL_PINK_FIM, GARAGEM_PANEL_PINK_BORDA, false);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + dp(16) + "px " + FONTE;
    ctx.fillStyle = Cor.css(GARAGEM_AMBER);
    ctx.fillText(this.coinsText, Ret.centroX(this.coinsRet), Ret.centroY(this.coinsRet));
    ctx.restore();

    // ---- Painel 1: o carro ----
    this.desenharPainel(ctx, this.painel1, GARAGEM_PANEL_NEON_INICIO, GARAGEM_PANEL_NEON_FIM, GARAGEM_PANEL_NEON_BORDA, true, GARAGEM_PANEL_NEON_MEIO);
    this.carPreview.onDraw(ctx, this.previewRet);

    this.desenharImagemAjustada(ctx, Assets.img(this.btnPrev.src), this.btnPrev.ret, this.pressionado === this.btnPrev);
    if (!Assets.img(this.btnPrev.src)) this.desenharBotaoDeReserva(ctx, this.btnPrev.ret, "◀");
    this.desenharImagemAjustada(ctx, Assets.img(this.btnNext.src), this.btnNext.ret, this.pressionado === this.btnNext);
    if (!Assets.img(this.btnNext.src)) this.desenharBotaoDeReserva(ctx, this.btnNext.ret, "▶");

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = Cor.css(Cor.WHITE);
    // O espaco entre as duas setas e estreito, e nome comprido ("Clássico
    // Vermelho") passava por cima delas. No Android o TextView encolhia
    // sozinho (autoSizeTextType); aqui a conta e nossa.
    let tamanhoDoNome = dp(18);
    const espacoDoNome = Ret.largura(this.carNameRet);
    ctx.font = "bold " + tamanhoDoNome + "px " + FONTE;
    while (tamanhoDoNome > dp(10) && ctx.measureText(this.carName).width > espacoDoNome) {
      tamanhoDoNome -= dp(0.5);
      ctx.font = "bold " + tamanhoDoNome + "px " + FONTE;
    }
    ctx.fillText(this.carName, Ret.centroX(this.carNameRet), Ret.centroY(this.carNameRet));
    ctx.restore();

    // ---- Painel 2: atributos ----
    this.desenharPainel(ctx, this.painel2, GARAGEM_PANEL_GLASS_INICIO, GARAGEM_PANEL_GLASS_FIM, GARAGEM_PANEL_GLASS_BORDA, false);
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "bold " + dp(15) + "px " + FONTE;
    ctx.fillStyle = Cor.css(GARAGEM_NEON_CYAN);
    ctx.fillText("ATRIBUTOS", this.painel2.left + dp(12), this.atributosTituloY);

    const rotulos = ["Velocidade", "Aceleração", "Controle", "Turbo"];
    const barras = [this.barSpeed, this.barAccel, this.barControl, this.barTurbo];
    ctx.font = dp(12) + "px " + FONTE;
    for (let i = 0; i < barras.length; i++) {
      ctx.fillStyle = Cor.css(Cor.WHITE);
      ctx.fillText(rotulos[i], this.painel2.left + dp(12), this.rotulosY[i]);
      this.desenharBarra(ctx, barras[i]);
    }
    ctx.restore();

    this.desenharInfo(ctx, this.upgradeInfo, this.infoRet, dp(12));

    // Botao de acao: bitmap de fundo (btn_generic_large / _secondary) + texto.
    ctx.save();
    ctx.globalAlpha = this.btnAction.alpha * (this.pressionado === this.btnAction ? 0.85 : 1);
    const fundoAcao = Assets.img(this.btnAction.fundo);
    if (fundoAcao && fundoAcao.width > 0) {
      ctx.drawImage(fundoAcao, this.btnAction.ret.left, this.btnAction.ret.top,
        Ret.largura(this.btnAction.ret), Ret.altura(this.btnAction.ret));
    } else {
      this.desenharBotaoDeReserva(ctx, this.btnAction.ret, "");
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + dp(14) + "px " + FONTE;
    ctx.shadowColor = Cor.css(Cor.BLACK);
    ctx.shadowBlur = dp(2.8);
    ctx.shadowOffsetY = dp(1.3);
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(this.btnAction.text, Ret.centroX(this.btnAction.ret), Ret.centroY(this.btnAction.ret));
    ctx.restore();

    // ---- Painel 3: melhorias e itens ----
    this.desenharPainel(ctx, this.painel3, GARAGEM_PANEL_PINK_INICIO, GARAGEM_PANEL_PINK_FIM, GARAGEM_PANEL_PINK_BORDA, false);
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "bold " + dp(14) + "px " + FONTE;
    ctx.fillStyle = Cor.css(GARAGEM_NEON_MAGENTA);
    ctx.fillText("MELHORIAS E ITENS", this.painel3.left + dp(12), this.melhoriasTituloY);
    ctx.restore();

    // A lista rola dentro do proprio painel: recorta antes de desenhar.
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.upgradesListRet.left, this.upgradesListRet.top,
      Ret.largura(this.upgradesListRet), Ret.altura(this.upgradesListRet));
    ctx.clip();
    for (const botao of this.upgradesList) {
      if (botao.ret.bottom < this.upgradesListRet.top || botao.ret.top > this.upgradesListRet.bottom) continue;
      this.desenharBotaoDaGaragem(ctx, botao);
    }
    ctx.restore();
    this.desenharBarraDeRolagem(ctx);

    // ---- Toast ----
    this.desenharToast(ctx, largura, altura);
  }

  /** Fundo dos paineis (panel_glass, panel_glass_pink, panel_garage_neon). */
  desenharPainel(ctx, ret, inicio, fim, borda, horizontal, meio) {
    const raio = this.esc * 22;
    let grad;
    if (horizontal) {
      grad = ctx.createLinearGradient(ret.left, ret.top, ret.right, ret.top);
    } else {
      grad = ctx.createLinearGradient(ret.left, ret.top, ret.left, ret.bottom);
    }
    grad.addColorStop(0, Cor.css(inicio));
    if (meio !== undefined) grad.addColorStop(0.5, Cor.css(meio));
    grad.addColorStop(1, Cor.css(fim));
    retanguloArredondado(ctx, ret, raio);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = Cor.css(borda);
    ctx.lineWidth = this.esc * 1.5;
    ctx.stroke();
  }

  /** ProgressBar horizontal: trilho escuro + preenchimento tingido. */
  desenharBarra(ctx, bar) {
    const r = bar.ret;
    ctx.fillStyle = Cor.css(Cor.argb(0x66, 0x1A, 0x14, 0x38));
    retanguloArredondado(ctx, r, this.esc * 3);
    ctx.fill();
    const fracao = bar.max <= 0 ? 0 : limitar(bar.progress / bar.max, 0, 1);
    if (fracao > 0) {
      const cheio = Ret.novo(r.left, r.top, r.left + Ret.largura(r) * fracao, r.bottom);
      ctx.fillStyle = Cor.css(bar.color);
      retanguloArredondado(ctx, cheio, this.esc * 3);
      ctx.fill();
    }
    ctx.strokeStyle = Cor.css(Cor.argb(0x55, 0xFF, 0xFF, 0xFF));
    ctx.lineWidth = this.esc;
    retanguloArredondado(ctx, r, this.esc * 3);
    ctx.stroke();
  }

  /** upgradeInfo: TextView de no maximo 6 linhas, com quebra automatica. */
  desenharInfo(ctx, texto, ret, tamanho) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = Cor.css(GARAGEM_TEXT_DIM);

    const largura = Ret.largura(ret);

    /** Quebra o texto na largura da caixa, no tamanho de fonte pedido. */
    const quebrar = (tam) => {
      ctx.font = tam + "px " + FONTE;
      const linhas = [];
      for (const bruto of texto.split("\n")) {
        let atual = "";
        for (const palavra of bruto.split(" ")) {
          const tentativa = atual.length === 0 ? palavra : atual + " " + palavra;
          if (ctx.measureText(tentativa).width > largura && atual.length > 0) {
            linhas.push(atual);
            atual = palavra;
          } else {
            atual = tentativa;
          }
        }
        linhas.push(atual);
      }
      return linhas;
    };

    // O XML tinha maxLines="6", mas em tela baixa nem seis linhas cabem e o
    // texto escorria por cima do botao "USAR ESTE CARRO". Em vez de cortar
    // informacao (velocidade maxima, marchas, itens comprados), encolhemos a
    // fonte ate tudo caber — so cortamos se nem no menor tamanho couber.
    let tam = tamanho;
    let linhas = quebrar(tam);
    const minimo = tamanho * 0.66;
    while (tam > minimo && linhas.length * tam * 1.28 > Ret.altura(ret)) {
      tam -= Math.max(0.5, tamanho * 0.06);
      linhas = quebrar(tam);
    }

    const alturaLinha = tam * 1.28;
    const cabem = Math.max(1, Math.floor(Ret.altura(ret) / alturaLinha));
    let y = ret.top + tam;
    for (let i = 0; i < linhas.length && i < cabem; i++) {
      ctx.fillText(linhas[i], ret.left, y);
      y += alturaLinha;
    }
    ctx.restore();
  }

  /**
   * btn_garage_rect com backgroundTint: no Android o tint pintava a forma
   * inteira com a cor do item, entao aqui o retangulo e preenchido com ela.
   * Pressionado vira o gradiente ciano→rosa; desabilitado, o cinza do seletor.
   */
  desenharBotaoDaGaragem(ctx, botao) {
    const dp = (v) => v * this.esc;
    const r = botao.ret;
    const raio = dp(10);
    const pressionado = (this.pressionado === botao) && botao.isEnabled;

    ctx.save();
    ctx.globalAlpha = botao.alpha;
    retanguloArredondado(ctx, r, raio);
    if (!botao.isEnabled) {
      ctx.fillStyle = Cor.css(GARAGEM_BOTAO_DESAB_FUNDO);
      ctx.fill();
      ctx.strokeStyle = Cor.css(GARAGEM_BOTAO_DESAB_BORDA);
      ctx.lineWidth = dp(1);
    } else if (pressionado) {
      const grad = ctx.createLinearGradient(r.left, r.top, r.right, r.top);
      grad.addColorStop(0, Cor.css(GARAGEM_BOTAO_PRESS_INICIO));
      grad.addColorStop(1, Cor.css(GARAGEM_BOTAO_PRESS_FIM));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = Cor.css(Cor.WHITE);
      ctx.lineWidth = dp(1.7);
    } else {
      ctx.fillStyle = Cor.css(botao.color);
      ctx.fill();
      ctx.strokeStyle = Cor.css(GARAGEM_BOTAO_BORDA);
      ctx.lineWidth = dp(1.4);
    }
    ctx.stroke();

    // Duas linhas centralizadas: textSize 10.2sp, titulo 1.08x, preco 1.02x.
    const base = dp(10.2);
    const alturaLinha = base * 1.22;
    const cy = Ret.centroY(r);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = Cor.css(Cor.BLACK);
    ctx.shadowBlur = dp(2.8);
    ctx.shadowOffsetY = dp(1.3);

    ctx.font = "bold " + (base * 1.08) + "px " + FONTE;
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(botao.titleText, Ret.centroX(r), cy - alturaLinha / 2);

    // Subtitulo em branco e preco em amarelo, lado a lado e centralizados.
    ctx.textAlign = "left";
    ctx.font = base + "px " + FONTE;
    const larguraSub = ctx.measureText(botao.compactSubtitle).width;
    ctx.font = "bold " + (base * 1.02) + "px " + FONTE;
    const larguraPreco = botao.priceText ? ctx.measureText(botao.priceText).width : 0;
    let x = Ret.centroX(r) - (larguraSub + larguraPreco) / 2;
    ctx.font = base + "px " + FONTE;
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(botao.compactSubtitle, x, cy + alturaLinha / 2);
    if (botao.priceText) {
      x += larguraSub;
      ctx.font = "bold " + (base * 1.02) + "px " + FONTE;
      ctx.fillStyle = Cor.css(GARAGEM_BOTAO_PRECO);
      ctx.fillText(botao.priceText, x, cy + alturaLinha / 2);
    }
    ctx.restore();
  }

  /** scrollbarStyle="insideInset": um traco fino mostrando onde a lista esta. */
  desenharBarraDeRolagem(ctx) {
    if (this.upgradesListMax <= 0) return;
    const alturaVisivel = Ret.altura(this.upgradesListRet);
    const conteudo = alturaVisivel + this.upgradesListMax;
    const alturaMarca = Math.max(this.esc * 18, alturaVisivel * (alturaVisivel / conteudo));
    const t = this.upgradesListScroll / this.upgradesListMax;
    const topo = this.upgradesListRet.top + (alturaVisivel - alturaMarca) * t;
    const x = this.upgradesListRet.right + this.esc * 2;
    ctx.fillStyle = Cor.css(Cor.argb(0x88, 0xFF, 0x2D, 0xAA));
    retanguloArredondado(ctx, Ret.novo(x, topo, x + this.esc * 3, topo + alturaMarca), this.esc * 1.5);
    ctx.fill();
  }

  /** ImageButton com scaleType="fitCenter": mantem a proporcao da imagem. */
  desenharImagemAjustada(ctx, img, ret, pressionado) {
    if (!img || !img.width || !img.height) return false;
    const escala = Math.min(Ret.largura(ret) / img.width, Ret.altura(ret) / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.save();
    if (pressionado) ctx.globalAlpha = 0.75;
    ctx.drawImage(img, Ret.centroX(ret) - w / 2, Ret.centroY(ret) - h / 2, w, h);
    ctx.restore();
    return true;
  }

  /** Quando o PNG do botao ainda nao carregou, desenha uma caixa no lugar. */
  desenharBotaoDeReserva(ctx, ret, texto) {
    ctx.save();
    retanguloArredondado(ctx, ret, this.esc * 10);
    ctx.fillStyle = Cor.css(0xFF21134A);
    ctx.fill();
    ctx.strokeStyle = Cor.css(GARAGEM_BOTAO_BORDA);
    ctx.lineWidth = this.esc * 1.4;
    ctx.stroke();
    if (texto) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold " + (this.esc * 14) + "px " + FONTE;
      ctx.fillStyle = Cor.css(Cor.WHITE);
      ctx.fillText(texto, Ret.centroX(ret), Ret.centroY(ret));
    }
    ctx.restore();
  }

  /** A faixa que faz o papel do Toast: aparece embaixo e desaparece sozinha. */
  desenharToast(ctx, largura, altura) {
    if (this.toastTempo <= 0 || !this.toastTexto) return;
    const dp = (v) => v * this.esc;
    // Ultimo meio segundo: some devagar, como o Toast do Android.
    const alfa = limitar(this.toastTempo / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.font = "bold " + dp(13) + "px " + FONTE;
    const w = Math.min(largura - dp(40), ctx.measureText(this.toastTexto).width + dp(28));
    const h = dp(32);
    const ret = Ret.novo((largura - w) / 2, altura - dp(24) - h, (largura + w) / 2, altura - dp(24));
    retanguloArredondado(ctx, ret, h / 2);
    ctx.fillStyle = Cor.css(Cor.argb(0xE0, 0x0A, 0x04, 0x22));
    ctx.fill();
    ctx.strokeStyle = Cor.css(GARAGEM_PANEL_PINK_BORDA);
    ctx.lineWidth = this.esc * 1.5;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(this.toastTexto, Ret.centroX(ret), Ret.centroY(ret));
    ctx.restore();
  }
}

window.CarPreviewView = CarPreviewView;
window.TelaDaGaragem = TelaDaGaragem;
