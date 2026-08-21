"use strict";
/*
 * Configuracoes: liga/desliga musica, efeitos sonoros e vibracao, e escolhe o
 * tipo de controle (toque lateral, botoes na tela ou sensor de inclinacao).
 * Tudo e salvo imediatamente via SaveManager.
 *
 * Porte de SettingsActivity.kt + res/layout/activity_settings.xml.
 *
 * O que muda de proposito no navegador:
 *  - o ScrollView do XML virou uma rolagem feita na mao (arrastar o dedo ou a
 *    roda do mouse); as medidas em dp do XML viram pixels vezes uma escala;
 *  - os Toast viram um aviso desenhado no rodape (mostrarAviso);
 *  - o EditText do nome e o endereco do servidor sao editados por prompt() do
 *    navegador, que e o equivalente mais honesto de um campo de texto aqui;
 *  - o painel "CONTROLE BLUETOOTH / USB" mapeava KEYCODE_* do Android; aqui
 *    ele mapeia KeyboardEvent.code, que e o que o SaveManager guarda;
 *  - a foto do perfil sai do ActivityResultContracts.OpenDocument e vira um
 *    <input type="file"> lido como data URL (o SaveManager guarda o data URL).
 */

// Cores do res/values/colors.xml, no mesmo formato inteiro do Android.
const CFG_BG_DARK = Cor.rgb(0x05, 0x00, 0x16);
const CFG_NEON_CYAN = Cor.rgb(0x00, 0xF5, 0xFF);
const CFG_NEON_MAGENTA = Cor.rgb(0xFF, 0x2D, 0xAA);
const CFG_AMBER = Cor.rgb(0xFF, 0xD2, 0x4D);
const CFG_TEXT_DIM = Cor.rgb(0xD2, 0xC7, 0xF0);

// Gradientes do drawable panel_glass / panel_glass_pink (angle 270 = de cima
// para baixo, startColor no topo).
const CFG_GLASS_TOPO = Cor.argb(0xD8, 0x0B, 0x14, 0x32);
const CFG_GLASS_BASE = Cor.argb(0xC4, 0x14, 0x06, 0x30);
const CFG_GLASS_ROSA_TOPO = Cor.argb(0xD8, 0x17, 0x08, 0x2F);
const CFG_GLASS_ROSA_BASE = Cor.argb(0xC4, 0x2C, 0x07, 0x3B);

/*
 * SO NA WEB: as acoes que aparecem no painel do teclado. O app tinha treze
 * botoes de mapeamento (farol, GAS+, GELO, fantasma, upgrades, select); aqui
 * a lista fica nas seis acoes que o teclado precisa mesmo ter a mao.
 */
const CFG_ACOES_TECLADO = [
  SaveManager.GAMEPAD_LEFT,
  SaveManager.GAMEPAD_RIGHT,
  SaveManager.GAMEPAD_ACCEL,
  SaveManager.GAMEPAD_BRAKE,
  SaveManager.GAMEPAD_TURBO,
  SaveManager.GAMEPAD_PAUSE
];

/** Nome curto de cada acao, do jeito que o XML escrevia nos botoes. */
const CFG_ROTULOS_TECLADO = {
  left: "Esquerda",
  right: "Direita",
  accel: "Acelerar",
  brake: "Freio/Ré",
  turbo: "Turbo",
  pause: "Pause"
};

class TelaDeConfiguracoes {

  constructor(app) {
    this.app = app;
    this.save = app.save;
    // No Kotlin cada Activity criava o seu SoundManager; aqui ele e unico.
    this.menuSound = app.sound;
    this.waitingGamepadAction = null;

    // Campo de texto do nome: como no EditText, o valor so vai para o
    // SaveManager quando o jogador aperta SALVAR PERFIL.
    this.inputPlayerNameText = "";
    this.profileProgressText = "Progresso salvo";
    this.gamepadStatusText = "";
    this.profileBitmap = null;

    // Rolagem da tela (o ScrollView do XML).
    this.rolagem = 0;
    this.conteudoAltura = 0;
    this.arrastando = false;
    this.arrastou = false;
    this.pontoY = 0;
    this.ultimoY = 0;

    // Aviso de rodape no lugar do Toast.
    this.aviso = "";
    this.avisoTempo = 0;

    this.esc = 1;

    // Retangulos com os mesmos nomes dos ids do activity_settings.xml.
    this.profilePanel = Ret.novo();
    this.profileImage = Ret.novo();
    this.inputPlayerName = Ret.novo();
    this.btnChoosePhoto = Ret.novo();
    this.btnSaveProfile = Ret.novo();
    this.audioPanel = Ret.novo();
    this.switchMusic = Ret.novo();
    this.switchSfx = Ret.novo();
    this.switchVibration = Ret.novo();
    this.switchRandomWeather = Ret.novo();
    this.switchSpeech = Ret.novo();
    this.controlPanel = Ret.novo();
    this.radioTouch = Ret.novo();
    this.radioButtons = Ret.novo();
    this.radioTilt = Ret.novo();
    this.serverPanel = Ret.novo();   // so na web
    this.btnOnlineServer = Ret.novo(); // so na web
    this.gamepadPanel = Ret.novo();
    this.switchGamepad = Ret.novo();
    this.btnMapKeys = [];            // so na web: um botao por acao do teclado
    this.btnResetGamepad = Ret.novo();
    this.btnBack = Ret.novo();

    // O dispatchKeyEvent do Kotlin vira um ouvinte de teclado da janela.
    this.ouvinteTeclado = (evento) => { this.dispatchKeyEvent(evento); };
  }

  // ---------------------------------------------------------
  // Ciclo de vida (onCreate / onResume / onDestroy)
  // ---------------------------------------------------------

  entrar(parametros) {
    this.setupProfilePanel();
    this.setupGamepadPanel();

    this.rolagem = 0;
    this.arrastando = false;
    this.arrastou = false;
    this.aviso = "";
    this.avisoTempo = 0;
    this.waitingGamepadAction = null;

    window.addEventListener("keydown", this.ouvinteTeclado);

    // onResume: a musica do menu continua tocando nesta tela.
    this.menuSound.startMusic("menu_music");
  }

  sair() {
    window.removeEventListener("keydown", this.ouvinteTeclado);
    this.waitingGamepadAction = null;
    // O onDestroy do Kotlin chamava releaseKeepMusic() porque cada Activity
    // tinha o proprio SoundManager. Aqui ele e do app inteiro: nao solta nada.
  }

  update(dt) {
    if (this.avisoTempo > 0) {
      this.avisoTempo -= dt;
      if (this.avisoTempo <= 0) {
        this.avisoTempo = 0;
        this.aviso = "";
      }
    }
  }

  // ---------------------------------------------------------
  // Painel do perfil (setupProfilePanel do Kotlin)
  // ---------------------------------------------------------

  setupProfilePanel() {
    this.inputPlayerNameText = this.save.playerName;
    this.loadProfileImage();
    this.updateProfileProgressText();
  }

  /**
   * Botao FOTO. No Android era o pickProfileImage (OpenDocument + permissao
   * persistente da Uri); no navegador nao ha Uri persistente, entao a imagem
   * e lida como data URL e guardada junto com o resto do progresso.
   */
  pickProfileImage() {
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = "image/*";
    entrada.addEventListener("change", () => {
      const arquivo = entrada.files && entrada.files[0];
      if (!arquivo) return;
      const leitor = new FileReader();
      leitor.onload = () => {
        this.save.profilePhotoUri = String(leitor.result || "");
        this.loadProfileImage();
        this.mostrarAviso("Foto do perfil salva.");
      };
      leitor.onerror = () => { this.mostrarAviso("Não deu para ler a imagem."); };
      leitor.readAsDataURL(arquivo);
    });
    entrada.click();
  }

  /** Botao SALVAR PERFIL: limpa o nome digitado e grava. */
  saveProfile() {
    const cleanName = String(this.inputPlayerNameText || "").trim().slice(0, 14) || "Jogador";
    this.save.playerName = cleanName;
    this.inputPlayerNameText = cleanName;
    this.updateProfileProgressText();
    this.mostrarAviso("Perfil salvo: " + cleanName);
  }

  /** Toque no campo do nome: o prompt() faz o papel do teclado do Android. */
  editarNome() {
    const digitado = window.prompt("Nome do piloto (até 14 letras):", this.inputPlayerNameText);
    if (digitado === null) return;
    this.inputPlayerNameText = String(digitado).slice(0, 14);
  }

  loadProfileImage() {
    const uriText = this.save.profilePhotoUri;
    if (!uriText || uriText.trim() === "") {
      // O Kotlin caia no sym_def_app_icon; aqui o icone do proprio jogo.
      this.profileBitmap = null;
      return;
    }
    try {
      const img = new Image();
      img.onload = () => { this.profileBitmap = img; };
      img.onerror = () => { this.profileBitmap = null; };
      img.src = uriText;
    } catch (e) {
      this.profileBitmap = null;
    }
  }

  updateProfileProgressText() {
    const unlocked = limitar(this.save.unlockedStages, 1, StageCatalog.count());
    const currentStage = StageCatalog.byIndex(limitar(unlocked - 1, 0, StageCatalog.count() - 1));
    const car = CarCatalog.byId(this.save.selectedCarId);
    this.profileProgressText = "Progresso salvo • " + this.save.coins + " moedas • " +
      unlocked + "/" + StageCatalog.count() + " fases • " + currentStage.countryName +
      " • Carro: " + car.name;
  }

  // ---------------------------------------------------------
  // Painel do controle externo / teclado (setupGamepadPanel do Kotlin)
  // ---------------------------------------------------------

  setupGamepadPanel() {
    this.updateGamepadStatusText();
  }

  startGamepadMapping(action) {
    this.waitingGamepadAction = action;
    this.gamepadStatusText = "Mapeando " + this.gamepadActionName(action) +
      "... aperte a tecla desejada. ESC cancela.";
    this.mostrarAviso("Aperte uma tecla para " + this.gamepadActionName(action));
  }

  /**
   * Porte do dispatchKeyEvent: enquanto uma acao espera mapeamento, a proxima
   * tecla vira o novo atalho. No Android o KEYCODE_BACK cancelava; aqui e ESC.
   */
  dispatchKeyEvent(event) {
    const actionToMap = this.waitingGamepadAction;
    if (actionToMap !== null) {
      event.preventDefault();
      if (event.code === "Escape") {
        this.waitingGamepadAction = null;
        this.updateGamepadStatusText();
        return true;
      }
      if (event.code) {
        this.save.setKeyboardKey(actionToMap, event.code);
        this.waitingGamepadAction = null;
        this.updateGamepadStatusText();
        this.mostrarAviso(this.gamepadActionName(actionToMap) + " = " +
          this.save.getKeyboardKeyLabel(actionToMap));
        return true;
      }
    }
    return false;
  }

  updateGamepadStatusText() {
    this.gamepadStatusText =
      "Controle externo: " + (this.save.gamepadEnabled ? "ligado" : "desligado") +
      "  •  toque numa ação e aperte a tecla nova. O analógico esquerdo também vira o carro.";
  }

  gamepadActionName(action) {
    switch (action) {
      case SaveManager.GAMEPAD_LEFT: return "virar à esquerda";
      case SaveManager.GAMEPAD_RIGHT: return "virar à direita";
      case SaveManager.GAMEPAD_ACCEL: return "acelerar";
      case SaveManager.GAMEPAD_BRAKE: return "frear/ré";
      case SaveManager.GAMEPAD_TURBO: return "turbo";
      case SaveManager.GAMEPAD_HEADLIGHT: return "farol";
      case SaveManager.GAMEPAD_GAS_PLUS: return "GAS+";
      case SaveManager.GAMEPAD_FREEZE: return "GELO";
      case SaveManager.GAMEPAD_GHOST: return "fantasma";
      case SaveManager.GAMEPAD_UPGRADE_NEXT: return "trocar upgrade";
      case SaveManager.GAMEPAD_UPGRADE_USE: return "usar upgrade";
      case SaveManager.GAMEPAD_PAUSE: return "pause";
      case SaveManager.GAMEPAD_SELECT: return "select";
      default: return "controle";
    }
  }

  /** Botao "Restaurar padrão" do painel do teclado (so na web). */
  resetKeyboardMapping() {
    this.waitingGamepadAction = null;
    this.save.resetKeyboardMapping();
    this.updateGamepadStatusText();
    this.mostrarAviso("Mapeamento padrão restaurado.");
  }

  // ---------------------------------------------------------
  // SO NA WEB: servidor da sala online
  // ---------------------------------------------------------

  /**
   * O app fazia multiplayer por Bluetooth e nao tinha endereco nenhum para
   * escolher. Na web a sala e um servidor WebSocket, e as vezes e preciso
   * apontar para outro (teste local, servidor novo). Vazio volta ao padrao.
   */
  trocarServidorOnline() {
    const digitado = window.prompt("Servidor da sala online (wss://...):", this.save.onlineServerUrl);
    if (digitado === null) return;
    this.save.onlineServerUrl = digitado;
    this.mostrarAviso("Servidor: " + this.save.onlineServerUrl);
  }

  // ---------------------------------------------------------
  // Aviso de rodape (o Toast do Android)
  // ---------------------------------------------------------

  mostrarAviso(texto) {
    this.aviso = texto;
    this.avisoTempo = 2.4; // LENGTH_SHORT do Android e mais ou menos isso
  }

  // ---------------------------------------------------------
  // Medidas (o que o activity_settings.xml resolvia sozinho)
  // ---------------------------------------------------------

  calcularLayout(largura, altura) {
    // 1 unidade aqui = 1dp do XML. A escala segue a menor dimensao para a
    // tela caber tanto no celular deitado quanto no monitor.
    const esc = limitar(Math.min(largura / 960, altura / 620), 0.55, 2.4);
    this.esc = esc;
    const dp = (v) => v * esc;

    const padLat = dp(22);
    const larg = largura - padLat * 2;
    let y = dp(14);

    // Titulo "CONFIGURAÇÕES" (25sp, marginBottom 10dp).
    this.tituloY = y + dp(25);
    y += dp(25) + dp(10);

    // ---- profilePanel ----
    const alturaFoto = dp(92);
    Ret.definir(this.profilePanel, padLat, y, padLat + larg, y + alturaFoto + dp(24));
    Ret.definir(this.profileImage,
      this.profilePanel.left + dp(12), y + dp(12),
      this.profilePanel.left + dp(12) + alturaFoto, y + dp(12) + alturaFoto);

    const colBotoes = Math.min(dp(170), larg * 0.26);
    const colBotoesX = this.profilePanel.right - dp(12) - colBotoes;
    Ret.definir(this.btnChoosePhoto, colBotoesX, y + dp(12), colBotoesX + colBotoes, y + dp(12) + dp(44));
    Ret.definir(this.btnSaveProfile, colBotoesX, this.btnChoosePhoto.bottom + dp(6),
      colBotoesX + colBotoes, this.btnChoosePhoto.bottom + dp(6) + dp(44));

    const meioL = this.profileImage.right + dp(14);
    const meioR = colBotoesX - dp(12);
    this.tituloPerfilY = y + dp(12) + dp(16);
    Ret.definir(this.inputPlayerName, meioL, y + dp(12) + dp(24), meioR, y + dp(12) + dp(24) + dp(44));
    this.profileProgressY = this.inputPlayerName.bottom + dp(16);
    y = this.profilePanel.bottom + dp(10);

    // ---- audioPanel + controlPanel (as duas colunas com weight 1) ----
    // Em tela estreita (celular em pe) as duas colunas viram duas linhas.
    const duasColunas = largura >= 640;
    const larguraColuna = duasColunas ? (larg - dp(20)) / 2 : larg;
    const linhaAlt = dp(38);
    const alturaAudio = dp(14) + dp(24) + dp(8) + linhaAlt * 5 + dp(8);
    const alturaControle = dp(14) + dp(24) + dp(8) + linhaAlt * 3 + dp(8);

    Ret.definir(this.audioPanel, padLat, y, padLat + larguraColuna, y + alturaAudio);
    if (duasColunas) {
      Ret.definir(this.controlPanel, this.audioPanel.right + dp(20), y, padLat + larg, y + alturaControle);
    } else {
      Ret.definir(this.controlPanel, padLat, this.audioPanel.bottom + dp(10),
        padLat + larg, this.audioPanel.bottom + dp(10) + alturaControle);
    }

    let sy = this.audioPanel.top + dp(14) + dp(24) + dp(8);
    const sL = this.audioPanel.left + dp(14);
    const sR = this.audioPanel.right - dp(14);
    Ret.definir(this.switchMusic, sL, sy, sR, sy + linhaAlt); sy += linhaAlt;
    Ret.definir(this.switchSfx, sL, sy, sR, sy + linhaAlt); sy += linhaAlt;
    Ret.definir(this.switchVibration, sL, sy, sR, sy + linhaAlt); sy += linhaAlt;
    Ret.definir(this.switchRandomWeather, sL, sy, sR, sy + linhaAlt); sy += linhaAlt;
    Ret.definir(this.switchSpeech, sL, sy, sR, sy + linhaAlt);

    let ry = this.controlPanel.top + dp(14) + dp(24) + dp(8);
    const rL = this.controlPanel.left + dp(14);
    const rR = this.controlPanel.right - dp(14);
    Ret.definir(this.radioTouch, rL, ry, rR, ry + linhaAlt); ry += linhaAlt;
    Ret.definir(this.radioButtons, rL, ry, rR, ry + linhaAlt); ry += linhaAlt;
    Ret.definir(this.radioTilt, rL, ry, rR, ry + linhaAlt);

    y = Math.max(this.audioPanel.bottom, this.controlPanel.bottom) + dp(12);

    // ---- SO NA WEB: servidor da sala online ----
    const alturaServidor = dp(14) + dp(24) + dp(8) + dp(44) + dp(12);
    Ret.definir(this.serverPanel, padLat, y, padLat + larg, y + alturaServidor);
    Ret.definir(this.btnOnlineServer,
      this.serverPanel.left + dp(14), this.serverPanel.top + dp(14) + dp(24) + dp(8),
      this.serverPanel.right - dp(14), this.serverPanel.top + dp(14) + dp(24) + dp(8) + dp(44));
    y = this.serverPanel.bottom + dp(12);

    // ---- gamepadPanel: SO NA WEB e um painel de teclado ----
    const porLinha = duasColunas ? 6 : 3;
    const linhasDeTecla = Math.ceil(CFG_ACOES_TECLADO.length / porLinha);
    const alturaTecla = dp(52);
    const alturaTeclado = dp(14) + dp(24) + dp(6) + linhaAlt + dp(22) + dp(10) +
      linhasDeTecla * (alturaTecla + dp(8)) + dp(9) + dp(44) + dp(14);
    Ret.definir(this.gamepadPanel, padLat, y, padLat + larg, y + alturaTeclado);

    let gy = this.gamepadPanel.top + dp(14) + dp(24) + dp(6);
    const gL = this.gamepadPanel.left + dp(14);
    const gR = this.gamepadPanel.right - dp(14);
    Ret.definir(this.switchGamepad, gL, gy, gR, gy + linhaAlt);
    gy += linhaAlt;
    this.gamepadStatusY = gy + dp(14);
    gy += dp(22) + dp(10);

    this.btnMapKeys = [];
    const largTecla = (gR - gL - dp(8) * (porLinha - 1)) / porLinha;
    for (let i = 0; i < CFG_ACOES_TECLADO.length; i++) {
      const coluna = i % porLinha;
      const linha = Math.trunc(i / porLinha);
      const bx = gL + coluna * (largTecla + dp(8));
      const by = gy + linha * (alturaTecla + dp(8));
      this.btnMapKeys.push({
        action: CFG_ACOES_TECLADO[i],
        ret: Ret.novo(bx, by, bx + largTecla, by + alturaTecla)
      });
    }
    gy += linhasDeTecla * (alturaTecla + dp(8)) + dp(9);

    const largReset = Math.min(dp(260), larg);
    const resetX = Ret.centroX(this.gamepadPanel) - largReset / 2;
    Ret.definir(this.btnResetGamepad, resetX, gy, resetX + largReset, gy + dp(44));
    y = this.gamepadPanel.bottom;

    // ---- btnBack ----
    const largVoltar = Math.min(dp(280), larg);
    const voltarX = largura / 2 - largVoltar / 2;
    Ret.definir(this.btnBack, voltarX, y + dp(14), voltarX + largVoltar, y + dp(14) + dp(56));

    this.conteudoAltura = this.btnBack.bottom + dp(14);
  }

  // ---------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------

  render(ctx, largura, altura) {
    this.calcularLayout(largura, altura);
    const dp = (v) => v * this.esc;

    const maxRolagem = Math.max(0, this.conteudoAltura - altura);
    this.rolagem = limitar(this.rolagem, 0, maxRolagem);

    // Fundo: a mesma arte do menu, escurecida (o XML usava so @color/bg_dark).
    const fundo = Assets.img("menu_bg_turbo_race");
    if (fundo) {
      ctx.drawImage(fundo, 0, 0, largura, altura);
      ctx.fillStyle = Cor.css(CFG_BG_DARK, 205);
      ctx.fillRect(0, 0, largura, altura);
    } else {
      ctx.fillStyle = Cor.css(CFG_BG_DARK);
      ctx.fillRect(0, 0, largura, altura);
    }

    ctx.save();
    ctx.translate(0, -this.rolagem);

    // ---- Titulo ----
    ctx.textAlign = "center";
    ctx.font = "bold " + dp(25) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_NEON_CYAN);
    ctx.fillText("CONFIGURAÇÕES", largura / 2, this.tituloY);

    // ---- profilePanel ----
    this.painelDeVidro(ctx, this.profilePanel, false);
    this.painelDeVidro(ctx, this.profileImage, true);
    const foto = this.profileBitmap || Assets.img("icone");
    if (foto) {
      // scaleType centerCrop: recorta o quadrado do meio da imagem.
      const lado = Math.min(foto.width, foto.height);
      const sx = (foto.width - lado) / 2;
      const sy2 = (foto.height - lado) / 2;
      const pad = dp(3);
      ctx.drawImage(foto, sx, sy2, lado, lado,
        this.profileImage.left + pad, this.profileImage.top + pad,
        Ret.largura(this.profileImage) - pad * 2, Ret.altura(this.profileImage) - pad * 2);
    }

    ctx.textAlign = "left";
    ctx.font = "bold " + dp(16) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_NEON_CYAN);
    ctx.fillText("PERFIL DO PILOTO", this.inputPlayerName.left, this.tituloPerfilY);

    this.campoDeTexto(ctx, this.inputPlayerName, this.inputPlayerNameText, "Nome do piloto");

    ctx.font = dp(13) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_TEXT_DIM);
    ctx.fillText(this.textoCabendo(ctx, this.profileProgressText, this.inputPlayerName.right - this.inputPlayerName.left),
      this.inputPlayerName.left, this.profileProgressY);

    this.desenharBotao(ctx, this.btnChoosePhoto, "FOTO", dp(14), false);
    this.desenharBotao(ctx, this.btnSaveProfile, "SALVAR PERFIL", dp(13), true);

    // ---- audioPanel ----
    this.painelDeVidro(ctx, this.audioPanel, false);
    ctx.textAlign = "left";
    ctx.font = "bold " + dp(17) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_NEON_CYAN);
    ctx.fillText("ÁUDIO E VIBRAÇÃO", this.audioPanel.left + dp(14), this.audioPanel.top + dp(14) + dp(17));

    this.desenharInterruptor(ctx, this.switchMusic, "Música de fundo", this.save.musicEnabled, CFG_NEON_CYAN);
    this.desenharInterruptor(ctx, this.switchSfx, "Efeitos sonoros", this.save.sfxEnabled, CFG_NEON_CYAN);
    this.desenharInterruptor(ctx, this.switchVibration, "Vibração", this.save.vibrationEnabled, CFG_NEON_CYAN);
    this.desenharInterruptor(ctx, this.switchRandomWeather, "Clima aleatório nas corridas", this.save.randomWeatherEnabled, CFG_NEON_CYAN);
    this.desenharInterruptor(ctx, this.switchSpeech, "Falas do piloto e rivais", this.save.speechEnabled, CFG_NEON_CYAN);

    // ---- controlPanel ----
    this.painelDeVidro(ctx, this.controlPanel, true);
    ctx.textAlign = "left";
    ctx.font = "bold " + dp(17) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_NEON_MAGENTA);
    ctx.fillText("TIPO DE CONTROLE", this.controlPanel.left + dp(14), this.controlPanel.top + dp(14) + dp(17));

    const tipo = this.save.controlType;
    this.desenharRadio(ctx, this.radioTouch, "Toque lateral", tipo !== SaveManager.CONTROL_BUTTONS && tipo !== SaveManager.CONTROL_TILT);
    this.desenharRadio(ctx, this.radioButtons, "Botões na tela", tipo === SaveManager.CONTROL_BUTTONS);
    this.desenharRadio(ctx, this.radioTilt, "Inclinação do aparelho", tipo === SaveManager.CONTROL_TILT);

    // ---- SO NA WEB: servidor da sala online ----
    this.painelDeVidro(ctx, this.serverPanel, false);
    ctx.textAlign = "left";
    ctx.font = "bold " + dp(17) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_AMBER);
    ctx.fillText("SERVIDOR DA SALA ONLINE", this.serverPanel.left + dp(14), this.serverPanel.top + dp(14) + dp(17));
    this.campoDeTexto(ctx, this.btnOnlineServer, this.save.onlineServerUrl, "wss://...");
    ctx.textAlign = "right";
    ctx.font = "bold " + dp(12) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_AMBER, 220);
    ctx.fillText("TROCAR", this.btnOnlineServer.right - dp(12), Ret.centroY(this.btnOnlineServer) + dp(4));

    // ---- SO NA WEB: teclado (no app este painel era do controle Bluetooth/USB) ----
    this.painelDeVidro(ctx, this.gamepadPanel, false);
    ctx.textAlign = "left";
    ctx.font = "bold " + dp(17) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_NEON_CYAN);
    ctx.fillText("TECLADO", this.gamepadPanel.left + dp(14), this.gamepadPanel.top + dp(14) + dp(17));

    this.desenharInterruptor(ctx, this.switchGamepad, "Usar controle externo", this.save.gamepadEnabled, CFG_NEON_CYAN);

    ctx.font = dp(13) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_TEXT_DIM);
    ctx.fillText(this.textoCabendo(ctx, this.gamepadStatusText, Ret.largura(this.gamepadPanel) - dp(28)),
      this.gamepadPanel.left + dp(14), this.gamepadStatusY);

    for (const item of this.btnMapKeys) {
      const esperando = this.waitingGamepadAction === item.action;
      this.desenharBotaoDeTecla(ctx, item.ret, CFG_ROTULOS_TECLADO[item.action] || item.action,
        esperando ? "..." : this.save.getKeyboardKeyLabel(item.action), esperando);
    }
    this.desenharBotao(ctx, this.btnResetGamepad, "Restaurar padrão", dp(13), false);

    // ---- btnBack ----
    this.desenharBotao(ctx, this.btnBack, "VOLTAR", dp(17), false);

    ctx.restore();

    // Barra de rolagem e aviso ficam presos na tela, fora do translate.
    if (maxRolagem > 0) {
      const alturaBarra = Math.max(dp(30), altura * (altura / this.conteudoAltura));
      const topoBarra = (altura - alturaBarra) * (this.rolagem / maxRolagem);
      ctx.fillStyle = Cor.css(CFG_NEON_CYAN, 110);
      ctx.fillRect(largura - dp(6), topoBarra, dp(4), alturaBarra);
    }
    this.desenharAviso(ctx, largura, altura);
  }

  /** Porte do drawable panel_glass (e do panel_glass_pink). */
  painelDeVidro(ctx, ret, rosa) {
    const dp = (v) => v * this.esc;
    const grad = ctx.createLinearGradient(0, ret.top, 0, ret.bottom);
    grad.addColorStop(0, Cor.css(rosa ? CFG_GLASS_ROSA_TOPO : CFG_GLASS_TOPO));
    grad.addColorStop(1, Cor.css(rosa ? CFG_GLASS_ROSA_BASE : CFG_GLASS_BASE));
    retanguloArredondado(ctx, ret, dp(22));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = Cor.css(rosa ? CFG_NEON_MAGENTA : CFG_NEON_CYAN, 0x88);
    ctx.lineWidth = dp(1.5);
    ctx.stroke();
  }

  /** Caixa de texto (o EditText com fundo panel_glass_pink do XML). */
  campoDeTexto(ctx, ret, texto, dica) {
    const dp = (v) => v * this.esc;
    retanguloArredondado(ctx, ret, dp(12));
    ctx.fillStyle = Cor.css(CFG_GLASS_ROSA_BASE);
    ctx.fill();
    ctx.strokeStyle = Cor.css(CFG_NEON_MAGENTA, 0x88);
    ctx.lineWidth = dp(1.5);
    ctx.stroke();

    const vazio = !texto || texto === "";
    ctx.textAlign = "left";
    ctx.font = "bold " + dp(15) + "px " + FONTE;
    ctx.fillStyle = Cor.css(vazio ? CFG_TEXT_DIM : Cor.WHITE);
    const disponivel = Ret.largura(ret) - dp(24) - dp(60);
    ctx.fillText(this.textoCabendo(ctx, vazio ? dica : texto, disponivel),
      ret.left + dp(12), Ret.centroY(ret) + dp(5));
  }

  /** Porte visual do SwitchMaterial. */
  desenharInterruptor(ctx, ret, texto, ligado, cor) {
    const dp = (v) => v * this.esc;
    const largTrilho = dp(46);
    const altTrilho = dp(24);
    const cy = Ret.centroY(ret);
    const trilho = Ret.novo(ret.right - largTrilho, cy - altTrilho / 2, ret.right, cy + altTrilho / 2);

    ctx.textAlign = "left";
    ctx.font = dp(16) + "px " + FONTE;
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(this.textoCabendo(ctx, texto, Ret.largura(ret) - largTrilho - dp(10)), ret.left, cy + dp(6));

    retanguloArredondado(ctx, trilho, altTrilho / 2);
    ctx.fillStyle = Cor.css(ligado ? cor : Cor.WHITE, ligado ? 150 : 45);
    ctx.fill();
    ctx.strokeStyle = Cor.css(ligado ? cor : CFG_TEXT_DIM, 170);
    ctx.lineWidth = dp(1.5);
    ctx.stroke();

    const raio = altTrilho / 2 - dp(3);
    const knobX = ligado ? trilho.right - raio - dp(3) : trilho.left + raio + dp(3);
    ctx.beginPath();
    ctx.arc(knobX, cy, raio, 0, Math.PI * 2);
    ctx.fillStyle = Cor.css(ligado ? cor : CFG_TEXT_DIM);
    ctx.fill();
  }

  /** Porte visual do RadioButton. */
  desenharRadio(ctx, ret, texto, marcado) {
    const dp = (v) => v * this.esc;
    const cy = Ret.centroY(ret);
    const raio = dp(9);
    ctx.beginPath();
    ctx.arc(ret.left + raio, cy, raio, 0, Math.PI * 2);
    ctx.strokeStyle = Cor.css(marcado ? CFG_NEON_MAGENTA : CFG_TEXT_DIM, 200);
    ctx.lineWidth = dp(2);
    ctx.stroke();
    if (marcado) {
      ctx.beginPath();
      ctx.arc(ret.left + raio, cy, raio - dp(4), 0, Math.PI * 2);
      ctx.fillStyle = Cor.css(CFG_NEON_MAGENTA);
      ctx.fill();
    }
    ctx.textAlign = "left";
    ctx.font = dp(15) + "px " + FONTE;
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(this.textoCabendo(ctx, texto, Ret.largura(ret) - raio * 2 - dp(12)),
      ret.left + raio * 2 + dp(10), cy + dp(5));
  }

  /**
   * Botao com a arte do app (btn_generic_large / btn_generic_secondary).
   * Se a imagem ainda nao carregou, cai num retangulo arredondado.
   */
  desenharBotao(ctx, ret, texto, tamanhoTexto, principal) {
    const dp = (v) => v * this.esc;
    const img = Assets.img(principal ? "btn_generic_large" : "btn_generic_secondary");
    if (img) {
      ctx.drawImage(img, ret.left, ret.top, Ret.largura(ret), Ret.altura(ret));
    } else {
      retanguloArredondado(ctx, ret, dp(14));
      ctx.fillStyle = Cor.css(principal ? CFG_NEON_MAGENTA : CFG_NEON_CYAN, 60);
      ctx.fill();
      ctx.strokeStyle = Cor.css(principal ? CFG_NEON_MAGENTA : CFG_NEON_CYAN, 200);
      ctx.lineWidth = dp(1.5);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.font = "bold " + tamanhoTexto + "px " + FONTE;
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(this.textoCabendo(ctx, texto, Ret.largura(ret) - dp(12)),
      Ret.centroX(ret), Ret.centroY(ret) + tamanhoTexto * 0.35);
  }

  /** SO NA WEB: botao de acao do teclado, com o nome em cima e a tecla embaixo. */
  desenharBotaoDeTecla(ctx, ret, nome, tecla, esperando) {
    const dp = (v) => v * this.esc;
    retanguloArredondado(ctx, ret, dp(12));
    ctx.fillStyle = Cor.css(esperando ? CFG_AMBER : CFG_NEON_CYAN, esperando ? 70 : 35);
    ctx.fill();
    ctx.strokeStyle = Cor.css(esperando ? CFG_AMBER : CFG_NEON_CYAN, 190);
    ctx.lineWidth = dp(1.5);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = dp(11) + "px " + FONTE;
    ctx.fillStyle = Cor.css(CFG_TEXT_DIM);
    ctx.fillText(this.textoCabendo(ctx, nome, Ret.largura(ret) - dp(8)), Ret.centroX(ret), ret.top + dp(18));

    ctx.font = "bold " + dp(15) + "px " + FONTE_NUMEROS;
    ctx.fillStyle = Cor.css(Cor.WHITE);
    ctx.fillText(this.textoCabendo(ctx, tecla, Ret.largura(ret) - dp(8)), Ret.centroX(ret), ret.top + dp(40));
  }

  /** Aviso curto no rodape: o que o Toast fazia no Android. */
  desenharAviso(ctx, largura, altura) {
    if (this.avisoTempo <= 0 || !this.aviso) return;
    const dp = (v) => v * this.esc;
    const alfa = Math.min(1, this.avisoTempo / 0.4);
    ctx.font = "bold " + dp(15) + "px " + FONTE;
    const larguraTexto = ctx.measureText(this.aviso).width;
    const caixa = Ret.novo(
      largura / 2 - larguraTexto / 2 - dp(18), altura - dp(80),
      largura / 2 + larguraTexto / 2 + dp(18), altura - dp(80) + dp(44));
    retanguloArredondado(ctx, caixa, dp(16));
    ctx.fillStyle = Cor.css(CFG_GLASS_TOPO, 230 * alfa);
    ctx.fill();
    ctx.strokeStyle = Cor.css(CFG_NEON_CYAN, 180 * alfa);
    ctx.lineWidth = dp(1.5);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = Cor.css(Cor.WHITE, 255 * alfa);
    ctx.fillText(this.aviso, largura / 2, Ret.centroY(caixa) + dp(5));
  }

  /** Corta o texto com reticencias quando nao cabe na largura pedida. */
  textoCabendo(ctx, texto, largMax) {
    let t = String(texto == null ? "" : texto);
    if (largMax <= 0) return t;
    if (ctx.measureText(t).width <= largMax) return t;
    while (t.length > 1 && ctx.measureText(t + "…").width > largMax) {
      t = t.slice(0, -1);
    }
    return t + "…";
  }

  // ---------------------------------------------------------
  // Toque (os setOnCheckedChangeListener / setOnClickListener do Kotlin)
  // ---------------------------------------------------------

  aoApontar(tipo, x, y) {
    const folga = 6 * this.esc;

    if (tipo === "baixo") {
      this.arrastando = true;
      this.arrastou = false;
      this.pontoY = y;
      this.ultimoY = y;
      return;
    }

    if (tipo === "mover") {
      if (!this.arrastando) return;
      const dy = y - this.ultimoY;
      this.ultimoY = y;
      if (Math.abs(y - this.pontoY) > folga) this.arrastou = true;
      this.aoGirarRoda(-dy);
      return;
    }

    if (tipo !== "cima") return;
    this.arrastando = false;
    if (this.arrastou) return; // foi rolagem, nao clique

    // O conteudo esta rolado: o toque volta para as coordenadas do conteudo.
    const py = y + this.rolagem;

    // --- profilePanel ---
    if (Ret.contem(this.inputPlayerName, x, py)) { this.editarNome(); return; }
    if (Ret.contem(this.btnChoosePhoto, x, py)) { this.pickProfileImage(); return; }
    if (Ret.contem(this.btnSaveProfile, x, py)) { this.saveProfile(); return; }

    // --- audioPanel ---
    if (Ret.contem(this.switchMusic, x, py)) {
      const v = !this.save.musicEnabled;
      this.save.musicEnabled = v;
      if (v) this.menuSound.startMusic("menu_music"); else this.menuSound.stopMusic();
      return;
    }
    if (Ret.contem(this.switchSfx, x, py)) { this.save.sfxEnabled = !this.save.sfxEnabled; return; }
    if (Ret.contem(this.switchVibration, x, py)) {
      this.save.vibrationEnabled = !this.save.vibrationEnabled;
      // Uma vibradinha de confirmacao, quando o aparelho tem vibracao.
      if (this.save.vibrationEnabled && navigator.vibrate) navigator.vibrate(30);
      return;
    }
    if (Ret.contem(this.switchRandomWeather, x, py)) { this.save.randomWeatherEnabled = !this.save.randomWeatherEnabled; return; }
    if (Ret.contem(this.switchSpeech, x, py)) { this.save.speechEnabled = !this.save.speechEnabled; return; }

    // --- controlPanel (o radioControl com os tres tipos) ---
    if (Ret.contem(this.radioTouch, x, py)) { this.save.controlType = SaveManager.CONTROL_TOUCH; return; }
    if (Ret.contem(this.radioButtons, x, py)) { this.save.controlType = SaveManager.CONTROL_BUTTONS; return; }
    if (Ret.contem(this.radioTilt, x, py)) { this.save.controlType = SaveManager.CONTROL_TILT; return; }

    // --- SO NA WEB: servidor da sala online ---
    if (Ret.contem(this.btnOnlineServer, x, py)) { this.trocarServidorOnline(); return; }

    // --- SO NA WEB: teclado ---
    if (Ret.contem(this.switchGamepad, x, py)) {
      this.save.gamepadEnabled = !this.save.gamepadEnabled;
      this.updateGamepadStatusText();
      return;
    }
    for (const item of this.btnMapKeys) {
      if (Ret.contem(item.ret, x, py)) { this.startGamepadMapping(item.action); return; }
    }
    if (Ret.contem(this.btnResetGamepad, x, py)) { this.resetKeyboardMapping(); return; }

    // --- btnBack ---
    if (Ret.contem(this.btnBack, x, py)) { this.app.irPara("menu"); return; }
  }

  /** SO NA WEB: roda do mouse. Recebe o quanto rolar em pixels. */
  aoGirarRoda(delta) {
    const maxRolagem = Math.max(0, this.conteudoAltura - this.app.altura);
    this.rolagem = limitar(this.rolagem + delta, 0, maxRolagem);
  }
}

window.TelaDeConfiguracoes = TelaDeConfiguracoes;
