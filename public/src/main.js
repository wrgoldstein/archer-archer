import { ClientGame } from './game/ClientGame.js';

const game = new ClientGame({
  gameCanvas: document.querySelector('#game'),
  fxCanvas: document.querySelector('#fx'),
  statusEl: document.querySelector('#status'),
});

game.start();
