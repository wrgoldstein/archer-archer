'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const WORLD = { width: 1280, height: 720 };
const PLAYER_SPEED = 245;
const ARROW_SPEED = 650;
const ARROW_TTL = 1.35;
const FIRE_COOLDOWN = 0.48;
const FIRE_GRACE_AFTER_MOVING = 0.16;
const SNAPSHOT_HZ = 30;

const clients = new Map(); // id -> client
const players = new Map(); // id -> player
const arrows = new Map(); // id -> projectile

let nextPlayerId = 1;
let nextArrowId = 1;
let lastTick = nowSeconds();
let lastSnapshot = 0;

const colors = [
  '#7dd3fc',
  '#f0abfc',
  '#86efac',
  '#fde68a',
  '#fca5a5',
  '#c4b5fd',
  '#67e8f9',
  '#fdba74',
];

const server = http.createServer((req, res) => {
  serveStatic(req, res);
});

server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'),
  );

  attachClient(socket);
});

server.listen(PORT, () => {
  console.log(`Co-op Archero starter running at http://localhost:${PORT}`);
});

setInterval(gameTick, 1000 / 60);

function attachClient(socket) {
  socket.setNoDelay(true);

  const id = String(nextPlayerId++);
  const spawn = spawnPoint(players.size);
  const color = colors[(Number(id) - 1) % colors.length];

  const client = {
    id,
    socket,
    buffer: Buffer.alloc(0),
    alive: true,
  };
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

  clients.set(id, client);
  players.set(id, player);

  send(client, {
    type: 'welcome',
    id,
    world: WORLD,
    fireCooldown: FIRE_COOLDOWN,
  });
  broadcast({ type: 'joined', id, name: player.name, color });

  socket.on('data', (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    parseFrames(client);
  });

  socket.on('close', () => disconnect(id));
  socket.on('end', () => disconnect(id));
  socket.on('error', () => disconnect(id));
}

function disconnect(id) {
  const client = clients.get(id);
  if (!client) return;
  client.alive = false;
  clients.delete(id);
  players.delete(id);

  // Drop orphaned projectiles so reconnects do not leave noisy state forever.
  for (const [arrowId, arrow] of arrows) {
    if (arrow.ownerId === id) arrows.delete(arrowId);
  }

  broadcast({ type: 'left', id });
}

function handleMessage(client, message) {
  let data;
  try {
    data = JSON.parse(message);
  } catch {
    return;
  }

  const player = players.get(client.id);
  if (!player || data.type !== 'input') return;

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

function gameTick() {
  const t = nowSeconds();
  const dt = Math.min(0.05, t - lastTick);
  lastTick = t;

  for (const player of players.values()) {
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
      spawnArrow(player, t);
    }
  }

  for (const [id, arrow] of arrows) {
    arrow.age += dt;
    arrow.x += arrow.vx * dt;
    arrow.y += arrow.vy * dt;
    if (
      arrow.age > ARROW_TTL ||
      arrow.x < -60 ||
      arrow.y < -60 ||
      arrow.x > WORLD.width + 60 ||
      arrow.y > WORLD.height + 60
    ) {
      arrows.delete(id);
    }
  }

  if (t - lastSnapshot >= 1 / SNAPSHOT_HZ) {
    lastSnapshot = t;
    broadcast(snapshot(t));
  }
}

function spawnArrow(player, t) {
  const angle = Number.isFinite(player.aimAngle) ? player.aimAngle : 0;
  const muzzleOffset = 28;
  const id = String(nextArrowId++);
  arrows.set(id, {
    id,
    ownerId: player.id,
    x: player.x + Math.cos(angle) * muzzleOffset,
    y: player.y + Math.sin(angle) * muzzleOffset,
    vx: Math.cos(angle) * ARROW_SPEED,
    vy: Math.sin(angle) * ARROW_SPEED,
    angle,
    age: 0,
  });
  player.lastShotAt = t;
}

function snapshot(t) {
  return {
    type: 'snapshot',
    t,
    players: [...players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: round(p.x),
      y: round(p.y),
      moving: p.moving,
      aimAngle: round(p.aimAngle),
    })),
    arrows: [...arrows.values()].map((a) => ({
      id: a.id,
      ownerId: a.ownerId,
      x: round(a.x),
      y: round(a.y),
      vx: round(a.vx),
      vy: round(a.vy),
      angle: round(a.angle),
      age: round(a.age),
    })),
  };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': mimeType(filePath) });
    res.end(data);
  });
}

function parseFrames(client) {
  let buffer = client.buffer;

  while (buffer.length >= 2) {
    const first = buffer[0];
    const second = buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (buffer.length < offset + 2) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) break;
      const high = buffer.readUInt32BE(offset);
      const low = buffer.readUInt32BE(offset + 4);
      offset += 8;
      if (high !== 0) {
        closeSocket(client.socket);
        return;
      }
      length = low;
    }

    if (!masked) {
      closeSocket(client.socket);
      return;
    }

    if (buffer.length < offset + 4 + length) break;

    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.alloc(length);
    for (let i = 0; i < length; i += 1) {
      payload[i] = buffer[offset + i] ^ mask[i % 4];
    }
    buffer = buffer.subarray(offset + length);

    if (opcode === 0x8) {
      closeSocket(client.socket);
      return;
    }
    if (opcode === 0x9) {
      sendFrame(client.socket, payload, 0xA);
      continue;
    }
    if (opcode === 0x1) {
      handleMessage(client, payload.toString('utf8'));
    }
  }

  client.buffer = buffer;
}

function send(client, data) {
  if (!client.alive || client.socket.destroyed) return;
  sendFrame(client.socket, Buffer.from(JSON.stringify(data)), 0x1);
}

function broadcast(data) {
  for (const client of clients.values()) send(client, data);
}

function sendFrame(socket, payload, opcode = 0x1) {
  if (socket.destroyed) return;
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(length, 6);
  }
  socket.write(Buffer.concat([header, payload]));
}

function closeSocket(socket) {
  try {
    socket.end();
  } catch {
    socket.destroy();
  }
}

function spawnPoint(index) {
  const ring = 90;
  const angle = (index / 8) * Math.PI * 2;
  return {
    x: WORLD.width / 2 + Math.cos(angle) * ring,
    y: WORLD.height / 2 + Math.sin(angle) * ring,
  };
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream'
  );
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
