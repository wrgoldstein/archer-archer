'use strict';

const http = require('node:http');
const path = require('node:path');

const config = require('./src/server/config');
const { createStaticHandler } = require('./src/server/static');
const { createWebSocketHub } = require('./src/server/websocket');
const { GameWorld } = require('./src/server/world');

const PUBLIC_DIR = path.join(__dirname, 'public');

let hub;
const world = new GameWorld({
  broadcast: (message) => hub.broadcast(message),
});

const server = http.createServer(createStaticHandler(PUBLIC_DIR));
hub = createWebSocketHub({ server, world, worldConfig: config });

server.listen(config.PORT, () => {
  console.log(`Co-op Archero starter running at http://localhost:${config.PORT}`);
});

setInterval(() => world.tick(), 1000 / 60);
