'use strict';

const gameCanvas = document.querySelector('#game');
const fxCanvas = document.querySelector('#fx');
const statusEl = document.querySelector('#status');
const ctx = gameCanvas.getContext('2d');

const world = { width: 1280, height: 720 };
const state = {
  myId: null,
  connected: false,
  players: new Map(),
  arrows: new Map(),
  knownArrowIds: new Set(),
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
  camera: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dpr: 1,
  },
  lastFrame: performance.now(),
};

let particles;
let ws;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener('open', () => {
    state.connected = true;
    setStatus('Connected. Open another browser tab for co-op.');
  });

  socket.addEventListener('close', () => {
    state.connected = false;
    setStatus('Disconnected. Refresh to reconnect.');
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'welcome') {
      state.myId = message.id;
      world.width = message.world.width;
      world.height = message.world.height;
      setStatus(`You are player ${message.id}. Open another tab for co-op.`);
    } else if (message.type === 'snapshot') {
      applySnapshot(message);
    } else if (message.type === 'joined') {
      setStatus(`Player ${message.id} joined. ${state.players.size + 1} player(s) online.`);
    } else if (message.type === 'left') {
      setStatus(`Player ${message.id} left. ${Math.max(0, state.players.size - 1)} player(s) online.`);
    }
  });

  socket.addEventListener('error', () => setStatus('WebSocket error. Is the server running?'));
  return socket;
}

function applySnapshot(snapshot) {
  state.players = new Map(snapshot.players.map((player) => [player.id, player]));
  state.arrows = new Map(snapshot.arrows.map((arrow) => [arrow.id, arrow]));

  for (const arrow of state.arrows.values()) {
    if (!state.knownArrowIds.has(arrow.id)) {
      state.knownArrowIds.add(arrow.id);
      emitMuzzleFlash(arrow.x, arrow.y, arrow.angle, ownerColor(arrow.ownerId));
    }
  }

  for (const arrowId of [...state.knownArrowIds]) {
    if (!state.arrows.has(arrowId)) state.knownArrowIds.delete(arrowId);
  }

  updateInputFromPointer();
}

function frame(now) {
  const dt = Math.min(0.05, (now - state.lastFrame) / 1000 || 0.016);
  state.lastFrame = now;

  drawBoard(now / 1000, dt);
  emitPersistentEffects(dt);
  particles.update(dt);
  particles.draw(state.camera);

  requestAnimationFrame(frame);
}

function drawBoard(time) {
  const { dpr } = state.camera;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, gameCanvas.clientWidth, gameCanvas.clientHeight);

  drawArenaBackground(time);
  drawPointerGuide();

  for (const arrow of state.arrows.values()) drawArrow(arrow, time);
  for (const player of state.players.values()) drawPlayer(player, time);

  ctx.restore();
}

function drawArenaBackground(time) {
  const c = state.camera;
  const left = c.offsetX;
  const top = c.offsetY;
  const width = world.width * c.scale;
  const height = world.height * c.scale;

  ctx.save();
  ctx.translate(left, top);
  ctx.scale(c.scale, c.scale);

  const gradient = ctx.createRadialGradient(
    world.width * 0.5,
    world.height * 0.48,
    20,
    world.width * 0.5,
    world.height * 0.5,
    world.width * 0.72,
  );
  gradient.addColorStop(0, '#172036');
  gradient.addColorStop(0.55, '#101827');
  gradient.addColorStop(1, '#0a0f1d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#3b4a67';
  ctx.lineWidth = 1;
  const grid = 64;
  for (let x = 0; x <= world.width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 4;
  ctx.shadowBlur = 18 + Math.sin(time * 2.2) * 4;
  ctx.shadowColor = '#22d3ee';
  ctx.strokeRect(2, 2, world.width - 4, world.height - 4);

  ctx.restore();

  // Letterbox outside the arena.
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
  ctx.fillRect(0, 0, gameCanvas.clientWidth, top);
  ctx.fillRect(0, top + height, gameCanvas.clientWidth, gameCanvas.clientHeight - top - height);
  ctx.fillRect(0, top, left, height);
  ctx.fillRect(left + width, top, gameCanvas.clientWidth - left - width, height);
  ctx.restore();
}

function drawPointerGuide() {
  const me = state.players.get(state.myId);
  if (!me || !state.pointer.active) return;

  const hero = worldToScreen(me.x, me.y);
  const pointer = worldToScreen(state.pointer.worldX, state.pointer.worldY);

  ctx.save();
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.52)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 8]);
  ctx.beginPath();
  ctx.moveTo(hero.x, hero.y);
  ctx.lineTo(pointer.x, pointer.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(125, 211, 252, 0.17)';
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(player, time) {
  const p = worldToScreen(player.x, player.y);
  const scale = state.camera.scale;
  const radius = 19 * scale;
  const angle = Number.isFinite(player.aimAngle) ? player.aimAngle : 0;
  const color = player.color || '#7dd3fc';
  const isMe = player.id === state.myId;

  ctx.save();
  ctx.translate(p.x, p.y);

  if (!player.moving) {
    ctx.strokeStyle = withAlpha(color, 0.46);
    ctx.lineWidth = 3 * scale;
    ctx.shadowBlur = 22 * scale;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(0, 0, (radius + 8 * scale) + Math.sin(time * 7) * 2 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.rotate(angle);
  ctx.fillStyle = '#111827';
  ctx.strokeStyle = isMe ? '#ffffff' : color;
  ctx.lineWidth = isMe ? 3 * scale : 2 * scale;
  ctx.shadowBlur = isMe ? 18 * scale : 10 * scale;
  ctx.shadowColor = color;

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Placeholder "face / bow direction" wedge.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(radius + 10 * scale, 0);
  ctx.lineTo(3 * scale, -9 * scale);
  ctx.lineTo(3 * scale, 9 * scale);
  ctx.closePath();
  ctx.fill();

  ctx.rotate(-angle);
  ctx.font = `${12 * scale}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillStyle = isMe ? '#ffffff' : '#dbeafe';
  ctx.shadowBlur = 0;
  ctx.fillText(isMe ? 'YOU' : player.name, 0, -30 * scale);
  ctx.restore();
}

function drawArrow(arrow, time) {
  const p = worldToScreen(arrow.x, arrow.y);
  const scale = state.camera.scale;
  const angle = Math.atan2(arrow.vy, arrow.vx);
  const color = ownerColor(arrow.ownerId);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.shadowColor = color;
  ctx.shadowBlur = 16 * scale;

  const pulse = 1 + Math.sin(time * 28 + Number(arrow.id)) * 0.05;
  ctx.scale(scale * pulse, scale);

  const trail = ctx.createLinearGradient(-34, 0, 16, 0);
  trail.addColorStop(0, 'rgba(251, 191, 36, 0)');
  trail.addColorStop(0.4, withAlpha(color, 0.34));
  trail.addColorStop(1, 'rgba(254, 240, 138, 0.95)');
  ctx.strokeStyle = trail;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.lineTo(14, 0);
  ctx.stroke();

  ctx.fillStyle = '#fff7ad';
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(7, -7);
  ctx.lineTo(10, 0);
  ctx.lineTo(7, 7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function emitPersistentEffects(dt) {
  const particleBudget = state.players.size * 3 + state.arrows.size * 3;
  if (particles.count > 1100 || particleBudget <= 0) return;

  for (const arrow of state.arrows.values()) {
    if (Math.random() < 0.95) {
      const angle = Math.atan2(arrow.vy, arrow.vx);
      const speed = 30 + Math.random() * 55;
      const spread = (Math.random() - 0.5) * 0.9;
      particles.spawn({
        x: arrow.x - Math.cos(angle) * 25 + rand(-4, 4),
        y: arrow.y - Math.sin(angle) * 25 + rand(-4, 4),
        vx: -Math.cos(angle + spread) * speed + rand(-20, 20),
        vy: -Math.sin(angle + spread) * speed + rand(-20, 20),
        size: rand(8, 18),
        color: hexToRgb(ownerColor(arrow.ownerId), 0.86),
        life: rand(0.16, 0.38),
      });
    }
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

function emitMuzzleFlash(x, y, angle, color) {
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

function updatePointer(event) {
  const rect = gameCanvas.getBoundingClientRect();
  const screenX = event.clientX - rect.left;
  const screenY = event.clientY - rect.top;
  const pointer = screenToWorld(screenX, screenY);
  state.pointer.worldX = pointer.x;
  state.pointer.worldY = pointer.y;
  updateInputFromPointer();
  sendInput();
}

function updateInputFromPointer() {
  const me = state.players.get(state.myId);
  if (!me) return;

  const rawDx = state.pointer.worldX - me.x;
  const rawDy = state.pointer.worldY - me.y;
  const distance = Math.hypot(rawDx, rawDy);
  if (distance > 4) state.input.aimAngle = Math.atan2(rawDy, rawDx);

  if (state.pointer.active && distance > 14) {
    state.input.dx = rawDx / distance;
    state.input.dy = rawDy / distance;
    state.input.moving = true;
  } else {
    state.input.dx = 0;
    state.input.dy = 0;
    state.input.moving = false;
  }
}

function sendInput() {
  if (!state.connected || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      type: 'input',
      dx: state.input.dx,
      dy: state.input.dy,
      moving: state.input.moving,
      aimAngle: state.input.aimAngle,
    }),
  );
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;

  for (const canvas of [gameCanvas, fxCanvas]) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  const scale = Math.min(width / world.width, height / world.height) * 0.94;
  state.camera = {
    dpr,
    scale,
    offsetX: (width - world.width * scale) / 2,
    offsetY: (height - world.height * scale) / 2,
  };
  particles.resize();
}

function worldToScreen(x, y) {
  return {
    x: state.camera.offsetX + x * state.camera.scale,
    y: state.camera.offsetY + y * state.camera.scale,
  };
}

function screenToWorld(x, y) {
  return {
    x: clamp((x - state.camera.offsetX) / state.camera.scale, 0, world.width),
    y: clamp((y - state.camera.offsetY) / state.camera.scale, 0, world.height),
  };
}

function ownerColor(ownerId) {
  return state.players.get(ownerId)?.color || '#fbbf24';
}

function setStatus(text) {
  statusEl.textContent = text;
}

function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex, 1);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex, alpha = 1) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean,
    16,
  );
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class ShaderParticleSystem {
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
      resolution: this.gl.getUniformLocation(this.program, 'u_resolution'),
    };
  }

  resize() {
    if (!this.gl) return;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  spawn({ x, y, vx, vy, size, color, life }) {
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
    });
    this.count = this.items.length;
  }

  update(dt) {
    if (!this.gl) return;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 - 6 * dt;
    }
    this.count = this.items.length;
  }

  draw(camera) {
    if (!this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.items.length === 0) return;

    const stride = 7;
    const data = new Float32Array(this.items.length * stride);
    for (let i = 0; i < this.items.length; i += 1) {
      const p = this.items[i];
      const screen = worldToScreen(p.x, p.y);
      const t = p.life / p.maxLife;
      const offset = i * stride;
      data[offset + 0] = screen.x * camera.dpr;
      data[offset + 1] = screen.y * camera.dpr;
      data[offset + 2] = p.size * camera.scale * camera.dpr * (0.65 + t * 0.8);
      data[offset + 3] = p.color[0] / 255;
      data[offset + 4] = p.color[1] / 255;
      data[offset + 5] = p.color[2] / 255;
      data[offset + 6] = p.color[3] * smoothstep(0, 0.25, t);
    }

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);

    const byteStride = stride * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, byteStride, 0);
    gl.enableVertexAttribArray(this.locations.size);
    gl.vertexAttribPointer(this.locations.size, 1, gl.FLOAT, false, byteStride, 2 * 4);
    gl.enableVertexAttribArray(this.locations.color);
    gl.vertexAttribPointer(this.locations.color, 4, gl.FLOAT, false, byteStride, 3 * 4);

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

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;

uniform vec2 u_resolution;

varying vec4 v_color;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

varying vec4 v_color;

void main() {
  vec2 uv = gl_PointCoord.xy - vec2(0.5);
  float d = length(uv);
  float halo = smoothstep(0.52, 0.0, d);
  float core = smoothstep(0.22, 0.0, d);
  float ring = smoothstep(0.44, 0.30, d) * smoothstep(0.18, 0.31, d);
  vec3 color = v_color.rgb * (0.55 + core * 1.8) + ring * vec3(0.55, 0.85, 1.0);
  gl_FragColor = vec4(color, v_color.a * halo);
}
`;

start();

function start() {
  particles = new ShaderParticleSystem(fxCanvas);
  ws = connect();

  resize();
  window.addEventListener('resize', resize);

  for (const eventName of ['pointerdown', 'pointermove']) {
    gameCanvas.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName === 'pointerdown') {
        gameCanvas.setPointerCapture(event.pointerId);
        state.pointer.active = true;
      }
      updatePointer(event);
    });
  }

  for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
    gameCanvas.addEventListener(eventName, (event) => {
      event.preventDefault();
      state.pointer.active = false;
      updateInputFromPointer();
      sendInput();
    });
  }

  setInterval(sendInput, 1000 / 30);
  requestAnimationFrame(frame);
}
