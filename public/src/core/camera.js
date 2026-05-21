import { clamp } from './math.js';

export function createCamera() {
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
  };
}

export function updateCamera(camera, width, height, world) {
  camera.scale = Math.min(width / world.width, height / world.height) * 0.94;
  camera.offsetX = (width - world.width * camera.scale) / 2;
  camera.offsetY = (height - world.height * camera.scale) / 2;
}

export function worldToScreen(camera, x, y) {
  return {
    x: camera.offsetX + x * camera.scale,
    y: camera.offsetY + y * camera.scale,
  };
}

export function screenToWorld(camera, world, x, y) {
  return {
    x: clamp((x - camera.offsetX) / camera.scale, 0, world.width),
    y: clamp((y - camera.offsetY) / camera.scale, 0, world.height),
  };
}
