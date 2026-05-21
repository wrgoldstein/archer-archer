'use strict';

const {
  WORLD,
  PLAYER_SPEED,
  ARROW_SPEED,
  ARROW_TTL,
  STUCK_ARROW_TTL,
  ARROW_TIP_OFFSET,
  ENEMY_SPEED,
  ENEMY_RADIUS,
  ENEMY_MAX_HP,
  WAVE_SPAWN_DELAY,
  UPGRADE_RADIUS,
  UPGRADE_PICKUP_RADIUS,
  FIRE_COOLDOWN,
  FIRE_GRACE_AFTER_MOVING,
  SNAPSHOT_HZ,
  PLAYER_COLORS,
} = require('./config');

class GameWorld {
  constructor({ broadcast }) {
    this.broadcast = broadcast;
    this.players = new Map();
    this.arrows = new Map();
    this.enemies = new Map();
    this.upgrades = new Map();
    this.wave = 0;
    this.nextWaveAt = nowSeconds() + WAVE_SPAWN_DELAY;
    this.nextPlayerId = 1;
    this.nextArrowId = 1;
    this.nextEnemyId = 1;
    this.nextUpgradeId = 1;
    this.lastTick = nowSeconds();
    this.lastSnapshot = 0;
  }

  addPlayer() {
    const id = String(this.nextPlayerId++);
    const spawn = spawnPoint(this.players.size);
    const color = PLAYER_COLORS[(Number(id) - 1) % PLAYER_COLORS.length];
    const player = {
      id,
      name: `P${id}`,
      color,
      x: spawn.x,
      y: spawn.y,
      dx: 0,
      dy: 0,
      moving: false,
      aimAngle: 0,
      lastShotAt: 0,
      stoppedAt: nowSeconds(),
      connectedAt: nowSeconds(),
      tripleShot: false,
      fireArrows: false,
    };

    this.players.set(id, player);
    this.ensureUpgradeSpawned();
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    for (const [arrowId, arrow] of this.arrows) {
      if (arrow.ownerId === id) this.arrows.delete(arrowId);
    }
  }

  handleInput(playerId, data) {
    const player = this.players.get(playerId);
    if (!player) return;

    const wasMoving = player.moving;
    const dx = clampNumber(data.dx, -1, 1);
    const dy = clampNumber(data.dy, -1, 1);
    const len = Math.hypot(dx, dy);

    player.moving = Boolean(data.moving) && len > 0.05;
    if (player.moving) {
      player.dx = dx / len;
      player.dy = dy / len;
      player.aimAngle = Math.atan2(player.dy, player.dx);
    } else {
      player.dx = 0;
      player.dy = 0;
      if (Number.isFinite(data.aimAngle)) player.aimAngle = data.aimAngle;
      if (wasMoving) player.stoppedAt = nowSeconds();
    }
  }

  tick() {
    const t = nowSeconds();
    const dt = Math.min(0.05, t - this.lastTick);
    this.lastTick = t;

    this.ensureUpgradeSpawned();
    this.maybeSpawnWave(t);
    this.updatePlayers(t, dt);
    this.updateEnemies(dt);
    this.updateArrows(t, dt);

    if (t - this.lastSnapshot >= 1 / SNAPSHOT_HZ) {
      this.lastSnapshot = t;
      this.broadcast(this.snapshot(t));
    }
  }

  updatePlayers(t, dt) {
    for (const player of this.players.values()) {
      if (player.moving) {
        player.x += player.dx * PLAYER_SPEED * dt;
        player.y += player.dy * PLAYER_SPEED * dt;
        player.x = clamp(player.x, 30, WORLD.width - 30);
        player.y = clamp(player.y, 30, WORLD.height - 30);
      } else {
        const target = this.findNearestEnemy(player);
        if (target) player.aimAngle = Math.atan2(target.y - player.y, target.x - player.x);

        if (
          target &&
          t - player.connectedAt > 0.25 &&
          t - player.stoppedAt > FIRE_GRACE_AFTER_MOVING &&
          t - player.lastShotAt > FIRE_COOLDOWN
        ) {
          this.spawnArrows(player, t, target);
        }
      }

      this.checkUpgradePickups(player);
    }
  }

  checkUpgradePickups(player) {
    for (const upgrade of this.upgrades.values()) {
      const pickupDistance = UPGRADE_PICKUP_RADIUS + upgrade.radius;
      if (distanceSquared(player, upgrade) <= pickupDistance ** 2) {
        this.pickupUpgrade(player, upgrade);
      }
    }
  }

  updateArrows(t, dt) {
    for (const [id, arrow] of this.arrows) {
      arrow.age += dt;

      if (arrow.stuck) {
        if (t - arrow.stuckAt > STUCK_ARROW_TTL) this.arrows.delete(id);
        continue;
      }

      const nextX = arrow.x + arrow.vx * dt;
      const nextY = arrow.y + arrow.vy * dt;
      const wallHit = getArrowWallHit(arrow, nextX, nextY);

      if (wallHit.hit) {
        arrow.x += arrow.vx * dt * wallHit.alpha;
        arrow.y += arrow.vy * dt * wallHit.alpha;
        arrow.vx = 0;
        arrow.vy = 0;
        arrow.stuck = true;
        arrow.stuckAt = t;
      } else {
        arrow.x = nextX;
        arrow.y = nextY;
      }

      if (!arrow.stuck) {
        const hitEnemy = this.findArrowEnemyHit(arrow);
        if (hitEnemy) {
          this.damageEnemy(hitEnemy, 1);
          this.arrows.delete(id);
          continue;
        }
      }

      if (!arrow.stuck && arrow.age > ARROW_TTL) {
        this.arrows.delete(id);
      }
    }
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies.values()) {
      const target = this.findNearestPlayer(enemy);
      if (!target) continue;

      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.0001) continue;

      // Stop just outside the player for now. Player damage can live here later.
      const desiredDistance = ENEMY_RADIUS + 22;
      if (distance > desiredDistance) {
        const step = Math.min(distance - desiredDistance, ENEMY_SPEED * dt);
        enemy.x += (dx / distance) * step;
        enemy.y += (dy / distance) * step;
      }
    }
  }

  ensureUpgradeSpawned() {
    if (this.players.size === 0) return;
    const missingTypes = new Set();
    for (const player of this.players.values()) {
      if (!player.tripleShot) missingTypes.add('triple-shot');
      if (!player.fireArrows) missingTypes.add('fire-arrows');
    }

    for (const upgrade of this.upgrades.values()) missingTypes.delete(upgrade.type);

    for (const type of missingTypes) this.spawnUpgrade(type);
  }

  spawnUpgrade(type) {
    const id = String(this.nextUpgradeId++);
    const position = upgradeSpawnPoint(type);
    this.upgrades.set(id, {
      id,
      type,
      x: position.x,
      y: position.y,
      radius: UPGRADE_RADIUS,
    });
  }

  pickupUpgrade(player, upgrade) {
    if (upgrade.type === 'triple-shot') player.tripleShot = true;
    if (upgrade.type === 'fire-arrows') player.fireArrows = true;
    this.upgrades.delete(upgrade.id);
  }

  maybeSpawnWave(t) {
    if (this.players.size === 0 || this.enemies.size > 0 || t < this.nextWaveAt) return;

    this.wave += 1;
    const count = Math.min(6 + this.wave * 2, 24);
    for (let i = 0; i < count; i += 1) this.spawnEnemy(i, count);
  }

  spawnEnemy(index, count) {
    const id = String(this.nextEnemyId++);
    const spawn = enemySpawnPoint(index, count);
    this.enemies.set(id, {
      id,
      type: 'slime',
      x: spawn.x,
      y: spawn.y,
      radius: ENEMY_RADIUS,
      hp: ENEMY_MAX_HP,
      maxHp: ENEMY_MAX_HP,
    });
  }

  damageEnemy(enemy, damage) {
    enemy.hp -= damage;
    if (enemy.hp <= 0) {
      this.enemies.delete(enemy.id);
      if (this.enemies.size === 0) this.nextWaveAt = nowSeconds() + WAVE_SPAWN_DELAY;
    }
  }

  findNearestEnemy(player) {
    let best = null;
    let bestDistanceSq = Infinity;
    for (const enemy of this.enemies.values()) {
      const distanceSq = distanceSquared(player, enemy);
      if (distanceSq < bestDistanceSq) {
        best = enemy;
        bestDistanceSq = distanceSq;
      }
    }
    return best;
  }

  findNearestPlayer(enemy) {
    let best = null;
    let bestDistanceSq = Infinity;
    for (const player of this.players.values()) {
      const distanceSq = distanceSquared(enemy, player);
      if (distanceSq < bestDistanceSq) {
        best = player;
        bestDistanceSq = distanceSq;
      }
    }
    return best;
  }

  findArrowEnemyHit(arrow) {
    const tipX = arrow.x + Math.cos(arrow.angle) * ARROW_TIP_OFFSET;
    const tipY = arrow.y + Math.sin(arrow.angle) * ARROW_TIP_OFFSET;
    for (const enemy of this.enemies.values()) {
      const hitDistance = enemy.radius + 8;
      if ((tipX - enemy.x) ** 2 + (tipY - enemy.y) ** 2 <= hitDistance ** 2) return enemy;
    }
    return null;
  }

  spawnArrows(player, t, target) {
    const angle = target
      ? Math.atan2(target.y - player.y, target.x - player.x)
      : Number.isFinite(player.aimAngle)
        ? player.aimAngle
        : 0;
    const spreads = player.tripleShot ? [-0.18, 0, 0.18] : [0];
    for (const spread of spreads) this.spawnArrow(player, angle + spread);
    player.lastShotAt = t;
  }

  spawnArrow(player, angle) {
    const muzzleOffset = 28;
    const id = String(this.nextArrowId++);
    this.arrows.set(id, {
      id,
      ownerId: player.id,
      x: player.x + Math.cos(angle) * muzzleOffset,
      y: player.y + Math.sin(angle) * muzzleOffset,
      vx: Math.cos(angle) * ARROW_SPEED,
      vy: Math.sin(angle) * ARROW_SPEED,
      angle,
      age: 0,
      stuck: false,
      stuckAt: null,
      fire: player.fireArrows,
    });
  }

  snapshot(t) {
    return {
      type: 'snapshot',
      t,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        x: round(p.x),
        y: round(p.y),
        moving: p.moving,
        aimAngle: round(p.aimAngle),
        tripleShot: p.tripleShot,
        fireArrows: p.fireArrows,
      })),
      arrows: [...this.arrows.values()].map((a) => ({
        id: a.id,
        ownerId: a.ownerId,
        x: round(a.x),
        y: round(a.y),
        vx: round(a.vx),
        vy: round(a.vy),
        angle: round(a.angle),
        age: round(a.age),
        stuck: a.stuck,
        fire: a.fire,
      })),
      enemies: [...this.enemies.values()].map((e) => ({
        id: e.id,
        type: e.type,
        x: round(e.x),
        y: round(e.y),
        radius: e.radius,
        hp: e.hp,
        maxHp: e.maxHp,
      })),
      upgrades: [...this.upgrades.values()].map((u) => ({
        id: u.id,
        type: u.type,
        x: round(u.x),
        y: round(u.y),
        radius: u.radius,
      })),
      wave: this.wave,
    };
  }
}

function getArrowWallHit(arrow, nextX, nextY) {
  const tipDx = Math.cos(arrow.angle) * ARROW_TIP_OFFSET;
  const tipDy = Math.sin(arrow.angle) * ARROW_TIP_OFFSET;
  const startTipX = arrow.x + tipDx;
  const startTipY = arrow.y + tipDy;
  const endTipX = nextX + tipDx;
  const endTipY = nextY + tipDy;

  let alpha = 1;
  let hit = false;

  if (endTipX < 0 || endTipX > WORLD.width) {
    const wallX = endTipX < 0 ? 0 : WORLD.width;
    alpha = Math.min(alpha, safeSegmentAlpha(wallX, startTipX, endTipX));
    hit = true;
  }

  if (endTipY < 0 || endTipY > WORLD.height) {
    const wallY = endTipY < 0 ? 0 : WORLD.height;
    alpha = Math.min(alpha, safeSegmentAlpha(wallY, startTipY, endTipY));
    hit = true;
  }

  return { hit, alpha: clamp(alpha, 0, 1) };
}

function safeSegmentAlpha(target, start, end) {
  const delta = end - start;
  return Math.abs(delta) < 0.0001 ? 0 : (target - start) / delta;
}

function spawnPoint(index) {
  const ring = 90;
  const angle = (index / 8) * Math.PI * 2;
  return {
    x: WORLD.width / 2 + Math.cos(angle) * ring,
    y: WORLD.height / 2 + Math.sin(angle) * ring,
  };
}

function enemySpawnPoint(index, count) {
  const side = index % 4;
  const jitter = ((index * 37) % 100) / 100;
  const along = (index + 0.5 + jitter * 0.55) / count;
  const margin = 34;

  if (side === 0) return { x: clamp(along * WORLD.width, margin, WORLD.width - margin), y: margin };
  if (side === 1) return { x: WORLD.width - margin, y: clamp(along * WORLD.height, margin, WORLD.height - margin) };
  if (side === 2) return { x: clamp((1 - along) * WORLD.width, margin, WORLD.width - margin), y: WORLD.height - margin };
  return { x: margin, y: clamp((1 - along) * WORLD.height, margin, WORLD.height - margin) };
}

function upgradeSpawnPoint(type) {
  if (type === 'fire-arrows') return { x: WORLD.width / 2, y: WORLD.height / 2 + 170 };
  return { x: WORLD.width / 2, y: WORLD.height / 2 - 170 };
}

function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampNumber(value, min, max) {
  return Number.isFinite(value) ? clamp(value, min, max) : 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function nowSeconds() {
  return Date.now() / 1000;
}

module.exports = { GameWorld };
