# Co-op Archero Starter

A tiny no-framework JavaScript demo for an Archero-like co-op arena:

- raw Node HTTP server
- raw WebSocket upgrade/frame handling (no Socket.io, no `ws` dependency)
- authoritative server-side player/projectile/enemy state
- wave-based slime enemies with health bars
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
- **Shoot:** release to stand still. Your hero auto-acquires the nearest enemy and only shoots when a target exists.
- Arrows stick briefly when their tips hit the arena walls.
- Enemies have 2 HP and die after 2 arrow hits.

## Project layout

```text
server.js                    # small boot file: HTTP + game world + websocket hub
src/server/config.js         # server-side tuning constants
src/server/static.js         # static file serving
src/server/websocket.js      # raw websocket hub / framing
src/server/world.js          # authoritative game world: players, arrows, enemies, waves, snapshots

public/index.html            # canvas + HUD
public/style.css             # layout / HUD styling
public/src/main.js           # browser entrypoint
public/src/game/             # client orchestration, state, registries
public/src/input/            # pointer/touch input
public/src/network/          # websocket client
public/src/render/           # 2D canvas arena/player/projectile/enemy renderer
public/src/particles/        # WebGL particle shader, effects, force-field interactions
public/src/core/             # math/camera helpers
```

`public/game.js` remains as a tiny compatibility shim that imports `public/src/main.js`.

## Expansion points

The code is now split so new systems have obvious homes:

- **More levels:** add level definitions to `public/src/game/registries.js`, then let the server include level IDs / map data in `welcome` or snapshots.
- **More skills:** register skill metadata in `registries.js`; put server-authoritative cooldowns/projectile spawning in `src/server/world.js` or a future `src/server/skills/` folder.
- **More enemies:** expand the authoritative `enemies` collection in `GameWorld`, include any new state in `snapshot()`, then add drawing in `Renderer`.
- **Particle interactions:** `ShaderParticleSystem` now has `addForceField({ x, y, radius, strength, mode, life })` with `attract`, `repel`, and `vortex` modes. Wall impacts already use a short repel field, so future spells can push/pull/swirl existing particles without coupling to rendering.

## Current enemy-wave behavior

- A wave starts after a short delay once at least one player is connected.
- Each wave spawns slimes around the arena edges.
- Slimes walk toward the nearest player and stop just outside the player body.
- Standing players auto-acquire the nearest slime.
- Players do **not** fire if there are no enemies.
- Arrows damage enemies server-side; enemies die after 2 hits.
- The next wave starts shortly after the previous wave is cleared.

## Good next milestones

- Add player damage / lives when enemies touch players.
- Move enemy definitions into `src/server/enemies/` once there are multiple enemy types.
- Add skill definitions with server-side cooldowns and projectile patterns.
- Add enemy hit/death particle events to snapshots so all clients render synchronized bursts.
