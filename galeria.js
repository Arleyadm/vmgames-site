/*
  Visualizador de capturas.

  Usa o <dialog> nativo do navegador em vez de montar uma janela na mão: o
  navegador já trata o fechar com Esc, o foco preso dentro da janela e o fundo
  escurecido. Menos código e mais acessível.

  A miniatura carrega na página; a imagem grande só é buscada quando o visitante
  clica. Numa página com dez capturas isso é a diferença entre 100 KB e 700 KB
  logo na abertura.
*/
(function () {
  var lupa = document.querySelector('dialog.lupa');
  if (!lupa) return;
  var alvo = lupa.querySelector('img');

  document.querySelectorAll('.galeria button').forEach(function (b) {
    b.addEventListener('click', function () {
      alvo.src = b.dataset.grande;
      alvo.alt = b.querySelector('img').alt;
      lupa.showModal();
    });
  });

  lupa.querySelector('.fechar').addEventListener('click', function () { lupa.close(); });
  // clicar fora da imagem também fecha
  lupa.addEventListener('click', function (e) { if (e.target === lupa) lupa.close(); });
  lupa.addEventListener('close', function () { alvo.removeAttribute('src'); });
})();
