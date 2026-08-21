"use strict";
/**
 * Carro adversario / de trafego. Porte de EnemyCar.kt.
 *
 * z: posicao ao longo da pista (mesma unidade de PlayerCar.position)
 * offset: posicao lateral (-1 a 1)
 * speed: velocidade propria (unidades de mundo por segundo)
 * color: cor de reserva quando o sprite de imagem nao esta disponivel
 * spriteIndex: qual imagem de carro usar (car_0..car_9)
 */
class EnemyCar {
  constructor(z, offset, speed, color, spriteIndex, completedLaps, driverName) {
    this.z = z;
    this.offset = offset;
    this.speed = speed;
    this.color = color;
    this.spriteIndex = (spriteIndex === undefined || spriteIndex === null) ? EnemyCar.randomSprite() : spriteIndex;
    this.completedLaps = completedLaps || 0;
    this.driverName = driverName || EnemyCar.randomDriverName();
    this.aggression = MathUtils.randomFloat(0.82, 1.30);
    this.preferredLane = offset;
    this.laneDecisionTimer = MathUtils.randomFloat(0.8, 2.2);
    this.isRemote = false;
    this.aiTurboTimer = 0;
    this.aiTurboCooldown = MathUtils.randomFloat(7.0, 14.0);
    // V85: usado na largada para espalhar os carros do grid. Durante alguns
    // segundos cada rival mantem uma velocidade bem diferente; depois volta
    // suavemente para a velocidade normal da IA.
    this.launchSpreadTimer = 0;
    this.launchSpreadSpeed = speed;
    this.cruiseSpeed = speed;

    // Largura do carro em unidades de pista (colisao e IA).
    this.width = 0.55;

    // Usado para detectar quando o jogador ultrapassa este carro.
    this.wasAheadOfPlayer = true;

    // Balao de provocacao em corrida multiplayer.
    this.tauntText = "";
    this.tauntTimer = 0;
  }

  get aiTurboActive() { return this.aiTurboTimer > 0; }

  static randomColor() {
    return EnemyCar.palette[MathUtils.randomInt(0, EnemyCar.palette.length - 1)];
  }

  static randomSprite() { return MathUtils.randomInt(0, EnemyCar.SPRITE_COUNT - 1); }

  static randomDriverName() {
    return EnemyCar.driverNames[MathUtils.randomInt(0, EnemyCar.driverNames.length - 1)];
  }
}

// Paleta de cores genericas para o trafego.
EnemyCar.palette = [
  Cor.rgb(0xD7, 0x3A, 0x3A),
  Cor.rgb(0x3A, 0x7B, 0xD7),
  Cor.rgb(0xF2, 0xB1, 0x2B),
  Cor.rgb(0x2E, 0xB8, 0x72),
  Cor.rgb(0xE0, 0xE0, 0xE0),
  Cor.rgb(0x9B, 0x59, 0xB6),
  Cor.rgb(0x34, 0x3A, 0x40)
];

// Quantidade de sprites de carro disponiveis (car_0..car_9).
EnemyCar.SPRITE_COUNT = 10;

EnemyCar.driverNames = [
  "Rafa", "Bia", "Nico", "Luna", "Theo", "Maya", "Enzo", "Duda",
  "Max", "Lipe", "Gael", "Iza", "Leo", "Jade", "Kauã", "Tina",
  "Bolt", "Nina", "Rex", "Mika", "Zeca", "Kira", "Vini", "Lara",
  "Akira", "Marco", "Tony", "Kenji", "Luigi", "Sam"
];

window.EnemyCar = EnemyCar;
