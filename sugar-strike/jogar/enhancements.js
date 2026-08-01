(function () {
  "use strict";

  const VERSION = "1.6.0";
  const SETTINGS_KEY = "sugarstrike.settings.v11";
  const PROFILE_KEY = "sugarstrike.profile.v12";
  const OLD_PROFILE_KEY = "sugarstrike.profile.v11";
  const HISTORY_LIMIT = 10;
  const originalBuildTown = buildTown;
  const originalInitMatch = initMatch;
  const originalEndMatch = endMatch;
  const originalResize = resize;
  const originalSetWeapon = setWeapon;

  const defaults = {
    volume: 0.8,
    music: 0.38,
    touchSensX: 0.0052,
    touchSensY: 0.0046,
    aimAssist: 0.32,
    controlsScale: 1,
    haptics: true,
    graphics: "high",
    fps: 60,
    controlPositions: {}
  };
  const profileDefaults = {
    name: "CONFEITEIRO",
    xp: 0,
    level: 1,
    matches: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    headshots: 0,
    shots: 0,
    hits: 0,
    candies: 180,
    // A Goma-18 e a faca de acucar vem de graca com o jogo.
    ownedWeapons: [4, 10],
    primary: 4,
    accessory: 10,
    skin: 0,
    unlockedSkins: [0],
    weaponSkin: 0,
    unlockedWeaponSkins: [0],
    gear: 0,
    unlockedGear: [0],
    achievements: [],
    daily: {day: "", kills: 0, matches: 0, claimed: false},
    history: []
  };

  function readJson(key, fallback) {
    try {
      return Object.assign({}, fallback, JSON.parse(localStorage.getItem(key) || "{}"));
    } catch (error) {
      return Object.assign({}, fallback);
    }
  }
  const settings = window.SugarSettings = readJson(SETTINGS_KEY, defaults);
  const profile = readJson(PROFILE_KEY, profileDefaults);
  try {
    profile.name = localStorage.getItem("sugarstrike.player") || profile.name;
  } catch (error) {}
  // Quem vinha da versao anterior traz os doces e as estatisticas junto.
  try {
    if (!localStorage.getItem(PROFILE_KEY)) {
      const old = JSON.parse(localStorage.getItem(OLD_PROFILE_KEY) || "{}");
      if (old && typeof old === "object") {
        ["xp", "level", "matches", "wins", "kills", "deaths", "headshots", "shots", "hits"]
          .forEach(function (key) {
            if (Number.isFinite(old[key])) profile[key] = old[key];
          });
        if (Number.isFinite(old.candies)) {
          profile.candies = Math.max(profile.candies, Math.floor(old.candies));
        }
        if (Array.isArray(old.unlockedSkins)) profile.unlockedSkins = old.unlockedSkins;
        if (Array.isArray(old.achievements)) profile.achievements = old.achievements;
        if (Array.isArray(old.history)) profile.history = old.history;
      }
    }
  } catch (error) {}

  // ------------------------------------------------------------- catalogos
  // Roupas: so mudam as cores do boneco, usando a paleta SKINS do jogo.
  const OUTFITS = [
    {name: "CONFEITEIRO PADRAO", price: 0},
    {name: "AVENTAL DE MENTA", price: 120},
    {name: "UNIFORME DE MEL", price: 180},
    {name: "MANTO DE UVA", price: 240},
    {name: "JALECO DE PESSEGO", price: 260},
    {name: "CAPUZ DE MIRTILO", price: 320},
    {name: "ROUPA DE MACA VERDE", price: 360},
    {name: "CASACO DE MORANGO", price: 420},
    {name: "SOBRETUDO DE AMORA", price: 480},
    {name: "VESTIDO DE ALGODAO", price: 560}
  ];
  // Skins de arma: repintam qualquer arma. A primeira mantem as cores de fabrica.
  const WEAPON_SKINS = [
    {name: "CORES ORIGINAIS", price: 0, colors: [null, null]},
    {name: "UVA REAL", price: 150, colors: ["#c9b4ec", "#8fd9c8"]},
    {name: "MEL DOURADO", price: 200, colors: ["#ffcf4d", "#e8615a"]},
    {name: "NOITE DE AMORA", price: 260, colors: ["#5b5f8f", "#9ec9f2"]},
    {name: "CHOCOLATE AMARGO", price: 300, colors: ["#6d3a2a", "#f6a9c3"]},
    {name: "MENTA GELADA", price: 340, colors: ["#8fd9c8", "#fffdf7"]},
    {name: "MORANGO CREME", price: 380, colors: ["#f6a9c3", "#fdf7ec"]},
    {name: "CARAMELO QUEIMADO", price: 420, colors: ["#c98f5e", "#ffcf4d"]},
    {name: "CONFETE DE FESTA", price: 520, colors: ["#e8615a", "#ffcf4d"]}
  ];
  // Equipamentos: um de cada vez, e estes mexem de verdade nos numeros.
  const GEAR = [
    {name: "SEM EQUIPAMENTO", price: 0, desc: "Nenhum bonus.", mods: {}},
    {name: "TENIS DE CARAMELO", price: 260, desc: "Corre 10% mais rapido.", mods: {speed: 1.10}},
    {name: "COLETE DE MARSHMALLOW", price: 340, desc: "Nasce com 25 de escudo.", mods: {shield: 25}},
    {name: "LUVA DE CONFEITEIRO", price: 300, desc: "Segura 20% do recuo.", mods: {recoil: 0.80}},
    {name: "MIRA DE ACUCAR", price: 420, desc: "Fecha 18% da dispersao.", mods: {spread: 0.82}},
    {name: "CINTO DE MUNICAO", price: 380, desc: "40% mais municao reserva.", mods: {ammo: 1.40}},
    {name: "JOELHEIRA DE GELATINA", price: 290, desc: "Perde 35% menos mira andando.", mods: {move: 0.65}},
    {name: "CAPACETE DE BISCOITO", price: 520, desc: "Tiro na cabeca doi 35% menos.", mods: {head: 0.65}},
    {name: "BOTAS DE ALCACUZ", price: 640, desc: "14% mais rapido e recarrega 15% antes.", mods: {speed: 1.14, reload: 0.85}}
  ];

  profile.history = Array.isArray(profile.history) ? profile.history : [];
  profile.achievements = Array.isArray(profile.achievements) ? profile.achievements : [];
  profile.candies = Math.max(0, Number(profile.candies) || 0);

  function normalizeList(value, floor, limit) {
    const list = Array.isArray(value) ? value : [floor];
    const clean = list
      .map(function (item) { return clamp(item | 0, 0, limit); })
      .filter(function (item, index, all) { return all.indexOf(item) === index; });
    if (clean.indexOf(floor) < 0) clean.unshift(floor);
    return clean;
  }
  profile.unlockedSkins = normalizeList(profile.unlockedSkins, 0, OUTFITS.length - 1);
  profile.unlockedWeaponSkins = normalizeList(profile.unlockedWeaponSkins, 0, WEAPON_SKINS.length - 1);
  profile.unlockedGear = normalizeList(profile.unlockedGear, 0, GEAR.length - 1);
  profile.ownedWeapons = Array.isArray(profile.ownedWeapons) ? profile.ownedWeapons : [];
  profile.ownedWeapons = profile.ownedWeapons
    .map(function (weapon) { return clamp(weapon | 0, 0, WEAPONS.length - 1); })
    .filter(function (weapon, index, list) { return list.indexOf(weapon) === index; });
  // As duas gratuitas nunca podem sumir, senao o jogador fica sem nada para levar.
  PRIMARIES.concat(ACCESSORIES).forEach(function (index) {
    if (WEAPONS[index].price === 0 && profile.ownedWeapons.indexOf(index) < 0) {
      profile.ownedWeapons.push(index);
    }
  });
  function firstOwned(pool) {
    for (let i = 0; i < pool.length; i++) {
      if (profile.ownedWeapons.indexOf(pool[i]) >= 0) return pool[i];
    }
    return pool[0];
  }
  if (PRIMARIES.indexOf(profile.primary | 0) < 0 ||
      profile.ownedWeapons.indexOf(profile.primary | 0) < 0) {
    profile.primary = firstOwned(PRIMARIES);
  }
  if (ACCESSORIES.indexOf(profile.accessory | 0) < 0 ||
      profile.ownedWeapons.indexOf(profile.accessory | 0) < 0) {
    profile.accessory = firstOwned(ACCESSORIES);
  }
  profile.skin = clamp(profile.skin | 0, 0, OUTFITS.length - 1);
  profile.weaponSkin = clamp(profile.weaponSkin | 0, 0, WEAPON_SKINS.length - 1);
  profile.gear = clamp(profile.gear | 0, 0, GEAR.length - 1);
  if (profile.unlockedSkins.indexOf(profile.skin) < 0) profile.skin = 0;
  if (profile.unlockedWeaponSkins.indexOf(profile.weaponSkin) < 0) profile.weaponSkin = 0;
  if (profile.unlockedGear.indexOf(profile.gear) < 0) profile.gear = 0;

  // Deixa o jogo saber o que foi equipado.
  function syncLoadout() {
    LOADOUT[0] = profile.primary | 0;
    LOADOUT[1] = profile.accessory | 0;
  }
  syncLoadout();

  const game = {
    map: "village",
    mode: "deathmatch",
    bots: 7,
    target: 25,
    duration: 5,
    remaining: 300,
    elapsed: 0,
    speedUntil: 0,
    kingScore: [0, 0, 0],
    teamScore: [0, 0, 0],
    captureScore: [0, 0, 0],
    flag: null,
    wave: 1,
    pickups: [],
    tempWeapons: [],
    mapRepairAt: 0,
    mapRepairing: false,
    lastPickupSeed: 0,
    finished: false,
    resultSaved: false
  };
  try {
    const savedMatch = JSON.parse(localStorage.getItem("sugarstrike.match.v11") || "{}");
    game.map = savedMatch.map || game.map;
    game.mode = savedMatch.mode || game.mode;
    game.bots = Number.isFinite(savedMatch.bots) ? clamp(savedMatch.bots, 0, 12) : game.bots;
    game.target = Number.isFinite(savedMatch.target) ? clamp(savedMatch.target, 5, 100) : game.target;
    game.duration = Number.isFinite(savedMatch.duration) ? clamp(savedMatch.duration, 1, 30) : game.duration;
  } catch (error) {}

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (error) {}
    applyControlStyle();
  }
  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (error) {}
    updateCandyHud();
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function refreshDaily() {
    if (!profile.daily || profile.daily.day !== today()) {
      profile.daily = {day: today(), kills: 0, matches: 0, claimed: false};
      saveProfile();
    }
  }
  refreshDaily();

  function vibrate(pattern) {
    if (!settings.haptics) return;
    try {
      if (window.SugarAndroid && SugarAndroid.vibrate) SugarAndroid.vibrate(String(pattern));
      else if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (error) {}
  }

  function selectedSkin() {
    return SKINS[clamp(profile.skin | 0, 0, SKINS.length - 1)];
  }
  function weaponColors() {
    return WEAPON_SKINS[clamp(profile.weaponSkin | 0, 0, WEAPON_SKINS.length - 1)].colors;
  }
  function currentGear() {
    return GEAR[clamp(profile.gear | 0, 0, GEAR.length - 1)];
  }
  // O index.html pergunta por aqui o efeito de cada equipamento.
  function gearMod(name, fallback) {
    const mods = currentGear().mods || {};
    return Object.prototype.hasOwnProperty.call(mods, name) ? mods[name] : fallback;
  }
  function skyPalette() {
    const palettes = {
      village: {top: "#7fc9ea", middle: "#bfe7f5", bottom: "#e6f5fb", cloud: "#fffdf7"},
      factory: {top: "#8d5a57", middle: "#d9936f", bottom: "#f3c991", cloud: "#ead7c5"},
      park: {top: "#58d7e8", middle: "#9cebdc", bottom: "#ffe1ef", cloud: "#fff8fc"},
      castle: {top: "#7769bd", middle: "#c9b4ec", bottom: "#ffe3ad", cloud: "#fff5de"}
    };
    return palettes[game.map] || palettes.village;
  }
  function ownsWeapon(index) {
    return profile.ownedWeapons.indexOf(index | 0) >= 0;
  }
  function canUseWeapon(index) {
    return ownsWeapon(index) || game.tempWeapons.indexOf(index | 0) >= 0;
  }
  function startingWeapon() {
    return canUseWeapon(profile.primary | 0) ? profile.primary | 0 : firstOwned(PRIMARIES);
  }
  function startingAccessory() {
    return canUseWeapon(profile.accessory | 0) ? profile.accessory | 0 : firstOwned(ACCESSORIES);
  }
  setWeapon = function (index) {
    index = clamp(index | 0, 0, WEAPONS.length - 1);
    if (!canUseWeapon(index)) {
      showToast("ARMA BLOQUEADA · COMPRE NA LOJA OU ENCONTRE NA FASE");
      vibrate(35);
      return;
    }
    originalSetWeapon(index);
  };

  function assistAim() {
    const args = Array.prototype.slice.call(arguments);
    const base = args.length >= 4
      ? {entity: args[0], dx: args[1], dy: args[2], dz: args[3], object: true}
      : {entity: player, dx: args[0], dy: args[1], dz: args[2], object: false};
    if (!player || settings.aimAssist <= 0) {
      return base.object ? {dx: base.dx, dy: base.dy, dz: base.dz} : [base.dx, base.dy, base.dz];
    }
    let best = null;
    let bestDot = 0.982 + (1 - settings.aimAssist) * 0.012;
    for (const target of ents) {
      if (target === base.entity || target.dead || !canDamage(target, base.entity)) continue;
      const tx = target.x - base.entity.x;
      const ty = target.y + 1.15 - (base.entity.y + 1.55);
      const tz = target.z - base.entity.z;
      const distance = Math.hypot(tx, ty, tz);
      if (distance > 34 || distance < 0.2) continue;
      const dot = (tx * base.dx + ty * base.dy + tz * base.dz) / distance;
      if (dot > bestDot && rayWorld(base.entity.x, base.entity.y + 1.55, base.entity.z,
        tx / distance, ty / distance, tz / distance, distance) >= distance - 0.8) {
        bestDot = dot;
        best = {x: tx / distance, y: ty / distance, z: tz / distance};
      }
    }
    if (best) {
      const amount = settings.aimAssist * 0.42;
      base.dx = lerp(base.dx, best.x, amount);
      base.dy = lerp(base.dy, best.y, amount);
      base.dz = lerp(base.dz, best.z, amount);
      const length = Math.hypot(base.dx, base.dy, base.dz) || 1;
      base.dx /= length; base.dy /= length; base.dz /= length;
    }
    return base.object ? {dx: base.dx, dy: base.dy, dz: base.dz} : [base.dx, base.dy, base.dz];
  }

  function canDamage(victim, attacker) {
    if (!victim || !attacker || victim === attacker) return victim !== attacker;
    if (game.mode === "team" || game.mode === "capture" || game.mode === "survival") {
      return victim.team !== attacker.team;
    }
    return true;
  }

  function onShot(entity) {
    entity.shots = (entity.shots || 0) + 1;
    if (entity === player) vibrate(16);
  }
  function onHit(attacker, victim, head) {
    attacker.hits = (attacker.hits || 0) + 1;
    if (head) attacker.headshots = (attacker.headshots || 0) + 1;
    if (attacker === player) vibrate(head ? "18,25,30" : 22);
    if (victim === player) vibrate("35,25,55");
  }
  function playerSpeed() {
    const boost = performance.now() < game.speedUntil ? 1.38 : 1;
    return boost * (gearMod("speed", 1) || 1);
  }

  function assignTeams(list, mode) {
    if (mode !== "team" && mode !== "capture" && mode !== "survival") {
      list.forEach(function (entity) { entity.team = 0; });
      return;
    }
    let humanIndex = 0;
    let botIndex = 0;
    list.forEach(function (entity) {
      if (mode === "survival") entity.team = entity.bot ? 2 : 1;
      else if (entity.bot) entity.team = (++botIndex % 2) + 1;
      else entity.team = (++humanIndex % 2) + 1;
    });
  }

  function applyNetworkConfig(config) {
    if (!config) return;
    game.map = config.map || game.map;
    game.mode = config.mode || game.mode;
    game.bots = clamp(config.bots | 0, 0, 12);
    game.target = clamp(config.target | 0, 5, 100);
    game.duration = clamp(config.duration | 0, 1, 30);
    TARGET = game.target;
    targetV.textContent = TARGET;
    game.remaining = game.duration * 60;
    game.elapsed = 0;
    game.finished = false;
    game.resultSaved = false;
    game.kingScore = [0, 0, 0];
    game.teamScore = [0, 0, 0];
    game.captureScore = [0, 0, 0];
    game.flag = {x: 0, z: 0, carrier: null, home: 0};
    game.tempWeapons = profile.ownedWeapons.slice();
    spawnPickups();
    syncConfigUi();
  }

  function ground(colorA, colorB) {
    for (let x = -100; x < 100; x += 20) {
      for (let z = -100; z < 100; z += 20) {
        const color = ((x + z) / 20) % 2 ? colorA : colorB;
        addFaceS([[x, 0, z + 20], [x + 20, 0, z + 20], [x + 20, 0, z], [x, 0, z]], color);
      }
    }
  }

  function buildFactory() {
    ground("#9b7459", "#b78b68");
    boxS(-46, 0, -50, -18, 11, 45, "#a85c43", 7, true);
    boxS(18, 0, -50, 46, 11, 45, "#a85c43", 7, true);
    boxS(-49, 11, -53, -15, 12, 48, "#5d4338", 8, false);
    boxS(15, 11, -53, 49, 12, 48, "#5d4338", 8, false);
    for (const side of [-1, 1]) {
      const x = side * 31;
      for (let z = -40; z <= 36; z += 19) {
        panel("x", side < 0 ? 1 : -1, side < 0 ? -17.94 : 17.94,
          z - 4, z + 4, 3, 7, "#8fd9c8");
      }
      boxS(x - 2.2, 12, 20, x + 2.2, 25, 24, "#6b4a3a", 5, true);
      boxS(x - 3, 24.5, 19.2, x + 3, 26, 24.8, "#f0e6da", 6, false);
    }
    for (let z = -40; z <= 40; z += 16) {
      boxS(-11, 0, z - 3, 11, 1.1, z + 3, "#5b5f8f", 6, true);
      boxS(-9.5, 1.1, z - 2.2, 9.5, 1.38, z + 2.2, "#7f6bd6", 5, false);
    }
    boxS(-5, 0, -8, 5, 7, 8, "#6d3a2a", 5, true);
    boxS(-6, 7, -9, 6, 8, 9, "#f6a9c3", 5, false);
    signs.push({x: 0, y: 9.5, z: 8.2, t: "CHOCO FABRICA"});
  }

  function buildPark() {
    ground("#91d879", "#a9e28f");
    boxS(-12, 0, -75, 12, 0.25, 75, "#f2e3c2", 8, false);
    boxS(-75, 0, -12, 75, 0.25, 12, "#f2e3c2", 8, false);
    const colors = ["#e8615a", "#ffcf4d", "#8fd9c8", "#c9b4ec", "#f79a5e"];
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      const radius = i % 2 ? 33 : 57;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      boxS(x - 0.35, 0, z - 0.35, x + 0.35, 5.5, z + 0.35, "#fffdf7", 8, true);
      boxS(x - 2.3, 5.1, z - 0.75, x + 2.3, 8.5, z + 0.75, colors[i % colors.length], 4, false);
    }
    for (const x of [-42, -22, 22, 42]) {
      for (const z of [-42, 42]) {
        boxS(x - 5, 0, z - 5, x + 5, 5, z + 5, colors[(x + z + 100) % colors.length], 5, true);
        boxS(x - 6, 5, z - 6, x + 6, 5.8, z + 6, "#fffdf7", 6, false);
      }
    }
    const candyCover = [
      [-27,-25],[-27,-8],[-27,22],[-16,31],
      [27,-25],[27,-8],[27,22],[16,31],
      [-46,-20],[-46,20],[46,-20],[46,20]
    ];
    candyCover.forEach(function (point, index) {
      const x = point[0], z = point[1], color = colors[index % colors.length];
      boxS(x - 2.8, 0, z - 2.1, x + 2.8, 2.2, z + 2.1, color, 4, true);
      boxS(x - 3.25, 2.2, z - 2.55, x + 3.25, 2.75, z + 2.55, "#fffdf7", 4, false);
      boxS(x - 1.1, 2.75, z - 1.1, x + 1.1, 3.65, z + 1.1,
        colors[(index + 2) % colors.length], 4, false);
    });
    for (let v = -60; v <= 60; v += 15) {
      if (Math.abs(v) < 12) continue;
      boxS(v - 6, 0, -71, v + 6, 2.1, -69.8, colors[(v + 60) / 15 % colors.length], 4, true);
      boxS(v - 6, 0, 69.8, v + 6, 2.1, 71, colors[((v + 60) / 15 + 2) % colors.length], 4, true);
      boxS(-71, 0, v - 6, -69.8, 2.1, v + 6, colors[((v + 60) / 15 + 1) % colors.length], 4, true);
      boxS(69.8, 0, v - 6, 71, 2.1, v + 6, colors[((v + 60) / 15 + 3) % colors.length], 4, true);
    }
    boxS(-7, 0, -7, 7, 3, 7, "#f6a9c3", 5, true);
    signs.push({x: 0, y: 4.2, z: 7.2, t: "POTE REAL"});
  }

  function buildCastle() {
    ground("#f5d7e6", "#ecd0ef");
    const wall = "#e8b4cb";
    for (const z of [-52, 52]) {
      boxS(-52, 0, z - 3, -9, 8, z + 3, wall, 6, true);
      boxS(9, 0, z - 3, 52, 8, z + 3, wall, 6, true);
    }
    for (const x of [-52, 52]) boxS(x - 3, 0, -52, x + 3, 8, 52, wall, 6, true);
    for (const x of [-52, 52]) for (const z of [-52, 52]) {
      boxS(x - 6, 0, z - 6, x + 6, 15, z + 6, "#c98fd0", 5, true);
      boxS(x - 7, 15, z - 7, x + 7, 16.2, z + 7, "#ffcf4d", 5, false);
    }
    boxS(-18, 0, -18, 18, 12, 18, "#f2c0d5", 6, true);
    boxS(-21, 12, -21, 21, 13, 21, "#fffdf7", 6, false);
    panel("z", 1, 18.06, -4, 4, 0, 7, "#6d3a2a");
    for (const x of [-35, -18, 18, 35]) {
      boxS(x - 2, 0, -2, x + 2, 4.5, 2, "#8fd9c8", 5, true);
    }
    signs.push({x: 0, y: 14.5, z: 21.2, t: "CASTELO DE BOLO"});
  }

  buildTown = function () {
    if (game.map === "factory") buildFactory();
    else if (game.map === "park") buildPark();
    else if (game.map === "castle") buildCastle();
    else originalBuildTown();
  };

  function restoreArray(target, backup) {
    target.length = 0;
    Array.prototype.push.apply(target, backup);
  }

  function mapIsComplete() {
    const minimums = {
      village: {faces: 180, solids: 18},
      factory: {faces: 180, solids: 10},
      park: {faces: 300, solids: 25},
      castle: {faces: 180, solids: 12}
    };
    const minimum = minimums[game.map] || minimums.village;
    return statics.length >= minimum.faces && solids.length >= minimum.solids;
  }

  function rebuildSelectedMap(seed) {
    if (game.mapRepairing) return mapIsComplete();
    game.mapRepairing = true;
    const oldStatics = statics.slice();
    const oldSolids = solids.slice();
    const oldSigns = signs.slice();
    const oldRandom = Math.random;
    let state = (Number(seed) >>> 0) || 1;
    if (seed !== undefined && seed !== null) {
      Math.random = function () {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
      };
    }
    try {
      statics.length = 0;
      solids.length = 0;
      signs.length = 0;
      buildTown();
      if (!mapIsComplete()) {
        throw new Error("cenario incompleto: " + statics.length + "/" + solids.length);
      }
      game.mapRepairAt = performance.now() + 2500;
      return true;
    } catch (error) {
      restoreArray(statics, oldStatics);
      restoreArray(solids, oldSolids);
      restoreArray(signs, oldSigns);
      if (statics.length < 80) {
        statics.length = 0;
        solids.length = 0;
        signs.length = 0;
        originalBuildTown();
      }
      console.error("Sugar Strike: falha ao reconstruir mapa", error);
      return false;
    } finally {
      Math.random = oldRandom;
      game.mapRepairing = false;
    }
  }

  function spawnPickups() {
    game.pickups = [];
    const layouts = {
      village: [[-8,-40],[8,-18],[-7,6],[8,30],[-28,-6],[28,8],[-38,38],[38,-38],[0,52],[0,-58]],
      factory: [[0,-40],[-10,-20],[10,2],[14,30],[-14,-28],[14,28],[-8,48],[8,-52],[-14,8],[14,-8]],
      park: [[-22,-42],[22,-24],[-16,0],[16,22],[-38,8],[38,-8],[0,42],[0,-52],[-28,34],[28,-38]],
      castle: [[0,-44],[-22,-20],[22,-20],[0,24],[-30,22],[30,22],[-12,44],[12,44],[-42,0],[42,0]]
    };
    const points = layouts[game.map] || layouts.village;
    const types = ["ammo", "candy", "heal", "weapon", "shield", "candy", "ammo", "weapon", "speed", "candy"];
    points.forEach(function (point, index) {
      const pickup = {
        x: point[0], y: 0.75, z: point[1],
        type: types[index], active: true, respawn: 0, spin: index
      };
      if (pickup.type === "candy") pickup.value = 5 + (index % 2) * 5;
      // As caixas roxas emprestam as duas armas mais caras por uma partida.
      if (pickup.type === "weapon") pickup.weapon = index === 3 ? 2 : 9;
      game.pickups.push({
        x: pickup.x, y: pickup.y, z: pickup.z, type: pickup.type,
        value: pickup.value, weapon: pickup.weapon,
        active: pickup.active, respawn: pickup.respawn, spin: pickup.spin
      });
    });
  }

  initMatch = function () {
    TARGET = game.target;
    targetV.textContent = TARGET;
    rebuildSelectedMap();
    originalInitMatch();
    if (game.bots !== 7) {
      ents = [player];
      const pool = NAMES.slice();
      for (let i = 0; i < game.bots; i++) {
        const name = pool.length ? pool.splice((Math.random() * pool.length) | 0, 1)[0] : "BOT " + (i + 1);
        ents.push(newEnt(name, true));
      }
      for (const entity of ents) respawn(entity);
    }
    player.name = (profile.name || "VOCE").toUpperCase().slice(0, 14);
    player.skin = selectedSkin();
    game.tempWeapons = profile.ownedWeapons.slice();
    // O jogador entra com a arma principal na mao e o acessorio no bolso.
    syncLoadout();
    LOADOUT[0] = startingWeapon();
    LOADOUT[1] = startingAccessory();
    const chosenWeapon = LOADOUT[0];
    player.wep = chosenWeapon;
    player.mag = player.mags[chosenWeapon];
    player.res = player.ress[chosenWeapon];
    assignTeams(ents, game.mode);
    game.remaining = game.duration * 60;
    game.elapsed = 0;
    game.finished = false;
    game.resultSaved = false;
    game.kingScore = [0, 0, 0];
    game.teamScore = [0, 0, 0];
    game.captureScore = [0, 0, 0];
    game.wave = 1;
    game.flag = {x: 0, z: 0, carrier: null, home: 0};
    spawnPickups();
    updateWeaponSlots();
    updateCandyHud();
    updateModeLabel();
  };

  function topEntity() {
    return ents.slice().sort(function (a, b) { return b.score - a.score; })[0] || player;
  }
  function endByTimer() {
    if (!matchOver) endMatch(topEntity());
  }
  function updateTeams() {
    game.teamScore[1] = 0;
    game.teamScore[2] = 0;
    ents.forEach(function (entity) {
      if (entity.team) game.teamScore[entity.team] += entity.score;
    });
    if (game.mode === "team" && Math.max(game.teamScore[1], game.teamScore[2]) >= game.target) {
      const winningTeam = game.teamScore[1] >= game.teamScore[2] ? 1 : 2;
      endMatch(ents.find(function (entity) { return entity.team === winningTeam; }) || topEntity());
    }
  }
  function updateKing(dt) {
    const occupants = ents.filter(function (entity) {
      return !entity.dead && Math.hypot(entity.x, entity.z) < 8;
    });
    if (occupants.length === 1) {
      const owner = occupants[0];
      owner.kingTime = (owner.kingTime || 0) + dt;
      owner.score = Math.floor(owner.kingTime);
      if (owner.kingTime >= game.target) endMatch(owner);
    }
  }
  function updateCapture() {
    if (!game.flag) return;
    if (game.flag.carrier && game.flag.carrier.dead) {
      game.flag.x = game.flag.carrier.x;
      game.flag.z = game.flag.carrier.z;
      game.flag.carrier = null;
    }
    if (!game.flag.carrier) {
      const finder = ents.find(function (entity) {
        return !entity.dead && Math.hypot(entity.x - game.flag.x, entity.z - game.flag.z) < 2;
      });
      if (finder) game.flag.carrier = finder;
    } else {
      const carrier = game.flag.carrier;
      game.flag.x = carrier.x;
      game.flag.z = carrier.z;
      const goalZ = carrier.team === 1 ? 58 : -58;
      if (Math.abs(carrier.z - goalZ) < 5) {
        game.captureScore[carrier.team]++;
        carrier.score += 3;
        game.flag = {x: 0, z: 0, carrier: null, home: 0};
        if (game.captureScore[carrier.team] >= game.target) endMatch(carrier);
      }
    }
  }
  function updatePickups(dt) {
    game.pickups.forEach(function (pickup) {
      pickup.spin += dt * 2.4;
      if (!pickup.active) {
        pickup.respawn -= dt;
        if (pickup.respawn <= 0) pickup.active = true;
        return;
      }
      const collector = ents.find(function (entity) {
        return !entity.dead && Math.hypot(entity.x - pickup.x, entity.z - pickup.z) < 1.35;
      });
      if (!collector) return;
      if (pickup.type === "heal") collector.hp = Math.min(100, collector.hp + 40);
      else if (pickup.type === "speed" && collector === player) game.speedUntil = performance.now() + 8000;
      else if (pickup.type === "shield") collector.shield = 65;
      else if (pickup.type === "ammo") {
        for (let i = 0; i < WEAPONS.length; i++) {
          collector.ress[i] = Math.min(WEAPONS[i].maxRes, collector.ress[i] + WEAPONS[i].mag * 2);
        }
        collector.res = collector.ress[collector.wep];
      } else if (pickup.type === "candy") {
        if (collector === player) {
          profile.candies += pickup.value || 5;
          saveProfile();
          showToast("+" + (pickup.value || 5) + " DOCES");
        }
      } else if (pickup.type === "weapon") {
        const weaponIndex = clamp(pickup.weapon | 0, 0, WEAPONS.length - 1);
        if (collector === player) {
          if (game.tempWeapons.indexOf(weaponIndex) < 0) game.tempWeapons.push(weaponIndex);
          if (player.wep !== weaponIndex) originalSetWeapon(weaponIndex);
          player.mag = player.mags[weaponIndex] = WEAPONS[weaponIndex].mag;
          player.res = player.ress[weaponIndex] = Math.max(player.ress[weaponIndex], WEAPONS[weaponIndex].mag * 2);
          showToast(WEAPONS[weaponIndex].name + " ENCONTRADA PARA ESTA PARTIDA");
          updateWeaponSlots();
        } else {
          collector.wep = weaponIndex;
          collector.mag = collector.mags[weaponIndex] = WEAPONS[weaponIndex].mag;
          collector.res = collector.ress[weaponIndex] = WEAPONS[weaponIndex].mag * 2;
        }
      }
      pickup.active = false;
      pickup.respawn = pickup.type === "weapon" ? 32 : (pickup.type === "candy" ? 15 : 18);
      if (collector === player) {
        vibrate("20,20,20");
        updateHUD();
      }
    });
  }

  function update(dt) {
    if (!player || paused || matchOver) return;
    if (!mapIsComplete() &&
        !game.mapRepairing && performance.now() >= game.mapRepairAt) {
      game.mapRepairAt = performance.now() + 3000;
      if (rebuildSelectedMap()) showToast("CENARIO RESTAURADO");
    }
    game.elapsed += dt;
    game.remaining = Math.max(0, game.remaining - dt);
    if (game.remaining <= 0) {
      endByTimer();
      return;
    }
    ents.forEach(function (entity) {
      if (entity.slow > 0) entity.slow = Math.max(0, entity.slow - dt);
    });
    updatePickups(dt);
    if (game.mode === "team" || game.mode === "capture") updateTeams();
    if (game.mode === "capture") updateCapture();
    if (game.mode === "king") updateKing(dt);
    if (game.mode === "survival") {
      const kills = ents.filter(function (entity) { return entity.bot && entity.dead; }).length;
      game.wave = Math.max(game.wave, 1 + Math.floor(((player && player.score) || 0) / 5));
      if (kills === game.bots && game.bots > 0) player.score += game.wave;
    }
    updateModeLabel();
  }

  function drawPickup(pickup) {
    if (!pickup.active) return;
    const point = project(pickup.x, pickup.y + Math.sin(pickup.spin) * 0.18, pickup.z);
    if (!point || point.d > 80) return;
    const size = clamp(point.s * 0.34, 6, 28);
    const colors = {
      heal: "#63c86a", speed: "#ffcf4d", shield: "#8fd9c8",
      ammo: "#f79a5e", candy: "#f4a6c0", weapon: "#c9b4ec"
    };
    const labels = {heal: "+", speed: ">>", shield: "S", ammo: "M", candy: "D", weapon: "W"};
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(pickup.spin);
    ctx.fillStyle = colors[pickup.type];
    ctx.strokeStyle = "#4a3b33";
    ctx.lineWidth = Math.max(2, 2 * RS);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-size, -size, size * 2, size * 2, size * 0.35);
    else ctx.rect(-size, -size, size * 2, size * 2);
    ctx.fill(); ctx.stroke();
    ctx.rotate(-pickup.spin);
    ctx.fillStyle = "#4a3b33";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 " + Math.max(9, size) + "px sans-serif";
    ctx.fillText(labels[pickup.type], 0, 1);
    ctx.restore();
    if (pickup.type === "weapon" && point.d < 24) {
      ctx.save();
      ctx.fillStyle = "#fffdf7";
      ctx.strokeStyle = "#4a3b33";
      ctx.lineWidth = 3;
      ctx.font = "900 " + Math.max(9, 10 * RS) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.strokeText(WEAPONS[pickup.weapon].name, point.x, point.y - size - 7);
      ctx.fillText(WEAPONS[pickup.weapon].name, point.x, point.y - size - 7);
      ctx.restore();
    }
  }

  function drawThreats() {
    if (!player) return;
    const enemies = ents.filter(function (entity) {
      return entity !== player && !entity.dead && canDamage(player, entity) &&
        Math.hypot(entity.x - player.x, entity.z - player.z) < 24;
    });
    enemies.slice(0, 5).forEach(function (enemy) {
      const angle = Math.atan2(enemy.x - player.x, enemy.z - player.z) - cam.yaw;
      const radius = Math.min(W, H) * 0.39;
      const x = HW + Math.sin(angle) * radius;
      const y = HH - Math.cos(angle) * radius;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-angle);
      ctx.fillStyle = "rgba(232,97,90,.78)";
      ctx.beginPath();
      ctx.moveTo(0, -10 * RS);
      ctx.lineTo(-7 * RS, 5 * RS);
      ctx.lineTo(7 * RS, 5 * RS);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  let minimapCanvas = null;
  let minimapCtx = null;
  function drawMinimap() {
    if (!minimapCanvas || !minimapCtx) return;
    const visible = player && !paused && !matchOver;
    minimapCanvas.classList.toggle("visible", !!visible);
    if (!visible) return;

    const context = minimapCtx;
    const width = minimapCanvas.width;
    const centerX = width / 2;
    const centerY = 99;
    const radius = 68;
    const range = 58;
    context.clearRect(0, 0, width, minimapCanvas.height);

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "rgba(39,31,27,.82)";
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

    context.strokeStyle = "rgba(255,255,255,.18)";
    context.lineWidth = 2;
    [radius * 0.34, radius * 0.67].forEach(function (ring) {
      context.beginPath();
      context.arc(centerX, centerY, ring, 0, Math.PI * 2);
      context.stroke();
    });
    context.beginPath();
    context.moveTo(centerX - radius, centerY);
    context.lineTo(centerX + radius, centerY);
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX, centerY + radius);
    context.stroke();

    const forwardX = -Math.sin(cam.yaw);
    const forwardZ = -Math.cos(cam.yaw);
    const rightX = Math.cos(cam.yaw);
    const rightZ = -Math.sin(cam.yaw);
    let enemyCount = 0;
    ents.forEach(function (entity) {
      if (entity === player || entity.dead || !canDamage(entity, player)) return;
      enemyCount++;
      const dx = entity.x - player.x;
      const dz = entity.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.01) return;
      const mapX = dx * rightX + dz * rightZ;
      const mapForward = dx * forwardX + dz * forwardZ;
      const limited = Math.min(distance, range);
      const scale = radius / range;
      const x = centerX + mapX / distance * limited * scale;
      const y = centerY - mapForward / distance * limited * scale;
      const atEdge = distance > range;
      const pulse = 1 + Math.sin(performance.now() / 180 + distance) * 0.16;

      context.fillStyle = atEdge ? "#ffcf4d" : "#e8615a";
      context.strokeStyle = "#fffdf7";
      context.lineWidth = 2.2;
      context.beginPath();
      context.arc(x, y, (atEdge ? 4.5 : 5.5) * pulse, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });

    context.fillStyle = "#8fd9c8";
    context.strokeStyle = "#fffdf7";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(centerX, centerY - 10);
    context.lineTo(centerX - 7, centerY + 7);
    context.lineTo(centerX, centerY + 4);
    context.lineTo(centerX + 7, centerY + 7);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();

    context.strokeStyle = "#4a3b33";
    context.lineWidth = 7;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "#fffdf7";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(centerX, centerY, radius - 4, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "#fffdf7";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "900 14px sans-serif";
    context.fillText("RADAR · " + enemyCount, centerX, 16);
  }

  function drawObjectives() {
    if (game.mode === "king") {
      const p = project(0, 0.35, 0);
      if (p) {
        ctx.strokeStyle = "#ffcf4d";
        ctx.lineWidth = 4 * RS;
        ctx.beginPath();
        ctx.arc(p.x, p.y, clamp(p.s * 8, 12, 100), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (game.mode === "capture" && game.flag) {
      const p = project(game.flag.x, 2.5, game.flag.z);
      if (p) {
        ctx.fillStyle = "#ffcf4d";
        ctx.font = "900 " + clamp(p.s * 0.8, 12, 30) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("DOCE", p.x, p.y);
      }
    }
  }

  function draw() {
    game.pickups.forEach(drawPickup);
    drawObjectives();
    drawThreats();
    drawMinimap();
  }

  function completeAchievement(id, name) {
    if (profile.achievements.indexOf(id) >= 0) return;
    profile.achievements.push(id);
    profile.xp += 100;
    showToast("CONQUISTA: " + name + " (+100 XP)");
  }
  function calculateLevel() {
    profile.level = Math.max(1, Math.floor(Math.sqrt(profile.xp / 220)) + 1);
    const unlock = Math.min(OUTFITS.length - 1, Math.floor(profile.level / 3));
    if (profile.unlockedSkins.indexOf(unlock) < 0) {
      profile.unlockedSkins.push(unlock);
      showToast("NOVA ROUPA DESBLOQUEADA!");
    }
    const weaponUnlock = Math.min(WEAPON_SKINS.length - 1, Math.floor(profile.level / 4));
    if (profile.unlockedWeaponSkins.indexOf(weaponUnlock) < 0) {
      profile.unlockedWeaponSkins.push(weaponUnlock);
      showToast("NOVA PINTURA DE ARMA!");
    }
  }
  function recordResult(winner) {
    if (!player || game.resultSaved) return;
    game.resultSaved = true;
    const won = winner === player || (winner && winner.team && winner.team === player.team &&
      ["team", "capture", "survival"].indexOf(game.mode) >= 0);
    const accuracy = player.shots ? Math.round((player.hits || 0) / player.shots * 100) : 0;
    const xp = 30 + player.score * 18 + (won ? 100 : 0) + (player.headshots || 0) * 8;
    const candies = 8 + (player.score || 0) * 3 + (won ? 25 : 0) + (player.headshots || 0) * 2;
    profile.matches++;
    profile.wins += won ? 1 : 0;
    profile.kills += player.score || 0;
    profile.deaths += player.deaths || 0;
    profile.headshots += player.headshots || 0;
    profile.shots += player.shots || 0;
    profile.hits += player.hits || 0;
    profile.xp += xp;
    profile.candies += candies;
    profile.daily.kills += player.score || 0;
    profile.daily.matches++;
    profile.history.unshift({
      at: new Date().toISOString(),
      map: game.map,
      mode: game.mode,
      won: won,
      kills: player.score || 0,
      deaths: player.deaths || 0,
      accuracy: accuracy
    });
    profile.history = profile.history.slice(0, HISTORY_LIMIT);
    if (profile.kills >= 1) completeAchievement("first", "PRIMEIRO DOCE");
    if ((player.headshots || 0) >= 5) completeAchievement("heads", "MESTRE DA MIRA");
    if (profile.wins >= 10) completeAchievement("wins10", "REI DO ACUCAR");
    if ((player.bestStreak || 0) >= 5) completeAchievement("streak5", "SEQUENCIA CROCANTE");
    if (!profile.daily.claimed && profile.daily.kills >= 10) {
      profile.daily.claimed = true;
      profile.xp += 150;
      showToast("DESAFIO DIARIO CONCLUIDO! +150 XP");
    }
    calculateLevel();
    saveProfile();
    return {won: won, xp: xp, candies: candies, accuracy: accuracy};
  }

  const END_MATCH_AD_REWARD = 50;
  let rewardAdPending = false;
  let rewardGrantedForResult = false;

  function closeEndMatchRewardOffer() {
    const overlay = document.getElementById("adRewardOverlay");
    if (overlay) overlay.classList.remove("open");
  }

  function showEndMatchRewardOffer() {
    if (!window.SugarAndroid || typeof SugarAndroid.showEndMatchRewardAd !== "function") return;
    const overlay = document.getElementById("adRewardOverlay");
    const watchButton = document.getElementById("adRewardWatch");
    const status = document.getElementById("adRewardStatus");
    if (!overlay || !watchButton || !status) return;
    rewardAdPending = false;
    rewardGrantedForResult = false;
    watchButton.disabled = false;
    status.textContent = "ASSISTA ATE O FIM PARA RECEBER A RECOMPENSA.";
    overlay.classList.add("open");
  }

  function requestEndMatchRewardAd() {
    if (rewardAdPending || rewardGrantedForResult) return;
    const watchButton = document.getElementById("adRewardWatch");
    const status = document.getElementById("adRewardStatus");
    rewardAdPending = true;
    if (watchButton) watchButton.disabled = true;
    if (status) status.textContent = "CARREGANDO ANUNCIO...";
    try {
      SugarAndroid.showEndMatchRewardAd();
    } catch (error) {
      onRewardedInterstitialResult("failed");
    }
  }

  function onRewardedInterstitialResult(result) {
    const status = document.getElementById("adRewardStatus");
    const watchButton = document.getElementById("adRewardWatch");
    rewardAdPending = false;
    if (result === "rewarded") {
      if (rewardGrantedForResult) return;
      rewardGrantedForResult = true;
      profile.candies += END_MATCH_AD_REWARD;
      saveProfile();
      updateCandyHud();
      if (status) status.textContent = "+50 DOCES RECEBIDOS!";
      if (watchButton) watchButton.disabled = true;
      showToast("+50 DOCES DO ANUNCIO!");
      vibrate("0,45,50,80");
      setTimeout(closeEndMatchRewardOffer, 1200);
      return;
    }
    if (watchButton) watchButton.disabled = false;
    if (result === "closed") {
      if (status) status.textContent = "ANUNCIO FECHADO. NENHUM DOCE FOI ADICIONADO.";
    } else {
      if (status) status.textContent = "ANUNCIO INDISPONIVEL AGORA. TENTE NA PROXIMA PARTIDA.";
    }
    setTimeout(closeEndMatchRewardOffer, 1800);
  }

  endMatch = function (winner) {
    if (matchOver) return;
    const result = recordResult(winner);
    originalEndMatch(winner);
    if (!result) return;
    const ptxt = document.getElementById("ptxt");
    const existing = ptxt.innerHTML;
    ptxt.innerHTML =
      '<div class="resultSummary">' +
      '<b>' + (result.won ? "VITORIA" : "PARTIDA CONCLUIDA") + ' · +' + result.xp +
      ' XP · +' + result.candies + ' DOCES</b>' +
      '<div class="resultGrid">' +
      '<span>ABATES<strong>' + (player.score || 0) + '</strong></span>' +
      '<span>MORTES<strong>' + (player.deaths || 0) + '</strong></span>' +
      '<span>PRECISAO<strong>' + result.accuracy + '%</strong></span>' +
      '<span>HEADSHOTS<strong>' + (player.headshots || 0) + '</strong></span>' +
      '</div></div>' + existing;
    panelEl.classList.add("result-pop");
    setTimeout(function () { panelEl.classList.remove("result-pop"); }, 650);
    setTimeout(showEndMatchRewardOffer, 850);
  };

  function showToast(text) {
    let toast = document.getElementById("sugarToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "sugarToast";
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove("show"); }, 2600);
  }

  function updateModeLabel() {
    const names = {
      deathmatch: "MATA-MATA", team: "EQUIPES", capture: "CAPTURAR O DOCE",
      king: "REI DO POTE", survival: "SOBREVIVENCIA"
    };
    const maps = {
      village: "VILA CONFEITO", factory: "FABRICA DE CHOCOLATE",
      park: "PARQUE DE PIRULITOS", castle: "CASTELO DE BOLO"
    };
    const timer = Math.ceil(game.remaining);
    const min = Math.floor(timer / 60);
    const sec = String(timer % 60).padStart(2, "0");
    const label = document.getElementById("modeHud");
    if (!label) return;
    let extra = "";
    if (game.mode === "team") extra = " · " + game.teamScore[1] + " x " + game.teamScore[2];
    if (game.mode === "capture") extra = " · " + game.captureScore[1] + " x " + game.captureScore[2];
    if (game.mode === "king") {
      const king = ents.slice().sort(function (a, b) {
        return (b.kingTime || 0) - (a.kingTime || 0);
      })[0];
      extra = king ? " · " + king.name.slice(0, 7) + " " + Math.floor(king.kingTime || 0) : "";
    }
    if (game.mode === "survival") extra = " · ONDA " + game.wave;
    label.textContent = maps[game.map] + " · " + names[game.mode] + extra + " · " + min + ":" + sec;
  }

  function modal(title, html) {
    let root = document.getElementById("sugarModal");
    if (!root) {
      root = document.createElement("div");
      root.id = "sugarModal";
      root.innerHTML = '<div class="sugarCard"><h2 id="sugarModalTitle"></h2><div id="sugarModalBody"></div><button id="sugarModalClose" class="big-btn sub-btn">FECHAR</button></div>';
      document.body.appendChild(root);
      root.addEventListener("click", function (event) {
        if (event.target === root || event.target.id === "sugarModalClose") root.classList.remove("open");
      });
    }
    document.getElementById("sugarModalTitle").textContent = title;
    document.getElementById("sugarModalBody").innerHTML = html;
    root.classList.add("open");
    return root;
  }

  function bindSetting(id, key, converter) {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("input", function () {
      settings[key] = converter ? converter(input.value) : input.value;
      saveSettings();
    });
    input.addEventListener("change", function () {
      settings[key] = input.type === "checkbox" ? input.checked :
        (converter ? converter(input.value) : input.value);
      saveSettings();
    });
  }

  function openSettings() {
    modal("CONFIGURACOES",
      '<div class="settingGrid">' +
      '<label>VOLUME<input id="setVolume" type="range" min="0" max="100" value="' + Math.round(settings.volume * 100) + '"></label>' +
      '<label>MUSICA<input id="setMusic" type="range" min="0" max="100" value="' + Math.round(settings.music * 100) + '"></label>' +
      '<label>MIRA HORIZONTAL<input id="setSensX" type="range" min="2" max="12" step=".2" value="' + (settings.touchSensX * 1000) + '"></label>' +
      '<label>MIRA VERTICAL<input id="setSensY" type="range" min="2" max="12" step=".2" value="' + (settings.touchSensY * 1000) + '"></label>' +
      '<label>ASSISTENCIA DE MIRA<input id="setAim" type="range" min="0" max="100" value="' + Math.round(settings.aimAssist * 100) + '"></label>' +
      '<label>TAMANHO DOS CONTROLES<input id="setScale" type="range" min="70" max="140" value="' + Math.round(settings.controlsScale * 100) + '"></label>' +
      '<label>GRAFICOS<select id="setGraphics"><option value="high">ALTO</option><option value="medium">MEDIO</option><option value="low">LEVE</option></select></label>' +
      '<label>LIMITE DE FPS<select id="setFps"><option>30</option><option>45</option><option>60</option></select></label>' +
      '<label class="checkRow">VIBRACAO <input id="setHaptics" type="checkbox" ' + (settings.haptics ? "checked" : "") + '></label>' +
      '</div><button id="setMove" class="big-btn sub-btn">REPOSICIONAR CONTROLES</button>');
    document.getElementById("setGraphics").value = settings.graphics;
    document.getElementById("setFps").value = String(settings.fps);
    bindSetting("setVolume", "volume", function (v) { return v / 100; });
    bindSetting("setMusic", "music", function (v) { return v / 100; });
    bindSetting("setSensX", "touchSensX", function (v) { return v / 1000; });
    bindSetting("setSensY", "touchSensY", function (v) { return v / 1000; });
    bindSetting("setAim", "aimAssist", function (v) { return v / 100; });
    bindSetting("setScale", "controlsScale", function (v) { return v / 100; });
    bindSetting("setGraphics", "graphics");
    bindSetting("setFps", "fps", function (v) { return parseInt(v, 10); });
    bindSetting("setHaptics", "haptics");
    document.getElementById("setMove").addEventListener("click", beginControlEdit);
  }

  function openProfile() {
    const next = Math.pow(profile.level, 2) * 220;
    const history = profile.history.length
      ? profile.history.map(function (item) {
          return '<div class="historyRow"><b>' + (item.won ? "VITORIA" : "PARTIDA") + '</b><span>' +
            item.kills + 'A/' + item.deaths + 'M · ' + item.accuracy + '%</span></div>';
        }).join("")
      : '<p>Nenhuma partida registrada.</p>';
    const skins = profile.unlockedSkins.map(function (skin) {
      return '<button class="skinPick ' + (profile.skin === skin ? "on" : "") + '" data-skin="' + skin +
        '" style="background:' + SKINS[skin].b + '">' + escapeHtml(OUTFITS[skin].name) + '</button>';
    }).join("");
    const weaponSkins = profile.unlockedWeaponSkins.map(function (skin) {
      const colors = WEAPON_SKINS[skin].colors;
      const style = colors[0]
        ? 'background:linear-gradient(135deg,' + colors[0] + ' 50%,' + colors[1] + ' 50%)'
        : 'background:#f0e6da';
      return '<button class="weaponSkinPick ' + (profile.weaponSkin === skin ? "on" : "") +
        '" data-weapon-skin="' + skin + '" style="' + style + '">' +
        escapeHtml(WEAPON_SKINS[skin].name) + '</button>';
    }).join("");
    modal("PERFIL · NIVEL " + profile.level,
      '<label class="profileName">NOME<input id="profileName" maxlength="14" value="' + escapeHtml(profile.name) + '"></label>' +
      '<div class="xpBar"><i style="width:' + clamp(profile.xp / next * 100, 0, 100) + '%"></i></div>' +
      '<p><b>' + profile.xp + ' XP</b> · <b>' + profile.candies + ' DOCES</b> · ' +
      profile.wins + ' vitorias · ' + profile.kills + ' abates</p>' +
      '<h3>ROUPAS DESBLOQUEADAS</h3><div class="skinList">' + skins + '</div>' +
      '<h3>PINTURAS DE ARMA</h3><div class="skinList">' + weaponSkins + '</div>' +
      '<h3>DESAFIO DIARIO</h3><p>' + Math.min(10, profile.daily.kills) + '/10 abates ' +
      (profile.daily.claimed ? '· CONCLUIDO' : '· recompensa 150 XP') + '</p>' +
      '<h3>CONQUISTAS (' + profile.achievements.length + '/4)</h3>' +
      '<p>' + (profile.achievements.join(" · ") || "Continue jogando para desbloquear.") + '</p>' +
      '<h3>ULTIMAS PARTIDAS</h3><div class="historyList">' + history + '</div>');
    document.getElementById("profileName").addEventListener("change", function (event) {
      profile.name = event.target.value.replace(/[<>]/g, "").trim().slice(0, 14) || "CONFEITEIRO";
      try { localStorage.setItem("sugarstrike.player", profile.name); } catch (error) {}
      saveProfile();
    });
    document.querySelectorAll(".skinPick").forEach(function (button) {
      button.addEventListener("click", function () {
        profile.skin = parseInt(button.dataset.skin, 10);
        saveProfile();
        document.querySelectorAll(".skinPick").forEach(function (b) { b.classList.remove("on"); });
        button.classList.add("on");
      });
    });
    document.querySelectorAll(".weaponSkinPick").forEach(function (button) {
      button.addEventListener("click", function () {
        profile.weaponSkin = parseInt(button.dataset.weaponSkin, 10);
        saveProfile();
        document.querySelectorAll(".weaponSkinPick").forEach(function (b) { b.classList.remove("on"); });
        button.classList.add("on");
      });
    });
  }

  function updateCandyHud() {
    const hud = document.getElementById("candyHud");
    if (hud) hud.textContent = "DOCES " + Math.floor(profile.candies);
  }

  // Os dois espacos do HUD apontam sempre para o que esta equipado.
  function updateWeaponSlots() {
    document.querySelectorAll("#slots .slot").forEach(function (slot) {
      const seat = parseInt(slot.dataset.slot, 10) || 0;
      const index = clamp(LOADOUT[seat] | 0, 0, WEAPONS.length - 1);
      const weapon = WEAPONS[index];
      const available = canUseWeapon(index);
      slot.dataset.w = String(index);
      slot.classList.toggle("locked", !available);
      slot.textContent = available ? String(seat + 1) : "$";
      slot.title = weapon.name + (available ? "" : " · BLOQUEADA");
    });
  }

  // Converte um numero cru em barrinhas, para dar para comparar de relance.
  function bar(value, best, invert) {
    const ratio = clamp(invert ? best / Math.max(value, 0.0001) : value / best, 0, 1);
    const filled = Math.max(1, Math.round(ratio * 5));
    return '<i class="statBar"><b style="width:' + (filled * 20) + '%"></b></i>';
  }
  function weaponStats(weapon) {
    // Quem tem luneta e julgado pela mira no olho, nao pelo tiro de quadril.
    const aim = weapon.scope ? weapon.scope.spread : weapon.spread;
    const rows = [
      ["DANO", bar(weapon.dmg * weapon.pellets, 110), weapon.dmg * (weapon.pellets > 1 ? weapon.pellets : 1)],
      ["ALCANCE", bar(weapon.range, 175), Math.round(weapon.range) + "m"],
      ["PRECISAO", bar(aim, 0.0028, true), ""],
      ["CADENCIA", bar(weapon.rate, 0.066, true), ""],
      ["MOBILIDADE", bar(1 - (weapon.weight || 0), 1), ""]
    ];
    return '<div class="statList">' + rows.map(function (row) {
      return '<span class="statRow"><em>' + row[0] + '</em>' + row[1] +
        '<u>' + row[2] + '</u></span>';
    }).join("") + '</div>';
  }
  function priceTag(price, owned) {
    if (owned) return "COMPRADO";
    return price === 0 ? "GRATIS" : price + " DOCES";
  }

  let shopTab = "primary";
  function shopCardsFor(tab) {
    if (tab === "primary" || tab === "accessory") {
      const pool = tab === "primary" ? PRIMARIES : ACCESSORIES;
      return pool.map(function (index) {
        const weapon = WEAPONS[index];
        const owned = ownsWeapon(index);
        const equipped = (tab === "primary" ? profile.primary : profile.accessory) === index;
        const action = equipped ? "EQUIPADA" : (owned ? "EQUIPAR" : "COMPRAR · " + priceTag(weapon.price, false));
        return '<div class="shopCard ' + (equipped ? "equipped" : "") + '">' +
          '<div class="shopHead"><b>' + escapeHtml(weapon.name) + '</b>' +
          '<span class="shopRole">' + escapeHtml(weapon.role) + '</span></div>' +
          '<small>' + escapeHtml(weapon.desc) + '</small>' +
          weaponStats(weapon) +
          '<button class="shopBuy big-btn sub-btn" data-kind="' + tab + '" data-item="' + index + '" ' +
          (equipped ? "disabled" : "") + '>' + action + '</button></div>';
      }).join("");
    }
    if (tab === "outfit") {
      return OUTFITS.map(function (outfit, index) {
        const owned = profile.unlockedSkins.indexOf(index) >= 0;
        const equipped = profile.skin === index;
        const skin = SKINS[index];
        return '<div class="shopCard ' + (equipped ? "equipped" : "") + '">' +
          '<div class="shopHead"><b>' + escapeHtml(outfit.name) + '</b></div>' +
          '<div class="swatch"><i style="background:' + skin.b + '"></i>' +
          '<i style="background:' + skin.h + '"></i><i style="background:' + skin.p + '"></i></div>' +
          '<small>Muda as cores do seu confeiteiro.</small>' +
          '<button class="shopBuy big-btn sub-btn" data-kind="outfit" data-item="' + index + '" ' +
          (equipped ? "disabled" : "") + '>' +
          (equipped ? "VESTIDA" : (owned ? "VESTIR" : "COMPRAR · " + priceTag(outfit.price, false))) +
          '</button></div>';
      }).join("");
    }
    if (tab === "skin") {
      return WEAPON_SKINS.map(function (item, index) {
        const owned = profile.unlockedWeaponSkins.indexOf(index) >= 0;
        const equipped = profile.weaponSkin === index;
        const colors = item.colors;
        const swatch = colors[0]
          ? '<div class="swatch"><i style="background:' + colors[0] + '"></i><i style="background:' + colors[1] + '"></i></div>'
          : '<div class="swatch"><i style="background:#f0e6da"></i></div>';
        return '<div class="shopCard ' + (equipped ? "equipped" : "") + '">' +
          '<div class="shopHead"><b>' + escapeHtml(item.name) + '</b></div>' + swatch +
          '<small>' + (colors[0] ? "Repinta qualquer arma equipada." : "Cada arma fica com a cor de fabrica.") + '</small>' +
          '<button class="shopBuy big-btn sub-btn" data-kind="skin" data-item="' + index + '" ' +
          (equipped ? "disabled" : "") + '>' +
          (equipped ? "EM USO" : (owned ? "USAR" : "COMPRAR · " + priceTag(item.price, false))) +
          '</button></div>';
      }).join("");
    }
    return GEAR.map(function (item, index) {
      const owned = profile.unlockedGear.indexOf(index) >= 0;
      const equipped = profile.gear === index;
      return '<div class="shopCard ' + (equipped ? "equipped" : "") + '">' +
        '<div class="shopHead"><b>' + escapeHtml(item.name) + '</b></div>' +
        '<small>' + escapeHtml(item.desc) + '</small>' +
        '<button class="shopBuy big-btn sub-btn" data-kind="gear" data-item="' + index + '" ' +
        (equipped ? "disabled" : "") + '>' +
        (equipped ? "EQUIPADO" : (owned ? "EQUIPAR" : "COMPRAR · " + priceTag(item.price, false))) +
        '</button></div>';
    }).join("");
  }

  function priceOf(kind, index) {
    if (kind === "primary" || kind === "accessory") return WEAPONS[index].price;
    if (kind === "outfit") return OUTFITS[index].price;
    if (kind === "skin") return WEAPON_SKINS[index].price;
    return GEAR[index].price;
  }
  function alreadyOwns(kind, index) {
    if (kind === "primary" || kind === "accessory") return ownsWeapon(index);
    if (kind === "outfit") return profile.unlockedSkins.indexOf(index) >= 0;
    if (kind === "skin") return profile.unlockedWeaponSkins.indexOf(index) >= 0;
    return profile.unlockedGear.indexOf(index) >= 0;
  }
  function registerPurchase(kind, index) {
    if (kind === "primary" || kind === "accessory") profile.ownedWeapons.push(index);
    else if (kind === "outfit") profile.unlockedSkins.push(index);
    else if (kind === "skin") profile.unlockedWeaponSkins.push(index);
    else profile.unlockedGear.push(index);
  }
  function equipItem(kind, index) {
    if (kind === "primary") { profile.primary = index; syncLoadout(); }
    else if (kind === "accessory") { profile.accessory = index; syncLoadout(); }
    else if (kind === "outfit") profile.skin = index;
    else if (kind === "skin") profile.weaponSkin = index;
    else profile.gear = index;
  }
  function itemName(kind, index) {
    if (kind === "primary" || kind === "accessory") return WEAPONS[index].name;
    if (kind === "outfit") return OUTFITS[index].name;
    if (kind === "skin") return WEAPON_SKINS[index].name;
    return GEAR[index].name;
  }

  function openShop(tab) {
    shopTab = tab || shopTab;
    const tabs = [
      ["primary", "ARMAS"], ["accessory", "ACESSORIOS"],
      ["outfit", "ROUPAS"], ["skin", "PINTURAS"], ["gear", "EQUIPAMENTOS"]
    ].map(function (item) {
      return '<button class="shopTab ' + (shopTab === item[0] ? "on" : "") +
        '" data-tab="' + item[0] + '">' + item[1] + '</button>';
    }).join("");
    modal("LOJA DE DOCES",
      '<div class="shopBalance">SALDO <strong>' + Math.floor(profile.candies) + ' DOCES</strong></div>' +
      '<div class="loadoutNow">LEVANDO: <b>' + escapeHtml(WEAPONS[profile.primary].name) +
      '</b> + <b>' + escapeHtml(WEAPONS[profile.accessory].name) + '</b></div>' +
      '<div class="shopTabs">' + tabs + '</div>' +
      '<p class="shopHint">Voce leva uma arma principal e um acessorio por partida. ' +
      'O que e comprado fica para sempre; o que aparece na fase dura so a partida.</p>' +
      '<div class="shopGrid">' + shopCardsFor(shopTab) + '</div>');
    document.querySelectorAll(".shopTab").forEach(function (button) {
      button.addEventListener("click", function () { openShop(button.dataset.tab); });
    });
    document.querySelectorAll(".shopBuy").forEach(function (button) {
      button.addEventListener("click", function () {
        const kind = button.dataset.kind;
        const index = parseInt(button.dataset.item, 10);
        if (!alreadyOwns(kind, index)) {
          const price = priceOf(kind, index);
          if (profile.candies < price) {
            showToast("FALTAM " + Math.ceil(price - profile.candies) + " DOCES");
            vibrate(45);
            return;
          }
          profile.candies -= price;
          registerPurchase(kind, index);
          showToast(itemName(kind, index) + " COMPRADO!");
          vibrate("20,30,40");
        }
        equipItem(kind, index);
        saveProfile();
        updateWeaponSlots();
        if (player && player.skin && kind === "outfit") player.skin = selectedSkin();
        openShop(kind === "gear" ? "gear" : shopTab);
      });
    });
  }

  function confirmExitGame() {
    modal("SAIR DO JOGO?",
      '<p>Seu progresso e seus doces ja estao salvos.</p>' +
      '<button id="confirmExitGame" class="big-btn menuDanger">SIM, SAIR</button>');
    document.getElementById("confirmExitGame").addEventListener("click", function () {
      saveProfile();
      try {
        if (window.SugarAndroid && SugarAndroid.exitGame) SugarAndroid.exitGame();
        else window.close();
      } catch (error) {
        window.close();
      }
    });
  }

  function openMatchConfig() {
    modal("PARTIDA SOLO",
      '<div class="settingGrid">' +
      '<label>MODO<select id="soloMode"><option value="deathmatch">MATA-MATA</option><option value="team">EQUIPES</option><option value="capture">CAPTURAR O DOCE</option><option value="king">REI DO POTE</option><option value="survival">SOBREVIVENCIA</option></select></label>' +
      '<label>MAPA<select id="soloMap"><option value="village">VILA CONFEITO</option><option value="factory">FABRICA DE CHOCOLATE</option><option value="park">PARQUE DE PIRULITOS</option><option value="castle">CASTELO DE BOLO</option></select></label>' +
      '<label>BOTS<input id="soloBots" type="number" min="0" max="12" value="' + game.bots + '"></label>' +
      '<label>META<input id="soloTarget" type="number" min="5" max="100" value="' + game.target + '"></label>' +
      '<label>DURACAO<select id="soloDuration"><option value="3">3 MIN</option><option value="5">5 MIN</option><option value="8">8 MIN</option><option value="12">12 MIN</option></select></label>' +
      '</div><button id="soloApply" class="big-btn">APLICAR</button>');
    document.getElementById("soloMode").value = game.mode;
    document.getElementById("soloMap").value = game.map;
    document.getElementById("soloDuration").value = String(game.duration);
    document.getElementById("soloApply").addEventListener("click", function () {
      game.mode = document.getElementById("soloMode").value;
      game.map = document.getElementById("soloMap").value;
      game.bots = clamp(parseInt(document.getElementById("soloBots").value, 10) || 0, 0, 12);
      game.target = clamp(parseInt(document.getElementById("soloTarget").value, 10) || 25, 5, 100);
      game.duration = parseInt(document.getElementById("soloDuration").value, 10) || 5;
      try {
        localStorage.setItem("sugarstrike.match.v11", JSON.stringify({
          map: game.map, mode: game.mode, bots: game.bots,
          target: game.target, duration: game.duration
        }));
      } catch (error) {}
      TARGET = game.target;
      targetV.textContent = TARGET;
      syncConfigUi();
      document.getElementById("sugarModal").classList.remove("open");
      showToast("PARTIDA CONFIGURADA");
    });
  }

  function syncConfigUi() {
    const map = document.getElementById("netMap");
    if (map) {
      document.getElementById("netMode").value = game.mode;
      map.value = game.map;
      document.getElementById("netBots").value = game.bots;
      document.getElementById("netTarget").value = game.target;
      document.getElementById("netDuration").value = game.duration;
    }
  }
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char];
    });
  }

  function beginControlEdit() {
    document.getElementById("sugarModal").classList.remove("open");
    document.body.classList.add("control-edit");
    showToast("ARRASTE OS CONTROLES · TOQUE EM SALVAR");
    document.getElementById("controlSave").classList.add("show");
  }
  function makeDraggable(element) {
    let active = false;
    function move(clientX, clientY) {
      if (!active || !document.body.classList.contains("control-edit")) return;
      const left = clamp(clientX - element.offsetWidth / 2, 4, innerWidth - element.offsetWidth - 4);
      const top = clamp(clientY - element.offsetHeight / 2, 4, innerHeight - element.offsetHeight - 4);
      element.style.left = left + "px";
      element.style.top = top + "px";
      element.style.right = "auto";
      element.style.bottom = "auto";
      element.style.transform = element.id === "slots" ? "none" : element.style.transform;
    }
    element.addEventListener("pointerdown", function (event) {
      if (!document.body.classList.contains("control-edit")) return;
      active = true;
      element.setPointerCapture(event.pointerId);
      move(event.clientX, event.clientY);
    });
    element.addEventListener("pointermove", function (event) { move(event.clientX, event.clientY); });
    element.addEventListener("pointerup", function () {
      if (!active) return;
      active = false;
      settings.controlPositions[element.id] = {
        x: parseFloat(element.style.left) / innerWidth,
        y: parseFloat(element.style.top) / innerHeight
      };
    });
  }
  function applyControlStyle() {
    document.documentElement.style.setProperty("--control-scale", settings.controlsScale);
    ["stick", "bFire", "bJump", "bReload", "bSprint", "slots"].forEach(function (id) {
      const element = document.getElementById(id);
      const pos = settings.controlPositions[id];
      if (!element || !pos) return;
      element.style.left = Math.round(pos.x * innerWidth) + "px";
      element.style.top = Math.round(pos.y * innerHeight) + "px";
      element.style.right = "auto";
      element.style.bottom = "auto";
      if (id === "slots") element.style.transform = "none";
    });
    resize();
  }

  let sprintHeld = false;
  function installControls() {
    const sprint = document.createElement("div");
    sprint.id = "bSprint";
    sprint.className = "tbtn";
    sprint.textContent = "CORRER";
    document.getElementById("hud").appendChild(sprint);
    if (isTouch) sprint.style.display = "flex";
    sprint.addEventListener("pointerdown", function (event) {
      event.preventDefault(); sprintHeld = true; keys.ShiftLeft = true;
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
      sprint.addEventListener(name, function () { sprintHeld = false; keys.ShiftLeft = false; });
    });
    const save = document.createElement("button");
    save.id = "controlSave";
    save.textContent = "SALVAR POSICOES";
    document.body.appendChild(save);
    save.addEventListener("click", function () {
      document.body.classList.remove("control-edit");
      save.classList.remove("show");
      saveSettings();
      showToast("CONTROLES SALVOS");
    });
    ["stick", "bFire", "bJump", "bReload", "bSprint", "slots"].forEach(function (id) {
      makeDraggable(document.getElementById(id));
    });
  }

  // Sao so dois espacos fixos, ja escritos no HTML; aqui so o texto e ajustado.
  function installWeaponSlots() {
    updateWeaponSlots();
  }

  let menuMusicTimer = 0;
  function startMenuMusic() {
    if (menuMusicTimer) return;
    menuMusicTimer = setInterval(function () {
      if (!paused || settings.music <= 0) return;
      snd.resume();
      const notes = [523, 659, 784, 659, 587, 698, 880, 698];
      const note = notes[(Date.now() / 420 | 0) % notes.length];
      try {
        const old = settings.volume;
        settings.volume *= settings.music * 0.18;
        snd.shotFar(note, 0);
        settings.volume = old;
      } catch (error) {}
    }, 420);
  }

  function showTutorial() {
    try {
      if (localStorage.getItem("sugarstrike.tutorial.v12")) return;
      localStorage.setItem("sugarstrike.tutorial.v12", "1");
    } catch (error) {}
    modal("COMO JOGAR",
      '<div class="tutorial">' +
      '<div><b>1. MOVA</b><span>Use o joystick esquerdo.</span></div>' +
      '<div><b>2. MIRE</b><span>Arraste o lado direito da tela.</span></div>' +
      '<div><b>3. EQUIPE</b><span>Voce leva UMA arma principal e UM acessorio. Troque no botao 1 e 2.</span></div>' +
      '<div><b>4. COLETE</b><span>Pegue municao, armas emprestadas e doces espalhados pela fase.</span></div>' +
      '<div><b>5. EVOLUA</b><span>Gaste os doces na loja em armas, roupas, pinturas e equipamentos.</span></div>' +
      '<div><b>6. JOGUE ONLINE</b><span>Crie uma sala com nome ou entre em qualquer sala da lista.</span></div>' +
      '</div>');
  }

  function installUi() {
    const style = document.createElement("style");
    style.textContent =
      ":root{--control-scale:1}" +
      "#bSprint{right:142px;bottom:126px;width:70px;height:70px;background:rgba(255,207,77,.62)}" +
      ".android-app #bSprint{right:calc(142px + env(safe-area-inset-right));bottom:calc(126px + env(safe-area-inset-bottom))}" +
      ".android-app #stick,.android-app .tbtn,.android-app #slots{scale:var(--control-scale)}" +
      "#menuExtras{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}" +
      "#menuExtras .big-btn{margin:0;font-size:10px;padding:8px 4px;letter-spacing:.45px;line-height:1.1;min-height:42px}" +
      ".menuDanger{background:#e8615a!important;color:#fffdf7!important}" +
      "#panel.pause-panel h2{display:none}#panel.pause-panel #sensWrap{margin-top:2px}" +
      "#modeHud{position:absolute;left:50%;top:76px;transform:translateX(-50%);font-size:10px;letter-spacing:1px;white-space:nowrap}" +
      "#candyHud{position:absolute;right:12px;top:76px;font-size:10px;letter-spacing:1px;background:#ffcf4d}" +
      "#minimap{position:absolute;z-index:9;right:170px;top:48px;width:84px;height:84px;pointer-events:none;opacity:0;transform:scale(.9);transition:opacity .18s,transform .18s;filter:drop-shadow(0 4px 0 rgba(0,0,0,.24))}" +
      "#minimap.visible{opacity:1;transform:scale(1)}" +
      "#sugarModal{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;background:rgba(30,22,18,.78);padding:14px}" +
      "#sugarModal.open{display:flex}.sugarCard{width:min(560px,100%);max-height:92vh;overflow:auto;touch-action:pan-y;overscroll-behavior:contain;background:#fffdf7;border:5px solid #4a3b33;border-radius:24px;padding:18px;color:#4a3b33;text-align:center}" +
      ".sugarCard h2{color:#e8615a;margin-bottom:10px}.sugarCard h3{font-size:12px;letter-spacing:1px;margin:14px 0 5px}" +
      ".settingGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.settingGrid label,.profileName{display:flex;flex-direction:column;text-align:left;font-size:10px;font-weight:900;letter-spacing:1px}" +
      ".settingGrid input,.settingGrid select,.profileName input{width:100%;height:40px;border:2px solid #4a3b33;border-radius:10px;padding:5px;background:#f7efe5;color:#4a3b33;font-weight:800}" +
      ".checkRow{flex-direction:row!important;align-items:center;justify-content:space-between}.checkRow input{width:28px!important}" +
      ".resultGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}.resultGrid span{background:#f0e6da;border-radius:9px;padding:6px;font-size:9px}.resultGrid strong{display:block;font-size:17px}" +
      ".result-pop{animation:resultPop .55s cubic-bezier(.2,1.6,.4,1)}@keyframes resultPop{from{transform:scale(.7) rotate(-2deg)}to{transform:scale(1)}}" +
      "#sugarToast{position:fixed;z-index:110;left:50%;top:14%;transform:translate(-50%,-30px);opacity:0;background:#ffcf4d;border:3px solid #4a3b33;border-radius:14px;padding:10px 16px;font-weight:900;transition:.25s;pointer-events:none}" +
      "#sugarToast.show{transform:translate(-50%,0);opacity:1}" +
      "#controlSave{position:fixed;z-index:120;left:50%;top:18px;transform:translateX(-50%);display:none;background:#ffcf4d;border:4px solid #4a3b33;border-radius:14px;padding:10px;font-weight:900}" +
      "#controlSave.show{display:block}.control-edit #stick,.control-edit .tbtn,.control-edit #slots{outline:4px dashed #ffcf4d!important;display:flex!important;pointer-events:auto!important}" +
      ".xpBar{height:16px;background:#f0e6da;border:2px solid #4a3b33;border-radius:9px;overflow:hidden;margin:9px 0}.xpBar i{display:block;height:100%;background:#8fd9c8}" +
      ".skinList{display:flex;gap:6px;overflow:auto}.skinPick,.weaponSkinPick{min-width:80px;border:3px solid #4a3b33;border-radius:10px;padding:8px;font-weight:900;color:#4a3b33}.skinPick.on,.weaponSkinPick.on{outline:4px solid #ffcf4d}" +
      ".historyRow{display:flex;justify-content:space-between;background:#f0e6da;border-radius:8px;padding:6px;margin:4px 0;font-size:11px}" +
      ".slot.locked{opacity:.48;filter:grayscale(1);border-style:dashed}.shopBalance{background:#ffcf4d;border:3px solid #4a3b33;border-radius:14px;padding:10px;margin-bottom:8px}.shopBalance strong{font-size:18px}.shopHint{font-size:11px;margin:6px 0}.shopGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.shopCard{display:flex;flex-direction:column;gap:5px;text-align:left;background:#f0e6da;border:3px solid #4a3b33;border-radius:14px;padding:9px}.shopCard.equipped{outline:4px solid #ffcf4d}.shopCard small{display:block;font-size:9px;line-height:1.35;opacity:.78}.shopCard .shopBuy{margin:6px 0 0;font-size:10px;padding:8px;width:100%}.shopCard .shopBuy:disabled{opacity:.65}" +
      ".shopHead{display:flex;align-items:baseline;justify-content:space-between;gap:6px}.shopHead b{font-size:11px;letter-spacing:.4px;line-height:1.2}.shopRole{flex:0 0 auto;font-size:7px;font-weight:900;letter-spacing:.6px;background:#c9b4ec;border:2px solid #4a3b33;border-radius:7px;padding:2px 5px}" +
      ".shopTabs{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.shopTab{flex:1 1 auto;border:3px solid #4a3b33;border-radius:11px;background:#fffdf7;color:#4a3b33;font:900 9px ui-rounded,'Trebuchet MS',sans-serif;letter-spacing:.5px;padding:8px 5px}.shopTab.on{background:#ffcf4d}" +
      ".loadoutNow{background:#8fd9c8;border:3px solid #4a3b33;border-radius:12px;padding:7px;font-size:10px;font-weight:900;letter-spacing:.4px}" +
      ".statList{display:grid;gap:3px;margin-top:2px}.statRow{display:grid;grid-template-columns:52px 1fr 30px;align-items:center;gap:5px;font-size:8px;font-weight:900}.statRow em{font-style:normal;opacity:.68}.statRow u{text-decoration:none;text-align:right;opacity:.68}.statBar{display:block;height:7px;border:2px solid #4a3b33;border-radius:5px;background:#fffdf7;overflow:hidden}.statBar b{display:block;height:100%;background:#e8615a}" +
      ".swatch{display:flex;gap:4px}.swatch i{flex:1;height:22px;border:2px solid #4a3b33;border-radius:7px}" +
      ".tutorial{display:grid;gap:8px;text-align:left}.tutorial div{background:#f0e6da;border-radius:12px;padding:10px}.tutorial b,.tutorial span{display:block}.tutorial span{font-size:12px;margin-top:3px}" +
      "#adRewardOverlay{position:fixed;inset:0;z-index:130;display:none;align-items:center;justify-content:center;background:rgba(30,22,18,.84);padding:16px}" +
      "#adRewardOverlay.open{display:flex}.adRewardCard{width:min(430px,100%);background:#fffdf7;border:5px solid #4a3b33;border-radius:24px;padding:20px;color:#4a3b33;text-align:center;filter:drop-shadow(0 9px 0 rgba(0,0,0,.24))}" +
      ".adRewardGift{font-size:42px;line-height:1}.adRewardCard h2{margin:5px 0;color:#e8615a}.adRewardCard strong{color:#ba4c99}.adRewardCard p{font-size:12px;font-weight:800}.adRewardActions{display:grid;grid-template-columns:1.3fr .8fr;gap:8px;margin-top:12px}.adRewardActions .big-btn{margin:0}.adRewardStatus{min-height:18px;margin-top:8px!important;font-size:9px!important;letter-spacing:.6px}" +
      "@media(max-width:560px){#menuExtras{grid-template-columns:repeat(2,1fr)}.settingGrid,.shopGrid{grid-template-columns:1fr}.resultGrid{grid-template-columns:1fr 1fr}#modeHud{top:55px;font-size:7px;max-width:62%;overflow:hidden;text-overflow:ellipsis}#candyHud{top:54px;font-size:8px}#minimap{right:142px;top:42px;width:76px;height:76px}#slots{gap:3px}.slot{width:32px}}" ;
    document.head.appendChild(style);

    const extras = document.createElement("div");
    extras.id = "menuExtras";
    extras.innerHTML =
      '<button id="bSoloConfig" class="big-btn sub-btn">CONFIGURAR PARTIDA</button>' +
      '<button id="bSettings" class="big-btn sub-btn">CONFIGURACOES</button>' +
      '<button id="bProfile" class="big-btn sub-btn">PERFIL E PROGRESSO</button>' +
      '<button id="bTutorial" class="big-btn sub-btn">COMO JOGAR</button>' +
      '<button id="bShop" class="big-btn sub-btn">LOJA E EQUIPAR</button>' +
      '<button id="bExitGame" class="big-btn menuDanger">SAIR DO JOGO</button>';
    document.getElementById("sensWrap").insertAdjacentElement("afterend", extras);
    document.getElementById("bSoloConfig").addEventListener("click", openMatchConfig);
    document.getElementById("bSettings").addEventListener("click", openSettings);
    document.getElementById("bProfile").addEventListener("click", openProfile);
    document.getElementById("bShop").addEventListener("click", function () { openShop(); });
    document.getElementById("bExitGame").addEventListener("click", confirmExitGame);
    document.getElementById("bTutorial").addEventListener("click", function () {
      modal("COMO JOGAR",
        '<div class="tutorial"><div><b>MOVER E CORRER</b><span>Joystick + botao CORRER.</span></div><div><b>MIRAR</b><span>Arraste no lado direito. A ajuda de mira e configuravel.</span></div><div><b>SEUS DOIS ESPACOS</b><span>Uma arma principal e um acessorio. O botao 1 e o 2 trocam entre eles.</span></div><div><b>ITENS DA FASE</b><span>Verde cura, amarelo acelera, azul protege, laranja da municao, rosa da doces e roxo empresta uma arma cara pela partida.</span></div><div><b>LOJA</b><span>Junte doces e compre armas, acessorios, roupas, pinturas e equipamentos.</span></div></div>');
    });
    const modeHud = document.createElement("div");
    modeHud.id = "modeHud";
    modeHud.className = "pill";
    document.getElementById("hud").appendChild(modeHud);
    const candyHud = document.createElement("div");
    candyHud.id = "candyHud";
    candyHud.className = "pill";
    document.getElementById("hud").appendChild(candyHud);
    minimapCanvas = document.createElement("canvas");
    minimapCanvas.id = "minimap";
    minimapCanvas.width = 180;
    minimapCanvas.height = 180;
    minimapCtx = minimapCanvas.getContext("2d");
    document.getElementById("hud").appendChild(minimapCanvas);
    const rewardOverlay = document.createElement("div");
    rewardOverlay.id = "adRewardOverlay";
    rewardOverlay.innerHTML =
      '<div class="adRewardCard" role="dialog" aria-modal="true" aria-labelledby="adRewardTitle">' +
      '<div class="adRewardGift">🍬</div><h2 id="adRewardTitle">GANHE <strong>+50 DOCES</strong></h2>' +
      '<p>Assista a um anuncio curto para aumentar sua recompensa desta partida.</p>' +
      '<div class="adRewardActions"><button id="adRewardWatch" class="big-btn">ASSISTIR E GANHAR</button>' +
      '<button id="adRewardSkip" class="big-btn sub-btn">AGORA NAO</button></div>' +
      '<p id="adRewardStatus" class="adRewardStatus"></p></div>';
    document.body.appendChild(rewardOverlay);
    document.getElementById("adRewardWatch").addEventListener("click", requestEndMatchRewardAd);
    document.getElementById("adRewardSkip").addEventListener("click", closeEndMatchRewardOffer);
    installWeaponSlots();
    installControls();
    applyControlStyle();
    syncConfigUi();
    updateCandyHud();
    startMenuMusic();
    setTimeout(showTutorial, 800);
  }

  let lastRendered = 0;
  function shouldSkipFrame(time) {
    const interval = 1000 / (settings.fps || 60);
    if (time - lastRendered < interval - 1) return true;
    lastRendered = time;
    return false;
  }

  resize = function () {
    originalResize();
    if (settings.graphics === "low" && RS > 0.68) {
      const w = innerWidth, h = innerHeight;
      RS = 0.68;
      cv.width = Math.max(320, Math.floor(w * RS));
      cv.height = Math.max(180, Math.floor(h * RS));
      W = cv.width; H = cv.height; HW = W / 2; HH = H / 2;
      F = H / (2 * Math.tan(FOV / 2));
    } else if (settings.graphics === "medium" && RS > 0.84) {
      const w = innerWidth, h = innerHeight;
      RS = 0.84;
      cv.width = Math.max(320, Math.floor(w * RS));
      cv.height = Math.max(180, Math.floor(h * RS));
      W = cv.width; H = cv.height; HW = W / 2; HH = H / 2;
      F = H / (2 * Math.tan(FOV / 2));
    }
  };

  window.SugarEnhance = {
    version: VERSION,
    update: update,
    draw: draw,
    canDamage: canDamage,
    onShot: onShot,
    onHit: onHit,
    assistAim: assistAim,
    playerSpeed: playerSpeed,
    selectedSkin: selectedSkin,
    startingWeapon: startingWeapon,
    startingAccessory: startingAccessory,
    gearMod: gearMod,
    openShop: openShop,
    weaponColors: weaponColors,
    skyPalette: skyPalette,
    rebuildMap: rebuildSelectedMap,
    applyNetworkConfig: applyNetworkConfig,
    onRewardedInterstitialResult: onRewardedInterstitialResult,
    assignTeams: assignTeams,
    shouldSkipFrame: shouldSkipFrame,
    game: game,
    profile: profile
  };

  window.addEventListener("resize", function () {
    resize();
    applyControlStyle();
  });
  installUi();
})();
