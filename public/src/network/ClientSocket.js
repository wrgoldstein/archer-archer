export class ClientSocket {
  constructor({ state, world, statusEl, onSnapshot }) {
    this.state = state;
    this.world = world;
    this.statusEl = statusEl;
    this.onSnapshot = onSnapshot;
    this.socket = null;
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.socket.addEventListener('open', () => {
      this.state.connected = true;
      this.setStatus('Connected. Open another browser tab for co-op.');
    });

    this.socket.addEventListener('close', () => {
      this.state.connected = false;
      this.setStatus('Disconnected. Refresh to reconnect.');
    });

    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'welcome') {
        this.state.myId = message.id;
        this.world.width = message.world.width;
        this.world.height = message.world.height;
        this.setStatus(`You are player ${message.id}. Open another tab for co-op.`);
      } else if (message.type === 'snapshot') {
        this.onSnapshot(message);
      } else if (message.type === 'joined') {
        this.setStatus(`Player ${message.id} joined. ${this.state.players.size + 1} player(s) online.`);
      } else if (message.type === 'left') {
        this.setStatus(`Player ${message.id} left. ${Math.max(0, this.state.players.size - 1)} player(s) online.`);
      }
    });

    this.socket.addEventListener('error', () => this.setStatus('WebSocket error. Is the server running?'));
  }

  sendInput(input) {
    if (!this.state.connected || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        type: 'input',
        dx: input.dx,
        dy: input.dy,
        moving: input.moving,
        aimAngle: input.aimAngle,
      }),
    );
  }

  setStatus(text) {
    this.statusEl.textContent = text;
  }
}
