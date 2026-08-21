"use strict";
/** Moeda coletavel sobre a pista. offset: posicao horizontal (-1 a 1). Porte de Coin.kt. */
class Coin {
  constructor(offset) {
    this.offset = offset;
    this.collected = false;
    // Fase de animacao (faz a moeda girar/balancar visualmente).
    this.phase = MathUtils.randomFloat(0, 6.28);
  }
}
window.Coin = Coin;
