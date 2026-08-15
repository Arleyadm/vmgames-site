(function () {
  "use strict";

  const VERSION = "1.8.0";
  const SETTINGS_KEY = "sugarstrike.settings.v11";
  const PROFILE_KEY = "sugarstrike.profile.v12";
  const OLD_PROFILE_KEY = "sugarstrike.profile.v11";
  const HISTORY_LIMIT = 10;
  const originalBuildTown = buildTown;
  const originalInitMatch = initMatch;
  const originalSpawnPoint = spawnPoint;
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
    name: SugarI18n.t("DEFAULT_PLAYER_NAME"),
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
    gear: 0,           // herdado: o unico equipamento das versoes antigas
    gearSet: null,     // o que esta vestido agora, varios ao mesmo tempo
    unlockedGear: [0],
    grenadeStock: 0,
    achievements: [],
    daily: {day: "", tasks: []},
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
  // As duas ultimas sao as fardas do modo Equipes, vendidas para uso em qualquer modo.
  const OUTFITS = [0,1,2,3,4,5,6,7,8,9,10,11].map(function (i) {
    return {get name() { return SugarI18n.t("OUTFIT_" + i); },
      price: [0,120,180,240,260,320,360,420,480,560,700,700][i]};
  });
  // Skins de arma: repintam qualquer arma. A primeira mantem as cores de fabrica.
  const WEAPON_SKINS_PRICES = [0,150,200,260,300,340,380,420,520];
  const WEAPON_SKINS_COLORS = [[null, null], ["#c9b4ec", "#8fd9c8"], ["#ffcf4d", "#e8615a"], ["#5b5f8f", "#9ec9f2"],
    ["#6d3a2a", "#f6a9c3"], ["#8fd9c8", "#fffdf7"], ["#f6a9c3", "#fdf7ec"], ["#c98f5e", "#ffcf4d"], ["#e8615a", "#ffcf4d"]];
  const WEAPON_SKINS = [0,1,2,3,4,5,6,7,8].map(function (i) {
    return {get name() { return SugarI18n.t("WSKIN_" + i); }, price: WEAPON_SKINS_PRICES[i], colors: WEAPON_SKINS_COLORS[i]};
  });
  // Equipamentos: um de cada vez, e estes mexem de verdade nos numeros.
  const GEAR_PRICES = [0,260,340,300,420,380,290,520,640];
  const GEAR_MODS = [{}, {speed: 1.10}, {shield: 25}, {recoil: 0.80}, {spread: 0.82}, {ammo: 1.40},
    {move: 0.65}, {head: 0.65}, {speed: 1.14, reload: 0.85}];
  const GEAR = [0,1,2,3,4,5,6,7,8].map(function (i) {
    return {
      get name() { return SugarI18n.t("GEAR_" + i); },
      get desc() { return SugarI18n.t("GEAR_" + i + "_DESC"); },
      price: GEAR_PRICES[i], mods: GEAR_MODS[i]
    };
  });

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
  /* Perfil antigo guardava um equipamento so: ele vira o primeiro da lista.
     O indice 0 e "sem equipamento", entao nunca entra na lista de vestidos. */
  if (!Array.isArray(profile.gearSet)) {
    profile.gearSet = (profile.gear | 0) > 0 ? [profile.gear | 0] : [];
  }
  profile.gearSet = profile.gearSet
    .map(function (index) { return index | 0; })
    .filter(function (index, at, list) {
      return index > 0 && index < GEAR.length &&
        profile.unlockedGear.indexOf(index) >= 0 && list.indexOf(index) === at;
    });
  profile.grenadeStock = clamp(profile.grenadeStock | 0, 0, 8);

  /* Os dois primeiros espacos sao o que o jogador equipou na loja. Do 3 ao 5
     ficam as armas apanhadas no chao da fase, na ordem em que foram pegas. */
  const FIELD_SLOTS = 3;
  let fieldWeapons = [];
  /* Reescreve os espacos de campo sem tocar nos dois primeiros — eles podem
     ter mudado dentro da partida (saque, kit base) e nao devem voltar para o
     que esta salvo no perfil. */
  function rebuildFieldSlots() {
    LOADOUT.length = Math.min(LOADOUT.length, 2);
    while (LOADOUT.length < 2) LOADOUT.push(0);
    fieldWeapons.forEach(function (index) { LOADOUT.push(index | 0); });
  }
  // Deixa o jogo saber o que foi equipado na loja.
  function syncLoadout() {
    LOADOUT[0] = profile.primary | 0;
    LOADOUT[1] = profile.accessory | 0;
    rebuildFieldSlots();
  }
  syncLoadout();

  const game = {
    map: "village",
    mode: "deathmatch",
    bots: 7,
    target: 25,
    duration: 5,
    // Regra da partida, escolhida em CONFIGURAR PARTIDA. Vale so no jogo
    // sozinho: em sala online quem confere a municao e o servidor.
    infiniteAmmo: false,
    remaining: 300,
    elapsed: 0,
    speedUntil: 0,
    kingScore: [0, 0, 0],
    teamScore: [0, 0, 0],
    friendlyFire: false,
    captureScore: [0, 0, 0],
    flag: null,
    wave: 1,
    pickups: [],
    tempWeapons: [],
    mapRepairAt: 0,
    mapRepairing: false,
    lastPickupSeed: 0,
    /* Torneio: a partida nao acaba no primeiro colocado. Quem bate a meta
       classifica, sai da partida e os outros continuam disputando as vagas
       que sobraram. Se o tempo acabar antes, classifica quem estiver na
       frente no placar — sem isso uma sala com jogador parado travaria a
       chave inteira. */
    tournament: false,
    qualifiers: 3,
    qualified: [],
    finished: false,
    resultSaved: false,
    // Presente do anuncio de derrota seguida: {kind, index, name}, vale so para a proxima partida.
    giftItem: null
  };
  try {
    const savedMatch = JSON.parse(localStorage.getItem("sugarstrike.match.v11") || "{}");
    game.map = savedMatch.map || game.map;
    game.mode = savedMatch.mode || game.mode;
    game.bots = Number.isFinite(savedMatch.bots) ? clamp(savedMatch.bots, 0, 12) : game.bots;
    game.target = Number.isFinite(savedMatch.target) ? clamp(savedMatch.target, 5, 100) : game.target;
    game.duration = Number.isFinite(savedMatch.duration) ? clamp(savedMatch.duration, 1, 30) : game.duration;
    game.infiniteAmmo = !!savedMatch.infiniteAmmo;
    game.tournament = !!savedMatch.tournament;
    game.qualifiers = Number.isFinite(savedMatch.qualifiers) ? clamp(savedMatch.qualifiers, 1, 12) : game.qualifiers;
  } catch (error) {}

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (error) {}
    applyControlStyle();
  }
  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (error) {}
    updateCandyHud();
  }
  /* Data no horario do aparelho, e nao em UTC. Com toISOString() o dia virava
     as 21:00 no Brasil: os desafios trocavam no meio da sessao e quem estava
     num 9/13 perdia o progresso tres horas antes da meia-noite. Assim cada
     jogador vira a meia-noite dele, em qualquer pais.                      */
  function today() {
    const now = new Date();
    const month = now.getMonth() + 1, day = now.getDate();
    return now.getFullYear() + "-" +
      (month < 10 ? "0" : "") + month + "-" +
      (day < 10 ? "0" : "") + day;
  }
  /* O sorteio das tarefas do dia mora mais abaixo (ensureDaily), junto com o
     resto do sistema de desafios. Aqui so garantimos que profile.daily existe
     antes de qualquer coisa ler ele. */
  if (!profile.daily || typeof profile.daily !== "object") profile.daily = {day: "", tasks: []};

  function vibrate(pattern) {
    if (!settings.haptics) return;
    try {
      if (window.SugarAndroid && SugarAndroid.vibrate) SugarAndroid.vibrate(String(pattern));
      else if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (error) {}
  }

  // As funcoes abaixo checam game.giftItem primeiro: e o presente ganho no anuncio de
  // derrota seguida, e vale so pela partida que esta comecando (ver requestGiftRewardAd).
  function selectedSkin() {
    if (game.giftItem && game.giftItem.kind === "outfit") {
      return SKINS[clamp(game.giftItem.index | 0, 0, SKINS.length - 1)];
    }
    return SKINS[clamp(profile.skin | 0, 0, SKINS.length - 1)];
  }
  function weaponColors() {
    if (game.giftItem && game.giftItem.kind === "skin") {
      return WEAPON_SKINS[clamp(game.giftItem.index | 0, 0, WEAPON_SKINS.length - 1)].colors;
    }
    return WEAPON_SKINS[clamp(profile.weaponSkin | 0, 0, WEAPON_SKINS.length - 1)].colors;
  }
  /* Tudo o que esta vestido ao mesmo tempo. O presente do anuncio entra junto
     por cima, valendo so pela partida que comeca.                          */
  function equippedGear() {
    const list = (profile.gearSet || []).slice();
    if (game.giftItem && game.giftItem.kind === "gear" &&
        list.indexOf(game.giftItem.index | 0) < 0) {
      list.push(game.giftItem.index | 0);
    }
    return list.filter(function (index) { return GEAR[index]; });
  }
  /* Somar quantos equipamentos o jogador quiser exige separar as contas:
     o escudo e um valor bruto e se acumula somando; o resto sao fatores
     (velocidade, recuo, dispersao...) e se acumulam multiplicando. Somar
     fatores faria dois itens de 10% virarem 20%, e nao 21%.               */
  const GEAR_ADDITIVE = {shield: true};
  function gearMod(name, fallback) {
    const list = equippedGear();
    let found = false;
    let total = GEAR_ADDITIVE[name] ? 0 : 1;
    list.forEach(function (index) {
      const mods = GEAR[index].mods || {};
      if (!Object.prototype.hasOwnProperty.call(mods, name)) return;
      found = true;
      if (GEAR_ADDITIVE[name]) total += mods[name];
      else total *= mods[name];
    });
    return found ? total : fallback;
  }
  function skyPalette() {
    const palettes = {
      village: {top: "#7fc9ea", middle: "#bfe7f5", bottom: "#e6f5fb", cloud: "#fffdf7"},
      factory: {top: "#8d5a57", middle: "#d9936f", bottom: "#f3c991", cloud: "#ead7c5"},
      park: {top: "#58d7e8", middle: "#9cebdc", bottom: "#ffe1ef", cloud: "#fff8fc"},
      castle: {top: "#7769bd", middle: "#c9b4ec", bottom: "#ffe3ad", cloud: "#fff5de"},
      // fim de tarde no parque, para a roda-gigante recortar o ceu
      funfair: {top: "#4b3f8f", middle: "#c96fa8", bottom: "#ffc27a", cloud: "#ffe9d2"},
      overpass: {top: "#6f9fd0", middle: "#a8cbe8", bottom: "#e6d7bd", cloud: "#fffdf7"},
      // madrugada nos telhados
      rooftops: {top: "#20264a", middle: "#4a4f86", bottom: "#9a7fb0", cloud: "#cfc3e8"},
      station: {top: "#8a7fb8", middle: "#d3b9d8", bottom: "#ffe0c2", cloud: "#fff6ea"},
      harbor: {top: "#2f7fa8", middle: "#7fc4dd", bottom: "#dff0f5", cloud: "#fffdf7"},
      range: {top: "#9fb8cf", middle: "#cfe0ec", bottom: "#efe6d6", cloud: "#fffdf7"}
    };
    return palettes[game.map] || palettes.village;
  }
  function ownsWeapon(index) {
    return profile.ownedWeapons.indexOf(index | 0) >= 0;
  }
  function canUseWeapon(index) {
    index = index | 0;
    if (game.giftItem && (game.giftItem.kind === "primary" || game.giftItem.kind === "accessory") &&
        (game.giftItem.index | 0) === index) {
      return true;
    }
    return ownsWeapon(index) || game.tempWeapons.indexOf(index) >= 0;
  }
  function startingWeapon() {
    if (game.giftItem && game.giftItem.kind === "primary") return game.giftItem.index | 0;
    return canUseWeapon(profile.primary | 0) ? profile.primary | 0 : firstOwned(PRIMARIES);
  }
  function startingAccessory() {
    if (game.giftItem && game.giftItem.kind === "accessory") return game.giftItem.index | 0;
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
      return game.friendlyFire || victim.team !== attacker.team;
    }
    return true;
  }

  function viewerEntity() {
    if (
      window.SugarNet && SugarNet.inMatch && SugarNet.observedEntity &&
      (SugarNet.spectator || (player && player.dead))
    ) {
      return SugarNet.observedEntity() || player;
    }
    return player;
  }

  // Decide se uma identificação pode ser desenhada sem entregar posição por
  // parede. Aliados recebem a cor da equipe; inimigos exigem linha de visão.
  function labelInfo(target) {
    const viewer = viewerEntity();
    if (!viewer || !target || target === viewer || target.dead) return {visible: false};
    const teamMode = game.mode === "team" || game.mode === "capture" || game.mode === "survival";
    const ally = !!(teamMode && viewer.team && target.team === viewer.team);
    const dx = target.x - viewer.x;
    const dy = (target.y + 1.35) - (viewer.y + 1.55);
    const dz = target.z - viewer.z;
    const distance = Math.hypot(dx, dy, dz);
    const limit = ally ? 52 : 34;
    if (distance < 0.1 || distance > limit) return {visible: false, ally: ally};
    if (!ally) {
      const clearDistance = rayWorld(
        viewer.x, viewer.y + 1.55, viewer.z,
        dx / distance, dy / distance, dz / distance,
        distance
      );
      if (clearDistance < distance - 0.75) return {visible: false, ally: false};
    }
    return {
      visible: true,
      ally: ally,
      color: target.team === 1 ? "#9bad68" : (target.team === 2 ? "#8ba4b8" : "#ffcf4d"),
      symbol: target.team === 1 ? "★" : (target.team === 2 ? "■" : "")
    };
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
    if (attacker === player && head) bumpDaily("headshots", 1);
    /* O traceShot avisa depois de aplicar o dano, entao aqui ja da para saber
       se o golpe matou — e com qual arma. Serve para o desafio da faca e para
       a sequencia de abates sem morrer. */
    if (attacker === player && victim && victim.dead) {
      if (WEAPONS[player.wep] && WEAPONS[player.wep].melee) bumpDaily("melee", 1);
      peakDaily("streak", player.streak || 0);
    }
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
    game.friendlyFire = !!config.friendlyFire;
    // Em sala online a regra e do dono da sala, e nao a escolha solo de cada um.
    game.infiniteAmmo = !!config.infiniteAmmo;
    game.tournament = !!config.tournament;
    game.qualifiers = clamp(config.qualifiers | 0 || 3, 1, 12);
    resetTournament();
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
    resetBomb();
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

  /* ------------------------------------------------- pecas das fases novas
     O jogo anda em x de -44 a 44 e z de -70 a 70 (o clamp do moveXZ), entao
     tudo o que precisa ser pisado mora dentro dessa area. Fora dela so entra
     enfeite, que o jogador ve mas nao alcanca.                              */
  const STAIR_RISE = 0.5;    // combina com o STEP_UP do index.html

  /* Escada de verdade: cada degrau e um bloco solido, e o passo de subida do
     jogo faz o resto. dirX/dirZ dizem para que lado ela sobe.               */
  function stairs(x, z, dirX, dirZ, width, baseY, topY, color) {
    const run = 1.0;
    const steps = Math.max(1, Math.round((topY - baseY) / STAIR_RISE));
    const half = width / 2;
    for (let i = 0; i < steps; i++) {
      const y = baseY + (i + 1) * STAIR_RISE;
      const ax = x + dirX * run * i, az = z + dirZ * run * i;
      const bx = ax + dirX * run, bz = az + dirZ * run;
      const x0 = dirX ? Math.min(ax, bx) : ax - half;
      const x1 = dirX ? Math.max(ax, bx) : ax + half;
      const z0 = dirZ ? Math.min(az, bz) : az - half;
      const z1 = dirZ ? Math.max(az, bz) : az + half;
      boxS(x0, baseY, z0, x1, y, z1, color, 4, true);
    }
  }
  /* Plataforma com piso e uma faixa de guarda: da para andar em cima e ela
     serve de parapeito para quem atira de la.                              */
  function deck(x0, z0, x1, z1, y, thickness, floor, rail) {
    boxS(x0, y - thickness, z0, x1, y, z1, floor, 6, true);
    if (!rail) return;
    boxS(x0, y, z0, x1, y + 0.55, z0 + 0.4, rail, 4, false);
    boxS(x0, y, z1 - 0.4, x1, y + 0.55, z1, rail, 4, false);
  }
  /* Tunel: duas paredes e um teto. O vao no meio e o que da a passagem. */
  function tunnel(x0, z0, x1, z1, height, wall, roof) {
    const thickness = 1.6;
    boxS(x0, 0, z0, x0 + thickness, height, z1, wall, 6, true);
    boxS(x1 - thickness, 0, z0, x1, height, z1, wall, 6, true);
    boxS(x0, height, z0, x1, height + 1.2, z1, roof, 7, true);
  }
  function pillar(x, z, height, width, color) {
    boxS(x - width, 0, z - width, x + width, height, z + width, color, 5, true);
  }

  /* ------------------------------------------------------ 1. PARQUE DOS DOCES
     Roda-gigante ao fundo, carrossel no meio (elevado, com escada dos dois
     lados) e barracas de tiro em volta. O centro alto e o ponto disputado. */
  function buildFunfair() {
    ground("#c9b4ec", "#d6c4f0");
    const festa = ["#e8615a", "#ffcf4d", "#8fd9c8", "#f6a9c3", "#7ec96b"];
    // passeio central em cruz
    boxS(-9, 0, -66, 9, 0.22, 66, "#f3e0a2", 8, false);
    boxS(-42, 0, -9, 42, 0.22, 9, "#f3e0a2", 8, false);

    // carrossel: piso a 3,5 com cobertura listrada e escada nos dois lados
    deck(-11, -11, 11, 11, 3.5, 0.6, "#fdf7ec", "#e8615a");
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      const px = Math.cos(angle) * 8.4, pz = Math.sin(angle) * 8.4;
      pillar(px, pz, 7.4, 0.34, festa[i % festa.length]);
    }
    boxS(-12, 7.4, -12, 12, 8.6, 12, "#e8615a", 8, false);
    boxS(-3.2, 8.6, -3.2, 3.2, 11.5, 3.2, "#ffcf4d", 6, false);
    stairs(0, -18, 0, 1, 6, 0, 3.5, "#c98f5e");
    stairs(0, 18, 0, -1, 6, 0, 3.5, "#c98f5e");

    // roda-gigante: so enfeite, fica atras da area jogavel
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      const rx = Math.cos(angle) * 17, ry = 20 + Math.sin(angle) * 17;
      if (ry < 1.5) continue;
      boxS(rx - 1.5, ry - 1.5, -62, rx + 1.5, ry + 1.5, -59,
        festa[i % festa.length], 4, false);
    }
    boxS(-1.4, 0, -62.5, 1.4, 20, -58.5, "#8b6f5e", 6, true);
    boxS(-14, 0, -63, -11, 21, -58, "#8b6f5e", 6, true);
    boxS(11, 0, -63, 14, 21, -58, "#8b6f5e", 6, true);

    // barracas: telhado de cada uma da para pisar e serve de mirante baixo
    const barracas = [[-30, -34], [30, -34], [-30, 34], [30, 34], [-34, 0], [34, 0]];
    barracas.forEach(function (spot, index) {
      const x = spot[0], z = spot[1], cor = festa[index % festa.length];
      boxS(x - 6, 0, z - 5, x + 6, 3.2, z + 5, "#fdf7ec", 6, true);
      boxS(x - 7, 3.2, z - 6, x + 7, 4.1, z + 6, cor, 6, true);
      stairs(x - 9.5, z, 1, 0, 4, 0, 4.1, "#c98f5e");
    });

    // barreiras espalhadas, para o meio do mapa nao virar campo aberto
    [[-20, -50], [20, -50], [-20, 50], [20, 50], [0, -40], [0, 40]].forEach(function (spot, i) {
      boxS(spot[0] - 4, 0, spot[1] - 1.4, spot[0] + 4, 2.4, spot[1] + 1.4,
        festa[(i + 2) % festa.length], 5, true);
    });
    signs.push({x: 0, y: 12.6, z: 3.4, t: "PARQUE DOS DOCES"});
  }

  /* --------------------------------------------------- 2. VIADUTO DE CHOCOLATE
     Dois andares de verdade: a rua embaixo, com dois tuneis, e o viaduto em
     cima atravessando o mapa inteiro. Quem sobe manda na rua, mas fica a
     descoberto para quem estiver no outro lado.                            */
  function buildOverpass() {
    ground("#8b7566", "#9c8474");
    const asfalto = "#6d5a4e", concreto = "#b9a892", doce = "#6d3a2a";
    // pista central
    boxS(-13, 0, -68, 13, 0.2, 68, asfalto, 8, false);
    for (let z = -62; z <= 62; z += 9) {
      boxS(-0.7, 0.2, z - 2.2, 0.7, 0.3, z + 2.2, "#f3e0a2", 4, false);
    }
    // o viaduto: tabuleiro a 7 de altura, cruzando de leste a oeste
    deck(-44, -7, 44, 7, 7, 1, doce, "#c98f5e");
    for (const x of [-34, -20, 20, 34]) {
      pillar(x, -5, 6, 1.5, concreto);
      pillar(x, 5, 6, 1.5, concreto);
    }
    /* As rampas terminam exatamente na borda do tabuleiro (z -7 e 7). Se
       sobrarem degraus depois disso, o jogador sobe e bate na lateral do
       viaduto no meio do caminho. */
    stairs(-40, -21, 0, 1, 7, 0, 7, concreto);
    stairs(40, 21, 0, -1, 7, 0, 7, concreto);
    // e uma escada no meio, mais exposta, como atalho
    stairs(10, -21, 0, 1, 4, 0, 7, "#c98f5e");

    // tuneis por baixo da pista, ligando os lados
    tunnel(-40, -46, -14, -34, 4.5, concreto, doce);
    tunnel(14, 34, 40, 46, 4.5, concreto, doce);

    // predios baixos com telhado pisavel
    const quarteirao = [[-32, -60], [32, -60], [-32, 60], [32, 60], [-36, 24], [36, -24]];
    quarteirao.forEach(function (spot, i) {
      const x = spot[0], z = spot[1];
      boxS(x - 7, 0, z - 7, x + 7, 5.5 + (i % 2) * 2, z + 7, i % 2 ? "#a85c43" : "#8fd9c8", 7, true);
      stairs(x + 9.5, z, -1, 0, 4, 0, 5.5 + (i % 2) * 2, concreto);
    });
    // carros de doce servindo de cobertura na rua
    [[-6, -30], [7, -12], [-7, 14], [6, 36], [0, 52]].forEach(function (spot, i) {
      boxS(spot[0] - 2.4, 0, spot[1] - 4.6, spot[0] + 2.4, 2.3, spot[1] + 4.6,
        ["#e8615a", "#ffcf4d", "#8fd9c8"][i % 3], 5, true);
      boxS(spot[0] - 2, 2.3, spot[1] - 2.4, spot[0] + 2, 3.4, spot[1] + 2.2, "#fdf7ec", 4, true);
    });
    signs.push({x: 0, y: 9.6, z: 7.6, t: "VIADUTO DE CHOCOLATE"});
  }

  /* ------------------------------------------------- 3. TELHADOS DE MERENGUE
     Tres alturas de telhado ligadas por passarelas estreitas. Quase toda a
     luta acontece em cima; quem cai tem que dar a volta pela escada.        */
  function buildRooftops() {
    ground("#5b5f8f", "#6a6e9c");
    const parede = "#f0e6da", telha = "#e8615a", passarela = "#c98f5e";
    const blocos = [
      [-32, -52, 12, 6], [0, -52, 12, 9], [32, -52, 12, 6],
      [-34, -18, 12, 11], [0, -20, 14, 8], [34, -18, 12, 11],
      [-32, 16, 12, 6], [2, 18, 14, 12], [34, 16, 12, 6],
      [-30, 52, 12, 9], [30, 52, 12, 9]
    ];
    blocos.forEach(function (b, i) {
      const x = b[0], z = b[1], largura = b[2] / 2, altura = b[3];
      boxS(x - largura, 0, z - largura, x + largura, altura, z + largura, parede, 8, true);
      boxS(x - largura - 0.8, altura, z - largura - 0.8,
        x + largura + 0.8, altura + 0.7, z + largura + 0.8, telha, 6, true);
      // parapeito, para dar de onde atirar sem cair
      boxS(x - largura - 0.8, altura + 0.7, z - largura - 0.8,
        x + largura + 0.8, altura + 1.5, z - largura + 0.1, "#fdf7ec", 4, false);
      /* A escada nasce longe o bastante para chegar ao telhado bem na borda:
         um degrau a mais e ela entraria dentro do predio. */
      if (i % 3 === 0) {
        const alto = altura + 0.7;
        stairs(x + largura + Math.round(alto / STAIR_RISE), z, -1, 0, 4, 0, alto, passarela);
      }
    });
    // passarelas ligando telhados da mesma altura
    deck(-26, -3, -8, 3, 8.7, 0.5, passarela, "#a5643c");
    deck(8, -3, 26, 3, 8.7, 0.5, passarela, "#a5643c");
    deck(-7, -46, 7, -26, 9.7, 0.5, passarela, "#a5643c");
    deck(-7, 26, 7, 46, 12.7, 0.5, passarela, "#a5643c");
    // caixas d'agua, cobertura em cima dos telhados
    [[-34, -18], [34, -18], [2, 18]].forEach(function (spot) {
      boxS(spot[0] - 2, 11.7, spot[1] - 2, spot[0] + 2, 14.2, spot[1] + 2, "#8fd9c8", 5, true);
    });
    signs.push({x: 0, y: 10.4, z: -13, t: "TELHADOS DE MERENGUE"});
  }

  /* ---------------------------------------------------- 4. ESTACAO CARAMELO
     Duas plataformas altas, os trilhos no meio e uma passarela cruzando por
     cima. Os vagoes sao cobertura e degrau ao mesmo tempo.                 */
  function buildStation() {
    ground("#7a6a5c", "#8a786a");
    const plataforma = "#e8dcc2", vagao = "#a85c43", ferro = "#5d4338";
    // trilhos
    boxS(-4.5, 0, -68, 4.5, 0.18, 68, "#4a3b33", 8, false);
    for (let z = -66; z <= 66; z += 4) {
      boxS(-5.5, 0.18, z - 0.5, 5.5, 0.42, z + 0.5, "#6b4a3a", 4, false);
    }
    for (const x of [-3.2, 3.2]) boxS(x - 0.25, 0.42, -68, x + 0.25, 0.72, 68, "#9ea3ad", 5, false);
    // as duas plataformas, com escada nas pontas
    deck(-24, -60, -7, 60, 1.4, 1.4, plataforma, null);
    deck(7, -60, 24, 60, 1.4, 1.4, plataforma, null);
    stairs(-15, -63, 0, 1, 7, 0, 1.4, plataforma);
    stairs(15, 63, 0, -1, 7, 0, 1.4, plataforma);
    // cobertura das plataformas, apoiada em colunas
    for (const lado of [-1, 1]) {
      for (let z = -52; z <= 52; z += 13) pillar(lado * 15.5, z, 6, 0.4, ferro);
      boxS(lado * 24, 6, -58, lado * 6.5, 6.9, 58, lado < 0 ? "#8fd9c8" : "#f6a9c3", 8, true);
    }
    // vagoes parados: sobe-se neles pela plataforma e atira de cima
    [[-30], [6], [40]].forEach(function (spot, i) {
      const z = spot[0];
      boxS(-4.6, 0.7, z - 11, 4.6, 3.9, z + 11, i % 2 ? "#6d3a2a" : vagao, 8, true);
      boxS(-5, 3.9, z - 11.4, 5, 4.5, z + 11.4, ferro, 6, true);
    });
    // passarela cruzando por cima de tudo
    deck(-26, -4, 26, 4, 9.5, 0.6, "#c98f5e", "#8b6f5e");
    stairs(-25, -8, 0, 1, 5, 6.9, 9.5, "#c98f5e");
    stairs(25, 8, 0, -1, 5, 6.9, 9.5, "#c98f5e");
    /* Saguao ao fundo: paredes, nao um bloco macico. Um bloco de ponta a
       ponta engoliria a escada da plataforma e prenderia quem nascesse ali. */
    boxS(-20, 0, -67, -7, 9, -64, "#f0e6da", 8, true);
    boxS(7, 0, -67, 20, 9, -64, "#f0e6da", 8, true);
    boxS(-20, 9, -67, 20, 10.2, -64, "#e8615a", 7, true);
    boxS(-7, 5.5, -67, 7, 9, -64, "#f0e6da", 6, true);   // verga sobre a porta
    signs.push({x: 0, y: 10.4, z: -61, t: "ESTACAO CARAMELO"});
  }

  /* -------------------------------------------------------- 5. PORTO DE MEL
     Conteineres empilhados formando corredores e terracos. E o mapa mais
     vertical: quase todo bloco da para escalar em dois ou tres saltos.     */
  function buildHarbor() {
    ground("#6f8fa8", "#7d9cb4");
    const agua = "#4a7f9e";
    // doca: a agua fica nas bordas, so de enfeite
    boxS(-44, 0, -70, -36, 0.4, 70, agua, 8, false);
    boxS(36, 0, -70, 44, 0.4, 70, agua, 8, false);
    const cores = ["#e8615a", "#ffcf4d", "#8fd9c8", "#c9b4ec", "#7ec96b", "#f79a5e"];
    /* Uma pilha de conteineres: cada andar recua um pouco, o que cria o
       degrau para subir sem precisar de escada em toda pilha.              */
    function pilha(x, z, andares, giro) {
      for (let i = 0; i < andares; i++) {
        const encolhe = i * 0.9;
        const largura = giro ? 6.5 - encolhe : 3.2 - encolhe * 0.4;
        const fundo = giro ? 3.2 - encolhe * 0.4 : 6.5 - encolhe;
        const y = i * 3.1;
        boxS(x - largura, y, z - fundo, x + largura, y + 3, z + fundo,
          cores[(i + x + z) % cores.length], 6, true);
        boxS(x - largura, y + 3, z - fundo, x + largura, y + 3.15, z + fundo, "#4a3b33", 5, false);
      }
    }
    pilha(-28, -48, 3, false); pilha(-14, -40, 2, true);  pilha(-28, -20, 2, false);
    pilha(-16, -6, 3, true);   pilha(-30, 8, 2, false);   pilha(-14, 26, 3, true);
    pilha(-28, 44, 2, false);
    pilha(28, -44, 2, false);  pilha(14, -30, 3, true);   pilha(28, -14, 3, false);
    pilha(15, 2, 2, true);     pilha(29, 18, 2, false);   pilha(14, 34, 3, true);
    pilha(28, 52, 2, false);
    // escadas para os terracos altos
    stairs(-22, -48, 1, 0, 4, 0, 6.2, "#8b6f5e");
    stairs(22, 34, -1, 0, 4, 0, 6.2, "#8b6f5e");
    // guindaste: enfeite alto que fecha o horizonte
    boxS(-3, 0, -66, 3, 22, -60, "#e8615a", 8, true);
    boxS(-2, 22, -66, 2, 24, -34, "#ffcf4d", 7, false);
    boxS(-0.5, 12, -36, 0.5, 24, -34, "#4a3b33", 5, false);
    // passarela ligando os dois lados por cima do corredor central
    deck(-32, -3, 32, 3, 9.4, 0.6, "#c98f5e", "#8b6f5e");
    stairs(-6, -10, 0, 1, 5, 6.2, 9.4, "#c98f5e");
    stairs(6, 10, 0, -1, 5, 6.2, 9.4, "#c98f5e");
    signs.push({x: 0, y: 11, z: 3.6, t: "PORTO DE MEL"});
  }

  /* O sorteio de origem do jogo nasceu para a vila: um corredor de x -9 a 9.
     Nas fases largas isso joga todo mundo no mesmo aperto, entao cada uma diz
     onde da para nascer. Continua valendo a regra de sempre: longe de quem ja
     esta vivo e nunca dentro de um solido.                                  */
  const SPAWN_AREAS = {
    funfair:  [[-38, 38], [-60, 60]],
    overpass: [[-38, 38], [-64, 64]],
    rooftops: [[-40, 40], [-62, 62]],
    station:  [[-22, 22], [-58, 58]],
    harbor:   [[-33, 33], [-60, 60]]
  };
  spawnPoint = function () {
    const area = SPAWN_AREAS[game.map];
    if (!area) return originalSpawnPoint();
    let best = null, bestDistance = -1;
    for (let i = 0; i < 40; i++) {
      const point = {
        x: rnd(area[0][0], area[0][1]),
        z: rnd(area[1][0], area[1][1])
      };
      if (solidAt(point.x, point.z, 0.2, 1.6, 0.6)) continue;
      let distance = 1e9;
      for (const entity of ents) {
        if (entity.dead) continue;
        distance = Math.min(distance,
          (entity.x - point.x) * (entity.x - point.x) + (entity.z - point.z) * (entity.z - point.z));
      }
      if (distance > bestDistance) { bestDistance = distance; best = point; }
    }
    return best || originalSpawnPoint();
  };

  /* ---------------------------------------------------- 6. CAMPO DE TIRO
     Fase de treino: sem bots, so alvos que aparecem e somem. E onde o desafio
     diario de pontaria se cumpre, e serve para experimentar arma nova sem
     levar tiro.                                                            */
  const TARGET_ROWS = [
    {z: -18, y: 1.6, size: 1.5, points: 1},
    {z: -34, y: 2.0, size: 1.2, points: 2},
    {z: -52, y: 2.4, size: 0.95, points: 3}
  ];
  function buildRange() {
    ground("#c8b79c", "#d4c4aa");
    const parede = "#8b6f5e", piso = "#e8dcc2";
    // baia do atirador
    boxS(-14, 0, 8, 14, 0.4, 30, piso, 8, true);
    boxS(-14, 0.4, 8, 14, 1.15, 9.2, parede, 6, true);
    for (const x of [-14, -4.7, 4.7, 14]) boxS(x - 0.4, 0.4, 8, x + 0.4, 2.6, 12, parede, 5, true);
    boxS(-14, 2.6, 8, 14, 3.4, 13, "#a85c43", 7, true);
    // paredes laterais do campo
    boxS(-20, 0, -62, -16, 6, 8, parede, 8, true);
    boxS(16, 0, -62, 20, 6, 8, parede, 8, true);
    boxS(-20, 0, -66, 20, 9, -62, "#6d5a4e", 8, true);
    // marcas de distancia no chao
    TARGET_ROWS.forEach(function (row, index) {
      boxS(-16, 0, row.z - 0.4, 16, 0.12, row.z + 0.4,
        ["#e8615a", "#ffcf4d", "#8fd9c8"][index], 6, false);
    });
    signs.push({x: 0, y: 4.4, z: 12.8, t: "CAMPO DE TIRO"});
  }

  /* Os alvos nao sao paredes: sao discos que o tiro atravessa e que somem ao
     serem acertados. Por isso ficam fora de solids e tem teste proprio.    */
  function spawnTargets() {
    game.targets = [];
    TARGET_ROWS.forEach(function (row, rowIndex) {
      for (let i = 0; i < 4; i++) {
        game.targets.push({
          x: -12 + i * 8, y: row.y, z: row.z,
          size: row.size, points: row.points,
          alive: true, timer: 0, row: rowIndex
        });
      }
    });
    game.rangeScore = 0;
    game.rangeHits = 0;
  }
  function updateTargets(dt) {
    if (game.map !== "range" || !game.targets) return;
    game.targets.forEach(function (target) {
      if (target.alive) return;
      target.timer -= dt;
      if (target.timer <= 0) target.alive = true;
    });
  }
  /* Chamado pelo tiro do jogo. Devolve true quando algum alvo foi acertado. */
  function hitTargets(ox, oy, oz, dx, dy, dz, maxT) {
    if (game.map !== "range" || !game.targets) return false;
    let best = null, bestT = maxT;
    game.targets.forEach(function (target) {
      if (!target.alive) return;
      const half = target.size;
      const t = rayAABB(ox, oy, oz, dx, dy, dz,
        target.x - half, target.y - half, target.z - 0.25,
        target.x + half, target.y + half, target.z + 0.25, bestT);
      if (t > 0 && t < bestT) { bestT = t; best = target; }
    });
    if (!best) return false;
    best.alive = false;
    best.timer = 1.6 + best.row * 0.5;
    game.rangeScore += best.points;
    game.rangeHits++;
    burst(best.x, best.y, best.z, "#ffcf4d", 10);
    hitMark = 0.35;
    snd.hit(best.row === 2);
    bumpDaily("targets", 1);
    return true;
  }
  function drawTargets() {
    if (game.map !== "range" || !game.targets) return;
    game.targets.forEach(function (target) {
      if (!target.alive) {
        // enquanto espera, fica deitado: da para ver que vai voltar
        const base = mMul(mT(target.x, 0.25, target.z), mRX(1.35));
        boxM(base, target.size, target.size * 0.18, 0.12, "#8b6f5e", Qw);
        return;
      }
      const origin = mT(target.x, target.y, target.z);
      /* Os aneis ficam na face voltada para a baia (z maior): o atirador
         chega pelo +z, e do outro lado ele so veria o fundo branco. */
      boxM(origin, target.size, target.size, 0.12, "#fffdf7", Qw);
      boxM(mMul(origin, mT(0, 0, 0.13)), target.size * 0.66, target.size * 0.66, 0.06, "#e8615a", Qw);
      boxM(mMul(origin, mT(0, 0, 0.2)), target.size * 0.3, target.size * 0.3, 0.06, "#fffdf7", Qw);
      boxM(mMul(mT(target.x, target.y - target.size - 0.6, target.z), mS(1)),
        0.16, 0.6, 0.16, "#8b6f5e", Qw);
    });
  }

  buildTown = function () {
    if (game.map === "range") buildRange();
    else if (game.map === "factory") buildFactory();
    else if (game.map === "park") buildPark();
    else if (game.map === "castle") buildCastle();
    else if (game.map === "funfair") buildFunfair();
    else if (game.map === "overpass") buildOverpass();
    else if (game.map === "rooftops") buildRooftops();
    else if (game.map === "station") buildStation();
    else if (game.map === "harbor") buildHarbor();
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
      castle: {faces: 180, solids: 12},
      funfair: {faces: 300, solids: 40},
      overpass: {faces: 260, solids: 40},
      rooftops: {faces: 300, solids: 30},
      station: {faces: 260, solids: 30},
      harbor: {faces: 300, solids: 40},
      range: {faces: 150, solids: 10}
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
      buildMapPlan();          // a planta do minimapa acompanha o cenario
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
      castle: [[0,-44],[-22,-20],[22,-20],[0,24],[-30,22],[30,22],[-12,44],[12,44],[-42,0],[42,0]],
      // as fases novas espalham coleta tambem no alto, para premiar quem sobe
      funfair: [[0,-24],[0,24],[-30,-34],[30,-34],[-30,34],[30,34],[0,-54],[0,54],[-34,0],[34,0]],
      overpass: [[0,-30],[0,30],[-32,-60],[32,-60],[-27,-40],[27,40],[0,0],[10,-20],[-36,24],[36,-24]],
      rooftops: [[0,-20],[2,18],[-34,-18],[34,-18],[-32,-52],[32,-52],[0,-52],[-30,52],[30,52],[0,0]],
      station: [[-15,-30],[15,30],[-15,20],[15,-20],[0,-50],[0,50],[-20,0],[20,0],[0,6],[0,-30]],
      harbor: [[-28,-48],[28,-44],[-16,-6],[15,2],[-14,26],[14,34],[0,-20],[0,20],[-30,8],[29,18]],
      // no campo de tiro so ha municao, e perto da baia
      range: [[-10,20],[10,20],[-10,26],[10,26],[0,23],[-6,16],[6,16],[0,16],[-12,24],[12,24]]
    };
    const points = layouts[game.map] || layouts.village;
    /* Uma das tres caixas de doce virou caixa de municao. Os dez pontos do
       mapa sao fixos, entao mais municao sai de algum outro item — o doce foi
       o escolhido por ser o que menos muda a partida. */
    const types = ["ammo", "candy", "heal", "weapon", "ammo", "shield", "ammo", "weapon", "speed", "candy"];
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
    resetTournament();
    rebuildSelectedMap();
    originalInitMatch();
    if (game.bots !== 7) {
      ents = [player];
      const pool = NAMES.slice();
      for (let i = 0; i < game.bots; i++) {
        const name = pool.length ? pool.splice((Math.random() * pool.length) | 0, 1)[0] : SugarI18n.t("NET_BOT") + " " + (i + 1);
        ents.push(newEnt(name, true));
      }
      for (const entity of ents) respawn(entity);
    }
    /* Campo de tiro e treino: ninguem atirando de volta, alvos no lugar dos
       rivais e o jogador sempre na baia, olhando para o fundo. */
    if (game.map === "range") {
      ents = [player];
      spawnTargets();
      player.x = 0; player.z = 20; player.y = 0.4; player.vy = 0;
      // a frente da camera e -z (forward = -sin, -cos): yaw 0 olha para os alvos
      cam.yaw = 0; cam.pitch = 0;
    }
    /* O jogo original planta o jogador em (0, 22), que e rua limpa na vila mas
       cai dentro de um predio nas fases novas. Nelas, vale o mesmo sorteio de
       origem de todo mundo. */
    else if (SPAWN_AREAS[game.map]) {
      const start = spawnPoint();
      player.x = start.x; player.z = start.z; player.y = 0; player.vy = 0;
      cam.yaw = Math.atan2(-player.x, -player.z);   // olhando para o meio da fase
    }
    player.name = (profile.name || SugarI18n.t("YOU")).toUpperCase().slice(0, 14);
    player.skin = selectedSkin();
    game.tempWeapons = profile.ownedWeapons.slice();
    stopSprint();
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
    resetBomb();
    spawnPickups();
    updateWeaponSlots();
    updateCandyHud();
    updateModeLabel();
  };

  function topEntity() {
    return ents.slice().sort(function (a, b) { return b.score - a.score; })[0] || player;
  }

  /* ------------------------------------------------------------- torneio */
  function resetTournament() {
    game.qualified = [];
    if (typeof ents !== "undefined" && Array.isArray(ents)) {
      ents.forEach(function (entity) { entity.qualified = false; entity.qualifiedAt = 0; });
    }
    if (typeof player !== "undefined" && player) { player.qualified = false; player.qualifiedAt = 0; }
  }
  function tournamentOn() {
    return !!game.tournament && (game.qualifiers | 0) >= 1;
  }
  function qualifierSlots() {
    return Math.max(1, Math.min(12, game.qualifiers | 0));
  }
  function slotsLeft() {
    return qualifierSlots() - game.qualified.length;
  }
  function stillPlaying() {
    return ents.filter(function (entity) { return !entity.qualified; });
  }
  /* Tira o classificado da partida sem encerra-la. Ele morre e nao renasce
     mais: para quem joga em rede isso ja vira camera de espectador sozinho,
     porque o jogo trata cliente morto assim. */
  function qualifyEntity(entity) {
    if (!entity || entity.qualified) return false;
    entity.qualified = true;
    const position = game.qualified.length + 1;
    entity.qualifiedAt = position;
    game.qualified.push({
      name: entity.name, score: entity.score | 0,
      position: position, id: entity.netId || null
    });
    entity.dead = true;
    entity.hp = 0;
    entity.respawnT = 1e9;
    const total = qualifierSlots();
    if (entity === player && window.SugarNet && SugarNet.inMatch) SugarNet.spectator = true;
    showToast(SugarI18n.t(entity === player ? "TOURNEY_YOU_QUALIFIED" : "TOURNEY_QUALIFIED",
      {name: entity.name, position: position, total: total}));
    if (window.SugarNet && SugarNet.inMatch && SugarNet.role === "host" && SugarNet.send) {
      SugarNet.send({t: "qualified", id: entity.netId || "", name: entity.name,
        position: position, total: total, score: entity.score | 0});
    }
    return true;
  }
  /* O tempo acabou com vagas em aberto: quem estiver na frente no placar leva
     as que sobraram. E a regra que impede a chave de travar. */
  function fillRemainingByScore() {
    const restantes = stillPlaying().sort(function (a, b) { return b.score - a.score; });
    for (let i = 0; i < restantes.length && slotsLeft() > 0; i++) qualifyEntity(restantes[i]);
  }
  function tournamentIntercept(winner) {
    if (!tournamentOn() || matchOver) return false;
    if (winner && !winner.qualified) qualifyEntity(winner);
    // Sem gente suficiente para brigar pelo que falta, encerra e distribui.
    if (slotsLeft() > 0 && stillPlaying().length > 1) return true;
    fillRemainingByScore();
    return false;
  }

  function endByTimer() {
    if (matchOver) return;
    if (tournamentOn()) fillRemainingByScore();
    endMatch(topEntity());
  }
  /* =========================================================== A BOMBA
     No modo Equipes agora existe um segundo caminho para vencer: plantar a
     bomba num dos dois pontos e segurar ate ela estourar. Quem plantou vence
     na hora do estouro, mesmo perdendo no placar.

     Nao ha botao novo: quem fica dentro do circulo planta, e quem fica em
     cima da bomba plantada desarma. Botao a mais atrapalharia no celular,
     onde a tela ja esta cheia.                                            */
  const BOMB_SITES = {
    village:  [[-24, -34], [24, 30]],
    factory:  [[-30, -30], [30, 28]],
    park:     [[-32, -34], [32, 30]],
    castle:   [[-30, -30], [30, 30]],
    funfair:  [[-30, -34], [30, 34]],
    overpass: [[-32, -60], [32, 60]],
    rooftops: [[-32, -52], [2, 18]],
    station:  [[-15, -30], [15, 30]],
    harbor:   [[-28, -48], [28, 52]]
  };
  const BOMB_RADIUS = 4.2;      // ate onde o corpo conta como "no ponto"
  const BOMB_PLANT = 4;         // segundos para plantar
  const BOMB_DEFUSE = 7;        // segundos para desarmar
  /* O pavio precisa dar tempo de o outro time atravessar o mapa e tentar o
     desarme. Com pouco tempo a rodada virava sorteio. Por isso tambem so se
     arma enquanto ainda restar mais que o pavio inteiro no relogio da
     partida: bomba que nao chega a estourar nao decide nada.              */
  const BOMB_FUSE = 90;         // segundos ate estourar

  function bombSites() {
    return (BOMB_SITES[game.map] || BOMB_SITES.village).map(function (point, index) {
      return {x: point[0], z: point[1], label: index === 0 ? "A" : "B"};
    });
  }
  function resetBomb() {
    game.bomb = {
      sites: bombSites(),
      state: "loose",     // loose (ninguem plantou) | planted | defused | blown
      site: null,
      planting: 0,
      defusing: 0,
      fuse: 0,
      team: 0
    };
  }
  function bombAlive(entity) { return entity && !entity.dead && !entity.spectator; }
  /* Quem esta em cima de um ponto, por time. Serve tanto para plantar quanto
     para saber se ha inimigo por perto atrapalhando o desarme.            */
  function countAt(x, z, radius) {
    const byTeam = {1: 0, 2: 0};
    ents.forEach(function (entity) {
      if (!bombAlive(entity) || !entity.team) return;
      if (Math.hypot(entity.x - x, entity.z - z) > radius) return;
      byTeam[entity.team]++;
    });
    return byTeam;
  }
  function updateBomb(dt) {
    if (game.mode !== "team") return;
    if (!game.bomb || !game.bomb.sites) resetBomb();
    const bomb = game.bomb;
    if (bomb.state === "defused" || bomb.state === "blown") return;

    if (bomb.state === "loose") {
      // Sem tempo para o pavio inteiro, o ponto fica fechado para armar.
      bomb.locked = game.remaining <= BOMB_FUSE;
      if (bomb.locked) {
        bomb.planting = 0;
        bomb.site = null;
        return;
      }
      let plantingSite = null, plantingTeam = 0;
      bomb.sites.forEach(function (site) {
        const here = countAt(site.x, site.z, BOMB_RADIUS);
        // so planta quem esta sozinho no ponto: com os dois times ali, ninguem planta
        if (here[1] > 0 && here[2] === 0) { plantingSite = site; plantingTeam = 1; }
        else if (here[2] > 0 && here[1] === 0) { plantingSite = site; plantingTeam = 2; }
      });
      if (!plantingSite) {
        bomb.planting = Math.max(0, bomb.planting - dt * 1.6);
        bomb.site = null;
        return;
      }
      if (bomb.site !== plantingSite) { bomb.site = plantingSite; bomb.planting = 0; }
      bomb.team = plantingTeam;
      bomb.planting += dt;
      if (bomb.planting >= BOMB_PLANT) {
        bomb.state = "planted";
        bomb.fuse = BOMB_FUSE;
        bomb.defusing = 0;
        showToast(SugarI18n.t("BOMB_PLANTED", {site: plantingSite.label}));
        vibrate("30,40,60");
        snd.reload();
      }
      return;
    }

    // plantada: corre o pavio e o outro time pode desarmar
    bomb.fuse -= dt;
    const here = countAt(bomb.site.x, bomb.site.z, BOMB_RADIUS);
    const enemy = bomb.team === 1 ? 2 : 1;
    if (here[enemy] > 0 && here[bomb.team] === 0) bomb.defusing += dt;
    else bomb.defusing = Math.max(0, bomb.defusing - dt * 1.6);

    if (bomb.defusing >= BOMB_DEFUSE) {
      bomb.state = "defused";
      showToast(SugarI18n.t("BOMB_DEFUSED"));
      vibrate("20,30,40");
      return;
    }
    if (bomb.fuse <= 0) {
      bomb.state = "blown";
      // estouro de verdade: dano em quem estiver perto e camera sacudindo
      burst(bomb.site.x, 1.2, bomb.site.z, "#ffcf4d", 40);
      const distance = Math.hypot(player.x - bomb.site.x, player.z - bomb.site.z);
      if (distance < 26) camShake = Math.max(camShake, clamp(2.2 - distance * 0.07, 0.3, 2.2));
      /* O estouro leva quem estiver por perto. O credito vai para alguem do
         time que plantou: com "by" nulo, a regra de fogo amigo do jogo
         descarta o dano e a bomba nao machucaria ninguem.                 */
      const winner = ents.find(function (entity) { return entity.team === bomb.team; });
      ents.forEach(function (entity) {
        if (!bombAlive(entity)) return;
        const d = Math.hypot(entity.x - bomb.site.x, entity.z - bomb.site.z);
        if (d <= 9) damage(entity, 100, winner || entity.lastHitBy || null, false);
      });
      showToast(SugarI18n.t("BOMB_EXPLODED", {team: SugarI18n.teamLabel(bomb.team)}));
      endMatch(winner || topEntity());
    }
  }

  /* Desenho: os dois pontos no mundo, a bomba plantada e a barra de progresso.
     Fica em drawObjectives, junto com a bandeira e o rei do pote.          */
  function drawBomb() {
    if (game.mode !== "team" || !game.bomb || !game.bomb.sites) return;
    const bomb = game.bomb;
    if (bomb.state === "blown" || bomb.state === "defused") return;
    if (bomb.state === "loose") {
      bomb.sites.forEach(function (site) {
        const point = project(site.x, 0.4, site.z);
        if (!point) return;
        ctx.strokeStyle = "#ffcf4d";
        ctx.lineWidth = 3 * RS;
        ctx.beginPath();
        ctx.arc(point.x, point.y, clamp(point.s * BOMB_RADIUS * 0.5, 8, 220), 0, Math.PI * 2);
        ctx.stroke();
        const label = project(site.x, 2.6, site.z);
        if (!label) return;
        const size = clamp(label.s * 0.5, 12, 60);
        ctx.font = "900 " + size.toFixed(1) + "px " + FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(2, size * 0.2);
        ctx.strokeStyle = "#3f342e";
        ctx.fillStyle = "#ffcf4d";
        ctx.strokeText(site.label, label.x, label.y);
        ctx.fillText(site.label, label.x, label.y);
      });
      return;
    }
    // plantada: pisca cada vez mais rapido conforme o pavio acaba
    const site = bomb.site;
    const point = project(site.x, 0.8, site.z);
    if (!point) return;
    const hurry = clamp(1 - bomb.fuse / BOMB_FUSE, 0, 1);
    const blink = Math.sin(performance.now() / (260 - hurry * 200)) > -0.2;
    const size = clamp(point.s * 0.55, 10, 90);
    ctx.beginPath();
    ctx.arc(point.x, point.y, clamp(point.s * 0.9, 5, 70), 0, Math.PI * 2);
    ctx.fillStyle = blink ? "#e8615a" : "#4a3b33";
    ctx.fill();
    ctx.lineWidth = 3 * RS;
    ctx.strokeStyle = "#fffdf7";
    ctx.stroke();
    ctx.font = "900 " + size.toFixed(1) + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, size * 0.2);
    ctx.strokeStyle = "#3f342e";
    ctx.fillStyle = blink ? "#ffffff" : "#ffcf4d";
    const text = Math.ceil(Math.max(0, bomb.fuse));
    ctx.strokeText(text, point.x, point.y - size * 1.3);
    ctx.fillText(text, point.x, point.y - size * 1.3);
  }
  /* A barra fica no meio da tela, onde o jogador esta olhando enquanto espera. */
  function drawBombBar() {
    if (game.mode !== "team" || !game.bomb) return;
    const bomb = game.bomb;
    let ratio = 0, label = "";
    /* Ponto fechado por falta de tempo: em vez de a barra simplesmente nao
       encher (e parecer bug), o jogo diz o motivo a quem esta em cima. */
    if (bomb.state === "loose" && bomb.locked) {
      const onSite = (bomb.sites || []).some(function (site) {
        return Math.hypot(player.x - site.x, player.z - site.z) <= BOMB_RADIUS;
      });
      if (!onSite || player.dead) return;
      ctx.font = "900 " + (12 * RS).toFixed(1) + "px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#ffcf4d";
      ctx.fillText(SugarI18n.t("BOMB_NO_TIME"), W / 2, H * 0.66);
      return;
    }
    if (bomb.state === "loose" && bomb.planting > 0.05) {
      ratio = bomb.planting / BOMB_PLANT;
      label = SugarI18n.t("BOMB_PLANTING");
    } else if (bomb.state === "planted" && bomb.defusing > 0.05) {
      ratio = bomb.defusing / BOMB_DEFUSE;
      label = SugarI18n.t("BOMB_DEFUSING");
    } else return;
    const width = Math.min(W * 0.5, 320), height = 16 * RS;
    const x = (W - width) / 2, y = H * 0.66;
    ctx.fillStyle = "rgba(39,31,27,.72)";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "#ffcf4d";
    ctx.fillRect(x, y, width * clamp(ratio, 0, 1), height);
    ctx.strokeStyle = "#fffdf7";
    ctx.lineWidth = 2 * RS;
    ctx.strokeRect(x, y, width, height);
    ctx.font = "900 " + (12 * RS).toFixed(1) + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#fffdf7";
    ctx.fillText(label, W / 2, y - 5 * RS);
  }

  /* ==================================================== DESAFIOS DIARIOS
     Tres tarefas por dia, sorteadas do mesmo jeito para o dia inteiro (a
     semente e a data), cada uma com sua recompensa. A terceira paga uma arma
     que o jogador ainda nao tem — quando nao sobra nenhuma, vira dinheiro.

     O progresso e contado enquanto se joga, e nao no fim da partida: quem sai
     no meio nao perde o que ja fez.                                        */
  /* Doze tipos para tres vagas por dia. Com seis, metade do baralho caia
     todo dia e a tela parecia sempre a mesma — era essa a queixa. O sorteio
     ainda descarta as tarefas de ontem (ver rollDaily), entao dois dias
     seguidos nunca pedem a mesma coisa.                                    */
  const DAILY_TYPES = [
    {id: "kills",     need: [8, 14],  candies: 160},
    {id: "candies",   need: [12, 20], candies: 140},
    {id: "grenade",   need: [1, 3],   candies: 200},
    {id: "headshots", need: [3, 6],   candies: 220},
    {id: "wins",      need: [1, 2],   candies: 260},
    {id: "targets",   need: [15, 25], candies: 180},
    {id: "streak",    need: [3, 5],   candies: 240},
    {id: "melee",     need: [2, 4],   candies: 250},
    {id: "nodeath",   need: [1, 1],   candies: 280},
    {id: "accuracy",  need: [30, 45], candies: 230},
    {id: "matches",   need: [2, 4],   candies: 150},
    // uma so: o texto e no singular em todos os idiomas
    {id: "online",    need: [1, 1],   candies: 300}
  ];
  function daySeed() {
    const day = today();
    let seed = 7;
    for (let i = 0; i < day.length; i++) seed = (Math.imul(seed, 31) + day.charCodeAt(i)) >>> 0;
    return seed;
  }
  function rollDaily(avoid) {
    let seed = daySeed();
    const next = function () {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let pool = DAILY_TYPES.slice();
    // Fora o que caiu ontem: sobram nove tipos, de sobra para as tres vagas.
    if (Array.isArray(avoid) && avoid.length) {
      const filtered = pool.filter(function (type) { return avoid.indexOf(type.id) < 0; });
      if (filtered.length >= 3) pool = filtered;
    }
    const tasks = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const type = pool.splice((next() * pool.length) | 0, 1)[0];
      const need = type.need[0] + Math.floor(next() * (type.need[1] - type.need[0] + 1));
      tasks.push({id: type.id, need: need, have: 0, done: false, claimed: false});
    }
    // a ultima do dia paga arma; as outras pagam doces
    tasks.forEach(function (task, index) {
      const type = DAILY_TYPES.find(function (t) { return t.id === task.id; });
      task.candies = type.candies;
      task.weapon = index === tasks.length - 1;
    });
    return tasks;
  }
  function ensureDaily() {
    if (!profile.daily || profile.daily.day !== today() || !Array.isArray(profile.daily.tasks)) {
      const yesterday = (profile.daily && Array.isArray(profile.daily.tasks))
        ? profile.daily.tasks.map(function (task) { return task.id; })
        : [];
      profile.daily = {day: today(), tasks: rollDaily(yesterday)};
      saveProfile();
    }
    return profile.daily;
  }
  /* Desafio de recorde (sequencia de abates, pontaria): vale o melhor do dia,
     e nao a soma. Por isso nao passa pelo bumpDaily, que so acumula.       */
  function peakDaily(id, value) {
    const daily = ensureDaily();
    let changed = false;
    daily.tasks.forEach(function (task) {
      if (task.id !== id || task.done || value <= task.have) return;
      task.have = Math.min(task.need, Math.floor(value));
      if (task.have >= task.need) finishTask(task);
      changed = true;
    });
    if (changed) { saveProfile(); refreshDailyBadge(); }
  }
  function dailyLabel(task) {
    return SugarI18n.t("DAILY_" + task.id.toUpperCase(), {n: task.need});
  }
  /* Uma arma que o jogador ainda nao tem, de preferencia principal. */
  function unownedWeapon() {
    const missing = PRIMARIES.concat(ACCESSORIES).filter(function (index) {
      return !ownsWeapon(index);
    });
    if (!missing.length) return -1;
    return missing[(Math.random() * missing.length) | 0];
  }
  /* Paga na hora em que o desafio e cumprido e devolve o que foi pago, para
     o cartao poder mostrar a arma ou a quantia. Antes o premio ficava preso
     atras de um botao no fim da tela de perfil, e o jogador nunca via.     */
  function claimDaily(task) {
    if (!task.done || task.claimed) return null;
    task.claimed = true;
    const prize = {kind: "candies", amount: 0, weapon: -1, text: ""};
    if (task.weapon) {
      const won = unownedWeapon();
      if (won >= 0) {
        profile.ownedWeapons.push(won);
        prize.kind = "weapon";
        prize.weapon = won;
        prize.text = WEAPONS[won].name;
      } else {
        // sem arma nova para dar, o premio vira o dobro em doces
        prize.amount = task.candies * 2;
        profile.candies += prize.amount;
        prize.text = prize.amount + SugarI18n.t("PRICE_CANDIES_SUFFIX");
      }
    } else {
      prize.amount = task.candies;
      profile.candies += prize.amount;
      prize.text = prize.amount + SugarI18n.t("PRICE_CANDIES_SUFFIX");
    }
    profile.xp += 90;
    saveProfile();
    updateCandyHud();
    updateWeaponSlots();
    vibrate("20,30,40");
    return prize;
  }
  /* ------------------------------------------------ cartao do premio
     Aparece por cima da partida, sem pausar nada: diz qual desafio caiu,
     mostra a arma ganha (o mesmo desenho da loja) ou a pilha de doces, e
     avisa que ja esta na conta — nao ha nada para resgatar depois.
     Se cair mais de um ao mesmo tempo, entram um de cada vez pela fila.   */
  const prizeQueue = [];
  let prizeShowing = false;
  function ensurePrizeCard() {
    let card = document.getElementById("prizeCard");
    if (card) return card;
    card = document.createElement("div");
    card.id = "prizeCard";
    card.innerHTML =
      '<b id="prizeTitle"></b>' +
      '<span id="prizeTask"></span>' +
      '<div id="prizeArt"><canvas id="prizeCanvas"></canvas><em id="prizeCoins"></em></div>' +
      '<strong id="prizeName"></strong>' +
      '<small id="prizeWhere"></small>';
    document.body.appendChild(card);
    return card;
  }
  function showPrizeCard(taskText, prize) {
    if (!prize) return;
    prizeQueue.push({task: taskText, prize: prize});
    runPrizeQueue();
  }
  function runPrizeQueue() {
    if (prizeShowing || !prizeQueue.length) return;
    const item = prizeQueue.shift();
    const prize = item.prize;
    const card = ensurePrizeCard();
    prizeShowing = true;
    document.getElementById("prizeTitle").textContent = SugarI18n.t("PRIZE_TITLE");
    document.getElementById("prizeTask").textContent = item.task;
    document.getElementById("prizeName").textContent = prize.text;
    const canvas = document.getElementById("prizeCanvas");
    const coins = document.getElementById("prizeCoins");
    if (prize.kind === "weapon") {
      canvas.style.display = "block";
      coins.style.display = "none";
      drawWeaponPortrait(canvas, prize.weapon);
      document.getElementById("prizeWhere").textContent = SugarI18n.t("PRIZE_IN_ARSENAL");
    } else {
      canvas.style.display = "none";
      coins.style.display = "flex";
      // numero grande em cima da pilha de doces
      coins.textContent = "+" + prize.amount;
      document.getElementById("prizeWhere").textContent = SugarI18n.t("PRIZE_IN_ACCOUNT");
    }
    card.classList.add("open");
    setTimeout(function () {
      card.classList.remove("open");
      prizeShowing = false;
      setTimeout(runPrizeQueue, 320);
    }, 4200);
  }

  /* Cumpriu: paga sozinho e mostra o cartao com o que entrou. */
  function finishTask(task) {
    task.done = true;
    const prize = claimDaily(task);
    showPrizeCard(dailyLabel(task), prize);
  }
  /* Chamado pelos eventos do jogo. */
  function bumpDaily(id, amount) {
    const daily = ensureDaily();
    let changed = false;
    daily.tasks.forEach(function (task) {
      if (task.id !== id || task.done) return;
      task.have = Math.min(task.need, task.have + (amount || 1));
      if (task.have >= task.need) finishTask(task);
      changed = true;
    });
    if (changed) { saveProfile(); refreshDailyBadge(); }
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
    resetBomb();
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
        // Tres carregadores por caixa (eram dois).
        for (let i = 0; i < WEAPONS.length; i++) {
          collector.ress[i] = Math.min(WEAPONS[i].maxRes, collector.ress[i] + WEAPONS[i].mag * 3);
        }
        collector.res = collector.ress[collector.wep];
      } else if (pickup.type === "candy") {
        if (collector === player) {
          profile.candies += pickup.value || 5;
          saveProfile();
          bumpDaily("candies", 1);
          showToast("+" + (pickup.value || 5) + " DOCES");
        }
      } else if (pickup.type === "weapon") {
        const weaponIndex = clamp(pickup.weapon | 0, 0, WEAPONS.length - 1);
        if (collector === player) {
          takeFieldWeapon(weaponIndex);
        } else {
          collector.wep = weaponIndex;
          collector.mag = collector.mags[weaponIndex] = WEAPONS[weaponIndex].mag;
          collector.res = collector.ress[weaponIndex] = WEAPONS[weaponIndex].mag * 2;
        }
      }
      pickup.active = false;
      // A caixa de municao volta bem mais rapido que os outros itens.
      pickup.respawn = pickup.type === "weapon" ? 32
        : (pickup.type === "ammo" ? 8 : (pickup.type === "candy" ? 15 : 18));
      if (collector === player) {
        vibrate("20,20,20");
        updateHUD();
      }
    });
  }

  /* Munição infinita: a reserva do jogador nunca baixa, então a arma continua
     recarregando para sempre. Fica de fora da sala online de propósito — lá
     quem confere a munição é o servidor, e isso seria vantagem em cima dos
     outros jogadores. Faca e granada não têm reserva: a granada ganha o pente
     de volta e a faca não precisa de nada. */
  function encherReserva(alvo) {
    if (!alvo || alvo.dead) return;
    const weapon = WEAPONS[alvo.wep];
    if (!weapon || weapon.melee) return;
    if (weapon.thrown) {
      if (alvo.mag < weapon.mag) alvo.mag = weapon.mag;
      return;
    }
    /* O teto e o mesmo que o servidor aceita (reserva da tabela + 40% do cinto
       de municao). Usar um numero menor faria os dois lados brigarem pelo valor
       a cada recarga. */
    const cheia = Math.max(weapon.mag, Math.round(weapon.maxRes * 1.4));
    if (alvo.res < cheia && (alvo.reloadT || 0) <= 0) alvo.res = cheia;
    alvo.ress[alvo.wep] = Math.max(alvo.ress[alvo.wep] | 0, cheia);
  }

  function refillInfiniteAmmo() {
    if (!game.infiniteAmmo) return;
    encherReserva(player);
    /* Na sala online quem manda na reserva dos outros e o dono da sala: sem
       encher a deles aqui, a regra valeria so para quem hospeda. */
    if (window.SugarNet && SugarNet.inMatch && SugarNet.role === "host") {
      for (const entity of ents) {
        if (entity !== player && entity.remote) encherReserva(entity);
      }
    }
  }

  function update(dt) {
    if (!player || paused || matchOver) return;
    if (!mapIsComplete() &&
        !game.mapRepairing && performance.now() >= game.mapRepairAt) {
      game.mapRepairAt = performance.now() + 3000;
      if (rebuildSelectedMap()) showToast(SugarI18n.t("TOAST_SCENARIO_RESTORED"));
    }
    refillInfiniteAmmo();
    checkFieldAmmo();
    updateTargets(dt);
    /* Abates contados aqui, e nao no fim da partida: quem sai no meio leva o
       que ja fez. O placar do jogador so sobe quando ele mata. */
    const score = player.score | 0;
    if (score > (game.lastScore | 0)) bumpDaily("kills", score - (game.lastScore | 0));
    game.lastScore = score;
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
    if (game.mode === "team") updateBomb(dt);
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
    const viewer = viewerEntity() || player;
    const enemies = ents.filter(function (entity) {
      const info = labelInfo(entity);
      return entity !== player && !entity.dead && canDamage(player, entity) && info.visible &&
        Math.hypot(entity.x - viewer.x, entity.z - viewer.z) < 24;
    });
    enemies.slice(0, 5).forEach(function (enemy) {
      const angle = Math.atan2(enemy.x - viewer.x, enemy.z - viewer.z) - cam.yaw;
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

  /* ------------------------------------------------------------- minimapa
     A planta da fase e desenhada UMA vez, quando o cenario e montado, num
     canvas guardado a parte. Depois e so girar essa imagem junto com a
     camera — desenhar 150 blocos a cada quadro custaria caro no celular.

     O tom de cada bloco vem da altura dele: chao escuro, muro medio, coisas
     altas quase brancas. Nas fases de dois andares isso e o que deixa ler o
     viaduto por cima da rua.                                              */
  const PLAN_HALF = 82;          // metade do mundo desenhado, em unidades
  const PLAN_PIXELS = 380;
  function buildMapPlan() {
    const canvas = document.createElement("canvas");
    canvas.width = PLAN_PIXELS;
    canvas.height = PLAN_PIXELS;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scale = PLAN_PIXELS / (PLAN_HALF * 2);
    // do mais baixo para o mais alto: o que esta em cima tapa o que esta embaixo
    const blocks = solids.slice().sort(function (a, b) { return a.y1 - b.y1; });
    blocks.forEach(function (b) {
      const height = clamp(b.y1 / 14, 0, 1);
      const tone = Math.round(90 + height * 130);
      context.fillStyle = "rgba(" + tone + "," + Math.round(tone * 0.93) + "," + Math.round(tone * 0.86) + ",.92)";
      context.fillRect((b.x0 + PLAN_HALF) * scale, (b.z0 + PLAN_HALF) * scale,
        Math.max(1.5, (b.x1 - b.x0) * scale), Math.max(1.5, (b.z1 - b.z0) * scale));
    });
    game.mapPlan = canvas;
  }

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
    /* Alcance maior do que o radar antigo (era 58): nas fases novas, que sao
       grandes e de dois andares, 58 mal saia da esquina. */
    const range = 82;
    context.clearRect(0, 0, width, minimapCanvas.height);

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "rgba(39,31,27,.82)";
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

    const viewer = viewerEntity() || player;

    /* A planta gira junto com a camera: o que esta na frente aparece para
       cima, igual aos pontos dos inimigos. */
    if (game.mapPlan) {
      context.save();
      context.translate(centerX, centerY);
      context.rotate(cam.yaw);
      const zoom = radius / range;
      context.scale(zoom, zoom);
      context.translate(-viewer.x, -viewer.z);
      context.globalAlpha = 0.85;
      context.drawImage(game.mapPlan, -PLAN_HALF, -PLAN_HALF, PLAN_HALF * 2, PLAN_HALF * 2);
      context.restore();
      context.globalAlpha = 1;
    }

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
      if (entity === viewer || entity.dead) return;
      const info = labelInfo(entity);
      const teamMode = game.mode === "team" || game.mode === "capture" || game.mode === "survival";
      const ally = !!(teamMode && viewer.team && entity.team === viewer.team);
      if (!ally && !info.visible) return;
      if (!ally) enemyCount++;
      const dx = entity.x - viewer.x;
      const dz = entity.z - viewer.z;
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

      context.fillStyle = ally ? (info.color || "#8fd9c8") : (atEdge ? "#ffcf4d" : "#e8615a");
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
    context.fillText(SugarI18n.mapLabel(game.map).slice(0, 16) + " · " + enemyCount, centerX, 16);
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
        ctx.fillText(SugarI18n.t("OBJECTIVE_CANDY"), p.x, p.y);
      }
    }
    drawBomb();
    drawBombBar();
    drawTargets();
  }

  function draw() {
    game.pickups.forEach(drawPickup);
    drawObjectives();
    drawThreats();
    drawMinimap();
  }

  const ACHIEVEMENT_KEYS = {first: "ACH_FIRST", heads: "ACH_HEADS", wins10: "ACH_WINS10", streak5: "ACH_STREAK5"};
  function achievementLabel(id) { return SugarI18n.t(ACHIEVEMENT_KEYS[id] || id); }
  function completeAchievement(id) {
    if (profile.achievements.indexOf(id) >= 0) return;
    profile.achievements.push(id);
    profile.xp += 100;
    showToast(SugarI18n.t("TOAST_ACHIEVEMENT", {name: achievementLabel(id)}));
  }
  function calculateLevel() {
    profile.level = Math.max(1, Math.floor(Math.sqrt(profile.xp / 220)) + 1);
    const unlock = Math.min(OUTFITS.length - 1, Math.floor(profile.level / 3));
    if (profile.unlockedSkins.indexOf(unlock) < 0) {
      profile.unlockedSkins.push(unlock);
      showToast(SugarI18n.t("TOAST_NEW_OUTFIT"));
    }
    const weaponUnlock = Math.min(WEAPON_SKINS.length - 1, Math.floor(profile.level / 4));
    if (profile.unlockedWeaponSkins.indexOf(weaponUnlock) < 0) {
      profile.unlockedWeaponSkins.push(weaponUnlock);
      showToast(SugarI18n.t("TOAST_NEW_SKIN"));
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
    if (won) bumpDaily("wins", 1);
    bumpDaily("matches", 1);
    if ((player.deaths || 0) === 0) bumpDaily("nodeath", 1);
    peakDaily("accuracy", accuracy);
    peakDaily("streak", player.bestStreak || 0);
    // Partida online conta separado: e o que enche as salas.
    if (window.SugarNet && SugarNet.inMatch) bumpDaily("online", 1);
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
    if (profile.kills >= 1) completeAchievement("first");
    if ((player.headshots || 0) >= 5) completeAchievement("heads");
    if (profile.wins >= 10) completeAchievement("wins10");
    if ((player.bestStreak || 0) >= 5) completeAchievement("streak5");
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
    status.textContent = SugarI18n.t("AD_STATUS_WATCH_TO_END");
    overlay.classList.add("open");
  }

  function requestEndMatchRewardAd() {
    if (rewardAdPending || rewardGrantedForResult) return;
    const watchButton = document.getElementById("adRewardWatch");
    const status = document.getElementById("adRewardStatus");
    rewardAdPending = true;
    if (watchButton) watchButton.disabled = true;
    if (status) status.textContent = SugarI18n.t("AD_STATUS_LOADING");
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
      if (status) status.textContent = SugarI18n.t("AD_STATUS_CANDY_RECEIVED");
      if (watchButton) watchButton.disabled = true;
      showToast(SugarI18n.t("TOAST_CANDY_FROM_AD"));
      vibrate("0,45,50,80");
      setTimeout(closeEndMatchRewardOffer, 1200);
      return;
    }
    if (watchButton) watchButton.disabled = false;
    if (result === "closed") {
      if (status) status.textContent = SugarI18n.t("AD_STATUS_CLOSED_NO_CANDY");
    } else {
      if (status) status.textContent = SugarI18n.t("AD_STATUS_UNAVAILABLE_NEXT_MATCH");
    }
    setTimeout(closeEndMatchRewardOffer, 1800);
  }

  // Presente ganho no anuncio de derrota so vale para a partida que acabou de rodar com ele.
  function pickGiftCandidate() {
    const candidates = [];
    PRIMARIES.forEach(function (index) {
      if (!ownsWeapon(index)) candidates.push({kind: "primary", index: index, name: WEAPONS[index].name});
    });
    ACCESSORIES.forEach(function (index) {
      if (!ownsWeapon(index)) candidates.push({kind: "accessory", index: index, name: WEAPONS[index].name});
    });
    OUTFITS.forEach(function (outfit, index) {
      if (profile.unlockedSkins.indexOf(index) < 0) candidates.push({kind: "outfit", index: index, name: outfit.name});
    });
    WEAPON_SKINS.forEach(function (item, index) {
      if (profile.unlockedWeaponSkins.indexOf(index) < 0) candidates.push({kind: "skin", index: index, name: item.name});
    });
    GEAR.forEach(function (item, index) {
      if (profile.unlockedGear.indexOf(index) < 0) candidates.push({kind: "gear", index: index, name: item.name});
    });
    if (!candidates.length) return null;
    return candidates[(Math.random() * candidates.length) | 0];
  }

  let giftAdPending = false;
  let giftGrantedForOffer = false;
  let pendingGiftCandidate = null;

  function closeGiftRewardOffer() {
    const overlay = document.getElementById("giftRewardOverlay");
    if (overlay) overlay.classList.remove("open");
  }

  function showGiftRewardOffer(candidate) {
    if (!window.SugarAndroid || typeof SugarAndroid.showGiftRewardedAd !== "function") return;
    const overlay = document.getElementById("giftRewardOverlay");
    const title = document.getElementById("giftRewardTitle");
    const watchButton = document.getElementById("giftRewardWatch");
    const status = document.getElementById("giftRewardStatus");
    if (!overlay || !title || !watchButton || !status) return;
    pendingGiftCandidate = candidate;
    giftAdPending = false;
    giftGrantedForOffer = false;
    watchButton.disabled = false;
    title.innerHTML = escapeHtml(SugarI18n.t("GIFT_TITLE_PREFIX")) + '<strong>' + escapeHtml(candidate.name) + '</strong>' + escapeHtml(SugarI18n.t("GIFT_TITLE_SUFFIX"));
    status.textContent = SugarI18n.t("AD_STATUS_GIFT_NEXT_ONLY");
    overlay.classList.add("open");
  }

  function requestGiftRewardAd() {
    if (giftAdPending || giftGrantedForOffer || !pendingGiftCandidate) return;
    const watchButton = document.getElementById("giftRewardWatch");
    const status = document.getElementById("giftRewardStatus");
    giftAdPending = true;
    if (watchButton) watchButton.disabled = true;
    if (status) status.textContent = SugarI18n.t("AD_STATUS_LOADING");
    try {
      SugarAndroid.showGiftRewardedAd();
    } catch (error) {
      onGiftRewardedResult("failed");
    }
  }

  function onGiftRewardedResult(result) {
    const status = document.getElementById("giftRewardStatus");
    const watchButton = document.getElementById("giftRewardWatch");
    giftAdPending = false;
    if (result === "rewarded") {
      if (giftGrantedForOffer || !pendingGiftCandidate) return;
      giftGrantedForOffer = true;
      game.giftItem = pendingGiftCandidate;
      if (status) status.textContent = pendingGiftCandidate.name + SugarI18n.t("GIFT_UNLOCKED_SUFFIX");
      if (watchButton) watchButton.disabled = true;
      showToast(pendingGiftCandidate.name + SugarI18n.t("TOAST_GIFT_NEXT_MATCH_SUFFIX"));
      vibrate("0,45,50,80");
      setTimeout(closeGiftRewardOffer, 1400);
      return;
    }
    if (watchButton) watchButton.disabled = false;
    if (result === "closed") {
      if (status) status.textContent = SugarI18n.t("AD_STATUS_GIFT_CLOSED");
    } else {
      if (status) status.textContent = SugarI18n.t("AD_STATUS_GIFT_UNAVAILABLE");
    }
    setTimeout(closeGiftRewardOffer, 1800);
  }

  // Depois do intersticial obrigatorio (se houver nesta partida), segue pro opcional de sempre.
  let pendingPostMandatoryGift = null;
  function proceedToOptionalOffer(giftCandidate) {
    if (giftCandidate) showGiftRewardOffer(giftCandidate);
    else showEndMatchRewardOffer();
  }
  function requestMandatoryInterstitial(giftCandidate) {
    pendingPostMandatoryGift = giftCandidate;
    if (!window.SugarAndroid || typeof SugarAndroid.showMandatoryInterstitial !== "function") {
      proceedToOptionalOffer(giftCandidate);
      return;
    }
    try {
      SugarAndroid.showMandatoryInterstitial();
    } catch (error) {
      proceedToOptionalOffer(giftCandidate);
    }
  }
  function onMandatoryInterstitialResult() {
    const giftCandidate = pendingPostMandatoryGift;
    pendingPostMandatoryGift = null;
    proceedToOptionalOffer(giftCandidate);
  }

  endMatch = function (winner) {
    if (matchOver) return;
    /* Em torneio, bater a meta classifica em vez de encerrar: o jogador sai e
       os outros continuam disputando as vagas que sobraram. So quando a
       ultima vaga fecha e que a partida termina de verdade. */
    if (tournamentIntercept(winner)) return;
    // O presente, se tinha um, ja foi usado na partida que acabou agora.
    game.giftItem = null;
    const result = recordResult(winner);
    originalEndMatch(winner);
    /* Em torneio o que interessa na tela final e quem passou de chave, e nao
       o placar cru: vai por cima de tudo. */
    if (tournamentOn() && game.qualified.length) {
      const ptxtTorneio = document.getElementById("ptxt");
      const linhas = game.qualified.map(function (q) {
        const meu = player && q.name === player.name && q.id === (player.netId || null);
        return '<div class="row' + (meu ? " me" : "") + '"><span>' + q.position + 'º ' +
          escapeHtml(q.name) + '</span><span>' + q.score + '</span></div>';
      }).join("");
      ptxtTorneio.style.display = "block";
      ptxtTorneio.innerHTML =
        '<div class="resultSummary"><b>' + escapeHtml(SugarI18n.t("TOURNEY_RESULT_TITLE")) + '</b>' +
        '<div style="margin:6px 0 2px">' + linhas + '</div></div>' + ptxtTorneio.innerHTML;
      panelEl.querySelector("h1").textContent = (player && player.qualified)
        ? SugarI18n.t("TOURNEY_YOU_ADVANCE") : SugarI18n.t("TOURNEY_YOU_OUT");
      panelEl.querySelector("h2").textContent = SugarI18n.t("TOURNEY_SUBTITLE",
        {total: qualifierSlots()});
    }
    if (!result) return;
    const ptxt = document.getElementById("ptxt");
    const existing = ptxt.innerHTML;
    ptxt.innerHTML =
      '<div class="resultSummary">' +
      '<b>' + escapeHtml(result.won ? SugarI18n.t("RESULT_VICTORY") : SugarI18n.t("RESULT_MATCH_DONE")) + ' · +' + result.xp +
      ' XP · +' + result.candies + escapeHtml(SugarI18n.t("PRICE_CANDIES_SUFFIX")) + '</b>' +
      '<div class="resultGrid">' +
      '<span>' + escapeHtml(SugarI18n.t("STAT_KILLS")) + '<strong>' + (player.score || 0) + '</strong></span>' +
      '<span>' + escapeHtml(SugarI18n.t("STAT_DEATHS")) + '<strong>' + (player.deaths || 0) + '</strong></span>' +
      '<span>' + escapeHtml(SugarI18n.t("STAT_PRECISION")) + '<strong>' + result.accuracy + '%</strong></span>' +
      '<span>' + escapeHtml(SugarI18n.t("STAT_HEADSHOTS")) + '<strong>' + (player.headshots || 0) + '</strong></span>' +
      '</div></div>' + existing;
    panelEl.classList.add("result-pop");
    setTimeout(function () { panelEl.classList.remove("result-pop"); }, 650);
    // Morreu 2+ vezes nesta partida: oferece um item sorteado da loja em vez do anuncio de doces.
    const giftCandidate = (player.deaths || 0) >= 2 ? pickGiftCandidate() : null;
    // A cada 4a partida (contando desde sempre), um intersticial obrigatorio abre antes do resto.
    const mandatory = profile.matches % 4 === 0;
    setTimeout(function () {
      if (mandatory) requestMandatoryInterstitial(giftCandidate);
      else proceedToOptionalOffer(giftCandidate);
    }, 850);
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
    // Em torneio o que importa no alto da tela e quantas vagas ainda estao em jogo.
    if (tournamentOn()) {
      extra += " · " + SugarI18n.t("TOURNEY_SLOTS_LEFT", {left: Math.max(0, slotsLeft()), total: qualifierSlots()});
    }
    label.textContent = SugarI18n.mapLabel(game.map) + " · " + SugarI18n.modeLabel(game.mode) + extra + " · " + min + ":" + sec;
  }

  function modal(title, html) {
    let root = document.getElementById("sugarModal");
    if (!root) {
      root = document.createElement("div");
      root.id = "sugarModal";
      root.innerHTML = '<div class="sugarCard"><h2 id="sugarModalTitle"></h2><div id="sugarModalBody"></div><button id="sugarModalClose" class="big-btn sub-btn">' + escapeHtml(SugarI18n.t("NET_CLOSE")) + '</button></div>';
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
    const t = SugarI18n.t.bind(SugarI18n);
    const langOptions = SugarI18n.SUPPORTED.map(function (code) {
      return '<option value="' + code + '"' + (SugarI18n.get() === code ? " selected" : "") + '>' +
        escapeHtml(SugarI18n.LANG_NAMES[code]) + '</option>';
    }).join("");
    const adsButton = (!window.SugarAndroid || typeof SugarAndroid.purchaseRemoveAds !== "function") ? "" :
      (window.SugarAndroid.adsRemoved && SugarAndroid.adsRemoved() ?
        '<div class="loadoutNow" style="margin-top:10px">' + escapeHtml(t("ADS_REMOVED_TAG")) + '</div>' :
        '<button id="setRemoveAds" class="big-btn sub-btn" style="margin-top:10px">' + escapeHtml(t("BTN_REMOVE_ADS")) + '</button>' +
        '<button id="setRestorePurchase" class="big-btn sub-btn" style="margin-top:6px;font-size:11px">' + escapeHtml(t("BTN_RESTORE_PURCHASE")) + '</button>');
    modal(t("SETTINGS_TITLE"),
      '<div class="settingGrid">' +
      '<label>' + escapeHtml(t("SET_VOLUME")) + '<input id="setVolume" type="range" min="0" max="100" value="' + Math.round(settings.volume * 100) + '"></label>' +
      '<label>' + escapeHtml(t("SET_MUSIC")) + '<input id="setMusic" type="range" min="0" max="100" value="' + Math.round(settings.music * 100) + '"></label>' +
      '<label>' + escapeHtml(t("SET_SENS_X")) + '<input id="setSensX" type="range" min="2" max="12" step=".2" value="' + (settings.touchSensX * 1000) + '"></label>' +
      '<label>' + escapeHtml(t("SET_SENS_Y")) + '<input id="setSensY" type="range" min="2" max="12" step=".2" value="' + (settings.touchSensY * 1000) + '"></label>' +
      '<label>' + escapeHtml(t("SET_AIM_ASSIST")) + '<input id="setAim" type="range" min="0" max="100" value="' + Math.round(settings.aimAssist * 100) + '"></label>' +
      '<label>' + escapeHtml(t("SET_CONTROLS_SIZE")) + '<input id="setScale" type="range" min="70" max="140" value="' + Math.round(settings.controlsScale * 100) + '"></label>' +
      '<label>' + escapeHtml(t("SET_GRAPHICS")) + '<select id="setGraphics"><option value="high">' + escapeHtml(t("OPT_HIGH")) + '</option><option value="medium">' + escapeHtml(t("OPT_MEDIUM")) + '</option><option value="low">' + escapeHtml(t("OPT_LOW")) + '</option></select></label>' +
      '<label>' + escapeHtml(t("SET_FPS_LIMIT")) + '<select id="setFps"><option>30</option><option>45</option><option>60</option></select></label>' +
      '<label class="checkRow">' + escapeHtml(t("SET_HAPTICS")) + ' <input id="setHaptics" type="checkbox" ' + (settings.haptics ? "checked" : "") + '></label>' +
      '<label>' + escapeHtml(t("SET_LANGUAGE")) + '<select id="setLanguage">' + langOptions + '</select></label>' +
      '</div><button id="setMove" class="big-btn sub-btn">' + escapeHtml(t("BTN_REPOSITION")) + '</button>' + adsButton);
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
    document.getElementById("setLanguage").addEventListener("change", function (event) {
      SugarI18n.set(event.target.value);
      // Muitos elementos (menus, loja, saguao) sao montados uma unica vez com
      // textContent direto, sem data-i18n: recarregar e o jeito confiavel de
      // garantir que tudo (inclusive multiplayer.js) reflita o novo idioma.
      window.location.reload();
    });
    const removeAdsBtn = document.getElementById("setRemoveAds");
    if (removeAdsBtn) removeAdsBtn.addEventListener("click", function () { SugarAndroid.purchaseRemoveAds(); });
    const restoreBtn = document.getElementById("setRestorePurchase");
    if (restoreBtn) restoreBtn.addEventListener("click", function () { SugarAndroid.restorePurchases(); });
  }

  /* ------------------------------------------------------- codigo de progresso
     Um "save" portatil: o proprio codigo carrega o progresso dentro dele, entao
     nao ha servidor, conta, nem dado saindo do aparelho sem o jogador mandar.
     Colou o codigo no outro aparelho, o progresso esta la.

     Para caber em algo que da para digitar, as listas viram mascaras de bits
     (uma arma por bit) e os numeros viram tamanho variavel. Um perfil comum
     fica em torno de 20 caracteres.

     O alfabeto e o do Crockford: 32 simbolos, sem I, L, O e U. Os tres
     primeiros somem porque se confundem com 1 e 0 ao copiar da tela, e o U
     sai para nao formar palavrao sem querer. Tem que ser 32 mesmo: cada
     simbolo carrega 5 bits, e um alfabeto de 31 faria dois valores caírem no
     mesmo caractere.                                                        */
  const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const CODE_VERSION = 1;

  function bitsOf(list, size) {
    let mask = 0;
    (list || []).forEach(function (index) {
      index = index | 0;
      if (index >= 0 && index < size) mask |= (1 << index);
    });
    return mask;
  }
  function listOf(mask, size) {
    const out = [];
    for (let i = 0; i < size; i++) if (mask & (1 << i)) out.push(i);
    return out;
  }
  // Numero em bytes de 7 bits, o oitavo diz "tem mais".
  function pushVar(bytes, value) {
    value = Math.max(0, Math.floor(value));
    do {
      const part = value & 0x7f;
      value = Math.floor(value / 128);
      bytes.push(value > 0 ? (part | 0x80) : part);
    } while (value > 0);
  }
  function readVar(bytes, cursor) {
    let value = 0, shift = 1, byte;
    do {
      byte = bytes[cursor.at++];
      if (byte === undefined) throw new Error("codigo incompleto");
      value += (byte & 0x7f) * shift;
      shift *= 128;
    } while (byte & 0x80);
    return value;
  }

  function progressBytes() {
    const bytes = [CODE_VERSION];
    pushVar(bytes, profile.candies);
    pushVar(bytes, profile.xp);
    pushVar(bytes, profile.level);
    pushVar(bytes, bitsOf(profile.ownedWeapons, WEAPONS.length));
    pushVar(bytes, bitsOf(profile.unlockedSkins, OUTFITS.length));
    pushVar(bytes, bitsOf(profile.unlockedWeaponSkins, WEAPON_SKINS.length));
    pushVar(bytes, bitsOf(profile.unlockedGear, GEAR.length));
    pushVar(bytes, bitsOf(profile.gearSet, GEAR.length));
    pushVar(bytes, profile.primary);
    pushVar(bytes, profile.accessory);
    pushVar(bytes, profile.skin);
    pushVar(bytes, profile.weaponSkin);
    pushVar(bytes, grenadeStock());
    pushVar(bytes, profile.wins);
    pushVar(bytes, profile.kills);
    // Soma de verificacao: pega erro de digitacao antes de estragar o perfil.
    let sum = 0;
    bytes.forEach(function (b) { sum = (sum * 31 + b) % 251; });
    bytes.push(sum);
    return bytes;
  }
  /* Base32: cada simbolo carrega 5 bits. O buffer nunca passa de 12 bits,
     entao as contas cabem folgadas em numero comum.                        */
  function bytesToCode(bytes) {
    let text = "";
    let buffer = 0, bits = 0;
    bytes.forEach(function (byte) {
      buffer = (buffer << 8) | (byte & 0xff);
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        text += CODE_ALPHABET[(buffer >> bits) & 31];
      }
      buffer &= (1 << bits) - 1;
    });
    // sobra de bits vira o ultimo simbolo, completada com zeros
    if (bits > 0) text += CODE_ALPHABET[(buffer << (5 - bits)) & 31];
    return text.replace(/(.{5})(?=.)/g, "$1-");
  }
  function codeToBytes(text) {
    const clean = String(text || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
      // o que o olho troca ao copiar da tela
      .replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
    const bytes = [];
    let buffer = 0, bits = 0;
    for (let i = 0; i < clean.length; i++) {
      const value = CODE_ALPHABET.indexOf(clean[i]);
      if (value < 0) throw new Error("caractere invalido");
      buffer = (buffer << 5) | value;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
        buffer &= (1 << bits) - 1;
      }
    }
    return bytes;
  }
  function exportProgress() {
    return bytesToCode(progressBytes());
  }
  function importProgress(text) {
    const bytes = codeToBytes(text);
    if (bytes.length < 8) throw new Error("codigo curto demais");
    const given = bytes.pop();
    let sum = 0;
    bytes.forEach(function (b) { sum = (sum * 31 + b) % 251; });
    if (sum !== given) throw new Error("soma de verificacao errada");
    const cursor = {at: 0};
    const version = bytes[cursor.at++];
    if (version !== CODE_VERSION) throw new Error("codigo de outra versao");
    const read = {
      candies: readVar(bytes, cursor),
      xp: readVar(bytes, cursor),
      level: readVar(bytes, cursor),
      weapons: readVar(bytes, cursor),
      skins: readVar(bytes, cursor),
      weaponSkins: readVar(bytes, cursor),
      gear: readVar(bytes, cursor),
      gearSet: readVar(bytes, cursor),
      primary: readVar(bytes, cursor),
      accessory: readVar(bytes, cursor),
      skin: readVar(bytes, cursor),
      weaponSkin: readVar(bytes, cursor),
      grenades: readVar(bytes, cursor),
      wins: readVar(bytes, cursor),
      kills: readVar(bytes, cursor)
    };
    profile.candies = read.candies;
    profile.xp = read.xp;
    profile.level = Math.max(1, read.level);
    profile.ownedWeapons = listOf(read.weapons, WEAPONS.length);
    profile.unlockedSkins = listOf(read.skins, OUTFITS.length);
    profile.unlockedWeaponSkins = listOf(read.weaponSkins, WEAPON_SKINS.length);
    profile.unlockedGear = listOf(read.gear, GEAR.length);
    profile.gearSet = listOf(read.gearSet, GEAR.length).filter(function (i) { return i > 0; });
    profile.primary = read.primary;
    profile.accessory = read.accessory;
    profile.skin = read.skin;
    profile.weaponSkin = read.weaponSkin;
    profile.grenadeStock = read.grenades;
    profile.wins = read.wins;
    profile.kills = read.kills;
    // As mesmas amarras do carregamento normal, para um codigo torto nao
    // deixar o perfil num estado que o jogo nao sabe desenhar.
    if (profile.ownedWeapons.indexOf(4) < 0) profile.ownedWeapons.push(4);
    if (profile.ownedWeapons.indexOf(10) < 0) profile.ownedWeapons.push(10);
    if (profile.unlockedSkins.indexOf(0) < 0) profile.unlockedSkins.push(0);
    if (profile.unlockedWeaponSkins.indexOf(0) < 0) profile.unlockedWeaponSkins.push(0);
    if (profile.unlockedGear.indexOf(0) < 0) profile.unlockedGear.push(0);
    if (PRIMARIES.indexOf(profile.primary) < 0 ||
        profile.ownedWeapons.indexOf(profile.primary) < 0) profile.primary = 4;
    if (ACCESSORIES.indexOf(profile.accessory) < 0 ||
        profile.ownedWeapons.indexOf(profile.accessory) < 0) profile.accessory = 10;
    profile.skin = profile.unlockedSkins.indexOf(profile.skin) >= 0 ? profile.skin : 0;
    profile.weaponSkin = profile.unlockedWeaponSkins.indexOf(profile.weaponSkin) >= 0 ? profile.weaponSkin : 0;
    profile.gearSet = profile.gearSet.filter(function (i) { return profile.unlockedGear.indexOf(i) >= 0; });
    profile.gear = profile.gearSet.length ? profile.gearSet[0] : 0;
    profile.grenadeStock = clamp(profile.grenadeStock, 0, GRENADE_STOCK_MAX);
    syncLoadout();
    saveProfile();
    updateWeaponSlots();
    updateCandyHud();
  }

  /* ------------------------------------------------- desenho dos desafios
     Um simbolo por tipo, para bater o olho e entender sem ler. Os que sao
     arma reaproveitam o desenho da loja; o resto e forma chapada com
     contorno, do mesmo jeito que o resto do jogo.
     O pote de doce e copia fiel do que gira no mapa (quadrado rosa com D),
     senao o desafio pede uma coisa que o jogador nao reconhece na fase.   */
  /* A granada fica de fora: o desenho dela, reduzido a 38px, vira uma caixa
     marrom que ninguem reconhece. Ela ganha silhueta propria mais abaixo,
     nas cores da arma (#ffcf4d e #e8615a).                                */
  const DAILY_ART = {kills: 4, melee: 10};
  function dailyIcon(canvas, id) {
    if (DAILY_ART[id] !== undefined) { drawWeaponPortrait(canvas, DAILY_ART[id]); return; }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 34, h = canvas.clientHeight || 34;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const c = canvas.getContext("2d");
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.34;
    c.lineWidth = Math.max(1.6, r * 0.16);
    c.strokeStyle = "#4a3b33";
    c.lineJoin = "round";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const disc = function (color, radius) {
      c.fillStyle = color;
      c.beginPath(); c.arc(cx, cy, radius, 0, Math.PI * 2); c.fill(); c.stroke();
    };
    if (id === "candies") {
      // o pote como ele aparece na fase: quadrado rosa levemente girado, com D
      c.save(); c.translate(cx, cy); c.rotate(-0.22);
      c.fillStyle = "#f4a6c0";
      c.beginPath();
      if (c.roundRect) c.roundRect(-r, -r, r * 2, r * 2, r * 0.35);
      else c.rect(-r, -r, r * 2, r * 2);
      c.fill(); c.stroke();
      c.rotate(0.22);
      c.fillStyle = "#4a3b33";
      c.font = "900 " + (r * 1.15).toFixed(0) + "px sans-serif";
      c.fillText("D", 0, 1);
      c.restore();
    } else if (id === "grenade") {
      // corpo redondo, tampa e alavanca: silhueta que se le de relance
      c.fillStyle = "#e8615a";
      c.beginPath(); c.arc(cx, cy + r * 0.28, r * 0.82, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = "#ffcf4d";
      c.beginPath();
      if (c.roundRect) c.roundRect(cx - r * 0.3, cy - r * 0.95, r * 0.6, r * 0.42, r * 0.12);
      else c.rect(cx - r * 0.3, cy - r * 0.95, r * 0.6, r * 0.42);
      c.fill(); c.stroke();
      c.beginPath();
      c.moveTo(cx + r * 0.24, cy - r * 0.88);
      c.lineTo(cx + r * 0.72, cy - r * 0.72);
      c.lineTo(cx + r * 0.6, cy - r * 0.1);
      c.stroke();
      // a argola do pino, do outro lado
      c.beginPath(); c.arc(cx - r * 0.62, cy - r * 0.86, r * 0.24, 0, Math.PI * 2); c.stroke();
    } else if (id === "targets" || id === "accuracy") {
      // alvo do campo de tiro; a pontaria ganha a cruz da mira por cima
      disc("#fffdf7", r);
      c.fillStyle = "#e8615a";
      c.beginPath(); c.arc(cx, cy, r * 0.56, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(cx, cy, r * 0.18, 0, Math.PI * 2); c.fillStyle = "#fffdf7"; c.fill();
      if (id === "accuracy") {
        c.beginPath();
        c.moveTo(cx - r * 1.28, cy); c.lineTo(cx - r * 0.72, cy);
        c.moveTo(cx + r * 0.72, cy); c.lineTo(cx + r * 1.28, cy);
        c.moveTo(cx, cy - r * 1.28); c.lineTo(cx, cy - r * 0.72);
        c.moveTo(cx, cy + r * 0.72); c.lineTo(cx, cy + r * 1.28);
        c.stroke();
      }
    } else if (id === "headshots") {
      // cabeca de lado com o ponto vermelho da mira
      c.fillStyle = "#f0c9a0";
      c.beginPath();
      if (c.roundRect) c.roundRect(cx - r * 0.85, cy - r * 0.95, r * 1.7, r * 1.9, r * 0.3);
      else c.rect(cx - r * 0.85, cy - r * 0.95, r * 1.7, r * 1.9);
      c.fill(); c.stroke();
      c.fillStyle = "#4a3b33";
      c.beginPath(); c.arc(cx + r * 0.3, cy - r * 0.2, r * 0.16, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#e8615a";
      c.beginPath(); c.arc(cx - r * 0.25, cy - r * 0.45, r * 0.3, 0, Math.PI * 2); c.fill(); c.stroke();
    } else if (id === "wins") {
      // tacinha
      c.fillStyle = "#ffcf4d";
      c.beginPath();
      c.moveTo(cx - r * 0.8, cy - r);
      c.lineTo(cx + r * 0.8, cy - r);
      c.lineTo(cx + r * 0.42, cy + r * 0.15);
      c.lineTo(cx - r * 0.42, cy + r * 0.15);
      c.closePath(); c.fill(); c.stroke();
      c.beginPath();
      c.moveTo(cx, cy + r * 0.15); c.lineTo(cx, cy + r * 0.62);
      c.moveTo(cx - r * 0.6, cy + r * 0.95); c.lineTo(cx + r * 0.6, cy + r * 0.95);
      c.stroke();
    } else if (id === "streak") {
      // chama: sequencia sem morrer
      c.fillStyle = "#f79a5e";
      c.beginPath();
      c.moveTo(cx, cy - r * 1.15);
      c.quadraticCurveTo(cx + r * 1.05, cy - r * 0.1, cx + r * 0.55, cy + r * 0.72);
      c.quadraticCurveTo(cx, cy + r * 1.2, cx - r * 0.55, cy + r * 0.72);
      c.quadraticCurveTo(cx - r * 1.05, cy - r * 0.1, cx, cy - r * 1.15);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = "#ffcf4d";
      c.beginPath();
      c.moveTo(cx, cy - r * 0.25);
      c.quadraticCurveTo(cx + r * 0.5, cy + r * 0.25, cx, cy + r * 0.85);
      c.quadraticCurveTo(cx - r * 0.5, cy + r * 0.25, cx, cy - r * 0.25);
      c.fill();
    } else if (id === "nodeath") {
      // coracao cheio: terminar a partida sem morrer
      c.fillStyle = "#63c86a";
      c.beginPath();
      c.moveTo(cx, cy + r);
      c.quadraticCurveTo(cx - r * 1.35, cy - r * 0.15, cx - r * 0.5, cy - r * 0.78);
      c.quadraticCurveTo(cx, cy - r * 1.05, cx, cy - r * 0.35);
      c.quadraticCurveTo(cx, cy - r * 1.05, cx + r * 0.5, cy - r * 0.78);
      c.quadraticCurveTo(cx + r * 1.35, cy - r * 0.15, cx, cy + r);
      c.closePath(); c.fill(); c.stroke();
    } else if (id === "online") {
      // globo: partida online
      disc("#8fd9c8", r);
      c.beginPath();
      c.moveTo(cx - r, cy); c.lineTo(cx + r, cy);
      c.stroke();
      c.beginPath(); c.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2); c.stroke();
    } else {
      // matches e qualquer tipo novo: o triangulo de jogar
      disc("#ffcf4d", r);
      c.fillStyle = "#4a3b33";
      c.beginPath();
      c.moveTo(cx - r * 0.32, cy - r * 0.5);
      c.lineTo(cx + r * 0.55, cy);
      c.lineTo(cx - r * 0.32, cy + r * 0.5);
      c.closePath(); c.fill();
    }
  }
  function paintDailyIcons() {
    document.querySelectorAll(".dailyIcon").forEach(function (canvas) {
      dailyIcon(canvas, canvas.dataset.kind || "");
    });
  }

  function dailyMarkup() {
    const daily = ensureDaily();
    return '<div class="dailyList">' + daily.tasks.map(function (task, index) {
      const ratio = clamp(task.have / task.need, 0, 1) * 100;
      const prize = task.weapon ? SugarI18n.t("DAILY_PRIZE_WEAPON")
        : task.candies + SugarI18n.t("PRICE_CANDIES_SUFFIX");
      /* Nao cumprido: o botao vira atalho para a partida, mostrando o quanto
         falta. Ler "2/13" e nao ter para onde ir era o fim da linha. */
      const action = task.claimed ? SugarI18n.t("DAILY_TAKEN")
        : (task.done ? SugarI18n.t("DAILY_CLAIM")
                     : task.have + "/" + task.need + " · " + SugarI18n.t("DAILY_GO"));
      return '<div class="dailyRow ' + (task.done ? "done" : "") + '">' +
        '<canvas class="dailyIcon" data-kind="' + escapeHtml(task.id) + '"></canvas>' +
        '<div class="dailyText"><b>' + escapeHtml(dailyLabel(task)) + '</b>' +
        '<small>' + escapeHtml(prize) + '</small>' +
        '<i class="dailyBar"><b style="width:' + ratio.toFixed(0) + '%"></b></i></div>' +
        '<button class="dailyClaim big-btn sub-btn' + (task.done ? "" : " dailyGo") + '" data-task="' + index + '" ' +
        (task.claimed ? "disabled" : "") + '>' + escapeHtml(action) + '</button></div>';
    }).join("") + '</div>';
  }
  /* Quantos premios estao esperando resgate. E o numero da bolinha vermelha
     no botao do menu — sem ela, o jogador cumpria o desafio e nunca ficava
     sabendo, porque a lista morava no fim da tela de perfil.               */
  /* O premio ja foi pago sozinho, entao a bolinha conta o que o jogador ainda
     nao viu na tela do desafio — e um aviso de novidade, nao de pendencia. */
  function dailyReady() {
    return ensureDaily().tasks.filter(function (task) {
      return task.done && !task.seen;
    }).length;
  }
  function refreshDailyBadge() {
    const badge = document.getElementById("dailyBadge");
    if (!badge) return;
    const ready = dailyReady();
    badge.textContent = ready;
    badge.style.display = ready ? "block" : "none";
  }
  function bindDailyClaims(after) {
    document.querySelectorAll(".dailyClaim").forEach(function (button) {
      button.addEventListener("click", function () {
        const daily = ensureDaily();
        const task = daily.tasks[parseInt(button.dataset.task, 10)];
        if (!task) return;
        // Ainda nao cumprido: fecha a tela e cai direto na partida.
        if (!task.done) { goPlay(task); return; }
        claimDaily(task);
        refreshDailyBadge();
        after();
      });
    });
  }
  /* Leva para onde o desafio pode ser cumprido: o de partida online abre a
     sala online, o resto cai no jogo normal.                              */
  function goPlay(task) {
    const root = document.getElementById("sugarModal");
    if (root) root.classList.remove("open");
    const online = task && task.id === "online";
    const button = document.getElementById(online ? "bOnline" : "bPlay");
    if (button) button.click();
    else if (!online) showToast(SugarI18n.t("DAILY_HINT"));
  }
  /* Tela propria, aberta pelo botao do menu. A mesma lista tambem continua
     dentro do perfil, para quem ja conhecia o caminho.                     */
  function openDaily() {
    const daily = ensureDaily();
    modal(SugarI18n.t("SECTION_DAILY"),
      '<p class="dailyHint">' + escapeHtml(SugarI18n.t("DAILY_HINT")) + '</p>' + dailyMarkup());
    paintDailyIcons();
    bindDailyClaims(openDaily);
    // Viu a lista: a bolinha de novidade zera.
    let changed = false;
    daily.tasks.forEach(function (task) {
      if (task.done && !task.seen) { task.seen = true; changed = true; }
    });
    if (changed) saveProfile();
    refreshDailyBadge();
  }

  function openProfile() {
    const next = Math.pow(profile.level, 2) * 220;
    const history = profile.history.length
      ? profile.history.map(function (item) {
          return '<div class="historyRow"><b>' + (item.won ? SugarI18n.t("RESULT_WIN") : SugarI18n.t("RESULT_MATCH")) + '</b><span>' +
            item.kills + 'A/' + item.deaths + 'M · ' + item.accuracy + '%</span></div>';
        }).join("")
      : '<p>' + escapeHtml(SugarI18n.t("NO_MATCHES")) + '</p>';
    const skins = profile.unlockedSkins.map(function (skin) {
      return '<button class="skinPick ' + (profile.skin === skin ? "on" : "") + '" data-skin="' + skin + '">' +
        '<canvas class="outfitCanvas skinPickArt" data-outfit="' + skin + '"></canvas>' +
        '<span>' + escapeHtml(OUTFITS[skin].name) + '</span></button>';
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
    modal(SugarI18n.t("PROFILE_TITLE_PREFIX") + profile.level,
      '<label class="profileName">' + escapeHtml(SugarI18n.t("LABEL_NAME")) + '<input id="profileName" maxlength="14" value="' + escapeHtml(profile.name) + '"></label>' +
      '<div class="xpBar"><i style="width:' + clamp(profile.xp / next * 100, 0, 100) + '%"></i></div>' +
      '<p><b>' + profile.xp + ' XP</b> · <b>' + profile.candies + escapeHtml(SugarI18n.t("PRICE_CANDIES_SUFFIX")) + '</b> · ' +
      profile.wins + escapeHtml(SugarI18n.t("WINS_SUFFIX")) + ' · ' + profile.kills + escapeHtml(SugarI18n.t("KILLS_SUFFIX")) + '</p>' +
      '<h3>' + escapeHtml(SugarI18n.t("SECTION_OUTFITS")) + '</h3><div class="skinList">' + skins + '</div>' +
      '<h3>' + escapeHtml(SugarI18n.t("SECTION_WEAPON_SKINS")) + '</h3><div class="skinList">' + weaponSkins + '</div>' +
      '<h3>' + escapeHtml(SugarI18n.t("SECTION_DAILY")) + '</h3>' + dailyMarkup() +
      '<h3>' + SugarI18n.t("SECTION_ACHIEVEMENTS", {n: profile.achievements.length}) + '</h3>' +
      '<p>' + (profile.achievements.map(function (id) { return escapeHtml(achievementLabel(id)); }).join(" · ") || escapeHtml(SugarI18n.t("NO_ACHIEVEMENTS"))) + '</p>' +
      '<h3>' + escapeHtml(SugarI18n.t("SECTION_PROGRESS")) + '</h3>' +
      '<p class="progressHint">' + escapeHtml(SugarI18n.t("PROGRESS_HINT")) + '</p>' +
      '<div class="progressBox">' +
        '<input id="progressCode" class="progressField" readonly value="' + escapeHtml(exportProgress()) + '">' +
        '<button id="progressCopy" class="big-btn sub-btn">' + escapeHtml(SugarI18n.t("PROGRESS_COPY")) + '</button>' +
      '</div>' +
      '<div class="progressBox">' +
        '<input id="progressPaste" class="progressField" maxlength="80" placeholder="' + escapeHtml(SugarI18n.t("PROGRESS_PASTE")) + '">' +
        '<button id="progressRestore" class="big-btn sub-btn">' + escapeHtml(SugarI18n.t("PROGRESS_RESTORE")) + '</button>' +
      '</div>' +
      '<h3>' + escapeHtml(SugarI18n.t("SECTION_HISTORY")) + '</h3><div class="historyList">' + history + '</div>');
    document.getElementById("profileName").addEventListener("change", function (event) {
      profile.name = event.target.value.replace(/[<>]/g, "").trim().slice(0, 14) || SugarI18n.t("DEFAULT_PLAYER_NAME");
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
    bindDailyClaims(openProfile);
    document.getElementById("progressCopy").addEventListener("click", function () {
      const field = document.getElementById("progressCode");
      field.select();
      field.setSelectionRange(0, 99);
      let copied = false;
      /* execCommand e o unico que funciona no WebView de file://: la a area de
         transferencia moderna exige origem segura, que file:// nao e. */
      try { copied = document.execCommand("copy"); } catch (error) {}
      if (!copied && navigator.clipboard) {
        navigator.clipboard.writeText(field.value).then(function () {
          showToast(SugarI18n.t("PROGRESS_COPIED"));
        }, function () {
          showToast(SugarI18n.t("PROGRESS_COPY_MANUAL"));
        });
        return;
      }
      showToast(SugarI18n.t(copied ? "PROGRESS_COPIED" : "PROGRESS_COPY_MANUAL"));
    });
    document.getElementById("progressRestore").addEventListener("click", function () {
      const text = document.getElementById("progressPaste").value.trim();
      if (!text) { showToast(SugarI18n.t("PROGRESS_PASTE")); return; }
      try {
        importProgress(text);
        showToast(SugarI18n.t("PROGRESS_RESTORED"));
        vibrate("20,30,40");
        openProfile();
      } catch (error) {
        showToast(SugarI18n.t("PROGRESS_INVALID"));
        vibrate(45);
      }
    });
    paintPortraits();
  }

  function updateCandyHud() {
    const hud = document.getElementById("candyHud");
    if (hud) hud.textContent = Math.floor(profile.candies) + SugarI18n.t("PRICE_CANDIES_SUFFIX");
  }

  /* O HUD tem um espaco por arma do LOADOUT: 1 e 2 sao os equipados, 3 a 5 as
     achadas no chao. Como a lista muda no meio da partida, os elementos sao
     refeitos aqui e o clique vem por delegacao no container.               */
  let slotsBound = false;
  function updateWeaponSlots() {
    const root = document.getElementById("slots");
    if (!root) return;
    if (!slotsBound) {
      slotsBound = true;
      const pick = function (event) {
        const slot = event.target.closest ? event.target.closest(".slot") : null;
        if (!slot) return;
        if (event.type === "touchstart") event.preventDefault();
        setWeapon(parseInt(slot.dataset.w, 10) | 0);
      };
      root.addEventListener("click", pick);
      root.addEventListener("touchstart", pick, {passive: false});
    }
    while (root.children.length > LOADOUT.length) root.removeChild(root.lastChild);
    while (root.children.length < LOADOUT.length) {
      const slot = document.createElement("div");
      slot.className = "slot pill";
      root.appendChild(slot);
    }
    LOADOUT.forEach(function (raw, seat) {
      const slot = root.children[seat];
      const index = clamp(raw | 0, 0, WEAPONS.length - 1);
      const weapon = WEAPONS[index];
      const available = canUseWeapon(index);
      const field = fieldWeapons.indexOf(index) >= 0;
      slot.dataset.slot = String(seat);
      slot.dataset.w = String(index);
      slot.classList.toggle("locked", !available);
      slot.classList.toggle("field", field);
      slot.classList.toggle("on", player && index === (player.wep | 0));
      slot.textContent = available ? String(seat + 1) : "$";
      slot.title = weapon.name + (available ? "" : " · " + SugarI18n.t("BADGE_LOCKED"));
    });
  }

  /* ------------------------------------------------- armas achadas na fase
     Entram num espaco novo (3 a 5), vem so com o pente cheio e sem reserva:
     gastou a ultima bala, o espaco some e voce volta para o que era seu.   */
  function takeFieldWeapon(index) {
    index = clamp(index | 0, 0, WEAPONS.length - 1);
    if (game.tempWeapons.indexOf(index) < 0) game.tempWeapons.push(index);
    const weapon = WEAPONS[index];
    const known = LOADOUT.indexOf(index) >= 0;
    if (!known) {
      // sem espaco livre, a mais antiga cede o lugar
      if (fieldWeapons.length >= FIELD_SLOTS) dropFieldWeapon(fieldWeapons[0], true);
      fieldWeapons.push(index);
      rebuildFieldSlots();
    }
    if (weapon.thrown) {
      // granada do chao conta como de fabrica: nao entra no estoque comprado
      const found = weapon.mag;
      player.mags[index] = Math.min(GRENADE_MAX, (player.mags[index] | 0) + found);
      addFieldGrenades(found);
    } else {
      player.mags[index] = weapon.mag;
      player.ress[index] = 0;      // nao recarrega: e o que veio no pente
    }
    originalSetWeapon(index);
    showToast(weapon.name + " · " + SugarI18n.t("FIELD_WEAPON_HINT"));
    updateWeaponSlots();
  }
  /* ------------------------------------------------------ saque do abate
     A arma de quem voce matou entra num espaco proprio da barra, com pente e
     reserva cheios, e a arma que estava na sua mao continua na sua mao. Para
     usar o saque e so tocar no numero do espaco. O aviso vai em numeros —
     quantas balas vieram e em qual espaco — porque no meio do tiroteio nome
     de arma sozinho nao diz o que fazer.                                   */
  function lootWeapon(index) {
    index = clamp(index | 0, 0, WEAPONS.length - 1);
    if (!player || player.dead) return;
    const weapon = WEAPONS[index];
    if (game.tempWeapons.indexOf(index) < 0) game.tempWeapons.push(index);
    const equipped = LOADOUT.indexOf(index) >= 0;
    if (!equipped) {
      if (fieldWeapons.length >= FIELD_SLOTS) dropFieldWeapon(fieldWeapons[0], true);
      fieldWeapons.push(index);
      rebuildFieldSlots();
    }
    let gained;
    if (weapon.thrown) {
      gained = weapon.mag;
      player.mags[index] = Math.min(GRENADE_MAX, (player.mags[index] | 0) + gained);
      addFieldGrenades(gained);
    } else {
      // saque de abate vem inteiro: pente cheio mais a reserva
      gained = weapon.mag + weapon.maxRes;
      player.mags[index] = weapon.mag;
      player.ress[index] = weapon.maxRes;
      // se ja estava na mao, o numero do HUD tem que acompanhar
      if ((player.wep | 0) === index) { player.mag = player.mags[index]; player.res = player.ress[index]; }
    }
    updateWeaponSlots();
    updateHUD();
    const seat = LOADOUT.indexOf(index);
    showToast(SugarI18n.t("LOOT_TAKEN", {
      weapon: weapon.name,
      ammo: gained,
      slot: (seat < 0 ? 1 : seat + 1)
    }));
    vibrate("15,20,25");
  }

  function dropFieldWeapon(index, silent) {
    const at = fieldWeapons.indexOf(index);
    if (at < 0) return;
    fieldWeapons.splice(at, 1);
    const tempAt = game.tempWeapons.indexOf(index);
    if (tempAt >= 0 && !ownsWeapon(index)) game.tempWeapons.splice(tempAt, 1);
    player.mags[index] = 0;
    player.ress[index] = 0;
    rebuildFieldSlots();
    if ((player.wep | 0) === index) originalSetWeapon(LOADOUT[0] | 0);
    if (!silent) showToast(WEAPONS[index].name + " · " + SugarI18n.t("FIELD_WEAPON_GONE"));
    updateWeaponSlots();
  }
  // Roda todo quadro: assim a arma some no instante em que a ultima bala sai.
  function checkFieldAmmo() {
    if (!player || player.dead || !fieldWeapons.length) return;
    fieldWeapons.slice().forEach(function (index) {
      const mag = (player.wep | 0) === index ? player.mag : player.mags[index];
      const res = (player.wep | 0) === index ? player.res : player.ress[index];
      if ((mag | 0) <= 0 && (res | 0) <= 0) dropFieldWeapon(index);
    });
  }
  function clearFieldWeapons() {
    if (!fieldWeapons.length) return;
    fieldWeapons.slice().forEach(function (index) { dropFieldWeapon(index, true); });
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
      [SugarI18n.t("STAT_DMG"), bar(weapon.dmg * weapon.pellets, 110), weapon.dmg * (weapon.pellets > 1 ? weapon.pellets : 1)],
      [SugarI18n.t("STAT_RANGE"), bar(weapon.range, 175), Math.round(weapon.range) + "m"],
      [SugarI18n.t("STAT_PRECISION"), bar(aim, 0.0028, true), ""],
      [SugarI18n.t("STAT_RATE"), bar(weapon.rate, 0.066, true), ""],
      [SugarI18n.t("STAT_MOBILITY"), bar(1 - (weapon.weight || 0), 1), ""]
    ];
    return '<div class="statList">' + rows.map(function (row) {
      return '<span class="statRow"><em>' + row[0] + '</em>' + row[1] +
        '<u>' + row[2] + '</u></span>';
    }).join("") + '</div>';
  }
  function priceTag(price, owned) {
    if (owned) return SugarI18n.t("PRICE_OWNED");
    return price === 0 ? SugarI18n.t("PRICE_FREE") : price + SugarI18n.t("PRICE_CANDIES_SUFFIX");
  }

  /* ---------------------------------------------------------------- arsenal
     O retrato de cada arma no arsenal e desenhado com as MESMAS caixas do
     viewmodel (VM_MODELS), so que numa camera fixa de tres quartos e sem
     perspectiva. Reaproveitar BOXF e shade() faz o retrato sair identico ao
     que o jogador ve na mao: cor chapada com contorno preto.                */
  /* A arma aparece de lado (o perfil e o que a identifica); o boneco aparece
     de tres quartos, com o rosto para o jogador.                             */
  const ART_WEAPON = {yaw: -1.78, tilt: 0.34}, ART_OUTFIT = {yaw: 0.58, tilt: 0.10};
  let artView = ART_WEAPON;
  function artPoint(x, y, z) {
    const ca = Math.cos(artView.yaw), sa = Math.sin(artView.yaw);
    const x1 = x * ca + z * sa, z1 = z * ca - x * sa;
    const ct = Math.cos(artView.tilt), st = Math.sin(artView.tilt);
    return {x: x1, y: -(y * ct - z1 * st), d: y * st + z1 * ct};
  }
  /* Uma peca e [x, y, z, hx, hy, hz, cor, rotacaoX?] — o mesmo formato de
     VM_MODELS, para que arma e boneco passem pelo mesmo caminho.             */
  function boxFaces(parts) {
    const faces = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const hx = p[3], hy = p[4], hz = p[5];
      const tilt = p[7] || 0, ct = Math.cos(tilt), st = Math.sin(tilt);
      const corners = [];
      for (let c = 0; c < 8; c++) {
        const lx = (c & 1) ? hx : -hx, ly = (c & 2) ? hy : -hy, lz = (c & 4) ? hz : -hz;
        // a mesma rotacao em X que o viewmodel aplica em algumas pecas
        corners.push(artPoint(p[0] + lx, p[1] + ly * ct - lz * st, p[2] + ly * st + lz * ct));
      }
      for (let k = 0; k < 6; k++) {
        const f = BOXF[k];
        const quad = [corners[f[0]], corners[f[1]], corners[f[2]], corners[f[3]]];
        // face virada para tras: area com sinal negativo na tela
        const area = (quad[1].x - quad[0].x) * (quad[2].y - quad[0].y) -
                     (quad[2].x - quad[0].x) * (quad[1].y - quad[0].y);
        if (area <= 0) continue;
        faces.push({quad: quad, color: shade(p[6], f[4]),
          depth: (quad[0].d + quad[1].d + quad[2].d + quad[3].d) / 4});
      }
    }
    faces.sort(function (a, b) { return b.depth - a.depth; });
    return faces;
  }
  function weaponFaces(index, paint) {
    artView = ART_WEAPON;
    const weapon = WEAPONS[index];
    const main = (paint && paint[0]) || weapon.color;
    const accent = (paint && paint[1]) || weapon.accent;
    const parts = (typeof VM_MODELS !== "undefined" && VM_MODELS[index]) || [];
    return boxFaces(parts.map(function (p) {
      const color = p[6] === "main" ? main : (p[6] === "accent" ? accent : p[6]);
      return [p[0], p[1], p[2], p[3], p[4], p[5], color, p[7]];
    }));
  }

  /* Equipamentos nao existem no mundo 3D, entao cada um ganha aqui um
     modelinho proprio — o suficiente para reconhecer o item de relance.   */
  const GEAR_ART = [
    // 0 sem equipamento: caixa vazia, so para o card nao ficar em branco
    [[0, 0, 0, 0.30, 0.02, 0.22, "#c9b4ec"], [0, 0.10, -0.20, 0.30, 0.10, 0.02, "#b7a0e0"],
     [0, 0.10, 0.20, 0.30, 0.10, 0.02, "#b7a0e0"]],
    // 1 tenis de caramelo
    [[0, 0.06, -0.06, 0.16, 0.07, 0.30, "#c98f5e"], [0, 0.20, 0.16, 0.16, 0.09, 0.12, "#c98f5e"],
     [0, -0.02, -0.06, 0.17, 0.04, 0.32, "#fffdf7"], [0, 0.16, -0.02, 0.03, 0.05, 0.16, "#fffdf7"]],
    // 2 colete de marshmallow
    [[0, 0.06, 0, 0.26, 0.28, 0.10, "#f6a9c3"], [-0.20, 0.30, 0, 0.06, 0.10, 0.09, "#fdf7ec"],
     [0.20, 0.30, 0, 0.06, 0.10, 0.09, "#fdf7ec"], [0, 0.06, -0.11, 0.10, 0.16, 0.03, "#fdf7ec"]],
    // 3 luva de confeiteiro
    [[0, 0, 0, 0.20, 0.22, 0.09, "#8fd9c8"], [-0.24, 0.06, 0, 0.06, 0.14, 0.07, "#8fd9c8"],
     [0, -0.26, 0, 0.20, 0.06, 0.10, "#fdf7ec"], [0.10, 0.26, 0, 0.09, 0.06, 0.07, "#8fd9c8"]],
    // 4 mira de acucar
    [[0, 0, 0, 0.08, 0.08, 0.30, "#4a3b33"], [0, 0, -0.30, 0.11, 0.11, 0.04, "#9ec9f2"],
     [0, 0, 0.30, 0.10, 0.10, 0.04, "#e8dcc2"], [0, -0.11, 0, 0.05, 0.04, 0.16, "#4a3b33"]],
    // 5 cinto de municao
    [[0, 0, 0, 0.32, 0.07, 0.09, "#6d3a2a"], [-0.16, 0.10, 0, 0.05, 0.09, 0.07, "#ffcf4d"],
     [0, 0.10, 0, 0.05, 0.09, 0.07, "#ffcf4d"], [0.16, 0.10, 0, 0.05, 0.09, 0.07, "#ffcf4d"],
     [0, -0.01, -0.10, 0.08, 0.08, 0.03, "#e8dcc2"]],
    // 6 joelheira de gelatina
    [[0, 0, -0.04, 0.18, 0.18, 0.10, "#e8615a"], [0, 0, 0.08, 0.15, 0.15, 0.06, "#f6a9c3"],
     [0, 0.20, -0.02, 0.19, 0.05, 0.09, "#4a3b33"], [0, -0.20, -0.02, 0.19, 0.05, 0.09, "#4a3b33"]],
    // 7 capacete de biscoito
    [[0, 0.04, 0, 0.24, 0.20, 0.23, "#c98f5e"], [0, 0.22, 0, 0.22, 0.06, 0.21, "#a5643c"],
     [0, -0.02, -0.24, 0.18, 0.05, 0.04, "#4a3b33"], [-0.10, 0.10, -0.235, 0.04, 0.04, 0.02, "#f3e0a2"],
     [0.10, 0.16, -0.235, 0.04, 0.04, 0.02, "#f3e0a2"]],
    // 8 botas de alcacuz
    [[0, 0.02, -0.04, 0.16, 0.10, 0.30, "#3f342e"], [0, 0.26, 0.14, 0.16, 0.15, 0.14, "#3f342e"],
     [0, -0.09, -0.04, 0.17, 0.05, 0.32, "#8fd9c8"], [0, 0.30, 0.02, 0.17, 0.04, 0.05, "#8fd9c8"]]
  ];
  function gearFaces(index) {
    artView = ART_WEAPON;
    return boxFaces(GEAR_ART[clamp(index | 0, 0, GEAR_ART.length - 1)] || []);
  }

  /* O boneco da vitrine repete as caixas de drawEnt (pernas, tronco, cabeca,
     gorro, bracos), so que parado e de frente. Quando a roupa e uma farda,
     entram tambem o colete e os detalhes que o modo Equipes desenha.         */
  function outfitFaces(skinIndex) {
    artView = ART_OUTFIT;
    const skin = SKINS[clamp(skinIndex | 0, 0, SKINS.length - 1)];
    const army = skin.uniform === "army", swat = skin.uniform === "swat";
    const armor = army ? "#3e4c2a" : "#242c35";
    const detail = army ? "#b39b66" : "#8ba4b8";
    const parts = [
      [-0.17, 0.36, 0, 0.13, 0.38, 0.14, skin.p],   // perna esquerda
      [0.17, 0.36, 0, 0.13, 0.38, 0.14, skin.p],    // perna direita
      [0, 1.06, 0, 0.28, 0.35, 0.18, skin.b],       // tronco
      [-0.36, 1.02, 0, 0.10, 0.32, 0.11, skin.b],   // braco esquerdo
      [0.36, 1.02, 0, 0.10, 0.32, 0.11, skin.b],    // braco direito
      [0, 1.65, 0, 0.25, 0.25, 0.24, skin.h],       // cabeca
      [0, 1.86, 0, 0.27, 0.09, 0.26, skin.p],       // gorro
      [-0.09, 1.72, -0.248, 0.045, 0.045, 0.012, "#3f342e"],  // olho esquerdo
      [0.09, 1.72, -0.248, 0.045, 0.045, 0.012, "#3f342e"]    // olho direito
    ];
    if (army || swat) {
      parts.push([0, 1.08, -0.19, 0.30, 0.28, 0.055, armor]);
      parts.push([-0.22, 0.99, -0.255, 0.075, 0.075, 0.035, detail]);
      parts.push([0.22, 0.99, -0.255, 0.075, 0.075, 0.035, detail]);
      parts.push([-0.34, 1.35, 0, 0.075, 0.13, 0.15, armor]);
      parts.push([0.34, 1.35, 0, 0.075, 0.13, 0.15, armor]);
    }
    if (army) {
      parts.push([-0.12, 1.18, -0.255, 0.055, 0.045, 0.025, "#26351f"]);
      parts.push([0.13, 1.30, -0.255, 0.07, 0.035, 0.025, "#726b45"]);
      parts.push([-0.17, 0.47, -0.15, 0.065, 0.10, 0.025, "#34452a"]);
      parts.push([0.355, 1.42, -0.08, 0.012, 0.055, 0.075, "#b22234"]);
    }
    if (swat) {
      parts.push([0, 1.82, 0.01, 0.285, 0.12, 0.275, armor]);
      parts.push([0, 1.74, -0.252, 0.20, 0.05, 0.005, detail]);
      parts.push([0, 1.595, -0.253, 0.21, 0.065, 0.005, "#080b0f"]);
      parts.push([0, 1.15, -0.265, 0.115, 0.035, 0.022, "#e7edf2"]);
    }
    return boxFaces(parts);
  }

  function drawFaces(canvas, faces) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 120, h = canvas.clientHeight || 64;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!faces.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    faces.forEach(function (face) {
      face.quad.forEach(function (point) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
      });
    });
    const pad = 6;
    const scale = Math.min((w - pad * 2) / Math.max(maxX - minX, 0.001),
                           (h - pad * 2) / Math.max(maxY - minY, 0.001));
    const offX = (w - (maxX + minX) * scale) / 2, offY = (h - (maxY + minY) * scale) / 2;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, scale * 0.011);
    ctx.strokeStyle = "#241b18";
    faces.forEach(function (face) {
      ctx.beginPath();
      face.quad.forEach(function (point, i) {
        const px = point.x * scale + offX, py = point.y * scale + offY;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = face.color;
      ctx.fill();
      ctx.stroke();
    });
  }
  function drawWeaponPortrait(canvas, index) { drawFaces(canvas, weaponFaces(index)); }
  function drawOutfitPortrait(canvas, index) { drawFaces(canvas, outfitFaces(index)); }
  /* A pintura e mostrada na CARAMELO ASSAULT, que e a arma mais reconhecivel. */
  function drawPaintPortrait(canvas, index) {
    const item = WEAPON_SKINS[clamp(index | 0, 0, WEAPON_SKINS.length - 1)];
    drawFaces(canvas, weaponFaces(0, item.colors));
  }
  function drawGearPortrait(canvas, index) { drawFaces(canvas, gearFaces(index)); }

  /* Raridade so existe na vitrine: e o preco traduzido em estrelas, para dar
     uma nocao rapida de "quao boa" e a arma sem ler as barrinhas.            */
  function weaponStars(weapon) {
    const price = weapon.price | 0;
    const stars = price >= 820 ? 5 : (price >= 380 ? 4 : (price >= 220 ? 3 : 2));
    let html = '<span class="arsStars">';
    for (let i = 0; i < 5; i++) html += '<i' + (i < stars ? ' class="on"' : '') + '>★</i>';
    return html + '</span>';
  }

  // Filtros da coluna da esquerda: "todas" mais um por funcao que exista.
  const ARSENAL_ROLES = ["FUZIL", "RAJADA", "ESCOPETA", "PRECISAO", "PISTOLA", "METRALHADORA", "ACESSORIO"];
  let arsenalRole = "all";
  function arsenalPool() {
    const all = PRIMARIES.concat(ACCESSORIES);
    if (arsenalRole === "all") return all;
    return all.filter(function (index) { return WEAPONS[index].role === arsenalRole; });
  }
  function arsenalKind(index) { return WEAPONS[index].acc ? "accessory" : "primary"; }

  function arsenalMarkup() {
    const filters = ["all"].concat(ARSENAL_ROLES.filter(function (role) {
      return WEAPONS.some(function (weapon) { return weapon.role === role; });
    })).map(function (role) {
      const label = role === "all" ? SugarI18n.t("ARSENAL_ALL") : SugarI18n.roleLabel(role);
      return '<button class="arsFilter ' + (arsenalRole === role ? "on" : "") +
        '" data-role="' + escapeHtml(role) + '">' + escapeHtml(label) + '</button>';
    }).join("");
    const cards = arsenalPool().map(function (index) {
      const weapon = WEAPONS[index];
      const kind = arsenalKind(index);
      const owned = ownsWeapon(index);
      const equipped = (kind === "primary" ? profile.primary : profile.accessory) === index;
      const action = equipped ? SugarI18n.t("ACTION_EQUIPPED")
        : (owned ? SugarI18n.t("ACTION_EQUIP") : SugarI18n.t("ACTION_BUY_PREFIX") + priceTag(weapon.price, false));
      return '<div class="arsCard ' + (equipped ? "equipped" : "") + (owned ? " owned" : "") + '">' +
        '<div class="arsArt"><canvas class="arsCanvas" data-weapon="' + index + '"></canvas>' +
        '<span class="arsRole">' + escapeHtml(SugarI18n.roleLabel(weapon.role)) + '</span></div>' +
        '<b class="arsName">' + escapeHtml(weapon.name) + '</b>' +
        weaponStars(weapon) +
        '<small>' + escapeHtml(weapon.desc) + '</small>' +
        weaponStats(weapon) +
        '<button class="shopBuy arsBuy" data-kind="' + kind + '" data-item="' + index + '" ' +
        (equipped ? "disabled" : "") + '>' + escapeHtml(action) + '</button></div>';
    }).join("");
    return '<div class="arsenal"><div class="arsSide">' + filters + '</div>' +
      '<div class="arsGrid">' + cards + '</div></div>';
  }
  // Os canvas so existem depois que o HTML entrou na pagina.
  function paintPortraits() {
    document.querySelectorAll(".arsCanvas").forEach(function (canvas) {
      drawWeaponPortrait(canvas, parseInt(canvas.dataset.weapon, 10) || 0);
    });
    document.querySelectorAll(".outfitCanvas").forEach(function (canvas) {
      drawOutfitPortrait(canvas, parseInt(canvas.dataset.outfit, 10) || 0);
    });
    document.querySelectorAll(".paintCanvas").forEach(function (canvas) {
      drawPaintPortrait(canvas, parseInt(canvas.dataset.paint, 10) || 0);
    });
    document.querySelectorAll(".gearCanvas").forEach(function (canvas) {
      drawGearPortrait(canvas, parseInt(canvas.dataset.gear, 10) || 0);
    });
    paintDailyIcons();
  }

  /* ------------------------------------------------------------- granadas
     Quantas granadas o jogador leva por partida. Comeca com as 2 de fabrica
     e vai ate 10, uma compra de cada vez, com o preco subindo.            */
  /* Toda vida comeca com GRENADE_BASE granadas de fabrica. O que passa disso
     e estoque comprado: sai do bolso ao ser lancado, sobrevive ao fim da
     partida e volta na proxima. Granada achada na fase entra como de fabrica
     — vale so ali, nunca vira estoque.                                     */
  const GRENADE_BASE = 2, GRENADE_MAX = 10, GRENADE_PACK = 2;
  const GRENADE_STOCK_MAX = GRENADE_MAX - GRENADE_BASE;
  function grenadeStock() { return clamp(profile.grenadeStock | 0, 0, GRENADE_STOCK_MAX); }
  function grenadeCapacity() { return GRENADE_BASE + grenadeStock(); }
  // Cada compra leva um par, e o par seguinte custa mais caro.
  function grenadePrice() {
    return 150 + (grenadeStock() / GRENADE_PACK) * 90;
  }
  /* Quantas das granadas na mao ainda sao "de fabrica": enquanto houver
     dessas, lancar nao mexe no estoque comprado.                          */
  function freeGrenades() { return Math.max(0, (player && player.freeNades) | 0); }
  function consumeGrenade() {
    if (player && (player.freeNades | 0) > 0) { player.freeNades--; return; }
    if (grenadeStock() <= 0) return;
    profile.grenadeStock = grenadeStock() - 1;
    saveProfile();
  }
  // Granada apanhada no chao da fase: municao daquela partida, e so.
  function addFieldGrenades(amount) {
    if (player) player.freeNades = (player.freeNades | 0) + (amount | 0);
  }
  function grenadeCard() {
    const have = grenadeCapacity(), full = have >= GRENADE_MAX;
    return '<div class="shopCard">' +
      '<div class="shopHead"><b>' + escapeHtml(SugarI18n.t("GRENADE_TITLE")) + '</b>' +
      '<span class="shopRole">' + have + '/' + GRENADE_MAX + '</span></div>' +
      '<div class="itemArt"><canvas class="arsCanvas" data-weapon="11"></canvas></div>' +
      '<small>' + escapeHtml(SugarI18n.t("GRENADE_DESC", {n: GRENADE_MAX})) + '</small>' +
      '<button class="shopBuy big-btn sub-btn" data-kind="grenade" data-item="0" ' +
      (full ? "disabled" : "") + '>' +
      (full ? SugarI18n.t("GRENADE_FULL")
            : "+" + GRENADE_PACK + " · " + priceTag(grenadePrice(), false)) +
      '</button></div>';
  }

  let shopTab = "arsenal";
  function shopCardsFor(tab) {
    if (tab === "arsenal") return arsenalMarkup();
    if (tab === "primary" || tab === "accessory") {
      const pool = tab === "primary" ? PRIMARIES : ACCESSORIES;
      return pool.map(function (index) {
        const weapon = WEAPONS[index];
        const owned = ownsWeapon(index);
        const equipped = (tab === "primary" ? profile.primary : profile.accessory) === index;
        const action = equipped ? SugarI18n.t("ACTION_EQUIPPED") : (owned ? SugarI18n.t("ACTION_EQUIP") : SugarI18n.t("ACTION_BUY_PREFIX") + priceTag(weapon.price, false));
        return '<div class="shopCard ' + (equipped ? "equipped" : "") + '">' +
          '<div class="shopHead"><b>' + escapeHtml(weapon.name) + '</b>' +
          '<span class="shopRole">' + escapeHtml(SugarI18n.roleLabel(weapon.role)) + '</span></div>' +
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
          '<div class="outfitArt"><canvas class="outfitCanvas" data-outfit="' + index + '"></canvas></div>' +
          '<small>' + escapeHtml(SugarI18n.t(skin.uniform ? "OUTFIT_DESC_TEAM" : "OUTFIT_DESC")) + '</small>' +
          '<button class="shopBuy big-btn sub-btn" data-kind="outfit" data-item="' + index + '" ' +
          (equipped ? "disabled" : "") + '>' +
          (equipped ? SugarI18n.t("ACTION_WORN") : (owned ? SugarI18n.t("ACTION_WEAR") : SugarI18n.t("ACTION_BUY_PREFIX") + priceTag(outfit.price, false))) +
          '</button></div>';
      }).join("");
    }
    if (tab === "skin") {
      return WEAPON_SKINS.map(function (item, index) {
        const owned = profile.unlockedWeaponSkins.indexOf(index) >= 0;
        const equipped = profile.weaponSkin === index;
        const colors = item.colors;
        return '<div class="shopCard ' + (equipped ? "equipped" : "") + '">' +
          '<div class="shopHead"><b>' + escapeHtml(item.name) + '</b></div>' +
          '<div class="itemArt"><canvas class="paintCanvas" data-paint="' + index + '"></canvas></div>' +
          '<small>' + escapeHtml(colors[0] ? SugarI18n.t("SKIN_DESC_COLOR") : SugarI18n.t("SKIN_DESC_DEFAULT")) + '</small>' +
          '<button class="shopBuy big-btn sub-btn" data-kind="skin" data-item="' + index + '" ' +
          (equipped ? "disabled" : "") + '>' +
          (equipped ? SugarI18n.t("ACTION_IN_USE") : (owned ? SugarI18n.t("ACTION_USE") : SugarI18n.t("ACTION_BUY_PREFIX") + priceTag(item.price, false))) +
          '</button></div>';
      }).join("");
    }
    const worn = profile.gearSet.length;
    const resumo = '<div class="loadoutNow gearSummary">' +
      escapeHtml(SugarI18n.t("GEAR_WEARING", {n: worn})) +
      (worn ? ' <b>' + profile.gearSet.map(function (index) {
        return escapeHtml(GEAR[index].name);
      }).join('</b> + <b>') + '</b>' : '') + '</div>';
    return resumo + grenadeCard() + GEAR.map(function (item, index) {
      const owned = profile.unlockedGear.indexOf(index) >= 0;
      const equipped = profile.gearSet.indexOf(index) >= 0;
      /* O item 0 nao e equipamento: e o botao de tirar tudo. */
      const none = index === 0;
      const action = none
        ? (worn ? SugarI18n.t("GEAR_REMOVE_ALL") : SugarI18n.t("ACTION_EQUIPPED_M"))
        : (equipped ? SugarI18n.t("GEAR_TAKE_OFF")
          : (owned ? SugarI18n.t("ACTION_EQUIP")
            : SugarI18n.t("ACTION_BUY_PREFIX") + priceTag(item.price, false)));
      return '<div class="shopCard ' + (equipped ? "equipped" : "") + '">' +
        '<div class="shopHead"><b>' + escapeHtml(item.name) + '</b>' +
        (equipped ? '<span class="shopRole">' + escapeHtml(SugarI18n.t("GEAR_ON")) + '</span>' : '') +
        '</div>' +
        '<div class="itemArt"><canvas class="gearCanvas" data-gear="' + index + '"></canvas></div>' +
        '<small>' + escapeHtml(item.desc) + '</small>' +
        '<button class="shopBuy big-btn sub-btn" data-kind="gear" data-item="' + index + '" ' +
        (none && !worn ? "disabled" : "") + '>' + escapeHtml(action) + '</button></div>';
    }).join("");
  }

  function priceOf(kind, index) {
    if (kind === "primary" || kind === "accessory") return WEAPONS[index].price;
    if (kind === "outfit") return OUTFITS[index].price;
    if (kind === "skin") return WEAPON_SKINS[index].price;
    if (kind === "grenade") return grenadePrice();
    return GEAR[index].price;
  }
  function alreadyOwns(kind, index) {
    if (kind === "primary" || kind === "accessory") return ownsWeapon(index);
    if (kind === "outfit") return profile.unlockedSkins.indexOf(index) >= 0;
    if (kind === "skin") return profile.unlockedWeaponSkins.indexOf(index) >= 0;
    if (kind === "grenade") return false;   // granada se compra de novo, sempre
    return profile.unlockedGear.indexOf(index) >= 0;
  }
  function registerPurchase(kind, index) {
    if (kind === "primary" || kind === "accessory") profile.ownedWeapons.push(index);
    else if (kind === "outfit") profile.unlockedSkins.push(index);
    else if (kind === "skin") profile.unlockedWeaponSkins.push(index);
    else if (kind === "grenade") {
      profile.grenadeStock = Math.min(GRENADE_STOCK_MAX, grenadeStock() + GRENADE_PACK);
      // Comprou no meio da partida: as granadas entram na mao agora, nao so na proxima vida.
      if (player && !player.dead) {
        for (let i = 0; i < WEAPONS.length; i++) {
          if (!WEAPONS[i].thrown) continue;
          player.mags[i] = Math.min(GRENADE_MAX, (player.mags[i] | 0) + GRENADE_PACK);
          if (player.wep === i) player.mag = player.mags[i];
        }
        updateHUD();
      }
    }
    else profile.unlockedGear.push(index);
  }
  /* Equipamento nao substitui: entra na lista. Comprar ja veste, e clicar de
     novo tira. O item 0 e o "sem equipamento", que limpa a lista inteira.  */
  function toggleGear(index, forceOn) {
    index = index | 0;
    if (index === 0) { profile.gearSet = []; return; }
    const at = profile.gearSet.indexOf(index);
    if (at >= 0 && !forceOn) profile.gearSet.splice(at, 1);
    else if (at < 0) profile.gearSet.push(index);
    profile.gear = profile.gearSet.length ? profile.gearSet[0] : 0;   // compatibilidade
  }
  /* Velocidade, recuo, dispersao e afins sao lidos a cada quadro, entao valem
     assim que a lista muda. O escudo e um valor que so entra no renascimento;
     aqui ele e ajustado na hora, sem somar duas vezes: gearMod ja devolve o
     total de tudo o que esta vestido.                                      */
  function applyGearNow() {
    if (!player || player.dead) return;
    player.shield = Math.max(player.shield || 0, gearMod("shield", 0));
    updateHUD();
  }
  function equipItem(kind, index, justBought) {
    if (kind === "grenade") return;
    if (kind === "primary") { profile.primary = index; syncLoadout(); }
    else if (kind === "accessory") { profile.accessory = index; syncLoadout(); }
    else if (kind === "outfit") profile.skin = index;
    else if (kind === "skin") profile.weaponSkin = index;
    else toggleGear(index, justBought);
  }
  function itemName(kind, index) {
    if (kind === "primary" || kind === "accessory") return WEAPONS[index].name;
    if (kind === "outfit") return OUTFITS[index].name;
    if (kind === "skin") return WEAPON_SKINS[index].name;
    if (kind === "grenade") return SugarI18n.t("GRENADE_TITLE");
    return GEAR[index].name;
  }

  function openShop(tab) {
    shopTab = tab || shopTab;
    const tabs = [
      ["arsenal", SugarI18n.t("ARSENAL_TITLE")],
      ["outfit", SugarI18n.t("TAB_OUTFITS")], ["skin", SugarI18n.t("TAB_SKINS")], ["gear", SugarI18n.t("TAB_GEAR")]
    ].map(function (item) {
      return '<button class="shopTab ' + (shopTab === item[0] ? "on" : "") +
        '" data-tab="' + item[0] + '">' + escapeHtml(item[1]) + '</button>';
    }).join("");
    modal(SugarI18n.t("SHOP_TITLE"),
      '<div class="shopBalance">' + escapeHtml(SugarI18n.t("SHOP_BALANCE")) + ' <strong>' + Math.floor(profile.candies) + escapeHtml(SugarI18n.t("PRICE_CANDIES_SUFFIX")) + '</strong></div>' +
      '<div class="loadoutNow">' + escapeHtml(SugarI18n.t("SHOP_LOADOUT")) + ' <b>' + escapeHtml(WEAPONS[profile.primary].name) +
      '</b> + <b>' + escapeHtml(WEAPONS[profile.accessory].name) + '</b></div>' +
      '<div class="shopTabs">' + tabs + '</div>' +
      '<p class="shopHint">' + escapeHtml(SugarI18n.t("SHOP_HINT")) + '</p>' +
      (shopTab === "arsenal"
        ? shopCardsFor(shopTab)
        : '<div class="shopGrid">' + shopCardsFor(shopTab) + '</div>'));
    document.querySelectorAll(".shopTab").forEach(function (button) {
      button.addEventListener("click", function () { openShop(button.dataset.tab); });
    });
    document.querySelectorAll(".arsFilter").forEach(function (button) {
      button.addEventListener("click", function () {
        arsenalRole = button.dataset.role;
        openShop("arsenal");
      });
    });
    paintPortraits();
    document.querySelectorAll(".shopBuy").forEach(function (button) {
      button.addEventListener("click", function () {
        const kind = button.dataset.kind;
        const index = parseInt(button.dataset.item, 10);
        let justBought = false;
        if (!alreadyOwns(kind, index)) {
          const price = priceOf(kind, index);
          if (profile.candies < price) {
            showToast(SugarI18n.t("TOAST_MISSING_CANDIES", {n: Math.ceil(price - profile.candies)}));
            vibrate(45);
            return;
          }
          profile.candies -= price;
          registerPurchase(kind, index);
          showToast(SugarI18n.t("TOAST_PURCHASED", {item: itemName(kind, index)}));
          vibrate("20,30,40");
          justBought = true;
        }
        // Acabou de comprar: veste na hora, sem precisar de um segundo clique.
        equipItem(kind, index, justBought);
        if (kind === "gear") applyGearNow();
        saveProfile();
        updateWeaponSlots();
        if (player && player.skin && kind === "outfit") player.skin = selectedSkin();
        openShop(kind === "gear" ? "gear" : shopTab);
      });
    });
  }

  function confirmExitGame() {
    const androidApp = !!(window.SugarAndroid && typeof SugarAndroid.exitGame === "function");
    modal(SugarI18n.t("EXIT_TITLE"),
      '<p>' + escapeHtml(SugarI18n.t("EXIT_TEXT1")) + '</p>' +
      '<p>' + escapeHtml(androidApp ? SugarI18n.t("EXIT_TEXT2_APP") : SugarI18n.t("EXIT_TEXT2_WEB")) + '</p>' +
      '<button id="confirmExitGame" class="big-btn menuDanger">' + escapeHtml(SugarI18n.t("BTN_CONFIRM_EXIT")) + '</button>');
    document.getElementById("confirmExitGame").addEventListener("click", function () {
      /* localStorage e sincrono: perfil e configuracoes terminam de ser gravados
         antes de fechar o app ou trocar de pagina. */
      saveProfile();
      saveSettings();
      try { localStorage.setItem("sugarstrike.player", profile.name); } catch (error) {}
      try {
        if (androidApp) SugarAndroid.exitGame();
        else window.location.replace("/");
      } catch (error) {
        if (!androidApp) window.location.href = "/";
      }
    });
  }

  function modeOptionsHtml() {
    return ["deathmatch", "team", "capture", "king", "survival"].map(function (id) {
      return '<option value="' + id + '">' + escapeHtml(SugarI18n.modeLabel(id)) + '</option>';
    }).join("");
  }
  function mapOptionsHtml() {
    return MAP_IDS.map(function (id) {
      return '<option value="' + id + '">' + escapeHtml(SugarI18n.mapLabel(id)) + '</option>';
    }).join("");
  }
  function openMatchConfig() {
    modal(SugarI18n.t("MATCH_CONFIG_TITLE"),
      '<div class="settingGrid">' +
      '<label>' + escapeHtml(SugarI18n.t("LABEL_MODE")) + '<select id="soloMode">' + modeOptionsHtml() + '</select></label>' +
      '<label>' + escapeHtml(SugarI18n.t("LABEL_MAP")) + '<select id="soloMap">' + mapOptionsHtml() + '</select></label>' +
      '<label>' + escapeHtml(SugarI18n.t("LABEL_BOTS")) + '<input id="soloBots" type="number" min="0" max="12" value="' + game.bots + '"></label>' +
      '<label>' + escapeHtml(SugarI18n.t("LABEL_TARGET")) + '<input id="soloTarget" type="number" min="5" max="100" value="' + game.target + '"></label>' +
      '<label>' + escapeHtml(SugarI18n.t("LABEL_DURATION")) + '<select id="soloDuration">' + [3, 5, 8, 12, 15, 24].map(function (min) {
          return '<option value="' + min + '">' + min + escapeHtml(SugarI18n.t("MIN_SUFFIX")) + '</option>';
        }).join("") + '</select></label>' +
      '<label>' + escapeHtml(SugarI18n.t("LABEL_INFINITE_AMMO")) +
        '<select id="soloInfiniteAmmo">' +
        '<option value="0">' + escapeHtml(SugarI18n.t("OPT_INFINITE_AMMO_OFF")) + '</option>' +
        '<option value="1">' + escapeHtml(SugarI18n.t("OPT_INFINITE_AMMO_ON")) + '</option>' +
        '</select></label>' +
      '<label>' + escapeHtml(SugarI18n.t("LABEL_TOURNAMENT")) +
        '<select id="soloTournament">' +
        '<option value="0">' + escapeHtml(SugarI18n.t("OPT_TOURNAMENT_OFF")) + '</option>' +
        '<option value="1">' + escapeHtml(SugarI18n.t("OPT_TOURNAMENT_ON")) + '</option>' +
        '</select></label>' +
      '<label>' + escapeHtml(SugarI18n.t("LABEL_QUALIFIERS")) +
        '<input id="soloQualifiers" type="number" min="1" max="12" value="' + qualifierSlots() + '"></label>' +
      '</div><div class="loadoutNow">' + escapeHtml(SugarI18n.t("HINT_INFINITE_AMMO")) + '</div>' +
      '<div class="loadoutNow">' + escapeHtml(SugarI18n.t("HINT_TOURNAMENT")) + '</div>' +
      '<button id="soloApply" class="big-btn">' + escapeHtml(SugarI18n.t("BTN_APPLY")) + '</button>');
    document.getElementById("soloMode").value = game.mode;
    document.getElementById("soloMap").value = game.map;
    document.getElementById("soloDuration").value = String(game.duration);
    document.getElementById("soloInfiniteAmmo").value = game.infiniteAmmo ? "1" : "0";
    document.getElementById("soloTournament").value = game.tournament ? "1" : "0";
    document.getElementById("soloApply").addEventListener("click", function () {
      game.mode = document.getElementById("soloMode").value;
      game.map = document.getElementById("soloMap").value;
      game.bots = clamp(parseInt(document.getElementById("soloBots").value, 10) || 0, 0, 12);
      game.target = clamp(parseInt(document.getElementById("soloTarget").value, 10) || 25, 5, 100);
      game.duration = parseInt(document.getElementById("soloDuration").value, 10) || 5;
      game.infiniteAmmo = document.getElementById("soloInfiniteAmmo").value === "1";
      game.tournament = document.getElementById("soloTournament").value === "1";
      game.qualifiers = clamp(parseInt(document.getElementById("soloQualifiers").value, 10) || 3, 1, 12);
      try {
        localStorage.setItem("sugarstrike.match.v11", JSON.stringify({
          map: game.map, mode: game.mode, bots: game.bots,
          target: game.target, duration: game.duration,
          infiniteAmmo: game.infiniteAmmo,
          tournament: game.tournament, qualifiers: game.qualifiers
        }));
      } catch (error) {}
      TARGET = game.target;
      targetV.textContent = TARGET;
      syncConfigUi();
      document.getElementById("sugarModal").classList.remove("open");
      showToast(SugarI18n.t("TOAST_MATCH_CONFIGURED"));
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
    showToast(SugarI18n.t("TOAST_CONTROLS_EDIT"));
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
  let stopSprint = function () {};
  function installControls() {
    const sprint = document.createElement("div");
    sprint.id = "bSprint";
    sprint.className = "tbtn";
    sprint.textContent = SugarI18n.t("BTN_SPRINT");
    document.getElementById("hud").appendChild(sprint);
    if (isTouch) sprint.style.display = "flex";
    /* Liga e desliga no toque, em vez de exigir o dedo em cima o tempo todo:
       segurar aqui ocupava um dedo que fazia falta na mira. Aceso e amarelo
       cheio; apagado fica so um fantasma amarelo, para nao sumir da tela.  */
    function setSprint(on) {
      sprintHeld = !!on;
      keys.ShiftLeft = sprintHeld;
      sprint.classList.toggle("on", sprintHeld);
    }
    sprint.addEventListener("click", function (event) {
      event.preventDefault();
      // no modo de arrastar os controles, o toque so muda o botao de lugar
      if (document.body.classList.contains("control-edit")) return;
      setSprint(!sprintHeld);
    });
    sprint.addEventListener("pointerdown", function (event) { event.preventDefault(); });
    // volta desligado a cada partida nova, para ninguem nascer correndo sem querer
    stopSprint = function () { setSprint(false); };
    const save = document.createElement("button");
    save.id = "controlSave";
    save.textContent = SugarI18n.t("BTN_SAVE_POSITIONS");
    document.body.appendChild(save);
    save.addEventListener("click", function () {
      document.body.classList.remove("control-edit");
      save.classList.remove("show");
      saveSettings();
      showToast(SugarI18n.t("TOAST_CONTROLS_SAVED"));
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
    modal(SugarI18n.t("TUTORIAL_TITLE"), tutorialLongHtml());
  }
  function tutorialLongHtml() {
    const t = SugarI18n.t.bind(SugarI18n);
    return '<div class="tutorial">' +
      [1,2,3,4,5,6].map(function (n) {
        return '<div><b>' + escapeHtml(t("TUT" + n + "_T")) + '</b><span>' + escapeHtml(t("TUT" + n + "_D")) + '</span></div>';
      }).join("") +
      '</div>';
  }

  function installUi() {
    const style = document.createElement("style");
    style.textContent =
      ":root{--control-scale:1}" +
      // apagado: fantasma amarelo · aceso: amarelo cheio, com o contorno firme
      /* sem transicao de proposito: e liga/desliga, tem que responder no
         mesmo quadro do toque */
      "#bSprint{right:142px;bottom:126px;width:70px;height:70px;background:rgba(255,207,77,.34);" +
        "border-color:rgba(74,59,51,.4);opacity:.72}" +
      "#bSprint.on{background:rgba(255,207,77,1);border-color:rgba(74,59,51,.9);opacity:1}" +
      ".android-app #bSprint{right:calc(142px + env(safe-area-inset-right));bottom:calc(126px + env(safe-area-inset-bottom))}" +
      ".android-app #stick,.android-app .tbtn,.android-app #slots{scale:var(--control-scale)}" +
      "#menuExtras{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}" +
      "#menuExtras .big-btn{margin:0;font-size:10px;padding:8px 4px;letter-spacing:.45px;line-height:1.1;min-height:42px}" +
      ".menuDanger{background:#e8615a!important;color:#fffdf7!important}" +
      "#panel.pause-panel h2{display:none}#panel.pause-panel #sensWrap{margin-top:2px}" +
      "#modeHud{position:absolute;left:50%;top:76px;transform:translateX(-50%);font-size:10px;letter-spacing:1px;white-space:nowrap}" +
      "#candyHud{position:absolute;right:12px;top:76px;font-size:10px;letter-spacing:1px;background:#ffcf4d}" +
      "#minimap{position:absolute;z-index:9;right:170px;top:44px;width:106px;height:106px;pointer-events:none;opacity:0;transform:scale(.9);transition:opacity .18s,transform .18s;filter:drop-shadow(0 4px 0 rgba(0,0,0,.24))}" +
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
      ".skinList{display:flex;gap:6px;overflow:auto}.skinPick,.weaponSkinPick{min-width:80px;border:3px solid #4a3b33;border-radius:10px;padding:8px;font-weight:900;color:#4a3b33}.skinPick{background:#f7efe5;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:8px;line-height:1.15}.skinPickArt{width:56px;height:64px;display:block}.skinPick.on,.weaponSkinPick.on{outline:4px solid #ffcf4d}" +
      ".historyRow{display:flex;justify-content:space-between;background:#f0e6da;border-radius:8px;padding:6px;margin:4px 0;font-size:11px}" +
      ".slot.locked{opacity:.48;filter:grayscale(1);border-style:dashed}.slot.field{box-shadow:inset 0 0 0 3px #8fd9c8}.shopBalance{background:#ffcf4d;border:3px solid #4a3b33;border-radius:14px;padding:10px;margin-bottom:8px}.shopBalance strong{font-size:18px}.shopHint{font-size:11px;margin:6px 0}.shopGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.shopCard{display:flex;flex-direction:column;gap:5px;text-align:left;background:#f0e6da;border:3px solid #4a3b33;border-radius:14px;padding:9px}.shopCard.equipped{outline:4px solid #ffcf4d}.shopCard small{display:block;font-size:9px;line-height:1.35;opacity:.78}.shopCard .shopBuy{margin:6px 0 0;font-size:10px;padding:8px;width:100%}.shopCard .shopBuy:disabled{opacity:.65}" +
      ".shopHead{display:flex;align-items:baseline;justify-content:space-between;gap:6px}.shopHead b{font-size:11px;letter-spacing:.4px;line-height:1.2}.shopRole{flex:0 0 auto;font-size:7px;font-weight:900;letter-spacing:.6px;background:#c9b4ec;border:2px solid #4a3b33;border-radius:7px;padding:2px 5px}" +
      ".shopTabs{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.shopTab{flex:1 1 auto;border:3px solid #4a3b33;border-radius:11px;background:#fffdf7;color:#4a3b33;font:900 9px ui-rounded,'Trebuchet MS',sans-serif;letter-spacing:.5px;padding:8px 5px}.shopTab.on{background:#ffcf4d}" +
      ".loadoutNow{background:#8fd9c8;border:3px solid #4a3b33;border-radius:12px;padding:7px;font-size:10px;font-weight:900;letter-spacing:.4px}" +
      ".gearSummary{grid-column:1/-1;margin-bottom:2px;text-align:left;line-height:1.45}" +
      /* O botao do desafio ocupa a linha inteira, acima dos outros: e a
         primeira coisa do menu, e nao mais um item perdido na grade. */
      "#prizeCard{position:fixed;left:50%;top:14%;transform:translate(-50%,-14px);z-index:125;width:min(300px,74vw);" +
        "display:none;text-align:center;background:#fffdf7;border:5px solid #4a3b33;border-radius:20px;padding:12px 14px;" +
        "color:#4a3b33;filter:drop-shadow(0 8px 0 rgba(0,0,0,.22));opacity:0;transition:opacity .25s,transform .25s;pointer-events:none}" +
      "#prizeCard.open{display:block;opacity:1;transform:translate(-50%,0)}" +
      "#prizeCard b{display:block;font-size:12px;letter-spacing:1px;color:#e8615a}" +
      "#prizeCard span{display:block;font-size:9px;font-weight:800;opacity:.7;margin:2px 0 6px}" +
      "#prizeArt{height:64px;border-radius:12px;background:radial-gradient(circle at 50% 42%,#5a4740,#2a201c 78%);overflow:hidden}" +
      "#prizeCanvas{width:100%;height:100%;display:block}" +
      "#prizeCoins{display:none;height:100%;align-items:center;justify-content:center;font-style:normal;" +
        "font-size:26px;font-weight:900;color:#ffcf4d;letter-spacing:1px}" +
      "#prizeCard strong{display:block;font-size:12px;margin-top:6px}" +
      "#prizeCard small{display:block;font-size:9px;font-weight:800;color:#3f8f6a;margin-top:2px}" +
      ".dailyBtn{grid-column:1/-1;position:relative;background:#8fd9c8}" +
      "#dailyBadge{display:none;position:absolute;top:-7px;right:-7px;min-width:22px;height:22px;line-height:19px;" +
        "border:2px solid #4a3b33;border-radius:11px;background:#e8615a;color:#fffdf7;font-size:11px;font-weight:900}" +
      ".dailyHint{font-size:11px;font-weight:800;opacity:.75;margin:0 0 8px}" +
      ".dailyList{display:grid;gap:6px}" +
      ".dailyRow{display:grid;grid-template-columns:38px 1fr auto;gap:8px;align-items:center;background:#f0e6da;border:2px solid #4a3b33;border-radius:12px;padding:8px;text-align:left}" +
      ".dailyIcon{width:38px;height:38px;display:block;background:#fffdf7;border:2px solid #4a3b33;border-radius:9px}" +
      ".dailyRow.done .dailyIcon{background:#eafaef}" +
      ".dailyRow.done{background:#dff3e4}" +
      ".dailyText b{display:block;font-size:10px;letter-spacing:.3px;line-height:1.25}" +
      ".dailyText small{display:block;font-size:9px;opacity:.7;margin:1px 0 4px}" +
      ".dailyBar{display:block;height:8px;border:2px solid #4a3b33;border-radius:6px;background:#fffdf7;overflow:hidden}" +
      ".dailyBar b{display:block;height:100%;background:#8fd9c8}" +
      ".dailyClaim{margin:0;font-size:9px;padding:9px 8px;min-width:74px}" +
      ".dailyClaim.dailyGo{background:#ffcf4d}" +
      ".progressHint{font-size:10px;line-height:1.4;opacity:.75;margin:4px 0 6px;text-align:left}" +
      ".progressBox{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;margin-bottom:6px}" +
      ".progressField{height:40px;border:2px solid #4a3b33;border-radius:10px;padding:5px 8px;background:#f7efe5;color:#4a3b33;font:900 13px ui-rounded,'Trebuchet MS',monospace;letter-spacing:1px;text-align:center;width:100%}" +
      ".progressBox .big-btn{margin:0;font-size:10px;padding:11px 10px;white-space:nowrap}" +
      ".statList{display:grid;gap:3px;margin-top:2px}.statRow{display:grid;grid-template-columns:52px 1fr 30px;align-items:center;gap:5px;font-size:8px;font-weight:900}.statRow em{font-style:normal;opacity:.68}.statRow u{text-decoration:none;text-align:right;opacity:.68}.statBar{display:block;height:7px;border:2px solid #4a3b33;border-radius:5px;background:#fffdf7;overflow:hidden}.statBar b{display:block;height:100%;background:#e8615a}" +
      ".swatch{display:flex;gap:4px}.swatch i{flex:1;height:22px;border:2px solid #4a3b33;border-radius:7px}" +
      ".outfitArt{height:132px;border:2px solid #4a3b33;border-radius:11px;background:radial-gradient(circle at 50% 38%,#fffdf7,#e6d9c6 78%);overflow:hidden}" +
      ".outfitCanvas{width:100%;height:100%;display:block}" +
      ".itemArt{height:88px;border:2px solid #4a3b33;border-radius:11px;background:radial-gradient(circle at 50% 40%,#fffdf7,#e6d9c6 78%);overflow:hidden}" +
      ".itemArt canvas{width:100%;height:100%;display:block}" +
      /* arsenal: painel escuro com as funcoes numa coluna e a vitrine ao lado */
      ".arsenal{display:grid;grid-template-columns:78px 1fr;gap:8px;text-align:left;background:#241b18;border:4px solid #4a3b33;border-radius:18px;padding:8px}" +
      ".arsSide{display:flex;flex-direction:column;gap:5px}" +
      ".arsFilter{border:0;border-radius:10px;background:#3a2c26;color:#f0e6da;font:900 8px ui-rounded,'Trebuchet MS',sans-serif;letter-spacing:.5px;padding:9px 3px;line-height:1.15;text-align:left;padding-left:7px}" +
      ".arsFilter.on{background:#ffcf4d;color:#4a3b33}" +
      ".arsGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;align-content:start}" +
      ".arsCard{display:flex;flex-direction:column;gap:3px;background:#33272170;background:linear-gradient(#3d2e28,#2b211d);border:2px solid #57443b;border-radius:13px;padding:7px;color:#f7efe5}" +
      ".arsCard.equipped{border-color:#ffcf4d;box-shadow:0 0 0 2px #ffcf4d inset}" +
      ".arsCard:not(.owned){opacity:.9}" +
      ".arsArt{position:relative;height:60px;border-radius:10px;background:radial-gradient(circle at 50% 42%,#5a4740,#2a201c 78%);overflow:hidden}" +
      ".arsCanvas{width:100%;height:100%;display:block}" +
      ".arsRole{position:absolute;left:4px;top:4px;font-size:6px;font-weight:900;letter-spacing:.6px;background:#c9b4ec;color:#3a2c26;border-radius:5px;padding:2px 4px}" +
      ".arsName{font-size:10px;letter-spacing:.3px;line-height:1.15}" +
      ".arsStars{font-size:9px;letter-spacing:1px;color:#5d4b43}.arsStars i{font-style:normal}.arsStars i.on{color:#ffcf4d}" +
      ".arsCard small{display:block;font-size:8px;line-height:1.35;opacity:.62}" +
      ".arsCard .statRow{color:#f7efe5;grid-template-columns:44px 1fr 24px;gap:4px;font-size:7px}" +
      ".arsCard .statBar{background:#241b18;border-color:#57443b}.arsCard .statBar b{background:#ffcf4d}" +
      ".arsBuy{margin:5px 0 0;width:100%;padding:8px 4px;font:900 9px ui-rounded,'Trebuchet MS',sans-serif;letter-spacing:.5px;border:2px solid #4a3b33;border-radius:10px;background:#ffcf4d;color:#4a3b33}" +
      ".arsBuy:disabled{background:#8fd9c8;opacity:.85}" +
      ".tutorial{display:grid;gap:8px;text-align:left}.tutorial div{background:#f0e6da;border-radius:12px;padding:10px}.tutorial b,.tutorial span{display:block}.tutorial span{font-size:12px;margin-top:3px}" +
      "#adRewardOverlay,#giftRewardOverlay{position:fixed;inset:0;z-index:130;display:none;align-items:center;justify-content:center;background:rgba(30,22,18,.84);padding:16px}" +
      "#adRewardOverlay.open,#giftRewardOverlay.open{display:flex}.adRewardCard{width:min(430px,100%);background:#fffdf7;border:5px solid #4a3b33;border-radius:24px;padding:20px;color:#4a3b33;text-align:center;filter:drop-shadow(0 9px 0 rgba(0,0,0,.24))}" +
      ".adRewardGift{font-size:42px;line-height:1}.adRewardCard h2{margin:5px 0;color:#e8615a}.adRewardCard strong{color:#ba4c99}.adRewardCard p{font-size:12px;font-weight:800}.adRewardActions{display:grid;grid-template-columns:1.3fr .8fr;gap:8px;margin-top:12px}.adRewardActions .big-btn{margin:0}.adRewardStatus{min-height:18px;margin-top:8px!important;font-size:9px!important;letter-spacing:.6px}" +
      "@media(max-width:560px){#menuExtras{grid-template-columns:repeat(2,1fr)}.settingGrid,.shopGrid{grid-template-columns:1fr}.arsenal{grid-template-columns:62px 1fr;padding:6px;gap:6px}.arsFilter{font-size:7px;padding:8px 3px}.arsGrid{grid-template-columns:1fr}.arsArt{height:70px}.resultGrid{grid-template-columns:1fr 1fr}#modeHud{top:55px;font-size:7px;max-width:62%;overflow:hidden;text-overflow:ellipsis}#candyHud{top:54px;font-size:8px}#minimap{right:140px;top:40px;width:92px;height:92px}#slots{gap:3px}.slot{width:32px}}" ;
    document.head.appendChild(style);

    const extras = document.createElement("div");
    extras.id = "menuExtras";
    const t = SugarI18n.t.bind(SugarI18n);
    extras.innerHTML =
      '<button id="bDaily" class="big-btn dailyBtn">' + escapeHtml(t("SECTION_DAILY")) +
        '<i id="dailyBadge">0</i></button>' +
      '<button id="bSoloConfig" class="big-btn sub-btn">' + escapeHtml(t("BTN_MATCH_CONFIG")) + '</button>' +
      '<button id="bSettings" class="big-btn sub-btn">' + escapeHtml(t("BTN_SETTINGS")) + '</button>' +
      '<button id="bProfile" class="big-btn sub-btn">' + escapeHtml(t("BTN_PROFILE")) + '</button>' +
      '<button id="bTutorial" class="big-btn sub-btn">' + escapeHtml(t("BTN_TUTORIAL")) + '</button>' +
      '<button id="bShop" class="big-btn sub-btn">' + escapeHtml(t("BTN_SHOP")) + '</button>' +
      '<button id="bExitGame" class="big-btn menuDanger">' + escapeHtml(t("BTN_EXIT")) + '</button>';
    document.getElementById("sensWrap").insertAdjacentElement("afterend", extras);
    document.getElementById("bSoloConfig").addEventListener("click", openMatchConfig);
    document.getElementById("bSettings").addEventListener("click", openSettings);
    document.getElementById("bDaily").addEventListener("click", openDaily);
    document.getElementById("bProfile").addEventListener("click", openProfile);
    refreshDailyBadge();
    document.getElementById("bShop").addEventListener("click", function () { openShop(); });
    document.getElementById("bExitGame").addEventListener("click", confirmExitGame);
    document.getElementById("bTutorial").addEventListener("click", function () {
      const t = SugarI18n.t.bind(SugarI18n);
      modal(t("TUTORIAL_TITLE"),
        '<div class="tutorial">' +
        ["MOVE", "AIM", "SLOTS", "ITEMS", "SHOP"].map(function (key) {
          return '<div><b>' + escapeHtml(t("TUT_" + key + "_T")) + '</b><span>' + escapeHtml(t("TUT_" + key + "_D")) + '</span></div>';
        }).join("") +
        '</div>');
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
    const giftOverlay = document.createElement("div");
    giftOverlay.id = "giftRewardOverlay";
    giftOverlay.innerHTML =
      '<div class="adRewardCard" role="dialog" aria-modal="true" aria-labelledby="giftRewardTitle">' +
      '<div class="adRewardGift">🎁</div><h2 id="giftRewardTitle"></h2>' +
      '<p>Voce morreu bastante nessa partida. Assista a um anuncio curto e leve um item de graca so na proxima.</p>' +
      '<div class="adRewardActions"><button id="giftRewardWatch" class="big-btn">ASSISTIR E GANHAR</button>' +
      '<button id="giftRewardSkip" class="big-btn sub-btn">AGORA NAO</button></div>' +
      '<p id="giftRewardStatus" class="adRewardStatus"></p></div>';
    document.body.appendChild(giftOverlay);
    document.getElementById("giftRewardWatch").addEventListener("click", requestGiftRewardAd);
    document.getElementById("giftRewardSkip").addEventListener("click", closeGiftRewardOffer);
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

  function onPurchaseResult(result) {
    const modalTitle = document.getElementById("sugarModalTitle");
    const modalOpen = document.getElementById("sugarModal");
    if (result === "success") showToast(SugarI18n.t("ADS_REMOVED_TAG"));
    if (modalOpen && modalOpen.classList.contains("open") && modalTitle &&
        modalTitle.textContent === SugarI18n.t("SETTINGS_TITLE")) {
      openSettings();
    }
  }

  window.SugarEnhance = {
    version: VERSION,
    onPurchaseResult: onPurchaseResult,
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
    grenadeCapacity: grenadeCapacity,
    grenadeBase: GRENADE_BASE,
    consumeGrenade: consumeGrenade,
    toast: showToast,
    bumpDaily: bumpDaily,
    peakDaily: peakDaily,
    hitTargets: hitTargets,
    refreshSlots: updateWeaponSlots,
    clearFieldWeapons: clearFieldWeapons,
    takeFieldWeapon: takeFieldWeapon,
    lootWeapon: lootWeapon,
    // Arma saqueada de quem voce matou: vale so ate o fim desta partida.
    grantWeapon: function (index) {
      index = clamp(index | 0, 0, WEAPONS.length - 1);
      if (game.tempWeapons.indexOf(index) < 0) game.tempWeapons.push(index);
      updateWeaponSlots();
    },
    openShop: openShop,
    weaponColors: weaponColors,
    skyPalette: skyPalette,
    rebuildMap: rebuildSelectedMap,
    applyNetworkConfig: applyNetworkConfig,
    onRewardedInterstitialResult: onRewardedInterstitialResult,
    onGiftRewardedResult: onGiftRewardedResult,
    onMandatoryInterstitialResult: onMandatoryInterstitialResult,
    assignTeams: assignTeams,
    labelInfo: labelInfo,
    viewerEntity: viewerEntity,
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
