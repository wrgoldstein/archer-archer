import { screenToWorld } from '../core/camera.js';

export class PointerInput {
  constructor({ canvas, state, world, sendInput }) {
    this.canvas = canvas;
    this.state = state;
    this.world = world;
    this.sendInput = sendInput;
  }

  attach() {
    for (const eventName of ['pointerdown', 'pointermove']) {
      this.canvas.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (eventName === 'pointerdown') {
          this.canvas.setPointerCapture(event.pointerId);
          this.state.pointer.active = true;
        }
        this.updatePointer(event);
      });
    }

    for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
      this.canvas.addEventListener(eventName, (event) => {
        event.preventDefault();
        this.state.pointer.active = false;
        this.updateInputFromPointer();
        this.sendInput(this.state.input);
      });
    }
  }

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const pointer = screenToWorld(this.state.camera, this.world, screenX, screenY);
    this.state.pointer.worldX = pointer.x;
    this.state.pointer.worldY = pointer.y;
    this.updateInputFromPointer();
    this.sendInput(this.state.input);
  }

  updateInputFromPointer() {
    const me = this.state.players.get(this.state.myId);
    if (!me) return;

    const rawDx = this.state.pointer.worldX - me.x;
    const rawDy = this.state.pointer.worldY - me.y;
    const distance = Math.hypot(rawDx, rawDy);
    if (distance > 4) this.state.input.aimAngle = Math.atan2(rawDy, rawDx);

    if (this.state.pointer.active && distance > 14) {
      this.state.input.dx = rawDx / distance;
      this.state.input.dy = rawDy / distance;
      this.state.input.moving = true;
    } else {
      this.state.input.dx = 0;
      this.state.input.dy = 0;
      this.state.input.moving = false;
    }
  }
}
