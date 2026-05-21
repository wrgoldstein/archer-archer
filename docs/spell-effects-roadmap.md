# Spell & Shader Effects Roadmap

Recommended next spells and effects for the co-op Archero starter.

## Guiding principle

Build spells around **distinct visual grammars**, not just “more particles.” Each spell/upgrade should have a recognizable:

- silhouette
- color ramp
- motion behavior
- particle interaction rule
- gameplay identity

## Top spell recommendations

### 1. Chain Lightning

**Gameplay**

- Arrow or spell hits one enemy, then arcs to 2–4 nearby enemies.
- Damage falls off per jump.

**Visual**

- Jagged electric bolt between targets.
- Short-lived branching tendrils.
- Blue-white core, cyan glow, violet fringe.

**Shader/effects approach**

- Render bolt segments as screen-space quads or polylines.
- Fragment shader uses:
  - scrolling noise
  - distance-to-centerline glow
  - flicker using time + segment seed
- Add small particle bursts at each jump point.

**Why it’s good**

- Very readable.
- Feels powerful even with simple enemies.
- Introduces target-to-target spell logic.

---

### 2. Fireball / Meteor

**Gameplay**

- Slow projectile with area-of-effect explosion.
- Can ignite enemies for damage-over-time later.

**Visual**

- Big smoky fireball with a bright white-hot core.
- On hit: expanding shockwave ring + flame burst + embers.

**Shader/effects approach**

- Projectile: layered procedural fire particle sprites, like current fire arrows but bigger.
- Explosion:
  - expanding circle mesh or full-screen-ish quad clipped to radius
  - radial gradient + turbulent noise
  - additive orange core
  - dark smoke particles after the flash

**Why it’s good**

- Natural next step from fire arrows.
- Lets us add AoE collision server-side.
- Visually satisfying.

---

### 3. Frost Nova

**Gameplay**

- Radial pulse around the player.
- Slows/freezes enemies in range.

**Visual**

- Expanding icy ring.
- Snowflake shards.
- Enemies get a blue crystalline overlay/aura while slowed.

**Shader/effects approach**

- Draw an expanding ring with:
  - radial distance mask
  - angular crack noise
  - blue/white Fresnel-ish edge
- Spawn sharp shard particles moving outward.
- For frozen enemies, add cyan outline and small orbiting ice motes.

**Why it’s good**

- Adds crowd-control mechanics.
- Very visually different from fire.
- Good test of status effects.

---

### 4. Poison Cloud

**Gameplay**

- Creates a lingering area that damages enemies over time.
- Could be fired as an arrow modifier or dropped as a spell.

**Visual**

- Green/purple smoky cloud.
- Swirling turbulent blobs.
- Bubbles popping inside.

**Shader/effects approach**

- Use semi-transparent particles with lower additive, maybe alpha blending instead of pure additive.
- Fragment shader:
  - fractal noise
  - soft circle mask
  - time-scrolling swirl
- Add force-field “vortex” behavior so nearby particles curl into the cloud.

**Why it’s good**

- Introduces persistent zones.
- Great use case for particle interaction fields.
- Makes the arena feel more dynamic.

---

### 5. Void Orb / Gravity Well

**Gameplay**

- A black hole projectile or placed orb that pulls enemies inward.
- Damages over time or explodes at the end.

**Visual**

- Dark center with bright purple accretion ring.
- Nearby particles spiral inward.
- Enemies/particles get visibly dragged.

**Shader/effects approach**

- Perfect fit for the existing force-field system.
- Add a long-lived `vortex` + `attract` field.
- Render orb as:
  - black center
  - rotating ring
  - noisy purple corona
- Could later add screen-space distortion, but not necessary yet.

**Why it’s probably the coolest next effect**

- It uses particle interactions directly.
- It changes gameplay and visuals at the same time.
- It makes the shader layer feel “alive.”

## Recommended next spell

Implement **Void Orb / Gravity Well** next.

Reason: it exercises the architecture we built:

- server-side spell/projectile/entity state
- client-side persistent particle effects
- particle force fields
- enemy movement/position interaction
- visually dramatic shader work

A satisfying first version:

### Gravity Well upgrade

A black-purple orb appears as a pickup. When collected:

- Every N shots, the player fires a void orb instead of an arrow.
- Void orb travels slowly.
- When it stops or hits a wall/enemy, it becomes a gravity well for 2 seconds.
- Nearby enemies are pulled toward it.
- Nearby particles spiral inward.
- Then it pops with a violet shockwave.

Visual stack:

- dark orb core
- rotating purple ring
- inward spiral particles
- violet shockwave ring on collapse
- enemy pull movement

## Shader style roadmap

Current particle shader styles:

```js
style: 'arcane' | 'fire'
```

Recommended future styles:

```js
style: 'arcane' | 'fire' | 'ice' | 'poison' | 'void' | 'electric'
```

Each style should own:

- color ramp
- shape mask
- noise behavior
- motion assumptions

### `fire`

Already started:

- teardrop mask
- upward turbulence
- white-hot core

### `electric`

- thin branching line sprites
- harsh flicker
- high contrast blue/white
- no soft smoke

### `ice`

- crystalline/star masks
- sharp edges
- low noise
- cyan/white ramp

### `poison`

- soft cloudy alpha
- green/purple noise
- lower brightness
- bubbly internal masks

### `void`

- inverted/dark center
- purple rim
- spiral angular noise
- alpha hole in center

## Implementation order

1. **Add spell event snapshots**

   Right now the client infers effects from arrows/upgrades. For bigger spells, the server should emit short-lived events:

   ```js
   effects: [
     { type: 'enemy-hit', x, y, style: 'fire' },
     { type: 'void-pop', x, y, radius },
     { type: 'chain-lightning', points: [...] }
   ]
   ```

2. **Add generic server-side status effects**

   ```js
   enemy.statuses = {
     burning: { until, damagePerSecond },
     chilled: { until, slowMultiplier },
     shocked: { until }
   }
   ```

3. **Add persistent spell entities**

   ```js
   spells: Map
   // void wells, poison clouds, frost zones, meteors
   ```

4. **Add shader particle styles**

   Recommended order:

   - `void`
   - `electric`
   - `ice`
   - `poison`

5. **Add one big spell at a time**

   Recommended order:

   - Gravity Well
   - Chain Lightning
   - Frost Nova
   - Poison Cloud

## Maximum “wow” per effort

Do these in order:

1. **Enemy hit/death effect events**
   - Fire enemies explode in flame particles.
   - Normal enemies pop into pink slime particles.

2. **Void Orb / Gravity Well**
   - Best use of particle interactions.

3. **Chain Lightning**
   - Huge visual payoff.
   - Good contrast with fire/void.

4. **Frost Nova**
   - Adds control gameplay.

5. **Poison Cloud**
   - Adds persistent area-denial gameplay.

## Final recommendation

Next implement:

1. Enemy hit/death effect events.
2. Void Orb / Gravity Well.
