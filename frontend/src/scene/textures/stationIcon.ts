import type { LayoutNode } from '../../types';
import { isCargoNode } from '../layout/nodeUtils';

/**
 * 繪製站點俯視地面圓盤材質 (512x512 Canvas)
 * 包含雙重同心環、呼吸光暈與向量圖示（充電電池、等待時鐘、貨物方塊、交會箭頭）
 */
export function drawStationIconTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  node: LayoutNode,
  status: 'normal' | 'active' | 'waiting' | 'occupied' | 'fault' = 'normal',
  badge?: 'start' | 'target' | null
) {
  const cx = width / 2;
  const cy = height / 2;
  ctx.clearRect(0, 0, width, height);

  // Status Palette (Double concentric rings & glows from concept diagram)
  let ringColor = '#10b981'; // 正常 Green
  let glowColor = 'rgba(16, 185, 129, 0.85)';
  let iconColor = '#34d399';
  let bgGlow = 'rgba(16, 185, 129, 0.16)';

  if (status === 'active') {
    ringColor = '#0ea5e9'; // 使用中 Sky Blue
    glowColor = 'rgba(14, 165, 233, 0.9)';
    iconColor = '#38bdf8';
    bgGlow = 'rgba(14, 165, 233, 0.18)';
  } else if (status === 'waiting') {
    ringColor = '#facc15'; // 等待中 Yellow
    glowColor = 'rgba(250, 204, 21, 0.9)';
    iconColor = '#fde047';
    bgGlow = 'rgba(250, 204, 21, 0.18)';
  } else if (status === 'occupied') {
    ringColor = '#f97316'; // 被佔用 Orange
    glowColor = 'rgba(249, 115, 22, 0.9)';
    iconColor = '#fb923c';
    bgGlow = 'rgba(249, 115, 22, 0.18)';
  } else if (status === 'fault') {
    ringColor = '#ef4444'; // 故障 Red
    glowColor = 'rgba(239, 68, 68, 0.95)';
    iconColor = '#f87171';
    bgGlow = 'rgba(239, 68, 68, 0.22)';
  }

  // 1. Semi-transparent dark slate floor base
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 238, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 15, 29, 0.88)';
  ctx.fill();

  // 2. Radial status glow in center
  const radial = ctx.createRadialGradient(cx, cy, 20, cx, cy, 230);
  radial.addColorStop(0, bgGlow);
  radial.addColorStop(1, 'rgba(10, 15, 29, 0)');
  ctx.fillStyle = radial;
  ctx.fill();

  // 3. Double concentric status rings (Signature Blueprint)
  // Outer Ring
  ctx.beginPath();
  ctx.arc(cx, cy, 230, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 5.5;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18;
  ctx.stroke();

  // Inner Ring
  ctx.beginPath();
  ctx.arc(cx, cy, 196, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 8.5;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 24;
  ctx.stroke();

  // Concentric guideline between rings
  ctx.beginPath();
  ctx.arc(cx, cy, 213, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();

  // 4. Center Vector Icons
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18;

  const func = node.function;
  const isCargo = isCargoNode(node.id, [node]) || func === 'Cargo' || func === 'Pick-up' || func === 'Drop-off';
  const isCharge = func === 'Idle/Charge' || func === 'Charge' || (node.name && node.name.includes('充電'));
  const isWait = func === 'Wait';

  if (badge === 'start') {
    // 起點標籤：Waving flag on pole
    ctx.strokeStyle = '#10b981';
    ctx.fillStyle = '#10b981';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    // Pole
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy + 68);
    ctx.lineTo(cx - 30, cy - 68);
    ctx.stroke();
    // Banner
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy - 68);
    ctx.bezierCurveTo(cx - 5, cy - 80, cx + 25, cy - 58, cx + 58, cy - 68);
    ctx.lineTo(cx + 58, cy - 14);
    ctx.bezierCurveTo(cx + 25, cy - 4, cx - 5, cy - 24, cx - 30, cy - 14);
    ctx.closePath();
    ctx.fill();
  } else if (badge === 'target') {
    // 終點標籤：Bullseye target
    ctx.strokeStyle = '#0ea5e9';
    ctx.fillStyle = '#0ea5e9';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, 68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
  } else if (isCharge) {
    // 充電站：Horizontal rounded battery with terminal and lightning bolt
    const bw = 155;
    const bh = 92;
    const rx = cx - bw / 2 - 8;
    const ry = cy - bh / 2;
    ctx.strokeStyle = iconColor;
    ctx.lineWidth = 9;
    ctx.beginPath();
    (ctx as any).roundRect ? (ctx as any).roundRect(rx, ry, bw, bh, 18) : ctx.rect(rx, ry, bw, bh);
    ctx.stroke();

    // Positive terminal
    ctx.fillStyle = iconColor;
    ctx.beginPath();
    (ctx as any).roundRect ? (ctx as any).roundRect(rx + bw + 4, cy - 22, 14, 44, 5) : ctx.rect(rx + bw + 4, cy - 22, 14, 44);
    ctx.fill();

    // Lightning bolt in center
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 30);
    ctx.lineTo(cx - 24, cy + 4);
    ctx.lineTo(cx - 3, cy + 4);
    ctx.lineTo(cx - 14, cy + 30);
    ctx.lineTo(cx + 26, cy - 4);
    ctx.lineTo(cx + 5, cy - 4);
    ctx.closePath();
    ctx.fill();
  } else if (isWait) {
    // 等待點：Standard round clock face with hour & minute hands
    ctx.strokeStyle = iconColor;
    ctx.fillStyle = iconColor;
    ctx.lineWidth = 9;
    // Outer clock face
    ctx.beginPath();
    ctx.arc(cx, cy, 74, 0, Math.PI * 2);
    ctx.stroke();
    // Center pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    // Minute hand pointing to 12 o'clock
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 45);
    ctx.stroke();
    // Hour hand pointing to 3 o'clock
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 34, cy);
    ctx.stroke();
  } else if (isCargo) {
    // 取貨站 / 放貨站：3D Isometric box with arrow UP (取貨) or DOWN (放貨)
    const isPick = !node.has_cargo;
    ctx.strokeStyle = iconColor;
    ctx.fillStyle = iconColor;
    ctx.lineWidth = 7.5;
    ctx.lineJoin = 'round';

    if (isPick) {
      // 取貨站：Arrow pointing UP
      ctx.beginPath();
      ctx.moveTo(cx, cy - 76);
      ctx.lineTo(cx - 26, cy - 44);
      ctx.lineTo(cx - 11, cy - 44);
      ctx.lineTo(cx - 11, cy - 20);
      ctx.lineTo(cx + 11, cy - 20);
      ctx.lineTo(cx + 11, cy - 44);
      ctx.lineTo(cx + 26, cy - 44);
      ctx.closePath();
      ctx.fill();
    } else {
      // 放貨站：Arrow pointing DOWN into box
      ctx.beginPath();
      ctx.moveTo(cx, cy - 18);
      ctx.lineTo(cx - 26, cy - 50);
      ctx.lineTo(cx - 11, cy - 50);
      ctx.lineTo(cx - 11, cy - 76);
      ctx.lineTo(cx + 11, cy - 76);
      ctx.lineTo(cx + 11, cy - 50);
      ctx.lineTo(cx + 26, cy - 50);
      ctx.closePath();
      ctx.fill();
    }

    // 3D Isometric box
    const boxY = cy + 22;
    const s = 48;
    // Top diamond
    ctx.beginPath();
    ctx.moveTo(cx, boxY - s);
    ctx.lineTo(cx + s * 1.05, boxY - s * 0.45);
    ctx.lineTo(cx, boxY + s * 0.1);
    ctx.lineTo(cx - s * 1.05, boxY - s * 0.45);
    ctx.closePath();
    ctx.stroke();
    // Left face
    ctx.beginPath();
    ctx.moveTo(cx - s * 1.05, boxY - s * 0.45);
    ctx.lineTo(cx, boxY + s * 0.1);
    ctx.lineTo(cx, boxY + s * 0.68);
    ctx.lineTo(cx - s * 1.05, boxY + s * 0.12);
    ctx.closePath();
    ctx.stroke();
    // Right face
    ctx.beginPath();
    ctx.moveTo(cx, boxY + s * 0.1);
    ctx.lineTo(cx + s * 1.05, boxY - s * 0.45);
    ctx.lineTo(cx + s * 1.05, boxY + s * 0.12);
    ctx.lineTo(cx, boxY + s * 0.68);
    ctx.closePath();
    ctx.stroke();
  } else {
    // 交會點 (Transit)：Crossing shuffle arrows
    ctx.strokeStyle = iconColor;
    ctx.fillStyle = iconColor;
    ctx.lineWidth = 9.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Top arrow: curves down then up-right
    ctx.beginPath();
    ctx.moveTo(cx - 58, cy - 34);
    ctx.bezierCurveTo(cx - 20, cy - 34, cx + 10, cy + 34, cx + 44, cy + 34);
    ctx.stroke();
    // Arrow head for bottom-right
    ctx.beginPath();
    ctx.moveTo(cx + 28, cy + 18);
    ctx.lineTo(cx + 58, cy + 34);
    ctx.lineTo(cx + 28, cy + 50);
    ctx.stroke();

    // Bottom arrow: curves up then down-right
    ctx.beginPath();
    ctx.moveTo(cx - 58, cy + 34);
    ctx.bezierCurveTo(cx - 20, cy + 34, cx + 10, cy - 34, cx + 44, cy - 34);
    ctx.stroke();
    // Arrow head for top-right
    ctx.beginPath();
    ctx.moveTo(cx + 28, cy - 50);
    ctx.lineTo(cx + 58, cy - 34);
    ctx.lineTo(cx + 28, cy - 18);
    ctx.stroke();
  }

  ctx.restore();
}
