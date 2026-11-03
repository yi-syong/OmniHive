import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { LayoutNode, LayoutProp } from '../../types';
import type { CollisionCheckResult } from '../types';

export const MIN_CLEARANCE_DIST = 0.70;

export interface SelectionState {
  nodeSelectionRing: BABYLON.Mesh | null;
}

export function createSelectionState(): SelectionState {
  return {
    nodeSelectionRing: null,
  };
}

export interface SelectionContext {
  factoryLayout: { nodes: LayoutNode[]; props: LayoutProp[]; edges: any[] };
  nodeMeshesMap: Map<string, BABYLON.Mesh>;
  propMeshesMap: Map<string, BABYLON.AbstractMesh>;
  selectedEditorNodeId: Ref<string | null>;
  selectedEditorPropId: Ref<string | null>;
  selectionState: SelectionState;
  getGizmoManager: () => BABYLON.GizmoManager | null;
  setGizmoManager: (gm: BABYLON.GizmoManager) => void;
  updateEdgesForNode: (sc: BABYLON.Scene, nodeId: string) => void;
  rebuildEdgesOnly: (sc: BABYLON.Scene) => void;
  createNodeRotationWidget: (sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh, nodeId: string) => void;
  clearNodeRotationWidget: () => void;
  checkObjectClearanceCollision: (x: number, z: number, id: string, minDist: number) => CollisionCheckResult;
  markLayoutDirty: () => void;
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}

export function highlightSelectedNode(
  sc: BABYLON.Scene,
  nodeMesh: BABYLON.AbstractMesh,
  ctx: SelectionContext
) {
  clearNodeSelection(ctx);
  const nodeId = nodeMesh.metadata?.id;
  if (nodeId) {
    ctx.selectedEditorNodeId.value = nodeId;
    ctx.selectedEditorPropId.value = null;
    ctx.createNodeRotationWidget(sc, nodeMesh, nodeId);
  }
}

export function highlightStartNode(
  sc: BABYLON.Scene,
  nodeMesh: BABYLON.AbstractMesh,
  ctx: SelectionContext
) {
  clearNodeSelection(ctx);
  const ring = BABYLON.MeshBuilder.CreateTorus('SelectedNodeTorus', { 
    diameter: 0.85, 
    thickness: 0.025, 
    tessellation: 32 
  }, sc);
  ring.parent = nodeMesh;
  ring.position.set(0, 0.01, 0);
  const mat = new BABYLON.StandardMaterial('StartNodeMat', sc);
  mat.emissiveColor = new BABYLON.Color3(0.96, 0.62, 0.04);
  ring.material = mat;
  ring.isPickable = false;
  ctx.selectionState.nodeSelectionRing = ring;
}

export function clearNodeSelection(ctx: SelectionContext) {
  ctx.clearNodeRotationWidget();
  if (ctx.selectionState.nodeSelectionRing) {
    ctx.selectionState.nodeSelectionRing.dispose();
    ctx.selectionState.nodeSelectionRing = null;
  }
  ctx.selectedEditorNodeId.value = null;
}

export function syncGizmoTargetToLayout(ctx: SelectionContext, sc: BABYLON.Scene) {
  const gm = ctx.getGizmoManager();
  if (!gm || !gm.attachedMesh) return;
  const m = gm.attachedMesh;
  const meta = m.metadata;
  if (!meta) return;

  if (meta.type === 'node') {
    m.position.y = 0.04;
    const node = ctx.factoryLayout.nodes.find(n => n.id === meta.id);
    if (node) {
      node.x = Math.round(m.position.x * 100) / 100;
      node.z = Math.round(m.position.z * 100) / 100;
      node.y = 0;
      ctx.rebuildEdgesOnly(sc);
    }
  } else if (meta.type === 'prop') {
    const prop = ctx.factoryLayout.props.find(p => p.id === meta.id);
    if (prop) {
      prop.x = Math.round(m.position.x * 100) / 100;
      prop.z = Math.round(m.position.z * 100) / 100;
      if (m.rotationQuaternion) {
        prop.rotationY = Math.round(m.rotationQuaternion.toEulerAngles().y * 100) / 100;
      } else {
        prop.rotationY = Math.round(m.rotation.y * 100) / 100;
      }
    }
  }
}

export function attachGizmoToTarget(
  sc: BABYLON.Scene,
  mesh: BABYLON.AbstractMesh | null,
  ctx: SelectionContext
) {
  const gm = ctx.getGizmoManager();
  if (!gm) return;
  if (!mesh || !mesh.metadata) {
    gm.attachToMesh(null);
    clearNodeSelection(ctx);
    ctx.selectedEditorNodeId.value = null;
    ctx.selectedEditorPropId.value = null;
    return;
  }

  const meta = mesh.metadata;
  if (meta.type === 'node') {
    ctx.selectedEditorNodeId.value = meta.id;
    ctx.selectedEditorPropId.value = null;
    const targetNodeMesh = ctx.nodeMeshesMap.get(meta.id) || mesh;
    highlightSelectedNode(sc, targetNodeMesh, ctx);

    // Requirement: No ugly gizmo arrows for nodes! Direct floor PointerDragBehavior is used.
    gm.attachToMesh(null);
    gm.rotationGizmoEnabled = false;
    gm.positionGizmoEnabled = false;
  } else if (meta.type === 'prop') {
    clearNodeSelection(ctx);
    ctx.selectedEditorPropId.value = meta.id;
    ctx.selectedEditorNodeId.value = null;
    const targetPropMesh = ctx.propMeshesMap.get(meta.id) || mesh;
    gm.positionGizmoEnabled = true;
    gm.rotationGizmoEnabled = true;
    gm.attachToMesh(targetPropMesh);

    if (gm.gizmos.positionGizmo) {
      const pos = gm.gizmos.positionGizmo;
      if (pos.yGizmo) pos.yGizmo.isEnabled = false;
      pos.planarGizmoEnabled = true;
      if (pos.xGizmo) pos.xGizmo.isEnabled = true;
      if (pos.zGizmo) pos.zGizmo.isEnabled = true;
      if (pos.xPlaneGizmo) pos.xPlaneGizmo.isEnabled = false;
      if (pos.zPlaneGizmo) pos.zPlaneGizmo.isEnabled = false;
      if (pos.yPlaneGizmo) pos.yPlaneGizmo.isEnabled = true;
    }
    if (gm.gizmos.rotationGizmo) {
      const rot = gm.gizmos.rotationGizmo;
      if (rot.xGizmo) rot.xGizmo.isEnabled = false;
      if (rot.zGizmo) rot.zGizmo.isEnabled = false;
      if (rot.yGizmo) rot.yGizmo.isEnabled = true;
    }
  }
}

export function setupGizmoManager(sc: BABYLON.Scene, ctx: SelectionContext) {
  const gm = new BABYLON.GizmoManager(sc);
  gm.positionGizmoEnabled = true;
  gm.rotationGizmoEnabled = true;
  ctx.setGizmoManager(gm);

  let nodeDragStartPos = { x: 0, z: 0 };
  let propDragStartPos = { x: 0, z: 0 };

  if (gm.gizmos.positionGizmo) {
    const pos = gm.gizmos.positionGizmo;
    pos.planarGizmoEnabled = true;
    if (pos.yGizmo) pos.yGizmo.isEnabled = false; // Strictly forbid Y-axis vertical translation!
    if (pos.xPlaneGizmo) pos.xPlaneGizmo.isEnabled = false;
    if (pos.zPlaneGizmo) pos.zPlaneGizmo.isEnabled = false;
    if (pos.yPlaneGizmo) pos.yPlaneGizmo.isEnabled = true; // X-Z ground plane movement handle

    pos.onDragStartObservable.add(() => {
      const m = gm.attachedMesh;
      if (m && m.metadata?.type === 'node') {
        const n = ctx.factoryLayout.nodes.find(p => p.id === m.metadata.id);
        if (n) {
          nodeDragStartPos = { x: n.x, z: n.z };
        }
      } else if (m && m.metadata?.type === 'prop') {
        const prop = ctx.factoryLayout.props.find(p => p.id === m.metadata.id);
        if (prop) {
          propDragStartPos = { x: prop.x, z: prop.z };
        }
      }
    });

    pos.onDragObservable.add(() => {
      const m = gm.attachedMesh;
      if (m && m.metadata?.type === 'node') {
        m.position.y = 0.04;
        const n = ctx.factoryLayout.nodes.find(item => item.id === m.metadata.id);
        if (n) {
          n.x = m.position.x;
          n.z = m.position.z;
          ctx.updateEdgesForNode(sc, n.id);
        }
      }
    });

    pos.onDragEndObservable.add(() => {
      const m = gm.attachedMesh;
      if (m && m.metadata?.type === 'node') {
        m.position.y = 0.04;
        const candidateX = Math.round(m.position.x * 100) / 100;
        const candidateZ = Math.round(m.position.z * 100) / 100;
        const collision = ctx.checkObjectClearanceCollision(candidateX, candidateZ, m.metadata.id, MIN_CLEARANCE_DIST);
        const n = ctx.factoryLayout.nodes.find(item => item.id === m.metadata.id);
        if (collision.hasCollision && n) {
          n.x = nodeDragStartPos.x;
          n.z = nodeDragStartPos.z;
          m.position.x = nodeDragStartPos.x;
          m.position.z = nodeDragStartPos.z;
          ctx.updateEdgesForNode(sc, n.id);
          ctx.notify(`⚠️ 物件重疊衝突：與 ${collision.conflictingWith} 間距過近 (${collision.distance?.toFixed(2)}m < ${MIN_CLEARANCE_DIST}m)，已自動復原至安全位置！`, 'warn');
          return;
        } else if (n) {
          n.x = candidateX;
          n.z = candidateZ;
          m.position.x = candidateX;
          m.position.z = candidateZ;
          ctx.updateEdgesForNode(sc, n.id);
          ctx.markLayoutDirty();
        }
      } else if (m && m.metadata?.type === 'prop') {
        const prop = ctx.factoryLayout.props.find(p => p.id === m.metadata.id);
        if (prop) {
          const candidateX = Math.round(m.position.x * 100) / 100;
          const candidateZ = Math.round(m.position.z * 100) / 100;
          const collision = ctx.checkObjectClearanceCollision(candidateX, candidateZ, prop.id, MIN_CLEARANCE_DIST);
          if (collision.hasCollision) {
            // Revert!
            m.position.x = propDragStartPos.x;
            m.position.z = propDragStartPos.z;
            prop.x = propDragStartPos.x;
            prop.z = propDragStartPos.z;
            ctx.notify(`⚠️ 物件重疊衝突：與 ${collision.conflictingWith} 間距過近 (${collision.distance?.toFixed(2)}m < ${MIN_CLEARANCE_DIST}m)，已自動復原至安全位置！`, 'warn');
            return;
          }
        }
      }
      syncGizmoTargetToLayout(ctx, sc);
      ctx.markLayoutDirty();
    });
  }

  if (gm.gizmos.rotationGizmo) {
    const rot = gm.gizmos.rotationGizmo;
    if (rot.xGizmo) rot.xGizmo.isEnabled = false;
    if (rot.zGizmo) rot.zGizmo.isEnabled = false;
    if (rot.yGizmo) rot.yGizmo.isEnabled = true; // Allow Y rotation for props only

    rot.onDragEndObservable.add(() => {
      syncGizmoTargetToLayout(ctx, sc);
      ctx.markLayoutDirty();
    });
  }

  // Detach initially
  gm.attachToMesh(null);
  gm.positionGizmoEnabled = false;
  gm.rotationGizmoEnabled = false;
}
