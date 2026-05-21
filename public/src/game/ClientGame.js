import '../game/registries.js';
import { updateCamera } from '../core/camera.js';
import { PointerInput } from '../input/PointerInput.js';
import { ClientSocket } from '../network/ClientSocket.js';
import { handleArrowLifecycleEffects, emitPersistentEffects } from '../particles/effects.js';
import { ShaderParticleSystem } from '../particles/ShaderParticleSystem.js';
import { Renderer } from '../render/Renderer.js';
import { createClientState } from './state.js';

export class ClientGame {
  constructor({ gameCanvas, fxCanvas, statusEl }) {
    this.gameCanvas = gameCanvas;
    this.fxCanvas = fxCanvas;
    this.statusEl = statusEl;
    this.world = { width: 1280, height: 720 };
    this.state = createClientState(this.world);
    this.particles = new ShaderParticleSystem(fxCanvas);
    this.renderer = new Renderer({ canvas: gameCanvas, state: this.state, world: this.world });
    this.socket = new ClientSocket({
      state: this.state,
      world: this.world,
      statusEl,
      onSnapshot: (snapshot) => this.applySnapshot(snapshot),
    });
    this.input = new PointerInput({
      canvas: gameCanvas,
      state: this.state,
      world: this.world,
      sendInput: (input) => this.socket.sendInput(input),
    });
  }

  start() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.input.attach();
    this.socket.connect();
    setInterval(() => this.socket.sendInput(this.state.input), 1000 / 30);
    requestAnimationFrame((now) => this.frame(now));
  }

  applySnapshot(snapshot) {
    this.state.players = new Map(snapshot.players.map((player) => [player.id, player]));
    this.state.arrows = new Map(snapshot.arrows.map((arrow) => [arrow.id, arrow]));
    handleArrowLifecycleEffects({ state: this.state, particles: this.particles });
    this.input.updateInputFromPointer();
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.state.lastFrame) / 1000 || 0.016);
    this.state.lastFrame = now;

    this.renderer.draw(now / 1000);
    emitPersistentEffects({ state: this.state, particles: this.particles, dt });
    this.particles.update(dt);
    this.particles.draw(this.state.camera);

    requestAnimationFrame((nextNow) => this.frame(nextNow));
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (const canvas of [this.gameCanvas, this.fxCanvas]) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    this.state.camera.dpr = dpr;
    updateCamera(this.state.camera, width, height, this.world);
    this.particles.resize();
  }
}
