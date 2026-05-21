import { hexToRgb, rand } from '../core/math.js';
import { burst, ownerColor, particleBudgetOk } from './ShaderParticleSystem.js';

export function handleArrowLifecycleEffects({ state, particles }) {
  for (const arrow of state.arrows.values()) {
    const color = ownerColor(state, arrow.ownerId);

    if (!state.knownArrowIds.has(arrow.id)) {
      state.knownArrowIds.add(arrow.id);
      emitMuzzleFlash(particles, arrow.x, arrow.y, arrow.angle, color);
    }

    if (arrow.stuck && !state.knownStuckArrowIds.has(arrow.id)) {
      state.knownStuckArrowIds.add(arrow.id);
      emitWallImpact(particles, arrow.x, arrow.y, arrow.angle, color);
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
    if (!arrow.stuck && Math.random() < 0.95) {
      const angle = Number.isFinite(arrow.angle) ? arrow.angle : Math.atan2(arrow.vy, arrow.vx);
      const speed = 30 + Math.random() * 55;
      const spread = (Math.random() - 0.5) * 0.9;
      particles.spawn({
        x: arrow.x - Math.cos(angle) * 25 + rand(-4, 4),
        y: arrow.y - Math.sin(angle) * 25 + rand(-4, 4),
        vx: -Math.cos(angle + spread) * speed + rand(-20, 20),
        vy: -Math.sin(angle + spread) * speed + rand(-20, 20),
        size: rand(8, 18),
        color: hexToRgb(ownerColor(state, arrow.ownerId), 0.86),
        life: rand(0.16, 0.38),
      });
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
        color: hexToRgb(Math.random() < 0.35 ? '#ffffff' : '#a78bfa', rand(0.45, 0.82)),
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
  }
}

function emitMuzzleFlash(particles, x, y, angle, color) {
  for (let i = 0; i < 22; i += 1) {
    const spread = rand(-0.95, 0.95);
    const speed = rand(50, 210);
    particles.spawn({
      x: x + rand(-5, 5),
      y: y + rand(-5, 5),
      vx: Math.cos(angle + spread) * speed,
      vy: Math.sin(angle + spread) * speed,
      size: rand(8, 26),
      color: hexToRgb(i % 3 === 0 ? '#fff7ad' : color, rand(0.55, 0.95)),
      life: rand(0.18, 0.52),
    });
  }
}

function emitWallImpact(particles, x, y, angle, color) {
  particles.addForceField({ x, y, radius: 90, strength: 420, mode: 'repel', life: 0.22 });
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
