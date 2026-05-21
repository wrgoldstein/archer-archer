'use strict';

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  WORLD: { width: 1280, height: 720 },
  PLAYER_SPEED: 245,
  ARROW_SPEED: 650,
  ARROW_TTL: 3.0, // Safety timeout; arrows normally stop on the arena wall first.
  STUCK_ARROW_TTL: 0.85,
  ARROW_TIP_OFFSET: 24,
  ENEMY_SPEED: 82,
  ENEMY_RADIUS: 22,
  ENEMY_MAX_HP: 2,
  WAVE_SPAWN_DELAY: 1.2,
  UPGRADE_RADIUS: 24,
  UPGRADE_PICKUP_RADIUS: 48,
  FIRE_COOLDOWN: 0.48,
  FIRE_GRACE_AFTER_MOVING: 0.16,
  SNAPSHOT_HZ: 30,
  PLAYER_COLORS: [
    '#7dd3fc',
    '#f0abfc',
    '#86efac',
    '#fde68a',
    '#fca5a5',
    '#c4b5fd',
    '#67e8f9',
    '#fdba74',
  ],
};
