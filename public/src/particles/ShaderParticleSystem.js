import { clamp, smoothstep } from '../core/math.js';
import { worldToScreen } from '../core/camera.js';
import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders.js';

// This is intentionally its own subsystem. Later skills/spells can register emitters
// and force fields here without knowing about canvas rendering or network snapshots.
export class ShaderParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    this.items = [];
    this.forceFields = [];
    this.count = 0;

    if (!this.gl) {
      console.warn('WebGL unavailable; particle shader layer disabled.');
      return;
    }

    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.buffer = this.gl.createBuffer();
    this.locations = {
      position: this.gl.getAttribLocation(this.program, 'a_position'),
      size: this.gl.getAttribLocation(this.program, 'a_size'),
      color: this.gl.getAttribLocation(this.program, 'a_color'),
      style: this.gl.getAttribLocation(this.program, 'a_style'),
      seed: this.gl.getAttribLocation(this.program, 'a_seed'),
      resolution: this.gl.getUniformLocation(this.program, 'u_resolution'),
      time: this.gl.getUniformLocation(this.program, 'u_time'),
    };
  }

  resize() {
    if (!this.gl) return;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  spawn({ x, y, vx, vy, size, color, life, layer = 'fx', mass = 1, style = 'arcane' }) {
    if (!this.gl) return;
    if (this.items.length > 1400) this.items.splice(0, 60);
    this.items.push({
      x,
      y,
      vx,
      vy,
      size,
      color,
      life,
      maxLife: life,
      layer,
      mass,
      style: style === 'fire' ? 1 : 0,
      seed: Math.random() * 1000,
    });
    this.count = this.items.length;
  }

  addForceField({ x, y, radius, strength, mode = 'attract', life = 0.25 }) {
    this.forceFields.push({ x, y, radius, strength, mode, life, maxLife: life });
  }

  update(dt) {
    if (!this.gl) return;

    for (let i = this.forceFields.length - 1; i >= 0; i -= 1) {
      const field = this.forceFields[i];
      field.life -= dt;
      if (field.life <= 0) this.forceFields.splice(i, 1);
    }

    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }

      this.applyForceFields(p, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 - 6 * dt;
    }
    this.count = this.items.length;
  }

  applyForceFields(p, dt) {
    for (const field of this.forceFields) {
      const dx = field.x - p.x;
      const dy = field.y - p.y;
      const distance = Math.hypot(dx, dy) || 0.0001;
      if (distance > field.radius) continue;

      const falloff = 1 - smoothstep(0, field.radius, distance);
      const force = (field.strength * falloff * dt) / Math.max(0.2, p.mass);
      const nx = dx / distance;
      const ny = dy / distance;

      if (field.mode === 'repel') {
        p.vx -= nx * force;
        p.vy -= ny * force;
      } else if (field.mode === 'vortex') {
        p.vx += -ny * force;
        p.vy += nx * force;
      } else {
        p.vx += nx * force;
        p.vy += ny * force;
      }
    }
  }

  draw(camera, time = 0) {
    if (!this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.items.length === 0) return;

    const stride = 9;
    const data = new Float32Array(this.items.length * stride);
    for (let i = 0; i < this.items.length; i += 1) {
      const p = this.items[i];
      const screen = worldToScreen(camera, p.x, p.y);
      const t = p.life / p.maxLife;
      const offset = i * stride;
      data[offset + 0] = screen.x * camera.dpr;
      data[offset + 1] = screen.y * camera.dpr;
      data[offset + 2] = p.size * camera.scale * camera.dpr * (0.65 + t * 0.8);
      data[offset + 3] = p.color[0] / 255;
      data[offset + 4] = p.color[1] / 255;
      data[offset + 5] = p.color[2] / 255;
      data[offset + 6] = p.color[3] * smoothstep(0, 0.25, t);
      data[offset + 7] = p.style;
      data[offset + 8] = p.seed;
    }

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.locations.time, time);

    const byteStride = stride * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, byteStride, 0);
    gl.enableVertexAttribArray(this.locations.size);
    gl.vertexAttribPointer(this.locations.size, 1, gl.FLOAT, false, byteStride, 2 * 4);
    gl.enableVertexAttribArray(this.locations.color);
    gl.vertexAttribPointer(this.locations.color, 4, gl.FLOAT, false, byteStride, 3 * 4);
    gl.enableVertexAttribArray(this.locations.style);
    gl.vertexAttribPointer(this.locations.style, 1, gl.FLOAT, false, byteStride, 7 * 4);
    gl.enableVertexAttribArray(this.locations.seed);
    gl.vertexAttribPointer(this.locations.seed, 1, gl.FLOAT, false, byteStride, 8 * 4);

    gl.drawArrays(gl.POINTS, 0, this.items.length);
  }

  createProgram(vertexSource, fragmentSource) {
    const gl = this.gl;
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Unable to link particle shader program');
    }
    return program;
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Unable to compile particle shader');
    }
    return shader;
  }
}

export function ownerColor(state, ownerId) {
  return state.players.get(ownerId)?.color || '#fbbf24';
}

export function particleBudgetOk(particles, state) {
  const particleBudget = state.players.size * 3 + state.arrows.size * 3;
  return particles.count <= 1100 && particleBudget > 0;
}

export function burst(particles, { x, y, color, count, angle = 0, spread = Math.PI, speed = [40, 180], size = [7, 24], life = [0.16, 0.52], direction = 1 }) {
  for (let i = 0; i < count; i += 1) {
    const theta = angle + spread * (Math.random() - 0.5) * direction;
    const v = speed[0] + Math.random() * (speed[1] - speed[0]);
    particles.spawn({
      x: x + (Math.random() * 14 - 7),
      y: y + (Math.random() * 14 - 7),
      vx: Math.cos(theta) * v,
      vy: Math.sin(theta) * v,
      size: size[0] + Math.random() * (size[1] - size[0]),
      color,
      life: life[0] + Math.random() * (life[1] - life[0]),
    });
  }
}

export { clamp };
