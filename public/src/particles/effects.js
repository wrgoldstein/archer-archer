import { hexToRgb, rand } from '../core/math.js';
import { burst, ownerColor, particleBudgetOk } from './ShaderParticleSystem.js';

export function handleArrowLifecycleEffects({ state, particles }) {
  for (const arrow of state.arrows.values()) {
    const color = arrow.sprite ? '#67e8f9' : ownerColor(state, arrow.ownerId);

    if (!state.knownArrowIds.has(arrow.id)) {
      state.knownArrowIds.add(arrow.id);
      emitMuzzleFlash(particles, arrow.x, arrow.y, arrow.angle, color, arrow.fire);
    }

    if (arrow.stuck && !state.knownStuckArrowIds.has(arrow.id)) {
      state.knownStuckArrowIds.add(arrow.id);
      emitWallImpact(particles, arrow.x, arrow.y, arrow.angle, arrow.fire ? '#fb923c' : color, arrow.fire);
    }
  }

  for (const arrowId of [...state.knownArrowIds]) {
    if (!state.arrows.has(arrowId)) {
      state.knownArrowIds.delete(arrowId);
      state.knownStuckArrowIds.delete(arrowId);
    }
  }

  for (const upgrade of state.upgrades.values()) state.knownUpgradeIds.add(upgrade.id);
  for (const upgradeId of [...state.knownUpgradeIds]) {
    if (!state.upgrades.has(upgradeId)) state.knownUpgradeIds.delete(upgradeId);
  }
}

export function emitPersistentEffects({ state, particles, dt }) {
  if (!particleBudgetOk(particles, state)) return;

  for (const arrow of state.arrows.values()) {
    if (!arrow.stuck && Math.random() < (arrow.fire ? 1 : 0.95)) {
      const angle = Number.isFinite(arrow.angle) ? arrow.angle : Math.atan2(arrow.vy, arrow.vx);
      const speed = arrow.fire ? rand(70, 185) : 30 + Math.random() * 55;
      const spread = (Math.random() - 0.5) * (arrow.fire ? 1.35 : 0.9);
      particles.spawn({
        x: arrow.x - Math.cos(angle) * rand(12, 34) + rand(-5, 5),
        y: arrow.y - Math.sin(angle) * rand(12, 34) + rand(-5, 5),
        vx: -Math.cos(angle + spread) * speed + rand(-28, 28),
        vy: -Math.sin(angle + spread) * speed + rand(-28, 28) - (arrow.fire ? rand(16, 70) : 0),
        size: arrow.fire ? rand(18, 42) : rand(8, 18),
        color: hexToRgb(arrow.sprite ? '#67e8f9' : arrow.fire ? (Math.random() < 0.35 ? '#fff7ad' : '#fb923c') : ownerColor(state, arrow.ownerId), arrow.fire ? rand(0.7, 1.0) : arrow.sprite ? rand(0.62, 0.92) : 0.86),
        life: arrow.fire ? rand(0.22, 0.5) : arrow.sprite ? rand(0.2, 0.42) : rand(0.16, 0.38),
        style: arrow.fire ? 'fire' : 'arcane',
      });
      if (arrow.fire && Math.random() < 0.45) {
        particles.spawn({
          x: arrow.x - Math.cos(angle) * rand(20, 42),
          y: arrow.y - Math.sin(angle) * rand(20, 42),
          vx: rand(-22, 22),
          vy: rand(-95, -25),
          size: rand(10, 24),
          color: hexToRgb('#7f1d1d', rand(0.2, 0.42)),
          life: rand(0.35, 0.8),
          style: 'arcane',
        });
      }
    }
  }

  for (const upgrade of state.upgrades.values()) {
    if (Math.random() < 0.9) {
      const angle = Math.random() * Math.PI * 2;
      const distance = rand(18, 42);
      particles.spawn({
        x: upgrade.x + Math.cos(angle) * distance,
        y: upgrade.y + Math.sin(angle) * distance,
        vx: -Math.sin(angle) * rand(18, 60),
        vy: Math.cos(angle) * rand(18, 60),
        size: rand(9, 24),
        color: hexToRgb(Math.random() < 0.35 ? '#ffffff' : upgradeColor(upgrade), rand(0.45, 0.82)),
        life: rand(0.35, 0.8),
      });
    }
    particles.addForceField({ x: upgrade.x, y: upgrade.y, radius: 95, strength: 180, mode: 'vortex', life: 0.08 });
  }

  for (const player of state.players.values()) {
    if (!player.moving && Math.random() < 0.32 + dt * 5) {
      const angle = Math.random() * Math.PI * 2;
      const distance = rand(18, 36);
      particles.spawn({
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
        vx: Math.cos(angle) * rand(4, 28),
        vy: Math.sin(angle) * rand(4, 28) - 10,
        size: rand(7, 19),
        color: hexToRgb(player.color || '#7dd3fc', 0.52),
        life: rand(0.32, 0.7),
      });
    }

    if (player.sprite && Math.random() < 0.75) {
      const spriteAngle = Number.isFinite(player.spriteAngle) ? player.spriteAngle : Math.random() * Math.PI * 2;
      const sx = player.x + Math.cos(spriteAngle) * 46;
      const sy = player.y + Math.sin(spriteAngle) * 46;
      particles.spawn({
        x: sx + rand(-7, 7),
        y: sy + rand(-7, 7),
        vx: rand(-20, 20),
        vy: rand(-38, 8),
        size: rand(6, 17),
        color: hexToRgb('#67e8f9', rand(0.38, 0.72)),
        life: rand(0.22, 0.58),
      });
    }
  }
}

function upgradeColor(upgrade) {
  if (upgrade.type === 'fire-arrows') return '#fb923c';
  if (upgrade.type === 'sprite') return '#67e8f9';
  return '#a78bfa';
}

function emitMuzzleFlash(particles, x, y, angle, color, fire = false) {
  const count = fire ? 42 : 22;
  for (let i = 0; i < count; i += 1) {
    const spread = fire ? rand(-1.35, 1.35) : rand(-0.95, 0.95);
    const speed = fire ? rand(85, 330) : rand(50, 210);
    particles.spawn({
      x: x + rand(-5, 5),
      y: y + rand(-5, 5),
      vx: Math.cos(angle + spread) * speed,
      vy: Math.sin(angle + spread) * speed - (fire ? rand(25, 90) : 0),
      size: fire ? rand(16, 44) : rand(8, 26),
      color: hexToRgb(fire ? (i % 4 === 0 ? '#fff7ad' : '#fb923c') : i % 3 === 0 ? '#fff7ad' : color, fire ? rand(0.72, 1) : rand(0.55, 0.95)),
      life: fire ? rand(0.24, 0.62) : rand(0.18, 0.52),
      style: fire ? 'fire' : 'arcane',
    });
  }
}

function emitWallImpact(particles, x, y, angle, color, fire = false) {
  particles.addForceField({ x, y, radius: fire ? 130 : 90, strength: fire ? 720 : 420, mode: 'repel', life: fire ? 0.34 : 0.22 });
  if (fire) {
    emitMuzzleFlash(particles, x, y, angle + Math.PI, color, true);
    return;
  }
  burst(particles, {
    x,
    y,
    angle: angle + Math.PI,
    spread: 2.5,
    count: 34,
    speed: [45, 260],
    size: [7, 24],
    life: [0.16, 0.48],
    color: hexToRgb(color, 0.75),
  });
}
