import * as BABYLON from '@babylonjs/core';
import type { LayoutEdge, LayoutNode } from '../../types';

export interface EdgeMeshContext {
  factoryLayout: { nodes: LayoutNode[]; edges: LayoutEdge[] };
  edgeMeshesMap: Map<string, BABYLON.LinesMesh | BABYLON.Mesh>;
  edgeArrowMeshesMap: Map<string, BABYLON.AbstractMesh[]>;
  fleetVehicles?: Record<string, any>;
  agvState?: any;
  selectedVehicleId?: string;
}

// Item 3: Golden Proportions for Path Tube & High-Visibility Directional Indicators
export function createEdgeInScene(
  sc: BABYLON.Scene,
  edge: LayoutEdge,
  ctx: EdgeMeshContext
) {
  const start = ctx.factoryLayout.nodes.find(n => n.id === edge.startNodeId);
  const end = ctx.factoryLayout.nodes.find(n => n.id === edge.endNodeId);
  if (!start || !end) return;

  const startPos = new BABYLON.Vector3(start.x, 0.02, start.z);
  const endPos = new BABYLON.Vector3(end.x, 0.02, end.z);
  const points = [startPos, endPos];
  const edgeDist = BABYLON.Vector3.Distance(startPos, endPos);
  const isBidir = !!edge.bidirectional;

  // 1. Path Tube:
  // 雙向路徑使用略寬的軌道 (radius 0.045 = 9cm 寬)；單向路徑使用標準軌道 (radius 0.035)
  const tube = BABYLON.MeshBuilder.CreateTube(`Edge_${edge.id}`, {
    path: points,
    radius: isBidir ? 0.045 : 0.035,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE
  }, sc);
  tube.metadata = { 
    type: 'edge', 
    id: edge.id, 
    startNodeId: edge.startNodeId, 
    endNodeId: edge.endNodeId,
    bidirectional: isBidir
  };
  tube.isPickable = true;

  const mat = new BABYLON.StandardMaterial(`EdgeMat_${edge.id}`, sc);
  tube.material = mat;
  ctx.edgeMeshesMap.set(edge.id, tube);

  // 2. 3D Directional Arrows: 大箭頭 (0.35m 寬 x 0.48m 長)，單向/雙向色系鮮明對比！
  const arrows: BABYLON.AbstractMesh[] = [];
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const forwardTheta = Math.atan2(dx, dz);

  const arrowMat = new BABYLON.StandardMaterial(`ArrowMat_${edge.id}`, sc);
  if (isBidir) {
    // 雙向路徑標示：翡翠青綠 (Emerald Mint)，代表可自由對向會車/雙向行駛
    arrowMat.diffuseColor = new BABYLON.Color3(0.0, 0.85, 0.70);
    arrowMat.emissiveColor = new BABYLON.Color3(0.0, 0.96, 0.82);
  } else {
    // 單向路徑標示：琥珀橙黃 (Vibrant Amber)，強烈單向引導，杜絕逆向錯覺
    arrowMat.diffuseColor = new BABYLON.Color3(0.95, 0.55, 0.05);
    arrowMat.emissiveColor = new BABYLON.Color3(1.0, 0.65, 0.08);
  }

  if (isBidir) {
    // 雙向路徑：兩個相對方向的大箭頭 (0.35 與 0.65 位置)
    const p1 = BABYLON.Vector3.Lerp(startPos, endPos, 0.35);
    const arrow1 = BABYLON.MeshBuilder.CreateCylinder(`Arr1_${edge.id}`, {
      diameterTop: 0,
      diameterBottom: 0.35,
      height: 0.48,
      tessellation: 3
    }, sc);
    arrow1.position.set(p1.x, 0.045, p1.z);
    arrow1.rotation.x = Math.PI / 2;
    arrow1.rotation.y = forwardTheta;
    arrow1.material = arrowMat;
    arrow1.isPickable = false;
    arrows.push(arrow1);

    const p2 = BABYLON.Vector3.Lerp(startPos, endPos, 0.65);
    const arrow2 = BABYLON.MeshBuilder.CreateCylinder(`Arr2_${edge.id}`, {
      diameterTop: 0,
      diameterBottom: 0.35,
      height: 0.48,
      tessellation: 3
    }, sc);
    arrow2.position.set(p2.x, 0.045, p2.z);
    arrow2.rotation.x = Math.PI / 2;
    arrow2.rotation.y = forwardTheta + Math.PI; // 反向箭頭
    arrow2.material = arrowMat;
    arrow2.isPickable = false;
    arrows.push(arrow2);
  } else {
    // 單向路徑：長度大於 4.5m 放置雙重順行箭頭，短路段置中單箭頭
    if (edgeDist > 4.5) {
      const p1 = BABYLON.Vector3.Lerp(startPos, endPos, 0.35);
      const arrow1 = BABYLON.MeshBuilder.CreateCylinder(`Arr1_${edge.id}`, {
        diameterTop: 0,
        diameterBottom: 0.35,
        height: 0.48,
        tessellation: 3
      }, sc);
      arrow1.position.set(p1.x, 0.045, p1.z);
      arrow1.rotation.x = Math.PI / 2;
      arrow1.rotation.y = forwardTheta;
      arrow1.material = arrowMat;
      arrow1.isPickable = false;
      arrows.push(arrow1);

      const p2 = BABYLON.Vector3.Lerp(startPos, endPos, 0.65);
      const arrow2 = BABYLON.MeshBuilder.CreateCylinder(`Arr2_${edge.id}`, {
        diameterTop: 0,
        diameterBottom: 0.35,
        height: 0.48,
        tessellation: 3
      }, sc);
      arrow2.position.set(p2.x, 0.045, p2.z);
      arrow2.rotation.x = Math.PI / 2;
      arrow2.rotation.y = forwardTheta;
      arrow2.material = arrowMat;
      arrow2.isPickable = false;
      arrows.push(arrow2);
    } else {
      const midPos = BABYLON.Vector3.Lerp(startPos, endPos, 0.5);
      const arrow = BABYLON.MeshBuilder.CreateCylinder(`Arr_${edge.id}`, {
        diameterTop: 0,
        diameterBottom: 0.35,
        height: 0.48,
        tessellation: 3
      }, sc);
      arrow.position.set(midPos.x, 0.045, midPos.z);
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.y = forwardTheta;
      arrow.material = arrowMat;
      arrow.isPickable = false;
      arrows.push(arrow);
    }
  }

  ctx.edgeArrowMeshesMap.set(edge.id, arrows);
}

export function updateEdgesForNode(sc: BABYLON.Scene, nodeId: string, ctx: EdgeMeshContext) {
  const connectedEdges = ctx.factoryLayout.edges.filter(
    e => e.startNodeId === nodeId || e.endNodeId === nodeId
  );
  if (connectedEdges.length === 0) return;

  connectedEdges.forEach(edge => {
    const oldMesh = ctx.edgeMeshesMap.get(edge.id);
    if (oldMesh) {
      if (oldMesh.material) oldMesh.material.dispose();
      oldMesh.dispose();
      ctx.edgeMeshesMap.delete(edge.id);
    }
    const oldArrows = ctx.edgeArrowMeshesMap.get(edge.id);
    if (oldArrows) {
      oldArrows.forEach(a => {
        if (a.material) a.material.dispose();
        a.dispose();
      });
      ctx.edgeArrowMeshesMap.delete(edge.id);
    }
    createEdgeInScene(sc, edge, ctx);
  });

  updateDynamicPathMaterials(ctx);
}

// 3.1 Dynamic Path Material Rendering: VDA 5050 Base (solid) vs Horizon (dim translucent) vs Passed
export function updateDynamicPathMaterials(ctx: EdgeMeshContext) {
  const fleetVehicles = ctx.fleetVehicles || {};
  const agvState = ctx.agvState || {};
  const selectedVehicleId = ctx.selectedVehicleId || 'AGV-001';

  const selVeh = fleetVehicles[selectedVehicleId] || agvState;
  const activeEdges = selVeh?.edge_states || agvState.edge_states || [];

  // Also collect active driving edges from all moving vehicles in fleet
  const drivingEdges = new Set<string>();
  const horizonEdges = new Set<string>();
  for (const v of Object.values(fleetVehicles) as any[]) {
    if (v.edge_states && v.edge_states.length > 0) {
      drivingEdges.add(v.edge_states[0]);
      for (let i = 1; i < v.edge_states.length; i++) {
        horizonEdges.add(v.edge_states[i]);
      }
    }
  }

  ctx.edgeMeshesMap.forEach((mesh, edgeId) => {
    const mat = mesh.material as BABYLON.StandardMaterial;
    if (!mat) return;

    const isSelActiveFirst = activeEdges.length > 0 && activeEdges[0] === edgeId;
    const isSelHorizon = activeEdges.indexOf(edgeId) > 0;
    const isAnyDriving = drivingEdges.has(edgeId);
    const isAnyHorizon = horizonEdges.has(edgeId);
    if (isSelActiveFirst || isAnyDriving) {
      // VDA 5050 Base: Immediate driving road segment -> Glowing bright neon cyan
      mat.emissiveColor = new BABYLON.Color3(0.0, 0.95, 1.0);
      mat.diffuseColor = new BABYLON.Color3(0.0, 0.7, 0.9);
      mat.alpha = 1.0;
    } else if (isSelHorizon || isAnyHorizon) {
      // VDA 5050 Horizon: Upcoming path corridor -> High visibility cyan
      mat.emissiveColor = new BABYLON.Color3(0.05, 0.55, 0.75);
      mat.diffuseColor = new BABYLON.Color3(0.03, 0.35, 0.5);
      mat.alpha = 0.85;
    } else {
      // Standard factory road infrastructure: Always clearly visible and distinct!
      mat.emissiveColor = new BABYLON.Color3(0.24, 0.30, 0.42);
      mat.diffuseColor = new BABYLON.Color3(0.18, 0.22, 0.32);
      mat.alpha = 0.80;
    }

    const arrows = ctx.edgeArrowMeshesMap.get(edgeId);
    if (arrows) {
      const edgeObj = ctx.factoryLayout.edges.find(e => e.id === edgeId);
      const isBidir = edgeObj ? !!edgeObj.bidirectional : false;
      arrows.forEach(a => {
        const aMat = a.material as BABYLON.StandardMaterial;
        if (!aMat) return;
        if (isSelActiveFirst || isAnyDriving) {
          aMat.emissiveColor = new BABYLON.Color3(0.0, 0.95, 1.0);
          aMat.alpha = 1.0;
        } else if (isSelHorizon || isAnyHorizon) {
          aMat.emissiveColor = new BABYLON.Color3(0.05, 0.55, 0.75);
          aMat.alpha = 0.85;
        } else {
          // Distinct One-Way vs Two-Way idle coloring:
          if (isBidir) {
            aMat.diffuseColor = new BABYLON.Color3(0.0, 0.85, 0.70);
            aMat.emissiveColor = new BABYLON.Color3(0.0, 0.96, 0.82);
            aMat.alpha = 0.95;
          } else {
            aMat.diffuseColor = new BABYLON.Color3(0.95, 0.55, 0.05);
            aMat.emissiveColor = new BABYLON.Color3(1.0, 0.65, 0.08);
            aMat.alpha = 0.95;
          }
        }
      });
    }
  });
}

export function rebuildEdgesOnly(sc: BABYLON.Scene, ctx: EdgeMeshContext) {
  ctx.edgeMeshesMap.forEach(m => m.dispose());
  ctx.edgeMeshesMap.clear();

  ctx.edgeArrowMeshesMap.forEach(arrows => arrows.forEach(a => a.dispose()));
  ctx.edgeArrowMeshesMap.clear();

  ctx.factoryLayout.edges.forEach(edge => {
    createEdgeInScene(sc, edge, ctx);
  });
  updateDynamicPathMaterials(ctx);
}
