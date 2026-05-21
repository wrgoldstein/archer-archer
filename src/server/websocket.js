'use strict';

const crypto = require('node:crypto');

function createWebSocketHub({ server, world, worldConfig }) {
  const clients = new Map();

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

  function attachClient(socket) {
    socket.setNoDelay(true);

    const player = world.addPlayer();
    const client = {
      id: player.id,
      socket,
      buffer: Buffer.alloc(0),
      alive: true,
    };

    clients.set(client.id, client);

    send(client, {
      type: 'welcome',
      id: client.id,
      world: worldConfig.WORLD,
      fireCooldown: worldConfig.FIRE_COOLDOWN,
    });
    broadcast({ type: 'joined', id: player.id, name: player.name, color: player.color });

    socket.on('data', (chunk) => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      parseFrames(client, (message) => {
        let data;
        try {
          data = JSON.parse(message);
        } catch {
          return;
        }
        if (data.type === 'input') world.handleInput(client.id, data);
      });
    });

    socket.on('close', () => disconnect(client.id));
    socket.on('end', () => disconnect(client.id));
    socket.on('error', () => disconnect(client.id));
  }

  function disconnect(id) {
    const client = clients.get(id);
    if (!client) return;
    client.alive = false;
    clients.delete(id);
    world.removePlayer(id);
    broadcast({ type: 'left', id });
  }

  function send(client, data) {
    if (!client.alive || client.socket.destroyed) return;
    sendFrame(client.socket, Buffer.from(JSON.stringify(data)), 0x1);
  }

  function broadcast(data) {
    for (const client of clients.values()) send(client, data);
  }

  return { broadcast, clients };
}

function parseFrames(client, onMessage) {
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
    if (opcode === 0x1) onMessage(payload.toString('utf8'));
  }

  client.buffer = buffer;
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

module.exports = { createWebSocketHub };
