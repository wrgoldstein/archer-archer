# Co-op Archero Starter

A tiny no-framework JavaScript demo for an Archero-like co-op arena:

- raw Node HTTP server
- raw WebSocket upgrade/frame handling (no Socket.io, no `ws` dependency)
- authoritative server-side player/projectile state
- browser 2D canvas for the arena and placeholder characters
- raw WebGL shader layer for additive particles, spell auras, arrow trails, wall impacts, and particle force fields

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

## Project layout

```text
server.js                    # small boot file: HTTP + game world + websocket hub
src/server/config.js         # server-side tuning constants
src/server/static.js         # static file serving
src/server/websocket.js      # raw websocket hub / framing
src/server/world.js          # authoritative game world: players, arrows, snapshots

public/index.html            # canvas + HUD
public/style.css             # layout / HUD styling
public/src/main.js           # browser entrypoint
public/src/game/             # client orchestration, state, registries
public/src/input/            # pointer/touch input
public/src/network/          # websocket client
public/src/render/           # 2D canvas arena/player/projectile renderer
public/src/particles/        # WebGL particle shader, effects, force-field interactions
public/src/core/             # math/camera helpers
```

`public/game.js` remains as a tiny compatibility shim that imports `public/src/main.js`.

## Expansion points

The code is now split so new systems have obvious homes:

- **More levels:** add level definitions to `public/src/game/registries.js`, then let the server include level IDs / map data in `welcome` or snapshots.
- **More skills:** register skill metadata in `registries.js`; put server-authoritative cooldowns/projectile spawning in `src/server/world.js` or a future `src/server/skills/` folder.
- **More enemies:** add an authoritative `enemies` collection to `GameWorld`, include it in `snapshot()`, then add drawing in `Renderer`.
- **Particle interactions:** `ShaderParticleSystem` now has `addForceField({ x, y, radius, strength, mode, life })` with `attract`, `repel`, and `vortex` modes. Wall impacts already use a short repel field, so future spells can push/pull/swirl existing particles without coupling to rendering.

## Next milestone hook: enemy waves

The server is already authoritative, so enemy waves should fit cleanly into `src/server/world.js`:

1. Add an `enemies` `Map` next to `players` and `arrows`.
2. Add wave spawning in `tick()` when `enemies.size === 0`.
3. Move enemies toward the nearest player.
4. On arrow/enemy overlap, increment `enemy.hits`; remove after `hits >= 2`.
5. Include `enemies` in `snapshot()` and draw them in `public/src/render/Renderer.js`.

Because arrows are owned by the server already, hit detection can stay server-side and all clients will see the same deaths.
