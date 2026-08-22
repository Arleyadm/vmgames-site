"use strict";
/*
 * Carregador de imagens e sons.
 *
 * No Android o codigo pedia o recurso pelo nome (getIdentifier). Aqui a ideia
 * e a mesma: Assets.img("car_0") devolve a imagem ja carregada, ou null se o
 * arquivo nao existe — exatamente como o Kotlin tratava resId == 0.
 *
 * As imagens grandes de fundo (uma por fase) sao pesadas demais para carregar
 * todas de uma vez: elas entram sob demanda quando a fase abre.
 */
const Assets = (function () {

  const imagens = {};      // nome -> HTMLImageElement pronto
  const carregando = {};   // nome -> Promise
  const audios = {};       // nome -> ArrayBuffer decodificado ou HTMLAudioElement

  /** Imagens que precisam estar prontas antes do primeiro frame de qualquer tela. */
  const ESSENCIAIS = [
    "menu_bg_turbo_race", "menu_btn_play", "menu_btn_multiplayer", "menu_btn_garage",
    "menu_btn_settings", "menu_btn_exit", "btn_back", "btn_next", "btn_prev",
    "btn_generic_large", "btn_generic_secondary",
    "worldtour_brazil", "worldtour_usa", "worldtour_japan", "worldtour_italy",
    "moeda", "icone"
  ];

  /** Imagens necessarias durante a corrida (fora os fundos de fase). */
  const DA_CORRIDA = [
    "control_arrow_left", "control_arrow_right", "control_pedal_accel", "control_pedal_brake",
    "countdown_1", "countdown_2", "countdown_3", "countdown_go",
    "victory_scene", "defeat_scene", "guardrail_side",
    "arbustos", "arvore_pinheiro", "arvore_praia", "cacto_deserto",
    "bush_flower", "bush_light", "bush_round", "grass_clump",
    "tree_birch", "tree_cypress", "tree_oak", "tree_snow",
    "placa_canyon", "placa_chevron", "placa_chevron_horizontal", "placa_curva", "placa_direcional",
    "sign_bump", "sign_slippery", "sign_speed_limit", "sign_turn_right", "sign_warning",
    "puddle_oil", "puddle_water", "moeda"
  ];

  function carregarImagem(nome) {
    if (imagens[nome] !== undefined) return Promise.resolve(imagens[nome]);
    if (carregando[nome]) return carregando[nome];
    const caminho = MAPA_IMAGENS[nome];
    if (!caminho) {
      imagens[nome] = null;
      return Promise.resolve(null);
    }
    const promessa = new Promise(function (resolve) {
      const img = new Image();
      img.decoding = "async";
      img.onload = function () { imagens[nome] = img; resolve(img); };
      img.onerror = function () { imagens[nome] = null; resolve(null); };
      img.src = caminho;
    });
    carregando[nome] = promessa;
    return promessa;
  }

  function carregarLista(nomes, aoProgredir) {
    let prontas = 0;
    const total = nomes.length;
    return Promise.all(nomes.map(function (n) {
      return carregarImagem(n).then(function (r) {
        prontas++;
        if (aoProgredir) aoProgredir(prontas, total);
        return r;
      });
    }));
  }

  return {
    /** Devolve a imagem se ela ja estiver carregada; senao dispara o carregamento e devolve null. */
    img(nome) {
      const pronta = imagens[nome];
      if (pronta !== undefined) return pronta;
      carregarImagem(nome);
      return null;
    },

    /** Espera a imagem terminar de carregar. */
    imgAsync(nome) { return carregarImagem(nome); },

    /** True quando o nome existe na tabela de arquivos. */
    existe(nome) { return !!MAPA_IMAGENS[nome]; },

    caminhoAudio(nome) { return MAPA_AUDIOS[nome] || null; },

    caminhoVideo(nome) { return MAPA_VIDEOS[nome] || null; },

    carregarEssenciais(aoProgredir) { return carregarLista(ESSENCIAIS, aoProgredir); },

    carregarDaCorrida(aoProgredir) { return carregarLista(DA_CORRIDA, aoProgredir); },

    /** Carrega os carros (traseira + inclinado dos dois lados). */
    carregarCarros(aoProgredir) {
      const nomes = [];
      for (let i = 0; i < 10; i++) {
        nomes.push("car_" + i, "car_" + i + "_left", "car_" + i + "_right");
      }
      return carregarLista(nomes, aoProgredir);
    },

    /** Fundo de uma fase: carregado so quando a fase abre. */
    carregarFundoDaFase(stageIndex) {
      const numero = String(limitar(stageIndex + 1, 1, 28)).padStart(2, "0");
      const alternativos = ["stage_bg_" + numero, "rain_bg_brasil_01", "rio_litoraneo_bg"];
      return carregarLista(alternativos.filter(n => MAPA_IMAGENS[n]));
    },

    lista: MAPA_IMAGENS
  };
})();

window.Assets = Assets;
