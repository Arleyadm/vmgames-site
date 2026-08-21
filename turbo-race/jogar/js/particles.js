"use strict";
/*
 * Sistema de particulas simples para os efeitos atras do carro:
 *  - fumaca/poeira em aceleracao e derrapagem
 *  - faiscas/chamas quando o turbo esta ativo
 * Porte de ParticleSystem.kt. As particulas vivem em coordenadas de tela.
 */
class ParticleSystem {
  constructor() {
    this.pool = [];
    for (let i = 0; i < 120; i++) {
      this.pool.push({
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 0,
        color: Cor.WHITE, active: false
      });
    }
  }

  _obtain() {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) return this.pool[i];
    }
    return null;
  }

  /** Emite particulas de turbo (chamas) na traseira do carro. */
  emitTurbo(x, y, scale) {
    for (let i = 0; i < 3; i++) {
      const p = this._obtain();
      if (!p) return;
      p.active = true;
      p.x = x + MathUtils.randomFloat(-8, 8) * scale;
      p.y = y;
      p.vx = MathUtils.randomFloat(-40, 40);
      p.vy = MathUtils.randomFloat(120, 260);   // vai "para tras" (para baixo na tela)
      p.life = 0;
      p.maxLife = MathUtils.randomFloat(0.25, 0.5);
      p.size = MathUtils.randomFloat(6, 14) * scale;
      // Turbo usa somente tons de fogo, sem bolinhas azuis.
      p.color = (MathUtils.randomInt(0, 1) === 0)
        ? Cor.rgb(0xFF, 0xD2, 0x4D)
        : Cor.rgb(0xFF, 0x7A, 0x18);
    }
  }

  /** Emite poeira/fumaca (ex.: ao sair da pista ou derrapar). */
  emitDust(x, y, scale, color) {
    for (let i = 0; i < 2; i++) {
      const p = this._obtain();
      if (!p) return;
      p.active = true;
      p.x = x + MathUtils.randomFloat(-20, 20) * scale;
      p.y = y;
      p.vx = MathUtils.randomFloat(-60, 60);
      p.vy = MathUtils.randomFloat(40, 120);
      p.life = 0;
      p.maxLife = MathUtils.randomFloat(0.4, 0.8);
      p.size = MathUtils.randomFloat(10, 22) * scale;
      p.color = color;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;   // leve gravidade/arrasto
    }
  }

  draw(ctx) {
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = 1 - (p.life / p.maxLife);  // de 1 a 0
      ctx.fillStyle = Cor.css(p.color, limitar(t * 220, 0, 255));
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0, p.size * t), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  clear() {
    for (const p of this.pool) p.active = false;
  }
}
window.ParticleSystem = ParticleSystem;
