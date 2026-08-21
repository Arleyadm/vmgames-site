"use strict";
/*
 * Estruturas de dados que descrevem a pista. Porte de RoadSegment.kt.
 *
 * A pista e uma lista de RoadSegment. Cada segmento tem dois pontos no espaco
 * do mundo (p1 = mais perto da camera, p2 = mais longe). Durante a
 * renderizacao esses pontos sao copiados para o espaco da camera e projetados
 * para a tela, formando o trapezio (a "fatia" de asfalto desenhada).
 */

/** Um ponto 3D simples. */
class P3D {
  constructor(x, y, z) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
  }
}

/** Coordenadas ja projetadas na tela. */
class ScreenPoint {
  constructor() {
    this.x = 0;      // posicao horizontal central na tela
    this.y = 0;      // posicao vertical na tela
    this.w = 0;      // metade da largura da pista projetada
    this.scale = 0;  // fator de escala da perspectiva
  }
}

/** Um ponto da pista, com sua representacao no mundo, na camera e na tela. */
class RoadPoint {
  constructor() {
    this.world = new P3D();
    this.camera = new P3D();
    this.screen = new ScreenPoint();
  }
}

/** Tipos de cenario lateral (billboards e formas geometricas). */
const SpriteType = {
  TREE: "TREE", MOUNTAIN: "MOUNTAIN", SIGN: "SIGN", CACTUS: "CACTUS", PALM: "PALM",
  BUILDING: "BUILDING", NEON_SIGN: "NEON_SIGN", TUNNEL: "TUNNEL", PIT_SIGN: "PIT_SIGN",
  PORTAL: "PORTAL", BUSH: "BUSH", TREE_ROUND: "TREE_ROUND", TREE_PINE: "TREE_PINE",
  TREE_PALM: "TREE_PALM", CACTUS_DESERT: "CACTUS_DESERT", SIGN_CANYON: "SIGN_CANYON",
  SIGN_CHEVRON: "SIGN_CHEVRON", SIGN_CHEVRON_HORIZONTAL: "SIGN_CHEVRON_HORIZONTAL",
  SIGN_CURVE: "SIGN_CURVE", SIGN_DIRECTIONAL: "SIGN_DIRECTIONAL",
  TREE_OAK: "TREE_OAK", TREE_CYPRESS: "TREE_CYPRESS", TREE_SNOW: "TREE_SNOW",
  TREE_BIRCH: "TREE_BIRCH", BUSH_ROUND: "BUSH_ROUND", BUSH_LIGHT: "BUSH_LIGHT",
  BUSH_FLOWER: "BUSH_FLOWER", GRASS_CLUMP: "GRASS_CLUMP", GUARDRAIL_SIDE: "GUARDRAIL_SIDE",
  SIGN_TURN_RIGHT: "SIGN_TURN_RIGHT", SIGN_WARNING: "SIGN_WARNING", SIGN_BUMP: "SIGN_BUMP",
  SIGN_SPEED_LIMIT: "SIGN_SPEED_LIMIT", SIGN_SLIPPERY: "SIGN_SLIPPERY",
  PUDDLE_WATER: "PUDDLE_WATER", PUDDLE_OIL: "PUDDLE_OIL"
};

/**
 * Um objeto de cenario ao lado (ou sobre) a pista.
 * offset: posicao horizontal relativa a pista (-1 a 1 = sobre o asfalto).
 */
class Sprite {
  constructor(type, offset, sizeFactor) {
    this.type = type;
    this.offset = offset;
    this.sizeFactor = (sizeFactor === undefined) ? 1 : sizeFactor;
  }
}

/** Categoria de cor do segmento (alterna claro/escuro para dar sensacao de movimento). */
const SegmentColor = { LIGHT: "LIGHT", DARK: "DARK", START: "START", FINISH: "FINISH" };

/** Uma fatia da pista. */
class RoadSegment {
  constructor(index) {
    this.index = index;
    this.p1 = new RoadPoint();  // ponto de inicio (perto)
    this.p2 = new RoadPoint();  // ponto de fim (longe)
    this.curve = 0;             // intensidade da curva (negativo = esquerda)
    this.colorType = (index % 2 === 0) ? SegmentColor.LIGHT : SegmentColor.DARK;

    // Recorte vertical usado para que morros escondam o que esta atras deles.
    this.clip = 0;
    this.fog = 1;               // densidade de nevoa neste segmento (0..1)

    // Segmentos especiais do circuito.
    this.isPitStop = false;     // faixa do pitstop: entrar pela direita reabastece
    this.isTunnel = false;

    // Objetos presentes neste segmento.
    this.cars = [];             // carros adversarios atualmente aqui
    this.sprites = [];          // cenario lateral
    this.coins = [];            // moedas a coletar
    this.isCheckpoint = false;  // se cruzar este segmento, ganha tempo
    this.checkpointConsumed = false;
  }
}

window.P3D = P3D;
window.ScreenPoint = ScreenPoint;
window.RoadPoint = RoadPoint;
window.SpriteType = SpriteType;
window.Sprite = Sprite;
window.SegmentColor = SegmentColor;
window.RoadSegment = RoadSegment;
