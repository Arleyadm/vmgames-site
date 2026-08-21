"use strict";
/**
 * Estado dos comandos em um frame. E preenchido pela tela de corrida a partir
 * do toque/teclado e lido pela fisica do PlayerCar. Porte de Controls.kt.
 */
class Controls {
  constructor() {
    this.left = false;
    this.right = false;
    this.turbo = false;
    this.accelerate = false;
    this.brake = false;
    this.reverse = false;

    // Sensor de inclinacao (giroscopio do celular, quando disponivel).
    this.tiltActive = false;
    this.tilt = 0;   // -1 (esquerda) a +1 (direita)
  }

  reset() {
    this.left = false;
    this.right = false;
    this.turbo = false;
    this.accelerate = false;
    this.brake = false;
    this.reverse = false;
  }
}
window.Controls = Controls;
