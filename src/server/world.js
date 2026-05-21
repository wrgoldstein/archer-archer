'use strict';

const {
  WORLD,
  PLAYER_SPEED,
  ARROW_SPEED,
  ARROW_TTL,
  STUCK_ARROW_TTL,
  ARROW_TIP_OFFSET,
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
    this.nextPlayerId = 1;
    this.nextArrowId = 1;
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
    };

    this.players.set(id, player);
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

    this.updatePlayers(t, dt);
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
      } else if (
        t - player.connectedAt > 0.25 &&
        t - player.stoppedAt > FIRE_GRACE_AFTER_MOVING &&
        t - player.lastShotAt > FIRE_COOLDOWN
      ) {
        this.spawnArrow(player, t);
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

      if (!arrow.stuck && arrow.age > ARROW_TTL) {
        this.arrows.delete(id);
      }
    }
  }

  spawnArrow(player, t) {
    const angle = Number.isFinite(player.aimAngle) ? player.aimAngle : 0;
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
    });
    player.lastShotAt = t;
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
      })),
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
