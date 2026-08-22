"use strict";
/*
 * Saguão da sala online. É o que substitui a MultiplayerActivity.kt do app.
 *
 * No Android o jogador procurava aparelhos pareados por Bluetooth e a corrida
 * acontecia entre celulares na mesma mesa. Aqui a sala vive num servidor
 * (pasta TurboRace-Servidor-Render) e qualquer um entra de qualquer lugar
 * digitando um código de 6 letras — ou clicando numa sala aberta da lista.
 *
 * O fluxo é o mesmo do app: alguém cria a sala e vira anfitrião, os outros
 * entram, o anfitrião escolhe a fase, todo mundo marca PRONTO e o anfitrião dá
 * a largada. Todos correm a MESMA fase, com a mesma pista, porque o servidor
 * manda uma semente única para a sala inteira.
 */

/** As três telas por que o saguão passa. */
const ETAPA_ESCOLHA = 0;   // criar sala, entrar por código, ver salas abertas
const ETAPA_SALA = 1;      // dentro da sala, esperando a largada
const ETAPA_ERRO = 2;      // deu ruim: mostra o motivo e o botão de voltar

class TelaOnline {
  constructor(app) {
    this.app = app;
    this.etapa = ETAPA_ESCOLHA;
    this.mensagem = "";
    this.erro = "";
    this.tempo = 0;

    this.service = null;
    this.resumo = null;
    this.pronto = false;

    // Lista de salas abertas, buscada por HTTP antes de abrir qualquer WebSocket.
    this.salasAbertas = null;    // null = ainda buscando; [] = nenhuma
    this.statusServidor = null;
    this.buscandoLista = false;
    this.recarregarEm = 0;

    // Rolagem da lista de fases, quando o anfitrião está escolhendo.
    this.faseRolagem = 0;
    this.escolhendoFase = false;

    // As três listas do online rolam por arrasto, roda ou trackpad.
    this.salasRolagem = 0;
    this.salasRolagemMax = 0;
    this.jogadoresRolagem = 0;
    this.jogadoresRolagemMax = 0;
    this.faseRolagemMax = 0;
    this.salasListaRet = Ret.novo();
    this.jogadoresListaRet = Ret.novo();
    this.fasesListaRet = Ret.novo();
    this.arrastoLista = null;
    this.arrastoInicioY = 0;
    this.arrastoUltimoY = 0;
    this.arrastouLista = false;
    this.botaoPressionado = null;

    this.botoes = [];            // preenchidos a cada render, testados no toque
    this.conversa = [];          // últimas provocações recebidas
    this.formularioSala = null;
  }

  // -----------------------------------------------------------------------
  // Ciclo de vida
  // -----------------------------------------------------------------------

  entrar() {
    this.etapa = ETAPA_ESCOLHA;
    this.mensagem = "";
    this.erro = "";
    this.pronto = false;
    this.escolhendoFase = false;
    this.salasRolagem = 0;
    this.salasRolagemMax = 0;
    this.jogadoresRolagem = 0;
    this.jogadoresRolagemMax = 0;
    this.faseRolagem = 0;
    this.faseRolagemMax = 0;
    this.arrastoLista = null;
    this.botaoPressionado = null;
    this.conversa.length = 0;
    this.app.sound.startMusic("menu_music");
    this._buscarLista();
  }

  sair() {
    this.fecharConfiguracaoSala();
    // Sair do saguão desfaz a sala. Se a corrida já começou, quem desliga é a
    // tela de corrida — por isso o teste do enabled.
    if (this.service && !OnlineSession.enabled) {
      this.service.close();
      this.service = null;
      OnlineSession.service = null;
    }
  }

  update(dt) {
    this.tempo += dt;
    this.recarregarEm -= dt;
    if (this.etapa === ETAPA_ESCOLHA && this.recarregarEm <= 0) {
      this.recarregarEm = 6;
      this._buscarLista();
    }
  }

  // -----------------------------------------------------------------------
  // Conversa com o servidor
  // -----------------------------------------------------------------------

  _buscarLista() {
    if (this.buscandoLista) return;
    this.buscandoLista = true;
    const self = this;
    const url = this.app.save.onlineServerUrl;

    statusDoServidorOnline(url).then(function (s) { self.statusServidor = s; });

    listarSalasOnline(url).then(function (lista) {
      self.buscandoLista = false;
      self.salasAbertas = lista;   // null quando o servidor não respondeu
    });
  }

  _ouvinte() {
    const self = this;
    function abrirCorrida(largada) {
      if (OnlineSession.raceOpening) return;
      OnlineSession.raceOpening = true;
      OnlineSession.enabled = true;
      OnlineSession.stageIndex = largada.fase;
      self.app.irPara("corrida", {
        stageIndex: largada.fase,
        online: true,
        semente: largada.semente,
        playerName: self.app.save.playerName
      });
    }
    return {
      onStatus(msg) { self.mensagem = msg; },

      onConnected() {
        self.etapa = ETAPA_SALA;
        self.erro = "";
        self.mensagem = "";
      },

      onRoomUpdate(resumo) {
        self.resumo = resumo;
        // O servidor derruba o "pronto" de todos quando a fase muda; o botão
        // da tela precisa acompanhar, senão mente para o jogador.
        const eu = resumo.jogadores.find(j => j.pid === self.service.pid);
        if (eu) self.pronto = eu.pronto;
      },

      onRacePrepare(largada) { abrirCorrida(largada); },

      // Compatibilidade com servidor antigo: se não houver `preparar`, a
      // própria largada ainda abre a corrida.
      onRaceStart(largada) { abrirCorrida(largada); },

      onChat(c) {
        self.conversa.push({ nome: c.nome, texto: c.texto, em: self.tempo });
        if (self.conversa.length > 4) self.conversa.shift();
      },

      onDisconnected(msg) {
        // Só vira tela de erro se ainda estivermos no saguão: durante a corrida
        // quem trata a queda é a tela de corrida.
        if (OnlineSession.enabled) return;
        self.etapa = ETAPA_ERRO;
        self.erro = msg || "A conexão caiu.";
        self.service = null;
        OnlineSession.service = null;
      }
    };
  }

  _abrirConexao(opcoes) {
    if (this.service) this.service.close();
    const url = this.app.save.onlineServerUrl;
    const service = new OnlineService(url);
    service.setListener(this._ouvinte());
    service.conectar(opcoes);

    this.service = service;
    OnlineSession.service = service;
    OnlineSession.enabled = false;
    this.mensagem = "Falando com o servidor…";
    this.etapa = ETAPA_ESCOLHA;
  }

  configuracaoPadrao() {
    const save = this.app.save;
    const fase = limitar(save.unlockedStages - 1, 0, StageCatalog.count() - 1);
    return {
      salaNome: "Sala de " + save.playerName,
      max: 4,
      fase: fase,
      voltas: StageCatalog.byIndex(fase).laps || 3,
      clima: "auto",
      pocaAgua: true,
      pocaOleo: false
    };
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
      const configuracao = {
        salaNome: String(form.elements.salaNome.value || padrao.salaNome).trim().slice(0, 24) || padrao.salaNome,
        max: limitar(Math.trunc(Number(form.elements.max.value) || 4), 2, 24),
        fase: limitar(Math.trunc(Number(form.elements.fase.value) || 0), 0, StageCatalog.count() - 1),
        voltas: limitar(Math.trunc(Number(form.elements.voltas.value) || 3), 1, 10),
        clima: String(form.elements.clima.value || "auto"),
        pocaAgua: form.elements.pocaAgua.checked,
        pocaOleo: form.elements.pocaOleo.checked
      };
      this.fecharConfiguracaoSala();
      this.criarSala(configuracao);
    });
    this.app.camadaHtml.appendChild(overlay);
    this.formularioSala = overlay;
  }

  fecharConfiguracaoSala() {
    if (this.formularioSala && this.formularioSala.parentNode) this.formularioSala.parentNode.removeChild(this.formularioSala);
    this.formularioSala = null;
  }

  criarSala(configuracao) {
    const save = this.app.save;
    const regras = configuracao || this.configuracaoPadrao();
    this._abrirConexao({
      criar: true,
      nome: save.playerName,
      carId: save.selectedCarId,
      max: regras.max,
      fase: regras.fase,
      salaNome: regras.salaNome,
      clima: regras.clima,
      pocaAgua: regras.pocaAgua,
      pocaOleo: regras.pocaOleo,
      voltas: regras.voltas
    });
  }

  nomeDoClima(valor) {
    return ({
      auto: "AUTOMÁTICO", sun: "SOL", rain_light: "CHUVA LEVE",
      rain_heavy: "CHUVA FORTE", snow: "NEVE", fog: "NEBLINA", night: "NOITE"
    })[String(valor || "auto")] || "AUTOMÁTICO";
  }

  entrarPorCodigo() {
    const digitado = window.prompt("Código da sala (6 letras):", "");
    if (!digitado) return;
    const codigo = String(digitado).trim().toUpperCase().slice(0, 8);
    if (!codigo) return;
    const save = this.app.save;
    this._abrirConexao({ sala: codigo, nome: save.playerName, carId: save.selectedCarId });
  }

  entrarNaSala(id) {
    const save = this.app.save;
    this._abrirConexao({ sala: id, nome: save.playerName, carId: save.selectedCarId });
  }

  entrarEmQualquer() {
    const save = this.app.save;
    this._abrirConexao({ nome: save.playerName, carId: save.selectedCarId });
  }

  alternarPronto() {
    if (!this.service) return;
    this.pronto = !this.pronto;
    this.service.setReady(this.pronto);
  }

  largar() {
    if (!this.service || !this.service.ehAnfitriao()) return;
    this.service.startRace();
  }

  trocarFase(indice) {
    if (!this.service || !this.service.ehAnfitriao()) return;
    this.service.setStage(limitar(indice, 0, StageCatalog.count() - 1));
    this.escolhendoFase = false;
  }

  provocar() {
    if (!this.service) return;
    const frases = [
      "Boa sorte!", "Vou ganhar essa!", "Segura essa curva!",
      "Cadê o turbo?", "Comendo poeira!", "Vamo nessa!"
    ];
    this.service.sendRaw(frases[MathUtils.randomInt(0, frases.length - 1)]);
  }

  sairDaSala() {
    if (this.service) {
      this.service.close();
      this.service = null;
      OnlineSession.service = null;
    }
    OnlineSession.enabled = false;
    this.resumo = null;
    this.pronto = false;
    this.etapa = ETAPA_ESCOLHA;
    this.mensagem = "";
    this._buscarLista();
  }

  // -----------------------------------------------------------------------
  // Desenho
  // -----------------------------------------------------------------------

  render(ctx, largura, altura) {
    this.botoes.length = 0;

    this._fundo(ctx, largura, altura);

    if (this.etapa === ETAPA_SALA) this._desenharSala(ctx, largura, altura);
    else if (this.etapa === ETAPA_ERRO) this._desenharErro(ctx, largura, altura);
    else this._desenharEscolha(ctx, largura, altura);

    // Botão voltar, presente nas três etapas.
    this._botao(ctx, {
      r: Ret.novo(largura * 0.028, altura * 0.045, largura * 0.028 + largura * 0.13, altura * 0.045 + altura * 0.10),
      rotulo: "VOLTAR",
      corBorda: Cor.rgb(0xFF, 0x7A, 0x18),
      acao: () => {
        if (this.etapa === ETAPA_SALA) this.sairDaSala();
        else this.app.irPara("menu");
      }
    });
  }

  _fundo(ctx, largura, altura) {
    const fundo = Assets.img("menu_bg_turbo_race");
    if (fundo) {
      ctx.drawImage(fundo, 0, 0, largura, altura);
      ctx.fillStyle = Cor.css(Cor.argb(190, 0x06, 0x08, 0x14));
      ctx.fillRect(0, 0, largura, altura);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, altura);
      g.addColorStop(0, Cor.css(Cor.rgb(0x0D, 0x08, 0x28)));
      g.addColorStop(1, Cor.css(Cor.rgb(0x32, 0x11, 0x4A)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, largura, altura);
    }

    // Faixas de neon correndo ao fundo, para a tela não ficar parada.
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const y = ((this.tempo * (40 + i * 18) + i * altura / 6) % (altura + 60)) - 30;
      ctx.fillStyle = Cor.css(Cor.argb(26, 0x00, 0xF5, 0xD4));
      ctx.fillRect(0, y, largura, 2);
    }
    ctx.restore();
  }

  _titulo(ctx, largura, altura, texto, subtitulo) {
    ctx.textAlign = "center";
    ctx.fillStyle = Cor.css(Cor.rgb(0x00, 0xF5, 0xD4));
    ctx.font = "bold " + (altura * 0.085) + "px " + FONTE;
    ctx.fillText(texto, largura / 2, altura * 0.145);
    if (subtitulo) {
      ctx.fillStyle = Cor.css(Cor.argb(210, 0xF4, 0xF4, 0xF4));
      ctx.font = (altura * 0.040) + "px " + FONTE;
      ctx.fillText(subtitulo, largura / 2, altura * 0.205);
    }
    ctx.textAlign = "left";
  }

  // ---- Etapa 1: escolher como entrar ----

  _desenharEscolha(ctx, largura, altura) {
    this._titulo(ctx, largura, altura, "SALA ONLINE",
      "Crie sua corrida para até 24 jogadores, de qualquer lugar");

    const larguraBotao = largura * 0.30;
    const alturaBotao = altura * 0.115;
    const esquerda = largura * 0.055;
    let y = altura * 0.28;

    this._botao(ctx, {
      r: Ret.novo(esquerda, y, esquerda + larguraBotao, y + alturaBotao),
      rotulo: "CONFIGURAR SALA",
      sub: "pista, clima, voltas e desafios",
      corBorda: Cor.rgb(0x00, 0xF5, 0xD4),
      acao: () => this.abrirConfiguracaoSala()
    });
    y += alturaBotao * 1.28;

    this._botao(ctx, {
      r: Ret.novo(esquerda, y, esquerda + larguraBotao, y + alturaBotao),
      rotulo: "ENTRAR POR CÓDIGO",
      sub: "6 letras que o anfitrião passa",
      corBorda: Cor.rgb(0xFF, 0xD2, 0x4D),
      acao: () => this.entrarPorCodigo()
    });
    y += alturaBotao * 1.28;

    this._botao(ctx, {
      r: Ret.novo(esquerda, y, esquerda + larguraBotao, y + alturaBotao),
      rotulo: "QUALQUER SALA",
      sub: "cai na primeira com vaga",
      corBorda: Cor.rgb(0xF5, 0x00, 0x90),
      acao: () => this.entrarEmQualquer()
    });

    this._desenharListaDeSalas(ctx, largura, altura);
    this._desenharRodape(ctx, largura, altura);
  }

  _desenharListaDeSalas(ctx, largura, altura) {
    const esquerda = largura * 0.42;
    const direita = largura * 0.955;
    const topo = altura * 0.26;
    const base = altura * 0.86;

    ctx.fillStyle = Cor.css(Cor.argb(140, 0x0A, 0x0E, 0x1C));
    retanguloArredondado(ctx, Ret.novo(esquerda, topo, direita, base), altura * 0.03);
    ctx.fill();
    ctx.strokeStyle = Cor.css(Cor.argb(90, 0x00, 0xF5, 0xD4));
    ctx.lineWidth = Math.max(1, altura * 0.004);
    ctx.stroke();

    ctx.fillStyle = Cor.css(Cor.rgb(0xF4, 0xF4, 0xF4));
    ctx.font = "bold " + (altura * 0.042) + "px " + FONTE;
    ctx.fillText("Salas abertas", esquerda + largura * 0.02, topo + altura * 0.065);
    this.salasRolagemMax = 0;

    if (this.salasAbertas === null) {
      ctx.fillStyle = Cor.css(Cor.argb(170, 0xF4, 0xF4, 0xF4));
      ctx.font = (altura * 0.036) + "px " + FONTE;
      const pontos = ".".repeat(1 + (Math.trunc(this.tempo * 2) % 3));
      ctx.fillText("Procurando" + pontos, esquerda + largura * 0.02, topo + altura * 0.14);
      // O plano gratuito do Render dorme depois de 15 min parado e leva quase um
      // minuto para acordar. Avisar evita o jogador achar que quebrou.
      ctx.font = (altura * 0.030) + "px " + FONTE;
      ctx.fillStyle = Cor.css(Cor.argb(130, 0xF4, 0xF4, 0xF4));
      ctx.fillText("Se o servidor estava dormindo, pode levar até 1 minuto.",
        esquerda + largura * 0.02, topo + altura * 0.195);
      return;
    }

    if (this.salasAbertas.length === 0) {
      ctx.fillStyle = Cor.css(Cor.argb(170, 0xF4, 0xF4, 0xF4));
      ctx.font = (altura * 0.036) + "px " + FONTE;
      ctx.fillText("Nenhuma sala aberta agora.", esquerda + largura * 0.02, topo + altura * 0.14);
      ctx.fillText("Crie a sua e passe o código.", esquerda + largura * 0.02, topo + altura * 0.195);
      return;
    }

    const alturaLinha = altura * 0.088;
    const listaTopo = topo + altura * 0.09;
    const listaBase = base - altura * 0.018;
    Ret.definir(this.salasListaRet, esquerda + largura * 0.010, listaTopo,
      direita - largura * 0.010, listaBase);
    const conteudoAltura = this.salasAbertas.length * alturaLinha;
    this.salasRolagemMax = Math.max(0, conteudoAltura - Ret.altura(this.salasListaRet));
    this.salasRolagem = limitar(this.salasRolagem, 0, this.salasRolagemMax);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.salasListaRet.left, this.salasListaRet.top,
      Ret.largura(this.salasListaRet), Ret.altura(this.salasListaRet));
    ctx.clip();

    for (let i = 0; i < this.salasAbertas.length; i++) {
      const sala = this.salasAbertas[i];
      const y = listaTopo - this.salasRolagem + i * alturaLinha;
      if (y + alturaLinha < listaTopo || y > listaBase) continue;
      const r = Ret.novo(esquerda + largura * 0.015, y, direita - largura * 0.015, y + alturaLinha * 0.86);
      const cheia = sala.jogadores >= sala.maxJogadores;
      const bloqueada = cheia || sala.correndo;

      ctx.fillStyle = Cor.css(Cor.argb(bloqueada ? 60 : 120, 0x1A, 0x24, 0x37));
      retanguloArredondado(ctx, r, altura * 0.018);
      ctx.fill();

      ctx.fillStyle = Cor.css(bloqueada ? Cor.argb(120, 0xF4, 0xF4, 0xF4) : Cor.rgb(0x00, 0xF5, 0xD4));
      ctx.font = "bold " + (altura * 0.038) + "px " + FONTE_NUMEROS;
      ctx.fillText(sala.id, r.left + largura * 0.014, y + alturaLinha * 0.36);

      ctx.fillStyle = Cor.css(Cor.argb(bloqueada ? 110 : 225, 0xF4, 0xF4, 0xF4));
      ctx.font = (altura * 0.030) + "px " + FONTE;
      const nomeDaFase = StageCatalog.byIndex(sala.fase).name;
      ctx.fillText(nomeDaFase, r.left + largura * 0.014, y + alturaLinha * 0.68);

      ctx.textAlign = "right";
      ctx.font = "bold " + (altura * 0.034) + "px " + FONTE;
      ctx.fillStyle = Cor.css(cheia ? Cor.rgb(0xDF, 0x2F, 0x5C) : Cor.rgb(0xFF, 0xD2, 0x4D));
      const situacao = sala.correndo ? "correndo" : (sala.jogadores + "/" + sala.maxJogadores);
      ctx.fillText(situacao, r.right - largura * 0.014, y + alturaLinha * 0.52);
      ctx.textAlign = "left";

      if (!bloqueada) {
        this.botoes.push({ r: r, clip: this.salasListaRet, acao: () => this.entrarNaSala(sala.id) });
      }
    }
    ctx.restore();
    this._desenharBarraRolagem(ctx, this.salasListaRet, this.salasRolagem, this.salasRolagemMax, altura);
  }

  _desenharRodape(ctx, largura, altura) {
    ctx.font = (altura * 0.030) + "px " + FONTE;
    ctx.fillStyle = Cor.css(Cor.argb(150, 0xF4, 0xF4, 0xF4));

    let texto;
    if (this.statusServidor && this.statusServidor.ok) {
      texto = "Servidor de pé · " + this.statusServidor.jogadores + " jogador(es) online · " +
        this.statusServidor.salas + " sala(s)";
    } else if (this.salasAbertas === null) {
      texto = "Acordando o servidor…";
    } else {
      texto = "Servidor fora do ar. Confira o endereço em Configurações.";
    }
    ctx.fillText(texto, largura * 0.055, altura * 0.93);

    if (this.mensagem) {
      ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xD2, 0x4D));
      ctx.fillText(this.mensagem, largura * 0.055, altura * 0.965);
    }
  }

  // ---- Etapa 2: dentro da sala ----

  _desenharSala(ctx, largura, altura) {
    const resumo = this.resumo;
    if (!resumo) {
      this._titulo(ctx, largura, altura, "ENTRANDO…", this.mensagem);
      return;
    }

    const souAnfitriao = this.service && this.service.ehAnfitriao();
    const fase = StageCatalog.byIndex(resumo.fase);

    if (this.escolhendoFase) {
      this._desenharEscolhaDeFase(ctx, largura, altura);
      return;
    }

    // --- Código da sala, bem grande: é o que se dita para o amigo ---
    ctx.textAlign = "center";
    ctx.fillStyle = Cor.css(Cor.argb(200, 0xF4, 0xF4, 0xF4));
    ctx.font = (altura * 0.036) + "px " + FONTE;
    ctx.fillText("código da sala", largura / 2, altura * 0.085);
    ctx.fillStyle = Cor.css(Cor.rgb(0x00, 0xF5, 0xD4));
    ctx.font = "bold " + (altura * 0.11) + "px " + FONTE_NUMEROS;
    ctx.fillText(resumo.id, largura / 2, altura * 0.20);
    ctx.textAlign = "left";

    // --- Fase da corrida ---
    const rFase = Ret.novo(largura * 0.055, altura * 0.245, largura * 0.46, altura * 0.80);
    ctx.fillStyle = Cor.css(Cor.argb(130, 0x0A, 0x0E, 0x1C));
    retanguloArredondado(ctx, rFase, altura * 0.022);
    ctx.fill();
    ctx.strokeStyle = Cor.css(Cor.argb(120, 0xFF, 0xD2, 0x4D));
    ctx.lineWidth = Math.max(1, altura * 0.004);
    ctx.stroke();

    ctx.fillStyle = Cor.css(Cor.argb(180, 0xF4, 0xF4, 0xF4));
    ctx.font = (altura * 0.030) + "px " + FONTE;
    ctx.fillText("todos correm esta fase", rFase.left + largura * 0.018, rFase.top + altura * 0.038);
    ctx.fillStyle = Cor.css(Cor.rgb(0xFF, 0xD2, 0x4D));
    ctx.font = "bold " + (altura * 0.045) + "px " + FONTE;
    ctx.fillText(fase.name, rFase.left + largura * 0.018, rFase.top + altura * 0.083);
    ctx.fillStyle = Cor.css(Cor.argb(180, 0xF4, 0xF4, 0xF4));
    ctx.font = (altura * 0.028) + "px " + FONTE;
    ctx.fillText(fase.countryName + " · " + (resumo.voltas || fase.laps) + " voltas",
      rFase.left + largura * 0.018, rFase.top + altura * 0.113);

    const detalhes = [
      ["CLIMA", this.nomeDoClima(resumo.clima)],
      ["ÁGUA", resumo.pocaAgua !== false ? "SIM" : "NÃO"],
      ["ÓLEO", resumo.pocaOleo === true ? "SIM" : "NÃO"],
      ["PILOTOS", "ATÉ " + resumo.maxJogadores]
    ];
    for (let i = 0; i < detalhes.length; i++) {
      const coluna = i % 2;
      const linha = Math.floor(i / 2);
      const x = rFase.left + largura * (0.018 + coluna * 0.185);
      const y = rFase.top + altura * (0.19 + linha * 0.105);
      ctx.fillStyle = Cor.css(Cor.argb(150, 0xF4, 0xF4, 0xF4));
      ctx.font = "bold " + (altura * 0.021) + "px " + FONTE;
      ctx.fillText(detalhes[i][0], x, y);
      ctx.fillStyle = Cor.css(Cor.rgb(0xF4, 0xF4, 0xF4));
      ctx.font = "bold " + (altura * 0.030) + "px " + FONTE;
      ctx.fillText(detalhes[i][1], x, y + altura * 0.040);
    }

    ctx.fillStyle = Cor.css(Cor.argb(170, 0xF4, 0xF4, 0xF4));
    ctx.font = (altura * 0.025) + "px " + FONTE;
    ctx.fillText(resumo.nome || "Sala online", rFase.left + largura * 0.018, rFase.bottom - altura * 0.035);

    if (souAnfitriao) {
      this.botoes.push({ r: rFase, acao: () => { this.escolhendoFase = true; this.faseRolagem = 0; } });
      ctx.textAlign = "right";
      ctx.fillStyle = Cor.css(Cor.rgb(0x00, 0xF5, 0xD4));
      ctx.font = "bold " + (altura * 0.030) + "px " + FONTE;
      ctx.fillText("TROCAR ▸", rFase.right - largura * 0.018, rFase.top + altura * 0.038);
      ctx.textAlign = "left";
    }

    this._desenharJogadores(ctx, largura, altura, resumo);
    this._desenharBotoesDaSala(ctx, largura, altura, resumo, souAnfitriao);
    this._desenharConversa(ctx, largura, altura);
  }

  _desenharJogadores(ctx, largura, altura, resumo) {
    const esquerda = largura * 0.50;
    const direita = largura * 0.955;
    const topo = altura * 0.245;
    const base = altura * 0.80;

    ctx.fillStyle = Cor.css(Cor.argb(130, 0x0A, 0x0E, 0x1C));
    retanguloArredondado(ctx, Ret.novo(esquerda, topo, direita, base), altura * 0.022);
    ctx.fill();
    ctx.strokeStyle = Cor.css(Cor.argb(90, 0x00, 0xF5, 0xD4));
    ctx.lineWidth = Math.max(1, altura * 0.004);
    ctx.stroke();

    ctx.fillStyle = Cor.css(Cor.rgb(0xF4, 0xF4, 0xF4));
    ctx.font = "bold " + (altura * 0.038) + "px " + FONTE;
    ctx.fillText("Na sala (" + resumo.jogadores.length + "/" + resumo.maxJogadores + ")",
      esquerda + largura * 0.018, topo + altura * 0.055);

    const alturaLinha = altura * 0.069;
    const listaTopo = topo + altura * 0.078;
    const listaBase = base - altura * 0.052;
    Ret.definir(this.jogadoresListaRet, esquerda + largura * 0.010, listaTopo,
      direita - largura * 0.010, listaBase);
    const conteudoAltura = resumo.jogadores.length * alturaLinha;
    this.jogadoresRolagemMax = Math.max(0, conteudoAltura - Ret.altura(this.jogadoresListaRet));
    this.jogadoresRolagem = limitar(this.jogadoresRolagem, 0, this.jogadoresRolagemMax);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.jogadoresListaRet.left, this.jogadoresListaRet.top,
      Ret.largura(this.jogadoresListaRet), Ret.altura(this.jogadoresListaRet));
    ctx.clip();

    for (let i = 0; i < resumo.jogadores.length; i++) {
      const j = resumo.jogadores[i];
      const y = listaTopo - this.jogadoresRolagem + i * alturaLinha;
      if (y + alturaLinha < listaTopo || y > listaBase) continue;

      // Miniatura do carro escolhido.
      const carro = Assets.img("car_" + limitar(j.carId, 0, 9));
      const escalaMiniatura = (limitar(j.carId, 0, 9) === 9) ? 1.15 : 1;
      const alturaCarro = alturaLinha * 0.72 * escalaMiniatura;
      if (carro) {
        const larguraCarro = alturaCarro * (carro.width / Math.max(1, carro.height));
        ctx.globalAlpha = j.online ? 1 : 0.35;
        ctx.drawImage(carro, esquerda + largura * 0.018, y - (alturaCarro - alturaLinha * 0.72) * 0.5, larguraCarro, alturaCarro);
        ctx.globalAlpha = 1;
      }

      const xTexto = esquerda + largura * 0.018 + alturaCarro * 1.9;
      ctx.fillStyle = Cor.css(j.online ? Cor.rgb(0xF4, 0xF4, 0xF4) : Cor.argb(110, 0xF4, 0xF4, 0xF4));
      ctx.font = "bold " + (altura * 0.036) + "px " + FONTE;
      ctx.fillText(j.nome + (j.anfitriao ? "  ★" : ""), xTexto, y + alturaCarro * 0.72);

      ctx.textAlign = "right";
      if (!j.online) {
        ctx.fillStyle = Cor.css(Cor.argb(130, 0xF4, 0xF4, 0xF4));
        ctx.font = (altura * 0.030) + "px " + FONTE;
        ctx.fillText("caiu", direita - largura * 0.018, y + alturaCarro * 0.72);
      } else if (j.pronto) {
        ctx.fillStyle = Cor.css(Cor.rgb(0x2E, 0xB8, 0x72));
        ctx.font = "bold " + (altura * 0.032) + "px " + FONTE;
        ctx.fillText("PRONTO", direita - largura * 0.018, y + alturaCarro * 0.72);
      } else {
        ctx.fillStyle = Cor.css(Cor.argb(150, 0xFF, 0xD2, 0x4D));
        ctx.font = (altura * 0.030) + "px " + FONTE;
        ctx.fillText("esperando", direita - largura * 0.018, y + alturaCarro * 0.72);
      }
      ctx.textAlign = "left";
    }
    ctx.restore();
    this._desenharBarraRolagem(ctx, this.jogadoresListaRet,
      this.jogadoresRolagem, this.jogadoresRolagemMax, altura);

    if (resumo.jogadores.length < resumo.minJogadores) {
      ctx.fillStyle = Cor.css(Cor.argb(180, 0xFF, 0xD2, 0x4D));
      ctx.font = (altura * 0.030) + "px " + FONTE;
      ctx.fillText("Precisa de pelo menos " + resumo.minJogadores + " para largar.",
        esquerda + largura * 0.018, base - altura * 0.028);
    }
  }

  _desenharBotoesDaSala(ctx, largura, altura, resumo, souAnfitriao) {
    const larguraBotao = largura * 0.185;
    const alturaBotao = altura * 0.105;
    const y = altura * 0.845;
    let x = largura * 0.055;

    this._botao(ctx, {
      r: Ret.novo(x, y, x + larguraBotao, y + alturaBotao),
      rotulo: this.pronto ? "PRONTO ✓" : "ESTOU PRONTO",
      corBorda: this.pronto ? Cor.rgb(0x2E, 0xB8, 0x72) : Cor.rgb(0xFF, 0xD2, 0x4D),
      aceso: this.pronto,
      acao: () => this.alternarPronto()
    });
    x += larguraBotao * 1.12;

    if (souAnfitriao) {
      const podeLargar = resumo.jogadores.filter(j => j.online).length >= resumo.minJogadores;
      this._botao(ctx, {
        r: Ret.novo(x, y, x + larguraBotao, y + alturaBotao),
        rotulo: "LARGAR",
        corBorda: podeLargar ? Cor.rgb(0x00, 0xF5, 0xD4) : Cor.argb(70, 0xF4, 0xF4, 0xF4),
        apagado: !podeLargar,
        acao: () => { if (podeLargar) this.largar(); }
      });
      x += larguraBotao * 1.12;
    }

    this._botao(ctx, {
      r: Ret.novo(x, y, x + larguraBotao, y + alturaBotao),
      rotulo: "PROVOCAR",
      corBorda: Cor.rgb(0xF5, 0x00, 0x90),
      acao: () => this.provocar()
    });
  }

  _desenharConversa(ctx, largura, altura) {
    if (this.conversa.length === 0) return;
    ctx.font = (altura * 0.030) + "px " + FONTE;
    let y = altura * 0.42;
    for (const c of this.conversa) {
      const idade = this.tempo - c.em;
      if (idade > 12) continue;
      const alfa = idade > 9 ? limitar((12 - idade) / 3, 0, 1) : 1;
      ctx.fillStyle = Cor.css(Cor.argb(Math.round(200 * alfa), 0xF4, 0xF4, 0xF4));
      ctx.fillText(c.nome + ": " + c.texto, largura * 0.055, y);
      y += altura * 0.042;
    }
  }

  // ---- Escolha de fase (só o anfitrião vê) ----

  _desenharEscolhaDeFase(ctx, largura, altura) {
    this._titulo(ctx, largura, altura, "ESCOLHA A FASE", "todos da sala vão correr esta pista");

    const colunas = 4;
    const esquerda = largura * 0.06;
    const direita = largura * 0.94;
    const topo = altura * 0.25;
    const larguraCelula = (direita - esquerda) / colunas;
    const alturaCelula = altura * 0.115;
    const linhasVisiveis = 5;
    const totalLinhas = Math.ceil(StageCatalog.count() / colunas);
    this.faseRolagemMax = Math.max(0, totalLinhas - linhasVisiveis);
    this.faseRolagem = limitar(this.faseRolagem, 0, this.faseRolagemMax);
    const primeiraLinha = Math.floor(this.faseRolagem);
    const deslocamento = (this.faseRolagem - primeiraLinha) * alturaCelula;
    const primeira = primeiraLinha * colunas;
    Ret.definir(this.fasesListaRet, esquerda, topo, direita, topo + linhasVisiveis * alturaCelula);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.fasesListaRet.left, this.fasesListaRet.top,
      Ret.largura(this.fasesListaRet), Ret.altura(this.fasesListaRet));
    ctx.clip();

    for (let i = 0; i < colunas * (linhasVisiveis + 1); i++) {
      const indice = primeira + i;
      if (indice >= StageCatalog.count()) break;
      const fase = StageCatalog.byIndex(indice);
      const col = i % colunas;
      const lin = Math.floor(i / colunas);
      const r = Ret.novo(
        esquerda + col * larguraCelula + largura * 0.006,
        topo + lin * alturaCelula - deslocamento,
        esquerda + (col + 1) * larguraCelula - largura * 0.006,
        topo + (lin + 1) * alturaCelula - altura * 0.014 - deslocamento
      );

      const atual = indice === (this.resumo ? this.resumo.fase : -1);
      ctx.fillStyle = Cor.css(Cor.argb(atual ? 170 : 110, 0x1A, 0x24, 0x37));
      retanguloArredondado(ctx, r, altura * 0.016);
      ctx.fill();
      ctx.strokeStyle = Cor.css(atual ? Cor.rgb(0x00, 0xF5, 0xD4) : Cor.argb(70, 0xF4, 0xF4, 0xF4));
      ctx.lineWidth = Math.max(1, altura * 0.003);
      ctx.stroke();

      ctx.fillStyle = Cor.css(Cor.argb(200, 0xFF, 0xD2, 0x4D));
      ctx.font = "bold " + (altura * 0.026) + "px " + FONTE;
      ctx.fillText((indice + 1) + ". " + fase.countryName, r.left + largura * 0.010, r.top + altura * 0.032);

      ctx.fillStyle = Cor.css(Cor.rgb(0xF4, 0xF4, 0xF4));
      ctx.font = "bold " + (altura * 0.030) + "px " + FONTE;
      const nome = fase.name.length > 20 ? fase.name.slice(0, 19) + "…" : fase.name;
      ctx.fillText(nome, r.left + largura * 0.010, r.top + altura * 0.068);

      this.botoes.push({ r: r, clip: this.fasesListaRet, acao: () => this.trocarFase(indice) });
    }
    ctx.restore();
    this._desenharBarraRolagem(ctx, this.fasesListaRet,
      this.faseRolagem * alturaCelula, this.faseRolagemMax * alturaCelula, altura);

    // Rolagem
    const larguraBotao = largura * 0.14;
    const alturaBotao = altura * 0.09;
    const y = altura * 0.855;

    this._botao(ctx, {
      r: Ret.novo(largura * 0.30, y, largura * 0.30 + larguraBotao, y + alturaBotao),
      rotulo: "◀ ANTES",
      corBorda: Cor.rgb(0xFF, 0xD2, 0x4D),
      apagado: this.faseRolagem <= 0,
      acao: () => { this.faseRolagem = Math.max(0, this.faseRolagem - linhasVisiveis); }
    });

    this._botao(ctx, {
      r: Ret.novo(largura * 0.56, y, largura * 0.56 + larguraBotao, y + alturaBotao),
      rotulo: "DEPOIS ▶",
      corBorda: Cor.rgb(0xFF, 0xD2, 0x4D),
      apagado: this.faseRolagem + linhasVisiveis >= totalLinhas,
      acao: () => {
        this.faseRolagem = Math.min(this.faseRolagemMax, this.faseRolagem + linhasVisiveis);
      }
    });
  }

  // ---- Etapa 3: erro ----

  _desenharErro(ctx, largura, altura) {
    this._titulo(ctx, largura, altura, "NÃO DEU", "");

    ctx.textAlign = "center";
    ctx.fillStyle = Cor.css(Cor.rgb(0xF4, 0xF4, 0xF4));
    ctx.font = (altura * 0.042) + "px " + FONTE;
    ctx.fillText(this.erro, largura / 2, altura * 0.42);

    ctx.fillStyle = Cor.css(Cor.argb(160, 0xF4, 0xF4, 0xF4));
    ctx.font = (altura * 0.030) + "px " + FONTE;
    ctx.fillText("Servidor: " + this.app.save.onlineServerUrl, largura / 2, altura * 0.50);
    ctx.fillText("Dá para trocar o endereço em Configurações.", largura / 2, altura * 0.55);
    ctx.textAlign = "left";

    const larguraBotao = largura * 0.22;
    const alturaBotao = altura * 0.11;
    this._botao(ctx, {
      r: Ret.novo(largura / 2 - larguraBotao / 2, altura * 0.66,
                  largura / 2 + larguraBotao / 2, altura * 0.66 + alturaBotao),
      rotulo: "TENTAR DE NOVO",
      corBorda: Cor.rgb(0x00, 0xF5, 0xD4),
      acao: () => { this.etapa = ETAPA_ESCOLHA; this.erro = ""; this._buscarLista(); }
    });
  }

  /** Indicador discreto comum às listas de salas, pilotos e fases. */
  _desenharBarraRolagem(ctx, area, valor, maximo, alturaTela) {
    if (!(maximo > 0) || Ret.altura(area) <= 0) return;
    const largura = Math.max(3, alturaTela * 0.006);
    const trilhoH = Ret.altura(area);
    const marcaH = Math.max(alturaTela * 0.045, trilhoH * (trilhoH / (trilhoH + maximo)));
    const t = limitar(valor / maximo, 0, 1);
    const x = area.right - largura * 1.4;
    const y = area.top + (trilhoH - marcaH) * t;
    ctx.fillStyle = Cor.css(Cor.argb(55, 0xF4, 0xF4, 0xF4));
    ctx.fillRect(x, area.top, largura, trilhoH);
    ctx.fillStyle = Cor.css(Cor.argb(205, 0x00, 0xF5, 0xD4));
    ctx.fillRect(x, y, largura, marcaH);
  }

  // ---- Botão genérico ----

  _botao(ctx, opcoes) {
    const r = opcoes.r;
    const corBorda = opcoes.corBorda || Cor.rgb(0x00, 0xF5, 0xD4);
    const apagado = !!opcoes.apagado;

    ctx.fillStyle = Cor.css(Cor.argb(opcoes.aceso ? 150 : 110, 0x0A, 0x0E, 0x1C));
    retanguloArredondado(ctx, r, Ret.altura(r) * 0.26);
    ctx.fill();
    ctx.strokeStyle = Cor.css(corBorda, apagado ? 70 : 255);
    ctx.lineWidth = Math.max(1.5, Ret.altura(r) * 0.055);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = Cor.css(apagado ? Cor.argb(90, 0xF4, 0xF4, 0xF4) : Cor.rgb(0xF4, 0xF4, 0xF4));
    const alturaTexto = Ret.altura(r) * (opcoes.sub ? 0.30 : 0.36);
    ctx.font = "bold " + alturaTexto + "px " + FONTE;
    const yTexto = opcoes.sub ? Ret.centroY(r) - Ret.altura(r) * 0.04 : Ret.centroY(r) + alturaTexto * 0.35;
    ctx.fillText(opcoes.rotulo, Ret.centroX(r), yTexto);

    if (opcoes.sub) {
      ctx.fillStyle = Cor.css(Cor.argb(150, 0xF4, 0xF4, 0xF4));
      ctx.font = (Ret.altura(r) * 0.20) + "px " + FONTE;
      ctx.fillText(opcoes.sub, Ret.centroX(r), Ret.centroY(r) + Ret.altura(r) * 0.26);
    }
    ctx.textAlign = "left";

    if (!apagado && opcoes.acao) this.botoes.push({ r: r, acao: opcoes.acao });
  }

  // -----------------------------------------------------------------------
  // Toque
  // -----------------------------------------------------------------------

  aoApontar(tipo, x, y) {
    const acao = String(tipo || "").toLowerCase();
    if (acao === "baixo") {
      this.arrastoLista = this._listaEm(x, y);
      this.arrastoInicioY = y;
      this.arrastoUltimoY = y;
      this.arrastouLista = false;
      this.botaoPressionado = this._botaoEm(x, y);
      return;
    }

    if (acao === "move" || acao === "mover") {
      if (!this.arrastoLista) return;
      const dy = y - this.arrastoUltimoY;
      this.arrastoUltimoY = y;
      if (Math.abs(y - this.arrastoInicioY) > Math.max(8, this.app.altura * 0.012)) {
        this.arrastouLista = true;
        this.botaoPressionado = null;
      }
      this._rolarLista(this.arrastoLista, -dy);
      return;
    }

    if (acao === "cancelar") {
      this.arrastoLista = null;
      this.botaoPressionado = null;
      this.arrastouLista = false;
      return;
    }

    if (acao !== "cima") return;
    const botao = this._botaoEm(x, y);
    if (!this.arrastouLista && botao && this._mesmoBotao(botao, this.botaoPressionado)) {
      this.app.sound.playClick();
      botao.acao();
    }
    this.arrastoLista = null;
    this.botaoPressionado = null;
    this.arrastouLista = false;
  }

  _botaoEm(x, y) {
    // De trás para frente: o último desenhado está por cima.
    for (let i = this.botoes.length - 1; i >= 0; i--) {
      const b = this.botoes[i];
      if (b.clip && !Ret.contem(b.clip, x, y)) continue;
      if (Ret.contem(b.r, x, y)) return b;
    }
    return null;
  }

  _mesmoBotao(a, b) {
    if (!a || !b || !a.r || !b.r) return false;
    const tolerancia = 1;
    return Math.abs(a.r.left - b.r.left) <= tolerancia &&
      Math.abs(a.r.top - b.r.top) <= tolerancia &&
      Math.abs(a.r.right - b.r.right) <= tolerancia &&
      Math.abs(a.r.bottom - b.r.bottom) <= tolerancia;
  }

  _listaEm(x, y) {
    if (this.escolhendoFase && this.faseRolagemMax > 0 && Ret.contem(this.fasesListaRet, x, y)) return "fases";
    if (this.etapa === ETAPA_ESCOLHA && this.salasRolagemMax > 0 && Ret.contem(this.salasListaRet, x, y)) return "salas";
    if (this.etapa === ETAPA_SALA && !this.escolhendoFase && this.jogadoresRolagemMax > 0 && Ret.contem(this.jogadoresListaRet, x, y)) return "jogadores";
    return null;
  }

  _rolarLista(lista, delta) {
    if (lista === "salas") {
      this.salasRolagem = limitar(this.salasRolagem + delta, 0, this.salasRolagemMax);
    } else if (lista === "jogadores") {
      this.jogadoresRolagem = limitar(this.jogadoresRolagem + delta, 0, this.jogadoresRolagemMax);
    } else if (lista === "fases") {
      const alturaLinha = Math.max(1, this.app.altura * 0.115);
      this.faseRolagem = limitar(this.faseRolagem + delta / alturaLinha, 0, this.faseRolagemMax);
    }
  }

  /** Roda do mouse ou gesto de dois dedos no trackpad. */
  aoGirarRoda(delta, x, y) {
    const lista = this._listaEm(x, y);
    if (lista) this._rolarLista(lista, delta);
  }

  aoTeclar(evento, apertou) {
    if (!apertou) return;
    if (evento.code === "Escape") {
      if (this.escolhendoFase) { this.escolhendoFase = false; return; }
      if (this.etapa === ETAPA_SALA) this.sairDaSala();
      else this.app.irPara("menu");
    }
  }
}

window.TelaOnline = TelaOnline;
