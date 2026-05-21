# Co-op Archero Starter

A tiny no-framework JavaScript demo for an Archero-like co-op arena:

- raw Node HTTP server
- raw WebSocket upgrade/frame handling (no Socket.io, no `ws` dependency)
- authoritative server-side player/projectile state
- browser 2D canvas for the arena and placeholder characters
- raw WebGL shader layer for additive particles, spell auras, arrow trails, and wall impacts

## Run

```bash
node server.js
```

`npm start` also works in normal Node/npm environments because it just calls `node server.js`.

Then open:

```text
http://localhost:3000
```

Open a second tab/window to see another co-op player join.

## Controls

- **Move:** hold/click-drag/touch in a direction relative to your hero.
- **Shoot:** release to stand still; the server auto-fires arrows along your last aim direction.
- Arrows stick briefly when their tips hit the arena walls.

## File map

```text
server.js          # static server + raw WebSocket game loop
public/index.html # canvas + HUD
public/style.css  # layout / HUD styling
public/game.js    # rendering, input, websocket client, WebGL particle shader
```

## Next milestone hook: enemy waves

The server is already authoritative, so the next milestone should fit cleanly into `server.js`:

1. Add an `enemies` `Map` next to `players` and `arrows`.
2. Add wave spawning in `gameTick()` when `enemies.size === 0`.
3. Move enemies toward the nearest player.
4. On arrow/enemy overlap, increment `enemy.hits`; remove after `hits >= 2`.
5. Include `enemies` in `snapshot()` and draw them in `public/game.js`.

Because arrows are owned by the server already, hit detection can stay server-side and all clients will see the same deaths.
