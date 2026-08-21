"use strict";
/*
 * Gera uma pista em LOOP para uma fase. Porte de TrackGenerator.kt.
 *
 * A pista e um circuito: o jogador cruza a faixa de chegada, volta para o
 * inicio da mesma lista de segmentos e continua a proxima volta. Por isso o
 * gerador sempre tenta terminar a volta com a altura voltando para zero.
 */
class TrackGenerator {
  constructor(stage, segmentLength) {
    this.stage = stage;
    this.segmentLength = segmentLength;
    this.segments = [];

    // Quantidade de curva por nivel (multiplicada pela curviness da fase).
    this.curveEasy = 2;
    this.curveMed = 4.8;
    this.curveHard = 7.4;

    // Altura por nivel (multiplicada pela hilliness da fase).
    this.hillLow = 42;
    this.hillMed = 92;
    this.hillHigh = 190;
    this.hillExtreme = 300;

    this.enter = 24;
    this.hold = 34;
    this.leave = 24;
  }

  lastY() {
    return this.segments.length === 0 ? 0 : this.segments[this.segments.length - 1].p2.world.y;
  }

  /** Adiciona um unico segmento com a curva e altura informadas. */
  addSegment(curve, y) {
    const n = this.segments.length;
    const seg = new RoadSegment(n);
    seg.p1.world.z = n * this.segmentLength;
    seg.p1.world.y = this.lastY();
    seg.p2.world.z = (n + 1) * this.segmentLength;
    seg.p2.world.y = y;
    seg.curve = curve;
    this.segments.push(seg);
  }

  /** Adiciona um trecho com transicao de entrada, sustentacao e saida. */
  addRoad(enterN, holdN, leaveN, curve, y) {
    const startY = this.lastY();
    const endY = startY + y * this.segmentLength / 100 * 10;
    this.addRoadToY(enterN, holdN, leaveN, curve, endY);
  }

  /** Igual ao addRoad, mas mirando uma altura final absoluta. */
  addRoadToY(enterN, holdN, leaveN, curve, targetY) {
    const startY = this.lastY();
    const total = Math.max(1, enterN + holdN + leaveN);
    for (let n = 0; n < enterN; n++) {
      this.addSegment(
        MathUtils.easeIn(0, curve, n / Math.max(1, enterN)),
        MathUtils.easeInOut(startY, targetY, n / total)
      );
    }
    for (let n = 0; n < holdN; n++) {
      this.addSegment(curve, MathUtils.easeInOut(startY, targetY, (enterN + n) / total));
    }
    for (let n = 0; n < leaveN; n++) {
      this.addSegment(
        MathUtils.easeInOut(curve, 0, n / Math.max(1, leaveN)),
        MathUtils.easeInOut(startY, targetY, (enterN + holdN + n) / total)
      );
    }
  }

  addStraight(num) { this.addRoad(num, num, num, 0, 0); }

  addCurve(num, curve, height) {
    this.addRoad(num, num, num, curve * this.stage.curviness, height * this.stage.hilliness);
  }

  addHill(num, height) {
    this.addRoad(num, num, num, 0, height * this.stage.hilliness);
  }

  addSCurves(strength) {
    const s = (strength === undefined) ? 1 : strength;
    this.addRoad(this.enter, this.hold, this.leave, -this.curveEasy * this.stage.curviness * s, 0);
    this.addRoad(this.enter, this.hold, this.leave, this.curveMed * this.stage.curviness * s, this.hillMed * this.stage.hilliness);
    this.addRoad(this.enter, this.hold, this.leave, this.curveEasy * this.stage.curviness * s, -this.hillLow * this.stage.hilliness);
    this.addRoad(this.enter, this.hold, this.leave, -this.curveEasy * this.stage.curviness * s, this.hillMed * this.stage.hilliness);
    this.addRoad(this.enter, this.hold, this.leave, -this.curveMed * this.stage.curviness * s, -this.hillMed * this.stage.hilliness);
  }

  addHairpin(left) {
    const sign = left ? -1 : 1;
    this.addRoad(32, 58, 32, sign * this.curveHard * this.stage.curviness, this.hillLow * this.stage.hilliness);
    this.addRoad(22, 36, 22, sign * this.curveMed * this.stage.curviness, -this.hillLow * this.stage.hilliness);
  }

  addLowRollingHills(num, height) {
    this.addRoad(num, num, num, 0, height * this.stage.hilliness / 2);
    this.addRoad(num, num, num, 0, -height * this.stage.hilliness);
    this.addRoad(num, num, num, 0, height * this.stage.hilliness);
    this.addRoad(num, num, num, 0, -height * this.stage.hilliness / 2);
  }

  addLongStraight(num) {
    const n = (num === undefined) ? 54 : num;
    this.addRoad(
      Math.max(16, Math.trunc(n * 0.28)),
      Math.max(28, n),
      Math.max(16, Math.trunc(n * 0.28)),
      0, 0
    );
  }

  addMegaHill(up, num) {
    const n = (num === undefined) ? 36 : num;
    const h = up ? this.hillExtreme : -this.hillExtreme;
    this.addRoad(
      Math.max(18, Math.trunc(n * 0.45)),
      Math.max(34, Math.trunc(n * 1.15)),
      Math.max(18, Math.trunc(n * 0.45)),
      0, h * this.stage.hilliness
    );
  }

  addLongSlope(run, height, curve) {
    const c = (curve === undefined) ? 0 : curve;
    this.addRoad(
      Math.max(16, Math.trunc(run * 0.34)),
      Math.max(24, run),
      Math.max(16, Math.trunc(run * 0.34)),
      c * this.stage.curviness, height * this.stage.hilliness
    );
  }

  addBigCrest() {
    this.addLongSlope(34, this.hillExtreme * 0.95, this.curveEasy * 0.35);
    this.addLongSlope(28, -this.hillExtreme * 1.05, -this.curveEasy * 0.18);
  }

  addArcadeSweeper(left) {
    const sign = left ? -1 : 1;
    this.addRoad(26, 52, 26, sign * this.curveHard * 0.88 * this.stage.curviness, this.hillMed * 0.75 * this.stage.hilliness);
    this.addRoad(18, 32, 18, -sign * this.curveMed * 0.62 * this.stage.curviness, -this.hillLow * 0.65 * this.stage.hilliness);
  }

  /**
   * Constroi uma volta inteira do circuito. O restante do jogo repete essa
   * lista para criar as voltas seguintes.
   */
  build() {
    this.segments.length = 0;
    const stage = this.stage;

    // V88: Brasil fase 2 e uma reta unica, sem curvas e sem subidas.
    if (stage.countryIndex === 0 && stage.numberInCountry === 2) {
      while (this.segments.length < stage.lengthSegments) {
        this.addSegment(0, 0);
      }
      this.markStartFinish();
      this.markPitStops();
      this.decorate();
      return this.segments;
    }

    // Reta de largada mais longa para dar sensacao de pista grande.
    this.addLongStraight(64);

    // Abre a pista ja com relevos marcantes.
    this.addMegaHill(true, 32);
    this.addMegaHill(false, 30);
    this.addCurve(22, this.curveEasy, this.hillMed);
    this.addLongStraight(48);

    let safety = 0;
    while (this.segments.length < stage.lengthSegments - 230 && safety < 150) {
      safety++;
      switch ((safety + stage.name.length) % 12) {
        case 0: this.addLongStraight(MathUtils.randomInt(54, 96)); break;
        case 1: this.addCurve(MathUtils.randomInt(22, 36), -this.curveEasy, this.hillMed); break;
        case 2: this.addCurve(MathUtils.randomInt(22, 36), this.curveEasy, -this.hillMed); break;
        case 3: this.addCurve(MathUtils.randomInt(24, 38), this.curveMed, this.hillHigh); break;
        case 4: this.addCurve(MathUtils.randomInt(24, 38), -this.curveMed, this.hillHigh); break;
        case 5: this.addSCurves(stage.curviness > 1.4 ? 1.24 : 1.08); break;
        case 6: this.addBigCrest(); this.addLongStraight(34); break;
        case 7: this.addHairpin(safety % 2 === 0); break;
        case 8: this.addMegaHill(safety % 2 === 0, MathUtils.randomInt(34, 46)); break;
        case 9: this.addArcadeSweeper(safety % 2 === 0); break;
        case 10: this.addArcadeSweeper(safety % 2 !== 0); this.addLongStraight(24); break;
        default: this.addLowRollingHills(30, this.hillHigh); this.addLongStraight(26); break;
      }
    }

    // Fecha o circuito: volta para altura zero antes da linha de chegada.
    const closeCurve = Math.abs(this.lastY()) > 700 ? this.curveEasy * stage.curviness : 0;
    this.addRoadToY(30, 52, 30, closeCurve, 0);
    this.addLongStraight(42);

    this.markStartFinish();
    this.markPitStops();
    this.markTunnels();
    this.decorate();
    return this.segments;
  }

  markStartFinish() {
    const total = this.segments.length;
    for (let i = 4; i < Math.min(12, total); i++) {
      this.segments[i].colorType = SegmentColor.START;
    }
    const start = Math.max(0, total - 18);
    const end = Math.max(start, total - 10);
    for (let i = start; i < end; i++) {
      this.segments[i].colorType = SegmentColor.FINISH;
    }
  }

  markPitStops() {
    const total = this.segments.length;
    const ranges = [
      { first: Math.trunc(total * 0.22), last: Math.trunc(total * 0.22) + 46 },
      { first: Math.trunc(total * 0.64), last: Math.trunc(total * 0.64) + 50 }
    ];
    for (const range of ranges) {
      for (let i = range.first; i <= range.last; i++) {
        if (i >= 0 && i < total) this.segments[i].isPitStop = true;
      }
      // Portal do box: apenas visual.
      const portalIndex = limitar(range.first - 6, 0, total - 1);
      this.segments[portalIndex].sprites.push(new Sprite(SpriteType.PORTAL, 0, 1.08));

      // Deixa o trecho do portal mais reto para dar sensacao de passagem.
      for (let k = portalIndex - 5; k <= portalIndex + 8; k++) {
        if (k >= 0 && k < total) this.segments[k].curve *= 0.18;
      }
    }
  }

  markTunnels() {
    // V76: tuneis removidos a pedido do usuario. A funcao ficou para nao mexer
    // no fluxo do gerador, mas nao marca mais nenhum segmento.
  }

  /** Distribui cenario lateral, moedas e checkpoints pelos segmentos. */
  decorate() {
    const total = this.segments.length;

    const primaryOptions = this.primarySceneryTypes();
    const secondaryOptions = this.secondarySceneryTypes();
    const signOptions = this.signTypes();
    const lushStage = this.supportsGrassDecor();
    const railStage = this.supportsGuardrails();
    const corridorTrees = this.treeCorridorTypes(primaryOptions);

    // Corredores de arvores ocasionais para aumentar a sensacao de velocidade.
    if (corridorTrees.length > 0) {
      this.addTreeCorridors(total, corridorTrees, secondaryOptions, lushStage);
    }

    let i = 26;
    while (i < total - 26) {
      const seg = this.segments[i];
      if (!seg.isPitStop && !seg.isTunnel) {
        // Evita poluir o trecho quando ja existe corredor de arvores.
        if (this.hasTreeCorridorAt(i)) {
          if (lushStage && MathUtils.randomInt(0, 100) < 26) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const off = side * MathUtils.randomFloat(1.42, 1.82);
            seg.sprites.push(new Sprite(SpriteType.GRASS_CLUMP, off, MathUtils.randomFloat(0.78, 1.02)));
          }
          i += MathUtils.randomInt(5, 8);
          continue;
        }

        const roll = MathUtils.randomInt(0, 100);
        const side = Math.random() < 0.5 ? -1 : 1;

        if (roll < 28) {
          const off = side * MathUtils.randomFloat(1.56, 2.22);
          seg.sprites.push(new Sprite(this.pick(primaryOptions), off, MathUtils.randomFloat(0.82, 1.14)));
        } else if (roll < 50) {
          const off = side * MathUtils.randomFloat(1.40, 2.02);
          seg.sprites.push(new Sprite(this.pick(secondaryOptions), off, MathUtils.randomFloat(0.68, 1.00)));
        } else if (roll < 64) {
          const off = side * MathUtils.randomFloat(1.36, 1.86);
          seg.sprites.push(new Sprite(this.pick(signOptions), off, MathUtils.randomFloat(0.76, 0.96)));
        } else if (roll < 74 && railStage) {
          const off = side * MathUtils.randomFloat(1.04, 1.20);
          seg.sprites.push(new Sprite(SpriteType.GUARDRAIL_SIDE, off, MathUtils.randomFloat(0.92, 1.06)));
        } else if (roll < 84 && lushStage) {
          const off = side * MathUtils.randomFloat(1.34, 1.92);
          seg.sprites.push(new Sprite(SpriteType.GRASS_CLUMP, off, MathUtils.randomFloat(0.78, 1.00)));
        }
      }
      i += MathUtils.randomInt(8, 15);
    }

    // Garante placas corretas em todas as curvas principais.
    this.addCurveWarningSigns(total, railStage);

    // Natureza mais viva: arvores, arbustos e cactos perto e longe da pista.
    this.addNatureScatter(total, primaryOptions, secondaryOptions, lushStage);

    // --- Moedas ---
    const coinGroups = [
      Math.trunc(total * 0.18),
      Math.trunc(total * 0.38),
      Math.trunc(total * 0.60),
      Math.trunc(total * 0.82)
    ];
    for (let groupIndex = 0; groupIndex < coinGroups.length; groupIndex++) {
      let start = limitar(coinGroups[groupIndex], 45, total - 55);
      let guard = 0;
      while (guard < 18 && start < total - 40 && this.segments[start].isPitStop) {
        start += 3;
        guard++;
      }
      const curve = limitar(this.segments[start].curve, -1.4, 1.4);
      let lane;
      if (Math.abs(curve) > 0.18) lane = limitar(-curve * 0.36, -0.62, 0.62);
      else if (groupIndex % 3 === 0) lane = -0.42;
      else if (groupIndex % 3 === 1) lane = 0.00;
      else lane = 0.42;
      const groupLen = MathUtils.randomInt(9, 14);
      for (let j = 0; j < groupLen; j++) {
        const idx = start + j * 2;
        if (idx < total - 35 && !this.segments[idx].isPitStop) {
          this.segments[idx].coins.push(new Coin(lane));
        }
      }
    }

    // --- Checkpoints ---
    const cpCount = 3;
    for (let c = 1; c <= cpCount; c++) {
      const idx = limitar(Math.trunc(total * c / (cpCount + 1)), 0, total - 1);
      this.segments[idx].isCheckpoint = true;
    }
  }

  isSnowStage() {
    const n = this.stage.name;
    return n.includes("Curitiba") || n.includes("San Francisco Bay") ||
      n.includes("Osaka Castle") || n.includes("Sapporo") ||
      n.includes("Dolomiti") || n.includes("Gramado") ||
      n.includes("Alpino") || n.includes("Rocky") ||
      n.includes("Fuji") || n.includes("Ice") || n.includes("Snow");
  }

  isBeachStage() {
    const n = this.stage.name;
    return n.includes("Rio de Janeiro") || n.includes("Salvador") ||
      n.includes("Recife") || n.includes("Fortaleza") ||
      n.includes("Miami") || n.includes("Amalfitana");
  }

  primarySceneryTypes() {
    const stage = this.stage;
    const n = stage.name;
    if (n.includes("Rio de Janeiro")) return [SpriteType.TREE_PALM];
    if (this.isSnowStage()) return [SpriteType.TREE_PINE, SpriteType.TREE_SNOW];
    if (this.isBeachStage()) return [SpriteType.TREE_PALM, SpriteType.TREE_CYPRESS];
    if (n.includes("Cânion") || n.includes("Jalapão") || n.includes("Canyon") ||
        n.includes("Desert") || n.includes("Vegas")) {
      return [SpriteType.CACTUS_DESERT];
    }
    if (n.includes("Toscana")) return [SpriteType.TREE_CYPRESS, SpriteType.TREE_OAK];
    if (n.includes("Kyoto") || n.includes("Quioto") || n.includes("Yokohama") ||
        n.includes("Osaka") || n.includes("Roma")) {
      return [SpriteType.TREE_CYPRESS, SpriteType.TREE_ROUND, SpriteType.TREE_OAK];
    }
    if (stage.isNight || n.includes("Neon") || n.includes("Tokyo") ||
        n.includes("Tóquio") || n.includes("Shibuya") ||
        n.includes("New York") || n.includes("Milano") || n.includes("Hiroshima")) {
      return [SpriteType.SIGN_DIRECTIONAL, SpriteType.TREE_CYPRESS, SpriteType.TREE_OAK];
    }
    if (n.includes("Amazônia") || n.includes("Pantanal") || n.includes("Serra")) {
      return [SpriteType.TREE_ROUND, SpriteType.TREE_OAK, SpriteType.TREE_PALM];
    }
    return [SpriteType.TREE_ROUND, SpriteType.TREE_OAK];
  }

  secondarySceneryTypes() {
    const n = this.stage.name;
    if (n.includes("Cânion") || n.includes("Jalapão") || n.includes("Canyon") ||
        n.includes("Desert") || n.includes("Vegas")) {
      return [SpriteType.CACTUS_DESERT];
    }
    if (this.isSnowStage()) return [SpriteType.BUSH_LIGHT, SpriteType.GRASS_CLUMP, SpriteType.TREE_PINE];
    if (n.includes("Kyoto") || n.includes("Quioto") || n.includes("Roma") || n.includes("Toscana")) {
      return [SpriteType.BUSH_FLOWER, SpriteType.BUSH_LIGHT, SpriteType.BUSH_ROUND];
    }
    if (n.includes("Rio de Janeiro")) return [SpriteType.GRASS_CLUMP, SpriteType.BUSH_LIGHT];
    if (this.isBeachStage()) return [SpriteType.BUSH_ROUND, SpriteType.BUSH_LIGHT, SpriteType.GRASS_CLUMP];
    return [SpriteType.BUSH, SpriteType.BUSH_ROUND, SpriteType.BUSH_LIGHT, SpriteType.GRASS_CLUMP];
  }

  signTypes() {
    const stage = this.stage;
    const n = stage.name;
    if (n.includes("Cânion") || n.includes("Jalapão") || n.includes("Canyon") || n.includes("Desert")) {
      return [SpriteType.SIGN_WARNING, SpriteType.SIGN_CHEVRON_HORIZONTAL, SpriteType.SIGN_SPEED_LIMIT];
    }
    if (this.isSnowStage()) {
      return [SpriteType.SIGN_SPEED_LIMIT, SpriteType.SIGN_CURVE, SpriteType.SIGN_TURN_RIGHT];
    }
    if (stage.isNight || n.includes("Neon") || n.includes("Tokyo") ||
        n.includes("Tóquio") || n.includes("Shibuya") || n.includes("New York")) {
      return [SpriteType.SIGN_SPEED_LIMIT, SpriteType.SIGN_WARNING, SpriteType.SIGN_TURN_RIGHT];
    }
    if (n.includes("Serra") || n.includes("Rocky") || n.includes("Fuji") || n.includes("Dolomiti")) {
      return [SpriteType.SIGN_CURVE, SpriteType.SIGN_TURN_RIGHT, SpriteType.SIGN_SPEED_LIMIT];
    }
    if (stage.numberInCountry % 2 === 0) {
      return [SpriteType.SIGN_CHEVRON, SpriteType.SIGN_TURN_RIGHT, SpriteType.SIGN_SPEED_LIMIT];
    }
    return [SpriteType.SIGN_CHEVRON_HORIZONTAL, SpriteType.SIGN_CURVE, SpriteType.SIGN_WARNING];
  }

  supportsGrassDecor() {
    const n = this.stage.name;
    return !(n.includes("Cânion") || n.includes("Jalapão") || n.includes("Canyon") ||
             n.includes("Desert") || n.includes("Vegas"));
  }

  supportsGuardrails() {
    const n = this.stage.name;
    return !(n.includes("Amazônia") || n.includes("Pantanal"));
  }

  treeCorridorTypes(primaryOptions) {
    const arvores = [
      SpriteType.TREE_ROUND, SpriteType.TREE_PINE, SpriteType.TREE_PALM,
      SpriteType.TREE_OAK, SpriteType.TREE_CYPRESS, SpriteType.TREE_SNOW, SpriteType.TREE_BIRCH
    ];
    const preferred = primaryOptions.filter(t => arvores.indexOf(t) >= 0);
    return preferred.length > 0 ? preferred : [];
  }

  hasTreeCorridorAt(index) {
    if (index < 0 || index >= this.segments.length) return false;
    const arvores = [
      SpriteType.TREE_ROUND, SpriteType.TREE_PINE, SpriteType.TREE_PALM,
      SpriteType.TREE_OAK, SpriteType.TREE_CYPRESS, SpriteType.TREE_SNOW, SpriteType.TREE_BIRCH
    ];
    const seg = this.segments[index];
    let count = 0;
    for (const sp of seg.sprites) {
      if (arvores.indexOf(sp.type) >= 0) count++;
    }
    return count >= 2;
  }

  addTreeCorridors(total, corridorTrees, secondaryOptions, lushStage) {
    let cursor = 64;
    const maxStart = total - 110;
    while (cursor < maxStart) {
      cursor += MathUtils.randomInt(120, 185);
      if (cursor >= maxStart) break;

      let start = cursor;
      let scan = 0;
      while (start < total - 60 && scan < 28 && (this.segments[start].isPitStop || this.segments[start].isTunnel)) {
        start += 3;
        scan++;
      }
      if (start >= total - 60 || this.segments[start].isPitStop || this.segments[start].isTunnel) continue;

      const length = MathUtils.randomInt(10, 18);
      const end = Math.min(start + length, total - 30);
      for (let i = start; i < end; i += 2) {
        const seg = this.segments[i];
        if (seg.isPitStop || seg.isTunnel) continue;
        const leftType = this.pick(corridorTrees);
        const rightType = this.pick(corridorTrees);
        const bend = Math.abs(seg.curve);
        const inner = bend > 1.8 ? 1.18 : 1.10;
        const outer = bend > 1.8 ? 1.44 : 1.34;
        const leftOff = -MathUtils.randomFloat(inner, outer);
        const rightOff = MathUtils.randomFloat(inner, outer);
        const sizeBase = bend > 1.2 ? 0.98 : 1.04;
        seg.sprites.push(new Sprite(leftType, leftOff, MathUtils.randomFloat(sizeBase, sizeBase + 0.16)));
        seg.sprites.push(new Sprite(rightType, rightOff, MathUtils.randomFloat(sizeBase, sizeBase + 0.16)));

        if (lushStage && i % 4 === 0) {
          seg.sprites.push(new Sprite(SpriteType.GRASS_CLUMP, -MathUtils.randomFloat(1.18, 1.38), MathUtils.randomFloat(0.82, 1.00)));
          seg.sprites.push(new Sprite(SpriteType.GRASS_CLUMP, MathUtils.randomFloat(1.18, 1.38), MathUtils.randomFloat(0.82, 1.00)));
        } else if (i % 4 === 0 && secondaryOptions.length > 0) {
          const bush = this.pick(secondaryOptions);
          seg.sprites.push(new Sprite(bush, -MathUtils.randomFloat(1.30, 1.52), MathUtils.randomFloat(0.72, 0.92)));
          seg.sprites.push(new Sprite(bush, MathUtils.randomFloat(1.30, 1.52), MathUtils.randomFloat(0.72, 0.92)));
        }
      }
    }
  }

  addNatureScatter(total, primaryOptions, secondaryOptions, lushStage) {
    if (total <= 0) return;
    let i = 34;
    while (i < total - 30) {
      const seg = this.segments[i];
      if (!seg.isPitStop && !seg.isTunnel) {
        const natureMain = primaryOptions.length > 0 ? this.pick(primaryOptions) : SpriteType.TREE_ROUND;
        const natureSecondary = secondaryOptions.length > 0 ? this.pick(secondaryOptions) : SpriteType.BUSH_ROUND;
        const desertStage = primaryOptions.every(t => t === SpriteType.CACTUS_DESERT);

        if (MathUtils.randomInt(0, 100) < 78) {
          const nearSide = MathUtils.randomInt(0, 1) === 0 ? -1 : 1;
          const farSide = -nearSide;
          const nearType = desertStage ? SpriteType.CACTUS_DESERT : natureMain;
          const farType = MathUtils.randomInt(0, 100) < 54 ? natureMain : natureSecondary;

          seg.sprites.push(new Sprite(nearType, nearSide * MathUtils.randomFloat(1.28, 1.86), MathUtils.randomFloat(0.90, 1.16)));
          seg.sprites.push(new Sprite(farType, farSide * MathUtils.randomFloat(2.35, 3.75), MathUtils.randomFloat(0.78, 1.10)));

          if (lushStage && MathUtils.randomInt(0, 100) < 62) {
            seg.sprites.push(new Sprite(SpriteType.GRASS_CLUMP, nearSide * MathUtils.randomFloat(1.16, 1.36), MathUtils.randomFloat(0.80, 1.02)));
          }
          if (!desertStage && MathUtils.randomInt(0, 100) < 42) {
            seg.sprites.push(new Sprite(natureSecondary, nearSide * MathUtils.randomFloat(2.05, 2.85), MathUtils.randomFloat(0.72, 1.00)));
          }
        }
      }
      i += MathUtils.randomInt(6, 11);
    }
  }

  addCurveWarningSigns(total, railStage) {
    if (total <= 0) return;
    let i = 12;
    while (i < total - 18) {
      const curve = this.segments[i].curve;
      const absCurve = Math.abs(curve);
      const prevCurve = i > 0 ? Math.abs(this.segments[i - 1].curve) : 0;
      if (absCurve > 1.65 && prevCurve <= 1.65 && !this.segments[i].isPitStop && !this.segments[i].isTunnel) {
        const side = curve > 0 ? 1 : -1;
        const leadType = side > 0 ? SpriteType.SIGN_TURN_RIGHT : SpriteType.SIGN_CURVE;
        const chevronType = side > 0 ? SpriteType.SIGN_CHEVRON_HORIZONTAL : SpriteType.SIGN_CHEVRON;
        const startWarn = Math.max(4, i - 8);
        if (!this.segments[startWarn].isPitStop && !this.segments[startWarn].isTunnel) {
          this.segments[startWarn].sprites.push(new Sprite(leadType, side * 1.74, 0.90));
          this.segments[startWarn].sprites.push(new Sprite(SpriteType.SIGN_SPEED_LIMIT, -side * 1.66, 0.84));
        }
        let j = i;
        let chevronCount = 0;
        while (j < total - 8 && Math.abs(this.segments[j].curve) > 1.15 && chevronCount < 5) {
          if (!this.segments[j].isPitStop && !this.segments[j].isTunnel) {
            this.segments[j].sprites.push(new Sprite(chevronType, side * 1.70, 0.84));
            if (railStage && chevronCount % 2 === 0) {
              this.segments[j].sprites.push(new Sprite(SpriteType.GUARDRAIL_SIDE, side * 1.16, 0.94));
            }
          }
          j += 5;
          chevronCount++;
        }
        i = j;
        continue;
      }
      i++;
    }
  }

  pick(options) {
    return options[MathUtils.randomInt(0, options.length - 1)];
  }

  sceneryFar() {
    const stage = this.stage;
    const n = stage.name;
    if (stage.isNight || n.includes("São Paulo") || n.includes("Brasília") ||
        n.includes("New York") || n.includes("Tokyo") || n.includes("Milano")) {
      return SpriteType.BUILDING;
    }
    return SpriteType.MOUNTAIN;
  }
}

window.TrackGenerator = TrackGenerator;
