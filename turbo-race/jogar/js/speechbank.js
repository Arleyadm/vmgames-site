"use strict";
/*
 * Banco dinamico de falas do Turbo Race. Porte de SpeechBank.kt.
 *
 * As frases sao montadas por combinacao de abertura + acao + contexto. Isso
 * cria milhares de variacoes sem uma lista gigante fixa: so nos blocos
 * principais ha mais de 5.000 combinacoes possiveis.
 */
const SpeechBank = (function () {

  const ESTIMATED_TOTAL_PHRASES = 5760;

  const CAT_PLAYER_RUN = 1;
  const CAT_PLAYER_OVERTAKE = 2;
  const CAT_PLAYER_CRASH = 3;
  const CAT_PLAYER_ITEM = 4;
  const CAT_AI_RIVAL = 10;
  const CAT_AI_OVERTAKE = 11;
  const CAT_AI_GOT_PASSED = 12;
  const CAT_AI_TURBO = 13;

  const playerRunOpeners = [
    "Pé no fundo", "Motor cantando", "Linha limpa", "Reta livre", "Agora vai",
    "Segura o volante", "Ritmo de campeão", "Vem comigo", "Sem aliviar", "Tô no controle",
    "Pista aberta", "Carro na mão", "Marcha cheia", "Vácuo perfeito", "Olho na curva",
    "Acelerando forte", "Pneu quente", "Foco total", "Turbo Race", "Vou buscar"
  ];

  const playerOvertakeOpeners = [
    "Passei", "Abriu espaço", "Fiquei na frente", "Ultrapassagem limpa", "Essa foi minha",
    "Na raça", "No vácuo", "Por dentro", "Por fora", "No detalhe",
    "Deixei para trás", "Subi posição", "Peguei a linha", "Botei pressão", "Fui embora",
    "Manobra perfeita", "Agora é caça", "Fechei a curva", "Entrei forte", "Sem medo"
  ];

  const playerCrashOpeners = [
    "Eita", "Segura", "Bateu de leve", "Quase perdi", "Volta pra pista",
    "Controle recuperado", "Foi por pouco", "O carro sambou", "Respira", "Ainda dá",
    "Sem desistir", "Arranhou só", "Corrige rápido", "Dá para salvar", "A pista cobrou",
    "Pneu escapou", "Fui largo", "Toque forte", "Calma no volante", "Reage agora"
  ];

  const aiOpenersByStyle = [
    ["Frio no volante", "Calculando a curva", "Sem emoção", "Linha perfeita", "Controle total", "Estratégia pura", "Apex na mira", "Ritmo constante", "Freio no ponto", "Milímetro certo"],
    ["Sai da frente", "Tô chegando", "Pressão máxima", "Vou te buscar", "Segura essa", "Ninguém escapa", "Ataque total", "Cheguei junto", "Não pisca", "De lado na curva"],
    ["Show de pista", "Plateia gritando", "Olha a manobra", "Estilo puro", "Fiz bonito", "Câmera em mim", "Brilho no asfalto", "Manobra de cinema", "Turbo no palco", "Espetáculo na reta"],
    ["Motor nervoso", "Pneu fumaçando", "Volante pesado", "Marcha rasgando", "Chão tremendo", "Freio quente", "Carro no limite", "Ronco alto", "Nitro na veia", "Pressão no painel"],
    ["Piloto ninja", "Cortei o vento", "Curva invisível", "Sombra na pista", "Passe limpo", "Ataque silencioso", "No reflexo", "Sumindo no vácuo", "Rota secreta", "Virei fantasma"]
  ];

  const actions = [
    "vou buscar a ponta", "vou colar no vácuo", "vou frear mais tarde", "vou mergulhar por dentro",
    "vou atacar por fora", "vou defender a linha", "vou manter o ritmo", "vou abrir vantagem",
    "vou forçar o limite", "vou acertar o apex", "vou sair tracionando", "vou acelerar antes",
    "vou guardar turbo", "vou soltar tudo", "vou entrar de lado", "vou segurar a pressão",
    "vou virar no detalhe", "vou encostar no líder", "vou escapar da confusão", "vou mandar no traçado",
    "vou ganhar no braço", "vou passar no talento", "vou cortar o vento", "vou dominar essa volta"
  ];

  const contexts = [
    "nessa reta", "na próxima curva", "antes da placa", "depois do apex", "no trecho rápido",
    "na descida", "na subida", "no miolo da pista", "na linha de chegada", "com pneu quente",
    "com motor cheio", "sem tirar o pé"
  ];

  const crashActions = [
    "mas ainda estou na corrida", "e já corrigi", "mas não acabou", "e volto acelerando",
    "mas o carro aguenta", "e sigo na briga", "mas perdi pouco", "e vou recuperar",
    "mas mantenho foco", "e a curva cobra", "mas piso de novo", "e seguro no braço",
    "mas ainda dá pódio", "e volto para o traçado", "mas não entrego", "e a corrida continua",
    "mas reagi rápido", "e não largo o volante", "mas salvei no reflexo", "e vou para cima"
  ];

  const itemActions = [
    "item ativado", "soltei o upgrade", "agora tem surpresa", "preparem o asfalto",
    "modo ataque ligado", "vantagem na pista", "jogada especial", "é agora ou nunca",
    "botão mágico acionado", "tática liberada", "upgrade na veia", "a corrida virou"
  ];

  function compose(category, openers, verbs, places, used) {
    const total = openers.length * verbs.length * places.length;
    if (total <= 0) return "Acelera!";

    let idx = MathUtils.randomInt(0, total - 1);
    let uniqueId = category * 100000 + idx;
    let tries = 0;
    while (used.has(uniqueId) && tries < 80) {
      idx = MathUtils.randomInt(0, total - 1);
      uniqueId = category * 100000 + idx;
      tries++;
    }

    if (used.has(uniqueId)) {
      const base = category * 100000;
      const end = base + total;
      for (const v of Array.from(used)) {
        if (v >= base && v < end) used.delete(v);
      }
    }
    used.add(uniqueId);

    const openerIndex = idx % openers.length;
    const verbIndex = Math.trunc(idx / openers.length) % verbs.length;
    const placeIndex = Math.trunc(idx / (openers.length * verbs.length)) % places.length;
    return openers[openerIndex] + ", " + verbs[verbIndex] + " " + places[placeIndex] + "!";
  }

  /**
   * O Kotlin cortava a frase em 46 caracteres com take(46), e isso partia
   * palavra no meio ("e agora ou nun"). Aqui o corte volta ate o ultimo espaco
   * e fecha com reticencias — mesmo limite, leitura melhor.
   */
  function encurtar(frase) {
    if (frase.length <= 46) return frase;
    const cortada = frase.substring(0, 46);
    const espaco = cortada.lastIndexOf(" ");
    return (espaco > 20 ? cortada.substring(0, espaco) : cortada.trim()) + "…";
  }

  function styleFor(car) {
    const h = hashCodeDeTexto(car.driverName) ^ (car.spriteIndex * 97);
    return ((h >>> 1) % aiOpenersByStyle.length);
  }

  return {
    ESTIMATED_TOTAL_PHRASES: ESTIMATED_TOTAL_PHRASES,

    nextPlayerRun(used) { return compose(CAT_PLAYER_RUN, playerRunOpeners, actions, contexts, used); },

    nextPlayerOvertake(used) { return compose(CAT_PLAYER_OVERTAKE, playerOvertakeOpeners, actions, contexts, used); },

    nextPlayerCrash(used) { return compose(CAT_PLAYER_CRASH, playerCrashOpeners, crashActions, contexts, used); },

    nextPlayerItem(used, itemName) {
      const frase = compose(CAT_PLAYER_ITEM, [String(itemName).toUpperCase(), "Upgrade", "Item especial", "Turbo Race"], itemActions, contexts, used);
      return encurtar(frase);
    },

    nextAiRival(car, used) {
      const style = styleFor(car);
      return encurtar(compose(CAT_AI_RIVAL + style, aiOpenersByStyle[style], actions, contexts, used));
    },

    nextAiOvertakePlayer(car, used) {
      const style = styleFor(car);
      const verbs = ["te passei", "abri vantagem", "peguei sua linha", "entrei no vácuo", "fui por dentro", "fui por fora", "ganhei posição", "tomei a curva"];
      return encurtar(compose(CAT_AI_OVERTAKE + style, aiOpenersByStyle[style], verbs, contexts, used));
    },

    nextAiGotPassed(car, used) {
      const style = styleFor(car);
      const verbs = ["vou dar o troco", "não acabou", "vou colar de novo", "vou buscar essa posição", "boa manobra", "vou responder na reta", "tô na sua cola", "essa disputa é minha"];
      return encurtar(compose(CAT_AI_GOT_PASSED + style, aiOpenersByStyle[style], verbs, contexts, used));
    },

    nextAiTurbo(car, used) {
      const style = styleFor(car);
      const verbs = ["turbo ligado", "motor no máximo", "pressão total", "agora eu sumo", "boost ativado", "pneu gritando", "sem aliviar", "reta engolida"];
      return encurtar(compose(CAT_AI_TURBO + style, aiOpenersByStyle[style], verbs, contexts, used));
    }
  };
})();

window.SpeechBank = SpeechBank;
