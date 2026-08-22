"use strict";

class TelaOnline {
  constructor(app) {
    this.app = app;
    this.save = app.save;
    this.status = "Crie uma sala ou entre com um código";
    this.codigo = "";
    this.host = false;
    this.resumo = null;
    this.botoes = [];
    this.formularioSala = null;
    this.foco = -1;
  }

  entrar() { this.app.sound.startMusic("menu_music"); }
  sair() {
    this.fecharConfiguracaoSala();
    if (!OnlineSession.enabled) OnlineSession.service?.close();
  }
  update() {}
  medir() {}

  climaEscolhido(valor) {
    const entrada = String(valor || "auto").trim().toLowerCase();
    const mapa = {
      "1": "auto", "auto": "auto", "automático": "auto", "automatico": "auto",
      "2": "sun", "sol": "sun", "ensolarado": "sun",
      "3": "rain_light", "chuva": "rain_light", "chuva leve": "rain_light",
      "4": "rain_heavy", "chuva forte": "rain_heavy", "temporal": "rain_heavy",
      "5": "snow", "neve": "snow",
      "6": "fog", "neblina": "fog", "névoa": "fog", "nevoa": "fog",
      "7": "night", "noite": "night"
    };
    return mapa[entrada] || "auto";
  }

  configuracaoPadrao() {
    const nomePadrao = "Sala de " + (this.save.playerName || "Jogador");
    const fase = 0;
    return { salaNome: nomePadrao, max: 4, fase, voltas: StageCatalog.byIndex(fase).laps || 3, clima: "auto", pocaAgua: true, pocaOleo: false };
  }

  abrirConfiguracaoSala() {
    if (this.formularioSala) return;
    const padrao = this.configuracaoPadrao();
    const opcoesFase = [];
    for (let i = 0; i < StageCatalog.count(); i++) {
      const fase = StageCatalog.byIndex(i);
      opcoesFase.push(`<option value="${i}">${i + 1}. ${fase.countryName} — ${fase.name}</option>`);
    }
    const overlay = document.createElement("div");
    overlay.className = "sala-config-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Configurar sala online");
    overlay.innerHTML = `
      <form class="sala-config-card">
        <header class="sala-config-header">
          <span class="sala-config-kicker">JOGAR ONLINE</span>
          <h1>CONFIGURAR SALA</h1>
          <p>Monte a corrida do seu jeito e convide até 24 pilotos.</p>
        </header>
        <section class="sala-config-bloco">
          <h2>IDENTIDADE DA SALA</h2>
          <div class="sala-config-grid sala-config-grid-identidade">
            <label><span>Nome da sala</span><input name="salaNome" maxlength="24" autocomplete="off"></label>
            <label><span>Máximo de jogadores</span><input name="max" type="number" min="2" max="24" inputmode="numeric"></label>
          </div>
        </section>
        <section class="sala-config-bloco">
          <h2>PISTA E CORRIDA</h2>
          <div class="sala-config-grid">
            <label class="sala-config-largo"><span>Pista</span><select name="fase">${opcoesFase.join("")}</select></label>
            <label><span>Voltas</span><input name="voltas" type="number" min="1" max="10" inputmode="numeric"></label>
            <label><span>Clima</span><select name="clima"><option value="auto">Automático</option><option value="sun">Sol</option><option value="rain_light">Chuva leve</option><option value="rain_heavy">Chuva forte</option><option value="snow">Neve</option><option value="fog">Neblina</option><option value="night">Noite</option></select></label>
          </div>
        </section>
        <section class="sala-config-bloco">
          <h2>DESAFIOS DA PISTA</h2>
          <div class="sala-config-opcoes">
            <label class="sala-config-toggle"><span><b>Poças d'água</b><small>Perda de aderência em trechos molhados</small></span><input name="pocaAgua" type="checkbox"><i></i></label>
            <label class="sala-config-toggle"><span><b>Poças de óleo</b><small>Derrapagens e mais risco nas curvas</small></span><input name="pocaOleo" type="checkbox"><i></i></label>
          </div>
        </section>
        <footer class="sala-config-acoes"><button class="sala-config-voltar" type="button">VOLTAR</button><button class="sala-config-criar" type="submit">CRIAR SALA</button></footer>
      </form>`;
    const form = overlay.querySelector("form");
    form.elements.salaNome.value = padrao.salaNome;
    form.elements.max.value = padrao.max;
    form.elements.fase.value = padrao.fase;
    form.elements.voltas.value = padrao.voltas;
    form.elements.clima.value = padrao.clima;
    form.elements.pocaAgua.checked = padrao.pocaAgua;
    form.elements.pocaOleo.checked = padrao.pocaOleo;
    form.elements.fase.addEventListener("change", () => {
      form.elements.voltas.value = StageCatalog.byIndex(Number(form.elements.fase.value)).laps || 3;
    });
    form.querySelector(".sala-config-voltar").addEventListener("click", () => this.fecharConfiguracaoSala());
    form.addEventListener("submit", evento => {
      evento.preventDefault();
      const salaNome = String(form.elements.salaNome.value || padrao.salaNome).trim().slice(0, 24) || padrao.salaNome;
      const max = limitar(Math.trunc(Number(form.elements.max.value) || 4), 2, 24);
      const fase = limitar(Math.trunc(Number(form.elements.fase.value) || 0), 0, StageCatalog.count() - 1);
      const voltas = limitar(Math.trunc(Number(form.elements.voltas.value) || 3), 1, 10);
      const clima = this.climaEscolhido(form.elements.clima.value);
      const configuracao = { salaNome, max, fase, voltas, clima, pocaAgua: form.elements.pocaAgua.checked, pocaOleo: form.elements.pocaOleo.checked };
      this.fecharConfiguracaoSala();
      this.conectar(true, configuracao);
    });
    this.app.camadaHtml.appendChild(overlay);
    this.formularioSala = overlay;
  }

  fecharConfiguracaoSala() {
    if (this.formularioSala?.parentNode) this.formularioSala.parentNode.removeChild(this.formularioSala);
    this.formularioSala = null;
  }

  conectar(criar, configuracao) {
    const digitado = criar ? "" : String(prompt("Código da sala:", this.codigo) || "").trim().toUpperCase();
    if (!criar && !digitado) return;
    configuracao = criar ? (configuracao || this.configuracaoPadrao()) : {};
    this.status = "Conectando ao servidor…";
    const service = new OnlineService(this.save.onlineServerUrl);
    OnlineSession.service = service;
    OnlineSession.isHost = criar;
    OnlineSession.enabled = false;
    service.setListener({
      onStatus: m => { this.status = m; },
      onConnected: () => {},
      onDisconnected: m => { this.status = m; },
      onRawMessage: () => {},
      onStateReceived: () => {},
      onRoomUpdate: r => {
        this.resumo = r;
        this.codigo = r.id || this.codigo;
        this.host = r.anfitriaoPid === service.pid;
        this.status = "Sala pronta — compartilhe o código";
      },
      onRaceStart: r => {
        OnlineSession.enabled = true;
        OnlineSession.stageIndex = r.fase;
        const esperaSincronizada = Math.max(0,
          (r.sincronizarEmMs || r.emMs || 0) - (service.latenciaMs || 0) / 2);
        // performance.now nao muda se o relogio do aparelho for corrigido. O
        // alvo e criado antes da tela da corrida, entao o carregamento da pista
        // e dos recursos e descontado e nao atrasa o GO deste jogador.
        const largadaLocalEm = performance.now() + esperaSincronizada;
        this.app.irPara("corrida", {
          stageIndex: r.fase,
          semente: r.semente,
          esperaLargadaMs: esperaSincronizada,
          largadaLocalEm: largadaLocalEm,
          clima: r.clima,
          pocaAgua: r.pocaAgua,
          pocaOleo: r.pocaOleo,
          voltas: r.voltas
        });
      }
    });
    service.conectar(Object.assign({
      criar: criar,
      sala: digitado,
      nome: this.save.playerName,
      carId: this.save.selectedCarId
    }, configuracao));
  }

  nomeDoClima(clima) {
    return ({
      auto: "AUTOMÁTICO", sun: "SOL", rain_light: "CHUVA LEVE",
      rain_heavy: "CHUVA FORTE", snow: "NEVE", fog: "NEBLINA", night: "NOITE"
    })[clima] || "AUTOMÁTICO";
  }

  preencherImagem(ctx, img, w, h) {
    if (!img) return;
    const escala = Math.max(w / img.width, h / img.height);
    const sw = w / escala;
    const sh = h / escala;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
  }

  painelLobby(ctx, ret, cor) {
    const grad = ctx.createLinearGradient(0, ret.top, 0, ret.bottom);
    grad.addColorStop(0, "rgba(10,20,48,.88)");
    grad.addColorStop(1, "rgba(24,7,38,.90)");
    retanguloArredondado(ctx, ret, 20);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = cor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  botaoLobby(ctx, ret, texto, cor, desativado, focado) {
    retanguloArredondado(ctx, ret, 16);
    ctx.fillStyle = desativado ? "rgba(17,20,38,.88)" : "rgba(15,13,38,.92)";
    ctx.fill();
    ctx.strokeStyle = desativado ? "rgba(140,145,170,.45)" : cor;
    ctx.lineWidth = focado ? 4 : 2.5;
    ctx.stroke();
    ctx.fillStyle = desativado ? "rgba(185,187,204,.48)" : "#fff";
    ctx.font = `900 ${Math.max(13, Ret.altura(ret) * .32)}px ${FONTE}`;
    ctx.textAlign = "center";
    ctx.fillText(texto, Ret.centroX(ret), Ret.centroY(ret) + Ret.altura(ret) * .11);
  }

  renderLobby(ctx, w, h) {
    const s = this.resumo || { jogadores: [] };
    const jogadores = Array.isArray(s.jogadores) ? s.jogadores : [];
    const maxJogadores = Number(s.maxJogadores || 4);
    const fase = StageCatalog.byIndex(Number(s.fase || 0));
    const fundo = Assets.img("menu_bg_turbo_race");
    if (fundo) this.preencherImagem(ctx, fundo, w, h);
    else { ctx.fillStyle = "#080b1d"; ctx.fillRect(0, 0, w, h); }
    const sombra = ctx.createLinearGradient(0, 0, 0, h);
    sombra.addColorStop(0, "rgba(3,7,22,.48)");
    sombra.addColorStop(1, "rgba(3,5,17,.88)");
    ctx.fillStyle = sombra;
    ctx.fillRect(0, 0, w, h);

    const dp = Math.max(.72, Math.min(w / 1280, h / 720));
    ctx.textAlign = "center";
    ctx.fillStyle = "#d2c7f0";
    ctx.font = `700 ${18 * dp}px ${FONTE}`;
    ctx.fillText("CÓDIGO DA SALA", w / 2, h * .075);
    ctx.fillStyle = "#65f6e5";
    ctx.shadowColor = "rgba(0,245,255,.55)";
    ctx.shadowBlur = 18 * dp;
    ctx.font = `900 ${52 * dp}px ${FONTE}`;
    ctx.fillText(this.codigo, w / 2, h * .155);
    ctx.shadowBlur = 0;

    const voltar = { left: w * .035, right: w * .18, top: h * .045, bottom: h * .14 };
    this.botaoLobby(ctx, voltar, "VOLTAR", "#ff9a3c", false, this.foco === 3);

    const pistaRet = { left: w * .055, right: w * .455, top: h * .23, bottom: h * .72 };
    const pilotosRet = { left: w * .485, right: w * .945, top: h * .23, bottom: h * .72 };
    this.painelLobby(ctx, pistaRet, "rgba(255,210,77,.68)");
    this.painelLobby(ctx, pilotosRet, "rgba(0,245,255,.58)");

    ctx.textAlign = "left";
    ctx.fillStyle = "#a8f8ff";
    ctx.font = `800 ${14 * dp}px ${FONTE}`;
    ctx.fillText("TODOS CORREM ESTA FASE", pistaRet.left + 22 * dp, pistaRet.top + 34 * dp);
    ctx.fillStyle = "#ffd24d";
    ctx.font = `900 ${28 * dp}px ${FONTE}`;
    ctx.fillText(fase.name, pistaRet.left + 22 * dp, pistaRet.top + 70 * dp);
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${17 * dp}px ${FONTE}`;
    ctx.fillText(`${fase.countryName}  •  ${Number(s.voltas || fase.laps || 3)} voltas`, pistaRet.left + 22 * dp, pistaRet.top + 99 * dp);

    const detalhes = [
      ["CLIMA", this.nomeDoClima(s.clima)],
      ["ÁGUA", s.pocaAgua ? "SIM" : "NÃO"],
      ["ÓLEO", s.pocaOleo ? "SIM" : "NÃO"],
      ["PILOTOS", `ATÉ ${maxJogadores}`]
    ];
    detalhes.forEach((item, i) => {
      const coluna = i % 2;
      const linha = Math.trunc(i / 2);
      const x = pistaRet.left + 22 * dp + coluna * (Ret.largura(pistaRet) * .47);
      const y = pistaRet.top + (145 + linha * 74) * dp;
      ctx.fillStyle = "#8f9bb9";
      ctx.font = `800 ${11 * dp}px ${FONTE}`;
      ctx.fillText(item[0], x, y);
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${16 * dp}px ${FONTE}`;
      ctx.fillText(item[1], x, y + 24 * dp);
    });
    ctx.fillStyle = "#d2c7f0";
    ctx.font = `600 ${13 * dp}px ${FONTE}`;
    ctx.fillText(s.nome || "Sala online", pistaRet.left + 22 * dp, pistaRet.bottom - 22 * dp);

    ctx.fillStyle = "#fff";
    ctx.font = `900 ${21 * dp}px ${FONTE}`;
    ctx.fillText(`NA SALA (${jogadores.length}/${maxJogadores})`, pilotosRet.left + 22 * dp, pilotosRet.top + 35 * dp);
    const limite = Math.max(3, Math.min(7, Math.trunc((Ret.altura(pilotosRet) - 85 * dp) / (48 * dp))));
    jogadores.slice(0, limite).forEach((p, i) => {
      const y = pilotosRet.top + (72 + i * 49) * dp;
      const img = Assets.img("car_" + limitar(Math.trunc(Number(p.carId) || 0), 0, 9));
      if (img) ctx.drawImage(img, pilotosRet.left + 20 * dp, y - 23 * dp, 54 * dp, 34 * dp);
      const anfitriao = p.pid === s.anfitriaoPid;
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${17 * dp}px ${FONTE}`;
      ctx.fillText((p.nome || "Jogador") + (anfitriao ? "  ★" : ""), pilotosRet.left + 84 * dp, y);
      ctx.textAlign = "right";
      ctx.fillStyle = p.pronto ? "#65f6a8" : "#ffd24d";
      ctx.font = `800 ${13 * dp}px ${FONTE}`;
      ctx.fillText(p.pronto ? "PRONTO" : "ESPERANDO", pilotosRet.right - 20 * dp, y);
      ctx.textAlign = "left";
    });
    if (jogadores.length > limite) {
      ctx.fillStyle = "#a8f8ff";
      ctx.font = `700 ${13 * dp}px ${FONTE}`;
      ctx.fillText(`+ ${jogadores.length - limite} pilotos na sala`, pilotosRet.left + 22 * dp, pilotosRet.bottom - 25 * dp);
    } else {
      ctx.fillStyle = jogadores.length < 2 ? "#ffd24d" : "#a8f8ff";
      ctx.font = `700 ${13 * dp}px ${FONTE}`;
      ctx.fillText(jogadores.length < 2 ? "Aguardando pelo menos mais 1 piloto para largar." : "Sala pronta para a largada.", pilotosRet.left + 22 * dp, pilotosRet.bottom - 25 * dp);
    }

    const prontoLocal = jogadores.some(p => p.pid === OnlineSession.service?.pid && p.pronto);
    const podeLargar = this.host && jogadores.length >= 2;
    const botoes = [
      { left: w * .055, right: w * .31, top: h * .81, bottom: h * .925 },
      { left: w * .335, right: w * .59, top: h * .81, bottom: h * .925 },
      { left: w * .615, right: w * .945, top: h * .81, bottom: h * .925 }
    ];
    this.botoes = botoes.concat([voltar]);
    this.botaoLobby(ctx, botoes[0], prontoLocal ? "PRONTO ✓" : "ESTOU PRONTO", "#ffd24d", false, this.foco === 0);
    this.botaoLobby(ctx, botoes[1], "LARGAR", "#65f6e5", !podeLargar, this.foco === 1);
    this.botaoLobby(ctx, botoes[2], "COPIAR CÓDIGO", "#ff2daa", false, this.foco === 2);

    if (this.status && this.status !== "Sala pronta — compartilhe o código") {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd24d";
      ctx.font = `700 ${12 * dp}px ${FONTE}`;
      ctx.fillText(this.status, w / 2, h * .975);
    }
  }

  render(ctx, w, h) {
    if (this.codigo && this.resumo) {
      this.renderLobby(ctx, w, h);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#07152f");
    g.addColorStop(1, "#27062f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    // Antes de criar a sala, preserva a composição original: título maior,
    // mais respiro e botões largos. O painel detalhado só aparece na sala.
    ctx.font = `900 ${Math.max(28, h * (this.codigo ? .085 : .10))}px ${FONTE}`;
    ctx.fillStyle = "#39efff";
    ctx.fillText("SALA ONLINE", w / 2, h * (this.codigo ? .13 : .16));
    ctx.font = `700 ${Math.max(15, h * (this.codigo ? .031 : .035))}px ${FONTE}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(this.codigo ? "CÓDIGO: " + this.codigo : this.status, w / 2, h * (this.codigo ? .22 : .27));

    const labels = ["CONFIGURAR SALA", "ENTRAR NA SALA", "VOLTAR"];
    this.botoes = [];
    labels.forEach((t, i) => {
      const inicio = .38;
      const passo = .16;
      const alturaBotao = .11;
      const r = { left: w * .28, right: w * .72, top: h * (inicio + i * passo), bottom: h * (inicio + alturaBotao + i * passo) };
      this.botoes.push(r);
      const grad = ctx.createLinearGradient(r.left, 0, r.right, 0);
      grad.addColorStop(0, i === 1 ? "#fe2d9b" : "#196dff");
      grad.addColorStop(1, "#632cff");
      ctx.fillStyle = grad;
      retanguloArredondado(ctx, r, 18);
      ctx.fill();
      ctx.strokeStyle = "#63f6ff";
      ctx.lineWidth = this.foco === i ? 4 : 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${Math.max(14, h * .035)}px ${FONTE}`;
      ctx.fillText(t, w / 2, (r.top + r.bottom) / 2 + h * .011);
    });

  }

  aoApontar(tipo, x, y) {
    if (tipo !== "cima") return;
    const i = this.botoes.findIndex(r => Ret.contem(r, x, y));
    if (i < 0) return;
    this.foco = i;
    this.acionarIndice(i);
  }

  acionarIndice(i) {
    if (!this.codigo) {
      if (i === 0) this.abrirConfiguracaoSala();
      else if (i === 1) this.conectar(false);
      else this.app.irPara("menu");
    } else {
      if (i === 0) {
        const local = this.resumo?.jogadores?.find(p => p.pid === OnlineSession.service?.pid);
        OnlineSession.service?.setReady(!local?.pronto);
      }
      else if (i === 1) {
        if (this.host && (this.resumo?.jogadores?.length || 0) >= 2) OnlineSession.service?.startRace();
        else if (this.host) this.status = "Aguardando pelo menos mais 1 piloto.";
        else this.status = "Somente o anfitrião pode iniciar";
      } else if (i === 2) {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(this.codigo).then(() => { this.status = "Código copiado: " + this.codigo; }).catch(() => { this.status = "Código da sala: " + this.codigo; });
        } else this.status = "Código da sala: " + this.codigo;
      } else {
        OnlineSession.clear();
        this.app.irPara("menu");
      }
    }
  }

  aoTeclar(evento, apertou) {
    if (!apertou || this.formularioSala) return;
    const total = this.codigo ? 4 : 3;
    if (evento.code === "ArrowDown" || evento.code === "ArrowRight") this.foco = (this.foco + 1) % total;
    else if (evento.code === "ArrowUp" || evento.code === "ArrowLeft") this.foco = this.foco <= 0 ? total - 1 : this.foco - 1;
    else if ((evento.code === "Enter" || evento.code === "Space") && this.foco >= 0) this.acionarIndice(this.foco);
    else if (evento.code === "Escape") this.acionarIndice(this.codigo ? 3 : 2);
  }
}

window.TelaOnline = TelaOnline;
