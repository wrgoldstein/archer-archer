export const VERTEX_SHADER = `
attribute vec2 a_position;
attribute float a_size;
attribute vec4 a_color;

uniform vec2 u_resolution;

varying vec4 v_color;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}
`;

export const FRAGMENT_SHADER = `
precision mediump float;

varying vec4 v_color;

void main() {
  vec2 uv = gl_PointCoord.xy - vec2(0.5);
  float d = length(uv);
  float halo = smoothstep(0.52, 0.0, d);
  float core = smoothstep(0.22, 0.0, d);
  float ring = smoothstep(0.44, 0.30, d) * smoothstep(0.18, 0.31, d);
  vec3 color = v_color.rgb * (0.55 + core * 1.8) + ring * vec3(0.55, 0.85, 1.0);
  gl_FragColor = vec4(color, v_color.a * halo);
}
`;
