"use strict";
/*
 * Cola do jogo no navegador.
 *
 * No Android cada tela era uma Activity e o sistema cuidava de trocar entre
 * elas. Aqui existe um canvas só, e este arquivo faz o papel do sistema:
 * guarda a tela atual, roda o laço, redimensiona e entrega o toque e o teclado
 * para quem estiver no ar.
 *
 * A tela de corrida (TelaDeCorrida) é a exceção: ela roda o próprio
 * requestAnimationFrame, porque a física precisa de passo fixo e o porte do
 * GameLoop.kt ficou dentro dela. Quando a corrida está no ar, o laço daqui sai
 * do caminho.
 */

const Jogo = (function () {

  const tela = document.getElementById("tela");
  const ctx = tela.getContext("2d", { alpha: false });
  const camadaHtml = document.getElementById("camada-html");
  const aviso = document.getElementById("aviso-carregando");
  const barraDeProgresso = document.getElementById("progresso");

  const save = new SaveManager();
  const sound = new SoundManager(save);

  let telaAtual = null;
  let nomeDaTelaAtual = "";
  let ultimoQuadro = 0;
  let rodando = false;

  // O canvas trabalha em pixels de verdade; o CSS cuida do tamanho na página.
  let largura = 1280;
  let altura = 720;

  const app = {
    save: save,
    sound: sound,
    camadaHtml: camadaHtml,
    canvas: tela,
    get largura() { return largura; },
    get altura() { return altura; },
    irPara: irPara,
    telaAtual() { return nomeDaTelaAtual; }
  };

  // -----------------------------------------------------------------------
  // Tamanho do canvas
  // -----------------------------------------------------------------------

  function redimensionar() {
    // Teto de 2x: acima disso o ganho visual é pequeno e o custo de pintura na
    // CPU é grande — e este jogo desenha tudo no Canvas 2D, sem GPU por
    // triângulo. É o mesmo problema de desempenho que o app tem no SurfaceView.
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    const larguraCss = tela.clientWidth || window.innerWidth;
    const alturaCss = tela.clientHeight || window.innerHeight;

    const novaLargura = Math.max(320, Math.round(larguraCss * escala));
    const novaAltura = Math.max(200, Math.round(alturaCss * escala));
    if (novaLargura === largura && novaAltura === altura && tela.width === largura) return;

    largura = novaLargura;
    altura = novaAltura;
    tela.width = largura;
    tela.height = altura;

    if (telaAtual && typeof telaAtual.setup === "function") {
      telaAtual.setup(largura, altura);
    }
    if (telaAtual && typeof telaAtual.aoRedimensionar === "function") {
      telaAtual.aoRedimensionar(largura, altura);
    }
  }

  /** Converte a posição do ponteiro na página para a posição dentro do canvas. */
  function posicaoNoCanvas(evento) {
    const caixa = tela.getBoundingClientRect();
    return {
      x: (evento.clientX - caixa.left) * (largura / Math.max(1, caixa.width)),
      y: (evento.clientY - caixa.top) * (altura / Math.max(1, caixa.height))
    };
  }

  // -----------------------------------------------------------------------
  // Troca de tela
  // -----------------------------------------------------------------------

  function criarTela(nome, parametros) {
    switch (nome) {
      case "menu": return new TelaDeMenu(app);
      case "worldtour": return new TelaWorldTour(app);
      case "garagem": return new TelaDaGaragem(app);
      case "config": return new TelaDeConfiguracoes(app);
      case "online": return new TelaOnline(app);
      case "video": return new TelaDeVideo(app);
      case "corrida": return criarCorrida(parametros || {});
      default: return new TelaDeMenu(app);
    }
  }

  /**
   * Monta a corrida. É o que a GameActivity.kt fazia no onCreate: cria a view,
   * liga o áudio e o ouvinte, e entrega a fase escolhida.
   */
  function criarCorrida(parametros) {
    const corrida = new TelaDeCorrida(tela);
    corrida.autoLoop = true;   // ela roda o próprio requestAnimationFrame

    const stageIndex = limitar(Math.trunc(parametros.stageIndex || 0), 0, StageCatalog.count() - 1);
    const nomeDoJogador = parametros.playerName || save.playerName;

    corrida.configure(stageIndex, save, sound, {
      onExitToMenu() {
        // Corrida online: sair da corrida devolve para o saguão, não para o menu.
        irPara(OnlineSession.enabled ? "online" : "worldtour");
      },
      onOpenGarage() { irPara("garagem"); },
      onCollision() {
        if (save.vibrationEnabled && navigator.vibrate) {
          try { navigator.vibrate(120); } catch (e) { /* o aparelho pode recusar */ }
        }
      },
      onBeforeStageStart(start) {
        // No app aqui entrava o intersticial do AdMob. Não há anúncio no
        // navegador, então a corrida começa direto.
        start();
      },
      onRaceResult(indiceDaFase, venceu, pontos, moedas) {
        save.addCoins(moedas);
        if (venceu) save.unlockStage(indiceDaFase + 1);
      },
      onCountryEnding(indiceDaFase) {
        // V79/V109: zeramento por país. No multijogador não roda vídeo.
        if (OnlineSession.enabled) return;
        const videos = {
          9: "finalizacao_brasil",
          15: "finalizacao_estados_unidos",
          21: "finalizacao_japao",
          27: "final_italia"
        };
        const nome = videos[indiceDaFase];
        if (!nome) return;
        irPara("video", { nome: nome, depois: "worldtour", podePular: false });
      }
    }, nomeDoJogador);

    if (parametros.online && OnlineSession.service) {
      corrida.attachMultiplayer(OnlineSession.service);
    }

    corrida.setup(largura, altura);
    corrida.resume();
    return corrida;
  }

  function irPara(nome, parametros) {
    if (telaAtual) {
      if (typeof telaAtual.destroy === "function") telaAtual.destroy();
      else if (typeof telaAtual.sair === "function") telaAtual.sair();
    }

    nomeDaTelaAtual = nome;
    telaAtual = criarTela(nome, parametros);

    if (typeof telaAtual.entrar === "function") telaAtual.entrar(parametros);
    if (typeof telaAtual.setup === "function" && !telaAtual.autoLoop) {
      telaAtual.setup(largura, altura);
    }
  }

  // -----------------------------------------------------------------------
  // Laço das telas de menu
  // -----------------------------------------------------------------------

  function quadro(agora) {
    if (!rodando) return;
    requestAnimationFrame(quadro);

    if (!ultimoQuadro) ultimoQuadro = agora;
    let dt = (agora - ultimoQuadro) / 1000;
    ultimoQuadro = agora;
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.12) dt = 0.12;   // aba voltando do fundo não dá salto

    // A corrida desenha sozinha, no laço dela.
    if (!telaAtual || telaAtual.autoLoop) return;

    if (typeof telaAtual.update === "function") telaAtual.update(dt);
    if (typeof telaAtual.render === "function") telaAtual.render(ctx, largura, altura);
  }

  // -----------------------------------------------------------------------
  // Entrada
  // -----------------------------------------------------------------------

  function ligarEntrada() {
    function despachar(tipo, evento) {
      // A corrida escuta os próprios eventos no canvas (multi-toque), então
      // não repassamos nada para ela daqui.
      if (!telaAtual || telaAtual.autoLoop) return;
      if (typeof telaAtual.aoApontar !== "function") return;
      const p = posicaoNoCanvas(evento);
      telaAtual.aoApontar(tipo, p.x, p.y);
    }

    tela.addEventListener("pointerdown", function (e) {
      sound.destravar();     // o navegador só libera som depois de um gesto
      despachar("baixo", e);
    });
    tela.addEventListener("pointermove", function (e) { despachar("move", e); });
    tela.addEventListener("pointerup", function (e) { despachar("cima", e); });
    tela.addEventListener("pointercancel", function (e) { despachar("cima", e); });
    tela.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    window.addEventListener("keydown", function (e) {
      sound.destravar();
      if (!telaAtual || telaAtual.autoLoop) return;
      if (typeof telaAtual.aoTeclar === "function") telaAtual.aoTeclar(e, true);
    });
    window.addEventListener("keyup", function (e) {
      if (!telaAtual || telaAtual.autoLoop) return;
      if (typeof telaAtual.aoTeclar === "function") telaAtual.aoTeclar(e, false);
    });

    window.addEventListener("resize", redimensionar);
    window.addEventListener("orientationchange", function () {
      setTimeout(redimensionar, 250);
    });

    // Aba escondida congela o requestAnimationFrame: pausar o áudio evita o
    // motor ficar roncando em segundo plano.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (telaAtual && typeof telaAtual.pause === "function") telaAtual.pause();
        sound.pauseAll();
      } else {
        sound.resumeAll();
        if (telaAtual && typeof telaAtual.resume === "function") telaAtual.resume();
        ultimoQuadro = 0;
      }
    });

    // Sair no meio da corrida online sem avisar deixa a vaga presa por 15s.
    window.addEventListener("beforeunload", function () {
      if (OnlineSession.service) OnlineSession.service.close();
    });
  }

  // -----------------------------------------------------------------------
  // Partida
  // -----------------------------------------------------------------------

  function mostrarProgresso(prontas, total) {
    if (!barraDeProgresso) return;
    const pct = total > 0 ? Math.round((prontas / total) * 100) : 0;
    barraDeProgresso.style.width = pct + "%";
  }

  function comecar() {
    redimensionar();
    ligarEntrada();

    // As imagens do menu primeiro: é a tela que abre. O resto entra em seguida,
    // sem segurar a partida.
    Assets.carregarEssenciais(mostrarProgresso).then(function () {
      if (aviso) aviso.classList.add("sumindo");
      setTimeout(function () { if (aviso) aviso.remove(); }, 450);

      rodando = true;
      requestAnimationFrame(quadro);

      // A abertura só aparece uma vez por navegador; depois vai direto ao menu.
      if (!save.introSeen && Assets.caminhoVideo("menu_intro")) {
        save.introSeen = true;
        irPara("video", { nome: "menu_intro", depois: "menu", podePular: true });
      } else {
        irPara("menu");
      }

      // Carrega o resto em segundo plano, na ordem em que o jogo costuma pedir.
      Assets.carregarCarros().then(function () {
        return Assets.carregarDaCorrida();
      });
    });
  }

  return {
    comecar: comecar,
    app: app,
    irPara: irPara,
    redimensionar: redimensionar,
    telaAtual() { return telaAtual; }
  };
})();

window.Jogo = Jogo;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Jogo.comecar);
} else {
  Jogo.comecar();
}
