import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { AppMode, EditorTool, LayoutNode, LayoutProp } from '../../types';
import type { CollisionCheckResult, SmartSnapResult } from '../types';
import { drawStationIconTexture } from '../textures/stationIcon';
import { isCargoNode } from './nodeUtils';
import { CARGO_HALF, loadNormalizedCargo, loadNormalizedPallet } from '../vehicles/cargo';

export const MIN_CLEARANCE_DIST = 0.70;

export interface NodeMeshContext {
  factoryLayout: { nodes: LayoutNode[]; props: LayoutProp[]; edges: any[] };
  nodeMeshesMap: Map<string, BABYLON.Mesh>;
  stationPalletMap: Map<string, BABYLON.TransformNode>;
  stationCargoMap: Map<string, BABYLON.AbstractMesh>;
  nodeTextureMap: Map<string, { texture: BABYLON.DynamicTexture; plane: BABYLON.Mesh }>;
  fleetVehicles?: Record<string, any>;
  agvState?: any;
  is3DQuickDispatchActive?: Ref<boolean>;
  currentAgvStartNode?: Ref<string | null>;
  quickDispatchSteps?: Ref<Array<{ node_id: string }>>;
  currentAppMode?: Ref<AppMode>;
  currentEditorTool?: Ref<EditorTool>;
  selectedEditorNodeId?: Ref<string | null>;
  selectedEditorPropId?: Ref<string | null>;
  camera?: BABYLON.ArcRotateCamera | null;
  getCanvas?: () => HTMLCanvasElement | null;
  gizmoManager?: BABYLON.GizmoManager | null;
  getNodeRotationWidgetRoot?: () => BABYLON.TransformNode | null;
  highlightSelectedNode?: (sc: BABYLON.Scene, mesh: BABYLON.AbstractMesh) => void;
  computeSmartSnap?: (x: number, z: number, excludeId?: string) => SmartSnapResult;
  checkObjectClearanceCollision?: (x: number, z: number, excludeId?: string, minDist?: number) => CollisionCheckResult;
  updateAlignmentGuideLines?: (sc: BABYLON.Scene, x: number, z: number, ax: LayoutNode[], az: LayoutNode[]) => void;
  clearAlignmentGuideLines?: () => void;
  updateEdgesForNode?: (sc: BABYLON.Scene, nodeId: string) => void;
  createNodeRotationWidget?: (sc: BABYLON.Scene, mesh: BABYLON.AbstractMesh, nodeId: string) => void;
  markLayoutDirty?: () => void;
  notify?: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}

export function getNodeStatus(
  nodeId: string,
  factoryLayout: { nodes: LayoutNode[] },
  fleetVehicles: Record<string, any> = {},
  agvState: any = {}
): 'normal' | 'active' | 'waiting' | 'occupied' | 'fault' {
  const node = factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return 'normal';

  // Check if occupied by any AGV
  for (const v of Object.values(fleetVehicles)) {
    if (v.task_info?.current_node === nodeId) {
      if (v.task_info?.is_traffic_wait) return 'waiting';
      if (v.task_info?.status === 'DRIVING' || v.task_info?.status === 'ACTING') return 'active';
      return 'occupied';
    }
    const dx = v.position.x - node.x;
    const dz = v.position.z - node.z;
    if (dx * dx + dz * dz < 0.64) {
      if (v.task_info?.is_traffic_wait) return 'waiting';
      if (v.task_info?.status === 'DRIVING' || v.task_info?.status === 'ACTING') return 'active';
      return 'occupied';
    }
  }

  // AGV-001 check
  if (agvState?.task_info?.current_node === nodeId) {
    if (agvState.task_info?.is_traffic_wait) return 'waiting';
    if (agvState.task_info?.status === 'DRIVING' || agvState.task_info?.status === 'ACTING') return 'active';
    return 'occupied';
  }

  // Check if reserved by any active route
  const isReserved = Object.values(fleetVehicles).some(v => v.node_states?.includes(nodeId)) || agvState?.node_states?.includes(nodeId);
  if (isReserved) return 'active';

  // Check if cargo on station
  if (isCargoNode(nodeId, factoryLayout.nodes) && node.has_cargo) {
    return 'occupied';
  }

  return 'normal';
}

export function getNodeBadge(
  nodeId: string,
  is3DQuickDispatchActive?: boolean,
  currentAgvStartNode?: string | null,
  quickDispatchSteps?: Array<{ node_id: string }>
): 'start' | 'target' | null {
  if (is3DQuickDispatchActive) {
    if (currentAgvStartNode === nodeId) return 'start';
    const lastStep = quickDispatchSteps?.[quickDispatchSteps.length - 1];
    if (lastStep?.node_id === nodeId) return 'target';
  }
  return null;
}

export function updateNodeTexture(nodeId: string, ctx: NodeMeshContext) {
  const entry = ctx.nodeTextureMap.get(nodeId);
  if (!entry) return;
  const node = ctx.factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const context2d = entry.texture.getContext() as unknown as CanvasRenderingContext2D;
  const status = getNodeStatus(nodeId, ctx.factoryLayout, ctx.fleetVehicles, ctx.agvState);
  const badge = getNodeBadge(
    nodeId,
    ctx.is3DQuickDispatchActive?.value,
    ctx.currentAgvStartNode?.value,
    ctx.quickDispatchSteps?.value
  );
  drawStationIconTexture(context2d, 512, 512, node, status, badge);
  entry.texture.update();
}

export function updateAllNodeTextures(ctx: NodeMeshContext) {
  for (const nodeId of ctx.nodeTextureMap.keys()) {
    updateNodeTexture(nodeId, ctx);
  }
}

/**
 * 切換貨物站點的棧板載貨狀態 (有貨: 棧板+貨物 / 無貨: 無棧板無貨物)
 */
export async function toggleStationCargo(
  node: LayoutNode,
  forceState: boolean | undefined,
  sc: BABYLON.Scene,
  ctx: NodeMeshContext
) {
  if (!node || !isCargoNode(node.id, ctx.factoryLayout.nodes)) return;
  const newState = forceState !== undefined ? forceState : !node.has_cargo;
  node.has_cargo = newState;

  const pad = ctx.nodeMeshesMap.get(node.id);
  const existingCargo = ctx.stationCargoMap.get(node.id);
  const existingPallet = ctx.stationPalletMap.get(node.id);

  if (newState) {
    if (pad) {
      pad.position.y = 0.16;
    }
    if (!existingPallet) {
      try {
        const palletRoot = await loadNormalizedPallet(sc);
        palletRoot.name = `StationPallet_${node.id}`;
        palletRoot.metadata = { type: 'node', id: node.id, subType: 'pallet' };
        if (pad) {
          palletRoot.parent = pad;
          palletRoot.position.set(0, -0.16, 0);
        } else {
          palletRoot.position.set(node.x, 0, node.z);
        }
        for (const m of (palletRoot.getChildMeshes ? palletRoot.getChildMeshes() : [])) {
          m.metadata = { type: 'node', id: node.id, subType: 'pallet' };
          m.isPickable = true;
        }
        ctx.stationPalletMap.set(node.id, palletRoot);
      } catch (err) {
        console.warn('Failed to load station pallet:', err);
      }
    }
    if (!existingCargo) {
      const boxMesh = await loadNormalizedCargo(sc);
      boxMesh.name = `StationCargo_${node.id}`;
      if (pad) {
        boxMesh.parent = pad;
        boxMesh.position.set(0, 0.02 + CARGO_HALF, 0);
      } else {
        boxMesh.position.set(node.x, 0.16 + 0.02 + CARGO_HALF, node.z);
      }
      boxMesh.metadata = { type: 'node', id: node.id, subType: 'cargo' };
      boxMesh.isPickable = true;
      ctx.stationCargoMap.set(node.id, boxMesh);
    }
    const existingCargoIcon = sc?.getMeshByName(`CargoIcon_${node.id}`);
    if (existingCargoIcon) {
      existingCargoIcon.isVisible = false;
    }
  } else {
    if (pad) {
      pad.position.y = 0.04;
    }
    if (existingCargo) {
      existingCargo.dispose();
      ctx.stationCargoMap.delete(node.id);
    }
    if (existingPallet) {
      existingPallet.dispose();
      ctx.stationPalletMap.delete(node.id);
    }
    const existingCargoIcon = sc?.getMeshByName(`CargoIcon_${node.id}`);
    if (existingCargoIcon) {
      existingCargoIcon.isVisible = true;
    }
  }
  updateNodeTexture(node.id, ctx);
  ctx.markLayoutDirty?.();
  ctx.notify?.(`${node.name || node.id}: 已設為「${node.has_cargo ? '有貨 (棧板+貨物)' : '無貨 (無棧板)'}」`, 'info');
}

export function createNodeInScene(
  sc: BABYLON.Scene,
  node: LayoutNode,
  ctx: NodeMeshContext
) {
  const isCargoStation = isCargoNode(node.id, ctx.factoryLayout.nodes);
  const padY = (isCargoStation && node.has_cargo) ? 0.16 : 0.04;

  // Station chassis disc
  const pad = BABYLON.MeshBuilder.CreateCylinder(`Pad_${node.id}`, {
    diameter: 0.90,
    height: 0.03,
    tessellation: 36
  }, sc);
  pad.position.set(node.x, padY, node.z);
  pad.rotation.y = node.rotationY || 0;
  pad.metadata = { type: 'node', id: node.id };
  pad.isPickable = true;

  const padMat = new BABYLON.StandardMaterial(`PadMat_${node.id}`, sc);
  padMat.diffuseColor = new BABYLON.Color3(0.08, 0.12, 0.20);
  padMat.emissiveColor = new BABYLON.Color3(0.04, 0.06, 0.10);
  pad.material = padMat;

  // Vector Dynamic Texture Plane with Double Concentric Rings & Concept Blueprint Icons
  const iconPlane = BABYLON.MeshBuilder.CreatePlane(`NodeIconPlane_${node.id}`, { size: 0.88 }, sc);
  iconPlane.rotation.x = Math.PI / 2;
  iconPlane.position.set(0, 0.021, 0);
  iconPlane.parent = pad;
  iconPlane.isPickable = false;

  const nodeTex = new BABYLON.DynamicTexture(`NodeTex_${node.id}`, { width: 512, height: 512 }, sc, true);
  nodeTex.hasAlpha = true;
  const context2d = nodeTex.getContext() as unknown as CanvasRenderingContext2D;
  const status = getNodeStatus(node.id, ctx.factoryLayout, ctx.fleetVehicles, ctx.agvState);
  const badge = getNodeBadge(
    node.id,
    ctx.is3DQuickDispatchActive?.value,
    ctx.currentAgvStartNode?.value,
    ctx.quickDispatchSteps?.value
  );
  drawStationIconTexture(context2d, 512, 512, node, status, badge);
  nodeTex.update();

  const iconMat = new BABYLON.StandardMaterial(`NodeIconMat_${node.id}`, sc);
  iconMat.diffuseTexture = nodeTex;
  iconMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  iconMat.useAlphaFromDiffuseTexture = true;
  iconMat.disableLighting = true;
  iconPlane.material = iconMat;

  ctx.nodeTextureMap.set(node.id, { texture: nodeTex, plane: iconPlane });

  // If Cargo station: Plastic pallet + Cargo box ONLY when node.has_cargo is true
  if (isCargoStation) {
    if (node.has_cargo) {
      loadNormalizedPallet(sc).then(palletRoot => {
        palletRoot.name = `StationPallet_${node.id}`;
        palletRoot.parent = pad;
        palletRoot.metadata = { type: 'node', id: node.id, subType: 'pallet' };
        for (const m of (palletRoot.getChildMeshes ? palletRoot.getChildMeshes() : [])) {
          m.metadata = { type: 'node', id: node.id, subType: 'pallet' };
          m.isPickable = true;
        }
        palletRoot.position.set(0, -0.16, 0);
        ctx.stationPalletMap.set(node.id, palletRoot);
      }).catch(err => {
        console.warn('Fallback procedural pallet:', err);
      });

      loadNormalizedCargo(sc).then(boxMesh => {
        boxMesh.name = `StationCargo_${node.id}`;
        boxMesh.parent = pad;
        boxMesh.position.set(0, 0.02 + CARGO_HALF, 0);
        boxMesh.metadata = { type: 'node', id: node.id, subType: 'cargo' };
        boxMesh.isPickable = true;
        ctx.stationCargoMap.set(node.id, boxMesh);
      });
    }
  }

  // Direct 2D floor planar drag behavior without directional arrows
  const dragBehavior = new BABYLON.PointerDragBehavior({
    dragPlaneNormal: new BABYLON.Vector3(0, 1, 0)
  });
  dragBehavior.useObjectOrientationForDragging = false;
  dragBehavior.enabled = (ctx.currentAppMode?.value === 'edit' && ctx.currentEditorTool?.value === 'select');

  let dragStartPos = { x: node.x, z: node.z };

  dragBehavior.onDragStartObservable.add(() => {
    if (ctx.camera) ctx.camera.detachControl();
    dragStartPos = { x: node.x, z: node.z };
    if (ctx.selectedEditorNodeId) ctx.selectedEditorNodeId.value = node.id;
    if (ctx.selectedEditorPropId) ctx.selectedEditorPropId.value = null;
    ctx.gizmoManager?.attachToMesh(null);
    if (ctx.highlightSelectedNode) ctx.highlightSelectedNode(sc, pad);
  });

  dragBehavior.onDragObservable.add(() => {
    pad.position.y = (isCargoNode(node.id, ctx.factoryLayout.nodes) && node.has_cargo) ? 0.16 : 0.04;
    const snap = ctx.computeSmartSnap
      ? ctx.computeSmartSnap(pad.position.x, pad.position.z, node.id)
      : { snappedX: pad.position.x, snappedZ: pad.position.z, alignedNodesX: [], alignedNodesZ: [] };
    pad.position.x = snap.snappedX;
    pad.position.z = snap.snappedZ;
    ctx.updateAlignmentGuideLines?.(sc, snap.snappedX, snap.snappedZ, snap.alignedNodesX, snap.alignedNodesZ);

    const n = ctx.factoryLayout.nodes.find(item => item.id === node.id);
    if (n) {
      n.x = snap.snappedX;
      n.z = snap.snappedZ;
      ctx.updateEdgesForNode?.(sc, node.id);
    }

    // Real-time synchronization of directional arrows during dragging
    const widgetRoot = ctx.getNodeRotationWidgetRoot?.();
    if (widgetRoot && ctx.selectedEditorNodeId?.value === node.id) {
      const widgetY = (isCargoNode(node.id, ctx.factoryLayout.nodes) && node.has_cargo) ? 0.175 : 0.046;
      widgetRoot.position.set(snap.snappedX, widgetY, snap.snappedZ);
    }
  });

  dragBehavior.onDragEndObservable.add(() => {
    const canvas = ctx.getCanvas?.();
    if (ctx.camera && canvas) ctx.camera.attachControl(canvas, true);
    pad.position.y = (isCargoNode(node.id, ctx.factoryLayout.nodes) && node.has_cargo) ? 0.16 : 0.04;
    ctx.clearAlignmentGuideLines?.();
    const snap = ctx.computeSmartSnap
      ? ctx.computeSmartSnap(pad.position.x, pad.position.z, node.id)
      : { snappedX: pad.position.x, snappedZ: pad.position.z, alignedNodesX: [], alignedNodesZ: [] };
    const candidateX = snap.snappedX;
    const candidateZ = snap.snappedZ;
    pad.position.x = candidateX;
    pad.position.z = candidateZ;

    const collision = ctx.checkObjectClearanceCollision
      ? ctx.checkObjectClearanceCollision(candidateX, candidateZ, node.id, MIN_CLEARANCE_DIST)
      : { hasCollision: false };
    const n = ctx.factoryLayout.nodes.find(item => item.id === node.id);

    if (collision.hasCollision && n) {
      n.x = dragStartPos.x;
      n.z = dragStartPos.z;
      pad.position.x = dragStartPos.x;
      pad.position.z = dragStartPos.z;
      ctx.updateEdgesForNode?.(sc, node.id);
      const widgetRoot = ctx.getNodeRotationWidgetRoot?.();
      if (widgetRoot && ctx.selectedEditorNodeId?.value === node.id) {
        const widgetY = (isCargoNode(node.id, ctx.factoryLayout.nodes) && node.has_cargo) ? 0.175 : 0.046;
        widgetRoot.position.set(dragStartPos.x, widgetY, dragStartPos.z);
      }
      ctx.notify?.(`⚠️ 物件重疊衝突：與 ${collision.conflictingWith} 間距過近 (${collision.distance?.toFixed(2)}m < ${MIN_CLEARANCE_DIST}m)，已自動復原至安全間距！`, 'warn');
    } else if (n) {
      n.x = candidateX;
      n.z = candidateZ;
      pad.position.x = n.x;
      pad.position.z = n.z;
      ctx.updateEdgesForNode?.(sc, node.id);
      const widgetRoot = ctx.getNodeRotationWidgetRoot?.();
      if (widgetRoot && ctx.selectedEditorNodeId?.value === node.id) {
        const widgetY = (isCargoNode(node.id, ctx.factoryLayout.nodes) && node.has_cargo) ? 0.175 : 0.046;
        widgetRoot.position.set(n.x, widgetY, n.z);
      }
      ctx.markLayoutDirty?.();
      ctx.notify?.(`已移動站點: ${node.name || node.id}`, 'info');
    }

    if (ctx.selectedEditorNodeId?.value === node.id) {
      ctx.createNodeRotationWidget?.(sc, pad, node.id);
    }
  });

  pad.addBehavior(dragBehavior);
  ctx.nodeMeshesMap.set(node.id, pad);
}
