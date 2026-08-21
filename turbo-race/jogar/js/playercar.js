"use strict";
/*
 * Carro do jogador. Porte de PlayerCar.kt.
 *
 * Guarda a posicao na pista e a velocidade, e aplica a fisica arcade
 * (aceleracao, velocidade maxima, freio, turbo, combustivel, derrapagem nas
 * curvas e efeito de subida/descida). Os atributos do carro escolhido na
 * garagem viram multiplicadores aplicados sobre os valores base.
 *
 * Convencoes:
 *  - x (posicao lateral): -1 = borda esquerda da pista, +1 = borda direita.
 *    Pode passar um pouco desses limites (acostamento) ate PLAYER_MAX_X.
 *  - position (z): distancia percorrida ao longo da volta atual.
 *  - speed: unidades de mundo por segundo.
 */
class PlayerCar {
  constructor(car, baseMaxSpeed, baseAccel, speedUpgrade, stabilityUpgrade, turboUpgrade, tankUpgrade, motorUpgrade) {
    this.car = car;
    this.speedUpgrade = speedUpgrade || 0;
    this.stabilityUpgrade = stabilityUpgrade || 0;
    this.turboUpgrade = turboUpgrade || 0;
    this.tankUpgrade = tankUpgrade || 0;
    this.motorUpgrade = motorUpgrade || 0;

    // ---- Multiplicadores derivados dos atributos (1..10) ----
    // speed -> velocidade maxima
    this.speedFactor = 0.84 + (car.speed - 1) / 9 * 0.18 + this.speedUpgrade * 0.026 + this.motorUpgrade * 0.016;
    // accel -> aceleracao
    this.accelFactor = 0.58 + (car.accel - 1) / 9 * 0.52 + this.motorUpgrade * 0.035;
    // control -> direcao e aderencia
    this.steerFactor = 0.68 + (car.control - 1) / 9 * 0.48 + this.stabilityUpgrade * 0.090;
    this.stabilityGrip = 1 + this.stabilityUpgrade * 0.18;
    // turbo -> intensidade do turbo
    this.turboFactor = 1.25 + (car.turbo - 1) / 9 * 0.35 + this.turboUpgrade * 0.040;
    // turbo -> capacidade/recarga da barra
    this.turboDrain = Math.max(0.08, 0.24 - (car.turbo - 1) / 9 * 0.10 - this.turboUpgrade * 0.010);
    this.fuelTankMultiplier = 1 + this.tankUpgrade * 0.10;

    // ---- Velocidades efetivas deste carro ----
    this.maxSpeed = baseMaxSpeed * this.speedFactor;
    this.accel = baseAccel * this.accelFactor;
    this.breaking = -this.maxSpeed;                 // freio forte
    this.offRoadDecel = -this.maxSpeed / 2;         // freio fora da pista
    this.offRoadLimit = this.maxSpeed / 4;          // so freia se acima disso
    this.reverseMax = this.maxSpeed * 0.18;         // re arcade controlada
    this.reverseAccel = this.accel * 0.80;          // forca para engatar a re
    this.centrifugal = Math.max(0.040, 0.135 - this.stabilityUpgrade * 0.018);

    // ---- Estado em tempo real ----
    this.position = 0;
    this.x = 0;
    this.speed = 0;

    this.turboBar = 1;          // 0..1
    this.turboActive = false;   // se o turbo esta realmente ativo neste frame
    this.turboTimer = 0;        // duracao restante do turbo ativado por toque
    this.collisionFlash = 0;    // tempo restante de "piscar" apos colisao
    this.visualSteer = 0;       // usado apenas para escolher o sprite inclinado
    this.steeringState = 0;     // direcao suavizada, ajuda a dar sensacao de peso
    this.driftAmount = 0;       // intensidade visual da derrapagem
    this.currentSlope = 0;      // ajuda o render a "colar" o carro no relevo
    this.ghostMode = false;     // V83: visual fantasma/invencivel
  }

  /**
   * Atualiza posicao lateral e velocidade.
   * segmentCurve: curva do segmento onde o jogador esta.
   * slope: diferenca de altura entre o comeco e o fim do segmento (positivo = subida).
   * fuel: combustivel atual (0..1). Sem combustivel, o carro anda so no embalo.
   */
  update(controls, segmentCurve, slope, fuel, dt, roadGrip) {
    const grip0 = (roadGrip === undefined || roadGrip === null) ? 1 : roadGrip;
    this.currentSlope = slope;
    this.driftAmount = Math.max(0, this.driftAmount - dt * 1.8);
    const speedPercent = this.maxSpeed > 0 ? limitar(this.speed / this.maxSpeed, 0, 1.8) : 0;
    const grip = limitar(grip0, 0.72, 1.08);

    // Quanto o carro anda de lado neste frame (mais rapido = vira mais).
    const dx = dt * 1.04 * speedPercent * this.steerFactor * (0.92 + grip * 0.08);

    // --- Direcao ---
    let rawSteerInput = 0;
    if (controls.tiltActive) rawSteerInput = limitar(controls.tilt, -1, 1);
    else if (controls.left) rawSteerInput = -1;
    else if (controls.right) rawSteerInput = 1;

    // Suavizacao da direcao real: ajuda a dar sensacao de peso e inercia.
    const steeringResponse = controls.tiltActive ? 3.55 : 3.85;
    const steerPhysicsLerp = limitar(dt * steeringResponse, 0, 1);
    this.steeringState += (rawSteerInput - this.steeringState) * steerPhysicsLerp;
    const steerInput = limitar(this.steeringState, -1, 1);
    this.x += dx * steerInput;

    // Suaviza tambem a leitura visual.
    const visualTarget = limitar(steerInput * 0.43, -0.43, 0.43);
    const steerLerp = limitar(dt * 3.3, 0, 1);
    this.visualSteer += (visualTarget - this.visualSteer) * steerLerp;

    // --- Forca centrifuga / aderencia em curva ---
    const dynamicCentrifugal = (this.centrifugal + speedPercent * 0.038 + Math.abs(steerInput) * 0.018) / (this.stabilityGrip * grip);
    this.x -= dx * speedPercent * segmentCurve * (dynamicCentrifugal / this.steerFactor);

    // Derrapagem leve: so em curvas fechadas, principalmente quando o jogador
    // vira errado ou nao vira o suficiente. E sutil de proposito.
    const tightCurve = Math.abs(segmentCurve);
    const driftCurveThreshold = 0.46 + this.stabilityUpgrade * 0.026 - (1 - grip) * 0.13;
    const driftSpeedThreshold = 0.48 + this.stabilityUpgrade * 0.018 - (1 - grip) * 0.09;
    if (tightCurve > driftCurveThreshold && speedPercent > driftSpeedThreshold) {
      const curveIntensity = limitar((tightCurve - driftCurveThreshold) / 0.46, 0, 1);
      const speedDrift = limitar((speedPercent - driftSpeedThreshold) / 0.46, 0, 1);
      const wrongDirection = (steerInput * segmentCurve < -0.04) ? 1 : 0;
      const notTurningEnough = Math.max(0, tightCurve * (0.86 - this.stabilityUpgrade * 0.055) - Math.abs(steerInput));
      const slipLoad = limitar(
        (curveIntensity * speedDrift) * (0.42 + wrongDirection * 0.62 + notTurningEnough * 0.46 + (1 - grip) * 0.55) / (this.stabilityGrip * grip),
        0, 1
      );
      if (slipLoad > 0.075) {
        this.x -= dt * segmentCurve * (0.046 + slipLoad * 0.085) / (this.steerFactor * this.stabilityGrip);
        this.speed = MathUtils.accelerate(this.speed, -this.maxSpeed * (0.012 + slipLoad * 0.036 + (1 - grip) * 0.010), dt);
        this.driftAmount = Math.max(this.driftAmount, limitar(slipLoad * 1.28, 0, 1));
      }
    }

    const hasFuel = fuel > 0.005;

    // --- Subida/descida --- (arcade: subidas seguram, descidas dao embalo)
    const grade = limitar(slope / 42, -1, 1);
    const hillMaxMultiplier = limitar(1 - grade * 0.13, 0.78, 1.10);
    const hillAcceleration = -grade * this.maxSpeed * 0.13;

    // --- Turbo ---
    let effectiveMax = this.maxSpeed * hillMaxMultiplier;
    if (this.turboTimer > 0 && this.turboBar > 0 && hasFuel) {
      this.turboActive = true;
      this.turboTimer -= dt;
      this.turboBar = Math.max(0, this.turboBar - this.turboDrain * dt);
      effectiveMax *= this.turboFactor;
      if (this.turboTimer <= 0 || this.turboBar <= 0) {
        this.turboTimer = 0;
        this.turboActive = false;
      }
    } else {
      this.turboActive = false;
      this.turboTimer = 0;
    }

    // Sem combustivel: corta a forca do motor, mas NAO corta a velocidade de uma vez.
    if (!hasFuel) effectiveMax = this.maxSpeed * 0.70;

    const accelerating = controls.accelerate || this.turboActive;
    const wantsReverse = controls.reverse || (controls.brake && this.speed <= this.maxSpeed * 0.010);

    const self = this;
    function coastTowardZero(value, strength) {
      if (value > 0) return Math.max(0, MathUtils.accelerate(value, -strength, dt));
      if (value < 0) return Math.min(0, MathUtils.accelerate(value, strength * 1.28, dt));
      return 0;
    }

    // --- Aceleracao / freio / re ---
    // FREIO reduz ate 0 km/h e, se continuar pressionado, comeca a dar re.
    if (wantsReverse && hasFuel) {
      this.speed = (this.speed > 0)
        ? MathUtils.accelerate(this.speed, this.breaking * 1.15, dt)
        : MathUtils.accelerate(this.speed, -this.reverseAccel, dt);
    } else if (controls.brake) {
      this.speed = Math.max(0, MathUtils.accelerate(this.speed, this.breaking, dt));
    } else if (!hasFuel) {
      this.speed = coastTowardZero(this.speed, this.maxSpeed * 0.055);
    } else if (this.turboActive) {
      this.speed = MathUtils.accelerate(this.speed, this.accel * 1.48, dt);
    } else if (accelerating) {
      this.speed = MathUtils.accelerate(this.speed, this.accel * 1.02, dt);
    } else {
      this.speed = coastTowardZero(this.speed, this.maxSpeed * 0.20);
    }

    // A gravidade da subida/descida atua depois da aceleracao normal.
    if (hasFuel || grade < 0) {
      this.speed = MathUtils.accelerate(this.speed, hillAcceleration, dt);
    }

    // --- Curvas em alta velocidade: leve scrub ---
    const curveLoad = limitar(Math.abs(segmentCurve) * speedPercent, 0, 1.4);
    if (curveLoad > 0.18) {
      const gripAssist = limitar(1.22 - this.steerFactor * 0.18, 0.74, 1.10);
      const curveBrake = -this.maxSpeed * curveLoad * (0.032 + speedPercent * 0.035) * gripAssist;
      this.speed = MathUtils.accelerate(this.speed, curveBrake, dt);
    }

    // --- Assistente de estabilidade ---
    const safeRoadLimit = limitar(1.12 - this.stabilityUpgrade * 0.026, 0.99, 1.12);
    const edgeAssist = limitar(dt * (3.2 + this.stabilityUpgrade * 1.18), 0, 1);
    if (this.x < -safeRoadLimit) {
      const overflow = Math.max(0, -safeRoadLimit - this.x);
      this.x += overflow * edgeAssist;
      if (this.speed > this.maxSpeed * 0.45) {
        this.speed = MathUtils.accelerate(this.speed, -this.maxSpeed * (0.04 + overflow * (0.08 + this.stabilityUpgrade * 0.012)), dt);
      }
    } else if (this.x > safeRoadLimit) {
      const overflow = Math.max(0, this.x - safeRoadLimit);
      this.x -= overflow * edgeAssist;
      if (this.speed > this.maxSpeed * 0.45) {
        this.speed = MathUtils.accelerate(this.speed, -this.maxSpeed * (0.04 + overflow * (0.08 + this.stabilityUpgrade * 0.012)), dt);
      }
    }

    // --- Fora da pista: perde velocidade ---
    if ((this.x < -1 || this.x > 1) && this.speed > this.offRoadLimit) {
      this.speed = MathUtils.accelerate(this.speed, this.offRoadDecel * 0.86, dt);
    }

    // --- Limites ---
    this.x = MathUtils.limit(this.x, -PlayerCar.PLAYER_MAX_X, PlayerCar.PLAYER_MAX_X);
    const momentumMax = !hasFuel
      ? Math.max(effectiveMax, Math.max(0, this.speed))
      : effectiveMax;
    this.speed = MathUtils.limit(this.speed, -this.reverseMax, momentumMax);

    if (this.collisionFlash > 0) this.collisionFlash -= dt;
  }

  turboDurationSeconds() {
    // V69: cada compra de Turbo faz o impulso durar mais. Nv.0 = 3.0s, Nv.5 = 6.0s.
    return 3.0 + this.turboUpgrade * 0.60;
  }

  activateTurbo(durationSeconds) {
    const dur = (durationSeconds === undefined) ? this.turboDurationSeconds() : durationSeconds;
    if (this.turboActive || this.turboTimer > 0 || this.turboBar <= 0.04) return false;
    this.turboTimer = Math.max(0.25, dur);
    this.turboActive = true;
    return true;
  }

  refillTurbo(amount) {
    this.turboBar = limitar(this.turboBar + amount, 0, 1);
  }

  maxFuelLiters() {
    return Math.max(60, Math.round(60 * this.fuelTankMultiplier));
  }

  /** Aplica uma penalidade de colisao (reduz a velocidade). */
  applyCollision(targetSpeed) {
    this.speed = Math.max(0, targetSpeed);
    this.collisionFlash = 0.4;
  }

  garageSpeedCapKmh() {
    switch (this.car.id) {
      case 0: return 400;
      case 1: return 500;
      case 2: return 600;
      case 3: return 700;
      case 4: return 800;
      case 5: return 900;
      case 6: return 1000;
      case 7: return 1100;
      case 8: return 1200;
      default: return 1500;
    }
  }

  maxDisplayKmh() {
    // V59: todos comecam em 320 km/h. Velocidade + motor aproximam do limite da garagem.
    const cap = this.garageSpeedCapKmh();
    const progress = limitar((this.speedUpgrade + this.motorUpgrade) / PlayerCar.MAX_SPEED_LEVEL_SUM, 0, 1);
    return limitar(Math.trunc(320 + (cap - 320) * progress), 320, cap);
  }

  cruiseDisplayKmh() { return this.maxDisplayKmh(); }

  maxGear() {
    // Sem upgrade: R, 1, 2, 3, 4. Cada nivel de motor libera uma marcha a mais ate 8.
    return limitar(4 + this.motorUpgrade, 4, 8);
  }

  gearLabel() {
    if (this.speed < -this.maxSpeed * 0.006) return "R";
    const kmh = this.speedKmh();
    if (kmh < 5) return "1";
    const gearCount = this.maxGear();
    const ratio = limitar(kmh / this.maxDisplayKmh(), 0, 0.999);
    return String(limitar(1 + Math.trunc(ratio * gearCount), 1, gearCount));
  }

  speedKmh() {
    const maxKmh = Math.max(1, this.maxDisplayKmh());
    if (this.speed < 0) {
      const reverseShown = Math.trunc((Math.abs(this.speed) / Math.max(1, this.reverseMax)) * 80);
      return limitar(reverseShown, 0, 80);
    }
    const ratio = limitar(this.speed / this.maxSpeed, 0, 1.35);
    const shown = Math.trunc(Math.min(1, ratio) * maxKmh);
    return limitar(shown, 0, maxKmh);
  }

  fuelConsumptionMultiplier() {
    // V61: cada carro tem consumo proprio. Carros mais rapidos gastam mais.
    const cap = this.garageSpeedCapKmh();
    const speedLoad = limitar((cap - 400) / 1100, 0, 1);
    const upgradeLoad = limitar((this.speedUpgrade + this.motorUpgrade) / 10, 0, 1);
    return limitar(0.80 + speedLoad * 0.38 + upgradeLoad * 0.12, 0.78, 1.35);
  }

  hasInstantPitSpecial() {
    // O especial fica disponivel com upgrades intermediarios.
    return this.tankUpgrade >= 2 || this.motorUpgrade >= 2 || this.turboUpgrade >= 2;
  }
}

PlayerCar.PLAYER_MAX_X = 1.34;  // deixa sair um pouco mais da pista, sem exagerar
PlayerCar.MAX_SPEED_LEVEL_SUM = 10;

window.PlayerCar = PlayerCar;
