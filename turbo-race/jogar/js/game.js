"use strict";
/*
 * Coração do jogo. Porte de GameView.kt + GameActivity.kt.
 *
 * A TelaDeCorrida faz o que a GameView (uma SurfaceView) fazia no Android:
 *  - constrói a pista da fase (TrackGenerator) e o carro do jogador (PlayerCar)
 *  - roda a lógica de corrida em update(dt): física, tráfego com IA, colisões,
 *    moedas, checkpoints, pontuação, vitória/derrota
 *  - desenha tudo em render(ctx) usando o Renderer e o HUD
 *  - trata o toque na tela (virar, turbo, freio, pause e botões das telas)
 *
 * O laço de tempo ficava em GameLoop.kt (uma thread separada), que chamava
 * update()/render() em passos fixos de 1/60s. Aqui é o requestAnimationFrame
 * com o MESMO acumulador de passo fixo. Não existe lock de Surface no
 * navegador: desenhamos direto no ctx, e não há segunda thread, então o
 * synchronized(lock) do Kotlin simplesmente sumiu.
 *
 * Sobre o tipo de controle (lido de SaveManager):
 *  - CONTROL_TOUCH: metade esquerda da tela vira à esquerda, metade direita à
 *    direita (as áreas dos botões de turbo/freio/pause são ignoradas).
 *  - CONTROL_BUTTONS: botões ◀ ▶ na tela.
 *  - CONTROL_TILT: direção pelo sensor (DeviceOrientationEvent chama setTilt()).
 *
 * O multiplayer local por Bluetooth virou sala online por WebSocket. Os nomes
 * continuam os mesmos: onde o Kotlin lia BluetoothSession, aqui lemos
 * OnlineSession; onde usava BluetoothService, usamos OnlineService.
 */

/** Sessão vazia usada enquanto o js/online.js não estiver carregado. */
const SESSAO_ONLINE_VAZIA = {
  service: null,
  isHost: false,
  stageIndex: 0,
  enabled: false,
  localPlayerId: "player",
  maxPlayers: 3,
  raceLaunchId: "",
  raceOpening: false,
  refreshPlayerId() { /* nada */ },
  clear() { /* nada */ }
};

/** Equivale a ler o objeto BluetoothSession direto no Kotlin. */
function sessaoOnline() {
  return (typeof window !== "undefined" && window.OnlineSession) ? window.OnlineSession : SESSAO_ONLINE_VAZIA;
}

class TelaDeCorrida {

  /**
   * @param {HTMLCanvasElement} canvas tela onde o jogo é desenhado. É nele que
   *        ficam os Pointer Events que substituem o MotionEvent do Android.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;

    // ---- Constantes do motor (coerentes com o Renderer) ----
    this.segmentLength = 200;
    this.cameraHeight = 1000;
    this.cameraDepth = 0.84;
    this.playerZ = this.cameraHeight * this.cameraDepth;   // distância da câmera ao carro
    // V65: calibragem estilo Top Gear/SNES.
    // O velocímetro continua mostrando km/h altos, mas a pista corre menos
    // rápido no mundo para ficar mais pilotável.
    this.baseMaxSpeed = 8200;
    this.baseAccel = this.baseMaxSpeed / 5.35;

    // ---- Componentes ----
    this.renderer = new Renderer();
    this.hud = new HUD();
    this.particles = new ParticleSystem();
    this.controls = new Controls();

    // ---- Dependências externas ----
    this.save = null;
    this.sound = null;
    this.listener = null;

    // ---- Estado da corrida ----
    this.stageIndex = 0;
    this.stage = null;
    this.segments = [];
    this.player = null;
    this.state = null;
    this.traffic = [];

    // Multiplayer: sala online (era Wi‑Fi local por Bluetooth)
    this.bluetoothService = null;
    this.remoteStates = new Map();
    this.remoteCars = new Map();
    this.remotePlayerNames = new Map();
    this.networkTimer = 0;
    this.localPlayerName = "Jogador";
    this.rivalPassedPlayerPhrases = [
      "Abre caminho!",
      "Te passei!",
      "Essa curva é minha!",
      "Tenta me pegar!",
      "Comendo poeira!",
      "Peguei o vácuo!"
    ];
    this.playerPassedRivalPhrases = [
      "Boa, mas eu volto!",
      "Não acabou!",
      "Vou te buscar!",
      "Passou raspando!",
      "Essa foi boa!",
      "Agora é disputa!"
    ];
    this.aiRivalPhrases = [
      "Sai da frente!",
      "Vou buscar você!",
      "Curva minha!",
      "Tô colado!",
      "Não facilita!",
      "Peguei o vácuo!",
      "Essa disputa é minha!",
      "Acelera aí!"
    ];
    this.playerOvertakePhrases = ["Passei!", "Boa!", "Toma vácuo!", "Agora é minha!", "Turbo Race!"];
    this.playerCrashPhrases = ["Eita!", "Bateu!", "Segura!", "Quase!", "Volta pra pista!"];
    this.playerRunPhrases = ["Vamos!", "Acelera!", "Mantém o ritmo!", "Reta livre!", "Dá para buscar!"];

    this.trackLength = 0;
    this.finishPosition = 0;
    this.prevPlayerSegIndex = 0;
    this.animTime = 0;
    this.bgOffset = 0;
    this.collisionCooldown = 0;
    this.fuelRescueCooldown = 0;
    this.fuelRescueRollTimer = 0;
    this.resultReported = false;
    this.pitBoostItemArmed = false;
    this.freezeRivalsItemArmed = false;
    this.ghostModeItemArmed = false;
    this.explodeRivalsItemArmed = false;
    this.tireGripRaceActive = false;
    this.boxFreeRaceActive = false;
    this.selectedRaceUpgradeIndex = 0;
    this.raceWeatherMode = "auto";

    // Controle externo: teclado e Gamepad API (era Bluetooth/USB no Android).
    this.gamepadLeft = false;
    this.gamepadRight = false;
    this.gamepadAccel = false;
    this.gamepadBrake = false;
    this.gamepadAxisX = 0;
    this.gamepadGasAxis = 0;
    this.gamepadBrakeAxis = 0;
    // Estado anterior de cada acao configuravel, para detectar o "acabou de
    // apertar" que no Android vinha de graca com o KeyEvent.ACTION_DOWN.
    this.gamepadActionWasDown = Object.create(null);

    // Aviso grande no centro quando o jogador ultrapassa alguém.
    this.positionFlashTimer = 0;
    this.positionFlashLabel = "";
    this.turboReadyAnnounced = false;
    this.overdriveAnnounced = false;
    this.lastRankForNotice = 1;

    // V64: efeitos sincronizados da largada (som, tremida, brilho e turbo visual).
    this.countdownSoundStage = TelaDeCorrida.INT_MIN;
    this.countdownShakeTimer = 0;
    this.countdownGoFlashTimer = 0;
    this.launchTurboFxTimer = 0;
    this.turboVibrationPulseTimer = 0;
    this.driftSoundCooldown = 0;
    this.aiTalkCooldown = 0;
    this.playerSpeechText = "";
    this.playerSpeechTimer = 0;
    this.playerRunSpeechCooldown = 0;
    this.usedPlayerSpeechIds = new Set();
    this.usedAiSpeechIds = new Set();
    this.playerSpeechCount = 0;
    this.playerSpeechCooldown = 0;
    this.hazardSlideTimer = 0;
    this.hazardSlideTotal = 0;
    this.hazardSlideDirection = 0;
    this.trackHazardCooldown = 0;

    // Farol: liga automaticamente em fases noturnas, mas pode ser alternado na tela.
    this.headlightsOn = false;

    // ---- Laço / ciclo de vida ----
    this.loop = 0;             // id do requestAnimationFrame
    this.running = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.surfaceW = 0;
    this.surfaceH = 0;
    this.ready = false;

    // Dedos na tela, por pointerId. Reproduz o multi-toque do MotionEvent.
    this.ponteiros = new Map();

    // Sensor de inclinacao. O Android usa o acelerometro (eixo Y); no
    // navegador fazemos o mesmo por DeviceMotion e deixamos DeviceOrientation
    // apenas como alternativa para aparelhos que nao entregam aceleracao.
    this.tiltPermissionStatus = "unknown";
    this.tiltMotionLastAt = 0;
    this.tiltFiltered = 0;
    this.tiltOrientationNeutral = null;
    this.tiltOrientationAngle = null;

    // No Android os PNGs já vinham decodificados; aqui as imagens chegam de
    // forma assíncrona, então relemos a tabela do Assets até todas aparecerem.
    this.spritesPendentes = true;
    this.spriteRecheckTimer = 0;

    this._instalarEntrada();
    this.loadCarSprites();
    this.loadHudIllustrations();
  }

  // =================== RECURSOS ===================

  loadHudIllustrations() {
    try {
      const defeat = this.decodeCarBitmap("defeat_scene");
      if (defeat) this.hud.setDefeatBitmap(defeat);

      const victory = this.decodeCarBitmap("victory_scene");
      if (victory) this.hud.setVictoryBitmap(victory);

      const leftArrow = this.decodeCarBitmap("control_arrow_left");
      const rightArrow = this.decodeCarBitmap("control_arrow_right");
      this.hud.setControlArrowBitmaps(leftArrow, rightArrow);

      const accelPedal = this.decodeCarBitmap("control_pedal_accel");
      const brakePedal = this.decodeCarBitmap("control_pedal_brake");
      this.hud.setControlPedalBitmaps(accelPedal, brakePedal);

      const countdown3 = this.decodeCarBitmap("countdown_3");
      const countdown2 = this.decodeCarBitmap("countdown_2");
      const countdown1 = this.decodeCarBitmap("countdown_1");
      const countdownGo = this.decodeCarBitmap("countdown_go");
      this.hud.setCountdownBitmaps(countdown3, countdown2, countdown1, countdownGo);
    } catch (e) {
      /* ignora */
    }
  }

  /**
   * Carrega as imagens dos carros (assets/img/car_0..car_9) e entrega ao
   * Renderer. Assets.img devolve null quando o arquivo não existe — é o mesmo
   * papel do resId == 0 do Kotlin: nesse caso o carro vira forma geométrica.
   */
  /**
   * No Kotlin este metodo decodificava os PNGs dos carros e entregava os
   * Bitmaps prontos ao Renderer, porque no Android o recurso ja esta em disco
   * e o decode e imediato.
   *
   * No navegador a imagem chega depois, de forma assincrona. Por isso o
   * Renderer guarda o NOME do recurso (car_0, moeda, tree_oak...) e resolve com
   * Assets.img() na hora de desenhar: assim que o arquivo chega, ele aparece
   * sozinho no proximo quadro. Trocar essas tabelas por objetos aqui era o que
   * deixava todo carro virar caixa colorida — no instante em que a corrida
   * comecava, nenhuma imagem tinha chegado ainda, e o null ficava gravado.
   *
   * Entao aqui so pedimos o carregamento e cuidamos do HUD, que precisa dos
   * objetos de verdade.
   */
  loadCarSprites() {
    for (let i = 0; i < EnemyCar.SPRITE_COUNT; i++) {
      Assets.imgAsync("car_" + i);
      Assets.imgAsync("car_" + i + "_left");
      Assets.imgAsync("car_" + i + "_right");
    }
    Assets.imgAsync("moeda");
    Assets.imgAsync("finish_portal_custom");

    // O fundo desta fase: e a imagem mais pesada da corrida, entao so ela.
    const fundoDaFase = Renderer.STAGE_BACKGROUNDS[this.stage ? this.stage.name : ""];
    if (fundoDaFase) Assets.imgAsync(fundoDaFase);
    if (this.stage && this.stage.name === "Rio de Janeiro") Assets.imgAsync("rio_litoraneo_bg");

    // Cenario lateral: sao muitos arquivos pequenos, todos usados na pista.
    for (const nome of Object.values(Renderer.PROP_SPRITES)) Assets.imgAsync(nome);

    // O HUD guarda os objetos, entao enquanto faltar algum vale reler.
    this.spritesPendentes = !Assets.img("victory_scene") || !Assets.img("defeat_scene") ||
      !Assets.img("countdown_3") || !Assets.img("car_" + (this.player ? this.player.car.id : 0));
  }

  /** Equivale ao decodeResource do Kotlin: devolve null quando o recurso não existe. */
  decodeCarBitmap(rawName) {
    return Assets.img(rawName);
  }

  /** Configura a fase e as dependências. Chamado por quem cria a tela. */
  configure(stageIndex, save, sound, listener, playerName) {
    this.stageIndex = stageIndex;
    this.save = save;
    this.sound = sound;
    this.listener = listener;
    const nome = String(playerName === undefined ? "Jogador" : playerName).trim().slice(0, 14);
    this.localPlayerName = nome === "" ? "Jogador" : nome;
    this.loadStage(stageIndex);
    this.ready = true;
    this._instalarSensorDeInclinacao();
    this.maybeStartLoop();
  }

  /** Conecta a tela ao serviço da sala online para corrida com vários jogadores. */
  attachMultiplayer(service) {
    this.bluetoothService = service || null;

    // V59: multiplayer é corrida entre jogadores reais. Remove todo tráfego/IA
    // que foi criado durante configure(), porque attachMultiplayer acontece depois.
    if (service && this.segments.length > 0) {
      this.traffic.length = 0;
      this.rebucketTraffic();
      this.refreshTotalRacersForMultiplayer();
    }

    const self = this;
    if (service) {
      service.setListener({
        onStatus(msg) { /* usado só no saguão */ },
        onConnected() { /* usado só no saguão */ },
        onDisconnected(msg) { /* usado só no saguão */ },
        onRawMessage(msg) { /* provocações livres */ },
        onRoomUpdate(resumo) { /* usado só no saguão */ },
        onRaceStart(info) {
          // Todos já confirmaram que a pista está carregada. Zera qualquer
          // estado provisório e aplica o prazo comum do GO.
          const agora = (typeof performance !== "undefined" && performance.now)
            ? performance.now()
            : Date.now();
          self.state.phase = GamePhase.COUNTDOWN;
          self.state.countdown = Math.max(0.05, (Number(info.largadaLocalEm || OnlineSession.raceGoAtMs) - agora) / 1000);
          self.state.completedLaps = 0;
          self.state.elapsed = 0;
          self.player.position = 0;
          self.player.speed = 0;
          for (const car of self.remoteCars.values()) {
            car.z = 0;
            car.completedLaps = 0;
            car.speed = 0;
          }
        },

        onStateReceived(state) {
          const remoteId = (state.playerId && state.playerId !== "")
            ? state.playerId
            : ((state.playerName && state.playerName !== "") ? state.playerName : "remote");
          if (remoteId === sessaoOnline().localPlayerId) return;

          const nomeBruto = String(state.playerName || "").trim().slice(0, 14);
          const remoteName = nomeBruto === "" ? "Jogador" : nomeBruto;
          self.remoteStates.set(remoteId, state);
          self.remotePlayerNames.set(remoteId, remoteName);

          const remotePosition = self.normalizePosition(state.position);
          const remoteTotal = state.lap * self.trackLength + remotePosition;
          const playerTotal = (self.ready && self.trackLength > 0)
            ? (self.state.completedLaps * self.trackLength + self.player.position)
            : 0;
          const car = self.remoteCars.get(remoteId);
          if (!car) {
            const created = new EnemyCar(
              remotePosition,
              limitar(state.x, -1.15, 1.15),
              state.speed,
              Cor.rgb(0xFF, 0xD1, 0x36),
              limitar(Math.trunc(state.carId), 0, EnemyCar.SPRITE_COUNT - 1),
              state.lap,
              remoteName
            );
            created.isRemote = true;
            created.wasAheadOfPlayer = remoteTotal > playerTotal + 12;
            self.remoteCars.set(remoteId, created);
          } else {
            const wasAhead = car.wasAheadOfPlayer;
            car.z = remotePosition;
            car.offset = limitar(state.x, -1.15, 1.15);
            car.speed = state.speed;
            car.completedLaps = state.lap;
            car.driverName = remoteName;
            car.isRemote = true;

            const isAhead = remoteTotal > playerTotal + 12;
            if (self.ready && self.state.phase === GamePhase.RUNNING && self.state.elapsed > 1.2) {
              if (!wasAhead && isAhead) {
                self.triggerRemoteTaunt(car, self.rivalPassedPlayerPhrases);
              } else if (wasAhead && !isAhead) {
                self.triggerRemoteTaunt(car, self.playerPassedRivalPhrases);
              }
            }
            car.wasAheadOfPlayer = isAhead;
          }
          self.refreshTotalRacersForMultiplayer();
        }
      });
    }
    if (this.state) this.refreshTotalRacersForMultiplayer();
    if (service && typeof service.reportLoaded === "function") {
      service.reportLoaded(sessaoOnline().raceLaunchId);
    }
  }

  refreshTotalRacersForMultiplayer() {
    if (!this.state || !this.stage) return;
    const realPlayers = 1 + this.remoteCars.size;
    const expectedMinimum = this.bluetoothService ? 2 : 1;
    if (this.bluetoothService) {
      this.state.totalRacers = limitar(
        Math.max(realPlayers, expectedMinimum),
        1,
        Math.max(2, sessaoOnline().maxPlayers)
      );
    } else {
      this.state.totalRacers = this.stage.trafficCount + 1;
    }
  }

  triggerRemoteTaunt(car, phrases) {
    if (this.save && !this.save.speechEnabled) return;
    if (phrases.length === 0 || car.tauntTimer > 0.25) return;
    car.tauntText = (phrases === this.rivalPassedPlayerPhrases)
      ? SpeechBank.nextAiOvertakePlayer(car, this.usedAiSpeechIds)
      : SpeechBank.nextAiGotPassed(car, this.usedAiSpeechIds);
    car.tauntTimer = 3.0;
  }

  updateRemoteTaunts(dt) {
    for (const car of this.remoteCars.values()) {
      if (car.tauntTimer > 0) car.tauntTimer = Math.max(0, car.tauntTimer - dt);
    }
  }

  isDarkStage() {
    if (!this.stage) return false;
    if (this.raceWeatherMode === "night") return true;
    if (this.raceWeatherMode !== "auto") return false;
    const n = this.stage.name.toLowerCase();
    return (this.stage.countryIndex === 0 && this.stage.numberInCountry === 3) ||
      this.stage.isNight ||
      n.includes("night") ||
      n.includes("noite") ||
      n.includes("neon") ||
      n.includes("shibuya") ||
      n.includes("vegas");
  }

  musicRawNameForStage(index, stage) {
    if (stage.countryIndex === 2) {
      return "japan_music_" + limitar(stage.numberInCountry, 1, 6);
    }
    return "race_music_" + (index % 10);
  }

  /** (Re)constrói toda a pista e reinicia o estado da corrida. */
  loadStage(index) {
    this.stageIndex = limitar(Math.trunc(index), 0, StageCatalog.count() - 1);
    this.stage = StageCatalog.byIndex(this.stageIndex);
    const sessao = sessaoOnline();
    const multiplayerSeed = (sessao.enabled && String(sessao.raceLaunchId || "").trim() !== "")
      ? hashCodeDeTexto(sessao.raceLaunchId + "-stage-" + this.stageIndex)
      : null;
    MathUtils.setRandomSeed(multiplayerSeed);

    // Música exclusiva por fase.
    // Japão usa as 6 músicas enviadas pelo usuário:
    // japan_music_1 até japan_music_6.
    // As demais fases continuam usando race_music_* com reserva em race_music.
    if (this.sound) this.sound.startMusic(this.musicRawNameForStage(this.stageIndex, this.stage), "race_music");

    // Em sala online, as regras escolhidas pelo anfitrião valem para todos.
    // Fora dela, continua valendo a preferência local já existente.
    if (sessao.enabled && sessao.raceWeather && sessao.raceWeather !== "auto") {
      this.raceWeatherMode = sessao.raceWeather;
    } else if (this.save && this.save.randomWeatherEnabled) {
      const modes = ["sun", "rain_light", "rain_heavy", "snow", "fog", "night"];
      this.raceWeatherMode = modes[MathUtils.randomInt(0, modes.length - 1)];
    } else {
      this.raceWeatherMode = "auto";
    }
    this.renderer.weatherOverride = this.raceWeatherMode;

    // Pista
    this.segments = new TrackGenerator(this.stage, this.segmentLength).build();
    this.decorateTrackHazards();
    this.trackLength = this.segments.length * this.segmentLength;
    // A linha de chegada é o fim da volta. O Renderer faz a pista fechar em loop.
    this.finishPosition = this.trackLength;

    // Carro do jogador (atributos do carro selecionado na garagem + melhorias compradas)
    const baseCar = CarCatalog.byId(this.save.selectedCarId);
    const car = Object.assign({}, baseCar, { accentColor: this.save.getPaintColor(baseCar.id, baseCar.accentColor) });
    this.player = new PlayerCar(
      car,
      this.baseMaxSpeed,
      this.baseAccel,
      this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_SPEED),
      this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_STABILITY),
      this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_TURBO),
      this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_TANK),
      this.save.getUpgradeLevel(car.id, SaveManager.UPGRADE_MOTOR)
    );

    // Estado
    const totalDeVoltas = sessao.enabled
      ? limitar(Math.trunc(sessao.raceLaps || this.stage.laps), 1, 10)
      : this.stage.laps;
    this.state = new GameState(this.stage.timeLimit, this.trackLength, totalDeVoltas);
    if (sessao.enabled) {
      if (sessao.raceGoAtMs > 0) {
        const agoraMonotonico = (typeof performance !== "undefined" && performance.now)
          ? performance.now()
          : Date.now();
        this.state.countdown = Math.max(0.05, (sessao.raceGoAtMs - agoraMonotonico) / 1000);
      } else {
        // A pista foi preparada, mas o servidor ainda espera os outros pilotos.
        this.state.countdown = 3600;
      }
    }
    this.state.totalRacers = this.bluetoothService ? 2 : this.stage.trafficCount + 1;
    this.state.rank = this.state.totalRacers;
    if (!this.save.tutorialSeen && !sessao.enabled) {
      this.state.phase = GamePhase.TUTORIAL;
    }

    // Em corrida noturna o farol começa ligado, exceto Brasil fase 3:
    // ela começa escura de propósito para o jogador usar o farol.
    this.headlightsOn = this.isDarkStage() && !(this.stage.countryIndex === 0 && this.stage.numberInCountry === 3);

    // Tráfego
    this.spawnTraffic();
    if (multiplayerSeed !== null) MathUtils.clearRandomSeed();

    // Reset diversos
    this.controls.reset();
    this.controls.tiltActive = false;
    this.particles.clear();
    this.prevPlayerSegIndex = 0;
    this.animTime = 0;
    this.bgOffset = 0;
    this.collisionCooldown = 0;
    this.fuelRescueCooldown = 0;
    this.positionFlashTimer = 0;
    this.positionFlashLabel = "";
    this.turboReadyAnnounced = false;
    this.overdriveAnnounced = false;
    this.lastRankForNotice = this.state.rank;
    this.countdownSoundStage = TelaDeCorrida.INT_MIN;
    this.countdownShakeTimer = 0;
    this.countdownGoFlashTimer = 0;
    this.launchTurboFxTimer = 0;
    this.turboVibrationPulseTimer = 0;
    this.driftSoundCooldown = 0;
    this.aiTalkCooldown = MathUtils.randomFloat(7.0, 11.0);
    this.networkTimer = 0;
    this.remoteStates.clear();
    this.remoteCars.clear();
    this.remotePlayerNames.clear();
    this.resultReported = false;
    this.gamepadLeft = false;
    this.gamepadRight = false;
    this.gamepadAccel = false;
    this.gamepadBrake = false;
    this.gamepadAxisX = 0;
    this.gamepadGasAxis = 0;
    this.gamepadBrakeAxis = 0;
    this.gamepadActionWasDown = Object.create(null);
    this.pitBoostItemArmed = !!this.save && this.save.pitBoostItems > 0;
    this.freezeRivalsItemArmed = !!this.save && this.save.freezeRivalsItems > 0;
    this.ghostModeItemArmed = !!this.save && this.save.ghostModeItems > 0;
    this.explodeRivalsItemArmed = !!this.save && this.save.explodeRivalsItems > 0;

    // Itens de uso único: comprou na garagem, vale só para esta corrida.
    this.tireGripRaceActive = !!this.save && this.save.consumeTireGripItem();
    this.boxFreeRaceActive = !!this.save && this.save.consumeBoxFreeItem();

    this.selectedRaceUpgradeIndex = 0;
    this.usedPlayerSpeechIds.clear();
    this.usedAiSpeechIds.clear();
    this.playerSpeechText = "";
    this.playerSpeechTimer = 0;
    this.playerRunSpeechCooldown = MathUtils.randomFloat(999, 999);
    this.playerSpeechCount = 0;
    this.playerSpeechCooldown = 0;
    this.hazardSlideTimer = 0;
    this.hazardSlideTotal = 0;
    this.hazardSlideDirection = 0;
    this.trackHazardCooldown = 0;
    this.player.ghostMode = false;

    // O HUD precisa saber o tipo de controle escolhido para desenhar os botões.
    if (this.surfaceW > 0 && this.surfaceH > 0) {
      this.hud.setup(this.surfaceW, this.surfaceH, this.save ? this.save.controlType : SaveManager.CONTROL_TOUCH);
    }
  }

  /** Cria os carros adversários com grid inicial jogável e restante espalhado pela pista. */
  spawnTraffic() {
    this.traffic.length = 0;

    // V59: no multiplayer não existem bots/IA. Só jogadores reais.
    if (this.bluetoothService) {
      this.rebucketTraffic();
      return;
    }

    // V86: a lógica da V85 foi mantida, mas o grid subiu para 15 carros.
    // Nenhum nasce no espaço do jogador. Todos aparecem em zigue-zague e
    // com velocidades bem diferentes nos primeiros metros para não formar paredão.
    // O restante continua espalhado pela pista.
    const total = Math.min(this.stage.trafficCount, 30);
    const gridCount = Math.min(total, 15);
    const gridLanes = [-0.82, -0.36, 0.36, 0.82];
    const minSpeed = Math.min(this.stage.trafficMinSpeed + 0.02, 0.80);
    const maxSpeed = Math.min(this.stage.trafficMaxSpeed + 0.06, 0.98);
    const normalFloor = this.baseMaxSpeed * minSpeed;
    const playerNoSpawnZone = this.playerZ + this.segmentLength * 3.20;
    const firstGridZ = this.playerZ + this.segmentLength * 4.40;
    const gridLongitudinalGap = this.segmentLength * 1.18;
    const launchFactors = [
      1.28, 0.54, 1.12, 0.70, 0.96,
      0.46, 1.36, 0.82, 0.58, 1.04,
      0.64, 1.22, 0.74, 0.50, 0.90
    ];

    for (let i = 0; i < gridCount; i++) {
      const lane = gridLanes[(i * 2 + Math.trunc(i / 2)) % gridLanes.length];
      const offset = lane + MathUtils.randomFloat(-0.018, 0.018);
      const z = Math.min(
        Math.max(
          firstGridZ + i * gridLongitudinalGap + MathUtils.randomFloat(-this.segmentLength * 0.10, this.segmentLength * 0.10),
          playerNoSpawnZone
        ),
        (this.segments.length - 40) * this.segmentLength
      );

      const launchSpeed = this.baseMaxSpeed * launchFactors[limitar(i, 0, launchFactors.length - 1)];
      const normalSpeedFactor = MathUtils.randomFloat(minSpeed, maxSpeed);
      const normalSpeed = Math.max(this.baseMaxSpeed * normalSpeedFactor, normalFloor);
      const aggression = MathUtils.randomFloat(0.58, 0.98);

      const carro = new EnemyCar(z, offset, launchSpeed, EnemyCar.randomColor(), EnemyCar.randomSprite());
      carro.aggression = aggression;
      carro.preferredLane = offset;
      carro.laneDecisionTimer = MathUtils.randomFloat(0.70, 1.65);
      carro.aiTurboCooldown = MathUtils.randomFloat(8.5, 14.0);
      carro.launchSpreadTimer = MathUtils.randomFloat(4.6, 6.8);
      carro.launchSpreadSpeed = launchSpeed;
      carro.cruiseSpeed = normalSpeed;
      this.traffic.push(carro);
    }

    const remaining = total - gridCount;
    if (remaining > 0) {
      const scatterStart = Math.min(this.playerZ + this.segmentLength * 22, (this.segments.length - 80) * this.segmentLength);
      const scatterEnd = (this.segments.length - 35) * this.segmentLength;
      const scatterLanes = [-0.78, -0.30, 0.30, 0.78];
      const spacing = Math.max((scatterEnd - scatterStart) / Math.max(1, remaining), this.segmentLength * 4.8);

      for (let j = 0; j < remaining; j++) {
        const lane = scatterLanes[MathUtils.randomInt(0, scatterLanes.length - 1)];
        const baseZ = scatterStart + j * spacing;
        const z = limitar(baseZ + MathUtils.randomFloat(-this.segmentLength * 1.25, this.segmentLength * 1.25), scatterStart, scatterEnd);
        const speedFactor = MathUtils.randomFloat(minSpeed, maxSpeed);
        const aggression = MathUtils.randomFloat(0.62, 1.08);

        const carro = new EnemyCar(
          z,
          lane + MathUtils.randomFloat(-0.028, 0.028),
          this.baseMaxSpeed * speedFactor,
          EnemyCar.randomColor(),
          EnemyCar.randomSprite()
        );
        carro.aggression = aggression;
        carro.preferredLane = lane;
        carro.laneDecisionTimer = MathUtils.randomFloat(1.15, 2.60);
        carro.aiTurboCooldown = MathUtils.randomFloat(7.0, 15.5);
        carro.cruiseSpeed = this.baseMaxSpeed * speedFactor;
        this.traffic.push(carro);
      }
    }

    this.rebucketTraffic();
  }

  // =================== LÓGICA (chamada pelo laço) ===================

  update(dt) {
    if (!this.ready) return;
    this.animTime += dt;
    if (this.countdownShakeTimer > 0) this.countdownShakeTimer = Math.max(0, this.countdownShakeTimer - dt);
    if (this.countdownGoFlashTimer > 0) this.countdownGoFlashTimer = Math.max(0, this.countdownGoFlashTimer - dt);
    if (this.launchTurboFxTimer > 0) this.launchTurboFxTimer = Math.max(0, this.launchTurboFxTimer - dt);
    if (this.driftSoundCooldown > 0) this.driftSoundCooldown = Math.max(0, this.driftSoundCooldown - dt);
    if (this.aiTalkCooldown > 0) this.aiTalkCooldown = Math.max(0, this.aiTalkCooldown - dt);
    if (this.trackHazardCooldown > 0) this.trackHazardCooldown = Math.max(0, this.trackHazardCooldown - dt);
    if (this.playerSpeechCooldown > 0) this.playerSpeechCooldown = Math.max(0, this.playerSpeechCooldown - dt);
    if (this.playerSpeechTimer > 0) {
      this.playerSpeechTimer = Math.max(0, this.playerSpeechTimer - dt);
      if (this.playerSpeechTimer <= 0) this.playerSpeechText = "";
    }
    if (this.playerRunSpeechCooldown > 0) this.playerRunSpeechCooldown = Math.max(0, this.playerRunSpeechCooldown - dt);
    if (this.state.freezeRivalsTimer > 0) this.state.freezeRivalsTimer = Math.max(0, this.state.freezeRivalsTimer - dt);
    if (this.state.explodeRivalsTimer > 0) this.state.explodeRivalsTimer = Math.max(0, this.state.explodeRivalsTimer - dt);
    if (this.state.ghostModeTimer > 0) this.state.ghostModeTimer = Math.max(0, this.state.ghostModeTimer - dt);
    if (this.player) this.player.ghostMode = this.state.ghostModeTimer > 0;
    if (this.positionFlashTimer > 0) {
      this.positionFlashTimer = Math.max(0, this.positionFlashTimer - dt);
      if (this.positionFlashTimer <= 0) {
        this.positionFlashLabel = "";
      }
    }
    if (this.save && !this.save.speechEnabled) {
      this.playerSpeechText = "";
      this.playerSpeechTimer = 0;
      for (const car of this.traffic) {
        car.tauntText = "";
        car.tauntTimer = 0;
      }
      for (const car of this.remoteCars.values()) {
        car.tauntText = "";
        car.tauntTimer = 0;
      }
    }

    switch (this.state.phase) {
      case GamePhase.TUTORIAL:
        /* primeira tela de orientação */
        break;
      case GamePhase.COUNTDOWN:
        this.updateCountdown(dt);
        break;
      case GamePhase.RUNNING:
        this.updateRunning(dt);
        break;
      case GamePhase.PAUSED:
        /* mundo congelado */
        break;
      case GamePhase.WON:
      case GamePhase.LOST:
        // Mantém as partículas se dissipando suavemente e anima o contador de moedas.
        this.particles.update(dt);
        this.state.rewardAnimTime = Math.min(3.2, this.state.rewardAnimTime + dt);
        break;
      default:
        break;
    }
  }

  triggerCountdownStage(stageNumber) {
    if (this.countdownSoundStage === stageNumber) return;
    this.countdownSoundStage = stageNumber;

    if (stageNumber >= 1 && stageNumber <= 3) {
      if (this.sound) this.sound.playCountdownTick();
      this.countdownShakeTimer = 0.14;
    } else {
      if (this.sound) this.sound.playCountdownGo();
      if (this.sound) this.sound.playTurbo();
      this.countdownShakeTimer = 0.34;
      this.countdownGoFlashTimer = 0.26;
      this.launchTurboFxTimer = 1.05;
      this.positionFlashLabel = "VAI!";
      this.positionFlashTimer = 0.45;
      // Pequeno impulso inicial para a saída parecer mais forte.
      this.player.speed = Math.max(this.player.speed, this.player.maxSpeed * 0.12);
    }
  }

  updateCountdown(dt) {
    // Multiplayer usa o prazo monotônico em todos os quadros. Assim, uma
    // engasgada ou o limite do acumulador de física não alonga a contagem no
    // celular em relação ao computador.
    const sessao = sessaoOnline();
    if (this.bluetoothService && sessao.raceGoAtMs > 0) {
      const agora = (typeof performance !== "undefined" && performance.now)
        ? performance.now()
        : Date.now();
      this.state.countdown = Math.max(0, (sessao.raceGoAtMs - agora) / 1000);
    }

    let stageNumber;
    if (this.state.countdown > 2.5) stageNumber = 3;
    else if (this.state.countdown > 1.5) stageNumber = 2;
    else if (this.state.countdown > 0.5) stageNumber = 1;
    else stageNumber = 0;
    this.triggerCountdownStage(stageNumber);

    if (!(this.bluetoothService && sessao.raceGoAtMs > 0)) {
      this.state.countdown -= dt;
    }
    if (this.state.countdown <= 0) {
      this.state.phase = GamePhase.RUNNING;
      if (this.sound) this.sound.startEngine();
    }
  }

  weatherRoadGrip() {
    switch (this.raceWeatherMode) {
      case "snow": return 0.82;
      case "rain_heavy": return 0.86;
      case "rain_light":
      case "fog":
      case "night": return 0.90;
      case "sun": return 1;
      default: break;
    }
    const n = this.stage.name.toLowerCase();
    if (n.includes("snow") || n.includes("neve") || n.includes("alpino") || n.includes("fuji") || n.includes("sapporo") || n.includes("rocky") || n.includes("gramado") || n.includes("dolomiti")) return 0.82;
    if (n.includes("rain") || n.includes("chuva") || n.includes("neblina") || n.includes("curitiba") || n.includes("new york") || n.includes("milano") || this.stage.isNight || n.includes("neon") || n.includes("night") || n.includes("vegas") || n.includes("shibuya")) return 0.90;
    return 1;
  }

  isRainWeatherActive() {
    if (this.raceWeatherMode === "rain_light" || this.raceWeatherMode === "rain_heavy") return true;
    if (this.raceWeatherMode !== "auto") return false;
    const n = this.stage.name.toLowerCase();
    return n.includes("rain") || n.includes("chuva") || n.includes("temporale") || n.includes("new york");
  }

  decorateTrackHazards() {
    if (!this.stage || this.segments.length === 0) return;
    const sessao = sessaoOnline();
    let tipos;
    if (sessao.enabled) {
      tipos = [];
      if (sessao.puddlesWater) tipos.push(SpriteType.PUDDLE_WATER);
      if (sessao.puddlesOil) tipos.push(SpriteType.PUDDLE_OIL);
      if (tipos.length === 0) return;
    } else {
      tipos = [this.isRainWeatherActive() ? SpriteType.PUDDLE_WATER : SpriteType.PUDDLE_OIL];
    }
    let ranges;
    switch (this.stage.countryIndex) {
      case 0: ranges = [Math.trunc(this.segments.length * 0.18), Math.trunc(this.segments.length * 0.58)]; break;
      case 1: ranges = [Math.trunc(this.segments.length * 0.24), Math.trunc(this.segments.length * 0.72)]; break;
      case 2: ranges = [Math.trunc(this.segments.length * 0.30), Math.trunc(this.segments.length * 0.78)]; break;
      default: ranges = [Math.trunc(this.segments.length * 0.26), Math.trunc(this.segments.length * 0.68)]; break;
    }
    for (let faixa = 0; faixa < ranges.length; faixa++) {
      const base = ranges[faixa];
      const hazardType = tipos[faixa % tipos.length];
      let idx = limitar(base, 24, this.segments.length - 1 - 24);
      let guard = 0;
      while (guard < 26 && (this.segments[idx].isPitStop || this.segments[idx].curve > 5.4 || this.segments[idx].curve < -5.4)) {
        idx = Math.min(idx + 3, this.segments.length - 1 - 24);
        guard++;
      }
      const offset = MathUtils.randomFloat(-0.44, 0.44);
      this.segments[idx].sprites.push(new Sprite(hazardType, offset, MathUtils.randomFloat(0.86, 1.08)));

      // Sempre avisa antes da poça/óleo com placa de derrapagem.
      const warnSide = offset >= 0 ? 1 : -1;
      const warnIdxA = Math.max(8, idx - 10);
      const warnIdxB = Math.max(6, idx - 6);
      if (!this.segments[warnIdxA].isPitStop && !this.segments[warnIdxA].isTunnel) {
        this.segments[warnIdxA].sprites.push(new Sprite(SpriteType.SIGN_SLIPPERY, warnSide * 1.72, 0.88));
      }
      if (!this.segments[warnIdxB].isPitStop && !this.segments[warnIdxB].isTunnel) {
        this.segments[warnIdxB].sprites.push(new Sprite(SpriteType.SIGN_WARNING, -warnSide * 1.68, 0.84));
      }
    }
  }

  startHazardSlide(type) {
    // Upgrade "Pneus Pro": comprado na garagem e vale para todas as corridas do carro.
    // Com ele, água e óleo não fazem o carro deslizar.
    if (this.tireGripRaceActive) {
      this.trackHazardCooldown = 0.60;
      this.collisionCooldown = Math.max(this.collisionCooldown, 0.10);
      this.speakAsPlayer("Pneus Pro seguraram!", true);
      return;
    }

    const duration = (type === SpriteType.PUDDLE_WATER) ? 2.0 : 3.0;
    this.hazardSlideTimer = duration;
    this.hazardSlideTotal = duration;
    this.hazardSlideDirection = this.player.x >= 0 ? 1 : -1;
    this.trackHazardCooldown = 1.05;
    this.collisionCooldown = Math.max(this.collisionCooldown, 0.25);
    if (this.sound) this.sound.playDrift();
    this.speakAsPlayer(
      (type === SpriteType.PUDDLE_WATER) ? "Poça d'água! Segura!" : "Óleo na pista!",
      true
    );
  }

  updateHazardSlide(dt) {
    if (this.hazardSlideTimer <= 0) return;
    this.hazardSlideTimer = Math.max(0, this.hazardSlideTimer - dt);
    const progress = this.hazardSlideTotal > 0 ? 1 - (this.hazardSlideTimer / this.hazardSlideTotal) : 1;
    const targetEdge = this.hazardSlideDirection < 0 ? -1.06 : 1.06;
    const blend = limitar(0.16 + progress * 0.20, 0.12, 0.34);
    this.player.x += (targetEdge - this.player.x) * blend;
    this.player.speed = Math.max(this.player.speed * 0.996, this.player.maxSpeed * 0.14);
  }

  checkTrackSurfaceHazards(playerSegIndex) {
    if (this.trackHazardCooldown > 0 || this.state.inPitStop || this.state.ghostModeTimer > 0) return;
    const size = this.segments.length;
    for (let d = 0; d <= 1; d++) {
      const seg = this.segments[(playerSegIndex + d) % size];
      for (const sp of seg.sprites) {
        if (sp.type !== SpriteType.PUDDLE_WATER && sp.type !== SpriteType.PUDDLE_OIL) continue;
        const hazardWidth = (sp.type === SpriteType.PUDDLE_WATER) ? 0.22 : 0.24;
        if (MathUtils.overlap(this.player.x, 0.34, sp.offset, hazardWidth, 1.0)) {
          this.startHazardSlide(sp.type);
          return;
        }
      }
    }
  }

  isPitSignalApproaching(segIndex) {
    if (this.segments.length === 0) return false;
    if (this.segments[segIndex].isPitStop) return true;
    const lookAhead = 13;
    for (let d = 1; d <= lookAhead; d++) {
      const idx = (segIndex + d) % this.segments.length;
      if (this.segments[idx].isPitStop) return true;
    }
    return false;
  }

  speakAsPlayer(message, bypassCooldown) {
    const pular = bypassCooldown === true;
    if (!message || String(message).trim() === "") return;
    if (this.save && !this.save.speechEnabled) return;
    if (this.playerSpeechCount >= 10) return;
    if (!pular && (this.playerSpeechTimer > 0 || this.playerSpeechCooldown > 0)) return;
    this.playerSpeechText = message;
    this.playerSpeechTimer = 2.0;
    this.playerSpeechCooldown = 5.6;
    this.playerSpeechCount += 1;
  }

  maybePlayerRunSpeech() {
    // O jogador pediu falas bem menos frequentes.
    // As falas automáticas de ritmo foram desativadas para evitar cansaço.
    return;
  }

  updateRunning(dt) {
    const size = this.segments.length;

    if (this.save && this.save.controlType !== SaveManager.CONTROL_BUTTONS) {
      this.controls.accelerate = true;
    }

    // Segmento do jogador (o carro fica um pouco à frente da câmera).
    const probePosition = this.normalizePosition(this.player.position + this.playerZ);
    const playerSegIndex = limitar(Math.trunc(probePosition / this.segmentLength), 0, size - 1);
    const playerSeg = this.segments[playerSegIndex];
    const slope = playerSeg.p2.world.y - playerSeg.p1.world.y;

    // Atualiza a posição ANTES de mover neste frame.
    // Isso evita o bug de terminar a última volta e virar automaticamente 1º.
    this.updateRankAndOvertakes(false);
    const rankBeforeFinishLine = limitar(this.state.rank, 1, this.state.totalRacers);

    // --- Física do carro: curva + subida/descida + combustível ---
    this.applyGamepadToControls();
    this.player.update(this.controls, playerSeg.curve, slope, this.state.fuel, dt, this.weatherRoadGrip());
    this.updateHazardSlide(dt);
    const hardSteerDrift = Math.abs(this.player.visualSteer) > 0.20 &&
      this.player.speed > this.player.maxSpeed * 0.22 &&
      (Math.abs(playerSeg.curve) > 0.60 || this.controls.left || this.controls.right || Math.abs(this.gamepadAxisX) > 0.24);
    const slidingNow = this.hazardSlideTimer > 0 || this.player.driftAmount > 0.03 || hardSteerDrift;
    if (slidingNow && this.driftSoundCooldown <= 0) {
      if (this.sound) this.sound.playDrift();
      if (this.hazardSlideTimer > 0) this.driftSoundCooldown = 0.72;
      else if (hardSteerDrift) this.driftSoundCooldown = 0.55;
      else this.driftSoundCooldown = 0.85;
    }
    this.drainFuel(dt, slope);

    // V64: saída com turbo visual logo no início da corrida.
    if (this.launchTurboFxTimer > 0 && this.state.fuel > 0.001) {
      this.player.speed = Math.max(this.player.speed, this.player.maxSpeed * 0.16);
      this.player.speed = MathUtils.accelerate(this.player.speed, this.baseAccel * 1.55, dt);
      this.emitTurboBehind();
    }

    // V62: quando acaba a gasolina e um bot bate atrás, o carro entra em
    // "neutro" por alguns segundos. Ele continua rolando vários metros de
    // forma suave, em vez de parar quase imediatamente.
    if (this.fuelRescueRollTimer > 0 && this.state.fuel <= 0.005 && !this.state.inPitStop) {
      this.fuelRescueRollTimer = Math.max(0, this.fuelRescueRollTimer - dt);
      const pulse = limitar(this.fuelRescueRollTimer / 3.8, 0, 1);
      const minNeutralSpeed = this.player.maxSpeed * (0.135 + pulse * 0.115);
      const maxNeutralSpeed = this.player.maxSpeed * 0.285;
      if (this.player.speed < minNeutralSpeed) {
        this.player.speed = Math.min(
          MathUtils.accelerate(this.player.speed, this.player.maxSpeed * 1.85, dt),
          maxNeutralSpeed
        );
      }
    }

    // Avança dentro da volta. Velocidade negativa permite dar ré, mas sem voltar
    // para a volta anterior nem quebrar a projeção da pista.
    this.player.position += this.player.speed * dt;
    if (this.player.position < 0) {
      this.player.position = 0;
      if (this.player.speed < 0) this.player.speed = 0;
    }
    while (this.player.position >= this.trackLength) {
      this.player.position -= this.trackLength;

      const completingFinalLap = (this.state.completedLaps + 1) >= this.state.totalLaps;
      if (this.sound) this.sound.playCheckpoint();

      if (completingFinalLap) {
        // Mantém a posição real que aparecia no HUD antes de cruzar a linha.
        // Sem isso, ao incrementar completedLaps o jogador passava a parecer 1º
        // e a fase era liberada mesmo em último.
        this.state.completedLaps = this.state.totalLaps;
        this.state.rank = rankBeforeFinishLine;
        this.player.position = this.trackLength - 1;

        const qualified = this.state.rank >= 1 && this.state.rank <= 5;
        this.finishRace(qualified, qualified ? RaceOutcome.QUALIFIED : RaceOutcome.NOT_TOP_5);
        return;
      } else {
        this.state.completedLaps += 1;
        if (this.state.currentLap === this.state.totalLaps) {
          this.positionFlashLabel = "ÚLTIMA VOLTA!";
          this.positionFlashTimer = 1.15;
          this.speakAsPlayer("Última volta! Pé no fundo!");
        } else {
          this.positionFlashLabel = "VOLTA " + this.state.currentLap + "/" + this.state.totalLaps;
          this.positionFlashTimer = 0.85;
        }
        this.prevPlayerSegIndex = 0;
      }
    }

    // --- Tráfego (movimento + IA simples de troca de faixa) ---
    this.updateTraffic(dt);
    this.rebucketTraffic();
    this.bucketRemoteCars();
    this.updateRemoteTaunts(dt);

    // --- Eventos ao longo dos segmentos percorridos neste frame ---
    const newProbePosition = this.normalizePosition(this.player.position + this.playerZ);
    const newSegIndex = limitar(Math.trunc(newProbePosition / this.segmentLength), 0, size - 1);
    if (this.player.speed >= 0) {
      this.handlePassedSegments(this.prevPlayerSegIndex, newSegIndex);
    }
    this.prevPlayerSegIndex = newSegIndex;

    // --- Pitstop / combustível ---
    this.handlePitStop(this.segments[newSegIndex], dt);
    this.checkTrackSurfaceHazards(newSegIndex);
    if (this.state.fuel <= 0.001 && !this.state.inPitStop) {
      // Sem gasolina não significa derrota imediata: o carro deve continuar
      // andando no embalo. Só começa a contar falha se ele quase parou.
      const almostStopped = Math.abs(this.player.speed) < this.player.maxSpeed * 0.012;
      if (almostStopped) this.state.emptyFuelTimer += dt; else this.state.emptyFuelTimer = 0;
    } else {
      this.state.emptyFuelTimer = 0;
    }

    // --- Colisão com carros adversários e objetos do cenário ---
    if (this.collisionCooldown > 0) this.collisionCooldown -= dt;
    if (this.fuelRescueCooldown > 0) this.fuelRescueCooldown -= dt;
    this.guideBotsToPushWhenOutOfFuel(dt);
    this.checkCarCollisions(newSegIndex);
    this.checkWorldObjectCollisions(newSegIndex);

    // --- Fora da pista: poeira ---
    if ((this.player.x < -1 || this.player.x > 1) && Math.abs(this.player.speed) > 100) {
      this.emitDustBehind(this.stage.grassDark);
    }

    // --- Turbo: partículas, tremor visual e vibração leve durante o uso ---
    if (this.player.turboActive) {
      this.emitTurboBehind();
      this.turboVibrationPulseTimer -= dt;
      if (this.turboVibrationPulseTimer <= 0) {
        this.pulseTurboVibration();
        this.turboVibrationPulseTimer = 0.16;
      }
    } else {
      this.turboVibrationPulseTimer = 0;
    }

    if (this.player.turboActive && this.player.speedKmh() > this.player.cruiseDisplayKmh()) {
      if (!this.overdriveAnnounced) {
        this.positionFlashLabel = "OVERDRIVE!";
        this.positionFlashTimer = 0.30;
        this.overdriveAnnounced = true;
      }
    } else if (!this.player.turboActive) {
      this.overdriveAnnounced = false;
    }

    // --- Posição na corrida + aviso de ultrapassagem ---
    this.updateRankAndOvertakes(true);
    this.maybePlayerRunSpeech();

    // --- Multiplayer: sala online ---
    this.sendMultiplayerState(dt, false);

    // --- Pontuação ao vivo ---
    const distM = this.state.distanceMeters(this.player.position);
    const lapBonus = this.state.completedLaps * 500;
    const fuelBonus = Math.trunc(this.state.fuel * 150);
    this.state.score = distM + lapBonus + fuelBonus + this.state.overtakes * 100 + this.state.coins * 25;

    // --- Tempo ---
    this.state.elapsed += dt;
    this.state.timeLeft -= dt;

    // --- Som do motor ---
    if (this.sound) this.sound.updateEngine(limitar(Math.abs(this.player.speed) / this.player.maxSpeed, 0, 1));

    // --- Partículas ---
    this.particles.update(dt);

    // --- Fundo (parallax) ---
    this.bgOffset += (this.player.speed * dt / this.segmentLength) * (0.50 + Math.abs(this.segments[playerSegIndex].curve) * 2.10);

    // --- Fim de corrida por falha ---
    if (this.state.timeLeft <= 0 || this.state.emptyFuelTimer > 35) {
      this.state.timeLeft = Math.max(0, this.state.timeLeft);
      const outcome = (this.state.emptyFuelTimer > 35) ? RaceOutcome.OUT_OF_FUEL : RaceOutcome.TIME_UP;
      this.finishRace(false, outcome);
    }
  }

  normalizePosition(z) {
    if (this.trackLength <= 0) return 0;
    let r = z % this.trackLength;
    if (r < 0) r += this.trackLength;
    return r;
  }

  /** Distância positiva de from até to seguindo o sentido da pista. */
  forwardDistance(from, to) {
    const a = this.normalizePosition(from);
    const b = this.normalizePosition(to);
    return (b >= a) ? (b - a) : ((this.trackLength - a) + b);
  }

  drainFuel(dt, slope) {
    if (this.state.inPitStop) return;
    const speedPct = limitar(Math.abs(this.player.speed) / this.player.maxSpeed, 0, 1.4);
    const uphill = slope > 0 ? 1.18 : 0.96;
    const turbo = this.player.turboActive ? 1.52 : 1;
    // V61: consumo geral maior e consumo específico por carro.
    // Carros de maior velocidade final gastam mais combustível.
    const carUse = this.player.fuelConsumptionMultiplier();
    // V75: consumo menos agressivo. Ainda exige estratégia e pitstop,
    // mas o tanque não acaba tão rápido quanto na V74.
    const use = (0.0045 + 0.0095 * speedPct + 0.0038 * speedPct * speedPct) * this.stage.fuelUse * uphill * turbo * carUse * dt;
    this.state.fuel = limitar(this.state.fuel - use / this.player.fuelTankMultiplier, 0, 1);
  }

  handlePitStop(seg, dt) {
    const segIndex = Math.max(0, this.segments.indexOf(seg));
    this.state.pitSignal = this.isPitSignalApproaching(segIndex);
    this.state.inPitStop = false;
    if (!seg.isPitStop) return;

    // A faixa verde fica do lado direito. O jogador precisa entrar nela.
    if (this.player.x > 0.32) {
      this.state.inPitStop = true;

      this.state.fuel = limitar(this.state.fuel + 0.64 * dt, 0, 1);
      this.player.refillTurbo(0.55 * dt);
      if (this.player.turboBar >= 0.995 && !this.turboReadyAnnounced) {
        this.positionFlashLabel = "TURBO PRONTO";
        this.positionFlashTimer = 0.55;
        this.turboReadyAnnounced = true;
      }
      // Upgrade "Box Livre": comprado na garagem e vale para todas as corridas do carro.
      // Com ele, o carro reabastece no box sem reduzir velocidade.
      if (!this.boxFreeRaceActive) {
        const pitLimit = this.player.maxSpeed * 0.42;
        if (this.player.speed > pitLimit) {
          this.player.speed = Math.max(MathUtils.accelerate(this.player.speed, -this.player.maxSpeed * 1.25, dt), pitLimit);
        }
      }
    } else if (this.player.turboBar < 0.95) {
      this.turboReadyAnnounced = false;
    }
  }

  /** Move o tráfego e aplica IA de ultrapassagem, defesa e desvio. */
  updateTraffic(dt) {
    if (this.bluetoothService) return;

    const self = this;
    const pz = this.normalizePosition(this.player.position + this.playerZ);
    const lanes = [-0.72, 0, 0.72];

    function laneScore(car, lane) {
      let score = 0;

      // Evita carros lentos ou muito próximos na mesma faixa.
      for (const other of self.traffic) {
        if (other === car) continue;
        const gap = self.forwardDistance(car.z, other.z);
        if (gap > 0 && gap < 14 * self.segmentLength) {
          const lateral = Math.abs(lane - other.offset);
          if (lateral < 0.44) {
            score -= (14 * self.segmentLength - gap) / self.segmentLength * 1.05;
          }
        }
      }

      // Se o jogador está na frente, procura lateral livre para ultrapassar.
      // Se o jogador está sem combustível, alguns bots tentam ir para trás dele
      // para dar empurrões curtos até o pitstop.
      const playerAheadGap = self.forwardDistance(car.z, pz);
      if (playerAheadGap > 0 && playerAheadGap < 14 * self.segmentLength) {
        const lateral = Math.abs(lane - self.player.x);
        if (self.state.fuel <= 0.005 && self.player.speed < self.player.maxSpeed * 0.12) {
          score += Math.max(0, 1.0 - lateral) * 3.2;
        } else if (lateral < 0.46) {
          score -= (14 * self.segmentLength - playerAheadGap) / self.segmentLength * 1.15;
        } else {
          score += car.aggression * 1.55;
        }
      }

      // Se o jogador vem atrás, a IA não fecha como parede. Ela disputa,
      // mas tende a abrir uma fresta para a ultrapassagem ficar possível.
      const playerBehindGap = self.forwardDistance(pz, car.z);
      if (playerBehindGap > 0 && playerBehindGap < 8 * self.segmentLength) {
        const lateral = Math.abs(lane - self.player.x);
        score -= Math.max(0, 1.00 - lateral) * car.aggression * 0.72;
        if (playerBehindGap < 4 * self.segmentLength && lateral > 0.36) score += 0.36;
      }

      if (Math.abs(lane) < 0.05) score += 0.12;
      return score;
    }

    function bestLaneFor(car) {
      let best = lanes[0];
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const lane of lanes) {
        const s = laneScore(car, lane);
        if (s > bestScore) {
          bestScore = s;
          best = lane;
        }
      }
      return best + MathUtils.randomFloat(-0.035, 0.035);
    }

    for (const car of this.traffic) {
      if (car.tauntTimer > 0) car.tauntTimer = Math.max(0, car.tauntTimer - dt);
      const wasAhead = car.wasAheadOfPlayer;
      const carTotalNow = car.completedLaps * this.trackLength + car.z;
      const playerTotalNow = this.state.completedLaps * this.trackLength + this.player.position;
      const isAheadNow = carTotalNow > playerTotalNow + 12;
      if (wasAhead && !isAheadNow) {
        car.tauntTimer = 0;
        car.tauntText = "";
      }
      car.wasAheadOfPlayer = isAheadNow;
      if (this.state.explodeRivalsTimer > 0) {
        car.aiTurboTimer = 0;
        car.speed = 0;
        car.tauntText = "BOOM!";
        car.tauntTimer = Math.max(car.tauntTimer, 0.25);
        continue;
      }
      if (this.state.freezeRivalsTimer > 0) {
        car.aiTurboTimer = 0;
        car.tauntText = "GELO!";
        car.tauntTimer = Math.max(car.tauntTimer, 0.22);
        continue;
      }

      const playerAheadGap = this.forwardDistance(car.z, pz);
      const playerBehindGap = this.forwardDistance(pz, car.z);
      const inFight = (playerAheadGap > 0 && playerAheadGap < 13 * this.segmentLength) ||
        (playerBehindGap > 0 && playerBehindGap < 8 * this.segmentLength);
      const playerNeedsPush = this.state.fuel <= 0.005 && this.player.speed < this.player.maxSpeed * 0.16 &&
        playerAheadGap > 0 && playerAheadGap < 18 * this.segmentLength;

      // V61: quando o jogador fica sem combustível, alguns bots reduzem a
      // agressividade de ultrapassagem e alinham na traseira para empurrar.
      if (playerNeedsPush) {
        car.preferredLane = limitar(this.player.x, -0.86, 0.86);
        car.speed = Math.max(car.speed, this.player.maxSpeed * 0.42);
      }

      // V85: nos primeiros metros da largada, mantém velocidades bem
      // diferentes para espalhar os carros e evitar paredão na pista.
      const launchSpreading = car.launchSpreadTimer > 0;
      if (launchSpreading) {
        car.launchSpreadTimer = Math.max(0, car.launchSpreadTimer - dt);
        const blend = limitar(dt * 2.65, 0, 1);
        car.speed += (car.launchSpreadSpeed - car.speed) * blend;
        if (car.launchSpreadTimer <= 0) {
          car.aiTurboCooldown = MathUtils.randomFloat(4.0, 9.0);
        }
      }

      // V59: turbo dos bots de tempos em tempos.
      if (car.aiTurboTimer > 0) {
        car.aiTurboTimer = Math.max(0, car.aiTurboTimer - dt);
      } else {
        car.aiTurboCooldown -= dt;
        if (car.aiTurboCooldown <= 0 && (inFight || MathUtils.randomInt(0, 100) < 4)) {
          car.aiTurboTimer = MathUtils.randomFloat(1.15, 2.15);
          car.aiTurboCooldown = MathUtils.randomFloat(8.0, 16.0);
          if (!this.save || this.save.speechEnabled) {
            car.tauntText = SpeechBank.nextAiTurbo(car, this.usedAiSpeechIds);
            car.tauntTimer = 3.0;
          }
        }
      }

      const turboBoost = car.aiTurboActive ? 1.12 : 1;

      // IA menos agressiva, mas ainda tenta disputar posição.
      const maxChaseSpeed = this.baseMaxSpeed * limitar(0.92 + car.aggression * 0.055, 0.96, 1.06) * turboBoost;
      if (!launchSpreading) {
        if (playerAheadGap > 0 && playerAheadGap < 12 * this.segmentLength) {
          car.speed = Math.min(car.speed + this.baseMaxSpeed * (0.036 + car.aggression * 0.014) * dt, maxChaseSpeed);
        } else if (playerBehindGap > 0 && playerBehindGap < 7 * this.segmentLength) {
          car.speed = Math.min(car.speed + this.baseMaxSpeed * (0.018 + car.aggression * 0.009) * dt, maxChaseSpeed);
        } else {
          const floorSpeed = this.baseMaxSpeed * Math.min(this.stage.trafficMinSpeed + 0.02, 0.84);
          const normalCruise = limitar(car.cruiseSpeed, floorSpeed, maxChaseSpeed);
          if (car.speed > normalCruise) {
            car.speed = Math.max(car.speed - this.baseMaxSpeed * 0.030 * dt, normalCruise);
          } else if (car.speed < floorSpeed) {
            car.speed = Math.min(car.speed + this.baseMaxSpeed * 0.018 * dt, floorSpeed);
          }
        }
      }

      car.z += car.speed * turboBoost * dt;
      while (car.z >= this.trackLength) {
        car.z -= this.trackLength;
        car.completedLaps += 1;
      }

      let steer = 0;
      car.laneDecisionTimer -= dt;

      if (car.laneDecisionTimer <= 0 || inFight) {
        car.preferredLane = bestLaneFor(car);
        car.laneDecisionTimer = MathUtils.randomFloat(0.95, 2.25) / Math.max(0.7, car.aggression);
      }

      // Desvio de outros carros.
      for (const other of this.traffic) {
        if (other === car) continue;
        const gap = this.forwardDistance(car.z, other.z);
        if (gap > 0 && gap < 13 * this.segmentLength && other.speed <= car.speed * 1.04) {
          if (MathUtils.overlap(car.offset, car.width, other.offset, other.width, 1.50)) {
            const target = bestLaneFor(car);
            steer += limitar((target - car.offset) * 1.18 * car.aggression, -1.10, 1.10);
          }
        }
      }

      // Jogador à frente: tenta ultrapassar, mas sem zigue-zague exagerado.
      if (playerAheadGap > 0 && playerAheadGap < 12 * this.segmentLength) {
        if (MathUtils.overlap(car.offset, car.width, this.player.x, 0.9, 1.42)) {
          const target = bestLaneFor(car);
          steer += limitar((target - car.offset) * 1.25 * car.aggression, -1.20, 1.20);
        } else {
          steer += limitar((this.player.x - car.offset) * 0.14 * car.aggression, -0.32, 0.32);
        }
      }

      // Jogador atrás: abre levemente para não travar a pista inteira.
      if (playerBehindGap > 0 && playerBehindGap < 8 * this.segmentLength) {
        const away = (car.offset >= this.player.x) ? 1 : -1;
        let openStrength;
        if (launchSpreading && playerBehindGap < 5 * this.segmentLength) openStrength = 0.58;
        else if (playerBehindGap < 4 * this.segmentLength) openStrength = 0.42;
        else openStrength = 0.24;
        const openLane = limitar(car.offset + away * openStrength, -0.88, 0.88);
        steer += limitar((openLane - car.offset) * 0.96 * car.aggression, -0.72, 0.72);
      }

      steer += limitar((car.preferredLane - car.offset) * 0.82 * car.aggression, -0.85, 0.85);

      const laneSpeed = (0.58 + car.aggression * 0.34) * dt;
      car.offset += limitar(steer, -1.05, 1.05) * laneSpeed;
      car.offset = limitar(car.offset, -0.98, 0.98);
    }

    // V86: falas rápidas da IA usando o mesmo balão visual do multiplayer.
    // Aparece de vez em quando, por 1 a 2 segundos, só em carros próximos.
    if (this.state.phase === GamePhase.RUNNING && this.state.elapsed > 3.0 && this.aiTalkCooldown <= 0 && (!this.save || this.save.speechEnabled)) {
      const candidates = this.traffic.filter(function (car) {
        const atras = self.forwardDistance(pz, car.z);
        const frente = self.forwardDistance(car.z, pz);
        return car.tauntTimer <= 0 &&
          ((atras >= 0.1 && atras <= 13 * self.segmentLength) ||
            (frente >= 0.1 && frente <= 4.5 * self.segmentLength));
      });
      if (candidates.length > 0) {
        const car = candidates[MathUtils.randomInt(0, candidates.length - 1)];
        car.tauntText = SpeechBank.nextAiRival(car, this.usedAiSpeechIds);
        car.tauntTimer = 3.0;
        this.aiTalkCooldown = MathUtils.randomFloat(7.2, 12.0);
      } else {
        this.aiTalkCooldown = 1.2;
      }
    }
  }

  /** Recoloca cada carro no segmento correspondente (para desenho e colisão). */
  rebucketTraffic() {
    for (const s of this.segments) if (s.cars.length > 0) s.cars.length = 0;
    const size = this.segments.length;
    for (const car of this.traffic) {
      const idx = limitar(Math.trunc(this.normalizePosition(car.z) / this.segmentLength), 0, size - 1);
      this.segments[idx].cars.push(car);
    }
  }

  /** Coloca os carros remotos da sala online nos segmentos corretos para desenho e colisão. */
  bucketRemoteCars() {
    if (this.segments.length === 0) return;
    for (const car of this.remoteCars.values()) {
      const idx = limitar(Math.trunc(this.normalizePosition(car.z) / this.segmentLength), 0, this.segments.length - 1);
      if (this.segments[idx].cars.indexOf(car) < 0) {
        this.segments[idx].cars.push(car);
      }
    }
  }

  /** Envia o estado local para os outros jogadores da sala. */
  sendMultiplayerState(dt, finished) {
    const service = this.bluetoothService;
    if (!service) return;
    this.networkTimer += dt;
    if (!finished && this.networkTimer < 0.08) return;
    this.networkTimer = 0;

    service.sendState({
      x: this.player.x,
      position: this.player.position,
      speed: this.player.speed,
      lap: this.state.completedLaps,
      fuel: this.state.fuel,
      carId: this.player.car.id,
      rank: this.state.rank,
      finished: finished,
      playerName: this.localPlayerName,
      playerId: sessaoOnline().localPlayerId
    });
  }

  /** Processa moedas e checkpoints de todos os segmentos cruzados neste frame. */
  handlePassedSegments(fromIndex, toIndex) {
    const self = this;
    const size = this.segments.length;
    const lo = limitar(fromIndex, 0, size - 1);
    const hi = limitar(toIndex, 0, size - 1);

    function process(idx) {
      const seg = self.segments[idx];

      // Checkpoint: devolve tempo uma única vez.
      if (seg.isCheckpoint && !seg.checkpointConsumed) {
        seg.checkpointConsumed = true;
        self.state.timeLeft += TelaDeCorrida.CHECKPOINT_BONUS;
        if (self.sound) self.sound.playCheckpoint();
      }

      // Moedas: coleta se houver sobreposição lateral.
      for (const coin of seg.coins) {
        if (coin.collected) continue;
        if (MathUtils.overlap(self.player.x, 0.8, coin.offset, 0.4, 1)) {
          coin.collected = true;
          self.state.coins += 10;
          self.state.collectedRaceCoins = self.state.coins;
          if (self.sound) self.sound.playCoin();
        }
      }
    }

    if (lo <= hi) {
      for (let idx = lo; idx <= hi; idx++) process(idx);
    } else {
      for (let idx = lo; idx < size; idx++) process(idx);
      for (let idx = 0; idx <= hi; idx++) process(idx);
    }
  }

  spriteCollisionWidth(type) {
    switch (type) {
      case SpriteType.BUSH:
      case SpriteType.BUSH_ROUND:
      case SpriteType.BUSH_LIGHT:
      case SpriteType.BUSH_FLOWER:
      case SpriteType.GRASS_CLUMP:
        return 0.62;
      case SpriteType.TREE_ROUND:
      case SpriteType.TREE:
      case SpriteType.TREE_PINE:
      case SpriteType.TREE_OAK:
      case SpriteType.TREE_BIRCH:
        return 0.56;
      case SpriteType.TREE_PALM:
      case SpriteType.PALM:
      case SpriteType.TREE_CYPRESS:
      case SpriteType.TREE_SNOW:
        return 0.48;
      case SpriteType.CACTUS_DESERT:
      case SpriteType.CACTUS:
        return 0.52;
      case SpriteType.SIGN_CANYON:
      case SpriteType.SIGN_CURVE:
      case SpriteType.SIGN_DIRECTIONAL:
      case SpriteType.SIGN_CHEVRON:
      case SpriteType.SIGN_CHEVRON_HORIZONTAL:
      case SpriteType.SIGN_TURN_RIGHT:
      case SpriteType.SIGN_WARNING:
      case SpriteType.SIGN_BUMP:
      case SpriteType.SIGN_SPEED_LIMIT:
      case SpriteType.SIGN_SLIPPERY:
      case SpriteType.SIGN:
      case SpriteType.NEON_SIGN:
      case SpriteType.PIT_SIGN:
      case SpriteType.GUARDRAIL_SIDE:
        return 0.42;
      default:
        return 0.50;
    }
  }

  isSolidRoadsideObject(type) {
    switch (type) {
      case SpriteType.BUSH:
      case SpriteType.BUSH_ROUND:
      case SpriteType.BUSH_LIGHT:
      case SpriteType.BUSH_FLOWER:
      case SpriteType.GRASS_CLUMP:
      case SpriteType.TREE:
      case SpriteType.TREE_ROUND:
      case SpriteType.TREE_PINE:
      case SpriteType.TREE_PALM:
      case SpriteType.PALM:
      case SpriteType.TREE_OAK:
      case SpriteType.TREE_CYPRESS:
      case SpriteType.TREE_SNOW:
      case SpriteType.TREE_BIRCH:
      case SpriteType.CACTUS:
      case SpriteType.CACTUS_DESERT:
      case SpriteType.SIGN:
      case SpriteType.SIGN_CANYON:
      case SpriteType.SIGN_CURVE:
      case SpriteType.SIGN_DIRECTIONAL:
      case SpriteType.SIGN_CHEVRON:
      case SpriteType.SIGN_CHEVRON_HORIZONTAL:
      case SpriteType.SIGN_TURN_RIGHT:
      case SpriteType.SIGN_WARNING:
      case SpriteType.SIGN_BUMP:
      case SpriteType.SIGN_SPEED_LIMIT:
      case SpriteType.SIGN_SLIPPERY:
      case SpriteType.NEON_SIGN:
      case SpriteType.GUARDRAIL_SIDE:
        return true;
      default:
        return false;
    }
  }

  /** Faz o portal e os objetos laterais reagirem como objetos sólidos. */
  checkWorldObjectCollisions(playerSegIndex) {
    if (this.state.ghostModeTimer > 0) return;
    if (this.collisionCooldown > 0) return;
    const size = this.segments.length;

    for (let d = 0; d <= 2; d++) {
      const idx = (playerSegIndex + d) % size;
      const seg = this.segments[idx];

      for (const sp of seg.sprites) {
        if (sp.type === SpriteType.PORTAL) {
          // Portal/placa do box não colide com o carro.
          // Ele é apenas visual e deve dar sensação de passagem.
          continue;
        }

        if (!this.isSolidRoadsideObject(sp.type)) continue;
        // Só colide quando o jogador realmente sai da pista em direção ao cenário.
        if (Math.abs(this.player.x) < 0.96) continue;

        const objX = limitar(sp.offset, -2.05, 2.05);
        const objW = this.spriteCollisionWidth(sp.type);
        if (MathUtils.overlap(this.player.x, 0.46, objX, objW, 1.0)) {
          this.player.applyCollision(this.player.speed * 0.26);
          this.player.x = (this.player.x < objX) ? this.player.x - 0.12 : this.player.x + 0.12;
          this.collisionCooldown = 0.55;
          if (this.sound) this.sound.playCrash();
          this.onCollision();
          this.speakAsPlayer(SpeechBank.nextPlayerCrash(this.usedPlayerSpeechIds));
          this.emitDustBehind(this.stage.grassDark);
          return;
        }
      }
    }
  }

  /** Avança um carro/posição por até 500 metros sem quebrar o loop da pista. */
  boostWorldPosition(z, completedLaps, boostWorld) {
    if (this.trackLength <= 0) return { first: z, second: completedLaps };
    let nz = z + boostWorld;
    let laps = completedLaps;
    while (nz >= this.trackLength) {
      nz -= this.trackLength;
      laps += 1;
    }
    return { first: nz, second: laps };
  }

  /** Impulso recebido quando alguém bate na traseira do jogador. */
  applyRearImpulseToPlayer() {
    const fiftyKmhSpeed = this.player.maxSpeed * (50 / this.player.cruiseDisplayKmh());
    const stoppedByFuel = this.state.fuel <= 0.005 && this.player.speed < fiftyKmhSpeed * 0.70;

    if (stoppedByFuel) {
      // V62: resgate sem gasolina. Em vez de só mexer alguns milímetros,
      // o impacto engata um embalo de carro em neutro, fluido, por alguns
      // segundos. O carro anda vários metros até tentar alcançar o pitstop.
      this.fuelRescueRollTimer = Math.max(this.fuelRescueRollTimer, 3.8);
      const neutralKickSpeed = this.player.maxSpeed * (92 / this.player.cruiseDisplayKmh());
      this.player.speed = Math.min(Math.max(this.player.speed, neutralKickSpeed), this.player.maxSpeed * 0.30);

      // Pequeno empurrão imediato só para o jogador perceber o impacto.
      // O restante do movimento vem da velocidade, não de teleporte.
      const nudgeWorld = this.segmentLength * 0.28;
      const remainingWorld = Math.max(0, (this.state.totalLaps - this.state.completedLaps) * this.trackLength - this.player.position - 1);
      const boosted = this.boostWorldPosition(this.player.position, this.state.completedLaps, Math.min(nudgeWorld, remainingWorld));
      this.player.position = boosted.first;
      this.state.completedLaps = Math.min(boosted.second, this.state.totalLaps);

      this.player.collisionFlash = 0.45;
      this.positionFlashLabel = "EMPURRÃO!";
      this.positionFlashTimer = 0.65;
      return;
    }

    // Colisão normal: mantém o comportamento curto, sem teleporte exagerado.
    const boostWorld = this.segmentLength * 1.65;
    const remainingWorld = Math.max(0, (this.state.totalLaps - this.state.completedLaps) * this.trackLength - this.player.position - 1);
    const appliedBoost = Math.min(boostWorld, remainingWorld);
    const boosted = this.boostWorldPosition(this.player.position, this.state.completedLaps, appliedBoost);
    this.player.position = boosted.first;
    this.state.completedLaps = Math.min(boosted.second, this.state.totalLaps);

    const cap = this.player.maxSpeed * (this.player.turboActive ? 1.38 : 1.18);
    this.player.speed = Math.min(this.player.speed * 1.12, cap);
    this.player.collisionFlash = 0.45;
    this.positionFlashLabel = "IMPULSO!";
    this.positionFlashTimer = 0.55;
  }

  /** Impulso recebido por um adversário quando o jogador bate na traseira dele. */
  applyRearImpulseToEnemy(car) {
    // Empurra o adversário só alguns metros/segmentos para frente.
    // Assim ele sofre o impacto, acelera e continua aparecendo na pista;
    // ele só sai da tela quando o jogador ultrapassa completamente.
    const pushWorld = this.segmentLength * 2.15;
    const boosted = this.boostWorldPosition(car.z, car.completedLaps, pushWorld);
    car.z = boosted.first;
    car.completedLaps = boosted.second;
    const minKick = this.baseMaxSpeed * 0.48;
    car.speed = Math.min(Math.max(car.speed * 1.12, minKick), this.baseMaxSpeed * 1.24);
    car.preferredLane = limitar(car.offset + (this.player.x <= car.offset ? 0.18 : -0.18), -0.96, 0.96);
    car.laneDecisionTimer = 0.18;
  }

  /**
   * V61: se o jogador ficar sem combustível e parado, um bot próximo pode dar
   * um empurrão curto. Isso ajuda o carro a andar alguns metros até alcançar
   * o pitstop, sem virar teleporte e sem ficar acontecendo toda hora.
   */
  guideBotsToPushWhenOutOfFuel(dt) {
    if (this.bluetoothService) return;
    if (this.state.fuel > 0.005 || this.state.inPitStop) return;
    if (this.traffic.length === 0) return;

    const slowLimit = this.player.maxSpeed * 0.16;
    if (this.player.speed > slowLimit) return;

    const pz = this.normalizePosition(this.player.position + this.playerZ);
    let best = null;
    let bestGap = Number.MAX_VALUE;
    for (const car of this.traffic) {
      const gap = this.forwardDistance(car.z, pz);
      if (gap > 0 && gap < 12 * this.segmentLength && gap < bestGap) {
        best = car;
        bestGap = gap;
      }
    }

    const helper = best;
    if (!helper) return;
    helper.preferredLane = limitar(this.player.x, -0.86, 0.86);
    helper.offset += (helper.preferredLane - helper.offset) * limitar(dt * 3.4, 0, 1);
    helper.speed = Math.max(helper.speed, this.player.maxSpeed * 0.58);

    if (this.fuelRescueCooldown <= 0 && bestGap < this.segmentLength * 1.05 && Math.abs(helper.offset - this.player.x) < 0.54) {
      this.applyRearImpulseToPlayer();
      helper.speed = Math.max(helper.speed * 0.44, this.baseMaxSpeed * 0.12);
      helper.z = this.normalizePosition(pz - this.segmentLength * 0.82);
      this.fuelRescueCooldown = 1.75;
      this.collisionCooldown = 0.18;
      if (this.sound) this.sound.playCrash();
      this.speakAsPlayer(SpeechBank.nextPlayerCrash(this.usedPlayerSpeechIds));
      this.emitDustBehind(Cor.rgb(0xAA, 0xAA, 0xAA));
    }
  }

  /** Colisão traseira entre jogador e carros adversários próximos. */
  checkCarCollisions(playerSegIndex) {
    if (this.state.ghostModeTimer > 0) return;
    if (this.collisionCooldown > 0) return;
    const size = this.segments.length;
    const pz = this.normalizePosition(this.player.position + this.playerZ);

    // Verifica o segmento do jogador, próximos e anteriores, usando módulo por ser loop.
    // Assim funciona tanto quando o jogador bate na traseira de alguém quanto
    // quando um adversário acerta a traseira do jogador.
    for (let d = -2; d <= 2; d++) {
      const idx = (((playerSegIndex + d) % size) + size) % size;
      for (const car of this.segments[idx].cars) {
        const gapAhead = this.forwardDistance(pz, car.z);   // adversário logo à frente do jogador
        const gapBehind = this.forwardDistance(car.z, pz);  // jogador logo à frente do adversário
        const rescueMode = this.state.fuel <= 0.005 && this.player.speed < this.player.maxSpeed * 0.18;
        const centeredRearContact = MathUtils.overlap(this.player.x, rescueMode ? 0.30 : 0.14, car.offset, rescueMode ? 0.28 : 0.13, 1.0);
        if (!centeredRearContact) continue;

        // Jogador bate atrás do adversário: adversário recebe o impulso.
        if (gapAhead <= this.segmentLength * 0.30 && this.player.speed > car.speed * 0.92) {
          this.applyRearImpulseToEnemy(car);
          this.player.applyCollision(this.player.speed * 0.42);
          this.player.x += (this.player.x < car.offset) ? -0.12 : 0.12;
          this.collisionCooldown = rescueMode ? 0.72 : 0.36;
          if (this.sound) this.sound.playCrash();
          this.onCollision();
          this.speakAsPlayer(SpeechBank.nextPlayerCrash(this.usedPlayerSpeechIds));
          this.emitDustBehind(Cor.rgb(0x88, 0x88, 0x88));
          return;
        }

        // Adversário bate atrás do jogador: jogador recebe o impulso e o adversário perde velocidade.
        if (gapBehind <= this.segmentLength * (rescueMode ? 0.52 : 0.30) && car.speed > this.player.speed * 0.80) {
          this.applyRearImpulseToPlayer();
          car.speed = Math.max(car.speed * 0.38, this.baseMaxSpeed * 0.10);
          car.offset += (car.offset < this.player.x) ? -0.16 : 0.16;
          this.collisionCooldown = rescueMode ? 0.72 : 0.36;
          if (this.sound) this.sound.playCrash();
          this.onCollision();
          this.speakAsPlayer(SpeechBank.nextPlayerCrash(this.usedPlayerSpeechIds));
          this.emitDustBehind(Cor.rgb(0xAA, 0xAA, 0xAA));
          return;
        }
      }
    }
  }

  buildStandings() {
    const entries = [];

    const localTotal = this.state.completedLaps * this.trackLength + this.player.position;
    entries.push({ nome: this.localPlayerName, total: localTotal, local: true, remoto: false });

    if (!this.bluetoothService) {
      for (const car of this.traffic) {
        const total = car.completedLaps * this.trackLength + car.z;
        entries.push({ nome: car.driverName, total: total, local: false, remoto: false });
      }
    }

    for (const [id, car] of this.remoteCars) {
      const total = car.completedLaps * this.trackLength + car.z;
      const name = this.remotePlayerNames.get(id) || "Jogador";
      entries.push({ nome: name, total: total, local: false, remoto: true });
    }

    entries.sort(function (a, b) { return b.total - a.total; });
    return entries.map(function (item, index) {
      return new PlayerStanding(index + 1, item.nome, item.local, item.remoto);
    });
  }

  updateRankAndOvertakes(showNotice) {
    const mostrar = (showNotice === undefined) ? true : showNotice;
    const oldRank = limitar(this.state.rank, 1, this.state.totalRacers);
    const playerTotal = this.state.completedLaps * this.trackLength + this.player.position;

    let ahead = 0;
    if (!this.bluetoothService) {
      for (const car of this.traffic) {
        const carTotal = car.completedLaps * this.trackLength + car.z;
        if (carTotal > playerTotal) ahead++;
      }
    }

    for (const car of this.remoteCars.values()) {
      const carTotal = car.completedLaps * this.trackLength + car.z;
      if (carTotal > playerTotal) ahead++;
    }

    const newRank = limitar(1 + ahead, 1, this.state.totalRacers);
    this.state.rank = newRank;

    // Agora a ultrapassagem é detectada pela melhora real da posição.
    // Se sair de 8º para 7º, mostra 7º LUGAR. Se ganhar duas posições,
    // mostra a nova posição e conta duas ultrapassagens.
    if (mostrar && this.state.phase === GamePhase.RUNNING && this.state.elapsed > 0.35 && newRank < oldRank) {
      const gained = oldRank - newRank;
      this.state.overtakes += gained;
      this.positionFlashLabel = newRank + "º LUGAR";
      this.positionFlashTimer = 0.5;
      this.lastRankForNotice = newRank;
      if (this.sound) this.sound.playOvertake();
      if (MathUtils.randomInt(0, 100) < 32) this.speakAsPlayer(SpeechBank.nextPlayerOvertake(this.usedPlayerSpeechIds));
    } else if (!mostrar) {
      this.lastRankForNotice = newRank;
    }
  }

  isTop5Qualified() {
    return this.state.rank >= 1 && this.state.rank <= 5;
  }

  applyFinishCoinRewards(finalRank) {
    if (this.state.finishRewardApplied) return;

    const collected = Math.max(0, this.state.coins);
    let positionBonus;
    switch (finalRank) {
      case 1: positionBonus = 1000; break;
      case 2: positionBonus = 900; break;
      case 3: positionBonus = 800; break;
      case 4: positionBonus = 700; break;
      case 5: positionBonus = 600; break;
      default: positionBonus = 0; break;
    }
    const fuelBlocks = limitar(Math.trunc(Math.ceil(limitar(this.state.fuel, 0, 1) * 12)), 0, 12);
    const fuelBonus = fuelBlocks * 100;
    const overtakeBonus = Math.max(0, this.state.overtakes) * 50;

    this.state.collectedRaceCoins = collected;
    this.state.positionBonusCoins = positionBonus;
    this.state.fuelBlocksRemaining = fuelBlocks;
    this.state.fuelBonusCoins = fuelBonus;
    this.state.overtakeBonusCoins = overtakeBonus;
    this.state.totalRewardCoins = positionBonus + fuelBonus + overtakeBonus;
    this.state.coins = collected + this.state.totalRewardCoins;
    this.state.rewardAnimTime = 0;
    this.state.finishRewardApplied = true;
  }

  finishRace(won, outcome) {
    if (this.resultReported) return;

    // Trava definitiva: só é vitória quando a posição FINAL está no TOP 5.
    const finalRank = limitar(this.state.rank, 1, this.state.totalRacers);
    const qualified = won && finalRank <= 5;

    if (qualified) this.state.outcome = RaceOutcome.QUALIFIED;
    else if (outcome === RaceOutcome.QUALIFIED) this.state.outcome = RaceOutcome.NOT_TOP_5;
    else this.state.outcome = outcome;
    this.state.phase = qualified ? GamePhase.WON : GamePhase.LOST;

    this.applyFinishCoinRewards(finalRank);

    if (qualified) {
      // Bônus de tempo restante na pontuação final.
      this.state.score += Math.trunc(this.state.timeLeft * 10);
    }
    // Pontuação também considera a premiação final de moedas.
    this.state.score += Math.trunc(this.state.totalRewardCoins / 2);
    this.state.newRecord = this.save.submitScore(this.stageIndex, this.state.score);
    this.sendMultiplayerState(1, true);
    if (this.sound) this.sound.stopEngine();
    this.resultReported = true;

    // Quem recebe só vê won=true quando foi TOP 5.
    this.onRaceResult(this.stageIndex, qualified, this.state.score, this.state.coins);
  }

  // ---- Partículas posicionadas atrás do carro (em coordenadas de tela) ----

  emitTurboBehind() {
    const scale = this.surfaceW / 1080;
    const cx = this.surfaceW / 2 + this.player.x * 6;
    const cy = this.surfaceH - this.surfaceH * 0.04;
    this.particles.emitTurbo(cx, cy, scale);
  }

  emitDustBehind(color) {
    const scale = this.surfaceW / 1080;
    const cx = this.surfaceW / 2 + this.player.x * 6;
    const cy = this.surfaceH - this.surfaceH * 0.05;
    this.particles.emitDust(cx, cy, scale, color);
  }

  // =================== DESENHO (chamado pelo laço) ===================

  render(ctx) {
    // Limpa a tela inteira a cada frame. No Android era canvas.drawColor com
    // PorterDuff.SRC porque a SurfaceView reaproveitava buffers; aqui é o
    // mesmo efeito com um retângulo preto opaco.
    ctx.fillStyle = Cor.css(Cor.BLACK);
    ctx.fillRect(0, 0, this.surfaceW, this.surfaceH);

    if (!this.ready) return;
    const size = this.segments.length;

    // Pontos de referência da câmera.
    const basePos = this.normalizePosition(this.player.position);
    const baseIndex = limitar(Math.trunc(basePos / this.segmentLength), 0, size - 1);
    const basePercent = MathUtils.percentRemaining(basePos, this.segmentLength);

    const probePos = this.normalizePosition(this.player.position + this.playerZ);
    const playerSegIndex = limitar(Math.trunc(probePos / this.segmentLength), 0, size - 1);
    const playerPercent = MathUtils.percentRemaining(probePos, this.segmentLength);
    const playerSeg = this.segments[playerSegIndex];
    const playerY = MathUtils.interpolate(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent);
    const slopeNow = (playerSeg.p2.world.y - playerSeg.p1.world.y) / this.segmentLength;
    const cameraDramaY = playerY - slopeNow * 150 - limitar(Math.abs(this.player.speed) / this.player.maxSpeed, 0, 1) * 50 - Math.abs(this.player.visualSteer) * 10;

    // V64: pequena tremida de câmera durante a contagem e na largada.
    let shakePower;
    if (this.countdownGoFlashTimer > 0 || this.launchTurboFxTimer > 0) shakePower = this.surfaceH * 0.0085;
    else if (this.countdownShakeTimer > 0) shakePower = this.surfaceH * 0.0038;
    else shakePower = 0;
    let shakeFade;
    if (this.countdownGoFlashTimer > 0) shakeFade = limitar(this.countdownGoFlashTimer / 0.26, 0, 1);
    else if (this.launchTurboFxTimer > 0) shakeFade = limitar(this.launchTurboFxTimer / 1.05, 0, 1);
    else if (this.countdownShakeTimer > 0) shakeFade = limitar(this.countdownShakeTimer / 0.14, 0, 1);
    else shakeFade = 0;
    const shakeX = Math.sin(this.animTime * 97) * shakePower * shakeFade;
    const shakeY = Math.cos(this.animTime * 131) * shakePower * 0.75 * shakeFade;

    ctx.save();
    if (shakePower > 0) ctx.translate(shakeX, shakeY);

    // Mundo + carro do jogador.
    this.renderer.render(ctx, this.segments, this.stage, this.player, baseIndex, basePercent, cameraDramaY, this.bgOffset, this.animTime, this.headlightsOn);

    // Partículas por cima.
    this.particles.draw(ctx);

    // HUD e telas sobrepostas.
    const raceItemAvailable = this.availableRaceUpgradeIds().length > 0;
    this.hud.draw(
      ctx,
      this.state,
      this.player,
      this.headlightsOn,
      this.isDarkStage(),
      this.controls,
      this.pitBoostButtonAvailable(),
      this.freezeRivalsButtonAvailable(),
      this.ghostModeButtonAvailable(),
      this.selectedRaceUpgradeLabel(),
      raceItemAvailable
    );
    if (this.state.phase === GamePhase.RUNNING) {
      // V61: minimapa e lista voltaram menores e em áreas reservadas,
      // sem cobrir o relógio, velocímetro, tanque ou botões.
      const mapCars = this.bluetoothService ? Array.from(this.remoteCars.values()) : this.traffic;
      this.hud.drawCircuitMap(ctx, this.stage, this.state, this.normalizePosition(this.player.position), this.currentLeaderPosition(), this.currentLeaderIsPlayer(), this.trackLength, mapCars);
      this.hud.drawPlayerList(ctx, this.buildStandings());
      this.hud.drawPlayerSpeech(ctx, this.playerSpeechText, this.playerSpeechTimer);
      this.hud.drawPositionFlash(ctx, this.positionFlashLabel, this.positionFlashTimer / 0.5);
    }
    switch (this.state.phase) {
      case GamePhase.TUTORIAL: this.hud.drawTutorial(ctx); break;
      case GamePhase.COUNTDOWN: this.hud.drawCountdown(ctx, this.state.countdown); break;
      case GamePhase.PAUSED: this.hud.drawPaused(ctx, this.save ? this.save.musicEnabled : true); break;
      case GamePhase.WON: this.hud.drawResult(ctx, this.state, true, this.hasNextStage()); break;
      case GamePhase.LOST: this.hud.drawResult(ctx, this.state, false, false); break;
      default: break;
    }
    ctx.restore();

    // V64: explosão de brilho no "Vai!" e começo da arrancada.
    let flashAlpha;
    if (this.countdownGoFlashTimer > 0) flashAlpha = limitar(Math.trunc(255 * (this.countdownGoFlashTimer / 0.26)), 0, 255);
    else if (this.launchTurboFxTimer > 0.82) flashAlpha = limitar(Math.trunc(120 * ((this.launchTurboFxTimer - 0.82) / 0.23)), 0, 120);
    else flashAlpha = 0;
    if (flashAlpha > 0) {
      ctx.fillStyle = Cor.css(Cor.argb(flashAlpha, 255, 255, 255));
      ctx.fillRect(0, 0, this.surfaceW, this.surfaceH);
    }
  }

  currentLeaderTotal() {
    let best = this.state.completedLaps * this.trackLength + this.player.position;
    for (const car of this.traffic) {
      const total = car.completedLaps * this.trackLength + car.z;
      if (total > best) best = total;
    }
    for (const car of this.remoteCars.values()) {
      const total = car.completedLaps * this.trackLength + car.z;
      if (total > best) best = total;
    }
    return best;
  }

  currentLeaderPosition() {
    const best = this.currentLeaderTotal();
    return ((best % this.trackLength) + this.trackLength) % this.trackLength;
  }

  currentLeaderIsPlayer() {
    const playerTotal = this.state.completedLaps * this.trackLength + this.player.position;
    return playerTotal >= this.currentLeaderTotal() - 0.5;
  }

  pitBoostButtonAvailable() {
    return !!this.save && this.pitBoostItemArmed && !this.state.specialPitUsed && this.save.pitBoostItems > 0;
  }

  usePitBoostButton() {
    if (!this.pitBoostButtonAvailable()) return false;

    if (this.state.fuel >= 0.985) {
      this.positionFlashLabel = "TANQUE CHEIO";
      this.positionFlashTimer = 0.55;
      return true;
    }

    if (this.save.consumePitBoostItem()) {
      this.state.specialPitUsed = true;
      this.pitBoostItemArmed = false;
      this.state.fuel = 1;
      this.state.emptyFuelTimer = 0;
      this.fuelRescueCooldown = 0;
      this.fuelRescueRollTimer = 0;
      this.positionFlashLabel = "GASOLINA CHEIA!";
      this.positionFlashTimer = 0.95;
      if (this.sound) this.sound.playCheckpoint();
      return true;
    } else {
      this.pitBoostItemArmed = false;
      this.positionFlashLabel = "SEM GAS+";
      this.positionFlashTimer = 0.55;
      return true;
    }
  }

  freezeRivalsButtonAvailable() {
    return !!this.save && this.freezeRivalsItemArmed && !this.state.freezeRivalsUsed && this.save.freezeRivalsItems > 0;
  }

  useFreezeRivalsButton() {
    if (!this.freezeRivalsButtonAvailable()) return false;
    if (this.save.consumeFreezeRivalsItem()) {
      this.state.freezeRivalsUsed = true;
      this.freezeRivalsItemArmed = false;
      this.state.freezeRivalsTimer = 6.0;
      this.positionFlashLabel = "RIVAIS CONGELADOS!";
      this.positionFlashTimer = 1.05;
      if (this.sound) this.sound.playCheckpoint();
      return true;
    } else {
      this.freezeRivalsItemArmed = false;
      this.positionFlashLabel = "SEM GELO";
      this.positionFlashTimer = 0.55;
      return true;
    }
  }

  ghostModeButtonAvailable() {
    return !!this.save && this.ghostModeItemArmed && !this.state.ghostModeUsed && this.save.ghostModeItems > 0;
  }

  useGhostModeButton() {
    if (!this.ghostModeButtonAvailable()) return false;
    if (this.save.consumeGhostModeItem()) {
      this.state.ghostModeUsed = true;
      this.ghostModeItemArmed = false;
      this.state.ghostModeTimer = 10.0;
      this.player.ghostMode = true;
      this.collisionCooldown = 0;
      this.positionFlashLabel = "MODO FANTASMA!";
      this.positionFlashTimer = 1.05;
      if (this.sound) this.sound.playCheckpoint();
      return true;
    } else {
      this.ghostModeItemArmed = false;
      this.positionFlashLabel = "SEM FANTASMA";
      this.positionFlashTimer = 0.55;
      return true;
    }
  }

  explodeRivalsButtonAvailable() {
    return !!this.save && this.explodeRivalsItemArmed && !this.state.explodeRivalsUsed && this.save.explodeRivalsItems > 0;
  }

  useExplodeRivalsButton() {
    if (!this.explodeRivalsButtonAvailable()) return false;
    if (this.save.consumeExplodeRivalsItem()) {
      this.state.explodeRivalsUsed = true;
      this.explodeRivalsItemArmed = false;
      this.state.explodeRivalsTimer = 5.0;
      for (const car of this.traffic) {
        car.speed = 0;
        car.aiTurboTimer = 0;
        car.tauntText = "BOOM!";
        car.tauntTimer = 1.4;
      }
      this.positionFlashLabel = "BOOM! RIVAIS PARADOS!";
      this.positionFlashTimer = 1.05;
      this.speakAsPlayer(SpeechBank.nextPlayerItem(this.usedPlayerSpeechIds, "Bomba"));
      if (this.sound) this.sound.playCrash();
      return true;
    } else {
      this.explodeRivalsItemArmed = false;
      this.positionFlashLabel = "SEM BOMBA";
      this.positionFlashTimer = 0.55;
      return true;
    }
  }

  availableRaceUpgradeIds() {
    const ids = [];
    if (this.pitBoostButtonAvailable()) ids.push("gas");
    if (this.freezeRivalsButtonAvailable()) ids.push("freeze");
    if (this.ghostModeButtonAvailable()) ids.push("ghost");
    if (this.explodeRivalsButtonAvailable()) ids.push("bomb");
    return ids;
  }

  raceUpgradeLabel(id) {
    switch (id) {
      case "gas": return "GAS+";
      case "freeze": return "GELO";
      case "ghost": return "FANTASMA";
      case "bomb": return "BOMBA";
      default: return "UPGRADE";
    }
  }

  selectedRaceUpgradeLabel() {
    const ids = this.availableRaceUpgradeIds();
    if (ids.length === 0) return "SEM ITEM";
    this.selectedRaceUpgradeIndex = limitar(this.selectedRaceUpgradeIndex, 0, ids.length - 1);
    return this.raceUpgradeLabel(ids[this.selectedRaceUpgradeIndex]);
  }

  cycleSelectedRaceUpgrade() {
    const ids = this.availableRaceUpgradeIds();
    if (ids.length === 0) {
      this.positionFlashLabel = "SEM UPGRADE";
      this.positionFlashTimer = 0.55;
      return true;
    }
    this.selectedRaceUpgradeIndex = (this.selectedRaceUpgradeIndex + 1) % ids.length;
    this.positionFlashLabel = "ITEM: " + this.raceUpgradeLabel(ids[this.selectedRaceUpgradeIndex]);
    this.positionFlashTimer = 0.55;
    return true;
  }

  activateSelectedRaceUpgrade() {
    const ids = this.availableRaceUpgradeIds();
    if (ids.length === 0) {
      this.positionFlashLabel = "SEM UPGRADE";
      this.positionFlashTimer = 0.55;
      return true;
    }
    this.selectedRaceUpgradeIndex = limitar(this.selectedRaceUpgradeIndex, 0, ids.length - 1);
    switch (ids[this.selectedRaceUpgradeIndex]) {
      case "gas": return this.usePitBoostButton();
      case "freeze": return this.useFreezeRivalsButton();
      case "ghost": return this.useGhostModeButton();
      case "bomb": return this.useExplodeRivalsButton();
      default: return false;
    }
  }

  ghostModeTouchRect() {
    if (this.pitBoostButtonAvailable() && this.freezeRivalsButtonAvailable()) return this.hud.ghostModeBtn;
    if (this.pitBoostButtonAvailable() || this.freezeRivalsButtonAvailable()) return this.hud.freezeRivalsBtn;
    return this.hud.pitBoostBtn;
  }

  hasNextStage() {
    return this.stageIndex + 1 < StageCatalog.count();
  }

  // =================== TOQUE ===================

  activateTurboFromInput() {
    if (!this.player) return false;
    if (this.player.activateTurbo()) {
      if (this.sound) this.sound.playTurbo();
      this.turboVibrationPulseTimer = 0;
      this.pulseTurboVibration();
      this.positionFlashLabel = "TURBO!";
      this.positionFlashTimer = 0.35;
      this.turboReadyAnnounced = false;
      this.speakAsPlayer(SpeechBank.nextPlayerItem(this.usedPlayerSpeechIds, "Turbo"), false);
      return true;
    }
    return false;
  }

  togglePauseFromInput() {
    if (!this.state) return false;
    if (this.state.phase === GamePhase.RUNNING) {
      this.state.phase = GamePhase.PAUSED;
      this.controls.reset();
      this.clearGamepadHoldState();
      if (this.sound) { this.sound.stopEngine(); this.sound.pauseAll(); }
      return true;
    }
    if (this.state.phase === GamePhase.PAUSED) {
      if (this.sound) { this.sound.resumeAll(); this.sound.startEngine(); }
      this.state.phase = GamePhase.RUNNING;
      return true;
    }
    return false;
  }

  clearGamepadHoldState() {
    this.gamepadLeft = false;
    this.gamepadRight = false;
    this.gamepadAccel = false;
    this.gamepadBrake = false;
    this.gamepadAxisX = 0;
    this.gamepadGasAxis = 0;
    this.gamepadBrakeAxis = 0;
  }

  applyGamepadToControls() {
    if (!this.save || !this.save.gamepadEnabled) return;
    if (this.gamepadLeft || this.gamepadAxisX < -0.25) this.controls.left = true;
    if (this.gamepadRight || this.gamepadAxisX > 0.25) this.controls.right = true;
    if (this.gamepadAccel || this.gamepadGasAxis > 0.18) this.controls.accelerate = true;
    if (this.gamepadBrake || this.gamepadBrakeAxis > 0.18) this.controls.brake = true;
  }

  /**
   * Teclado do computador no lugar do KeyEvent do Android. As teclas vêm de
   * save.getKeyboardKey(acao), que devolve um KeyboardEvent.code.
   */
  handleGamepadKeyEvent(event) {
    if (!this.save || !this.save.gamepadEnabled) return false;
    const keyCode = event.code;
    const isDown = event.type === "keydown";
    const isUp = event.type === "keyup";
    if (!isDown && !isUp) return false;

    const self = this;
    function mapped(action) { return keyCode === self.save.getKeyboardKey(action); }
    let consumed = false;

    if (mapped(SaveManager.GAMEPAD_LEFT) || keyCode === "ArrowLeft") {
      this.gamepadLeft = isDown;
      if (isUp && this.gamepadAxisX >= -0.25) this.controls.left = false;
      consumed = true;
    } else if (mapped(SaveManager.GAMEPAD_RIGHT) || keyCode === "ArrowRight") {
      this.gamepadRight = isDown;
      if (isUp && this.gamepadAxisX <= 0.25) this.controls.right = false;
      consumed = true;
    } else if (mapped(SaveManager.GAMEPAD_ACCEL)) {
      this.gamepadAccel = isDown;
      if (isUp && this.gamepadGasAxis <= 0.18 && this.save.controlType === SaveManager.CONTROL_BUTTONS) {
        this.controls.accelerate = false;
      }
      consumed = true;
    } else if (mapped(SaveManager.GAMEPAD_BRAKE)) {
      this.gamepadBrake = isDown;
      if (isUp && this.gamepadBrakeAxis <= 0.18) this.controls.brake = false;
      consumed = true;
    }

    // event.repeat faz o papel do repeatCount == 0 do Android.
    if (isDown && !event.repeat) {
      if (mapped(SaveManager.GAMEPAD_TURBO)) {
        consumed = true;
        if (this.state && this.state.phase === GamePhase.RUNNING) this.activateTurboFromInput();
      } else if (mapped(SaveManager.GAMEPAD_HEADLIGHT)) {
        consumed = true;
        if (this.state && this.state.phase === GamePhase.RUNNING) this.headlightsOn = !this.headlightsOn;
      } else if (mapped(SaveManager.GAMEPAD_GAS_PLUS)) {
        consumed = true;
        if (this.state && this.state.phase === GamePhase.RUNNING) this.usePitBoostButton();
      } else if (mapped(SaveManager.GAMEPAD_FREEZE)) {
        consumed = true;
        if (this.state && this.state.phase === GamePhase.RUNNING) this.useFreezeRivalsButton();
      } else if (mapped(SaveManager.GAMEPAD_GHOST)) {
        consumed = true;
        if (this.state && this.state.phase === GamePhase.RUNNING) this.useGhostModeButton();
      } else if (mapped(SaveManager.GAMEPAD_UPGRADE_NEXT)) {
        consumed = true;
        if (this.state && this.state.phase === GamePhase.RUNNING) this.cycleSelectedRaceUpgrade();
      } else if (mapped(SaveManager.GAMEPAD_UPGRADE_USE)) {
        consumed = true;
        if (this.state && this.state.phase === GamePhase.RUNNING) this.activateSelectedRaceUpgrade();
      } else if (mapped(SaveManager.GAMEPAD_PAUSE) || mapped(SaveManager.GAMEPAD_SELECT)) {
        consumed = true;
        this.togglePauseFromInput();
      }
    }
    return consumed;
  }

  /**
   * Leitura do controle externo pela Gamepad API. No Android isso chegava como
   * MotionEvent de joystick; aqui não existe evento, então lemos uma vez por
   * quadro dentro do laço.
   */
  handleGamepadMotionEvent() {
    if (!this.save || !this.save.gamepadEnabled) return false;
    if (typeof navigator === "undefined" || !navigator.getGamepads) return false;

    let pad = null;
    const lista = navigator.getGamepads();
    for (let i = 0; i < lista.length; i++) {
      if (lista[i] && lista[i].connected) { pad = lista[i]; break; }
    }
    if (!pad) {
      this.gamepadAxisX = 0;
      this.gamepadGasAxis = 0;
      this.gamepadBrakeAxis = 0;
      this.gamepadActionWasDown = Object.create(null);
      return false;
    }

    function axis(valor) {
      const v = valor || 0;
      return (Math.abs(v) < 0.12) ? 0 : limitar(v, -1, 1);
    }
    function botao(indice) {
      const b = pad.buttons[indice];
      if (!b) return 0;
      const v = (typeof b === "object") ? b.value : b;
      return (Math.abs(v) < 0.12) ? 0 : limitar(v, 0, 1);
    }
    function pressionado(indice) {
      const b = pad.buttons[indice];
      return !!b && (typeof b === "object" ? b.pressed : b > 0.5);
    }
    const self = this;
    function indiceDaAcao(acao) { return self.save.getGamepadButton(acao); }
    function valorDaAcao(acao) { return botao(indiceDaAcao(acao)); }
    function acaoPressionada(acao) { return pressionado(indiceDaAcao(acao)); }
    function acabouDeApertar(acao) {
      const agora = acaoPressionada(acao);
      const antes = !!self.gamepadActionWasDown[acao];
      self.gamepadActionWasDown[acao] = agora;
      return agora && !antes;
    }

    // Analogico esquerdo sempre funciona. Se estiver parado, usa os botoes
    // escolhidos para esquerda/direita (D-Pad no mapeamento padrao).
    const analogico = axis(pad.axes[0]);
    this.gamepadAxisX = (Math.abs(analogico) >= 0.12)
      ? analogico
      : ((acaoPressionada(SaveManager.GAMEPAD_LEFT) ? -1 : 0) +
        (acaoPressionada(SaveManager.GAMEPAD_RIGHT) ? 1 : 0));
    this.gamepadGasAxis = valorDaAcao(SaveManager.GAMEPAD_ACCEL);
    this.gamepadBrakeAxis = valorDaAcao(SaveManager.GAMEPAD_BRAKE);

    // V81: ao soltar analógico/gatilho, limpa imediatamente o comando.
    // Antes o último estado podia ficar preso até outro toque acontecer.
    if (!this.gamepadLeft && this.gamepadAxisX >= -0.25) this.controls.left = false;
    if (!this.gamepadRight && this.gamepadAxisX <= 0.25) this.controls.right = false;
    if (!this.gamepadAccel && this.gamepadGasAxis <= 0.18 && this.save.controlType === SaveManager.CONTROL_BUTTONS) {
      this.controls.accelerate = false;
    }
    if (!this.gamepadBrake && this.gamepadBrakeAxis <= 0.18) this.controls.brake = false;

    // As treze acoes seguem o mapeamento escolhido em Configuracoes.
    if (acabouDeApertar(SaveManager.GAMEPAD_TURBO) && this.state && this.state.phase === GamePhase.RUNNING) {
      this.activateTurboFromInput();
    }
    if (acabouDeApertar(SaveManager.GAMEPAD_HEADLIGHT) && this.state && this.state.phase === GamePhase.RUNNING) {
      this.headlightsOn = !this.headlightsOn;
    }
    if (acabouDeApertar(SaveManager.GAMEPAD_GAS_PLUS) && this.state && this.state.phase === GamePhase.RUNNING) {
      this.usePitBoostButton();
    }
    if (acabouDeApertar(SaveManager.GAMEPAD_FREEZE) && this.state && this.state.phase === GamePhase.RUNNING) {
      this.useFreezeRivalsButton();
    }
    if (acabouDeApertar(SaveManager.GAMEPAD_GHOST) && this.state && this.state.phase === GamePhase.RUNNING) {
      this.useGhostModeButton();
    }
    if (acabouDeApertar(SaveManager.GAMEPAD_UPGRADE_NEXT) && this.state && this.state.phase === GamePhase.RUNNING) {
      this.cycleSelectedRaceUpgrade();
    }
    if (acabouDeApertar(SaveManager.GAMEPAD_UPGRADE_USE) && this.state && this.state.phase === GamePhase.RUNNING) {
      this.activateSelectedRaceUpgrade();
    }
    const pauseNovo = acabouDeApertar(SaveManager.GAMEPAD_PAUSE);
    const selectNovo = acabouDeApertar(SaveManager.GAMEPAD_SELECT);
    if (pauseNovo || selectNovo) this.togglePauseFromInput();

    return true;
  }

  pulseTurboVibration() {
    if (!this.save || !this.save.vibrationEnabled) return;
    try {
      // V73: vibração mais leve, sem usar intensidade máxima.
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(28);
    } catch (e) {
      /* ignora */
    }
  }

  // ---- Pointer Events: substituem o MotionEvent multi-toque ----

  _instalarEntrada() {
    if (!this.canvas) return;
    const self = this;

    this._aoApontarDown = function (ev) {
      // Safari/iPhone exige que a permissao do sensor seja solicitada dentro
      // de um gesto do jogador. Este toque e a segunda chance caso o modo ja
      // estivesse salvo antes de abrir a corrida.
      if (self.save && self.save.controlType === SaveManager.CONTROL_TILT &&
          self.tiltPermissionStatus === "unknown") {
        self.pedirPermissaoDeInclinacao().then(function (status) {
          self.tiltPermissionStatus = status;
        });
      }
      // A captura mantém o dedo "preso" ao canvas mesmo se ele escorregar para
      // fora — é o que evita o botão ficar grudado. Mas ela lança quando o
      // ponteiro não está mais ativo, e uma exceção aqui engoliria o toque
      // inteiro, então o pedido é apenas uma tentativa.
      try {
        if (self.canvas.setPointerCapture) self.canvas.setPointerCapture(ev.pointerId);
      } catch (e) { /* ponteiro já solto: segue sem captura */ }
      const p = self._pontoDoEvento(ev);
      self.ponteiros.set(ev.pointerId, p);
      // Toques em botões de UI (pause / telas) tratados ao pressionar,
      // exatamente como ACTION_DOWN / ACTION_POINTER_DOWN faziam.
      if (self.handleUiTap(p.x, p.y)) { ev.preventDefault(); return; }
      self._atualizarControlesPorToque();
      ev.preventDefault();
    };

    this._aoApontarMove = function (ev) {
      if (!self.ponteiros.has(ev.pointerId)) return;
      self.ponteiros.set(ev.pointerId, self._pontoDoEvento(ev));
      self._atualizarControlesPorToque();
      ev.preventDefault();
    };

    this._aoApontarUp = function (ev) {
      self.ponteiros.delete(ev.pointerId);
      self._atualizarControlesPorToque();
      ev.preventDefault();
    };

    this.canvas.addEventListener("pointerdown", this._aoApontarDown);
    this.canvas.addEventListener("pointermove", this._aoApontarMove);
    this.canvas.addEventListener("pointerup", this._aoApontarUp);
    this.canvas.addEventListener("pointercancel", this._aoApontarUp);
    this.canvas.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });

    this._aoTeclar = function (ev) {
      if (self.handleGamepadKeyEvent(ev)) ev.preventDefault();
    };
    window.addEventListener("keydown", this._aoTeclar);
    window.addEventListener("keyup", this._aoTeclar);
  }

  /** Converte a posição do ponteiro (pixels CSS) para pixels do canvas. */
  _pontoDoEvento(ev) {
    const r = this.canvas.getBoundingClientRect();
    const escalaX = r.width > 0 ? (this.canvas.width / r.width) : 1;
    const escalaY = r.height > 0 ? (this.canvas.height / r.height) : 1;
    return { x: (ev.clientX - r.left) * escalaX, y: (ev.clientY - r.top) * escalaY };
  }

  /** Equivale ao corpo do onTouchEvent depois do handleUiTap. */
  _atualizarControlesPorToque() {
    if (this.state && this.state.phase === GamePhase.RUNNING) {
      this.refreshControls();
    } else {
      this.controls.reset();
    }
  }

  /** Lê todos os dedos na tela e define left/right/turbo/freio conforme o modo. */
  refreshControls() {
    const keepTilt = this.controls.tiltActive;
    this.controls.reset();
    this.controls.tiltActive = keepTilt;

    const type = this.save.controlType;
    if (type !== SaveManager.CONTROL_BUTTONS) {
      this.controls.accelerate = true; // nos modos clássicos o carro continua acelerando automaticamente
    }

    // Sem dedos na tela é o mesmo que ACTION_UP / ACTION_CANCEL do Android.
    if (this.ponteiros.size === 0) return;

    const lateralPad = this.surfaceH * 0.035;
    const accelPad = this.surfaceH * 0.026;
    const brakePad = this.surfaceH * 0.020;

    for (const p of this.ponteiros.values()) {
      const x = p.x;
      const y = p.y;

      // V61: não existe mais botão separado de RÉ. O próprio FREIO vira ré
      // quando a velocidade chega a zero e continua pressionado.
      if (Ret.contemComFolga(this.hud.brakeBtn, x, y, brakePad, brakePad)) { this.controls.brake = true; continue; }
      // As duas bolinhas de item não podem virar direção/aceleração no modo toque.
      if (Ret.contem(this.hud.pitBoostBtn, x, y)) continue;
      if (Ret.contem(this.hud.freezeRivalsBtn, x, y)) continue;
      if (Ret.contem(this.hud.pauseBtn, x, y)) continue;
      if (Ret.contem(this.hud.headlightBtn, x, y)) continue;

      if (type === SaveManager.CONTROL_BUTTONS) {
        if (Ret.contemComFolga(this.hud.accelBtn, x, y, accelPad, accelPad)) this.controls.accelerate = true;
        if (Ret.contemComFolga(this.hud.leftBtn, x, y, lateralPad, lateralPad)) this.controls.left = true;
        if (Ret.contemComFolga(this.hud.rightBtn, x, y, lateralPad, lateralPad)) this.controls.right = true;
      } else if (type === SaveManager.CONTROL_TILT) {
        // Direção pelo sensor; o toque não vira.
      } else {
        // CONTROL_TOUCH: área real de toque volta a ser a tela toda dos lados.
        // A caixa verde do HUD é só visual e menor; o toque continua amplo.
        if (x < this.surfaceW / 2) this.controls.left = true; else this.controls.right = true;
      }
    }
  }

  /** Trata toques em botões de pause e das telas. Retorna true se consumiu. */
  handleUiTap(x, y) {
    if (!this.state) return false;
    switch (this.state.phase) {
      case GamePhase.TUTORIAL: {
        this.save.tutorialSeen = true;
        this.state.phase = GamePhase.COUNTDOWN;
        this.state.countdown = 3.5;
        this.countdownSoundStage = TelaDeCorrida.INT_MIN;
        this.countdownShakeTimer = 0;
        this.countdownGoFlashTimer = 0;
        this.launchTurboFxTimer = 0;
        return true;
      }
      case GamePhase.RUNNING: {
        const hasRaceItem = this.availableRaceUpgradeIds().length > 0;
        if (hasRaceItem && Ret.contem(this.hud.pitBoostBtn, x, y)) {
          return this.cycleSelectedRaceUpgrade();
        }
        if (hasRaceItem && Ret.contem(this.hud.freezeRivalsBtn, x, y)) {
          return this.activateSelectedRaceUpgrade();
        }
        if (Ret.contem(this.hud.headlightBtn, x, y)) {
          this.headlightsOn = !this.headlightsOn;
          return true;
        }
        if (Ret.contem(this.hud.turboBtn, x, y)) {
          this.activateTurboFromInput();
          return true;
        }
        if (Ret.contem(this.hud.pauseBtn, x, y)) {
          this.state.phase = GamePhase.PAUSED;
          this.controls.reset();
          if (this.sound) { this.sound.stopEngine(); this.sound.pauseAll(); }
          return true;
        }
        break;
      }
      case GamePhase.PAUSED: {
        if (Ret.contem(this.hud.musicBtn, x, y)) {
          this.togglePauseMusic();
          return true;
        }
        if (Ret.contem(this.hud.resumeBtn, x, y)) {
          if (this.sound) { this.sound.resumeAll(); this.sound.startEngine(); }
          this.state.phase = GamePhase.RUNNING;
          return true;
        }
        if (Ret.contem(this.hud.restartBtn, x, y)) { this.restartWithAd(); return true; }
        if (Ret.contem(this.hud.menuBtn, x, y)) { if (this.listener) this.listener.onExitToMenu(); return true; }
        break;
      }
      case GamePhase.WON: {
        const hasNext = this.hasNextStage();
        if (hasNext) {
          if (Ret.contem(this.hud.btnPrimary, x, y)) { this.goToNextStageWithAd(); return true; }
          if (Ret.contem(this.hud.btnSecondary, x, y)) { this.restartWithAd(); return true; }
          if (Ret.contem(this.hud.btnTertiary, x, y)) { if (this.listener) this.listener.onOpenGarage(); return true; }
          if (Ret.contem(this.hud.btnGarage, x, y)) { if (this.listener) this.listener.onExitToMenu(); return true; }
        } else {
          if (Ret.contem(this.hud.btnPrimary, x, y)) { this.restartWithAd(); return true; }
          if (Ret.contem(this.hud.btnSecondary, x, y)) { if (this.listener) this.listener.onOpenGarage(); return true; }
          if (Ret.contem(this.hud.btnTertiary, x, y)) { if (this.listener) this.listener.onExitToMenu(); return true; }
        }
        break;
      }
      case GamePhase.LOST: {
        if (Ret.contem(this.hud.btnPrimary, x, y)) { this.restartWithAd(); return true; }
        if (Ret.contem(this.hud.btnSecondary, x, y)) { if (this.listener) this.listener.onOpenGarage(); return true; }
        if (Ret.contem(this.hud.btnTertiary, x, y)) { if (this.listener) this.listener.onExitToMenu(); return true; }
        break;
      }
      default:
        break;
    }
    return false;
  }

  togglePauseMusic() {
    if (!this.save) return;
    this.save.musicEnabled = !this.save.musicEnabled;
    if (this.save.musicEnabled) {
      if (this.sound) this.sound.startMusic(this.musicRawNameForStage(this.stageIndex, this.stage), "race_music");
    } else {
      if (this.sound) this.sound.stopMusic();
    }
  }

  restart() {
    this.loadStage(this.stageIndex);
    if (this.sound) this.sound.resumeAll();
  }

  goToNextStage() {
    if (this.stageIndex + 1 >= StageCatalog.count()) return;
    this.loadStage(this.stageIndex + 1);
    if (this.sound) this.sound.resumeAll();
  }

  /**
   * V114: começar uma fase daqui de dentro (REINICIAR / PRÓXIMA FASE) passava
   * primeiro pelo anúncio (TurboAds). No navegador não existe AdMob, então o
   * gancho onBeforeStageStart continua, mas quem o implementa chama start()
   * direto. Sem listener, recomeça na hora.
   */
  restartWithAd() {
    const self = this;
    const target = this.listener;
    if (!target) { this.restart(); return; }
    if (this.sound) { this.sound.stopEngine(); this.sound.pauseAll(); }
    target.onBeforeStageStart(function () { self.restart(); });
  }

  goToNextStageWithAd() {
    const self = this;
    if (this.stageIndex + 1 >= StageCatalog.count()) return;
    const target = this.listener;
    if (!target) { this.goToNextStage(); return; }
    if (this.sound) { this.sound.stopEngine(); this.sound.pauseAll(); }
    target.onBeforeStageStart(function () { self.goToNextStage(); });
  }

  /** Direção pelo sensor de inclinação (chamado pelo DeviceOrientationEvent). */
  setTilt(value) {
    this.controls.tiltActive = (this.save.controlType === SaveManager.CONTROL_TILT);
    this.controls.tilt = limitar(value, -1, 1);
  }

  // =================== O QUE ERA DA GameActivity ===================

  /** No Android a Activity vibrava a cada batida; aqui é navigator.vibrate. */
  onCollision() {
    this.vibrate();
    if (this.listener) this.listener.onCollision();
  }

  vibrate() {
    if (!this.save || !this.save.vibrationEnabled) return;
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
    } catch (e) {
      /* ignora */
    }
  }

  /**
   * Fim de corrida: guarda as moedas na carteira, libera a próxima fase e
   * decide se toca o vídeo de zeramento do país. Era a GameActivity que fazia
   * isso; agora é método da própria tela, e o listener só é avisado.
   */
  onRaceResult(stageIndex, won, score, coins) {
    // As moedas coletadas vão para a carteira; o recorde já foi salvo no finishRace.
    this.save.addCoins(coins);
    // Só libera a próxima fase quando a corrida confirmou classificação no TOP 5.
    if (won) this.save.unlockStage(stageIndex + 1);

    if (this.listener) this.listener.onRaceResult(stageIndex, won, score, coins);

    // V79/V109: zeramento por país.
    // Brasil, Estados Unidos, Japão e final da Itália tocam vídeo ao vencer a
    // última fase correspondente. Quem exibe o vídeo é a tela de vídeos.
    if (won && this.shouldPlayCountryEnding(stageIndex)) {
      this.pause();
      if (this.sound) this.sound.stopMusic();
      if (this.listener && typeof this.listener.onCountryEnding === "function") {
        this.listener.onCountryEnding(stageIndex);
      }
    }
  }

  shouldPlayCountryEnding(stageIndex) {
    if (sessaoOnline().enabled) return false;
    return stageIndex === TelaDeCorrida.LAST_BRAZIL_STAGE_INDEX ||
      stageIndex === TelaDeCorrida.LAST_USA_STAGE_INDEX ||
      stageIndex === TelaDeCorrida.LAST_JAPAN_STAGE_INDEX ||
      stageIndex === TelaDeCorrida.LAST_ITALY_STAGE_INDEX;
  }

  /** Sensor de inclinacao: prioriza o acelerometro, como no projeto Android. */
  _instalarSensorDeInclinacao() {
    if (this._aoInclinar || this._aoMover) return;
    if (typeof window === "undefined") return;
    const self = this;

    if (window.DeviceMotionEvent) {
      this._aoMover = function (ev) {
        if (!self.save || self.save.controlType !== SaveManager.CONTROL_TILT) return;
        const gravidade = ev.accelerationIncludingGravity;
        if (!gravidade || !Number.isFinite(gravidade.y)) return;
        self.tiltMotionLastAt = (typeof performance !== "undefined" ? performance.now() : Date.now());
        // Mesmo calculo do Android: event.values[1] / 6, com zona morta e
        // filtro leve para o carro nao tremer quando o aparelho esta parado.
        // A Gamepad/Android e a API Web usam sinais opostos neste eixo.
        // Invertemos para inclinar à direita e o carro virar à direita.
        let alvo = limitar(-gravidade.y / 6, -1, 1);
        if (Math.abs(alvo) < 0.055) alvo = 0;
        self.tiltFiltered += (alvo - self.tiltFiltered) * 0.32;
        self.setTilt(Math.abs(self.tiltFiltered) < 0.035 ? 0 : self.tiltFiltered);
      };
      window.addEventListener("devicemotion", this._aoMover, { passive: true });
    }

    if (!window.DeviceOrientationEvent) return;
    this._aoInclinar = function (ev) {
      if (!self.save || self.save.controlType !== SaveManager.CONTROL_TILT) return;
      const agora = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (agora - self.tiltMotionLastAt < 900) return; // DeviceMotion e mais fiel.
      const anguloTela = (window.screen && window.screen.orientation &&
        Number.isFinite(window.screen.orientation.angle))
        ? window.screen.orientation.angle : Number(window.orientation || 0);
      if (self.tiltOrientationAngle !== anguloTela) {
        self.tiltOrientationAngle = anguloTela;
        self.tiltOrientationNeutral = null;
      }
      const emPaisagem = Math.abs(anguloTela) === 90 || Math.abs(anguloTela) === 270;
      const bruto = emPaisagem ? Number(ev.beta) : Number(ev.gamma);
      if (!Number.isFinite(bruto)) return;
      if (self.tiltOrientationNeutral === null) self.tiltOrientationNeutral = bruto;
      let delta = bruto - self.tiltOrientationNeutral;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      let alvo = limitar(-delta / 18, -1, 1);
      if (Math.abs(alvo) < 0.06) alvo = 0;
      self.tiltFiltered += (alvo - self.tiltFiltered) * 0.28;
      self.setTilt(Math.abs(self.tiltFiltered) < 0.035 ? 0 : self.tiltFiltered);
    };
    window.addEventListener("deviceorientation", this._aoInclinar, { passive: true });
  }

  /** No iOS os sensores so ligam depois de um toque que peca permissao. */
  pedirPermissaoDeInclinacao() {
    return TelaDeCorrida.pedirPermissaoSensor();
  }

  static pedirPermissaoSensor() {
    try {
      if (typeof window === "undefined" || (!window.DeviceMotionEvent && !window.DeviceOrientationEvent)) {
        return Promise.resolve("unsupported");
      }
      const pedidos = [];
      const Motion = window.DeviceMotionEvent;
      const Orientation = window.DeviceOrientationEvent;
      if (Motion && typeof Motion.requestPermission === "function") pedidos.push(Motion.requestPermission());
      if (Orientation && typeof Orientation.requestPermission === "function" && Orientation !== Motion) {
        pedidos.push(Orientation.requestPermission());
      }
      if (pedidos.length === 0) return Promise.resolve("granted");
      return Promise.all(pedidos).then(function (resultados) {
        return resultados.every(function (r) { return r === "granted"; }) ? "granted" : "denied";
      }).catch(function () { return "denied"; });
    } catch (e) {
      return Promise.resolve("denied");
    }
  }

  // =================== CICLO DE VIDA / LAÇO ===================

  /** Equivale ao surfaceChanged: a tela mudou de tamanho. */
  setup(width, height) {
    this.surfaceW = width;
    this.surfaceH = height;
    this.renderer.setup(width, height);
    this.hud.setup(width, height, this.save ? this.save.controlType : SaveManager.CONTROL_TOUCH);
    this.maybeStartLoop();
  }

  maybeStartLoop() {
    if (this.ready && this.surfaceW > 0 && this.surfaceH > 0 && !this.running) {
      this.running = true;
      this.lastTime = 0;
      this.accumulator = 0;
      const self = this;
      this._passo = function (agora) { self._quadro(agora); };
      this.loop = requestAnimationFrame(this._passo);
    }
  }

  stopLoop() {
    if (!this.running) return;
    this.running = false;
    if (this.loop) cancelAnimationFrame(this.loop);
    this.loop = 0;
  }

  /**
   * Um quadro do laço. Mesmo acumulador de passo fixo do GameLoop.kt:
   * dt alvo de 1/60, no máximo 14 passos por quadro, e quadro maior que
   * 0.12s é cortado (evita "saltos" quando a aba volta do fundo).
   * O sono para mirar 60 FPS sumiu: quem faz esse trabalho é o próprio
   * requestAnimationFrame.
   */
  _quadro(agora) {
    if (!this.running) return;
    const targetDt = 1 / 60;                 // passo fixo da física
    const maxAccumulatedDt = targetDt * 14;  // V61: recupera melhor se o aparelho engasgar, sem deixar o relógio lento

    if (this.lastTime === 0) this.lastTime = agora;
    let frameTime = (agora - this.lastTime) / 1000;
    this.lastTime = agora;
    if (frameTime > 0.12) frameTime = 0.12;
    if (!(frameTime >= 0)) frameTime = 0;
    this.accumulator = Math.min(this.accumulator + frameTime, maxAccumulatedDt);

    // Controle externo: uma leitura por quadro (no Android vinha por evento).
    this.handleGamepadMotionEvent();

    // Atualiza a física em passos fixos.
    let steps = 0;
    while (this.accumulator >= targetDt && steps < 14) {
      this.update(targetDt);
      this.accumulator -= targetDt;
      steps++;
    }

    // Desenha. Não há lock de Surface no navegador.
    if (this.ctx) this.render(this.ctx);

    // As imagens chegam de forma assíncrona; enquanto faltar alguma, relê a
    // tabela do Assets de meio em meio segundo.
    if (this.spritesPendentes) {
      this.spriteRecheckTimer += frameTime;
      if (this.spriteRecheckTimer >= 0.5) {
        this.spriteRecheckTimer = 0;
        this.loadCarSprites();
        this.loadHudIllustrations();
      }
    }

    this.loop = requestAnimationFrame(this._passo);
  }

  /** Chamado quando a aba/tela perde o foco: pausa o jogo e o áudio. */
  pause() {
    if (this.state && this.state.phase === GamePhase.RUNNING) {
      this.state.phase = GamePhase.PAUSED;
      this.controls.reset();
    }
    if (this.sound) { this.sound.stopEngine(); this.sound.pauseAll(); }
  }

  /** Chamado ao voltar o foco: retoma o áudio (o jogo continua pausado). */
  resume() {
    if (this.sound) this.sound.resumeAll();
    this.maybeStartLoop();
  }

  /** Equivale ao onDestroy: solta o laço, o áudio, os eventos e a sala online. */
  destroy() {
    this.stopLoop();
    if (this.sound) this.sound.release();
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this._aoApontarDown);
      this.canvas.removeEventListener("pointermove", this._aoApontarMove);
      this.canvas.removeEventListener("pointerup", this._aoApontarUp);
      this.canvas.removeEventListener("pointercancel", this._aoApontarUp);
    }
    if (this._aoTeclar) {
      window.removeEventListener("keydown", this._aoTeclar);
      window.removeEventListener("keyup", this._aoTeclar);
    }
    if (this._aoInclinar) {
      window.removeEventListener("deviceorientation", this._aoInclinar);
      this._aoInclinar = null;
    }
    if (this._aoMover) {
      window.removeEventListener("devicemotion", this._aoMover);
      this._aoMover = null;
    }
    if (sessaoOnline().enabled) sessaoOnline().clear();
  }
}

// Companion object do Kotlin.
TelaDeCorrida.CHECKPOINT_BONUS = 0;   // V59: relógio real, sem bônus de checkpoint
TelaDeCorrida.INT_MIN = -2147483648;  // era Int.MIN_VALUE
TelaDeCorrida.LAST_BRAZIL_STAGE_INDEX = 9;
TelaDeCorrida.LAST_USA_STAGE_INDEX = 15;
TelaDeCorrida.LAST_JAPAN_STAGE_INDEX = 21;
TelaDeCorrida.LAST_ITALY_STAGE_INDEX = 27;

window.SESSAO_ONLINE_VAZIA = SESSAO_ONLINE_VAZIA;
window.sessaoOnline = sessaoOnline;
window.TelaDeCorrida = TelaDeCorrida;
