/* Anuncios laterais da versao web do Sugar Strike.
   ---------------------------------------------------------------------------
   Regras que este arquivo respeita, e que e melhor nao afrouxar:

   1. NUNCA roda dentro do aplicativo Android. AdSense e para site, AdMob e
      para aplicativo; misturar os dois viola a politica das duas redes e
      arrisca a conta que ja rende no Turbo Race.
   2. So aparece quando o jogador NAO esta jogando (menu, pausa, loja,
      configuracao de partida, fim de partida). Anuncio sobre o jogo rodando
      atrapalha e ainda gera clique sem querer, que e o que derruba conta.
   3. So aparece em tela larga. No celular nao ha espaco, entao nem entra.
   4. Fica nas bordas, longe do painel central: nao cobre botao nenhum.

   Para ligar de verdade, preencha os tres valores abaixo com o que o AdSense
   der depois de aprovar o site. Enquanto estiverem vazios, nada e carregado
   em producao (e nenhum script externo e buscado).                          */

(function () {
  "use strict";

  /* ----------------------------------------------------- o que voce preenche */
  var CLIENTE  = "ca-pub-8110755806771816";
  var SLOT_ESQ = "2688993034";   // bloco "sugar-strike-esquerda", display 300x600
  var SLOT_DIR = "7493959127";   // bloco "sugar-strike-direita", display 300x600
  /* -------------------------------------------------------------------------- */

  var LARGURA_MINIMA = 1240;   // abaixo disso a lateral nao cabe
  var ALTURA_MINIMA = 620;

  // Regra 1: o app expoe esta ponte nativa. Se ela existe, estamos no aplicativo.
  // Ali nao ha anuncio nem cookie, e os links do rodape apontam para o site,
  // que o WebView nem carrega. Entao some com eles e desiste.
  if (typeof SugarAndroid !== "undefined") {
    var soWeb = document.getElementById("rodapeWeb");
    if (soWeb) soWeb.remove();
    return;
  }

  // Sem identificador preenchido so mostramos o contorno, e olhe la: apenas
  // durante o desenvolvimento, para dar para conferir o layout.
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var demonstrar = !CLIENTE && (local || /[?&]anuncios=teste/.test(location.search));
  if (!CLIENTE && !demonstrar) return;

  var esquerda = document.getElementById("adEsq");
  var direita = document.getElementById("adDir");
  if (!esquerda || !direita) return;

  var carregado = false;

  function cabeNaTela() {
    return window.innerWidth >= LARGURA_MINIMA && window.innerHeight >= ALTURA_MINIMA;
  }

  // O jogador esta parado numa tela de menu?
  function emMenu() {
    var overlay = document.getElementById("overlay");
    var modal = document.getElementById("sugarModal");
    var rede = document.getElementById("netOverlay");
    var noMenu = !!overlay && getComputedStyle(overlay).display !== "none";
    var naLoja = !!modal && modal.classList.contains("open");
    var naSala = !!rede && !rede.classList.contains("net-hide");
    return noMenu || naLoja || naSala;
  }

  function preencher(caixa, slot) {
    if (demonstrar) {
      caixa.innerHTML = '<div class="adDemo">ESPACO<br>PARA<br>ANUNCIO<br><small>300 x 600</small></div>';
      return;
    }
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "inline-block";
    ins.style.width = "300px";
    ins.style.height = "600px";
    ins.setAttribute("data-ad-client", CLIENTE);
    ins.setAttribute("data-ad-slot", slot);
    caixa.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (erro) {
      // Sem rede ou com bloqueador: o espaco simplesmente fica vazio.
    }
  }

  // O script do AdSense so e buscado quando o anuncio vai mesmo aparecer.
  function carregarUmaVez() {
    if (carregado) return;
    carregado = true;
    if (!demonstrar) {
      var script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(CLIENTE);
      document.head.appendChild(script);
    }
    preencher(esquerda, SLOT_ESQ);
    preencher(direita, SLOT_DIR);
  }

  /* ------------------------------------------------------------ cookies
     Aviso da LGPD, informativo: quem pede consentimento de verdade na Europa
     e o CMP certificado do proprio Google, ligado no painel do AdSense. Dois
     avisos brigando so confundem, entao este aqui nao bloqueia nada.        */
  function avisoCookies() {
    try {
      if (localStorage.getItem("sugarstrike.avisoCookies")) return;
    } catch (erro) {
      return;
    }
    var caixa = document.createElement("div");
    caixa.id = "avisoCookies";
    caixa.innerHTML =
      '<span>Este site usa cookies do Google para exibir an&uacute;ncios nas telas de menu. ' +
      'Veja a <a href="/privacidade.html">Pol&iacute;tica de Privacidade</a>.</span>' +
      '<button type="button">ENTENDI</button>';
    caixa.querySelector("button").addEventListener("click", function () {
      try { localStorage.setItem("sugarstrike.avisoCookies", "1"); } catch (erro) {}
      caixa.remove();
    });
    document.body.appendChild(caixa);
  }

  var visivel = false;
  function revisar() {
    var mostrar = cabeNaTela() && emMenu();
    if (mostrar === visivel) return;
    visivel = mostrar;
    document.body.classList.toggle("com-anuncio", mostrar);
    if (mostrar) {
      carregarUmaVez();
      avisoCookies();
    }
  }

  // Uma olhada a cada 400 ms custa nada e nao encosta no laco do jogo.
  setInterval(revisar, 400);
  window.addEventListener("resize", revisar);
  revisar();
})();
