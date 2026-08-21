"use strict";
/*
 * Cores no mesmo formato do Android: um inteiro 0xAARRGGBB.
 *
 * O jogo foi escrito para o Canvas do Android, onde a cor e um numero e o
 * alfa vive dentro dele. Manter esse formato deixa o porte 1:1 com o Kotlin;
 * so na hora de pintar o Canvas do navegador a cor vira texto "rgba(...)".
 */
const Cor = {
  TRANSPARENT: 0x00000000,
  BLACK: 0xFF000000,
  WHITE: 0xFFFFFFFF,
  RED: 0xFFFF0000,
  GREEN: 0xFF00FF00,
  BLUE: 0xFF0000FF,
  YELLOW: 0xFFFFFF00,
  CYAN: 0xFF00FFFF,
  MAGENTA: 0xFFFF00FF,
  GRAY: 0xFF888888,
  DKGRAY: 0xFF444444,
  LTGRAY: 0xFFCCCCCC,

  /** Equivale a Color.rgb(r, g, b) do Android (alfa 255). */
  rgb(r, g, b) {
    return ((0xFF << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)) >>> 0;
  },

  /** Equivale a Color.argb(a, r, g, b) do Android. */
  argb(a, r, g, b) {
    return (((a & 0xFF) << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)) >>> 0;
  },

  alpha(c) { return (c >>> 24) & 0xFF; },
  red(c)   { return (c >>> 16) & 0xFF; },
  green(c) { return (c >>> 8) & 0xFF; },
  blue(c)  { return c & 0xFF; },

  /** Troca o alfa de uma cor mantendo o RGB (0..255). */
  withAlpha(c, a) {
    const clamped = Math.max(0, Math.min(255, Math.round(a)));
    return ((clamped << 24) | (c & 0x00FFFFFF)) >>> 0;
  },

  /**
   * Converte para o texto que o Canvas do navegador entende.
   * alphaOverride (0..255) substitui o alfa embutido, como paint.alpha faz.
   */
  css(c, alphaOverride) {
    const a = alphaOverride === undefined || alphaOverride === null
      ? (c >>> 24) & 0xFF
      : Math.max(0, Math.min(255, Math.round(alphaOverride)));
    const r = (c >>> 16) & 0xFF;
    const g = (c >>> 8) & 0xFF;
    const b = c & 0xFF;
    return "rgba(" + r + "," + g + "," + b + "," + (a / 255).toFixed(4) + ")";
  },

  /** Escurece mantendo o alfa. factor 0.8 = 20% mais escuro. */
  darken(c, factor) {
    const f = Math.max(0, factor);
    return Cor.argb(
      (c >>> 24) & 0xFF,
      Math.min(255, Math.round(((c >>> 16) & 0xFF) * f)),
      Math.min(255, Math.round(((c >>> 8) & 0xFF) * f)),
      Math.min(255, Math.round((c & 0xFF) * f))
    );
  },

  /** Clareia em direcao ao branco. factor 0.3 = 30% do caminho ate 255. */
  brighten(c, factor) {
    const f = Math.max(0, Math.min(1, factor));
    const up = (v) => Math.min(255, Math.round(v + (255 - v) * f));
    return Cor.argb((c >>> 24) & 0xFF, up((c >>> 16) & 0xFF), up((c >>> 8) & 0xFF), up(c & 0xFF));
  },

  /** Mistura duas cores. t = 0 devolve a, t = 1 devolve b. */
  lerp(a, b, t) {
    const k = Math.max(0, Math.min(1, t));
    const mix = (x, y) => Math.round(x + (y - x) * k);
    return Cor.argb(
      mix((a >>> 24) & 0xFF, (b >>> 24) & 0xFF),
      mix((a >>> 16) & 0xFF, (b >>> 16) & 0xFF),
      mix((a >>> 8) & 0xFF, (b >>> 8) & 0xFF),
      mix(a & 0xFF, b & 0xFF)
    );
  }
};

window.Cor = Cor;
