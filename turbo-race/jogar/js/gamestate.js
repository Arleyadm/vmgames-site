"use strict";
/*
 * Estado geral da corrida: fase atual, tempo, pontuacao, moedas, voltas,
 * combustivel, ultrapassagens e posicao. Porte de GameState.kt.
 */

/** Fases (estados) em que o jogo pode estar durante a corrida. */
const GamePhase = {
  TUTORIAL: "TUTORIAL", COUNTDOWN: "COUNTDOWN", RUNNING: "RUNNING",
  PAUSED: "PAUSED", WON: "WON", LOST: "LOST"
};

const RaceOutcome = {
  NONE: "NONE", QUALIFIED: "QUALIFIED", NOT_TOP_5: "NOT_TOP_5",
  TIME_UP: "TIME_UP", OUT_OF_FUEL: "OUT_OF_FUEL"
};

class GameState {
  constructor(timeLimit, trackLengthWorld, totalLaps) {
    this.timeLimit = timeLimit;
    this.trackLengthWorld = trackLengthWorld;
    this.totalLaps = totalLaps;

    this.phase = GamePhase.COUNTDOWN;
    this.outcome = RaceOutcome.NONE;

    this.timeLeft = timeLimit;
    this.elapsed = 0;
    this.countdown = 3.5;

    this.score = 0;
    this.coins = 0;
    this.overtakes = 0;
    this.rank = 1;

    // Recompensas exibidas no final da corrida.
    this.collectedRaceCoins = 0;
    this.positionBonusCoins = 0;
    this.fuelBonusCoins = 0;
    this.overtakeBonusCoins = 0;
    this.fuelBlocksRemaining = 0;
    this.totalRewardCoins = 0;
    this.rewardAnimTime = 0;
    this.finishRewardApplied = false;
    this.totalRacers = 1;

    this.completedLaps = 0;

    this.fuel = 1;
    this.inPitStop = false;
    this.pitSignal = false;
    this.emptyFuelTimer = 0;
    // V67: item comprado na garagem. Vira o botao GAS+ e enche o tanque uma vez por corrida.
    this.specialPitUsed = false;
    // V83: GELO congela os rivais por 6 segundos.
    this.freezeRivalsUsed = false;
    this.freezeRivalsTimer = 0;
    // V83: item Fantasma deixa o jogador invisivel e invencivel por 10 segundos.
    this.ghostModeUsed = false;
    this.ghostModeTimer = 0;
    // V88: explosao para parar os rivais por 5 segundos, sem reposicionar os carros.
    this.explodeRivalsUsed = false;
    this.explodeRivalsTimer = 0;

    this.newRecord = false;
  }

  get currentLap() { return limitar(this.completedLaps + 1, 1, this.totalLaps); }

  get qualifiedForNext() { return this.outcome === RaceOutcome.QUALIFIED; }

  get finishedButMissedCut() { return this.outcome === RaceOutcome.NOT_TOP_5; }

  travelledWorld(playerPosition) {
    return this.completedLaps * this.trackLengthWorld + limitar(playerPosition, 0, this.trackLengthWorld);
  }

  distanceMeters(playerPosition) {
    return Math.trunc(this.travelledWorld(playerPosition) / 100);
  }

  totalMeters() {
    return Math.trunc((this.trackLengthWorld * this.totalLaps) / 100);
  }

  progress(playerPosition) {
    return limitar(this.travelledWorld(playerPosition) / (this.trackLengthWorld * this.totalLaps), 0, 1);
  }

  lapProgress(playerPosition) {
    return limitar(playerPosition / this.trackLengthWorld, 0, 1);
  }
}

window.GamePhase = GamePhase;
window.RaceOutcome = RaceOutcome;
window.GameState = GameState;
