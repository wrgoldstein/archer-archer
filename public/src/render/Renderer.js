import { worldToScreen } from '../core/camera.js';
import { withAlpha } from '../core/math.js';
import { ownerColor } from '../particles/ShaderParticleSystem.js';

export class Renderer {
  constructor({ canvas, state, world }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;
    this.world = world;
  }

  draw(time) {
    const { dpr } = this.state.camera;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

    this.drawArenaBackground(time);
    this.drawPointerGuide();

    for (const arrow of this.state.arrows.values()) this.drawArrow(arrow, time);
    for (const player of this.state.players.values()) this.drawPlayer(player, time);

    ctx.restore();
  }

  drawArenaBackground(time) {
    const ctx = this.ctx;
    const c = this.state.camera;
    const world = this.world;
    const left = c.offsetX;
    const top = c.offsetY;
    const width = world.width * c.scale;
    const height = world.height * c.scale;

    ctx.save();
    ctx.translate(left, top);
    ctx.scale(c.scale, c.scale);

    const gradient = ctx.createRadialGradient(
      world.width * 0.5,
      world.height * 0.48,
      20,
      world.width * 0.5,
      world.height * 0.5,
      world.width * 0.72,
    );
    gradient.addColorStop(0, '#172036');
    gradient.addColorStop(0.55, '#101827');
    gradient.addColorStop(1, '#0a0f1d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#3b4a67';
    ctx.lineWidth = 1;
    const grid = 64;
    for (let x = 0; x <= world.width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, world.height);
      ctx.stroke();
    }
    for (let y = 0; y <= world.height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(world.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 18 + Math.sin(time * 2.2) * 4;
    ctx.shadowColor = '#22d3ee';
    ctx.strokeRect(2, 2, world.width - 4, world.height - 4);

    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.fillRect(0, 0, this.canvas.clientWidth, top);
    ctx.fillRect(0, top + height, this.canvas.clientWidth, this.canvas.clientHeight - top - height);
    ctx.fillRect(0, top, left, height);
    ctx.fillRect(left + width, top, this.canvas.clientWidth - left - width, height);
    ctx.restore();
  }

  drawPointerGuide() {
    const me = this.state.players.get(this.state.myId);
    if (!me || !this.state.pointer.active) return;

    const ctx = this.ctx;
    const hero = worldToScreen(this.state.camera, me.x, me.y);
    const pointer = worldToScreen(this.state.camera, this.state.pointer.worldX, this.state.pointer.worldY);

    ctx.save();
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.52)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 8]);
    ctx.beginPath();
    ctx.moveTo(hero.x, hero.y);
    ctx.lineTo(pointer.x, pointer.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(125, 211, 252, 0.17)';
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPlayer(player, time) {
    const ctx = this.ctx;
    const p = worldToScreen(this.state.camera, player.x, player.y);
    const scale = this.state.camera.scale;
    const radius = 19 * scale;
    const angle = Number.isFinite(player.aimAngle) ? player.aimAngle : 0;
    const color = player.color || '#7dd3fc';
    const isMe = player.id === this.state.myId;

    ctx.save();
    ctx.translate(p.x, p.y);

    if (!player.moving) {
      ctx.strokeStyle = withAlpha(color, 0.46);
      ctx.lineWidth = 3 * scale;
      ctx.shadowBlur = 22 * scale;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 8 * scale + Math.sin(time * 7) * 2 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.rotate(angle);
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = isMe ? '#ffffff' : color;
    ctx.lineWidth = isMe ? 3 * scale : 2 * scale;
    ctx.shadowBlur = isMe ? 18 * scale : 10 * scale;
    ctx.shadowColor = color;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(radius + 10 * scale, 0);
    ctx.lineTo(3 * scale, -9 * scale);
    ctx.lineTo(3 * scale, 9 * scale);
    ctx.closePath();
    ctx.fill();

    ctx.rotate(-angle);
    ctx.font = `${12 * scale}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#ffffff' : '#dbeafe';
    ctx.shadowBlur = 0;
    ctx.fillText(isMe ? 'YOU' : player.name, 0, -30 * scale);
    ctx.restore();
  }

  drawArrow(arrow, time) {
    const ctx = this.ctx;
    const p = worldToScreen(this.state.camera, arrow.x, arrow.y);
    const scale = this.state.camera.scale;
    const angle = Number.isFinite(arrow.angle) ? arrow.angle : Math.atan2(arrow.vy, arrow.vx);
    const color = ownerColor(this.state, arrow.ownerId);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.shadowColor = color;
    ctx.shadowBlur = 16 * scale;

    const pulse = arrow.stuck ? 1 : 1 + Math.sin(time * 28 + Number(arrow.id)) * 0.05;
    ctx.scale(scale * pulse, scale);

    const tailX = arrow.stuck ? -18 : -34;
    const trail = ctx.createLinearGradient(tailX, 0, 16, 0);
    trail.addColorStop(0, 'rgba(251, 191, 36, 0)');
    trail.addColorStop(0.4, withAlpha(color, arrow.stuck ? 0.16 : 0.34));
    trail.addColorStop(1, 'rgba(254, 240, 138, 0.95)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = arrow.stuck ? 4 : 5;
    ctx.beginPath();
    ctx.moveTo(tailX, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();

    ctx.fillStyle = '#fff7ad';
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(7, -7);
    ctx.lineTo(10, 0);
    ctx.lineTo(7, 7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
