import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { LayoutEdge } from '../../types';

export interface EdgePreviewState {
  previewEdgeTube: BABYLON.Mesh | null;
  rubberBandLine: BABYLON.LinesMesh | null;
  previewEdgeArrows: BABYLON.AbstractMesh[];
  previewTargetSnapRing: BABYLON.Mesh | null;
  previewEndpointReticle: BABYLON.Mesh | null;
  previewEdgeBadge: BABYLON.Mesh | null;
  previewHoverStartRing: BABYLON.Mesh | null;
}

export function createEdgePreviewState(): EdgePreviewState {
  return {
    previewEdgeTube: null,
    rubberBandLine: null,
    previewEdgeArrows: [],
    previewTargetSnapRing: null,
    previewEndpointReticle: null,
    previewEdgeBadge: null,
    previewHoverStartRing: null,
  };
}

export function disposeEdgePreviewMeshes(
  state: EdgePreviewState,
  clearSelection?: () => void,
  includeStartRing: boolean = true
) {
  if (state.previewEdgeTube) {
    if (state.previewEdgeTube.material) state.previewEdgeTube.material.dispose();
    state.previewEdgeTube.dispose();
    state.previewEdgeTube = null;
  }
  if (state.rubberBandLine) {
    state.rubberBandLine.dispose();
    state.rubberBandLine = null;
  }
  state.previewEdgeArrows.forEach(a => {
    if (a.material) a.material.dispose();
    a.dispose();
  });
  state.previewEdgeArrows = [];
  if (state.previewTargetSnapRing) {
    if (state.previewTargetSnapRing.material) state.previewTargetSnapRing.material.dispose();
    state.previewTargetSnapRing.dispose();
    state.previewTargetSnapRing = null;
  }
  if (state.previewEndpointReticle) {
    if (state.previewEndpointReticle.material) state.previewEndpointReticle.material.dispose();
    state.previewEndpointReticle.dispose();
    state.previewEndpointReticle = null;
  }
  if (state.previewEdgeBadge) {
    const mat = state.previewEdgeBadge.material as BABYLON.StandardMaterial | null;
    if (mat) {
      if (mat.diffuseTexture) mat.diffuseTexture.dispose();
      mat.dispose();
    }
    state.previewEdgeBadge.dispose();
    state.previewEdgeBadge = null;
  }
  if (state.previewHoverStartRing) {
    if (state.previewHoverStartRing.material) state.previewHoverStartRing.material.dispose();
    state.previewHoverStartRing.dispose();
    state.previewHoverStartRing = null;
  }
  if (includeStartRing) {
    clearSelection?.();
  }
}

export function cancelEdgeConnection(
  state: EdgePreviewState,
  edgeFirstNodeId: Ref<string | null>,
  hoveredNodeId: Ref<string | null>,
  clearSelection?: () => void
) {
  edgeFirstNodeId.value = null;
  hoveredNodeId.value = null;
  disposeEdgePreviewMeshes(state, clearSelection, true);
}

export function updateEdgeCreationPreview(
  sc: BABYLON.Scene,
  startPoint: BABYLON.Vector3,
  endPoint: BABYLON.Vector3,
  isSnapped: boolean,
  targetNodeId: string | null,
  isBidir: boolean,
  state: EdgePreviewState,
  clearSelection?: () => void
) {
  const dist = BABYLON.Vector3.Distance(startPoint, endPoint);
  if (dist < 0.08) {
    disposeEdgePreviewMeshes(state, clearSelection, false);
    return;
  }

  const dx = endPoint.x - startPoint.x;
  const dz = endPoint.z - startPoint.z;
  const forwardTheta = Math.atan2(dx, dz);
  const midPoint = BABYLON.Vector3.Lerp(startPoint, endPoint, 0.5);
  midPoint.y = 0.05;

  // Palette: Snapped is Emerald Green (#10b981), Floating is Electric Cyan / Amber
  const previewColor = isSnapped
    ? new BABYLON.Color3(0.06, 0.95, 0.55)
    : (isBidir ? new BABYLON.Color3(0.06, 0.85, 1.0) : new BABYLON.Color3(0.98, 0.65, 0.08));

  // 1. 3D Glowing Cylinder Path Preview
  const points = [
    new BABYLON.Vector3(startPoint.x, 0.035, startPoint.z),
    new BABYLON.Vector3(endPoint.x, 0.035, endPoint.z)
  ];
  if (state.previewEdgeTube) {
    state.previewEdgeTube = BABYLON.MeshBuilder.CreateTube('PreviewEdgeTube', {
      path: points,
      radius: isBidir ? 0.045 : 0.035,
      instance: state.previewEdgeTube
    });
  } else {
    state.previewEdgeTube = BABYLON.MeshBuilder.CreateTube('PreviewEdgeTube', {
      path: points,
      radius: isBidir ? 0.045 : 0.035,
      updatable: true,
      sideOrientation: BABYLON.Mesh.DOUBLESIDE
    }, sc);
    state.previewEdgeTube.isPickable = false;
  }

  if (!state.previewEdgeTube.material) {
    const mat = new BABYLON.StandardMaterial('PreviewTubeMat', sc);
    state.previewEdgeTube.material = mat;
  }
  const tubeMat = state.previewEdgeTube.material as BABYLON.StandardMaterial;
  tubeMat.diffuseColor = previewColor;
  tubeMat.emissiveColor = previewColor;
  tubeMat.alpha = isSnapped ? 0.95 : 0.70;

  // 2. High-precision thin center guidance beam
  const linePoints = [
    new BABYLON.Vector3(startPoint.x, 0.04, startPoint.z),
    new BABYLON.Vector3(endPoint.x, 0.04, endPoint.z)
  ];
  if (state.rubberBandLine) {
    state.rubberBandLine = BABYLON.MeshBuilder.CreateLines('RubberBandLine', {
      points: linePoints,
      instance: state.rubberBandLine
    });
  } else {
    state.rubberBandLine = BABYLON.MeshBuilder.CreateLines('RubberBandLine', {
      points: linePoints,
      updatable: true
    }, sc);
    state.rubberBandLine.isPickable = false;
  }
  state.rubberBandLine.color = previewColor;

  // 3. Dynamic Directional Arrows on preview path
  state.previewEdgeArrows.forEach(a => {
    if (a.material) a.material.dispose();
    a.dispose();
  });
  state.previewEdgeArrows = [];

  const arrowMat = new BABYLON.StandardMaterial('PreviewArrowMat', sc);
  arrowMat.diffuseColor = previewColor;
  arrowMat.emissiveColor = previewColor;

  if (isBidir) {
    const p1 = BABYLON.Vector3.Lerp(startPoint, endPoint, 0.35);
    const arr1 = BABYLON.MeshBuilder.CreateCylinder('PreviewArr1', {
      diameterTop: 0,
      diameterBottom: 0.35,
      height: 0.48,
      tessellation: 3
    }, sc);
    arr1.position.set(p1.x, 0.06, p1.z);
    arr1.rotation.x = Math.PI / 2;
    arr1.rotation.y = forwardTheta;
    arr1.material = arrowMat;
    arr1.isPickable = false;
    state.previewEdgeArrows.push(arr1);

    const p2 = BABYLON.Vector3.Lerp(startPoint, endPoint, 0.65);
    const arr2 = BABYLON.MeshBuilder.CreateCylinder('PreviewArr2', {
      diameterTop: 0,
      diameterBottom: 0.35,
      height: 0.48,
      tessellation: 3
    }, sc);
    arr2.position.set(p2.x, 0.06, p2.z);
    arr2.rotation.x = Math.PI / 2;
    arr2.rotation.y = forwardTheta + Math.PI;
    arr2.material = arrowMat;
    arr2.isPickable = false;
    state.previewEdgeArrows.push(arr2);
  } else {
    const pMid = BABYLON.Vector3.Lerp(startPoint, endPoint, 0.5);
    const arrow = BABYLON.MeshBuilder.CreateCylinder('PreviewArr', {
      diameterTop: 0,
      diameterBottom: 0.35,
      height: 0.48,
      tessellation: 3
    }, sc);
    arrow.position.set(pMid.x, 0.06, pMid.z);
    arrow.rotation.x = Math.PI / 2;
    arrow.rotation.y = forwardTheta;
    arrow.material = arrowMat;
    arrow.isPickable = false;
    state.previewEdgeArrows.push(arrow);
  }

  // 4. Snapped Target Node Halo vs Floating Endpoint Reticle
  if (isSnapped && targetNodeId) {
    if (state.previewEndpointReticle) {
      state.previewEndpointReticle.dispose();
      state.previewEndpointReticle = null;
    }
    if (!state.previewTargetSnapRing) {
      state.previewTargetSnapRing = BABYLON.MeshBuilder.CreateTorus('PreviewTargetSnapRing', {
        diameter: 0.95,
        thickness: 0.035,
        tessellation: 32
      }, sc);
      const snapMat = new BABYLON.StandardMaterial('TargetSnapMat', sc);
      snapMat.diffuseColor = new BABYLON.Color3(0.06, 0.95, 0.55);
      snapMat.emissiveColor = new BABYLON.Color3(0.2, 1.0, 0.6);
      state.previewTargetSnapRing.material = snapMat;
      state.previewTargetSnapRing.isPickable = false;
    }
    state.previewTargetSnapRing.position.set(endPoint.x, 0.045, endPoint.z);
    state.previewTargetSnapRing.setEnabled(true);
  } else {
    if (state.previewTargetSnapRing) {
      state.previewTargetSnapRing.dispose();
      state.previewTargetSnapRing = null;
    }
    if (!state.previewEndpointReticle) {
      state.previewEndpointReticle = BABYLON.MeshBuilder.CreateDisc('PreviewEndpointReticle', {
        radius: 0.20,
        tessellation: 24
      }, sc);
      state.previewEndpointReticle.rotation.x = Math.PI / 2;
      const reticleMat = new BABYLON.StandardMaterial('ReticleMat', sc);
      reticleMat.diffuseColor = previewColor;
      reticleMat.emissiveColor = previewColor;
      reticleMat.alpha = 0.65;
      state.previewEndpointReticle.material = reticleMat;
      state.previewEndpointReticle.isPickable = false;
    }
    state.previewEndpointReticle.position.set(endPoint.x, 0.045, endPoint.z);
    state.previewEndpointReticle.setEnabled(true);
  }

  // Remove redundant floating distance badge on path as requested
  if (state.previewEdgeBadge) {
    state.previewEdgeBadge.dispose();
    state.previewEdgeBadge = null;
  }
}

export interface EdgeConnectionContext {
  factoryLayout: { edges: LayoutEdge[]; nodes: any[] };
  edgeMeshesMap: Map<string, BABYLON.LinesMesh | BABYLON.Mesh>;
  edgeArrowMeshesMap: Map<string, BABYLON.AbstractMesh[]>;
  createEdgeInScene: (sc: BABYLON.Scene, edge: LayoutEdge) => void;
  updateDynamicPathMaterials: () => void;
  markLayoutDirty: () => void;
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void;
  cancelEdgeConnection: () => void;
}

export function completeEdgeConnection(
  sc: BABYLON.Scene,
  startId: string,
  endId: string,
  isBidir: boolean,
  ctx: EdgeConnectionContext
) {
  ctx.cancelEdgeConnection();

  // Check if edge already exists between these two nodes in EITHER direction
  const existingIdx = ctx.factoryLayout.edges.findIndex(e => 
    (e.startNodeId === startId && e.endNodeId === endId) ||
    (e.startNodeId === endId && e.endNodeId === startId)
  );

  if (existingIdx >= 0) {
    const existingEdge = ctx.factoryLayout.edges[existingIdx];
    
    const oldMesh = ctx.edgeMeshesMap.get(existingEdge.id);
    if (oldMesh) {
      oldMesh.dispose();
      ctx.edgeMeshesMap.delete(existingEdge.id);
    }
    const oldArrows = ctx.edgeArrowMeshesMap.get(existingEdge.id);
    if (oldArrows) {
      oldArrows.forEach(a => a.dispose());
      ctx.edgeArrowMeshesMap.delete(existingEdge.id);
    }

    existingEdge.startNodeId = startId;
    existingEdge.endNodeId = endId;
    existingEdge.bidirectional = isBidir;

    ctx.createEdgeInScene(sc, existingEdge);
    ctx.updateDynamicPathMaterials();
    ctx.markLayoutDirty();
    ctx.notify(`已更新路徑: ${startId} ${isBidir ? '⇄' : '➔'} ${endId} (${isBidir ? '雙向' : '單向'})`, 'success');
  } else {
    const edgeId = `Edge-${startId.replace('Node-', '')}-${endId.replace('Node-', '')}`;
    const newEdge: LayoutEdge = {
      id: edgeId,
      startNodeId: startId,
      endNodeId: endId,
      bidirectional: isBidir
    };
    ctx.factoryLayout.edges.push(newEdge);
    ctx.createEdgeInScene(sc, newEdge);
    ctx.updateDynamicPathMaterials();
    ctx.markLayoutDirty();
    ctx.notify(`已建立路徑: ${startId} ${isBidir ? '⇄' : '➔'} ${endId} (${isBidir ? '雙向' : '單向'})`, 'success');
  }
}
