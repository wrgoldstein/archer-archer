import { createCamera } from '../core/camera.js';

export function createClientState(world) {
  return {
    myId: null,
    connected: false,
    players: new Map(),
    arrows: new Map(),
    enemies: new Map(),
    wave: 0,
    // These lifecycle sets let the effects layer run one-shot effects when
    // network state changes, without baking particle logic into the protocol.
    knownArrowIds: new Set(),
    knownStuckArrowIds: new Set(),
    pointer: {
      active: false,
      worldX: world.width / 2 + 1,
      worldY: world.height / 2,
    },
    input: {
      dx: 0,
      dy: 0,
      moving: false,
      aimAngle: 0,
    },
    camera: createCamera(),
    lastFrame: performance.now(),
  };
}
