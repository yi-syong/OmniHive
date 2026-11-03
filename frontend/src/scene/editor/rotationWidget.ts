import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { LayoutNode, LayoutProp } from '../../types';
import { drawLargeDirectionArrow } from '../textures/editorGraphics';
import { isCargoNode } from '../layout/nodeUtils';

export interface RotationWidgetState {
  widgetRoot: BABYLON.TransformNode | null;
  widgetMeshes: BABYLON.AbstractMesh[];
}

export function clearNodeRotationWidget(state: RotationWidgetState) {
  for (const m of state.widgetMeshes) {
    if (m.material) m.material.dispose();
    m.dispose();
  }
  state.widgetMeshes.length = 0;
  if (state.widgetRoot) {
    state.widgetRoot.dispose();
    state.widgetRoot = null;
  }
}

export function createNodeRotationWidget(
  sc: BABYLON.Scene,
  nodeMesh: BABYLON.AbstractMesh | null,
  nodeId: string,
  nodes: LayoutNode[],
  state: RotationWidgetState
) {
  clearNodeRotationWidget(state);

  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  const currentDeg = Math.round(((node.rotationY || 0) * 180) / Math.PI) % 360;
  const normalizedDeg = ((currentDeg % 360) + 360) % 360;

  const cx = nodeMesh?.position?.x ?? node.x;
  const cz = nodeMesh?.position?.z ?? node.z;
  const y = (isCargoNode(nodeId, nodes) && node.has_cargo) ? 0.175 : 0.046;

  // Root TransformNode for widget so arrows move synchronously with the node during drag
  state.widgetRoot = new BABYLON.TransformNode(`NodeRotWidgetRoot_${nodeId}`, sc);
  state.widgetRoot.position.set(cx, y, cz);

  // Helper to create 3D bold planar arrow markers (NO extra lines, clean floating arrows)
  const makeArrow = (
    btnName: string, 
    relX: number, 
    relZ: number, 
    angleRad: number,
    deg: number,
    isActive: boolean
  ) => {
    const arrowPlane = BABYLON.MeshBuilder.CreatePlane(btnName, {
      width: 0.52,
      height: 0.52
    }, sc);
    arrowPlane.rotation.x = Math.PI / 2;
    arrowPlane.position.set(relX, 0.005, relZ);
    arrowPlane.parent = state.widgetRoot;
    arrowPlane.metadata = { type: 'rotate_action', action: 'set', deg, id: nodeId };
    arrowPlane.isPickable = true;

    const dt = new BABYLON.DynamicTexture(`Tex_${btnName}`, { width: 256, height: 256 }, sc, false);
    dt.hasAlpha = true;
    const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
    drawLargeDirectionArrow(ctx, 256, 256, angleRad, isActive);
    dt.update();

    const mat = new BABYLON.StandardMaterial(`Mat_${btnName}`, sc);
    mat.diffuseTexture = dt;
    mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    arrowPlane.material = mat;

    state.widgetMeshes.push(arrowPlane);
  };

  // 4 Directional Arrows (Fixed World Orientation: ↑=0°, →=90°, ↓=180°, ←=270°)
  const arrowDist = 0.78;
  makeArrow(`BtnDir_Up_${nodeId}`, 0, arrowDist, 0, 0, normalizedDeg === 0);
  makeArrow(`BtnDir_Right_${nodeId}`, arrowDist, 0, Math.PI / 2, 90, normalizedDeg === 90);
  makeArrow(`BtnDir_Down_${nodeId}`, 0, -arrowDist, Math.PI, 180, normalizedDeg === 180);
  makeArrow(`BtnDir_Left_${nodeId}`, -arrowDist, 0, -Math.PI / 2, 270, normalizedDeg === 270);
}

export interface RotationOpsContext {
  sc: BABYLON.Scene;
  nodes: LayoutNode[];
  props: LayoutProp[];
  nodeMeshesMap: Map<string, BABYLON.Mesh>;
  propMeshesMap: Map<string, BABYLON.AbstractMesh>;
  selectedEditorNodeId: Ref<string | null>;
  selectedEditorPropId: Ref<string | null>;
  widgetState: RotationWidgetState;
  cargoContextMenuNode?: { value: { node?: LayoutNode | null } };
  markLayoutDirty: () => void;
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}

export function rotateNode(
  nodeId: string,
  deltaDegrees: number = 90,
  ctx: RotationOpsContext
) {
  const node = ctx.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const currentRad = node.rotationY || 0;
  let currentDeg = Math.round((currentRad * 180) / Math.PI);
  currentDeg = Math.round(currentDeg / 90) * 90;
  let nextDeg = (currentDeg + deltaDegrees) % 360;
  if (nextDeg < 0) nextDeg += 360;

  const nextRad = Math.round(((nextDeg * Math.PI) / 180) * 10000) / 10000;
  node.rotationY = nextRad;

  const pad = ctx.nodeMeshesMap.get(nodeId);
  if (pad) {
    pad.rotation.y = nextRad;
    if (ctx.selectedEditorNodeId.value === nodeId) {
      createNodeRotationWidget(ctx.sc, pad, nodeId, ctx.nodes, ctx.widgetState);
    }
  }
  if (ctx.cargoContextMenuNode?.value?.node?.id === nodeId) {
    ctx.cargoContextMenuNode.value.node.rotationY = nextRad;
  }

  ctx.markLayoutDirty();
  ctx.notify(`已將站點 ${node.name || node.id} 轉向至 ${nextDeg}°`, 'info');
}

export function setNodeHeading(
  nodeId: string,
  targetDeg: number,
  ctx: RotationOpsContext
) {
  const node = ctx.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const nextDeg = ((targetDeg % 360) + 360) % 360;
  const nextRad = Math.round(((nextDeg * Math.PI) / 180) * 10000) / 10000;
  node.rotationY = nextRad;

  const pad = ctx.nodeMeshesMap.get(nodeId);
  if (pad) {
    pad.rotation.y = nextRad;
    if (ctx.selectedEditorNodeId.value === nodeId) {
      createNodeRotationWidget(ctx.sc, pad, nodeId, ctx.nodes, ctx.widgetState);
    }
  }
  if (ctx.cargoContextMenuNode?.value?.node?.id === nodeId) {
    ctx.cargoContextMenuNode.value.node.rotationY = nextRad;
  }

  ctx.markLayoutDirty();
  ctx.notify(`已將站點 ${node.name || node.id} 轉向至 ${nextDeg}°`, 'info');
}

export function rotateProp(
  propId: string,
  deltaDegrees: number = 90,
  ctx: RotationOpsContext
) {
  const prop = ctx.props.find(p => p.id === propId);
  if (!prop) return;
  const currentRad = prop.rotationY || 0;
  let currentDeg = Math.round((currentRad * 180) / Math.PI);
  currentDeg = Math.round(currentDeg / 90) * 90;
  let nextDeg = (currentDeg + deltaDegrees) % 360;
  if (nextDeg < 0) nextDeg += 360;

  const nextRad = Math.round(((nextDeg * Math.PI) / 180) * 10000) / 10000;
  prop.rotationY = nextRad;
  const mesh = ctx.propMeshesMap.get(propId);
  if (mesh) {
    mesh.rotation.y = nextRad;
  }
  ctx.markLayoutDirty();
  ctx.notify(`已將物件 ${propId} 旋轉至 ${nextDeg}°`, 'info');
}

export function rotateSelectedElement(
  deltaDegrees: number = 90,
  ctx: RotationOpsContext
) {
  if (ctx.selectedEditorNodeId.value) {
    rotateNode(ctx.selectedEditorNodeId.value, deltaDegrees, ctx);
  } else if (ctx.selectedEditorPropId.value) {
    rotateProp(ctx.selectedEditorPropId.value, deltaDegrees, ctx);
  }
}
