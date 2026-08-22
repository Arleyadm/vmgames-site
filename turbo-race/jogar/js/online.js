"use strict";
/*
 * Sala online do Turbo Race — o lado do jogo.
 *
 * Substitui o multiplayer local por Bluetooth do app (multiplayer/BluetoothService.kt
 * e BluetoothSession.kt): o navegador nao fala Bluetooth classico, entao a
 * corrida entre jogadores acontece por WebSocket, num servidor proprio
 * (pasta TurboRace-Servidor-Render), com o mesmo desenho da sala do Sugar Strike.
 *
 * A forma foi mantida de proposito igual a do Kotlin — setListener, sendState,
 * sendRaw, close, connectedCount — para o porte do GameView continuar literal.
 */

/** Equivale ao objeto BluetoothSession: mantem a sessao viva ao trocar de tela. */
const OnlineSession = {
  service: null,
  isHost: false,
  stageIndex: 0,
  enabled: false,
  localPlayerId: "",
  maxPlayers: 4,
  raceLaps: 3,
  raceWeather: "auto",
  puddlesWater: true,
  puddlesOil: false,
  raceLaunchId: "",
  raceGoAtMs: 0,
  raceOpening: false,

  refreshPlayerId() {
    // Sem crypto.randomUUID em navegador antigo: monta na mao.
    if (window.crypto && window.crypto.randomUUID) {
      this.localPlayerId = window.crypto.randomUUID();
      return;
    }
    let saida = "";
    for (let i = 0; i < 32; i++) saida += Math.floor(Math.random() * 16).toString(16);
    this.localPlayerId = saida;
  },

  clear() {
    if (this.service) this.service.close();
    this.service = null;
    this.enabled = false;
    this.isHost = false;
    this.stageIndex = 0;
    this.maxPlayers = 4;
    this.raceLaps = 3;
    this.raceWeather = "auto";
    this.puddlesWater = true;
    this.puddlesOil = false;
    this.raceLaunchId = "";
    this.raceGoAtMs = 0;
    this.raceOpening = false;
    this.refreshPlayerId();
  }
};
OnlineSession.refreshPlayerId();

/**
 * Equivale a classe BluetoothService.
 *
 * Um servico = uma conexao com uma sala. Quem cria a sala vira anfitriao e e
 * quem escolhe a fase e da a largada; o servidor manda a semente da pista para
 * todos, entao o tracado sai identico em todas as telas.
 */
class OnlineService {
  constructor(url) {
    this.url = url || SaveManager.SERVIDOR_PADRAO;
    this.ws = null;
    this.listener = null;
    this.pid = "";
    this.token = "";
    this.salaId = "";
    this.anfitriao = false;
    this.resumo = null;
    this.fechadoDeProposito = false;
    this.tentativasDeVolta = 0;
    this.ultimoPingMs = 0;
    this.latenciaMs = 0;
    this.deslocamentoServidorMs = null;
    this.timerDePing = 0;
    this.opcoes = null;
  }

  // -----------------------------------------------------------------------
  // Conexao
  // -----------------------------------------------------------------------

  /**
   * opcoes: { criar, sala, nome, carId, max, fase, salaNome, clima, pocaAgua, pocaOleo, voltas }
   *  - criar: true monta uma sala nova e devolve o codigo
   *  - sala: entra numa sala pelo codigo
   *  - sem os dois: cai em qualquer sala com vaga, ou cria uma
   */
  conectar(opcoes) {
    this.opcoes = opcoes || {};
    this.fechadoDeProposito = false;
    this._abrir(false);
  }

  _montarEndereco(reconectando) {
    const o = this.opcoes || {};
    const partes = [];
    partes.push("nome=" + encodeURIComponent(String(o.nome || "Jogador").slice(0, 14)));
    partes.push("carro=" + limitar(Math.trunc(o.carId || 0), 0, 9));
    if (reconectando && this.token) {
      partes.push("token=" + encodeURIComponent(this.token));
    } else if (o.criar) {
      partes.push("criar=1");
      partes.push("max=" + limitar(Math.trunc(o.max || 4), 2, 24));
      partes.push("fase=" + limitar(Math.trunc(o.fase || 0), 0, StageCatalog.count() - 1));
      if (o.salaNome) partes.push("salaNome=" + encodeURIComponent(String(o.salaNome).slice(0, 24)));
      partes.push("clima=" + encodeURIComponent(String(o.clima || "auto")));
      partes.push("pocaAgua=" + (o.pocaAgua === false ? "0" : "1"));
      partes.push("pocaOleo=" + (o.pocaOleo === false ? "0" : "1"));
      partes.push("voltas=" + limitar(Math.trunc(o.voltas || 3), 1, 10));
    } else if (o.sala) {
      partes.push("sala=" + encodeURIComponent(String(o.sala).toUpperCase().slice(0, 8)));
    }
    const separador = this.url.indexOf("?") >= 0 ? "&" : "?";
    return this.url + separador + partes.join("&");
  }

  _abrir(reconectando) {
    let ws;
    try {
      ws = new WebSocket(this._montarEndereco(reconectando));
    } catch (e) {
      this._avisar("onDisconnected", "Endereço da sala inválido: " + this.url);
      return;
    }
    this.ws = ws;
    this._avisar("onStatus", reconectando ? "Reconectando…" : "Conectando à sala…");

    const self = this;

    ws.onopen = function () {
      self.tentativasDeVolta = 0;
      self._avisar("onStatus", "Conectado. Aguardando a sala…");
      // Mede a latencia já na entrada. Sem isto uma largada feita antes do
      // primeiro ping periódico não consegue compensar o tempo de rede.
      self._enviar({ t: "ping", stamp: Date.now() });
      self._comecarPing();
    };

    ws.onmessage = function (evento) {
      let msg;
      try { msg = JSON.parse(evento.data); } catch (e) { return; }
      self._receber(msg);
    };

    ws.onerror = function () {
      // O onclose vem logo em seguida com o motivo real.
    };

    ws.onclose = function () {
      self._pararPing();
      if (self.fechadoDeProposito) return;
      // Servidor no plano gratuito dorme e demora a acordar: vale insistir um pouco.
      if (self.token && self.tentativasDeVolta < 4) {
        self.tentativasDeVolta++;
        const espera = 800 * self.tentativasDeVolta;
        self._avisar("onStatus", "Conexão caiu. Tentando voltar (" + self.tentativasDeVolta + "/4)…");
        setTimeout(function () {
          if (!self.fechadoDeProposito) self._abrir(true);
        }, espera);
        return;
      }
      self._avisar("onDisconnected", "A conexão com a sala caiu.");
    };
  }

  _receber(msg) {
    switch (msg.t) {

      case "bemvindo": {
        this.pid = msg.pid;
        this.token = msg.token;
        this.salaId = msg.sala;
        this.anfitriao = !!msg.anfitriao;
        this.resumo = msg.resumo;

        OnlineSession.localPlayerId = this.pid;
        OnlineSession.isHost = this.anfitriao;
        OnlineSession.stageIndex = msg.resumo ? msg.resumo.fase : 0;
        OnlineSession.maxPlayers = msg.resumo ? msg.resumo.maxJogadores : 4;
        this._atualizarRegrasDaCorrida(msg.resumo);

        this._avisar("onConnected");
        this._avisar("onRoomUpdate", this.resumo);
        return;
      }

      case "sala": {
        this.resumo = msg.resumo;
        this.anfitriao = msg.resumo.anfitriaoPid === this.pid;
        OnlineSession.isHost = this.anfitriao;
        OnlineSession.stageIndex = msg.resumo.fase;
        OnlineSession.maxPlayers = msg.resumo.maxJogadores;
        this._atualizarRegrasDaCorrida(msg.resumo);
        this._avisar("onRoomUpdate", this.resumo);
        return;
      }

      case "preparar": {
        // Primeira metade da barreira: abre e monta a pista, mas ainda não
        // inicia a contagem. O GameView avisará `carregado` quando estiver pronto.
        this._aplicarRegrasDaMensagem(msg);
        OnlineSession.raceGoAtMs = 0;
        OnlineSession.enabled = true;
        this._avisar("onRacePrepare", this._dadosDaCorrida(msg));
        return;
      }

      case "largada": {
        // Segunda metade da barreira: todos já montaram a pista. Agora o mesmo
        // prazo local libera o GO em PC e celular.
        this._aplicarRegrasDaMensagem(msg);
        const prazoRecebido = Math.max(0, Number(msg.sincronizarEmMs || msg.emMs || 0));
        const prazoServidor = Number(msg.largadaServidorEm);
        const agoraParede = Date.now();
        const esperaCorrigida = Number.isFinite(prazoServidor) && Number.isFinite(this.deslocamentoServidorMs)
          ? Math.max(0, prazoServidor - (agoraParede + this.deslocamentoServidorMs))
          : Math.max(0, prazoRecebido - Math.max(0, this.latenciaMs) * 0.5);
        const agoraMonotonico = (typeof performance !== "undefined" && performance.now)
          ? performance.now()
          : Date.now();
        OnlineSession.raceGoAtMs = agoraMonotonico + esperaCorrigida;
        OnlineSession.enabled = true;
        const dados = this._dadosDaCorrida(msg);
        Object.assign(dados, {
          emMs: msg.emMs || 0,
          sincronizarEmMs: msg.sincronizarEmMs || msg.emMs || 0,
          largadaLocalEm: OnlineSession.raceGoAtMs
        });
        this._avisar("onRaceStart", dados);
        return;
      }

      case "estado": {
        // Mesmos campos do MultiplayerState.kt.
        this._avisar("onStateReceived", {
          x: msg.x,
          position: msg.position,
          speed: msg.speed,
          lap: msg.lap,
          fuel: msg.fuel,
          carId: msg.carId,
          rank: msg.rank,
          finished: msg.finished,
          playerName: msg.playerName || "Jogador",
          playerId: msg.playerId || msg.pid || "remote"
        });
        return;
      }

      case "chegou": {
        this._avisar("onPlayerFinished", { pid: msg.pid, nome: msg.nome, posicao: msg.posicao, tempo: msg.tempo });
        return;
      }

      case "fim": {
        this._avisar("onRaceEnd", { ordem: msg.ordem || [] });
        return;
      }

      case "conversa": {
        // O Bluetooth chamava isso de mensagem crua; aqui vale o mesmo caminho.
        this._avisar("onRawMessage", "CONVERSA|" + (msg.nome || "") + "|" + (msg.texto || ""));
        this._avisar("onChat", { pid: msg.pid, nome: msg.nome, texto: msg.texto });
        return;
      }

      case "saiu": {
        this._avisar("onPlayerLeft", { pid: msg.pid, motivo: msg.motivo || "" });
        return;
      }

      case "erro": {
        this.fechadoDeProposito = true;   // erro de entrada nao merece reconexao
        this._avisar("onDisconnected", msg.mensagem || "A sala recusou a conexão.");
        return;
      }

      case "pong": {
        if (msg.stamp) {
          const recebidoEm = Date.now();
          const enviadoEm = Number(msg.stamp);
          this.latenciaMs = Math.max(0, recebidoEm - enviadoEm);
          const servidorEm = Number(msg.servidorEm);
          if (Number.isFinite(servidorEm)) {
            this.deslocamentoServidorMs = servidorEm + this.latenciaMs * 0.5 - recebidoEm;
          }
        }
        return;
      }

      default:
        return;
    }
  }

  _avisar(metodo, argumento) {
    const l = this.listener;
    if (!l || typeof l[metodo] !== "function") return;
    try { l[metodo](argumento); } catch (e) { console.error("Erro no ouvinte da sala:", e); }
  }

  _atualizarRegrasDaCorrida(resumo) {
    if (!resumo) return;
    OnlineSession.raceLaps = limitar(Math.trunc(resumo.voltas || 3), 1, 10);
    OnlineSession.raceWeather = String(resumo.clima || "auto");
    OnlineSession.puddlesWater = resumo.pocaAgua !== false;
    OnlineSession.puddlesOil = resumo.pocaOleo === true;
  }

  _aplicarRegrasDaMensagem(msg) {
    OnlineSession.raceLaunchId = String(msg.corridaId || msg.semente);
    OnlineSession.stageIndex = msg.fase;
    OnlineSession.raceLaps = limitar(Math.trunc(msg.voltas || OnlineSession.raceLaps || 3), 1, 10);
    OnlineSession.raceWeather = String(msg.clima || OnlineSession.raceWeather || "auto");
    OnlineSession.puddlesWater = msg.pocaAgua !== false;
    OnlineSession.puddlesOil = msg.pocaOleo === true;
  }

  _dadosDaCorrida(msg) {
    return {
      semente: msg.semente,
      fase: msg.fase,
      clima: OnlineSession.raceWeather,
      pocaAgua: OnlineSession.puddlesWater,
      pocaOleo: OnlineSession.puddlesOil,
      voltas: OnlineSession.raceLaps,
      corridaId: msg.corridaId,
      jogadores: msg.jogadores || []
    };
  }

  _comecarPing() {
    this._pararPing();
    const self = this;
    this.timerDePing = setInterval(function () {
      self._enviar({ t: "ping", stamp: Date.now() });
    }, 8000);
  }

  _pararPing() {
    if (this.timerDePing) clearInterval(this.timerDePing);
    this.timerDePing = 0;
  }

  _enviar(objeto) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(JSON.stringify(objeto)); return true; } catch (e) { return false; }
  }

  // -----------------------------------------------------------------------
  // A mesma interface que o GameView usava com o Bluetooth
  // -----------------------------------------------------------------------

  setListener(listener) { this.listener = listener; }

  /** Quantos jogadores estao na sala agora, sem contar voce. */
  connectedCount() {
    if (!this.resumo) return 0;
    let total = 0;
    for (const j of this.resumo.jogadores) {
      if (j.pid !== this.pid && j.online) total++;
    }
    return total;
  }

  /** Lista da sala, do jeito que a tela do saguao precisa. */
  jogadores() { return this.resumo ? this.resumo.jogadores : []; }

  ehAnfitriao() { return this.anfitriao; }

  sendState(estado) {
    this._enviar({
      t: "estado",
      x: estado.x,
      position: estado.position,
      speed: estado.speed,
      lap: estado.lap,
      fuel: estado.fuel,
      carId: estado.carId,
      rank: estado.rank,
      finished: !!estado.finished
    });
  }

  sendRaw(texto) {
    this._enviar({ t: "conversa", texto: String(texto).slice(0, 60) });
  }

  setReady(pronto) { this._enviar({ t: "pronto", pronto: !!pronto }); }

  setCar(carId) { this._enviar({ t: "carro", carId: limitar(Math.trunc(carId), 0, 9) }); }

  setName(nome) { this._enviar({ t: "nome", nome: String(nome).slice(0, 14) }); }

  setStage(indice) {
    this._enviar({ t: "fase", fase: limitar(Math.trunc(indice), 0, StageCatalog.count() - 1) });
  }

  setMaxPlayers(max) { this._enviar({ t: "maximo", max: limitar(Math.trunc(max), 2, 24) }); }

  startRace() { this._enviar({ t: "largar" }); }

  reportLoaded(corridaId) {
    // A ordem das mensagens no WebSocket é preservada: o servidor responde
    // este ping antes de processar o `carregado` e liberar a contagem.
    this._enviar({ t: "ping", stamp: Date.now() });
    this._enviar({ t: "carregado", corridaId: String(corridaId || OnlineSession.raceLaunchId) });
  }

  /** Avisa o servidor que voce cruzou a linha; a ordem de chegada e ele quem decide. */
  reportFinish(tempoSegundos) { this._enviar({ t: "chegou", tempo: tempoSegundos }); }

  endRace() { this._enviar({ t: "encerrar" }); }

  close() {
    this.fechadoDeProposito = true;
    this._pararPing();
    if (this.ws) {
      try { this._enviar({ t: "sair" }); } catch (e) { /* ignora */ }
      try { this.ws.close(1000, "saiu"); } catch (e) { /* ignora */ }
    }
    this.ws = null;
  }
}

/**
 * Pergunta ao servidor quais salas estao abertas. E HTTP puro, entao a lista
 * aparece no saguao antes de abrir qualquer WebSocket.
 */
function listarSalasOnline(urlDoWebSocket) {
  const base = String(urlDoWebSocket || SaveManager.SERVIDOR_PADRAO)
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/corrida.*$/, "");
  return fetch(base + "/salas", { cache: "no-store" })
    .then(r => r.json())
    .then(d => (d && d.salas) ? d.salas : [])
    .catch(() => null);   // null = nao deu para falar com o servidor
}

/** Bate no /status: serve para mostrar se a sala esta de pe antes de tentar entrar. */
function statusDoServidorOnline(urlDoWebSocket) {
  const base = String(urlDoWebSocket || SaveManager.SERVIDOR_PADRAO)
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/corrida.*$/, "");
  return fetch(base + "/status", { cache: "no-store" })
    .then(r => r.json())
    .catch(() => null);
}

window.OnlineSession = OnlineSession;
window.OnlineService = OnlineService;
window.listarSalasOnline = listarSalasOnline;
window.statusDoServidorOnline = statusDoServidorOnline;
