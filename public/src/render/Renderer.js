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

    for (const upgrade of this.state.upgrades.values()) this.drawUpgrade(upgrade, time);
    for (const enemy of this.state.enemies.values()) this.drawEnemy(enemy, time);
    for (const arrow of this.state.arrows.values()) this.drawArrow(arrow, time);
    for (const player of this.state.players.values()) this.drawPlayer(player, time);
    this.drawWaveLabel();

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

    if (!player.moving || player.tripleShot || player.fireArrows) {
      const auraColor = player.fireArrows ? '#fb923c' : player.tripleShot ? '#a78bfa' : color;
      const auraAlpha = player.fireArrows || player.tripleShot ? 0.72 : 0.46;
      ctx.strokeStyle = withAlpha(auraColor, auraAlpha);
      ctx.lineWidth = (player.fireArrows || player.tripleShot ? 4 : 3) * scale;
      ctx.shadowBlur = (player.fireArrows || player.tripleShot ? 30 : 22) * scale;
      ctx.shadowColor = auraColor;
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

  drawUpgrade(upgrade, time) {
    const ctx = this.ctx;
    const p = worldToScreen(this.state.camera, upgrade.x, upgrade.y);
    const scale = this.state.camera.scale;
    const radius = (upgrade.radius || 24) * scale;
    const pulse = 1 + Math.sin(time * 4.5 + Number(upgrade.id)) * 0.08;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    const isFire = upgrade.type === 'fire-arrows';
    const glowColor = isFire ? '#fb923c' : '#a78bfa';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 34 * scale;

    const sphere = ctx.createRadialGradient(-radius * 0.35, -radius * 0.45, radius * 0.15, 0, 0, radius * 1.15);
    sphere.addColorStop(0, '#ffffff');
    sphere.addColorStop(0.18, isFire ? '#fed7aa' : '#ddd6fe');
    sphere.addColorStop(0.58, isFire ? '#f97316' : '#8b5cf6');
    sphere.addColorStop(1, isFire ? '#7c2d12' : '#312e81');
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isFire ? 'rgba(254, 215, 170, 0.92)' : 'rgba(216, 180, 254, 0.9)';
    ctx.lineWidth = 3 * scale;
    for (let i = 0; i < 3; i += 1) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.55, radius * 0.5, time * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#f5f3ff';
    ctx.font = `${17 * scale}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.fillText(isFire ? '🔥' : '×3', 0, 1 * scale);
    ctx.restore();
  }

  drawEnemy(enemy, time) {
    const ctx = this.ctx;
    const p = worldToScreen(this.state.camera, enemy.x, enemy.y);
    const scale = this.state.camera.scale;
    const radius = (enemy.radius || 22) * scale;
    const hpRatio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
    const wobble = Math.sin(time * 5 + Number(enemy.id)) * 0.08;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1 + wobble, 1 - wobble * 0.55);

    ctx.shadowColor = '#fb7185';
    ctx.shadowBlur = 16 * scale;
    const body = ctx.createRadialGradient(-radius * 0.35, -radius * 0.45, radius * 0.2, 0, 0, radius * 1.1);
    body.addColorStop(0, '#fecdd3');
    body.addColorStop(0.45, '#fb7185');
    body.addColorStop(1, '#9f1239');
    ctx.fillStyle = body;
    ctx.strokeStyle = '#ffe4e6';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#3f0b18';
    ctx.beginPath();
    ctx.arc(-7 * scale, -3 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.arc(7 * scale, -3 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Health bar stays axis-aligned even though the slime body wobbles.
    ctx.save();
    const barWidth = 48 * scale;
    const barHeight = 6 * scale;
    const barX = p.x - barWidth / 2;
    const barY = p.y - radius - 16 * scale;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = hpRatio > 0.5 ? '#86efac' : '#fbbf24';
    if (hpRatio <= 0.25) ctx.fillStyle = '#fb7185';
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.restore();
  }

  drawWaveLabel() {
    if (!this.state.wave) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(219, 234, 254, 0.8)';
    ctx.font = '13px ui-sans-serif, system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`Wave ${this.state.wave} · ${this.state.enemies.size} enemies`, this.canvas.clientWidth - 18, 28);
    ctx.restore();
  }

  drawArrow(arrow, time) {
    const ctx = this.ctx;
    const p = worldToScreen(this.state.camera, arrow.x, arrow.y);
    const scale = this.state.camera.scale;
    const angle = Number.isFinite(arrow.angle) ? arrow.angle : Math.atan2(arrow.vy, arrow.vx);
    const color = arrow.fire ? '#fb923c' : ownerColor(this.state, arrow.ownerId);

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
    trail.addColorStop(1, arrow.fire ? 'rgba(255, 237, 213, 0.98)' : 'rgba(254, 240, 138, 0.95)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = arrow.stuck ? 4 : 5;
    ctx.beginPath();
    ctx.moveTo(tailX, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();

    ctx.fillStyle = arrow.fire ? '#fed7aa' : '#fff7ad';
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
