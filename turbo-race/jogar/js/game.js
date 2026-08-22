"use strict";
class TelaDeCorrida {
  constructor(app){this.app=app;this.save=app.save;this.sound=app.sound;this.controls=new Controls();this.renderer=new Renderer();this.hud=new HUD();this.keys={};this.segmentLength=200;this.bgOffset=0;this.tempo=0;this.headlights=false;this.onlineTimer=0;}
  entrar(p) {
    this.stageIndex = limitar(Math.trunc(p.stageIndex || 0), 0, StageCatalog.count() - 1);
    this.stage = Object.assign({}, StageCatalog.byIndex(this.stageIndex));
    const clima = String(p.clima || "auto");
    if (clima === "night") this.stage.isNight = true;
    else if (clima !== "auto") this.stage.isNight = false;
    if (p.semente) MathUtils.setRandomSeed(p.semente);
    this.segments = new TrackGenerator(this.stage, this.segmentLength).build();
    if (OnlineSession.enabled) this._configurarPocas(p.pocaAgua !== false, p.pocaOleo !== false);
    const car = CarCatalog.byId(this.save.selectedCarId);
    const up = t => this.save.getUpgradeLevel ? this.save.getUpgradeLevel(car.id, t) : this.save.getUpgrade(car.id, t);
    this.player = new PlayerCar(car, 8200, 8200 / 5.35, up("speed") || 0, up("stability") || 0, up("turbo") || 0, up("tank") || 0, up("motor") || 0);
    this.trackLength = this.segments.length * this.segmentLength;
    const voltas = OnlineSession.enabled ? limitar(Math.trunc(p.voltas || this.stage.laps), 1, 10) : this.stage.laps;
    const tempoLimite = Math.max(this.stage.timeLimit, 120 + Math.max(0, voltas - 3) * 60);
    this.state = new GameState(tempoLimite, this.trackLength, voltas);
    this.renderer.weatherOverride = clima;
    if (OnlineSession.enabled && Number.isFinite(Number(p.largadaLocalEm))) {
      this.state.countdown = Math.max(0, (Number(p.largadaLocalEm) - performance.now()) / 1000);
    } else {
      this.state.countdown += Math.max(0, Number(p.esperaLargadaMs) || 0) / 1000;
    }
    this.state.totalRacers = OnlineSession.enabled ? Math.max(2, (OnlineSession.service?.connectedCount() || 0) + 1) : 1;
    this.countdownWas = Math.ceil(this.state.countdown) + 1;
    this.remote = {};
    this.sound.stopMusic();
    this.sound.startMusic("race_music_" + ((this.stageIndex % 6) + 1), "race_music");
    this.sound.startEngine();
    Assets.carregarDaCorrida();
    Assets.carregarCarros();
    Assets.carregarFundoDaFase(this.stageIndex);
  }

  _configurarPocas(agua, oleo) {
    for (const seg of this.segments) {
      seg.sprites = seg.sprites.filter(sp => sp.type !== SpriteType.PUDDLE_WATER && sp.type !== SpriteType.PUDDLE_OIL);
    }
    const tipos = [];
    if (agua) tipos.push(SpriteType.PUDDLE_WATER);
    if (oleo) tipos.push(SpriteType.PUDDLE_OIL);
    if (!tipos.length) return;
    let i = 80;
    while (i < this.segments.length - 45) {
      const seg = this.segments[i];
      if (!seg.isPitStop && !seg.isTunnel) {
        const tipo = tipos[MathUtils.randomInt(0, tipos.length - 1)];
        seg.sprites.push(new Sprite(tipo, MathUtils.randomFloat(-0.68, 0.68), MathUtils.randomFloat(0.86, 1.02)));
      }
      i += MathUtils.randomInt(75, 125);
    }
  }
  sair(){this.sound.releaseKeepMusic();this.keys={};}
  medir(w,h){this.renderer.setup(w,h);this.hud.setup(w,h,this.save.controlType);}
  update(dt){this.tempo+=dt;if(this.state.phase===GamePhase.COUNTDOWN){this.state.countdown-=dt;const n=Math.ceil(this.state.countdown);if(n<this.countdownWas){this.countdownWas=n;if(n<=3)n>0?this.sound.playCountdownTick():this.sound.playCountdownGo();}if(this.state.countdown<=0)this.state.phase=GamePhase.RUNNING;return;}if(this.state.phase!==GamePhase.RUNNING)return;this.controls.left=!!(this.keys.ArrowLeft||this.keys.KeyA);this.controls.right=!!(this.keys.ArrowRight||this.keys.KeyD);this.controls.accelerate=!!(this.keys.ArrowUp||this.keys.KeyW||this.controls.accelerate);this.controls.brake=!!(this.keys.ArrowDown||this.keys.KeyS||this.controls.brake);const idx=Math.trunc(this.player.position/this.segmentLength)%this.segments.length,seg=this.segments[idx],slope=seg.p2.world.y-seg.p1.world.y;this.player.update(this.controls,seg.curve,slope,this.state.fuel,dt,1);this.player.position+=this.player.speed*dt;if(this.player.position>=this.trackLength){this.player.position-=this.trackLength;this.state.completedLaps++;if(this.state.completedLaps>=this.state.totalLaps){this.state.phase=GamePhase.WON;this.state.outcome=RaceOutcome.QUALIFIED;this.state.totalRewardCoins=Math.max(100,this.state.coins+500);this.save.addCoins(this.state.totalRewardCoins);this.save.submitScore(this.stageIndex,this.state.score);this.save.unlockNextStage?.(this.stageIndex);this.sound.stopEngine();}}if(this.player.position<0)this.player.position+=this.trackLength;this.state.elapsed+=dt;this.state.timeLeft=Math.max(0,this.state.timeLeft-dt);this.state.fuel=Math.max(0,this.state.fuel-dt*.0025*this.stage.fuelUse);this.state.score=Math.trunc(this.state.travelledWorld(this.player.position)/10);if(this.state.timeLeft<=0||this.state.fuel<=0){this.state.phase=GamePhase.LOST;this.state.outcome=this.state.fuel<=0?RaceOutcome.OUT_OF_FUEL:RaceOutcome.TIME_UP;this.sound.stopEngine();}this.bgOffset+=seg.curve*this.player.speed/this.trackLength*dt;this.sound.updateEngine(this.player.speed/this.player.maxSpeed);this.onlineTimer-=dt;if(OnlineSession.enabled&&OnlineSession.service&&this.onlineTimer<=0){this.onlineTimer=.08;OnlineSession.service.sendState({x:this.player.x,position:this.player.position,speed:this.player.speed,lap:this.state.currentLap,fuel:this.state.fuel,carId:this.player.car.id,rank:this.state.rank,finished:this.state.phase===GamePhase.WON,playerName:this.save.playerName,playerId:OnlineSession.localPlayerId});}}
  render(ctx){const idx=Math.trunc(this.player.position/this.segmentLength)%this.segments.length,pct=(this.player.position%this.segmentLength)/this.segmentLength,py=this.segments[idx].p1.world.y;this.renderer.render(ctx,this.segments,this.stage,this.player,idx,pct,py,this.bgOffset,this.tempo,this.headlights);this.hud.draw(ctx,this.state,this.player,this.headlights,this.stage.isNight,this.controls,false,false,false,"",false);if(this.state.phase===GamePhase.COUNTDOWN)this.hud.drawCountdown(ctx,Math.max(0,this.state.countdown));else if(this.state.phase===GamePhase.WON||this.state.phase===GamePhase.LOST)this.hud.drawResult(ctx,this.state,this.state.phase===GamePhase.WON,this.stageIndex<StageCatalog.count()-1);}
  aoTeclar(e,on){this.keys[e.code]=on;if(on&&e.code==="Space"){if(this.player.activateTurbo())this.sound.playTurbo();}if(on&&e.code==="Escape")this.app.irPara("worldtour");if(on&&(this.state.phase===GamePhase.WON||this.state.phase===GamePhase.LOST)&&e.code==="Enter")this.app.irPara("worldtour");}
  aoApontar(tipo,x,y){const on=tipo!=="cima";if(!on){this.controls.left=this.controls.right=this.controls.accelerate=this.controls.brake=false;return;}if(this.state.phase===GamePhase.WON||this.state.phase===GamePhase.LOST){this.app.irPara("worldtour");return;}const w=this.app.largura,h=this.app.altura;if(y>h*.62){if(x<w*.25)this.controls.left=true;else if(x<w*.48)this.controls.right=true;else if(x>w*.76){this.controls.accelerate=true;if(y<h*.80&&this.player.activateTurbo())this.sound.playTurbo();}else this.controls.brake=true;}else if(x<w*.13&&y<h*.18)this.app.irPara("worldtour");}
}
window.TelaDeCorrida=TelaDeCorrida;
