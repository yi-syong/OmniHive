import * as BABYLON from '@babylonjs/core';
import type { VehicleVisual } from '../types';
import type { LayoutNode } from '../../types';
import { drawRoundRect } from '../textures/editorGraphics';

/**
 * 繪製充電進行中的脈衝動畫立體電池圖標 (動態漸層 + 充電閃電光芒)
 */
export function drawChargingBatteryBadge(ctx: CanvasRenderingContext2D, now: number) {
  ctx.clearRect(0, 0, 256, 256);
  ctx.save();

  // 1. Cyberpunk Electric Cyan Holographic Glowing Ring
  const pulse = 0.85 + 0.15 * Math.sin(now / 180);
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(2, 22, 30, 0.92)';
  ctx.fill();

  ctx.lineWidth = 12;
  ctx.strokeStyle = `rgba(0, 245, 255, ${pulse})`;
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 22;
  ctx.stroke();

  // Thin inner accent circle
  ctx.beginPath();
  ctx.arc(128, 128, 98, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 245, 255, 0.45)';
  ctx.shadowBlur = 0;
  ctx.stroke();

  // 2. Vertical Battery Body
  const bx = 86;
  const by = 82;
  const bw = 84;
  const bh = 122;
  const br = 10;

  // Battery terminal (+) on top
  const tw = 36;
  const th = 10;
  const tx = 128 - tw / 2;
  const ty = by - th + 2;
  drawRoundRect(ctx, tx, ty, tw, th, 4);
  ctx.fillStyle = '#00f5ff';
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 10;
  ctx.fill();

  // Battery casing outline
  drawRoundRect(ctx, bx, by, bw, bh, br);
  ctx.fillStyle = 'rgba(2, 16, 22, 0.90)';
  ctx.fill();
  ctx.strokeStyle = '#00f5ff';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 12;
  ctx.stroke();

  // 3. Animated Energy Fill Level (4 Segmented Bars from bottom to top)
  const cycle = (now % 1400) / 1400; // 0.0 to 1.0 (1.4s cycle)
  const totalBars = 4;
  const barSpacing = 4;
  const innerPad = 7;
  const innerW = bw - innerPad * 2;
  const innerH = bh - innerPad * 2;
  const singleBarH = (innerH - (totalBars - 1) * barSpacing) / totalBars;

  let activeBars = Math.floor(cycle * (totalBars + 1));
  if (activeBars > totalBars) activeBars = totalBars;

  for (let i = 0; i < totalBars; i++) {
    const barY = by + bh - innerPad - (i + 1) * singleBarH - i * barSpacing;
    const isLit = i < activeBars;

    if (isLit) {
      const colors = ['#10b981', '#34d399', '#38bdf8', '#00f5ff'];
      ctx.fillStyle = colors[i] || '#00f5ff';
      ctx.shadowColor = colors[i] || '#00f5ff';
      ctx.shadowBlur = 12;
      drawRoundRect(ctx, bx + innerPad, barY, innerW, singleBarH, 4);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0, 245, 255, 0.08)';
      ctx.shadowBlur = 0;
      drawRoundRect(ctx, bx + innerPad, barY, innerW, singleBarH, 4);
      ctx.fill();
    }
  }

  // 4. Center Glowing Lightning Icon ⚡ Overlay
  ctx.font = 'bold 36px "Segoe UI Symbol", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#fef08a';
  ctx.shadowBlur = 14;
  ctx.fillText('⚡', 128, 143);

  ctx.restore();
}

/**
 * 更新車頂上方立體狀態銘牌 (Totem Badge)
 */
export function updateVehicleOverheadBadge(
  sc: BABYLON.Scene,
  visual: VehicleVisual,
  vData: any
) {
  if (!visual.overheadBadgeMesh) {
    const plane = BABYLON.MeshBuilder.CreatePlane(`Badge_${visual.id}`, { size: 0.85 }, sc);
    plane.parent = visual.root;
    plane.position.set(0, 1.72, 0);
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;

    const tex = new BABYLON.DynamicTexture(`BadgeTex_${visual.id}`, { width: 256, height: 256 }, sc, true);
    tex.hasAlpha = true;
    const mat = new BABYLON.StandardMaterial(`BadgeMat_${visual.id}`, sc);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    plane.material = mat;

    visual.overheadBadgeMesh = plane;
    visual.overheadBadgeTexture = tex;
  }

  const isCharging = !!vData.battery?.charging || vData.task_info?.action === 'charge' || vData.task_info?.display_message?.includes('充電');
  if (isCharging) {
    visual.lastBadgeSig = ''; // Force continuous animation update
    const tex = visual.overheadBadgeTexture;
    if (tex) {
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
      drawChargingBatteryBadge(ctx, performance.now());
      tex.update();
    }
    return;
  }

  const isTrafficWait = !!vData.task_info?.is_traffic_wait;
  const isActing = vData.task_info?.status === 'ACTING';
  const action = vData.task_info?.action;
  const isDriving = vData.task_info?.status === 'DRIVING';

  // Signature based purely on visual state (no tiny battery text)
  const stateKey = isTrafficWait ? 'wait' : (isActing ? `acting_${action}` : (isDriving ? 'driving' : 'idle'));
  const sig = `${visual.id}_${stateKey}`;
  if (visual.lastBadgeSig === sig) return;
  visual.lastBadgeSig = sig;

  const tex = visual.overheadBadgeTexture;
  if (!tex) return;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 256);

  let ringColor = '#10b981';
  let glowColor = '#34d399';
  let innerBg = 'rgba(6, 78, 59, 0.88)';
  let totemGlyph = '●';
  let totemColor = '#34d399';
  let fontSize = 135;

  if (isTrafficWait) {
    // 🛑 Crimson Alert Stop Totem
    ringColor = '#ef4444';
    glowColor = '#f43f5e';
    innerBg = 'rgba(69, 10, 10, 0.94)';
    totemGlyph = '🛑';
    totemColor = '#ffffff';
    fontSize = 140;
  } else if (isActing && action === 'pick') {
    // 📦 Golden Amber Pick Cargo Totem
    ringColor = '#f59e0b';
    glowColor = '#fbbf24';
    innerBg = 'rgba(69, 26, 3, 0.92)';
    totemGlyph = '📦';
    totemColor = '#fbbf24';
    fontSize = 140;
  } else if (isActing && action === 'drop') {
    // 📥 Regal Purple Drop Cargo Totem
    ringColor = '#a855f7';
    glowColor = '#c084fc';
    innerBg = 'rgba(59, 7, 100, 0.92)';
    totemGlyph = '📥';
    totemColor = '#e9d5ff';
    fontSize = 140;
  } else if (isActing) {
    // ⚙️ General Acting
    ringColor = '#f59e0b';
    glowColor = '#fbbf24';
    innerBg = 'rgba(69, 26, 3, 0.92)';
    totemGlyph = '⚙️';
    totemColor = '#fbbf24';
    fontSize = 140;
  } else if (isDriving) {
    // ➤ Turbo Sky Blue Navigation Totem
    ringColor = '#38bdf8';
    glowColor = '#0ea5e9';
    innerBg = 'rgba(8, 47, 73, 0.90)';
    totemGlyph = '➤';
    totemColor = '#38bdf8';
    fontSize = 150;
  } else {
    // ◉ Standby / Idle Totem
    ringColor = '#10b981';
    glowColor = '#34d399';
    innerBg = 'rgba(6, 78, 59, 0.85)';
    totemGlyph = '●';
    totemColor = '#34d399';
    fontSize = 130;
  }

  ctx.save();

  // 1. Draw outer glowing ring
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fillStyle = innerBg;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = ringColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 24;
  ctx.stroke();

  // 2. Draw inner thin accent ring
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.shadowBlur = 0;
  ctx.stroke();

  // 3. Draw giant high-contrast totem symbol in center (no tiny text!)
  ctx.font = `bold ${fontSize}px "Segoe UI Symbol", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = totemColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18;
  ctx.fillText(totemGlyph, 128, 132);

  ctx.restore();
  tex.update();
}

/**
 * 即時動態軌跡帶與修剪更新 (Real-time Active Trajectory Ribbon & Pruning)
 */
export function updateVehicleTrajectory(
  sc: BABYLON.Scene,
  visual: VehicleVisual,
  vData: any,
  nodes: LayoutNode[]
) {
  const isDriving = vData.task_info?.status === 'DRIVING';
  const nodeStates = vData.node_states || [];

  if (!isDriving || nodeStates.length === 0) {
    if (visual.activeTrajectoryMesh) {
      visual.activeTrajectoryMesh.dispose();
      visual.activeTrajectoryMesh = null;
    }
    return;
  }

  // Build point sequence: Live vehicle position -> Remaining unpassed nodes
  const pts: BABYLON.Vector3[] = [];
  pts.push(new BABYLON.Vector3(visual.currentPos.x, 0.05, visual.currentPos.z));

  for (const nId of nodeStates) {
    const node = nodes.find(n => n.id === nId);
    if (node) {
      pts.push(new BABYLON.Vector3(node.x, 0.05, node.z));
    }
  }

  if (pts.length < 2) {
    if (visual.activeTrajectoryMesh) {
      visual.activeTrajectoryMesh.dispose();
      visual.activeTrajectoryMesh = null;
    }
    return;
  }

  if (visual.activeTrajectoryMesh && !visual.activeTrajectoryMesh.isDisposed()) {
    visual.activeTrajectoryMesh = BABYLON.MeshBuilder.CreateLines(`Trajectory_${visual.id}`, {
      points: pts,
      instance: visual.activeTrajectoryMesh
    }, sc);
  } else {
    const line = BABYLON.MeshBuilder.CreateLines(`Trajectory_${visual.id}`, {
      points: pts,
      updatable: true
    }, sc);
    line.color = visual.color || new BABYLON.Color3(0, 0.95, 1.0);
    line.isPickable = false;
    visual.activeTrajectoryMesh = line;
  }
}
