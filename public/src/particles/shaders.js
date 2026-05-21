export const VERTEX_SHADER = `
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;
attribute float a_style;
attribute float a_seed;

uniform vec2 u_resolution;
uniform float u_time;

varying vec4 v_color;
varying float v_style;
varying float v_seed;
varying float v_time;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
  v_style = a_style;
  v_seed = a_seed;
  v_time = u_time;
}
`;

export const FRAGMENT_SHADER = `
precision mediump float;

varying vec4 v_color;
varying float v_style;
varying float v_seed;
varying float v_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec4 arcaneParticle(vec2 uv, float d) {
  float halo = smoothstep(0.52, 0.0, d);
  float core = smoothstep(0.22, 0.0, d);
  float ring = smoothstep(0.44, 0.30, d) * smoothstep(0.18, 0.31, d);
  vec3 color = v_color.rgb * (0.55 + core * 1.8) + ring * vec3(0.55, 0.85, 1.0);
  return vec4(color, v_color.a * halo);
}

vec4 fireParticle(vec2 uv) {
  // Point-sprite procedural flame: teardrop mask + scrolling value noise.
  vec2 p = uv;
  p.x += sin((p.y + v_seed) * 11.0 + v_time * 9.0) * 0.055;

  float y = gl_PointCoord.y; // 0 top, 1 bottom
  float width = mix(0.12, 0.48, smoothstep(0.0, 0.82, y));
  width *= 1.0 - smoothstep(0.72, 1.0, y) * 0.32;
  float flameBody = smoothstep(width, 0.02, abs(p.x));
  float vertical = smoothstep(0.02, 0.20, y) * smoothstep(1.05, 0.45, y);

  float n1 = valueNoise(vec2(p.x * 7.0 + v_seed * 13.0, y * 8.0 - v_time * 5.5));
  float n2 = valueNoise(vec2(p.x * 14.0 - v_time * 1.7, y * 15.0 - v_time * 9.0 + v_seed));
  float turbulence = n1 * 0.65 + n2 * 0.35;
  float lick = smoothstep(0.18, 0.95, turbulence + (1.0 - y) * 0.22);
  float alpha = flameBody * vertical * mix(0.58, 1.18, lick) * v_color.a;

  float heat = clamp((1.0 - y) * 0.85 + lick * 0.55 + (1.0 - abs(p.x) / max(width, 0.001)) * 0.35, 0.0, 1.0);
  vec3 ember = vec3(0.75, 0.06, 0.01);
  vec3 orange = vec3(1.0, 0.32, 0.02);
  vec3 gold = vec3(1.0, 0.78, 0.08);
  vec3 whiteHot = vec3(1.0, 0.96, 0.72);
  vec3 color = mix(ember, orange, smoothstep(0.05, 0.42, heat));
  color = mix(color, gold, smoothstep(0.42, 0.74, heat));
  color = mix(color, whiteHot, smoothstep(0.76, 1.0, heat));

  // Hot rim and smoke-free additive bloom.
  float rim = smoothstep(0.46, 0.10, length(uv)) * 0.35;
  color += v_color.rgb * rim;
  return vec4(color, alpha);
}

void main() {
  vec2 uv = gl_PointCoord.xy - vec2(0.5);
  float d = length(uv);
  if (v_style > 0.5) {
    gl_FragColor = fireParticle(uv);
  } else {
    gl_FragColor = arcaneParticle(uv, d);
  }
}
`;
