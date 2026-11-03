import type { NodeStyleProfile } from '../types';

export function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function getNodeStyleProfile(func: string): NodeStyleProfile {
  switch (func) {
    case 'Wait':
      return {
        nameZh: '等待點',
        subZh: 'WAIT / STANDBY',
        icon: '🕒',
        themeColor: '#facc15',
        badgeBg: 'rgba(250, 204, 21, 0.25)',
        bgGradStart: 'rgba(50, 40, 10, 0.75)',
        bgGradEnd: 'rgba(20, 15, 5, 0.50)'
      };
    case 'Cargo':
    case 'Pick-up':
    case 'Drop-off':
      return {
        nameZh: '貨物站',
        subZh: 'CARGO / PALLET',
        icon: '📦',
        themeColor: '#f97316',
        badgeBg: 'rgba(249, 115, 22, 0.25)',
        bgGradStart: 'rgba(60, 25, 5, 0.75)',
        bgGradEnd: 'rgba(25, 10, 0, 0.50)'
      };
    case 'Idle/Charge':
    case 'Charge':
      return {
        nameZh: '充電站',
        subZh: 'POWER / CHARGE',
        icon: '⚡',
        themeColor: '#00f0ff',
        badgeBg: 'rgba(0, 240, 255, 0.25)',
        bgGradStart: 'rgba(0, 40, 60, 0.75)',
        bgGradEnd: 'rgba(0, 15, 25, 0.50)'
      };
    case 'Transit':
    default:
      return {
        nameZh: '交會點',
        subZh: 'TRANSIT / INTERSECT',
        icon: '🔀',
        themeColor: '#38bdf8',
        badgeBg: 'rgba(56, 189, 248, 0.25)',
        bgGradStart: 'rgba(15, 30, 65, 0.75)',
        bgGradEnd: 'rgba(5, 10, 28, 0.50)'
      };
  }
}

export function drawCadPlacementFootprint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  func: string = 'Transit'
) {
  ctx.clearRect(0, 0, w, h);

  const profile = getNodeStyleProfile(func);
  const cx = w / 2;
  const cy = h / 2;
  const pad = 24;

  // 1. Semi-transparent technical blueprint background card
  const bgGrad = ctx.createLinearGradient(pad, pad, w - pad, h - pad);
  bgGrad.addColorStop(0, profile.bgGradStart);
  bgGrad.addColorStop(1, profile.bgGradEnd);

  drawRoundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 22);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // 2. Blueprint micro-grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const gridStep = 32;
  for (let gx = pad + gridStep; gx < w - pad; gx += gridStep) {
    ctx.beginPath();
    ctx.moveTo(gx, pad);
    ctx.lineTo(gx, h - pad);
    ctx.stroke();
  }
  for (let gy = pad + gridStep; gy < h - pad; gy += gridStep) {
    ctx.beginPath();
    ctx.moveTo(pad, gy);
    ctx.lineTo(w - pad, gy);
    ctx.stroke();
  }

  // 3. Glowing bounding box
  ctx.save();
  ctx.strokeStyle = profile.themeColor;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = profile.themeColor;
  ctx.shadowBlur = 12;
  drawRoundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 22);
  ctx.stroke();
  ctx.restore();

  // Corner CAD Crosshairs
  const chLen = 22;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;

  // Top-left
  ctx.beginPath();
  ctx.moveTo(pad - 4, pad + chLen);
  ctx.lineTo(pad - 4, pad - 4);
  ctx.lineTo(pad + chLen, pad - 4);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(w - pad + 4 - chLen, pad - 4);
  ctx.lineTo(w - pad + 4, pad - 4);
  ctx.lineTo(w - pad + 4, pad + chLen);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(pad - 4, h - pad - chLen);
  ctx.lineTo(pad - 4, h - pad + 4);
  ctx.lineTo(pad + chLen, h - pad + 4);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(w - pad + 4 - chLen, h - pad + 4);
  ctx.lineTo(w - pad + 4, h - pad + 4);
  ctx.lineTo(w - pad + 4, h - pad - chLen);
  ctx.stroke();

  // 4. Center Target Reticle & Orientation Indicator
  ctx.save();
  ctx.strokeStyle = profile.themeColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Cross lines across center circle
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 135, cy);
  ctx.lineTo(cx + 135, cy);
  ctx.moveTo(cx, cy - 135);
  ctx.lineTo(cx, cy + 135);
  ctx.stroke();

  // Forward Heading Pointer
  ctx.save();
  ctx.fillStyle = profile.themeColor;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 128);
  ctx.lineTo(cx - 14, cy - 100);
  ctx.lineTo(cx + 14, cy - 100);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 5. Center Function Icon & Dual-language Typography
  ctx.save();
  ctx.font = '64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(profile.icon, cx, cy - 18);
  ctx.restore();

  // Primary Title (Zh)
  ctx.save();
  ctx.font = '900 32px "Noto Sans TC", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 8;
  ctx.fillText(profile.nameZh, cx, cy + 52);
  ctx.restore();

  // Secondary Subtitle (En / Technical)
  ctx.save();
  ctx.font = '800 13px "JetBrains Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = profile.themeColor;
  ctx.letterSpacing = '2px';
  ctx.fillText(profile.subZh, cx, cy + 76);
  ctx.restore();

  // 6. Technical Spec Badges
  const badgeW = 120;
  const badgeH = 24;
  drawRoundRect(ctx, cx - badgeW / 2, h - pad - badgeH - 12, badgeW, badgeH, 6);
  ctx.fillStyle = profile.badgeBg;
  ctx.fill();
  ctx.strokeStyle = profile.themeColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.font = '700 11px "JetBrains Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SNAP: 0.50m GRID', cx, h - pad - badgeH / 2 - 12);
  ctx.restore();

  // Bay footprint watermark
  ctx.font = '700 11px "JetBrains Mono", Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = profile.themeColor;
  ctx.fillText(`${profile.nameZh} 預覽 [1.4m x 1.2m]`, pad + 14, pad + 22);
}

export function drawLargeDirectionArrow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  angleRad: number,
  isActive: boolean
) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angleRad);

  // Large, bold, sharp directional arrow shape (NO circular outer frame!)
  ctx.beginPath();
  ctx.moveTo(0, -104);
  ctx.lineTo(92, 10);
  ctx.lineTo(40, 10);
  ctx.lineTo(40, 100);
  ctx.lineTo(-40, 100);
  ctx.lineTo(-40, 10);
  ctx.lineTo(-92, 10);
  ctx.closePath();

  if (isActive) {
    // Glowing vibrant Amber active state
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#f59e0b';
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.stroke();

    // Inner bright core
    ctx.beginPath();
    ctx.moveTo(0, -80);
    ctx.lineTo(60, 0);
    ctx.lineTo(24, 0);
    ctx.lineTo(24, 80);
    ctx.lineTo(-24, 80);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-60, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();
  } else {
    // Cyberpunk electric cyan neon arrow
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(0, 24, 38, 0.82)';
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Inner subtle chevron notch accent
    ctx.beginPath();
    ctx.moveTo(0, -64);
    ctx.lineTo(46, -4);
    ctx.lineTo(20, -4);
    ctx.lineTo(0, -32);
    ctx.lineTo(-20, -4);
    ctx.lineTo(-46, -4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 240, 255, 0.40)';
    ctx.fill();
  }

  ctx.restore();
}
