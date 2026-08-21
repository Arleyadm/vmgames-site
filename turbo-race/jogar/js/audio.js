"use strict";
/*
 * Audio do jogo. Porte de SoundManager.kt.
 *
 *  - Musica de fundo: um elemento <audio> em laco, compartilhado entre as
 *    telas do menu (no Android era o globalMusic estatico, aqui e o mesmo
 *    campo dentro de SoundManager).
 *  - Efeitos curtos: WebAudio, que aguenta varios sons ao mesmo tempo sem
 *    cortar (o SoundPool do Android fazia esse papel).
 *  - Motor: um <audio> proprio em laco continuo, so mudando o volume.
 *
 * Diferenca obrigatoria do navegador: som so comeca depois de um toque ou
 * clique do jogador. Por isso existe o destravar(), chamado no primeiro
 * gesto — antes disso os pedidos ficam guardados e tocam em seguida.
 */
class SoundManager {
  constructor(save) {
    this.save = save;
    this.contexto = null;
    this.destravado = false;
    this.bufferPorNome = {};
    this.musicaPendente = null;

    this.enginePlayer = null;
    this.engineActive = false;

    this.EFEITOS = {
      turbo: 0.28,
      crash: 0.09,
      coin: 0.01,
      overtake: 0.08,
      checkpoint: 0.75,
      countdown_tick: 0.75,
      countdown_go: 0.95,
      drift4: 0.72
    };
  }

  // ---------------------------------------------------------
  // Destravamento exigido pelo navegador
  // ---------------------------------------------------------

  destravar() {
    if (this.destravado) return;
    try {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (Contexto) {
        if (!this.contexto) this.contexto = new Contexto();
        if (this.contexto.state === "suspended") this.contexto.resume();
      }
      this.destravado = true;
      this._precarregarEfeitos();
      if (this.musicaPendente) {
        const pendente = this.musicaPendente;
        this.musicaPendente = null;
        this.startMusic(pendente.nome, pendente.reserva);
      }
      if (this.engineActive) this.startEngine();
    } catch (e) {
      this.destravado = true;
    }
  }

  _precarregarEfeitos() {
    for (const nome of Object.keys(this.EFEITOS)) this._carregarEfeito(nome);
  }

  _carregarEfeito(nome) {
    if (!this.contexto) return;
    if (this.bufferPorNome[nome] !== undefined) return;
    const caminho = Assets.caminhoAudio(nome);
    if (!caminho) { this.bufferPorNome[nome] = null; return; }
    this.bufferPorNome[nome] = null;
    const ctx = this.contexto;
    fetch(caminho)
      .then(r => r.arrayBuffer())
      .then(dados => new Promise((ok, falha) => {
        // O Safari antigo so aceita a forma com callback.
        const saida = ctx.decodeAudioData(dados, ok, falha);
        if (saida && typeof saida.then === "function") saida.then(ok, falha);
      }))
      .then(buffer => { this.bufferPorNome[nome] = buffer; })
      .catch(() => { this.bufferPorNome[nome] = null; });
  }

  // ---------------------------------------------------------
  // Musica de fundo
  // ---------------------------------------------------------

  startMusic(rawName, fallbackRawName) {
    if (!this.save.musicEnabled) return;

    let caminho = Assets.caminhoAudio(rawName);
    let nomeUsado = rawName;
    if (!caminho && fallbackRawName) {
      caminho = Assets.caminhoAudio(fallbackRawName);
      nomeUsado = fallbackRawName;
    }
    if (!caminho) return;

    if (!this.destravado) {
      this.musicaPendente = { nome: rawName, reserva: fallbackRawName };
      return;
    }

    // A mesma musica ja tocando: so mantem e evita reiniciar.
    if (SoundManager.globalMusic && SoundManager.globalMusicName === nomeUsado) {
      try {
        SoundManager.globalMusic.volume = 0.10;
        if (SoundManager.globalMusic.paused) SoundManager.globalMusic.play().catch(() => {});
        return;
      } catch (e) {
        this.stopMusic();
      }
    }

    this.stopMusic();

    const loopStart = (nomeUsado === "menu_music") ? 60 : 0;
    const audio = new Audio(caminho);
    audio.volume = 0.10;
    audio.loop = loopStart <= 0;
    audio.preload = "auto";

    if (loopStart > 0) {
      audio.addEventListener("loadedmetadata", function () {
        const seguro = (audio.duration > 2) ? limitar(loopStart, 0, Math.max(0, audio.duration - 1)) : 0;
        SoundManager.globalMusicLoopStart = seguro;
        if (seguro > 0) {
          try { audio.currentTime = seguro; } catch (e) { /* ignora */ }
        }
      });
      audio.addEventListener("ended", function () {
        try {
          audio.currentTime = SoundManager.globalMusicLoopStart || 0;
          audio.play().catch(() => {});
        } catch (e) { /* ignora */ }
      });
    }

    SoundManager.globalMusic = audio;
    SoundManager.globalMusicName = nomeUsado;
    SoundManager.globalMusicLoopStart = loopStart;
    audio.play().catch(() => { /* o navegador pode recusar antes do gesto */ });
  }

  stopMusic() {
    const atual = SoundManager.globalMusic;
    if (atual) {
      try { atual.pause(); atual.src = ""; } catch (e) { /* ignora */ }
    }
    SoundManager.globalMusic = null;
    SoundManager.globalMusicName = "";
    SoundManager.globalMusicLoopStart = 0;
  }

  // ---------------------------------------------------------
  // Efeitos curtos
  // ---------------------------------------------------------

  _play(nome, volume) {
    if (!this.save.sfxEnabled) return;
    if (!this.destravado || !this.contexto) return;
    const buffer = this.bufferPorNome[nome];
    if (!buffer) { this._carregarEfeito(nome); return; }
    try {
      const fonte = this.contexto.createBufferSource();
      const ganho = this.contexto.createGain();
      fonte.buffer = buffer;
      ganho.gain.value = volume;
      fonte.connect(ganho);
      ganho.connect(this.contexto.destination);
      fonte.start(0);
    } catch (e) { /* ignora falha pontual */ }
  }

  playTurbo() { this._play("turbo", 0.28); }
  playCrash() { this._play("crash", 0.09); }
  playCoin() { this._play("coin", 0.01); }
  playOvertake() { this._play("overtake", 0.08); }
  playCheckpoint() { this._play("checkpoint", 0.75); }
  playCountdownTick() { this._play("countdown_tick", 0.75); }
  playCountdownGo() { this._play("countdown_go", 0.95); }
  playDrift() { this._play("drift4", 0.72); }

  /** Cliques do menu reaproveitam o som de moeda, como no app. */
  playClick() { this._play("coin", 0.05); }

  // ---------------------------------------------------------
  // Motor em laco continuo
  // ---------------------------------------------------------

  startEngine() {
    if (!this.save.sfxEnabled) return;
    this.engineActive = true;
    if (!this.destravado) return;
    try {
      if (!this.enginePlayer) {
        const caminho = Assets.caminhoAudio("engine");
        if (!caminho) return;
        this.enginePlayer = new Audio(caminho);
        this.enginePlayer.loop = true;
        this.enginePlayer.volume = 0.05;
      }
      if (this.enginePlayer.paused) this.enginePlayer.play().catch(() => {});
    } catch (e) {
      this.engineActive = false;
      this.enginePlayer = null;
    }
  }

  /** Atualiza somente o volume do motor. Nao altera a velocidade do audio. */
  updateEngine(speedPercent) {
    const player = this.enginePlayer;
    if (!player) return;
    const speed = limitar(speedPercent, 0, 1);
    const volume = 0.03 + speed * 0.12;
    try { player.volume = limitar(volume, 0, 1); } catch (e) { /* ignora */ }
  }

  stopEngine() {
    this.engineActive = false;
    try {
      if (this.enginePlayer) {
        this.enginePlayer.pause();
        this.enginePlayer.currentTime = 0;
      }
    } catch (e) { /* ignora */ }
  }

  // ---------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------

  pauseAll() {
    try { if (SoundManager.globalMusic) SoundManager.globalMusic.pause(); } catch (e) { /* ignora */ }
    try { if (this.enginePlayer) this.enginePlayer.pause(); } catch (e) { /* ignora */ }
    if (this.contexto && this.contexto.state === "running") {
      this.contexto.suspend().catch(() => {});
    }
  }

  resumeAll() {
    if (this.contexto && this.contexto.state === "suspended" && this.destravado) {
      this.contexto.resume().catch(() => {});
    }
    if (this.save.musicEnabled) {
      try { if (SoundManager.globalMusic) SoundManager.globalMusic.play().catch(() => {}); } catch (e) { /* ignora */ }
    }
    if (this.save.sfxEnabled && this.engineActive) {
      try { if (this.enginePlayer) this.enginePlayer.play().catch(() => {}); } catch (e) { /* ignora */ }
    }
  }

  releaseKeepMusic() {
    this.stopEngine();
    this.enginePlayer = null;
  }

  release() {
    this.stopEngine();
    this.enginePlayer = null;
    this.stopMusic();
  }
}

SoundManager.globalMusic = null;
SoundManager.globalMusicName = "";
SoundManager.globalMusicLoopStart = 0;

window.SoundManager = SoundManager;
