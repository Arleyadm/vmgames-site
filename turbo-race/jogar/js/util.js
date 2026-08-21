"use strict";
/*
 * Ajudantes pequenos que o Android dava de graca e o navegador nao tem.
 */

/** Mesma pilha de fonte no jogo inteiro. Casa com o visual do app. */
const FONTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Fonte de numeros do painel: largura fixa para o velocimetro nao tremer. */
const FONTE_NUMEROS = 'Consolas, "Courier New", monospace';

/**
 * Substituto do RectF do Android. Guarda left/top/right/bottom, exatamente
 * como o Kotlin, para o codigo do HUD continuar igual.
 */
const Ret = {
  novo(left, top, right, bottom) {
    return { left: left || 0, top: top || 0, right: right || 0, bottom: bottom || 0 };
  },
  definir(r, left, top, right, bottom) {
    r.left = left; r.top = top; r.right = right; r.bottom = bottom;
    return r;
  },
  largura(r) { return r.right - r.left; },
  altura(r) { return r.bottom - r.top; },
  centroX(r) { return (r.left + r.right) / 2; },
  centroY(r) { return (r.top + r.bottom) / 2; },
  contem(r, x, y) { return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; },
  /** Igual ao containsExpanded do GameView: aceita o toque um pouco fora da borda. */
  contemComFolga(r, x, y, px, py) {
    const fy = (py === undefined) ? px : py;
    return x >= r.left - px && x <= r.right + px && y >= r.top - fy && y <= r.bottom + fy;
  },
  vazio(r) { return Ret.largura(r) <= 0 || Ret.altura(r) <= 0; }
};

/** Preenche um retangulo arredondado (o Android tinha drawRoundRect pronto). */
function retanguloArredondado(ctx, r, raio) {
  const l = r.left, t = r.top, d = r.right, b = r.bottom;
  const rr = Math.max(0, Math.min(raio, Math.min(d - l, b - t) / 2));
  ctx.beginPath();
  ctx.moveTo(l + rr, t);
  ctx.lineTo(d - rr, t);
  ctx.quadraticCurveTo(d, t, d, t + rr);
  ctx.lineTo(d, b - rr);
  ctx.quadraticCurveTo(d, b, d - rr, b);
  ctx.lineTo(l + rr, b);
  ctx.quadraticCurveTo(l, b, l, b - rr);
  ctx.lineTo(l, t + rr);
  ctx.quadraticCurveTo(l, t, l + rr, t);
  ctx.closePath();
}

/** Item da lista de classificacao exibida durante a corrida. Porte de PlayerStanding.kt. */
class PlayerStanding {
  constructor(position, name, isLocalPlayer, isRemotePlayer) {
    this.position = position;
    this.name = name;
    this.isLocalPlayer = isLocalPlayer;
    this.isRemotePlayer = isRemotePlayer;
  }
}

/** Formata segundos como M:SS, do jeito que o HUD do app mostrava. */
function tempoEmTexto(segundos) {
  const total = Math.max(0, Math.trunc(segundos));
  const m = Math.trunc(total / 60);
  const s = total % 60;
  return m + ":" + String(s).padStart(2, "0");
}

window.FONTE = FONTE;
window.FONTE_NUMEROS = FONTE_NUMEROS;
window.Ret = Ret;
window.retanguloArredondado = retanguloArredondado;
window.PlayerStanding = PlayerStanding;
window.tempoEmTexto = tempoEmTexto;
