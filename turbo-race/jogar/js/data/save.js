"use strict";
/*
 * Progresso salvo. Porte de SaveManager.kt.
 *
 * No Android era SharedPreferences; aqui e o localStorage do navegador, com o
 * mesmo prefixo "turbo_road_racer". Os nomes das chaves foram mantidos iguais
 * aos do app para o codigo continuar legivel lado a lado com o Kotlin.
 *
 * O que mudou de proposito:
 *  - o mapeamento de gamepad usa nomes de tecla do navegador (KeyboardEvent.code)
 *    e indices de botao da Gamepad API, em vez dos KEYCODE_* do Android;
 *  - "foto de perfil" virou um data URL guardado no proprio localStorage.
 */

const PREFIXO_SALVAMENTO = "turbo_road_racer:";

class SaveManager {
  constructor() {
    this.cache = {};
    try {
      this.disponivel = typeof localStorage !== "undefined";
      if (this.disponivel) localStorage.setItem(PREFIXO_SALVAMENTO + "__teste", "1");
    } catch (e) {
      // Navegacao privada muito restrita: o jogo continua, mas sem guardar nada.
      this.disponivel = false;
    }
  }

  _ler(chave, padrao) {
    if (!this.disponivel) {
      return Object.prototype.hasOwnProperty.call(this.cache, chave) ? this.cache[chave] : padrao;
    }
    const bruto = localStorage.getItem(PREFIXO_SALVAMENTO + chave);
    return bruto === null ? padrao : bruto;
  }

  _gravar(chave, valor) {
    this.cache[chave] = String(valor);
    if (!this.disponivel) return;
    try { localStorage.setItem(PREFIXO_SALVAMENTO + chave, String(valor)); } catch (e) { /* cota cheia */ }
  }

  _apagar(chave) {
    delete this.cache[chave];
    if (!this.disponivel) return;
    try { localStorage.removeItem(PREFIXO_SALVAMENTO + chave); } catch (e) { /* ignora */ }
  }

  getInt(chave, padrao) {
    const n = parseInt(this._ler(chave, String(padrao)), 10);
    return Number.isFinite(n) ? n : padrao;
  }

  putInt(chave, valor) { this._gravar(chave, Math.trunc(valor)); }

  getBoolean(chave, padrao) {
    const v = this._ler(chave, padrao ? "1" : "0");
    return v === "1" || v === "true";
  }

  putBoolean(chave, valor) { this._gravar(chave, valor ? "1" : "0"); }

  getString(chave, padrao) { return this._ler(chave, padrao); }

  putString(chave, valor) { this._gravar(chave, valor); }

  // ---------- Jogador ----------
  get playerName() { return this.getString("player_name", "Jogador") || "Jogador"; }
  set playerName(value) {
    const limpo = String(value || "").trim().slice(0, 14) || "Jogador";
    this.putString("player_name", limpo);
  }

  get profilePhotoUri() { return this.getString("profile_photo_uri", ""); }
  set profilePhotoUri(value) { this.putString("profile_photo_uri", value || ""); }

  // ---------- Moedas ----------
  get coins() { return Math.max(0, this.getInt("coins", 0)); }
  set coins(value) { this.putInt("coins", Math.max(0, Math.trunc(value))); }

  addCoins(amount) { this.coins = this.coins + Math.trunc(amount); }

  spendCoins(amount) {
    if (this.coins >= amount) { this.coins = this.coins - amount; return true; }
    return false;
  }

  // ---------- Carros ----------
  /** O primeiro carro (id 0) ja vem desbloqueado. */
  isCarUnlocked(carId) {
    if (carId === 0) return true;
    const lista = this.getString("unlocked_cars", "");
    return lista.split(",").filter(Boolean).indexOf(String(carId)) >= 0;
  }

  unlockCar(carId) {
    const lista = this.getString("unlocked_cars", "").split(",").filter(Boolean);
    if (lista.indexOf(String(carId)) < 0) lista.push(String(carId));
    this.putString("unlocked_cars", lista.join(","));
  }

  get selectedCarId() {
    return limitar(this.getInt("selected_car", 0), 0, CarCatalog.cars.length - 1);
  }
  set selectedCarId(value) {
    this.putInt("selected_car", limitar(Math.trunc(value), 0, CarCatalog.cars.length - 1));
  }

  // ---------- Melhorias da garagem ----------
  getUpgradeMaxLevel(type) {
    if (type === SaveManager.UPGRADE_TIRES || type === SaveManager.UPGRADE_BOX) return 1;
    return SaveManager.UPGRADE_MAX_LEVEL;
  }

  getUpgradeLevel(carId, type) {
    return limitar(this.getInt("upgrade_" + carId + "_" + type, 0), 0, this.getUpgradeMaxLevel(type));
  }

  hasTireUpgrade(carId) { return this.getUpgradeLevel(carId, SaveManager.UPGRADE_TIRES) > 0; }

  hasBoxUpgrade(carId) { return this.getUpgradeLevel(carId, SaveManager.UPGRADE_BOX) > 0; }

  getUpgradeCost(carId, type) {
    const level = this.getUpgradeLevel(carId, type);
    const max = this.getUpgradeMaxLevel(type);
    if (level >= max) return -1;
    let base;
    switch (type) {
      case SaveManager.UPGRADE_SPEED: base = 650; break;
      case SaveManager.UPGRADE_STABILITY: base = 520; break;
      case SaveManager.UPGRADE_TURBO: base = 620; break;
      case SaveManager.UPGRADE_TANK: base = 480; break;
      case SaveManager.UPGRADE_MOTOR: base = 780; break;
      case SaveManager.UPGRADE_TIRES: base = 950; break;
      case SaveManager.UPGRADE_BOX: base = 1100; break;
      default: base = 600;
    }
    const carMultiplier = 1 + carId * 0.18;
    const levelMultiplier = (max === 1) ? 1 : 1 + level * 0.55;
    return Math.max(100, Math.trunc(base * carMultiplier * levelMultiplier));
  }

  buyUpgrade(carId, type) {
    const level = this.getUpgradeLevel(carId, type);
    if (level >= this.getUpgradeMaxLevel(type)) return false;
    const cost = this.getUpgradeCost(carId, type);
    if (!this.spendCoins(cost)) return false;
    this.putInt("upgrade_" + carId + "_" + type, level + 1);
    return true;
  }

  resetCarUpgrades(carId) {
    const tipos = [
      SaveManager.UPGRADE_SPEED, SaveManager.UPGRADE_STABILITY, SaveManager.UPGRADE_TURBO,
      SaveManager.UPGRADE_TANK, SaveManager.UPGRADE_MOTOR, SaveManager.UPGRADE_TIRES,
      SaveManager.UPGRADE_BOX
    ];
    for (const t of tipos) this._apagar("upgrade_" + carId + "_" + t);
  }

  paintColorCount() { return SaveManager.garagePaintColors.length; }

  getPaintIndex(carId) {
    return limitar(this.getInt("paint_" + carId, 0), 0, SaveManager.garagePaintColors.length - 1);
  }

  getPaintColor(carId, fallback) {
    const idx = this.getPaintIndex(carId);
    return idx === 0 ? fallback : SaveManager.garagePaintColors[idx];
  }

  getPaintName(carId) {
    switch (this.getPaintIndex(carId)) {
      case 0: return "Original";
      case 1: return "Ciano Neon";
      case 2: return "Rosa Neon";
      case 3: return "Verde Neon";
      case 4: return "Laranja Turbo";
      case 5: return "Roxo Premium";
      default: return "Branco Pro";
    }
  }

  getPaintCost(carId) { return 350 + carId * 120; }

  buyNextPaint(carId) {
    const next = (this.getPaintIndex(carId) + 1) % SaveManager.garagePaintColors.length;
    const cost = this.getPaintCost(carId);
    if (!this.spendCoins(cost)) return false;
    this.putInt("paint_" + carId, next);
    return true;
  }

  // ---------- Itens especiais de corrida ----------
  get pitBoostItemCost() { return 900; }
  get pitBoostItems() { return Math.max(0, this.getInt("pit_boost_items", 0)); }
  set pitBoostItems(v) { this.putInt("pit_boost_items", Math.max(0, Math.trunc(v))); }
  buyPitBoostItem() {
    if (!this.spendCoins(this.pitBoostItemCost)) return false;
    this.pitBoostItems = this.pitBoostItems + 1;
    return true;
  }
  consumePitBoostItem() {
    const atual = this.pitBoostItems;
    if (atual <= 0) return false;
    this.pitBoostItems = atual - 1;
    return true;
  }

  get tireGripItemCost() { return 950; }
  get tireGripItems() { return Math.max(0, this.getInt("tire_grip_items", 0)); }
  set tireGripItems(v) { this.putInt("tire_grip_items", Math.max(0, Math.trunc(v))); }
  buyTireGripItem() {
    if (!this.spendCoins(this.tireGripItemCost)) return false;
    this.tireGripItems = this.tireGripItems + 1;
    return true;
  }
  consumeTireGripItem() {
    const atual = this.tireGripItems;
    if (atual <= 0) return false;
    this.tireGripItems = atual - 1;
    return true;
  }

  get boxFreeItemCost() { return 1100; }
  get boxFreeItems() { return Math.max(0, this.getInt("box_free_items", 0)); }
  set boxFreeItems(v) { this.putInt("box_free_items", Math.max(0, Math.trunc(v))); }
  buyBoxFreeItem() {
    if (!this.spendCoins(this.boxFreeItemCost)) return false;
    this.boxFreeItems = this.boxFreeItems + 1;
    return true;
  }
  consumeBoxFreeItem() {
    const atual = this.boxFreeItems;
    if (atual <= 0) return false;
    this.boxFreeItems = atual - 1;
    return true;
  }

  get freezeRivalsItemCost() { return 1200; }
  get freezeRivalsItems() { return Math.max(0, this.getInt("freeze_rivals_items", 0)); }
  set freezeRivalsItems(v) { this.putInt("freeze_rivals_items", Math.max(0, Math.trunc(v))); }
  buyFreezeRivalsItem() {
    if (!this.spendCoins(this.freezeRivalsItemCost)) return false;
    this.freezeRivalsItems = this.freezeRivalsItems + 1;
    return true;
  }
  consumeFreezeRivalsItem() {
    const atual = this.freezeRivalsItems;
    if (atual <= 0) return false;
    this.freezeRivalsItems = atual - 1;
    return true;
  }

  get ghostModeItemCost() { return 1500; }
  get ghostModeItems() { return Math.max(0, this.getInt("ghost_mode_items", 0)); }
  set ghostModeItems(v) { this.putInt("ghost_mode_items", Math.max(0, Math.trunc(v))); }
  buyGhostModeItem() {
    if (!this.spendCoins(this.ghostModeItemCost)) return false;
    this.ghostModeItems = this.ghostModeItems + 1;
    return true;
  }
  consumeGhostModeItem() {
    const atual = this.ghostModeItems;
    if (atual <= 0) return false;
    this.ghostModeItems = atual - 1;
    return true;
  }

  get explodeRivalsItemCost() { return 1800; }
  get explodeRivalsItems() { return Math.max(0, this.getInt("explode_rivals_items", 0)); }
  set explodeRivalsItems(v) { this.putInt("explode_rivals_items", Math.max(0, Math.trunc(v))); }
  buyExplodeRivalsItem() {
    if (!this.spendCoins(this.explodeRivalsItemCost)) return false;
    this.explodeRivalsItems = this.explodeRivalsItems + 1;
    return true;
  }
  consumeExplodeRivalsItem() {
    const atual = this.explodeRivalsItems;
    if (atual <= 0) return false;
    this.explodeRivalsItems = atual - 1;
    return true;
  }

  // ---------- Fases ----------
  /** Quantidade de fases ja liberadas (comeca em 1: so a primeira). */
  get unlockedStages() { return this.getInt("unlocked_stages", 1); }
  set unlockedStages(value) {
    this.putInt("unlocked_stages", limitar(Math.trunc(value), 1, StageCatalog.count()));
  }

  unlockStage(index) {
    if (index + 1 > this.unlockedStages) {
      this.unlockedStages = Math.min(index + 1, StageCatalog.count());
    }
  }

  isStageUnlocked(index) { return index < this.unlockedStages; }

  // ---------- Recordes ----------
  getHighScore(stageIndex) { return this.getInt("highscore_" + stageIndex, 0); }

  /** Salva se for maior que o recorde atual. Devolve true se houve novo recorde. */
  submitScore(stageIndex, score) {
    if (score > this.getHighScore(stageIndex)) {
      this.putInt("highscore_" + stageIndex, score);
      return true;
    }
    return false;
  }

  // ---------- Configuracoes ----------
  get musicEnabled() { return this.getBoolean("music_on", true); }
  set musicEnabled(v) { this.putBoolean("music_on", v); }

  get sfxEnabled() { return this.getBoolean("sfx_on", true); }
  set sfxEnabled(v) { this.putBoolean("sfx_on", v); }

  get vibrationEnabled() { return this.getBoolean("vibration_on", true); }
  set vibrationEnabled(v) { this.putBoolean("vibration_on", v); }

  get randomWeatherEnabled() { return this.getBoolean("random_weather_enabled", false); }
  set randomWeatherEnabled(v) { this.putBoolean("random_weather_enabled", v); }

  get speechEnabled() { return this.getBoolean("speech_enabled", true); }
  set speechEnabled(v) { this.putBoolean("speech_enabled", v); }

  get controlType() { return this.getInt("control_type", SaveManager.CONTROL_TOUCH); }
  set controlType(v) { this.putInt("control_type", v); }

  // ---------- Controle externo / teclado ----------
  get gamepadEnabled() { return this.getBoolean("gamepad_enabled", true); }
  set gamepadEnabled(v) { this.putBoolean("gamepad_enabled", v); }

  /** Devolve o KeyboardEvent.code ligado a uma acao. */
  getKeyboardKey(action) {
    return this.getString("keyboard_key_" + action, SaveManager.teclasPadrao[action] || "");
  }

  setKeyboardKey(action, code) {
    if (!code) return;
    this.putString("keyboard_key_" + action, code);
  }

  getKeyboardKeyLabel(action) {
    const code = this.getKeyboardKey(action);
    if (!code) return "-";
    return code
      .replace("Arrow", "SETA ")
      .replace("Key", "")
      .replace("Digit", "")
      .replace("Space", "ESPAÇO")
      .replace("ShiftLeft", "SHIFT ESQ")
      .replace("ShiftRight", "SHIFT DIR")
      .replace("ControlLeft", "CTRL ESQ")
      .replace("ControlRight", "CTRL DIR")
      .toUpperCase();
  }

  resetKeyboardMapping() {
    for (const action of Object.keys(SaveManager.teclasPadrao)) {
      this._apagar("keyboard_key_" + action);
    }
  }

  // ---------- Tutorial ----------
  get tutorialSeen() { return this.getBoolean("tutorial_seen", false); }
  set tutorialSeen(v) { this.putBoolean("tutorial_seen", v); }

  // ---------- Videos de zeramento por pais ----------
  get brazilEndingSeen() { return this.getBoolean("brazil_ending_seen", false); }
  set brazilEndingSeen(v) { this.putBoolean("brazil_ending_seen", v); }

  get introSeen() { return this.getBoolean("intro_seen", false); }
  set introSeen(v) { this.putBoolean("intro_seen", v); }

  // ---------- Sala online ----------
  get onlineServerUrl() { return this.getString("online_server", SaveManager.SERVIDOR_PADRAO); }
  set onlineServerUrl(v) { this.putString("online_server", String(v || "").trim() || SaveManager.SERVIDOR_PADRAO); }
}

SaveManager.CONTROL_TOUCH = 0;   // toque lateral
SaveManager.CONTROL_BUTTONS = 1; // botoes na tela
SaveManager.CONTROL_TILT = 2;    // sensor de inclinacao do celular

SaveManager.UPGRADE_SPEED = "speed";
SaveManager.UPGRADE_STABILITY = "stability";
SaveManager.UPGRADE_TURBO = "turbo";
SaveManager.UPGRADE_TANK = "tank";
SaveManager.UPGRADE_MOTOR = "motor";
SaveManager.UPGRADE_TIRES = "tires";
SaveManager.UPGRADE_BOX = "box";
SaveManager.UPGRADE_MAX_LEVEL = 5;

SaveManager.GAMEPAD_LEFT = "left";
SaveManager.GAMEPAD_RIGHT = "right";
SaveManager.GAMEPAD_ACCEL = "accel";
SaveManager.GAMEPAD_BRAKE = "brake";
SaveManager.GAMEPAD_TURBO = "turbo";
SaveManager.GAMEPAD_HEADLIGHT = "headlight";
SaveManager.GAMEPAD_GAS_PLUS = "gas_plus";
SaveManager.GAMEPAD_FREEZE = "freeze";
SaveManager.GAMEPAD_GHOST = "ghost";
SaveManager.GAMEPAD_UPGRADE_NEXT = "upgrade_next";
SaveManager.GAMEPAD_UPGRADE_USE = "upgrade_use";
SaveManager.GAMEPAD_PAUSE = "pause";
SaveManager.GAMEPAD_SELECT = "select";

/** Teclado do computador no lugar dos KEYCODE_* do Android. */
SaveManager.teclasPadrao = {
  left: "ArrowLeft",
  right: "ArrowRight",
  accel: "ArrowUp",
  brake: "ArrowDown",
  turbo: "Space",
  headlight: "KeyL",
  gas_plus: "KeyG",
  freeze: "KeyF",
  ghost: "KeyH",
  upgrade_next: "KeyQ",
  upgrade_use: "KeyE",
  pause: "Escape",
  select: "Enter"
};

SaveManager.garagePaintColors = [
  0xFFFFD24D, // amarelo corrida
  0xFF00F5D4, // ciano neon
  0xFFFF2D7A, // rosa neon
  0xFF7CFF4D, // verde neon
  0xFFFF8C2A, // laranja
  0xFF8A5CFF, // roxo
  0xFFFFFFFF  // branco premium
];

/** Sala online do Turbo Race no Render (a mesma ideia da sala do Sugar Strike). */
SaveManager.SERVIDOR_PADRAO = "wss://turbo-race-sala.onrender.com/corrida";

window.SaveManager = SaveManager;
