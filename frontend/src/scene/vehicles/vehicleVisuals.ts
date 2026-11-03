import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { AppMode } from '../../types';
import type { SceneContext, VehicleVisual } from '../types';
import { GLB_FORK_LIFT_UNITS, setForkDimensions } from './cargo';

export const VEHICLE_PALETTES = [
  { name: 'Cyan', color: new BABYLON.Color3(0.04, 0.75, 0.95), hex: '#06b6d4' },
  { name: 'Amber', color: new BABYLON.Color3(0.95, 0.55, 0.08), hex: '#f59e0b' },
  { name: 'Emerald', color: new BABYLON.Color3(0.1, 0.8, 0.45), hex: '#10b981' },
  { name: 'Violet', color: new BABYLON.Color3(0.65, 0.35, 0.95), hex: '#8b5cf6' },
];

export interface VehicleVisualContext {
  sc: BABYLON.Scene;
  ctx: SceneContext;
  selectedVehicleId: Ref<string>;
  currentAppMode: Ref<AppMode>;
  agvNodesList: Ref<string[]>;
  selectedLiftNodeName: Ref<string>;
  baseLiftPosY: Ref<number>;
  is3DQuickDispatchActive: Ref<boolean>;
  fleetVehicles: Record<string, any>;
  agvState: any;
}

export function createTrafficWaitIndicator(sc: BABYLON.Scene, parentRoot: BABYLON.TransformNode, name: string): BABYLON.Mesh {
  const waitMesh = BABYLON.MeshBuilder.CreateCylinder(name, {
    diameter: 0.55,
    height: 0.08,
    tessellation: 24
  }, sc);
  waitMesh.parent = parentRoot;
  waitMesh.position.set(0, 1.6, 0);
  const mat = new BABYLON.StandardMaterial(`${name}_Mat`, sc);
  mat.diffuseColor = new BABYLON.Color3(0.95, 0.15, 0.15);
  mat.emissiveColor = new BABYLON.Color3(1.0, 0.2, 0.2);
  waitMesh.material = mat;
  waitMesh.isVisible = false;
  waitMesh.isPickable = false;
  return waitMesh;
}

export function createFallbackAGV(
  sc: BABYLON.Scene,
  parentRoot: BABYLON.TransformNode,
  vehId: string = 'AGV-001',
  vCtx?: Partial<VehicleVisualContext>
) {
  if (!parentRoot) return;
  // Main chassis (body at rear)
  const chassis = BABYLON.MeshBuilder.CreateBox(`AGV_Chassis_${vehId}`, { width: 0.9, height: 0.45, depth: 1.1 }, sc);
  chassis.parent = parentRoot;
  chassis.position.set(0, 0.225, -0.2);
  chassis.isPickable = true;
  chassis.metadata = { type: 'agv', id: vehId };
  const chassisMat = new BABYLON.StandardMaterial(`AGV_ChassisMat_${vehId}`, sc);
  chassisMat.diffuseColor = new BABYLON.Color3(0.15, 0.17, 0.22);
  chassis.material = chassisMat;

  // Mast vertical columns
  const mast = BABYLON.MeshBuilder.CreateBox(`AGV_Mast_${vehId}`, { width: 0.5, height: 1.2, depth: 0.08 }, sc);
  mast.parent = parentRoot;
  mast.position.set(0, 0.6, 0.35);
  mast.material = chassisMat;

  // Fork Carriage Root
  const forkCarriage = new BABYLON.TransformNode(`AGV_ForkCarriage_${vehId}`, sc);
  forkCarriage.parent = parentRoot;
  forkCarriage.position.set(0, 0.08, 0.4);

  // Left & right fork tines (牙叉)
  const forkMat = new BABYLON.StandardMaterial(`AGV_ForkMat_${vehId}`, sc);
  forkMat.diffuseColor = new BABYLON.Color3(0.92, 0.72, 0.1); // Industrial safety yellow forks
  forkMat.emissiveColor = new BABYLON.Color3(0.15, 0.12, 0.02);

  const forkL = BABYLON.MeshBuilder.CreateBox(`Fork_Left_${vehId}`, { width: 0.09, height: 0.04, depth: 0.6 }, sc);
  forkL.parent = forkCarriage;
  forkL.position.set(-0.16, 0, 0.3);
  forkL.material = forkMat;

  const forkR = BABYLON.MeshBuilder.CreateBox(`Fork_Right_${vehId}`, { width: 0.09, height: 0.04, depth: 0.6 }, sc);
  forkR.parent = forkCarriage;
  forkR.position.set(0.16, 0, 0.3);
  forkR.material = forkMat;

  if (vCtx?.agvNodesList) vCtx.agvNodesList.value = ['AGV_ForkCarriage', 'AGV_Chassis'];
  if (vCtx?.selectedLiftNodeName) vCtx.selectedLiftNodeName.value = 'AGV_ForkCarriage';
  if (vCtx?.baseLiftPosY) vCtx.baseLiftPosY.value = 0.08;
  setForkDimensions(0.10, 0.30);

  if (vCtx?.ctx) {
    createAGVSelectionHalo(sc, vCtx.ctx, vCtx.is3DQuickDispatchActive?.value ?? false);
  }
}

export function createAGVSelectionHalo(
  sc: BABYLON.Scene,
  ctx: SceneContext,
  isVisible: boolean = false
) {
  if (!ctx.agvRoot) return;
  if (ctx.agvHaloMesh) ctx.agvHaloMesh.dispose();
  const halo = BABYLON.MeshBuilder.CreateTorus('AGV_Halo', {
    diameter: 2.2,
    thickness: 0.05,
    tessellation: 32
  }, sc);
  halo.parent = ctx.agvRoot;
  halo.position.y = 0.03;
  const mat = new BABYLON.StandardMaterial('AGV_HaloMat', sc);
  mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  mat.emissiveColor = new BABYLON.Color3(0.06, 0.75, 1.0); // Bright Neon Cyan
  halo.material = mat;
  halo.isVisible = isVisible;
  halo.isPickable = false;
  ctx.agvHaloMesh = halo;
}

export function createAGVBeacon(
  sc: BABYLON.Scene,
  ctx: SceneContext,
  getVehicleStatus: () => string
) {
  if (!ctx.agvRoot) return;
  const beacon = BABYLON.MeshBuilder.CreateSphere('AGV_Beacon', { diameter: 0.2, segments: 16 }, sc);
  beacon.parent = ctx.agvRoot;
  beacon.position.set(0, 0.52, -0.6);
  const mat = new BABYLON.StandardMaterial('BeaconMat', sc);
  mat.emissiveColor = new BABYLON.Color3(0.1, 0.85, 0.4);
  beacon.material = mat;
  ctx.beaconMaterial = mat;

  const updateBeaconColor = (st: string) => {
    if (!ctx.beaconMaterial) return;
    if (st === 'DRIVING') ctx.beaconMaterial.emissiveColor = new BABYLON.Color3(0.06, 0.75, 1.0);
    else if (st === 'ACTING') ctx.beaconMaterial.emissiveColor = new BABYLON.Color3(1.0, 0.55, 0.0);
    else ctx.beaconMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.85, 0.4);
  };

  updateBeaconColor(getVehicleStatus());
}

/**
 * 編輯模式下車輛視覺處理：
 * 1. 將所有車輛模型與碰撞框設為非可點選 (isPickable = false)，讓點擊/懸停射線直接穿透到底部站點圓盤
 * 2. 設置半透明度 (visibility = 0.45)，讓使用者能清晰透視車身下的站點 Pad、旋轉方向箭頭與標記
 * 3. 切回模擬模式時恢復 100% 不透明與可選取狀態 (Hitbox 保持隱形)
 */
export function updateVehiclesEditModeState(ctx: SceneContext, isEdit: boolean) {
  for (const visual of ctx.vehicleVisuals.values()) {
    if (!visual.root) continue;
    const meshes = visual.root.getChildMeshes(false);
    for (const m of meshes) {
      if (m.name.startsWith('Hitbox_')) {
        m.isPickable = !isEdit;
        m.visibility = 0;
      } else if (m.name.startsWith('Halo_') || m.name.startsWith('TrafficWait_')) {
        m.isPickable = false;
      } else {
        m.isPickable = !isEdit;
        m.visibility = isEdit ? 0.45 : 1.0;
      }
    }
  }
}

export async function createOrUpdateVehicleVisual(
  vCtx: VehicleVisualContext,
  vehicleId: string,
  initPos?: { x: number; z: number; theta?: number }
): Promise<VehicleVisual> {
  const { sc, ctx, selectedVehicleId, currentAppMode, agvNodesList, selectedLiftNodeName, baseLiftPosY } = vCtx;
  let existing = ctx.vehicleVisuals.get(vehicleId);
  if (existing) return existing;

  const idx = ctx.vehicleVisuals.size;
  const palette = VEHICLE_PALETTES[idx % VEHICLE_PALETTES.length];

  const root = new BABYLON.TransformNode(`Vehicle_${vehicleId}_Root`, sc);
  const px = initPos?.x ?? (idx === 0 ? 0 : 0);
  const pz = initPos?.z ?? (idx === 0 ? 0 : 10);
  const pTheta = initPos?.theta ?? Math.PI / 2;

  root.position.set(px, 0, pz);
  root.rotation.y = pTheta;

  const cPos = new BABYLON.Vector3(px, 0, pz);
  const tPos = new BABYLON.Vector3(px, 0, pz);

  const visual: VehicleVisual = {
    id: vehicleId,
    root,
    glbRoot: null,
    cargoMesh: null,
    haloMesh: null,
    trafficWaitMesh: null,
    overheadBadgeMesh: null,
    overheadBadgeTexture: null,
    lastBadgeSig: '',
    activeTrajectoryMesh: null,
    targetPos: tPos,
    currentPos: cPos,
    targetTheta: pTheta,
    currentTheta: pTheta,
    liftNode: null,
    baseLiftPosY: 0,
    isPickAnimationRunning: false,
    isDropAnimationRunning: false,
    color: palette.color,
  };

  ctx.vehicleVisuals.set(vehicleId, visual);
  if (vehicleId === 'AGV-001' || !ctx.agvRoot) {
    ctx.agvRoot = root;
  }

  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'agv.glb', sc);
    const glbRoot = result.meshes[0];
    glbRoot.parent = root;
    visual.glbRoot = glbRoot;

    const hierarchy = glbRoot.getHierarchyBoundingVectors();
    const size = hierarchy.max.subtract(hierarchy.min);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = maxDim > 0 ? 1.6 / maxDim : 0.01;
    glbRoot.scaling.setAll(scaleFactor);
    glbRoot.position.set(0, 0.05, 0);
    glbRoot.rotation.y = Math.PI;

    const accentMat = new BABYLON.StandardMaterial(`Mat_${vehicleId}`, sc);
    accentMat.diffuseColor = palette.color;
    accentMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    const foundNames: string[] = [];
    result.transformNodes.forEach(tn => {
      if (tn.name) foundNames.push(tn.name);
    });
    result.meshes.forEach(m => {
      m.isPickable = true;
      m.metadata = { type: 'agv', id: vehicleId };
      if (m.name && (m.name.toLowerCase().includes('body') || m.name.toLowerCase().includes('chassis'))) {
        m.material = accentMat;
      }
      if (m.name && !foundNames.includes(m.name)) foundNames.push(m.name);
    });

    if (vehicleId === 'AGV-001') {
      agvNodesList.value = foundNames;
    }

    const hitbox = BABYLON.MeshBuilder.CreateBox(`Hitbox_${vehicleId}`, { width: 1.8, height: 1.2, depth: 2.2 }, sc);
    hitbox.parent = root;
    hitbox.position.y = 0.4;
    hitbox.isPickable = true;
    hitbox.visibility = 0;
    hitbox.metadata = { type: 'agv', id: vehicleId };

    const forkNode = result.transformNodes.find(tn => tn.name === 'Object001');
    if (forkNode) {
      visual.liftNode = forkNode;
      visual.baseLiftPosY = 0;
      if (vehicleId === 'AGV-001') {
        selectedLiftNodeName.value = 'Object001';
        baseLiftPosY.value = 0;
        root.computeWorldMatrix(true);
        forkNode.computeWorldMatrix(true);
        const forkBounds = forkNode.getHierarchyBoundingVectors(true);
        const restTopY = forkBounds.min.y - root.position.y + 0.03;
        const liftMeters = GLB_FORK_LIFT_UNITS * scaleFactor;
        setForkDimensions(restTopY, liftMeters);
      }
    }
  } catch (err) {
    console.warn(`[Babylon] Failed to load agv.glb for ${vehicleId}, using fallback:`, err);
    createFallbackAGV(sc, root, vehicleId, vCtx);
  }

  // Halo for vehicle
  const halo = BABYLON.MeshBuilder.CreateTorus(`Halo_${vehicleId}`, { diameter: 2.2, thickness: 0.05, tessellation: 32 }, sc);
  halo.parent = root;
  halo.position.y = 0.03;
  const haloMat = new BABYLON.StandardMaterial(`HaloMat_${vehicleId}`, sc);
  haloMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  haloMat.emissiveColor = palette.color;
  halo.material = haloMat;
  halo.isVisible = (selectedVehicleId.value === vehicleId);
  halo.isPickable = false;
  visual.haloMesh = halo;

  if (vehicleId === 'AGV-001') {
    ctx.agvHaloMesh = halo;
  }

  // Traffic Wait Mesh
  visual.trafficWaitMesh = createTrafficWaitIndicator(sc, root, `TrafficWait_${vehicleId}`);

  if (currentAppMode.value === 'edit') {
    updateVehiclesEditModeState(ctx, true);
  }

  return visual;
}

export async function loadAGVModel(vCtx: VehicleVisualContext) {
  const ids = Object.keys(vCtx.fleetVehicles);
  const initialIds = ids.length > 0 ? ids : ['AGV-001', 'AGV-002'];

  for (const id of initialIds) {
    const v = vCtx.fleetVehicles[id];
    const pos = v?.position ? {
      x: v.position.x,
      z: v.position.z !== undefined ? v.position.z : v.position.y,
      theta: v.position.theta
    } : (id === 'AGV-002' ? { x: 0, z: 10, theta: Math.PI / 2 } : { x: 0, z: 0, theta: Math.PI / 2 });

    await createOrUpdateVehicleVisual(vCtx, id, pos);
  }

  updateVehiclesEditModeState(vCtx.ctx, vCtx.currentAppMode.value === 'edit');
  createAGVBeacon(vCtx.sc, vCtx.ctx, () => vCtx.agvState?.task_info?.status);
}
