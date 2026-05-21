// Expansion points. These registries start tiny, but keep later additions from
// turning into one giant file. Enemy classes, levels, skills, and particle
// interactions can register data/handlers here and the game loop can stay stable.

export const levels = new Map();
export const skills = new Map();
export const enemyTypes = new Map();
export const particleInteractions = new Map();

export function registerLevel(definition) {
  levels.set(definition.id, definition);
}

export function registerSkill(definition) {
  skills.set(definition.id, definition);
}

export function registerEnemyType(definition) {
  enemyTypes.set(definition.id, definition);
}

export function registerParticleInteraction(definition) {
  particleInteractions.set(definition.id, definition);
}

registerLevel({
  id: 'training-arena',
  name: 'Training Arena',
  world: { width: 1280, height: 720 },
  background: 'arcane-grid',
});

registerSkill({
  id: 'basic-bow',
  name: 'Basic Bow',
  projectile: 'arrow',
  cooldown: 0.48,
});

registerParticleInteraction({
  id: 'wall-impact-repel',
  name: 'Wall Impact Repel',
  description: 'Arrow wall impacts briefly repel nearby particles.',
});
