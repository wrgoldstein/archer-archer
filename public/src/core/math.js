export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function hexToRgb(hex, alpha = 1) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean,
    16,
  );
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}

export function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex, 1);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
