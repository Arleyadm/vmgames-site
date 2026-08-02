(function () {
  "use strict";

  const original = {
    updateBot: updateBot,
    updatePlayer: updatePlayer,
    shoot: shoot,
    reload: reload,
    finishReload: finishReload,
    setWeapon: setWeapon,
    respawn: respawn,
    damage: damage,
    addFeed: addFeed,
    endMatch: endMatch,
    drawDeadOverlay: drawDeadOverlay,
    togglePause: togglePause
  };

  const nativeAvailable = typeof SugarAndroid !== "undefined";
  // Os indices das armas mudaram nesta versao: cliente antigo nao pode entrar.
  const APP_VERSION = "1.7.0";
  const peers = new Map();
  const rooms = new Map();
  let ui = null;
  let transportMode = "solo";
  let onlineSocket = null;
  let onlineReconnectWanted = false;
  let onlineReconnectTimer = 0;
  let onlineEverConnected = false;
  // Saguão de salas online: lista pública, sala atual e o relógio que atualiza a lista.
  let onlineRooms = [];
  let onlineRoomId = "";
  let onlineRoomInfo = null;
  let roomPollTimer = 0;
  let lobbySocket = null;
  let spectatorTargetId = "";
  let spectatorHud = null;
  // Sala online oficial do jogo. Quem preferir outro servidor é só digitar por cima.
  // Precisa ficar declarada antes de loadOnlineServer() ser chamada, logo abaixo.
  const DEFAULT_ONLINE_SERVER = "wss://sugarstrike-servidor.onrender.com";
  let onlineServerAddress = loadOnlineServer();
  let onlineSession = loadOnlineSession(onlineServerAddress);

  function cleanName(value, fallback, max) {
    const text = String(value || "").replace(/[<>\u0000-\u001f]/g, "").trim();
    return (text || fallback).slice(0, max);
  }

  function loadName() {
    try {
      return cleanName(localStorage.getItem("sugarstrike.player"), "CONFEITEIRO", 14);
    } catch (error) {
      return "CONFEITEIRO";
    }
  }

  function saveName(value) {
    try {
      localStorage.setItem("sugarstrike.player", value);
    } catch (error) {
      // O nome continua válido durante esta execução.
    }
  }

  function loadPlayerIdentity() {
    try {
      let identity = String(localStorage.getItem("sugarstrike.identity") || "");
      if (!/^[a-z0-9-]{12,64}$/i.test(identity)) {
        identity = "ss-" + Date.now().toString(36) + "-" +
          Math.random().toString(36).slice(2, 14);
        localStorage.setItem("sugarstrike.identity", identity);
      }
      return identity;
    } catch (error) {
      return "ss-session-" + Math.random().toString(36).slice(2, 14);
    }
  }

  const playerIdentity = loadPlayerIdentity();

  function loadOnlineServer() {
    try {
      const saved = String(localStorage.getItem("sugarstrike.onlineServer") || "");
      // Os endereços do túnel gratuito mudam a cada reinício do servidor no
      // computador, então um endereço desses guardado já nasceu vencido.
      if (!saved || /trycloudflare\.com/i.test(saved)) return DEFAULT_ONLINE_SERVER;
      return saved;
    } catch (error) {
      return DEFAULT_ONLINE_SERVER;
    }
  }

  function saveOnlineServer(value) {
    try {
      localStorage.setItem("sugarstrike.onlineServer", value);
    } catch (error) {
      // O endereço continua disponível durante esta execução.
    }
  }

  function loadOnlineSession(server) {
    try {
      const saved = JSON.parse(localStorage.getItem("sugarstrike.onlineSession") || "{}");
      return saved.server === server ? String(saved.session || "") : "";
    } catch (error) {
      return "";
    }
  }

  function saveOnlineSession(server, session) {
    try {
      if (session) {
        localStorage.setItem(
          "sugarstrike.onlineSession",
          JSON.stringify({server: server, session: session})
        );
      } else {
        localStorage.removeItem("sugarstrike.onlineSession");
      }
    } catch (error) {
      // A reconexão ainda funciona enquanto o jogo permanecer aberto.
    }
  }

  const Net = window.SugarNet = {
    role: "solo",
    myId: null,
    localName: loadName(),
    connected: false,
    inMatch: false,
    roundEnding: false,
    stateClock: 0,
    worldClock: 0,
    sequence: 0,
    matchSeed: 0,
    pingSequence: 0,
    roomPassword: "",
    ready: false,
    spectator: false,
    team: 0,
    migration: null,
    config: {
      bots: 4,
      target: 25,
      duration: 5,
      map: "village",
      mode: "deathmatch",
      allowSpectators: true,
      friendlyFire: false
    },

    onNativeEvent: function (event) {
      if (!event || !event.event) return;

      if (event.event === "status") {
        setStatus(event.message || "");
        return;
      }
      if (event.event === "rooms_cleared") {
        rooms.clear();
        renderRooms();
        return;
      }
      if (event.event === "room_found") {
        if (event.room && event.room.address) {
          rooms.set(event.room.address, event.room);
          renderRooms();
          if (
            Net.migration && Net.role === "client" &&
            cleanName(event.room.name, "", 24) === Net.migration.room
          ) {
            Net.migration = null;
            SugarAndroid.connectToRoom(event.room.address);
          }
        }
        return;
      }
      if (event.event === "connected") {
        Net.connected = true;
        Net.role = event.role === "host" ? "host" : "client";
        Net.spectator = !!event.spectator;
        Net.team = event.team | 0;
        if (Net.role === "host") {
          Net.myId = "host";
          peers.set("host", {
            id: "host",
            name: Net.localName,
            ready: true,
            ping: 0,
            version: APP_VERSION,
            skin: selectedSkin(),
            weapon: selectedWeapon(),
            accessory: selectedAccessory(),
            team: Net.team,
            spectator: false
          });
          setStatus(
            transportMode === "online"
              ? "Sala online pronta. Compartilhe o endereço do servidor com seus amigos."
              : "Sala pronta. Aguarde pelo menos um amigo e toque em INICIAR."
          );
          showLobby();
          broadcastRoster();
        } else {
          Net.ready = Net.spectator;
          if (ui && ui.ready) ui.ready.textContent = "ESTOU PRONTO";
          setStatus(Net.spectator
            ? "Você entrou como espectador. Aguarde ou acompanhe a partida em andamento."
            : "Conectado. Identificando você na sala…");
          showLobby();
        }
        renderPlayers();
        return;
      }
      if (event.event === "disconnected" || event.event === "transport_error") {
        Net.connected = false;
        if (
          transportMode === "wifi" && event.event === "transport_error" &&
          Net.role === "client" && !Net.migration
        ) {
          setStatus("Sinal perdido. Tentando reconectar automaticamente…");
          setTimeout(function () {
            try { SugarAndroid.reconnect(); } catch (error) {}
          }, 900);
        } else if (transportMode === "online" && onlineReconnectWanted) {
          setStatus(onlineEverConnected
            ? "Internet interrompida. Tentando reconectar automaticamente…"
            : "O servidor pode estar acordando. Tentando entrar, aguarde…");
          clearTimeout(onlineReconnectTimer);
          onlineReconnectTimer = setTimeout(function () {
            connectOnline(true);
          }, 1400);
        }
        if (Net.inMatch) {
          firing = false;
          showNetworkOverlay();
          setStatus("A conexão da partida foi encerrada.");
        }
        return;
      }
      if (event.event === "unsupported") {
        setStatus("Este aparelho não possui Wi-Fi Direct.");
        return;
      }
      if (event.event === "message" && event.data) {
        handleMessage(event.data);
      }
    },

    send: function (message) {
      if (!message) return;
      if (
        transportMode === "online" && onlineSocket &&
        onlineSocket.readyState === WebSocket.OPEN
      ) {
        try {
          onlineSocket.send(JSON.stringify(message));
        } catch (error) {
          setStatus("Não foi possível enviar um pacote da partida online.");
        }
        return;
      }
      if (!nativeAvailable) return;
      try {
        SugarAndroid.send(JSON.stringify(message));
      } catch (error) {
        setStatus("Não foi possível enviar um pacote da partida.");
      }
    },

    tick: function (dt) {
      if (!Net.inMatch || !Net.connected || matchOver) return;
      Net.stateClock += dt;
      Net.worldClock += dt;

      if (Net.role === "client" && Net.stateClock >= 0.066) {
        Net.stateClock = 0;
        sendLocalState();
      } else if (Net.role === "host" && Net.worldClock >= 0.066) {
        Net.worldClock = 0;
        player.yaw = cam.yaw;
        player.pitch = cam.pitch;
        Net.send({
          t: "world",
          seq: ++Net.sequence,
          entities: ents.map(snapshotEntity)
        });
      }
    }
  };

  function installUi() {
    document.documentElement.classList.add("android-app");

    const style = document.createElement("style");
    style.textContent = [
      ".android-app #topLeft{top:calc(12px + env(safe-area-inset-top));left:calc(12px + env(safe-area-inset-left))}",
      ".android-app #topMid{top:calc(12px + env(safe-area-inset-top))}",
      ".android-app #feed{top:calc(12px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right))}",
      ".android-app #leftStack{left:calc(12px + env(safe-area-inset-left))}",
      ".android-app #slots{bottom:calc(14px + env(safe-area-inset-bottom))}",
      ".android-app #stick{left:calc(26px + env(safe-area-inset-left));bottom:calc(26px + env(safe-area-inset-bottom))}",
      ".android-app #bFire{right:calc(24px + env(safe-area-inset-right));bottom:calc(34px + env(safe-area-inset-bottom))}",
      ".android-app #bJump{right:calc(140px + env(safe-area-inset-right));bottom:calc(44px + env(safe-area-inset-bottom))}",
      ".android-app #bReload{right:calc(34px + env(safe-area-inset-right));bottom:calc(150px + env(safe-area-inset-bottom))}",
      "#bMulti,#bOnline{display:inline-flex;align-items:center;justify-content:center;vertical-align:top;width:calc(50% - 5px);min-height:48px;padding:7px 4px;font-size:10px;line-height:1.1;letter-spacing:.45px}",
      "#bOnline{margin-left:6px;background:#8fd9c8}",
      "#netOverlay{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(30,22,18,.76);backdrop-filter:blur(4px);padding:calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));pointer-events:auto}",
      "#netOverlay.net-hide,.net-hide{display:none!important}",
      "#netPanel{width:min(560px,100%);max-height:94vh;overflow:auto;touch-action:pan-y;overscroll-behavior:contain;background:#fffdf7;border:5px solid #4a3b33;border-radius:24px;padding:18px 22px;box-shadow:0 8px 0 rgba(0,0,0,.25);color:#4a3b33;text-align:center}",
      "#netPanel h1{font-size:27px;letter-spacing:1px;color:#e8615a;text-shadow:2px 2px 0 #ffcf4d;margin-bottom:4px}",
      "#netPanel h2{font-size:12px;letter-spacing:2px;opacity:.68;margin-bottom:12px}",
      ".net-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}",
      ".net-grid.three{grid-template-columns:repeat(3,1fr)}",
      ".net-field{width:100%;height:43px;border:3px solid #4a3b33;border-radius:13px;background:#f7efe5;padding:7px 10px;color:#4a3b33;font:800 15px ui-rounded,'Trebuchet MS',sans-serif;user-select:text;-webkit-user-select:text;touch-action:manipulation}",
      ".net-label{font-size:10px;letter-spacing:1.3px;text-align:left;margin:7px 2px 4px;opacity:.72;font-weight:900}",
      ".net-btn{width:100%;min-height:43px;border:3px solid #4a3b33;border-radius:13px;background:#ffcf4d;color:#4a3b33;font:900 14px ui-rounded,'Trebuchet MS',sans-serif;letter-spacing:1px;padding:8px;touch-action:manipulation}",
      ".net-btn.alt{background:#f0e6da}.net-btn.red{background:#f6a9c3}.net-btn:disabled{opacity:.42}",
      ".net-btn.online{background:#8fd9c8}",
      "#netStatus,#netOnlineStatus,#netLobbyStatus{min-height:34px;margin:10px 0 7px;padding:7px 10px;border-radius:11px;background:#f0e6da;font-size:12px;line-height:1.35;font-weight:800}",
      "#netRooms,#netPlayers,#netRoomList{display:flex;flex-direction:column;gap:7px;margin:7px 0 10px}",
      "#netRoomList{max-height:38vh;overflow:auto;touch-action:pan-y;overscroll-behavior:contain}",
      "#netCreateBox{border:3px dashed #4a3b33;border-radius:14px;padding:9px;margin-top:9px;background:#f7efe5}",
      "#netCreateGrid{display:grid;grid-template-columns:1fr;gap:6px;margin-top:6px}",
      "#netCreateGrid .net-field{font-size:11px;height:38px;padding:4px}",
      "#netServerBox{margin-top:10px;text-align:left}",
      "#netServerBox summary{font-size:9px;letter-spacing:1.2px;font-weight:900;opacity:.6;padding:4px 2px;cursor:pointer}",
      ".net-room .roomMeta{display:block;font-size:9px;opacity:.66;margin-top:2px}",
      ".net-count{flex:0 0 auto;font-size:11px;font-weight:900;background:#f0e6da;border:2px solid #4a3b33;border-radius:9px;padding:3px 6px;margin-left:auto;margin-right:6px}",
      ".net-room,.net-player{display:flex;align-items:center;justify-content:space-between;gap:8px;border:2px solid #4a3b33;border-radius:12px;padding:8px 10px;background:#fff}",
      ".net-room{text-align:left;touch-action:manipulation}.net-room b,.net-player b{font-size:13px}.net-room small,.net-player small{display:block;font-size:10px;opacity:.64}",
      ".net-badge{flex:0 0 auto;border-radius:9px;background:#8fd9c8;padding:4px 7px;font-size:9px;font-weight:900;letter-spacing:.7px}",
      ".net-badge.wait{background:#f0e6da}.net-badge.bad{background:#f6a9c3}",
      ".net-badge.team1{background:#e8615a;color:#fff}.net-badge.team2{background:linear-gradient(90deg,#7ec96b 0 55%,#ffcf4d 55%)}",
      ".net-room-actions{display:flex;flex-direction:column;gap:4px;flex:0 0 auto}.net-room-actions button{border:2px solid #4a3b33;border-radius:8px;padding:4px 7px;font:900 9px ui-rounded,'Trebuchet MS',sans-serif;background:#8fd9c8}.net-room-actions .watch{background:#c9b4ec}",
      "#netConfig{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:8px 0}",
      "#netConfig .net-field{font-size:11px;height:38px;padding:4px}",
      "#netHint{font-size:10px;line-height:1.4;opacity:.68;margin:8px 0}",
      "#spectatorHud{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:45;display:none;min-width:min(520px,92vw);padding:10px 14px;border:3px solid #4a3b33;border-radius:16px;background:rgba(255,253,247,.94);color:#4a3b33;text-align:center;box-shadow:0 5px 0 rgba(0,0,0,.22);pointer-events:auto}",
      "#spectatorHud.show{display:block}#spectatorHud .spec-title{font-size:10px;letter-spacing:1.5px;opacity:.68}#spectatorHud .spec-name{font-size:18px;font-weight:1000;margin:2px 0}#spectatorHud .spec-data{font-size:11px;font-weight:800;line-height:1.45}#spectatorHud .spec-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px}#spectatorHud button{border:2px solid #4a3b33;border-radius:10px;background:#ffcf4d;padding:6px;font-weight:1000}",
      ".spectating #bFire,.spectating #bReload,.spectating #bJump,.spectating #bSprint,.spectating #slots,.spectating #scopeBtn{display:none!important}",
      "@media(max-height:500px){#netPanel{padding:11px 16px}#netPanel h1{font-size:21px}#netPanel h2{margin-bottom:6px}.net-field{height:38px}.net-btn{min-height:38px}#netStatus{margin:6px 0}}"
    ].join("");
    document.head.appendChild(style);

    const multiButton = document.createElement("button");
    multiButton.className = "big-btn sub-btn";
    multiButton.id = "bMulti";
    multiButton.textContent = "MULTIPLAYER WI-FI DIRECT";
    el("bPlay").insertAdjacentElement("afterend", multiButton);

    const onlineButton = document.createElement("button");
    onlineButton.className = "big-btn sub-btn";
    onlineButton.id = "bOnline";
    onlineButton.textContent = "JOGAR ONLINE";
    multiButton.insertAdjacentElement("afterend", onlineButton);

    const root = document.createElement("div");
    root.id = "netOverlay";
    root.className = "net-hide";
    root.innerHTML =
      '<div id="netPanel">' +
        '<h1>SALA WI-FI DIRECT</h1>' +
        '<h2>MULTIPLAYER LOCAL · SEM INTERNET</h2>' +
        '<div id="netSetup">' +
          '<div class="net-grid">' +
            '<div><div class="net-label">SEU NOME</div><input id="netName" class="net-field" maxlength="14"></div>' +
            '<div><div class="net-label">NOME DA SALA</div><input id="netRoomName" class="net-field" maxlength="24" value="SALA DOCE"></div>' +
          '</div>' +
          '<div style="margin-top:8px"><div class="net-label">SENHA DA SALA (OPCIONAL)</div><input id="netPassword" class="net-field" maxlength="12" placeholder="SEM SENHA"></div>' +
          '<div class="net-grid" style="margin-top:10px">' +
            '<button id="netCreate" class="net-btn">CRIAR SALA</button>' +
            '<button id="netSearch" class="net-btn">PROCURAR SALAS</button>' +
          '</div>' +
          '<div id="netStatus">Escolha criar uma sala ou procurar a sala de um amigo.</div>' +
          '<div id="netRooms"></div>' +
          '<div id="netHint">O Android poderá pedir acesso a aparelhos próximos. Todos devem estar com o Wi-Fi ligado e próximos uns dos outros.</div>' +
          '<button id="netBack" class="net-btn alt">VOLTAR</button>' +
        '</div>' +
        '<div id="netOnlineSetup" class="net-hide">' +
          '<div class="net-grid">' +
            '<div><div class="net-label">SEU NOME</div><input id="netOnlineName" class="net-field" maxlength="14"></div>' +
            '<div><div class="net-label">SENHA DA SALA (OPCIONAL)</div><input id="netOnlinePassword" class="net-field" maxlength="12" placeholder="SEM SENHA"></div>' +
          '</div>' +
          '<div style="margin-top:8px"><div class="net-label">PROCURAR SALA PELO NOME</div>' +
            '<input id="netRoomSearch" class="net-field" maxlength="24" placeholder="DIGITE PARA FILTRAR"></div>' +
          '<div class="net-grid" style="margin-top:10px">' +
            '<button id="netNewRoom" class="net-btn online">CRIAR SALA</button>' +
            '<button id="netRefresh" class="net-btn alt">ATUALIZAR</button>' +
          '</div>' +
          '<div id="netCreateBox" class="net-hide">' +
            '<div class="net-label">NOME DA NOVA SALA</div>' +
            '<input id="netNewName" class="net-field" maxlength="24" value="SALA DOCE">' +
            '<div id="netCreateGrid">' +
              '<select id="netNewMap" class="net-field"><option value="village">VILA CONFEITO</option><option value="factory">FABRICA DE CHOCOLATE</option><option value="park">PARQUE DE PIRULITOS</option><option value="castle">CASTELO DE BOLO</option></select>' +
              '<select id="netNewMode" class="net-field"><option value="deathmatch">MATA-MATA</option><option value="team">EQUIPES</option><option value="capture">CAPTURAR O DOCE</option><option value="king">REI DO POTE</option><option value="survival">SOBREVIVENCIA</option></select>' +
              '<select id="netNewMax" class="net-field"><option value="2">2 JOGADORES</option><option value="4">4 JOGADORES</option><option value="6">6 JOGADORES</option><option value="8" selected>8 JOGADORES</option><option value="10">10 JOGADORES</option><option value="12">12 JOGADORES</option></select>' +
              '<select id="netNewSpectators" class="net-field"><option value="1" selected>ESPECTADORES: SIM</option><option value="0">ESPECTADORES: NÃO</option></select>' +
              '<select id="netNewFriendly" class="net-field"><option value="0" selected>DANO ALIADO: NÃO</option><option value="1">DANO ALIADO: SIM</option></select>' +
            '</div>' +
            '<button id="netCreateConfirm" class="net-btn online" style="margin-top:9px">ABRIR A SALA</button>' +
          '</div>' +
          '<div id="netOnlineStatus">Procurando salas abertas…</div>' +
          '<div id="netRoomList"></div>' +
          '<details id="netServerBox"><summary>ENDEREÇO DO SERVIDOR</summary>' +
            '<input id="netServer" class="net-field" maxlength="180" placeholder="wss://sugarstrike-servidor.onrender.com"></details>' +
          '<button id="netOnlineBack" class="net-btn alt" style="margin-top:9px">VOLTAR</button>' +
        '</div>' +
        '<div id="netLobby" class="net-hide">' +
          '<div id="netLobbyStatus">Aguardando a conexão da sala…</div>' +
          '<div id="netPlayers"></div>' +
          '<div id="netConfig">' +
            '<select id="netMode" class="net-field"><option value="deathmatch">MATA-MATA</option><option value="team">EQUIPES</option><option value="capture">CAPTURAR O DOCE</option><option value="king">REI DO POTE</option><option value="survival">SOBREVIVENCIA</option></select>' +
            '<select id="netMap" class="net-field"><option value="village">VILA CONFEITO</option><option value="factory">FABRICA DE CHOCOLATE</option><option value="park">PARQUE DE PIRULITOS</option><option value="castle">CASTELO DE BOLO</option></select>' +
            '<select id="netDuration" class="net-field"><option value="3">3 MIN</option><option value="5" selected>5 MIN</option><option value="8">8 MIN</option><option value="12">12 MIN</option></select>' +
            '<input id="netBots" class="net-field" type="number" min="0" max="12" value="4" aria-label="Quantidade de bots">' +
            '<input id="netTarget" class="net-field" type="number" min="5" max="100" value="25" aria-label="Meta de pontos">' +
            '<select id="netSpectators" class="net-field"><option value="1">ESPECTADORES: SIM</option><option value="0">ESPECTADORES: NÃO</option></select>' +
            '<select id="netFriendly" class="net-field"><option value="0">DANO ALIADO: NÃO</option><option value="1">DANO ALIADO: SIM</option></select>' +
          '</div>' +
          '<button id="netReady" class="net-btn">ESTOU PRONTO</button>' +
          '<button id="netStart" class="net-btn" disabled>INICIAR PARTIDA</button>' +
          '<button id="netContinue" class="net-btn net-hide">CONTINUAR</button>' +
          '<button id="netLeave" class="net-btn red" style="margin-top:8px">SAIR DA SALA</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    spectatorHud = document.createElement("div");
    spectatorHud.id = "spectatorHud";
    spectatorHud.innerHTML =
      '<div class="spec-title">MODO ESPECTADOR</div>' +
      '<div class="spec-name" id="specName">AGUARDANDO JOGADOR</div>' +
      '<div class="spec-data" id="specData"></div>' +
      '<div class="spec-controls"><button id="specPrev">◀ ANTERIOR</button><button id="specNext">PRÓXIMO ▶</button></div>';
    document.body.appendChild(spectatorHud);

    ui = {
      root: root,
      setup: el("netSetup"),
      onlineSetup: el("netOnlineSetup"),
      lobby: el("netLobby"),
      name: el("netName"),
      onlineName: el("netOnlineName"),
      onlinePassword: el("netOnlinePassword"),
      server: el("netServer"),
      title: root.querySelector("h1"),
      subtitle: root.querySelector("h2"),
      roomName: el("netRoomName"),
      password: el("netPassword"),
      status: el("netStatus"),
      lobbyStatus: el("netLobbyStatus"),
      rooms: el("netRooms"),
      roomList: el("netRoomList"),
      roomSearch: el("netRoomSearch"),
      createBox: el("netCreateBox"),
      players: el("netPlayers"),
      start: el("netStart"),
      ready: el("netReady"),
      configPanel: el("netConfig"),
      continueButton: el("netContinue")
    };
    ui.name.value = Net.localName;
    ui.onlineName.value = Net.localName;
    ui.server.value = onlineServerAddress;

    multiButton.addEventListener("click", openNetworkMenu);
    onlineButton.addEventListener("click", openOnlineMenu);
    el("netCreate").addEventListener("click", createRoom);
    el("netSearch").addEventListener("click", searchRooms);
    el("netBack").addEventListener("click", closeNetworkMenu);
    el("netOnlineBack").addEventListener("click", closeNetworkMenu);
    el("netRefresh").addEventListener("click", function () { fetchRooms(true); });
    ui.roomSearch.addEventListener("input", renderOnlineRooms);
    el("netNewRoom").addEventListener("click", function () {
      const opening = ui.createBox.classList.contains("net-hide");
      ui.createBox.classList.toggle("net-hide", !opening);
      el("netNewRoom").textContent = opening ? "FECHAR" : "CRIAR SALA";
    });
    el("netCreateConfirm").addEventListener("click", createOnlineRoom);
    el("specPrev").addEventListener("click", function () { cycleSpectator(-1); });
    el("specNext").addEventListener("click", function () { cycleSpectator(1); });
    el("netLeave").addEventListener("click", leaveRoom);
    ui.start.addEventListener("click", startHostMatch);
    ui.ready.addEventListener("click", toggleReady);
    ["netMode", "netMap", "netDuration", "netBots", "netTarget", "netSpectators", "netFriendly"].forEach(function (id) {
      el(id).addEventListener("change", updateLobbyConfig);
    });
    ui.continueButton.addEventListener("click", hideNetworkOverlay);
  }

  function rememberPlayerName(input) {
    const source = input || ui.name;
    Net.localName = cleanName(source.value, "CONFEITEIRO", 14).toUpperCase();
    ui.name.value = Net.localName;
    ui.onlineName.value = Net.localName;
    saveName(Net.localName);
  }

  function openNetworkMenu() {
    if (!nativeAvailable && transportMode !== "online") return;
    if (!Net.connected) transportMode = "wifi";
    ui.title.textContent = transportMode === "online" ? "SALA ONLINE" : "SALA WI-FI DIRECT";
    ui.subtitle.textContent = transportMode === "online"
      ? "UM SERVIDOR · ATÉ 8 JOGADORES"
      : "MULTIPLAYER LOCAL · SEM INTERNET";
    showNetworkOverlay();
    if (Net.connected) {
      showLobby();
      if (Net.inMatch && !matchOver) {
        setStatus("Partida em andamento.");
        ui.continueButton.classList.remove("net-hide");
      } else {
        ui.continueButton.classList.add("net-hide");
      }
      renderPlayers();
    } else {
      showSetup();
    }
  }

  function openOnlineMenu() {
    transportMode = "online";
    ui.title.textContent = "SALAS ONLINE";
    ui.subtitle.textContent = "VARIAS SALAS AO MESMO TEMPO";
    showNetworkOverlay();
    if (Net.connected) {
      showLobby();
      renderPlayers();
    } else {
      ui.setup.classList.add("net-hide");
      ui.onlineSetup.classList.remove("net-hide");
      ui.lobby.classList.add("net-hide");
      startRoomPolling();
    }
  }

  // ------------------------------------------------------- saguão de salas
  // A lista chega por um WebSocket próprio, e não por HTTP: dentro do app o
  // jogo roda de file:// e o navegador proíbe buscar outra origem por HTTP.
  // De quebra, a lista passa a se atualizar sozinha, sem ficar perguntando.
  function startRoomPolling() {
    if (lobbySocket) return;
    openLobbyWatch(false);
  }
  function stopRoomPolling() {
    clearTimeout(roomPollTimer);
    roomPollTimer = 0;
    if (lobbySocket) {
      const socket = lobbySocket;
      lobbySocket = null;
      try {
        socket.onclose = null;
        socket.close(1000, "saiu do saguao");
      } catch (error) {}
    }
  }

  function openLobbyWatch(loud) {
    const base = normalizeOnlineAddress(ui.server.value || onlineServerAddress);
    if (!base) {
      setStatus("Digite o endereço do servidor para ver as salas.");
      return;
    }
    onlineServerAddress = base.replace(/\/game$/, "");
    stopRoomPolling();
    setStatus(loud ? "Atualizando a lista de salas…" : "Procurando salas abertas…");
    try {
      lobbySocket = new WebSocket(base + "?lobby=1");
    } catch (error) {
      setStatus("O endereço do servidor não é válido.");
      return;
    }
    const mine = lobbySocket;
    // Um servidor da versão antiga aceita a conexão e nunca manda a lista.
    // Sem este prazo a tela ficaria "Procurando…" para sempre, sem explicar nada.
    clearTimeout(roomPollTimer);
    roomPollTimer = setTimeout(function () {
      if (mine !== lobbySocket) return;
      setStatus("Este servidor ainda é da versão antiga, sem salas separadas. " +
        "Atualize o servidor para ver a lista.");
    }, 9000);
    mine.onmessage = function (event) {
      if (mine !== lobbySocket) return;
      let message;
      try {
        message = JSON.parse(String(event.data || ""));
      } catch (error) {
        return;
      }
      if (message.net !== "rooms") return;
      clearTimeout(roomPollTimer);
      onlineRooms = Array.isArray(message.rooms) ? message.rooms : [];
      renderOnlineRooms();
      setStatus(onlineRooms.length
        ? onlineRooms.length + (onlineRooms.length === 1 ? " sala aberta." : " salas abertas.")
        : "Nenhuma sala aberta agora. Toque em CRIAR SALA para abrir a sua.");
    };
    mine.onerror = function () {
      if (mine !== lobbySocket) return;
      setStatus("Não foi possível alcançar o servidor.");
    };
    mine.onclose = function () {
      if (mine !== lobbySocket) return;
      lobbySocket = null;
      onlineRooms = [];
      renderOnlineRooms();
      setStatus("O servidor pode estar acordando. Toque em ATUALIZAR daqui a pouco.");
    };
  }

  function fetchRooms(loud) {
    openLobbyWatch(loud);
  }

  const MAP_LABELS = {
    village: "VILA CONFEITO", factory: "FABRICA DE CHOCOLATE",
    park: "PARQUE DE PIRULITOS", castle: "CASTELO DE BOLO"
  };
  const MODE_LABELS = {
    deathmatch: "MATA-MATA", team: "EQUIPES", capture: "CAPTURAR O DOCE",
    king: "REI DO POTE", survival: "SOBREVIVENCIA"
  };

  function renderOnlineRooms() {
    if (!ui) return;
    const filter = cleanName(ui.roomSearch.value, "", 24).toUpperCase();
    const visible = onlineRooms.filter(function (room) {
      return !filter || String(room.name || "").toUpperCase().indexOf(filter) >= 0;
    });
    ui.roomList.innerHTML = "";
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:11px;opacity:.6;padding:8px";
      empty.textContent = filter
        ? 'Nenhuma sala com "' + filter + '" no nome.'
        : "Nenhuma sala aberta ainda.";
      ui.roomList.appendChild(empty);
      return;
    }
    visible.forEach(function (room) {
      const players = room.players | 0;
      const spectators = room.spectators | 0;
      const max = room.max | 0;
      const playing = room.status === "playing";
      const full = players >= max;
      const button = document.createElement("div");
      button.className = "net-room";

      const label = document.createElement("span");
      const title = document.createElement("b");
      title.textContent = cleanName(room.name, "SALA SUGAR STRIKE", 24);
      const meta = document.createElement("small");
      meta.className = "roomMeta";
      meta.textContent = (MAP_LABELS[room.map] || String(room.map || "").toUpperCase()) +
        " · " + (MODE_LABELS[room.mode] || String(room.mode || "").toUpperCase()) +
        " · " + (playing ? "EM PARTIDA" : "AGUARDANDO") +
        (room.locked ? " · SENHA" : "");
      label.appendChild(title);
      label.appendChild(meta);

      const count = document.createElement("span");
      count.className = "net-count";
      count.textContent = players + "/" + max + " · 👁 " + spectators;

      const actions = document.createElement("span");
      actions.className = "net-room-actions";
      const join = document.createElement("button");
      join.type = "button";
      join.textContent = full ? "CHEIA" : (playing ? "AGUARDAR" : "ENTRAR");
      join.disabled = full;
      join.addEventListener("click", function () {
        if (!full) joinOnlineRoom(room, false);
      });
      actions.appendChild(join);
      if (room.allowSpectators !== false) {
        const watch = document.createElement("button");
        watch.type = "button";
        watch.className = "watch";
        watch.textContent = "ASSISTIR";
        watch.addEventListener("click", function () { joinOnlineRoom(room, true); });
        actions.appendChild(watch);
      }

      button.appendChild(label);
      button.appendChild(count);
      button.appendChild(actions);
      ui.roomList.appendChild(button);
    });
  }

  // A sala escolhida manda no mapa e no modo da partida.
  function applyRoomToConfig(room) {
    if (!room) return;
    if (room.map) Net.config.map = room.map;
    if (room.mode) Net.config.mode = room.mode;
    if (typeof room.allowSpectators === "boolean") Net.config.allowSpectators = room.allowSpectators;
    if (typeof room.friendlyFire === "boolean") Net.config.friendlyFire = room.friendlyFire;
    if (ui) {
      const mapSelect = el("netMap"), modeSelect = el("netMode");
      if (mapSelect && room.map) mapSelect.value = room.map;
      if (modeSelect && room.mode) modeSelect.value = room.mode;
      if (el("netSpectators")) el("netSpectators").value = Net.config.allowSpectators ? "1" : "0";
      if (el("netFriendly")) el("netFriendly").value = Net.config.friendlyFire ? "1" : "0";
    }
    updateLobbyTitle();
  }

  function updateLobbyTitle() {
    if (!ui || !onlineRoomInfo || transportMode !== "online") return;
    ui.title.textContent = cleanName(onlineRoomInfo.name, "SALA ONLINE", 24);
    ui.subtitle.textContent = (MAP_LABELS[onlineRoomInfo.map] || "VILA CONFEITO") +
      " · " + (onlineRoomInfo.players | 0) + "/" + (onlineRoomInfo.max | 0) + " JOGADORES" +
      " · " + (onlineRoomInfo.spectators | 0) + " ESPECTADORES";
  }

  // Só o dono da sala muda o que a lista pública mostra.
  function publishRoomStatus(status) {
    if (transportMode !== "online" || Net.role !== "host") return;
    Net.send({ctl: "status", status: status});
  }
  function publishRoomConfig() {
    if (transportMode !== "online" || Net.role !== "host") return;
    Net.send({
      ctl: "config",
      map: Net.config.map,
      mode: Net.config.mode,
      allowSpectators: !!Net.config.allowSpectators,
      friendlyFire: !!Net.config.friendlyFire
    });
  }

  // Volta para a lista de salas sem sair do menu online.
  function showOnlineBrowser() {
    if (!ui) return;
    Net.connected = false;
    Net.role = "solo";
    Net.myId = null;
    peers.clear();
    onlineRoomInfo = null;
    ui.title.textContent = "SALAS ONLINE";
    ui.subtitle.textContent = "VARIAS SALAS AO MESMO TEMPO";
    ui.setup.classList.add("net-hide");
    ui.lobby.classList.add("net-hide");
    ui.onlineSetup.classList.remove("net-hide");
    startRoomPolling();
  }

  function joinOnlineRoom(room, spectator) {
    stopRoomPolling();
    onlineRoomInfo = room;
    setStatus((spectator ? "Entrando para assistir " : "Entrando em ") + cleanName(room.name, "SALA", 24) + "…");
    connectOnline(false, {room: room.id, spectator: !!spectator});
  }

  function createOnlineRoom() {
    const name = cleanName(el("netNewName").value, "SALA DOCE", 24).toUpperCase();
    const map = el("netNewMap").value;
    const mode = el("netNewMode").value;
    const max = clamp(parseInt(el("netNewMax").value, 10) || 8, 2, 12);
    const allowSpectators = el("netNewSpectators").value !== "0";
    const friendlyFire = el("netNewFriendly").value === "1";
    stopRoomPolling();
    Net.config.map = map;
    Net.config.mode = mode;
    Net.config.allowSpectators = allowSpectators;
    Net.config.friendlyFire = friendlyFire;
    onlineRoomInfo = null;
    setStatus("Abrindo a sala " + name + "…");
    connectOnline(false, {create: {
      name: name, map: map, mode: mode, max: max,
      allowSpectators: allowSpectators, friendlyFire: friendlyFire
    }});
  }

  function closeNetworkMenu() {
    hideNetworkOverlay();
  }

  function showNetworkOverlay() {
    if (!ui) return;
    ui.root.classList.remove("net-hide");
    firing = false;
  }

  function hideNetworkOverlay() {
    if (!ui) return;
    ui.root.classList.add("net-hide");
    stopRoomPolling();
    if (Net.inMatch && !matchOver) {
      paused = false;
      overlay.style.display = "none";
    }
  }

  function showSetup() {
    ui.setup.classList.remove("net-hide");
    ui.onlineSetup.classList.add("net-hide");
    ui.lobby.classList.add("net-hide");
  }

  function showLobby() {
    ui.setup.classList.add("net-hide");
    ui.onlineSetup.classList.add("net-hide");
    ui.lobby.classList.remove("net-hide");
    ui.start.style.display = Net.role === "host" ? "block" : "none";
    ui.ready.style.display = Net.role === "client" && !Net.spectator ? "block" : "none";
    ui.configPanel.style.display = Net.role === "host" ? "grid" : "none";
    ui.continueButton.classList.toggle("net-hide", !(Net.inMatch && !matchOver));
    stopRoomPolling();
    updateLobbyTitle();
  }

  function setStatus(text) {
    if (!ui) return;
    ui.status.textContent = text;
    el("netOnlineStatus").textContent = text;
    ui.lobbyStatus.textContent = text;
  }

  function normalizeOnlineAddress(value) {
    let address = String(value || "").trim();
    if (!address) return "";
    address = address.replace(/^https:\/\//i, "wss://");
    address = address.replace(/^http:\/\//i, "ws://");
    if (!/^wss?:\/\//i.test(address)) address = "wss://" + address;
    address = address.replace(/\/game\/?$/i, "");
    return address.replace(/\/+$/, "") + "/game";
  }

  function connectOnline(reconnecting, spec) {
    if (!reconnecting) {
      rememberPlayerName(ui.onlineName);
      Net.roomPassword = cleanName(ui.onlinePassword.value, "", 12);
      onlineEverConnected = false;
      // Entrada nova: a sessão antiga não vale para outra sala.
      onlineSession = "";
      onlineRoomId = spec && spec.room ? String(spec.room) : "";
      saveOnlineSession(onlineServerAddress, "");
    }
    const baseAddress = normalizeOnlineAddress(ui.server.value || onlineServerAddress);
    if (!baseAddress) {
      setStatus("Digite o endereço mostrado pelo servidor neste computador.");
      return;
    }
    onlineServerAddress = baseAddress.replace(/\/game$/, "");
    ui.server.value = onlineServerAddress;
    saveOnlineServer(onlineServerAddress);
    transportMode = "online";
    onlineReconnectWanted = true;
    clearTimeout(onlineReconnectTimer);
    if (onlineSocket) {
      try {
        onlineSocket.onclose = null;
        onlineSocket.close();
      } catch (error) {}
    }
    setStatus(reconnecting ? "Reconectando à sala…" : "Conectando à sala…");

    // Monta o pedido: criar uma sala, entrar numa existente ou retomar a sessão.
    const query = [];
    if (onlineSession) query.push("session=" + encodeURIComponent(onlineSession));
    if (!reconnecting && spec && spec.create) {
      query.push("create=1");
      query.push("name=" + encodeURIComponent(spec.create.name));
      query.push("map=" + encodeURIComponent(spec.create.map));
      query.push("mode=" + encodeURIComponent(spec.create.mode));
      query.push("max=" + encodeURIComponent(String(spec.create.max)));
      query.push("spectators=" + (spec.create.allowSpectators ? "1" : "0"));
      query.push("friendlyFire=" + (spec.create.friendlyFire ? "1" : "0"));
      if (Net.roomPassword) query.push("locked=1");
    } else if (onlineRoomId) {
      // Numa reconexão isto garante que a sala criada não vire uma segunda sala.
      query.push("room=" + encodeURIComponent(onlineRoomId));
    }
    if (!reconnecting && spec && spec.spectator) query.push("spectator=1");
    query.push("player=" + encodeURIComponent(Net.localName));
    query.push("identity=" + encodeURIComponent(playerIdentity));
    const socketAddress = baseAddress + (query.length ? "?" + query.join("&") : "");
    try {
      onlineSocket = new WebSocket(socketAddress);
    } catch (error) {
      setStatus("O endereço do servidor não é válido.");
      return;
    }
    onlineSocket.onopen = function () {
      setStatus("Servidor encontrado. Entrando na sala…");
    };
    onlineSocket.onmessage = function (event) {
      let message;
      try {
        message = JSON.parse(String(event.data || ""));
      } catch (error) {
        return;
      }
      if (message.net === "connected") {
        onlineEverConnected = true;
        onlineSession = cleanName(message.session, "", 80);
        saveOnlineSession(onlineServerAddress, onlineSession);
        if (message.room) {
          onlineRoomInfo = message.room;
          onlineRoomId = String(message.room.id || "");
          applyRoomToConfig(message.room);
        }
        stopRoomPolling();
        Net.onNativeEvent({
          event: "connected",
          role: message.role,
          resumed: !!message.resumed,
          spectator: !!message.spectator,
          team: message.team | 0
        });
        return;
      }
      if (message.net === "room_update") {
        if (message.room) {
          onlineRoomInfo = message.room;
          updateLobbyTitle();
        }
        return;
      }
      if (message.net === "no_room") {
        // A sala foi apagada (duas horas... ou dois minutos vazia) ou nunca existiu.
        onlineReconnectWanted = false;
        onlineRoomId = "";
        onlineSession = "";
        saveOnlineSession(onlineServerAddress, "");
        setStatus(message.reason === "SERVIDOR_LOTADO"
          ? "O servidor está com todas as salas ocupadas. Tente daqui a pouco."
          : "Essa sala não existe mais. Escolha outra na lista ou crie a sua.");
        showOnlineBrowser();
        return;
      }
      if (message.net === "spectator_blocked" || message.net === "spectator_full") {
        onlineReconnectWanted = false;
        onlineRoomId = "";
        onlineSession = "";
        saveOnlineSession(onlineServerAddress, "");
        setStatus(message.net === "spectator_full"
          ? "O espaço para espectadores desta sala está cheio."
          : "O dono desta sala bloqueou espectadores.");
        showOnlineBrowser();
        return;
      }
      if (message.net === "ammo" && player) {
        const weapon = clamp(message.w | 0, 0, WEAPONS.length - 1);
        player.mags[weapon] = Math.max(0, message.mag | 0);
        player.ress[weapon] = Math.max(0, message.res | 0);
        if (player.wep === weapon && player.reloadT <= 0) {
          player.mag = player.mags[weapon];
          player.res = player.ress[weapon];
        }
        updateHUD();
        return;
      }
      if (message.net === "promoted") {
        // O dono saiu e a vez de comandar a sala passou para este aparelho.
        Net.role = "host";
        Net.myId = "host";
        Net.ready = true;
        Net.spectator = false;
        Net.team = message.team | 0;
        Net.inMatch = false;
        peers.clear();
        peers.set("host", {
          id: "host", name: Net.localName, ready: true, ping: 0,
          version: APP_VERSION, skin: selectedSkin(),
          weapon: selectedWeapon(), accessory: selectedAccessory(),
          team: Net.team, spectator: false
        });
        if (message.room) onlineRoomInfo = message.room;
        setStatus("O dono saiu. Agora a sala é sua — aguarde todos ficarem prontos.");
        showLobby();
        renderPlayers();
        broadcastRoster();
        publishRoomStatus("lobby");
        return;
      }
      if (message.net === "host_changed") {
        // Outro jogador virou dono: reapresente-se para entrar no novo elenco.
        Net.role = "client";
        Net.ready = false;
        Net.inMatch = false;
        peers.clear();
        if (message.room) onlineRoomInfo = message.room;
        if (ui && ui.ready) ui.ready.textContent = "ESTOU PRONTO";
        setStatus("O dono da sala mudou. Reconectando ao novo dono…");
        showLobby();
        renderPlayers();
        Net.send({
          t: "hello",
          name: Net.localName,
          version: APP_VERSION,
          password: Net.roomPassword,
          skin: selectedSkin(),
          weapon: selectedWeapon(),
          accessory: selectedAccessory()
        });
        return;
      }
      if (message.net === "server_status") {
        setStatus(cleanName(message.message, "Servidor online.", 120));
        return;
      }
      if (message.net === "host_left") {
        setStatus("O criador saiu. A sala será reiniciada automaticamente…");
        return;
      }
      Net.onNativeEvent({event: "message", data: message});
    };
    onlineSocket.onerror = function () {
      setStatus("Não foi possível alcançar o servidor online.");
    };
    onlineSocket.onclose = function () {
      onlineSocket = null;
      Net.onNativeEvent({event: "transport_error"});
    };
  }

  function disconnectTransport() {
    if (transportMode === "online") {
      onlineReconnectWanted = false;
      clearTimeout(onlineReconnectTimer);
      if (onlineSocket) {
        const socket = onlineSocket;
        onlineSocket = null;
        socket.onclose = null;
        try { socket.close(1000, "leave"); } catch (error) {}
      }
      onlineSession = "";
      saveOnlineSession(onlineServerAddress, "");
      return;
    }
    if (nativeAvailable) {
      try { SugarAndroid.disconnect(); } catch (error) {}
    }
  }

  function createRoom() {
    transportMode = "wifi";
    rememberPlayerName(ui.name);
    Net.roomPassword = cleanName(ui.password.value, "", 12);
    Net.ready = true;
    updateLobbyConfig();
    Net.role = "host";
    Net.myId = "host";
    Net.connected = false;
    peers.clear();
    peers.set("host", {
      id: "host", name: Net.localName, ready: true, ping: 0,
      version: APP_VERSION, skin: selectedSkin(), weapon: selectedWeapon(),
      accessory: selectedAccessory()
    });
    showLobby();
    renderPlayers();
    setStatus("Criando o grupo Wi-Fi Direct…");
    SugarAndroid.createRoom(
      cleanName(ui.roomName.value, "SALA DOCE", 24),
      !!Net.roomPassword
    );
  }

  function searchRooms() {
    transportMode = "wifi";
    rememberPlayerName(ui.name);
    Net.role = "client";
    Net.myId = null;
    Net.connected = false;
    rooms.clear();
    renderRooms();
    setStatus("Procurando salas próximas…");
    SugarAndroid.discoverRooms();
  }

  function renderRooms() {
    if (!ui) return;
    ui.rooms.innerHTML = "";
    if (!rooms.size) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:11px;opacity:.6;padding:8px";
      empty.textContent = "Nenhuma sala encontrada ainda.";
      ui.rooms.appendChild(empty);
      return;
    }
    rooms.forEach(function (room) {
      const button = document.createElement("button");
      button.className = "net-room";
      button.type = "button";
      const label = document.createElement("span");
      const title = document.createElement("b");
      title.textContent = cleanName(room.name, "SALA SUGAR STRIKE", 24);
      const device = document.createElement("small");
      device.textContent = cleanName(room.device, "APARELHO PRÓXIMO", 28);
      label.appendChild(title);
      label.appendChild(device);
      const badge = document.createElement("span");
      badge.className = "net-badge";
      badge.textContent = room.locked ? "SENHA" : "ENTRAR";
      button.appendChild(label);
      button.appendChild(badge);
      button.addEventListener("click", function () {
        Net.roomPassword = cleanName(ui.password.value, "", 12);
        rooms.clear();
        showLobby();
        setStatus("Entrando em " + title.textContent + "…");
        SugarAndroid.connectToRoom(room.address);
      });
      ui.rooms.appendChild(button);
    });
  }

  function renderPlayers() {
    if (!ui) return;
    ui.players.innerHTML = "";
    const list = Array.from(peers.values());
    if (!list.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size:12px;opacity:.65;padding:8px";
      empty.textContent = "Aguardando jogadores...";
      ui.players.appendChild(empty);
    } else {
      list.forEach(function (entry) {
        const row = document.createElement("div");
        row.className = "net-player";
        const label = document.createElement("span");
        const name = document.createElement("b");
        name.textContent = entry.name;
        const detail = document.createElement("small");
        const connection = entry.id === "host" ? "CRIADOR DA SALA" : ((entry.ping || 0) + " ms");
        const version = entry.version && entry.version !== APP_VERSION
          ? " - VERSAO " + entry.version
          : "";
        // Mostra o que cada um vai levar para a partida.
        const kit = WEAPONS[safePrimary(entry.weapon)].name +
          " + " + WEAPONS[safeAccessory(entry.accessory)].name;
        const team = entry.spectator ? "ESPECTADOR" :
          (entry.team === 1 ? "EQUIPE VERMELHA" : (entry.team === 2 ? "EQUIPE VERDE E AMARELA" : "SEM EQUIPE"));
        detail.textContent = connection + version + " · " + team + (entry.spectator ? "" : " · " + kit);
        label.appendChild(name);
        label.appendChild(detail);
        const badge = document.createElement("span");
        badge.className = "net-badge" + (entry.ready || entry.spectator ? "" : " wait") +
          (entry.team === 1 ? " team1" : (entry.team === 2 ? " team2" : "")) +
          (entry.version && entry.version !== APP_VERSION ? " bad" : "");
        badge.textContent = entry.id === Net.myId ? "VOCÊ" :
          (entry.spectator ? "ASSISTINDO" : (entry.ready ? "PRONTO" : "AGUARDE"));
        row.appendChild(label);
        row.appendChild(badge);
        ui.players.appendChild(row);
      });
    }
    const compatible = list.every(function (entry) {
      return !entry.version || entry.version === APP_VERSION;
    });
    const combatants = list.filter(function (entry) { return !entry.spectator; });
    const everyoneReady = combatants.every(function (entry) {
      return entry.id === "host" || entry.ready;
    });
    ui.start.disabled = Net.role !== "host" || combatants.length < 2 || !Net.connected ||
      !compatible || !everyoneReady;
  }

  function selectedSkin() {
    return window.SugarEnhance && SugarEnhance.selectedSkin
      ? SugarEnhance.selectedSkin()
      : null;
  }
  function selectedWeapon() {
    return window.SugarEnhance && SugarEnhance.startingWeapon
      ? SugarEnhance.startingWeapon()
      : LOADOUT[0];
  }
  // Um pacote sem o campo, ou com o indice errado, nao pode acabar mostrando
  // uma arma principal no lugar do acessorio (0 vira CARAMELO ASSAULT).
  function safePrimary(value) {
    const index = clamp(value | 0, 0, WEAPONS.length - 1);
    return PRIMARIES.indexOf(index) >= 0 ? index : LOADOUT[0];
  }
  function safeAccessory(value) {
    const index = clamp(value | 0, 0, WEAPONS.length - 1);
    return ACCESSORIES.indexOf(index) >= 0 ? index : ACCESSORIES[0];
  }
  function selectedAccessory() {
    return window.SugarEnhance && SugarEnhance.startingAccessory
      ? SugarEnhance.startingAccessory()
      : LOADOUT[1];
  }

  function updateLobbyConfig() {
    if (!ui) return;
    Net.config.mode = el("netMode").value;
    Net.config.map = el("netMap").value;
    Net.config.duration = clamp(parseInt(el("netDuration").value, 10) || 5, 1, 30);
    Net.config.bots = clamp(parseInt(el("netBots").value, 10) || 0, 0, 12);
    Net.config.target = clamp(parseInt(el("netTarget").value, 10) || 25, 5, 100);
    Net.config.allowSpectators = el("netSpectators").value !== "0";
    Net.config.friendlyFire = el("netFriendly").value === "1";
    if (Net.role === "host" && Net.connected) {
      broadcastRoster();
      publishRoomConfig();   // mapa e modo novos aparecem na lista pública
    }
  }

  function toggleReady() {
    if (Net.role !== "client" || !Net.connected || Net.spectator) return;
    Net.ready = !Net.ready;
    ui.ready.textContent = Net.ready ? "CANCELAR PRONTO" : "ESTOU PRONTO";
    Net.send({t: "ready", ready: Net.ready});
  }

  function leaveRoom() {
    let handedOff = false;
    if (
      transportMode === "wifi" && Net.role === "host" &&
      Net.connected && peers.size > 1
    ) {
      const successor = Array.from(peers.values()).find(function (entry) {
        return entry.id !== "host";
      });
      if (successor) {
        handedOff = true;
        Net.send({
          t: "migrate",
          successor: successor.id,
          room: cleanName(ui.roomName.value, "SALA DOCE", 24),
          password: Net.roomPassword,
          config: Net.config
        });
      }
    }
    if (transportMode === "wifi" && nativeAvailable) {
      if (handedOff) setTimeout(function () { SugarAndroid.disconnect(); }, 450);
      else SugarAndroid.disconnect();
    } else {
      disconnectTransport();
    }
    Net.connected = false;
    Net.inMatch = false;
    Net.role = "solo";
    Net.myId = null;
    Net.ready = false;
    peers.clear();
    rooms.clear();
    // Sai da sala online de vez: nada de reconectar sozinho nela depois.
    stopRoomPolling();
    onlineRoomId = "";
    onlineRoomInfo = null;
    firing = false;
    matchOver = false;
    paused = true;
    hideNetworkOverlay();
    overlay.style.display = "flex";
    el("bPlay").classList.remove("hide");
    el("bPlay").textContent = "JOGAR";
    el("bResume").classList.add("hide");
    el("bMulti").classList.remove("hide");
    el("bOnline").classList.remove("hide");
    el("bMulti").textContent = "MULTIPLAYER WI-FI DIRECT";
    el("bOnline").textContent = "JOGAR ONLINE";
    panelEl.querySelector("h1").textContent = "SUGAR STRIKE";
    panelEl.querySelector("h2").textContent = "DOCE GUERRA NA VILA CONFEITO";
    el("ptxt").style.display = "block";
    el("sensWrap").style.display = "block";
  }

  function broadcastRoster() {
    if (Net.role !== "host" || !Net.connected) return;
    Net.send({
      t: "roster",
      players: Array.from(peers.values()),
      config: Net.config
    });
  }

  function handleMessage(message) {
    if (message.to && message.to !== Net.myId) return;

    if (message.net === "welcome") {
      Net.myId = cleanName(message.id, "p?", 12);
      Net.spectator = !!message.spectator;
      Net.team = message.team | 0;
      Net.send({
        t: "hello",
        name: Net.localName,
        version: APP_VERSION,
        password: Net.roomPassword,
        skin: selectedSkin(),
        weapon: selectedWeapon(),
        accessory: selectedAccessory()
      });
      return;
    }
    if (message.net === "full") {
      setStatus("Essa sala já está cheia.");
      return;
    }
    if (message.net === "peer_join" && Net.role === "host") {
      setStatus("Um amigo entrou. Aguardando o nome dele…");
      return;
    }
    if (message.net === "peer_leave" && Net.role === "host") {
      const id = String(message.id || "");
      peers.delete(id);
      if (Net.inMatch) convertDisconnectedPlayerToBot(id);
      broadcastRoster();
      renderPlayers();
      return;
    }

    if (message.t === "hello" && Net.role === "host") {
      const id = String(message.from || "");
      if (!id) return;
      if (String(message.version || "") !== APP_VERSION) {
        Net.send({t: "join_denied", to: id, reason: "VERSAO_DIFERENTE", version: APP_VERSION});
        return;
      }
      if (Net.roomPassword && String(message.password || "") !== Net.roomPassword) {
        Net.send({t: "join_denied", to: id, reason: "SENHA_INCORRETA"});
        return;
      }
      peers.set(id, {
        id: id,
        name: cleanName(message.name, "CONVIDADO", 14).toUpperCase(),
        ready: false,
        ping: 0,
        version: String(message.version || ""),
        skin: message.skin || null,
        weapon: safePrimary(message.weapon),
        accessory: safeAccessory(message.accessory),
        team: message.team | 0,
        spectator: !!message.spectator
      });
      setStatus(peers.get(id).name + " entrou na sala.");
      broadcastRoster();
      renderPlayers();
      if (peers.get(id).spectator && Net.inMatch) {
        Net.send({
          t: "start",
          to: id,
          seed: Net.matchSeed,
          config: Net.config,
          entities: ents.map(fullEntity)
        });
      }
      return;
    }
    if (message.t === "join_denied" && Net.role === "client") {
      const reason = message.reason === "SENHA_INCORRETA"
        ? "Senha incorreta."
        : "Versao diferente. Atualize todos para " + (message.version || APP_VERSION) + ".";
      setStatus(reason);
      disconnectTransport();
      return;
    }
    if (message.t === "ready" && Net.role === "host") {
      const readyPeer = peers.get(String(message.from || ""));
      if (readyPeer) {
        if (!readyPeer.spectator) readyPeer.ready = !!message.ready;
        broadcastRoster();
        renderPlayers();
      }
      return;
    }
    if (message.t === "roster" && Net.role === "client") {
      peers.clear();
      (message.players || []).forEach(function (entry) {
        if (entry && entry.id) {
          peers.set(String(entry.id), {
            id: String(entry.id),
            name: cleanName(entry.name, "JOGADOR", 14),
            ready: !!entry.ready,
            ping: entry.ping | 0,
            version: String(entry.version || ""),
            skin: entry.skin || null,
            weapon: safePrimary(entry.weapon),
            accessory: safeAccessory(entry.accessory),
            team: entry.team | 0,
            spectator: !!entry.spectator
          });
        }
      });
      if (message.config) {
        Net.config = Object.assign(Net.config, message.config);
      }
      renderPlayers();
      setStatus("Na sala. Aguarde o criador iniciar a partida.");
      return;
    }
    if (message.t === "ping") {
      Net.send({t: "pong", to: message.from, seq: message.seq, sent: message.sent});
      return;
    }
    if (message.t === "pong" && Net.role === "host") {
      const pongPeer = peers.get(String(message.from || ""));
      if (pongPeer) {
        pongPeer.ping = Math.max(0, Math.round(performance.now() - finite(message.sent, performance.now())));
        renderPlayers();
      }
      return;
    }
    if (message.t === "migrate") {
      beginMigration(message);
      return;
    }
    if (message.t === "start" && Net.role === "client") {
      startClientMatch(message);
      return;
    }
    if (message.t === "state" && Net.role === "host" && Net.inMatch) {
      applyRemotePlayerState(String(message.from || ""), message);
      return;
    }
    if (message.t === "shoot" && Net.role === "host" && Net.inMatch) {
      hostRemoteShoot(String(message.from || ""), message);
      return;
    }
    if (message.t === "reload_start" && Net.role === "host" && Net.inMatch) {
      hostRemoteReloadStart(String(message.from || ""), message);
      return;
    }
    if (message.t === "reload_commit" && Net.role === "host" && Net.inMatch) {
      hostRemoteReloadCommit(String(message.from || ""), message);
      return;
    }
    if (message.t === "reload_cancel" && Net.role === "host" && Net.inMatch) {
      hostRemoteReloadCancel(String(message.from || ""));
      return;
    }
    if (message.t === "world" && Net.role === "client" && Net.inMatch) {
      applyWorld(message);
      return;
    }
    if (message.t === "fx_shot" && Net.role === "client" && Net.inMatch) {
      showRemoteShot(message);
      return;
    }
    if (message.t === "fx_reload" && Net.role === "client" && Net.inMatch) {
      showRemoteReload(message);
      return;
    }
    if (message.t === "feed" && Net.role === "client") {
      original.addFeed(message.a, message.b, !!message.head);
      return;
    }
    if (message.t === "hit" && Net.role === "client") {
      hitMark = message.killed ? 0.46 : 0.3;
      snd.hit(!!message.head);
      return;
    }
    if (message.t === "melee_cooldown" && Net.role === "client" && player) {
      player.meleeT = Math.max(player.meleeT || 0, finite(message.time, 0));
      updateHUD();
      return;
    }
    if (message.t === "end" && Net.role === "client" && Net.inMatch) {
      const winner = findEntity(message.winner);
      if (winner) endMatch(winner);
      finishNetworkRoundUi();
    }
  }

  function startHostMatch() {
    const combatants = Array.from(peers.values()).filter(function (entry) { return !entry.spectator; });
    if (Net.role !== "host" || combatants.length < 2 || !Net.connected) return;
    updateLobbyConfig();
    TARGET = Net.config.target;
    if (window.SugarEnhance && SugarEnhance.applyNetworkConfig) {
      SugarEnhance.applyNetworkConfig(Net.config);
    }
    const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
    Net.matchSeed = seed;
    Net.roundEnding = false;
    Net.inMatch = true;
    Net.stateClock = 0;
    Net.worldClock = 0;
    Net.sequence = 0;
    rebuildTown(seed);
    createHostEntities();
    beginNetworkRound();
    publishRoomStatus("playing");   // a lista pública passa a mostrar EM PARTIDA
    Net.send({
      t: "start",
      seed: seed,
      config: Net.config,
      entities: ents.map(fullEntity)
    });
  }

  function createHostEntities() {
    ents = [];
    particles = [];
    feed = [];
    matchOver = false;

    player = newEnt(Net.localName, false);
    player.netId = "host";
    player.remote = false;
    player.wep = selectedWeapon();
    player.accessory = selectedAccessory();
    player.team = Net.team || 1;
    if (selectedSkin()) player.skin = selectedSkin();
    ents.push(player);

    // O limite de gente é o que o dono escolheu ao criar a sala.
    const seats = onlineRoomInfo ? clamp(onlineRoomInfo.max | 0, 2, 12) : 8;
    peers.forEach(function (entry, id) {
      if (id === "host" || entry.spectator || ents.length >= seats) return;
      const remote = newEnt(entry.name, false);
      remote.netId = id;
      remote.remote = true;
      remote.aiming = false;
      remote.wep = clamp(entry.weapon | 0, 0, WEAPONS.length - 1);
      remote.accessory = safeAccessory(entry.accessory);
      remote.team = entry.team | 0;
      if (entry.skin) remote.skin = entry.skin;
      ents.push(remote);
    });

    const pool = NAMES.slice();
    let botNumber = 0;
    const desiredTotal = Math.min(16, ents.length + Net.config.bots);
    while (ents.length < desiredTotal) {
      const name = pool.length
        ? pool.splice((Math.random() * pool.length) | 0, 1)[0]
        : "BOT " + (botNumber + 1);
      const bot = newEnt(name, true);
      bot.netId = "bot" + botNumber++;
      bot.remote = false;
      ents.push(bot);
    }

    if (window.SugarEnhance && SugarEnhance.assignTeams) {
      SugarEnhance.assignTeams(ents, Net.config.mode);
    }
    // Para jogadores humanos, a equipe que veio do servidor sempre prevalece.
    ents.forEach(function (entity) {
      if (!entity.bot && entity.netId === "host") entity.team = Net.team || entity.team || 1;
      else if (!entity.bot) {
        const official = peers.get(entity.netId);
        if (official && official.team) entity.team = official.team;
      }
    });
    for (const entity of ents) original.respawn(entity);
    ents.forEach(function (entity) {
      const weapon = clamp(entity.wep | 0, 0, WEAPONS.length - 1);
      entity.wep = weapon;
      entity.mag = entity.mags[weapon];
      entity.res = entity.ress[weapon];
    });
    player.z = 22;
    player.x = 0;
    cam.yaw = Math.PI;
    cam.pitch = 0;
    updateHUD();
  }

  function startClientMatch(message) {
    if (message.config) Net.config = Object.assign(Net.config, message.config);
    TARGET = Net.config.target;
    if (window.SugarEnhance && SugarEnhance.applyNetworkConfig) {
      SugarEnhance.applyNetworkConfig(Net.config);
    }
    const seed = Number(message.seed) >>> 0;
    rebuildTown(seed);
    ents = [];
    particles = [];
    feed = [];
    matchOver = false;

    (message.entities || []).forEach(function (data) {
      const entity = entityFromFull(data);
      if (entity) ents.push(entity);
    });
    player = ents.find(function (entity) { return entity.netId === Net.myId; }) || null;
    if (!player && !Net.spectator) {
      setStatus("Seu jogador não foi incluído nesta rodada.");
      showNetworkOverlay();
      return;
    }
    if (Net.spectator) {
      // O observador local não existe no mundo físico e nunca é enviado ao servidor.
      player = newEnt(Net.localName, false);
      player.netId = "spectator-local";
      player.spectator = true;
      player.dead = true;
      player.remote = false;
      spectatorTargetId = "";
      chooseSpectatorTarget(1);
    } else {
      player.bot = false;
      player.remote = false;
      cam.x = player.x;
      cam.y = player.y + 1.62;
      cam.z = player.z;
      cam.yaw = player.yaw || Math.PI;
      cam.pitch = player.pitch || 0;
    }
    Net.roundEnding = false;
    Net.inMatch = true;
    Net.stateClock = 0;
    Net.worldClock = 0;
    updateHUD();
    beginNetworkRound();
  }

  function beginNetworkRound() {
    paused = false;
    matchOver = false;
    boardEl.style.display = "none";
    overlay.style.display = "none";
    el("ptxt").style.display = "none";
    el(transportMode === "online" ? "bOnline" : "bMulti").textContent = "VOLTAR À SALA";
    hideNetworkOverlay();
    document.documentElement.classList.toggle("spectating", !!Net.spectator);
    afterStart();
  }

  function finishNetworkRoundUi() {
    firing = false;
    publishRoomStatus("lobby");   // a sala volta a aparecer como AGUARDANDO
    el("bPlay").classList.add("hide");
    const roomButton = el(transportMode === "online" ? "bOnline" : "bMulti");
    const otherButton = el(transportMode === "online" ? "bMulti" : "bOnline");
    roomButton.classList.remove("hide");
    roomButton.textContent = "VOLTAR À SALA";
    otherButton.classList.add("hide");
    document.documentElement.classList.remove("spectating");
    if (spectatorHud) spectatorHud.classList.remove("show");
  }

  function spectatorCandidates() {
    return ents.filter(function (entity) {
      return entity && !entity.dead && !entity.spectator;
    });
  }

  function chooseSpectatorTarget(direction) {
    const candidates = spectatorCandidates();
    if (!candidates.length) {
      spectatorTargetId = "";
      return null;
    }
    let index = candidates.findIndex(function (entity) {
      return entity.netId === spectatorTargetId;
    });
    if (index < 0) index = direction < 0 ? 0 : -1;
    index = (index + direction + candidates.length) % candidates.length;
    spectatorTargetId = candidates[index].netId;
    return candidates[index];
  }

  function observedEntity() {
    let target = findEntity(spectatorTargetId);
    if (!target || target.dead) target = chooseSpectatorTarget(1);
    return target || null;
  }

  function cycleSpectator(direction) {
    if (!Net.inMatch || !(Net.spectator || (player && player.dead))) return;
    chooseSpectatorTarget(direction < 0 ? -1 : 1);
    updateSpectatorHud();
  }

  function updateSpectatorCamera(dt) {
    const target = observedEntity();
    if (!target) {
      updateSpectatorHud();
      return;
    }
    const yaw = finite(target.yaw, 0);
    const desiredX = target.x + Math.sin(yaw) * 4.2;
    const desiredZ = target.z + Math.cos(yaw) * 4.2;
    const desiredY = target.y + 2.55;
    const amount = Math.min(1, dt * 9);
    cam.x = lerp(cam.x, desiredX, amount);
    cam.y = lerp(cam.y, desiredY, amount);
    cam.z = lerp(cam.z, desiredZ, amount);
    cam.yaw = yaw;
    cam.pitch = -0.14;
    updateSpectatorHud();
  }

  function updateSpectatorHud() {
    if (!spectatorHud) return;
    const active = Net.inMatch && (Net.spectator || (player && player.dead));
    spectatorHud.classList.toggle("show", !!active);
    document.documentElement.classList.toggle("spectating", !!active);
    if (!active) return;
    const target = observedEntity();
    if (!target) {
      el("specName").textContent = "AGUARDANDO JOGADOR VIVO";
      el("specData").textContent = "Nenhum combatente disponível.";
      return;
    }
    const weapon = WEAPONS[clamp(target.wep | 0, 0, WEAPONS.length - 1)];
    const accessory = WEAPONS[safeAccessory(target.accessory)];
    const team = target.team === 1 ? "VERMELHA" :
      (target.team === 2 ? "VERDE E AMARELA" : "SEM EQUIPE");
    const ammo = weapon.melee ? "∞" : Math.max(0, target.mag | 0) + "/" + Math.max(0, target.res | 0);
    el("specName").textContent = target.name;
    el("specData").textContent = "EQUIPE " + team + " · VIDA " + Math.round(target.hp) +
      " · " + weapon.name + " · MUNIÇÃO " + ammo + " · " + accessory.name +
      " · " + (target.score | 0) + " ELIMINAÇÕES";
  }

  Net.observedEntity = observedEntity;

  function rebuildTown(seed) {
    if (window.SugarEnhance && SugarEnhance.rebuildMap) {
      SugarEnhance.rebuildMap(seed);
      return;
    }
    let state = seed || 1;
    const oldRandom = Math.random;
    Math.random = function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    statics.length = 0;
    solids.length = 0;
    signs.length = 0;
    try {
      buildTown();
    } finally {
      Math.random = oldRandom;
    }
  }

  function fullEntity(entity) {
    const data = snapshotEntity(entity);
    data.name = entity.name;
    data.bot = !!entity.bot;
    data.skin = entity.skin;
    data.mag = entity.mag;
    data.res = entity.res;
    return data;
  }

  function entityFromFull(data) {
    if (!data || !data.id) return null;
    const entity = newEnt(cleanName(data.name, "JOGADOR", 14), !!data.bot);
    entity.netId = String(data.id);
    entity.remote = entity.netId !== Net.myId;
    entity.skin = data.skin || entity.skin;
    applyEntityFields(entity, data, true);
    entity.mag = finite(data.mag, WEAPONS[entity.wep].mag);
    entity.res = finite(data.res, WEAPONS[entity.wep].maxRes);
    entity.mags[entity.wep] = entity.mag;
    entity.ress[entity.wep] = entity.res;
    return entity;
  }

  function snapshotEntity(entity) {
    return {
      id: entity.netId,
      x: round3(entity.x),
      y: round3(entity.y),
      z: round3(entity.z),
      yaw: round3(entity === player ? cam.yaw : entity.yaw),
      pitch: round3(entity === player ? cam.pitch : (entity.pitch || 0)),
      hp: Math.max(0, Math.round(entity.hp)),
      dead: !!entity.dead,
      score: entity.score | 0,
      deaths: entity.deaths | 0,
      wep: entity.wep | 0,
      walk: round3(entity.walk || 0),
      speed: round3(entity.speed || 0),
      aiming: !!entity.aiming,
      team: entity.team | 0,
      mag: Math.max(0, entity.mag | 0),
      res: Math.max(0, entity.res | 0),
      accessory: safeAccessory(entity.accessory),
      reload: round3(entity.reloadT || 0),
      reloadDuration: round3(entity.reloadDuration || 0),
      shield: round3(entity.shield || 0),
      shots: entity.shots | 0,
      hits: entity.hits | 0,
      headshots: entity.headshots | 0,
      streak: entity.streak | 0,
      bestStreak: entity.bestStreak | 0,
      prot: round3(entity.prot || 0),
      respawn: round3(entity.respawnT || 0),
      last: entity.lastHitBy ? entity.lastHitBy.netId : null
    };
  }

  function sendLocalState() {
    if (!player || player.dead) return;
    const moving = !!(
      keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD ||
      keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight ||
      joy.active
    );
    Net.send({
      t: "state",
      x: round3(player.x),
      y: round3(player.y),
      z: round3(player.z),
      yaw: round3(cam.yaw),
      pitch: round3(cam.pitch),
      wep: player.wep | 0,
      moving: moving,
      aiming: !!firing
    });
  }

  function applyRemotePlayerState(id, message) {
    const entity = findEntity(id);
    if (!entity || !entity.remote || entity.dead) return;
    const x = clamp(finite(message.x, entity.x), -74, 74);
    const y = clamp(finite(message.y, entity.y), 0, 18);
    const z = clamp(finite(message.z, entity.z), -74, 74);
    const distance = Math.hypot(x - entity.x, z - entity.z);
    if (distance < 8) {
      entity.x = x;
      entity.y = y;
      entity.z = z;
    }
    entity.yaw = finite(message.yaw, entity.yaw);
    entity.pitch = clamp(finite(message.pitch, 0), -1.4, 1.4);
    const nextWeapon = clamp(message.wep | 0, 0, WEAPONS.length - 1);
    if (nextWeapon !== entity.wep) {
      entity.reloadT = 0;
      entity.reloadDuration = 0;
    }
    entity.wep = nextWeapon;
    entity.aiming = !!message.aiming;
    entity.speed = message.moving ? 1 : 0;
    if (entity.speed) entity.walk += 0.5;
  }

  function applyWorld(message) {
    const byId = new Map();
    ents.forEach(function (entity) { byId.set(entity.netId, entity); });

    (message.entities || []).forEach(function (data) {
      const entity = byId.get(String(data.id));
      if (!entity) return;
      const oldHp = entity.hp;
      const wasDead = entity.dead;

      if (entity === player) {
        applyEntityFields(entity, data, false, true);
        if ((!wasDead && entity.dead) || (wasDead && !entity.dead)) {
          entity.x = finite(data.x, entity.x);
          entity.y = finite(data.y, entity.y);
          entity.z = finite(data.z, entity.z);
          cam.x = entity.x;
          cam.z = entity.z;
        } else if (Math.hypot(entity.x - data.x, entity.z - data.z) > 7) {
          entity.x = finite(data.x, entity.x);
          entity.y = finite(data.y, entity.y);
          entity.z = finite(data.z, entity.z);
        }
        if (entity.hp < oldHp && !entity.dead) {
          dmgFlash = 1;
          dmgEl.style.opacity = 0.9;
          snd.hurt();
        }
      } else {
        entity.tx = finite(data.x, entity.x);
        entity.ty = finite(data.y, entity.y);
        entity.tz = finite(data.z, entity.z);
        entity.tyaw = finite(data.yaw, entity.yaw);
        applyEntityFields(entity, data, false);
        if (wasDead !== entity.dead) {
          entity.x = entity.tx;
          entity.y = entity.ty;
          entity.z = entity.tz;
        }
      }
    });

    (message.entities || []).forEach(function (data) {
      const entity = byId.get(String(data.id));
      if (entity) entity.lastHitBy = data.last ? byId.get(String(data.last)) || null : null;
    });
    updateHUD();
  }

  function applyEntityFields(entity, data, includePosition, keepOwnWeapon) {
    if (includePosition) {
      entity.x = finite(data.x, 0);
      entity.y = finite(data.y, 0);
      entity.z = finite(data.z, 0);
      entity.yaw = finite(data.yaw, 0);
      entity.pitch = finite(data.pitch, 0);
    }
    entity.hp = clamp(finite(data.hp, entity.hp), 0, 100);
    entity.dead = !!data.dead;
    entity.score = data.score | 0;
    entity.deaths = data.deaths | 0;
    // A propria arma do cliente e escolha local: o pacote do dono chega atrasado
    // (ate um ciclo de rede) e sobrescrever aqui desfazia a troca que acabou de acontecer.
    if (!keepOwnWeapon) entity.wep = clamp(data.wep | 0, 0, WEAPONS.length - 1);
    entity.team = data.team | 0;
    entity.mag = Math.max(0, finite(data.mag, entity.mag) | 0);
    entity.res = Math.max(0, finite(data.res, entity.res) | 0);
    entity.mags[entity.wep] = entity.mag;
    entity.ress[entity.wep] = entity.res;
    entity.accessory = safeAccessory(data.accessory);
    entity.reloadT = Math.max(0, finite(data.reload, entity.reloadT || 0));
    entity.reloadDuration = Math.max(entity.reloadT, finite(data.reloadDuration, entity.reloadDuration || 0));
    entity.shield = Math.max(0, finite(data.shield, entity.shield || 0));
    entity.shots = data.shots | 0;
    entity.hits = data.hits | 0;
    entity.headshots = data.headshots | 0;
    entity.streak = data.streak | 0;
    entity.bestStreak = data.bestStreak | 0;
    entity.walk = finite(data.walk, entity.walk);
    entity.speed = finite(data.speed, entity.speed);
    entity.aiming = !!data.aiming;
    entity.prot = Math.max(0, finite(data.prot, entity.prot));
    entity.respawnT = Math.max(0, finite(data.respawn, entity.respawnT));
  }

  function interpolateRemote(entity, dt) {
    if (Net.role !== "client" || entity.tx === undefined) return;
    const t = Math.min(1, dt * 13);
    entity.x = lerp(entity.x, entity.tx, t);
    entity.y = lerp(entity.y, entity.ty, t);
    entity.z = lerp(entity.z, entity.tz, t);
    let angle = entity.tyaw - entity.yaw;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    entity.yaw += angle * t;
  }

  function clientShoot(entity) {
    const weapon = WEAPONS[entity.wep];
    if (entity.reloadT > 0 || entity.fireT > 0) return;
    // Corpo a corpo usa mag=0 por definicao. So armas com municao podem ser
    // bloqueadas ou descontadas por carregador vazio.
    if (!weapon.melee && entity.mag <= 0) return;
    if (!weapon.melee) entity.mag--;
    entity.fireT = weapon.rate;
    let dx = -Math.sin(cam.yaw) * Math.cos(cam.pitch);
    let dy = Math.sin(cam.pitch);
    let dz = -Math.cos(cam.yaw) * Math.cos(cam.pitch);
    if (window.SugarEnhance && SugarEnhance.assistAim) {
      const assisted = SugarEnhance.assistAim(entity, dx, dy, dz);
      dx = assisted.dx; dy = assisted.dy; dz = assisted.dz;
    }
    if (!weapon.melee) {
      recoil += weapon.kick;
      camShake = Math.max(camShake, weapon.kick * 7);
      if (!weapon.thrown) flash = 0.055;
    }
    wKick = 1;
    snd.fire(weapon);
    if (window.SugarEnhance && SugarEnhance.onShot) SugarEnhance.onShot(entity);
    updateHUD();
    Net.send({
      t: "shoot",
      w: entity.wep,
      d: [round3(dx), round3(dy), round3(dz)]
    });
  }

  function hostRemoteShoot(id, message) {
    const entity = findEntity(id);
    if (!entity || !entity.remote || entity.dead || entity.fireT > 0 || entity.reloadT > 0) return;
    const weaponIndex = clamp(message.w | 0, 0, WEAPONS.length - 1);
    if (weaponIndex !== entity.wep) return;
    const direction = Array.isArray(message.d) ? message.d : [];
    let dx = finite(direction[0], 0);
    let dy = finite(direction[1], 0);
    let dz = finite(direction[2], -1);
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.5 || length > 1.5) return;
    dx /= length;
    dy /= length;
    dz /= length;

    const weapon = WEAPONS[entity.wep];
    if (!weapon.melee && finite(message.serverMag, -1) < 0) return;
    if (!weapon.melee) {
      entity.mag = Math.max(0, message.serverMag | 0);
      entity.res = Math.max(0, message.serverRes | 0);
      entity.mags[entity.wep] = entity.mag;
      entity.ress[entity.wep] = entity.res;
    }
    entity.fireT = weapon.rate;
    entity.aiming = true;
    const charged = !!(weapon.melee && weapon.first && (entity.meleeT || 0) <= 0);
    const damageScale = charged ? weapon.first / Math.max(1, weapon.dmg) : 1;
    const ex = entity.x;
    const ey = entity.y + 1.55;
    const ez = entity.z;
    let registered = false;
    for (let i = 0; i < weapon.pellets; i++) {
      let sx = dx + rnd(-weapon.spread, weapon.spread);
      let sy = dy + rnd(-weapon.spread, weapon.spread);
      let sz = dz + rnd(-weapon.spread, weapon.spread);
      const spreadLength = Math.hypot(sx, sy, sz);
      sx /= spreadLength;
      sy /= spreadLength;
      sz /= spreadLength;
      if (traceShot(ex, ey, ez, sx, sy, sz, entity, weapon, damageScale)) {
        registered = true;
      }
    }
    if (charged && registered) {
      entity.meleeT = weapon.firstDelay || 1.5;
      Net.send({t: "melee_cooldown", to: id, time: entity.meleeT});
    }
    if (!weapon.melee) muzzles.push({x: ex, y: ey, z: ez, t: 0.06});
    Net.send({t: "fx_shot", id: entity.netId, x: ex, y: ey, z: ez, w: entity.wep});
  }

  function hostRemoteReloadStart(id, message) {
    const entity = findEntity(id);
    if (!entity || !entity.remote || entity.dead) return;
    const weapon = clamp(message.w | 0, 0, WEAPONS.length - 1);
    if (weapon !== entity.wep || WEAPONS[weapon].melee || WEAPONS[weapon].thrown) return;
    entity.reloadDuration = Math.max(0.2, finite(message.duration, WEAPONS[weapon].reload));
    entity.reloadT = entity.reloadDuration;
    entity.reloadWep = weapon;
    entity.reloadStage = 0;
    Net.send({t: "fx_reload", id: id, w: weapon, duration: entity.reloadDuration});
  }

  function hostRemoteReloadCommit(id, message) {
    const entity = findEntity(id);
    if (!entity || !entity.remote) return;
    const weapon = clamp(message.w | 0, 0, WEAPONS.length - 1);
    if (weapon !== entity.wep) return;
    entity.mag = Math.max(0, message.mag | 0);
    entity.res = Math.max(0, message.res | 0);
    entity.mags[weapon] = entity.mag;
    entity.ress[weapon] = entity.res;
    entity.reloadT = 0;
    entity.reloadDuration = 0;
    entity.reloadStage = 0;
  }

  function hostRemoteReloadCancel(id) {
    const entity = findEntity(id);
    if (!entity || !entity.remote) return;
    entity.reloadT = 0;
    entity.reloadDuration = 0;
    entity.reloadStage = 0;
  }

  function showRemoteReload(message) {
    const entity = findEntity(String(message.id || ""));
    if (!entity || entity === player) return;
    entity.reloadDuration = Math.max(0.2, finite(message.duration, WEAPONS[entity.wep].reload));
    entity.reloadT = entity.reloadDuration;
    entity.reloadWep = clamp(message.w | 0, 0, WEAPONS.length - 1);
    if (snd.reload) snd.reload();
  }

  function showRemoteShot(message) {
    const entity = findEntity(String(message.id || ""));
    if (!entity || entity === player) return;
    const weapon = WEAPONS[clamp(message.w | 0, 0, WEAPONS.length - 1)];
    entity.aiming = true;
    if (!weapon.melee) {
      muzzles.push({
        x: finite(message.x, entity.x),
        y: finite(message.y, entity.y + 1.45),
        z: finite(message.z, entity.z),
        t: 0.06
      });
    }
    if (snd.shotSpatial) snd.shotSpatial(weapon.snd, entity.x, entity.z);
    else snd.shotFar(weapon.snd, Math.hypot(entity.x - player.x, entity.z - player.z));
    setTimeout(function () { entity.aiming = false; }, 120);
  }

  function convertDisconnectedPlayerToBot(id) {
    const entity = findEntity(id);
    if (!entity) return;
    entity.remote = false;
    entity.bot = true;
    entity.netId = "left-" + id;
    entity.name = cleanName(entity.name, "JOGADOR", 10) + " BOT";
    entity.target = null;
    entity.think = 0;
  }

  function findEntity(id) {
    return ents.find(function (entity) { return entity.netId === id; }) || null;
  }

  function beginMigration(message) {
    if (transportMode === "online") return;
    const room = cleanName(message.room, "SALA DOCE", 24);
    Net.migration = {room: room, config: message.config || Net.config};
    Net.config = Object.assign(Net.config, Net.migration.config);
    Net.roomPassword = cleanName(message.password, "", 12);
    Net.inMatch = false;
    setStatus("O criador saiu. Transferindo a sala...");
    try { SugarAndroid.disconnect(); } catch (error) {}
    if (String(message.successor || "") === Net.myId) {
      setTimeout(function () {
        Net.role = "host";
        Net.myId = "host";
        ui.roomName.value = room;
        Net.migration = null;
        createRoom();
      }, 1200);
    } else {
      setTimeout(function () {
        Net.role = "client";
        SugarAndroid.discoverRooms();
      }, 1800);
    }
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function round3(value) {
    return Math.round((Number(value) || 0) * 1000) / 1000;
  }

  updateBot = function (entity, dt) {
    if (Net.inMatch && (Net.role === "client" || entity.remote)) {
      if (Net.role === "host" && entity.remote) {
        entity.fireT = Math.max(0, entity.fireT - dt);
        entity.meleeT = Math.max(0, (entity.meleeT || 0) - dt);
      }
      interpolateRemote(entity, dt);
      return;
    }
    original.updateBot(entity, dt);
  };

  updatePlayer = function (dt) {
    if (Net.inMatch && player && (Net.spectator || (Net.role === "client" && player.dead))) {
      updateSpectatorCamera(dt);
      Net.tick(dt);
      return;
    }
    original.updatePlayer(dt);
    updateSpectatorHud();
    if (Net.inMatch) Net.tick(dt);
  };

  respawn = function (entity) {
    if (Net.inMatch && Net.role === "client") return;
    original.respawn(entity);
  };

  shoot = function (entity) {
    if (Net.inMatch && (Net.spectator || (entity && entity.spectator))) return;
    if (Net.inMatch && Net.role === "client" && entity === player) {
      clientShoot(entity);
      return;
    }
    const before = entity.mag;
    const beforeFireT = entity.fireT;
    const weapon = WEAPONS[entity.wep];
    original.shoot(entity);
    const fired = entity.mag < before ||
      (weapon.melee && entity.fireT > beforeFireT);
    if (Net.inMatch && Net.role === "host" && fired) {
      Net.send({
        t: "fx_shot",
        id: entity.netId,
        x: entity.x,
        y: entity.y + (entity === player ? 1.55 : 1.45),
        z: entity.z,
        w: entity.wep
      });
    }
  };

  reload = function (entity) {
    if (Net.inMatch && (Net.spectator || !entity || entity.spectator)) return;
    const before = entity.reloadT || 0;
    original.reload(entity);
    if (entity.reloadT > before) {
      entity.reloadDuration = entity.reloadT;
      entity.reloadWep = entity.wep;
      entity.reloadStage = 0;
      if (Net.inMatch && Net.role === "client" && entity === player) {
        Net.send({t: "reload_start", w: entity.wep, duration: entity.reloadDuration});
      } else if (Net.inMatch && Net.role === "host" && entity === player) {
        Net.send({t: "fx_reload", id: entity.netId, w: entity.wep, duration: entity.reloadDuration});
      }
    }
  };

  finishReload = function (entity) {
    if (Net.inMatch && Net.role === "host" && entity && entity.remote) {
      // A munição remota só muda quando o servidor aceitar reload_commit.
      entity.reloadT = 0.001;
      return;
    }
    const weapon = entity ? entity.wep : -1;
    original.finishReload(entity);
    if (entity) {
      entity.reloadT = 0;
      entity.reloadDuration = 0;
      entity.reloadStage = 0;
    }
    if (Net.inMatch && Net.role === "client" && entity === player) {
      Net.send({t: "reload_commit", w: weapon});
    }
  };

  setWeapon = function (index) {
    if (Net.inMatch && Net.spectator) return;
    const wasReloading = !!(player && player.reloadT > 0);
    original.setWeapon(index);
    if (Net.inMatch && Net.role === "client" && wasReloading && player && player.wep === index) {
      player.reloadDuration = 0;
      player.reloadStage = 0;
      Net.send({t: "reload_cancel"});
    }
  };

  drawDeadOverlay = function () {
    if (Net.inMatch && (Net.spectator || (player && player.dead && observedEntity()))) return;
    original.drawDeadOverlay();
  };

  damage = function (entity, amount, by, head) {
    const oldHp = entity.hp;
    const result = original.damage(entity, amount, by, head);
    if (
      Net.inMatch && Net.role === "host" && by && by.remote &&
      entity.hp < oldHp && by.netId
    ) {
      Net.send({
        t: "hit",
        to: by.netId,
        head: !!head,
        killed: !!entity.dead
      });
    }
    return result;
  };

  addFeed = function (attacker, victim, head) {
    original.addFeed(attacker, victim, head);
    if (Net.inMatch && Net.role === "host") {
      Net.send({t: "feed", a: attacker, b: victim, head: !!head});
    }
  };

  endMatch = function (winner) {
    if (Net.inMatch && Net.role === "host" && !Net.roundEnding) {
      Net.roundEnding = true;
      Net.send({t: "end", winner: winner.netId});
    }
    original.endMatch(winner);
    if (Net.inMatch) finishNetworkRoundUi();
  };

  togglePause = function (on) {
    if (Net.inMatch && !matchOver) {
      if (on) {
        showNetworkOverlay();
        showLobby();
        ui.continueButton.classList.remove("net-hide");
        setStatus("Partida em andamento. Toque em CONTINUAR para voltar.");
      } else {
        hideNetworkOverlay();
      }
      return;
    }
    original.togglePause(on);
  };

  window.androidPauseGame = function () {
    firing = false;
    if (!Net.inMatch && !paused && !matchOver) original.togglePause(true);
  };

  window.androidHandleBack = function () {
    if (ui && !ui.root.classList.contains("net-hide")) {
      if (Net.inMatch && !matchOver) hideNetworkOverlay();
      else closeNetworkMenu();
      return true;
    }
    if (Net.inMatch && !matchOver) {
      togglePause(true);
      return true;
    }
    if (!paused && !matchOver) {
      original.togglePause(true);
      return true;
    }
    return false;
  };

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) window.androidPauseGame();
  });

  setInterval(function () {
    if (!Net.connected) return;
    if (Net.role === "host") {
      const sent = performance.now();
      Net.send({t: "ping", seq: ++Net.pingSequence, sent: sent});
    }
  }, 2000);

  installUi();
})();
