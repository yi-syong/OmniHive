import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { AppMode, EditorTool, FactoryLayout, LayoutNode } from '../../types';
import type { CollisionCheckResult, SmartSnapResult, VehicleVisual } from '../types';
import { getNodeFunctionLabel, getNodeTypeDefaultDesc } from '../layout/nodeUtils';
import { MIN_CLEARANCE_DIST } from './selection';
import { positionGhostPlacementPad, type GhostPadState } from './ghostPad';
import type { EdgePreviewState } from './edgePreview';
import {
  triggerNodeTargetRipple,
  openCargoContextMenu,
  closeCargoContextMenu,
  setNodeCargoStatus,
  handleRightClick
} from './cargoMenu';

export {
  triggerNodeTargetRipple,
  openCargoContextMenu,
  closeCargoContextMenu,
  setNodeCargoStatus,
  handleRightClick
};

export interface PointerEventsContext {
  currentAppMode: Ref<AppMode>;
  currentEditorTool: Ref<EditorTool>;
  selectedVehicleId: Ref<string>;
  selectVehicle: (id: string) => void;
  dashboardActiveTab: Ref<string>;
  is3DQuickDispatchActive: Ref<boolean>;
  resetDispatchSteps: () => void;
  setCameraView: (view: 'iso' | 'top' | 'follow') => void;
  vehicleVisuals: Map<string, VehicleVisual>;
  updateQuickDispatchPreviewLine: (sc: BABYLON.Scene) => void;
  nodeMeshesMap: Map<string, BABYLON.Mesh>;
  resolvePickedNodeFromPointer: (sc: BABYLON.Scene, pickResult?: BABYLON.Nullable<BABYLON.PickingInfo>) => string | null;
  addOrSelectNodeFromMap: (nodeId: string) => void;
  factoryLayout: FactoryLayout;
  fleetVehicles: Record<string, any>;
  cargoContextMenu: Ref<{ visible: boolean; x: number; y: number; node: LayoutNode | null }>;
  toggleStationCargo: (node: LayoutNode, hasCargo: boolean) => Promise<void>;
  edgeFirstNodeId: Ref<string | null>;
  hoveredNodeId: Ref<string | null>;
  completeEdgeConnection: (sc: BABYLON.Scene, startId: string, endId: string) => void;
  cancelEdgeConnection: () => void;
  disposeEdgePreviewMeshes: (includeStartRing?: boolean) => void;
  updateEdgeCreationPreview: (sc: BABYLON.Scene, startPoint: BABYLON.Vector3, endPoint: BABYLON.Vector3, isSnapped: boolean, targetId: string | null) => void;
  edgePreviewState: EdgePreviewState;
  newNodeFunction: Ref<'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'>;
  updateGhostPadVisual: (sc: BABYLON.Scene, func: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo') => void;
  hideGhostPlacementPad: () => void;
  ghostPadState: GhostPadState;
  computeSmartSnap: (x: number, z: number) => SmartSnapResult;
  checkObjectClearanceCollision: (x: number, z: number, excludeId?: string, minDist?: number) => CollisionCheckResult;
  setNodeHeading: (id: string, deg: number) => void;
  rotateNode: (id: string, deg: number) => void;
  selectedEditorNodeId: Ref<string | null>;
  selectedEditorPropId: Ref<string | null>;
  attachGizmoToTarget: (mesh: BABYLON.AbstractMesh | null) => void;
  highlightSelectedNode: (sc: BABYLON.Scene, mesh: BABYLON.AbstractMesh) => void;
  highlightStartNode: (sc: BABYLON.Scene, mesh: BABYLON.AbstractMesh) => void;
  clearNodeSelection: () => void;
  createNodeInScene: (sc: BABYLON.Scene, node: LayoutNode) => void;
  clearAlignmentGuideLines: () => void;
  markLayoutDirty: () => void;
  deleteNodeById: (id: string) => void;
  deleteEdgeById: (id: string) => void;
  deletePropById: (id: string) => void;
  camera: BABYLON.ArcRotateCamera | null;
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}

export function handlePointerUpInEditMode(
  sc: BABYLON.Scene,
  pointerInfo: BABYLON.PointerInfo,
  ctx: PointerEventsContext
) {
  const tool = ctx.currentEditorTool.value;
  if (tool === 'add_edge' && ctx.edgeFirstNodeId.value) {
    const targetId = ctx.hoveredNodeId.value || ctx.resolvePickedNodeFromPointer(sc, pointerInfo.pickInfo);
    if (targetId && targetId !== ctx.edgeFirstNodeId.value) {
      ctx.completeEdgeConnection(sc, ctx.edgeFirstNodeId.value, targetId);
    }
  }
}

export function handlePointerMoveInEditMode(
  sc: BABYLON.Scene,
  pointerInfo: BABYLON.PointerInfo,
  ctx: PointerEventsContext
) {
  const tool = ctx.currentEditorTool.value;

  if (tool === 'add_node') {
    if (ctx.edgePreviewState.rubberBandLine) {
      ctx.edgePreviewState.rubberBandLine.dispose();
      ctx.edgePreviewState.rubberBandLine = null;
    }
    ctx.hoveredNodeId.value = null;
    ctx.updateGhostPadVisual(sc, ctx.newNodeFunction.value);

    // Compute exact ground intersection using camera picking ray
    const ray = sc.createPickingRay(sc.pointerX, sc.pointerY, BABYLON.Matrix.Identity(), ctx.camera || sc.activeCamera);
    let floorPoint: BABYLON.Vector3 | null = null;
    if (ray && Math.abs(ray.direction.y) > 0.0001) {
      const t = (0.04 - ray.origin.y) / ray.direction.y;
      if (t > 0) {
        floorPoint = ray.origin.add(ray.direction.scale(t));
      }
    }

    if (floorPoint && ctx.ghostPadState.ghostPlacementPad) {
      const snap = ctx.computeSmartSnap(floorPoint.x, floorPoint.z);
      positionGhostPlacementPad(ctx.ghostPadState, snap.snappedX, snap.snappedZ);
      sc.defaultCursor = 'crosshair';
    } else {
      ctx.hideGhostPlacementPad();
    }
    return;
  }

  // Hide ghost pad if not in add_node mode
  ctx.hideGhostPlacementPad();

  if (tool === 'select') {
    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    const isRotateMesh = (
      pickedMesh?.metadata?.type === 'rotate_action' ||
      pickedMesh?.metadata?.type === 'rotate_handle' ||
      pickedMesh?.name?.startsWith('BtnDir_') ||
      pickedMesh?.name?.startsWith('BtnTurn_')
    );
    if (isRotateMesh) {
      sc.defaultCursor = 'pointer';
      return;
    }
  }

  if (tool === 'add_edge' && !ctx.edgeFirstNodeId.value) {
    ctx.disposeEdgePreviewMeshes(false);
    
    // Check if hovering over any node to highlight as candidate start
    const hoverNodeId = ctx.resolvePickedNodeFromPointer(sc, pointerInfo.pickInfo);
    if (hoverNodeId) {
      const node = ctx.factoryLayout.nodes.find(n => n.id === hoverNodeId);
      if (node) {
        sc.defaultCursor = 'pointer';
        if (!ctx.edgePreviewState.previewHoverStartRing) {
          ctx.edgePreviewState.previewHoverStartRing = BABYLON.MeshBuilder.CreateTorus('PreviewHoverStartRing', {
            diameter: 0.88,
            thickness: 0.025,
            tessellation: 32
          }, sc);
          const mat = new BABYLON.StandardMaterial('HoverStartMat', sc);
          mat.diffuseColor = new BABYLON.Color3(0.06, 0.75, 1.0);
          mat.emissiveColor = new BABYLON.Color3(0.06, 0.85, 1.0);
          ctx.edgePreviewState.previewHoverStartRing.material = mat;
          ctx.edgePreviewState.previewHoverStartRing.isPickable = false;
        }
        ctx.edgePreviewState.previewHoverStartRing.position.set(node.x, 0.045, node.z);
        ctx.edgePreviewState.previewHoverStartRing.setEnabled(true);
        return;
      }
    }
    if (ctx.edgePreviewState.previewHoverStartRing) {
      ctx.edgePreviewState.previewHoverStartRing.setEnabled(false);
    }
    sc.defaultCursor = 'crosshair';
    return;
  }

  if (tool === 'add_edge' && ctx.edgeFirstNodeId.value) {
    if (ctx.edgePreviewState.previewHoverStartRing) {
      ctx.edgePreviewState.previewHoverStartRing.setEnabled(false);
    }
    const startNode = ctx.factoryLayout.nodes.find(n => n.id === ctx.edgeFirstNodeId.value);
    if (!startNode) return;

    // Robust raycast onto ground plane y = 0.05
    const ray = sc.createPickingRay(sc.pointerX, sc.pointerY, BABYLON.Matrix.Identity(), ctx.camera || sc.activeCamera);
    let groundPoint: BABYLON.Vector3 | null = null;
    if (ray && Math.abs(ray.direction.y) > 0.0001) {
      const t = (0.05 - ray.origin.y) / ray.direction.y;
      if (t > 0) {
        groundPoint = ray.origin.add(ray.direction.scale(t));
      }
    }
    if (!groundPoint && pointerInfo.pickInfo?.pickedPoint) {
      groundPoint = pointerInfo.pickInfo.pickedPoint.clone();
      groundPoint.y = 0.05;
    }
    if (!groundPoint) return;

    // Check target node: direct pointer pick or magnetic snapping within 1.25m
    let targetId = ctx.resolvePickedNodeFromPointer(sc, pointerInfo.pickInfo);
    if (targetId === ctx.edgeFirstNodeId.value) {
      targetId = null;
    }

    if (!targetId && groundPoint) {
      let closestDist = 1.25;
      for (const node of ctx.factoryLayout.nodes) {
        if (node.id === ctx.edgeFirstNodeId.value) continue;
        const d = Math.hypot(node.x - groundPoint.x, node.z - groundPoint.z);
        if (d < closestDist) {
          closestDist = d;
          targetId = node.id;
        }
      }
    }

    const startPoint = new BABYLON.Vector3(startNode.x, 0.05, startNode.z);
    let endPoint: BABYLON.Vector3;
    let isSnapped = false;

    if (targetId) {
      const targetNode = ctx.factoryLayout.nodes.find(n => n.id === targetId);
      if (targetNode) {
        endPoint = new BABYLON.Vector3(targetNode.x, 0.05, targetNode.z);
        ctx.hoveredNodeId.value = targetId;
        sc.defaultCursor = 'pointer';
        isSnapped = true;
      } else {
        endPoint = groundPoint;
        ctx.hoveredNodeId.value = null;
        sc.defaultCursor = 'crosshair';
      }
    } else {
      endPoint = groundPoint;
      ctx.hoveredNodeId.value = null;
      sc.defaultCursor = 'crosshair';
    }

    ctx.updateEdgeCreationPreview(sc, startPoint, endPoint, isSnapped, targetId);
    return;
  }

  // Not in add_edge tool
  ctx.disposeEdgePreviewMeshes(false);
}

export function handlePointerDownInEditMode(
  sc: BABYLON.Scene,
  pointerInfo: BABYLON.PointerInfo,
  ctx: PointerEventsContext
) {
  const tool = ctx.currentEditorTool.value;
  const pickResult = pointerInfo.pickInfo;
  const pickedMesh = pickResult?.pickedMesh;

  if (tool === 'select') {
    if (!pickResult || !pickResult.hit) return;

    // Check if clicked directly on 3D rotation action buttons (上下左右 / 左轉右轉)
    const isRotateAction = (
      pickedMesh?.metadata?.type === 'rotate_action' ||
      pickedMesh?.metadata?.type === 'rotate_handle' ||
      pickedMesh?.name?.startsWith('BtnDir_') ||
      pickedMesh?.name?.startsWith('BtnTurn_')
    );
    if (isRotateAction) {
      const meta = pickedMesh?.metadata;
      const targetId = meta?.id || ctx.selectedEditorNodeId.value;
      if (targetId) {
        if (meta?.action === 'set') {
          ctx.setNodeHeading(targetId, meta.deg);
        } else {
          ctx.rotateNode(targetId, meta?.deg || 90);
        }
      }
      return;
    }

    const pickedNodeId = ctx.resolvePickedNodeFromPointer(sc, pickResult);
    if (pickedNodeId) {
      ctx.selectedEditorNodeId.value = pickedNodeId;
      ctx.selectedEditorPropId.value = null;
      const padMesh = ctx.nodeMeshesMap.get(pickedNodeId);
      if (padMesh) {
        ctx.attachGizmoToTarget(padMesh);
        ctx.highlightSelectedNode(sc, padMesh);
      }
    } else if (pickedMesh?.metadata?.type === 'prop') {
      ctx.selectedEditorPropId.value = pickedMesh.metadata.id;
      ctx.selectedEditorNodeId.value = null;
      ctx.attachGizmoToTarget(pickedMesh);
      ctx.clearNodeSelection();
    } else {
      ctx.selectedEditorNodeId.value = null;
      ctx.selectedEditorPropId.value = null;
      ctx.attachGizmoToTarget(null);
      ctx.clearNodeSelection();
    }
  } else if (tool === 'add_node') {
    let point = pickResult?.pickedPoint;
    if (!point) {
      const ray = sc.createPickingRay(sc.pointerX, sc.pointerY, BABYLON.Matrix.Identity(), ctx.camera || sc.activeCamera);
      if (ray && Math.abs(ray.direction.y) > 0.0001) {
        const t = (0.04 - ray.origin.y) / ray.direction.y;
        if (t > 0) {
          point = ray.origin.add(ray.direction.scale(t));
        }
      }
    }
    if (point) {
      const snap = ctx.computeSmartSnap(point.x, point.z);
      const targetX = snap.snappedX;
      const targetZ = snap.snappedZ;
      const collision = ctx.checkObjectClearanceCollision(targetX, targetZ, undefined, MIN_CLEARANCE_DIST);
      if (collision.hasCollision) {
        ctx.notify(`⚠️ 無法在此放置站點：與 ${collision.conflictingWith} 重疊 (${collision.distance?.toFixed(2)}m < ${MIN_CLEARANCE_DIST}m)，請保持安全間距！`, 'warn');
        return;
      }

      // Monotonic ID generation: find highest numeric suffix to prevent collision after deletions
      let maxNum = 0;
      for (const n of ctx.factoryLayout.nodes) {
        const m = n.id.match(/^Node-(\d+)$/);
        if (m) {
          const val = parseInt(m[1], 10);
          if (val > maxNum) maxNum = val;
        }
      }
      const newId = `Node-${String(maxNum + 1).padStart(2, '0')}`;
      const func = ctx.newNodeFunction.value;
      const typeLabel = getNodeFunctionLabel(func);

      const newNode: LayoutNode = {
        id: newId,
        name: `${typeLabel} ${newId}`,
        x: targetX,
        y: 0,
        z: targetZ,
        function: func,
        description: getNodeTypeDefaultDesc(func),
        has_cargo: false // 預設為無貨物狀態
      };
      ctx.factoryLayout.nodes.push(newNode);
      ctx.createNodeInScene(sc, newNode);

      ctx.hideGhostPlacementPad();
      ctx.clearAlignmentGuideLines();
      ctx.markLayoutDirty();
      ctx.notify(`已新增 ${typeLabel}: ${newId}`, 'success');
    }
  } else if (tool === 'add_edge') {
    const pickedNodeId = ctx.resolvePickedNodeFromPointer(sc, pickResult);
    if (pickedNodeId) {
      const nodeId = pickedNodeId;

      if (!ctx.edgeFirstNodeId.value) {
        // Step 1: Select start node
        ctx.edgeFirstNodeId.value = nodeId;
        const nodeMesh = ctx.nodeMeshesMap.get(nodeId) || pickedMesh;
        if (nodeMesh) ctx.highlightStartNode(sc, nodeMesh);
        ctx.notify(`已選取起點: ${nodeId}，請拖曳預覽線並點擊目標節點`, 'info');
      } else if (ctx.edgeFirstNodeId.value === nodeId) {
        ctx.notify('起點與終點不能為同一節點', 'warn');
      } else {
        // Step 2: Connect to end node
        ctx.completeEdgeConnection(sc, ctx.edgeFirstNodeId.value, nodeId);
      }
    } else {
      ctx.cancelEdgeConnection();
    }
  } else if (tool === 'delete') {
    const pickedNodeId = ctx.resolvePickedNodeFromPointer(sc, pickResult);
    if (pickedNodeId) {
      ctx.deleteNodeById(pickedNodeId);
      return;
    }
    if (pickedMesh && pickedMesh.metadata) {
      const meta = pickedMesh.metadata;
      if (meta.type === 'edge') {
        ctx.deleteEdgeById(meta.id);
      } else if (meta.type === 'prop') {
        ctx.deletePropById(meta.id);
      }
    }
  }
}

export function setupInteractivePointerEvents(
  sc: BABYLON.Scene,
  ctx: PointerEventsContext
) {
  sc.onPointerObservable.add((pointerInfo) => {
    // Requirement 5: Global Right-click handling for station cargo status editing
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
      const evt = pointerInfo.event as MouseEvent;
      if (evt && evt.button === 2) {
        handleRightClick(
          sc,
          pointerInfo,
          ctx.factoryLayout.nodes,
          ctx.resolvePickedNodeFromPointer,
          ctx.cargoContextMenu,
          ctx.notify
        );
        return;
      }
      if (ctx.cargoContextMenu.value.visible) {
        closeCargoContextMenu(ctx.cargoContextMenu);
      }
    }

    // 1. Simulation Mode: Interactive 3D Vehicle & Node Dispatch
    if (ctx.currentAppMode.value === 'simulate') {
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
        const pick = pointerInfo.pickInfo;
        if (pick && pick.hit && pick.pickedMesh) {
          const type = pick.pickedMesh.metadata?.type;
          if (type === 'agv' || type === 'node' || ctx.resolvePickedNodeFromPointer(sc, pick)) {
            sc.defaultCursor = 'pointer';
            return;
          }
        }
        sc.defaultCursor = 'default';
        return;
      }

      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
        const pick = pointerInfo.pickInfo;
        if (!pick || !pick.hit || !pick.pickedMesh) {
          return;
        }

        // Quick Dispatch in 3D: if user has already activated quick dispatch, prioritize selecting destination node!
        if (ctx.is3DQuickDispatchActive.value) {
          const targetNodeId = ctx.resolvePickedNodeFromPointer(sc, pick);
          const currVehNode = ctx.fleetVehicles[ctx.selectedVehicleId.value]?.task_info?.current_node;
          if (targetNodeId && targetNodeId !== currVehNode) {
            const padMesh = ctx.nodeMeshesMap.get(targetNodeId) || pick.pickedMesh;
            triggerNodeTargetRipple(sc, padMesh);
            ctx.addOrSelectNodeFromMap(targetNodeId);
            ctx.updateQuickDispatchPreviewLine(sc);
            const nodeObj = ctx.factoryLayout.nodes.find(n => n.id === targetNodeId);
            ctx.notify(`已加入站點: ${targetNodeId} (${nodeObj?.name || ''}) - ${getNodeFunctionLabel(nodeObj?.function || '')}`, 'info');
            return;
          }
        }

        // A. Clicked AGV Vehicle directly in 3D!
        if (pick.pickedMesh.metadata?.type === 'agv') {
          const vId = pick.pickedMesh.metadata.id || 'AGV-001';
          ctx.selectedVehicleId.value = vId;
          ctx.selectVehicle(vId);
          ctx.dashboardActiveTab.value = 'vehicle';
          ctx.is3DQuickDispatchActive.value = true;
          ctx.resetDispatchSteps();
          ctx.setCameraView('follow');
          for (const [id, visual] of ctx.vehicleVisuals.entries()) {
            if (visual.haloMesh) visual.haloMesh.isVisible = (vId === id);
          }
          ctx.updateQuickDispatchPreviewLine(sc);
          ctx.notify(`已鎖定車輛 ${ctx.selectedVehicleId.value}`, 'info');
          return;
        }

        // B. Clicked Node directly in 3D!
        const clickedNodeId = ctx.resolvePickedNodeFromPointer(sc, pick);
        if (clickedNodeId) {
          const padMesh = ctx.nodeMeshesMap.get(clickedNodeId) || pick.pickedMesh;
          triggerNodeTargetRipple(sc, padMesh);

          if (ctx.is3DQuickDispatchActive.value) {
            ctx.addOrSelectNodeFromMap(clickedNodeId);
            ctx.updateQuickDispatchPreviewLine(sc);
            const nodeObj = ctx.factoryLayout.nodes.find(n => n.id === clickedNodeId);
            ctx.notify(`已加入站點: ${clickedNodeId} (${nodeObj?.name || ''}) - ${getNodeFunctionLabel(nodeObj?.function || '')}`, 'info');
          } else {
            const nodeObj = ctx.factoryLayout.nodes.find(n => n.id === clickedNodeId);
            ctx.notify(`站點資訊: ${clickedNodeId} (${nodeObj?.name || ''}) - ${getNodeFunctionLabel(nodeObj?.function || '')}`, 'info');
          }
          return;
        }
      }
      return;
    }

    // 2. Edit Mode: Tool interactions
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
      handlePointerMoveInEditMode(sc, pointerInfo, ctx);
    } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
      handlePointerDownInEditMode(sc, pointerInfo, ctx);
    } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
      handlePointerUpInEditMode(sc, pointerInfo, ctx);
    }
  });
}
