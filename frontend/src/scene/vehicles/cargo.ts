import * as BABYLON from '@babylonjs/core';
import type { SceneContext } from '../types';

export const CARGO_SIZE = 0.65;
export const CARGO_HALF = CARGO_SIZE / 2;
export const FORK_FRONT_Z = 0.7;
export const GLB_FORK_LIFT_UNITS = 48;

let forkRestTopY = 0.10;
let forkLiftMeters = 0.28;

export function setForkDimensions(restTopY: number, liftMeters: number) {
  forkRestTopY = restTopY;
  forkLiftMeters = liftMeters;
}

export const cargoGroundY = () => 0.0;
export const cargoElevatedY = () => forkRestTopY + forkLiftMeters;

export function getForkLiftTargetY(
  liftNode: BABYLON.TransformNode | BABYLON.Mesh,
  baseLiftPosY: number = 0
): number {
  return liftNode.name === 'Object001'
    ? baseLiftPosY + GLB_FORK_LIFT_UNITS
    : baseLiftPosY + forkLiftMeters;
}

/** 載入 plastic_pallet.glb 並依階層包圍盒正規化，寬度 1.2m */
export async function loadNormalizedPallet(sc: BABYLON.Scene): Promise<BABYLON.AbstractMesh> {
  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'plastic_pallet.glb', sc);
    const palletRoot = result.meshes[0];
    palletRoot.name = 'PlasticPallet';
    const bounds = palletRoot.getHierarchyBoundingVectors(true);
    const maxHoriz = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 0.1);
    const s = 1.2 / maxHoriz;
    palletRoot.scaling.setAll(s);
    for (const m of result.meshes) {
      m.isPickable = true;
    }
    return palletRoot;
  } catch (err) {
    console.warn('[Pallet] plastic_pallet.glb 載入失敗，改用程序化棧板:', err);
    const box = BABYLON.MeshBuilder.CreateBox('PalletFallback', { width: 1.2, height: 0.14, depth: 1.0 }, sc);
    const mat = new BABYLON.StandardMaterial('PalletMat', sc);
    mat.diffuseColor = new BABYLON.Color3(0.12, 0.28, 0.48);
    box.material = mat;
    box.isPickable = true;
    return box;
  }
}

/** 載入 guess_box.glb 並依階層包圍盒正規化為 CARGO_SIZE 邊長、中心置於原點 */
export async function loadNormalizedCargo(sc: BABYLON.Scene): Promise<BABYLON.AbstractMesh> {
  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'guess_box.glb', sc);
    const boxRoot = result.meshes[0];
    boxRoot.name = 'CargoBox_Guess';

    // 必須在掛到 AGV 之前量測，避免父節點轉換影響包圍盒
    const bounds = boxRoot.getHierarchyBoundingVectors(true);
    const size = bounds.max.subtract(bounds.min);
    const maxDim = Math.max(size.x, size.y, size.z, 1e-3);
    const s = CARGO_SIZE / maxDim;
    boxRoot.scaling.scaleInPlace(s);

    // 修正模型原點偏移，讓貨箱幾何中心位於 root 原點
    const center = bounds.min.add(bounds.max).scale(0.5 * s);
    boxRoot.position.subtractInPlace(center);

    for (const m of result.meshes) m.isPickable = false;
    return boxRoot;
  } catch (err) {
    console.warn('[Cargo] guess_box.glb 載入失敗，改用程序化貨箱:', err);
    const fallback = BABYLON.MeshBuilder.CreateBox('CargoBox', { size: CARGO_SIZE }, sc);
    const cargoMat = new BABYLON.StandardMaterial('CargoMat', sc);
    cargoMat.diffuseColor = new BABYLON.Color3(0.94, 0.52, 0.1);
    fallback.material = cargoMat;
    fallback.isPickable = false;
    return fallback;
  }
}

/** 包一層 TransformNode，讓車載貨物同時具備棧板與貨物（有貨時=棧板+貨物） */
export async function createCargoHolder(
  sc: BABYLON.Scene,
  y: number,
  parentRoot: BABYLON.TransformNode | null = null
): Promise<BABYLON.TransformNode> {
  const holder = new BABYLON.TransformNode('CargoHolder', sc);

  // 1. 牙叉底部的棧板 (plastic pallet)
  const pallet = await loadNormalizedPallet(sc);
  pallet.parent = holder;
  pallet.position.set(0, 0, 0);

  // 2. 棧板頂部的貨箱 (箱底緊貼棧板上表面，棧板高約 0.14m)
  const box = await loadNormalizedCargo(sc);
  box.parent = holder;
  box.position.set(0, 0.14 + CARGO_HALF, 0);

  if (parentRoot) {
    holder.parent = parentRoot;
  }
  holder.position.set(0, y, FORK_FRONT_Z);
  return holder;
}

/** 清理指定車輛上的任何貨物與棧板，並將牙叉復位至最低休息高度 */
export function clearVehicleCargo(
  vehicleId: string,
  ctx: SceneContext,
  baseLiftPosY: number = 0,
  selectedLiftNodeName: string = ''
) {
  const visual = ctx.vehicleVisuals.get(vehicleId);
  if (visual?.cargoMesh) {
    visual.cargoMesh.dispose();
    visual.cargoMesh = null;
  }
  if (vehicleId === 'AGV-001' && ctx.cargoMesh) {
    ctx.cargoMesh.dispose();
    ctx.cargoMesh = null;
  }
  const root = visual?.root || (vehicleId === 'AGV-001' ? ctx.agvRoot : null);
  if (root) {
    const children = root.getChildren ? root.getChildren() : [];
    for (const child of children) {
      if (child.name.includes('Cargo') || child.name.includes('Holder') || child.name.includes('Pallet')) {
        child.dispose();
      }
    }
  }
  const liftNode = visual?.liftNode || (selectedLiftNodeName && ctx.scene ? ctx.scene.getNodeByName(selectedLiftNodeName) : null) as BABYLON.TransformNode | BABYLON.Mesh | null;
  if (liftNode && 'position' in liftNode) {
    liftNode.position.y = baseLiftPosY;
  }
}

export async function mountStaticCargo(
  sc: BABYLON.Scene,
  vehicleId: string = 'AGV-001',
  ctx: SceneContext,
  baseLiftPosY: number = 0,
  selectedLiftNodeName: string = ''
) {
  const visual = ctx.vehicleVisuals.get(vehicleId);
  const root = visual?.root || ctx.agvRoot;
  if (!root) return;
  if (visual?.cargoMesh || (vehicleId === 'AGV-001' && ctx.cargoMesh)) return;

  const holder = await createCargoHolder(sc, cargoElevatedY(), root);
  if (visual) visual.cargoMesh = holder;
  if (vehicleId === 'AGV-001') ctx.cargoMesh = holder;

  const liftNode = visual?.liftNode || (selectedLiftNodeName ? sc.getNodeByName(selectedLiftNodeName) : null) as BABYLON.TransformNode | BABYLON.Mesh | null;
  if (liftNode && 'position' in liftNode) {
    liftNode.position.y = getForkLiftTargetY(liftNode, baseLiftPosY);
  }
}

export async function performPickAnimation(
  sc: BABYLON.Scene,
  vehicleId: string = 'AGV-001',
  ctx: SceneContext,
  timeScale: number = 1.0,
  baseLiftPosY: number = 0,
  selectedLiftNodeName: string = ''
) {
  const visual = ctx.vehicleVisuals.get(vehicleId);
  const root = visual?.root || ctx.agvRoot;
  if (!root) return;

  clearVehicleCargo(vehicleId, ctx, baseLiftPosY, selectedLiftNodeName);

  const liftNode = visual?.liftNode || (selectedLiftNodeName ? sc.getNodeByName(selectedLiftNodeName) : null) as BABYLON.TransformNode | BABYLON.Mesh | null;
  if (liftNode && 'position' in liftNode) {
    liftNode.position.y = baseLiftPosY;
  }

  const liftDelayMs = Math.max(250, Math.round(1100 / (timeScale || 1.0)));

  setTimeout(async () => {
    const holder = await createCargoHolder(sc, cargoGroundY(), root);
    if (visual) visual.cargoMesh = holder;
    if (vehicleId === 'AGV-001') ctx.cargoMesh = holder;

    const ease = new BABYLON.CubicEase();
    ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

    if (liftNode && 'position' in liftNode) {
      BABYLON.Animation.CreateAndStartAnimation(
        'forkPickAnim', liftNode, 'position.y', 30, 30,
        baseLiftPosY, getForkLiftTargetY(liftNode, baseLiftPosY),
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease
      );
    }

    BABYLON.Animation.CreateAndStartAnimation(
      'boxPickAnim', holder, 'position.y', 30, 30,
      cargoGroundY(), cargoElevatedY(),
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease
    );
  }, liftDelayMs);
}

export function performDropAnimation(
  sc: BABYLON.Scene,
  vehicleId: string = 'AGV-001',
  ctx: SceneContext,
  timeScale: number = 1.0,
  baseLiftPosY: number = 0,
  selectedLiftNodeName: string = ''
) {
  const visual = ctx.vehicleVisuals.get(vehicleId);
  const liftNode = visual?.liftNode || (selectedLiftNodeName ? sc.getNodeByName(selectedLiftNodeName) : null) as BABYLON.TransformNode | BABYLON.Mesh | null;
  const holder = visual?.cargoMesh || (vehicleId === 'AGV-001' ? ctx.cargoMesh : null);

  const scale = timeScale || 1.0;
  const dropWaitMs = Math.max(250, Math.round(1100 / scale));
  const disposeDelayMs = Math.max(200, Math.round(1000 / scale));

  setTimeout(() => {
    const ease = new BABYLON.CubicEase();
    ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

    if (liftNode && 'position' in liftNode) {
      BABYLON.Animation.CreateAndStartAnimation(
        'forkDropAnim', liftNode, 'position.y', 30, 30,
        liftNode.position.y, baseLiftPosY,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease
      );
    }

    if (holder) {
      BABYLON.Animation.CreateAndStartAnimation(
        'cargoLowerToGround', holder, 'position.y', 30, 30,
        holder.position.y, cargoGroundY(),
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease
      );

      setTimeout(() => {
        try {
          if (!holder.isDisposed()) {
            holder.dispose();
          }
        } catch (e) {
          console.warn('Disposing dropped cargo holder:', e);
        }
        clearVehicleCargo(vehicleId, ctx, baseLiftPosY, selectedLiftNodeName);
      }, disposeDelayMs);
    }
  }, dropWaitMs);
}
