"use strict";
/*
 * Funcoes matematicas do motor pseudo-3D.
 *
 * A pista e uma lista de segmentos em distancias Z crescentes; cada ponto do
 * mundo e projetado para a tela com perspectiva. Estas funcoes fazem a
 * interpolacao, a suavizacao e a deteccao de sobreposicao usadas no desenho e
 * na fisica. Porte 1:1 de MathUtils.kt.
 */

/** Gerador deterministico (mulberry32). Duas maquinas com a mesma semente geram a mesma pista. */
function criarGeradorComSemente(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mesmo algoritmo do String.hashCode() do Java, para a semente combinar com a do app. */
function hashCodeDeTexto(texto) {
  let h = 0;
  const s = String(texto == null ? "" : texto);
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

const MathUtils = {
  _seeded: null,

  setRandomSeed(seed) {
    this._seeded = (seed === null || seed === undefined) ? null : criarGeradorComSemente(seed);
  },

  clearRandomSeed() {
    this._seeded = null;
  },

  _nextRandomFloat() {
    return this._seeded ? this._seeded() : Math.random();
  },

  /** Incrementa mantendo o valor dentro de [0, max) (pistas que dao volta). */
  increase(start, increment, max) {
    let result = start + increment;
    while (result >= max) result -= max;
    while (result < 0) result += max;
    return result;
  },

  /** Aceleracao linear: v = v + a * dt */
  accelerate(v, accel, dt) { return v + accel * dt; },

  /** Limita um valor entre min e max. */
  limit(value, minV, maxV) { return Math.max(minV, Math.min(value, maxV)); },

  /** Interpolacao linear entre a e b (percent de 0 a 1). */
  interpolate(a, b, percent) { return a + (b - a) * percent; },

  /** Suavizacao de entrada (comeca devagar). */
  easeIn(a, b, percent) { return a + (b - a) * percent * percent; },

  /** Suavizacao de saida (termina devagar). */
  easeOut(a, b, percent) { return a + (b - a) * (1 - (1 - percent) * (1 - percent)); },

  /** Suavizacao de entrada e saida (curva em S). */
  easeInOut(a, b, percent) { return a + (b - a) * (-Math.cos(percent * Math.PI) / 2 + 0.5); },

  /** Percentual percorrido dentro de um total (ex.: dentro de um segmento). */
  percentRemaining(n, total) { return (n % total) / total; },

  /**
   * Verifica se dois objetos se sobrepoem na largura da pista.
   * x = posicao central, w = largura, percent = tolerancia de sobreposicao.
   */
  overlap(x1, w1, x2, w2, percent) {
    const p = (percent === undefined) ? 1 : percent;
    const half = p / 2;
    const min1 = x1 - (w1 * half);
    const max1 = x1 + (w1 * half);
    const min2 = x2 - (w2 * half);
    const max2 = x2 + (w2 * half);
    return !((max1 < min2) || (min1 > max2));
  },

  /** Valor aleatorio entre min e max. */
  randomFloat(minV, maxV) {
    return minV + (this._nextRandomFloat() * (maxV - minV));
  },

  /** Inteiro aleatorio entre min (inclusive) e max (inclusive). */
  randomInt(minV, maxV) {
    const bruto = Math.trunc(this._nextRandomFloat() * (maxV - minV + 1));
    return minV + Math.max(0, Math.min(maxV - minV, bruto));
  }
};

/** Equivale ao coerceIn do Kotlin. */
function limitar(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

window.MathUtils = MathUtils;
window.limitar = limitar;
window.hashCodeDeTexto = hashCodeDeTexto;
