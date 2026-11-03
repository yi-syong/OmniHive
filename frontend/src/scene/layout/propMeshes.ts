import * as BABYLON from '@babylonjs/core';
import type { LayoutProp } from '../../types';

export function createPropInScene(
  sc: BABYLON.Scene,
  prop: LayoutProp,
  propMeshesMap: Map<string, BABYLON.AbstractMesh>
) {
  // Requirement 2: 3D charging pile props are completely removed in favor of lightning icon on node!
  if (prop.modelType === 'pillar' || prop.modelType === 'charging_station') {
    return;
  }

  if (prop.modelType === 'rack' || prop.modelType === 'push_back') {
    BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'industrial_storage_rack.glb', sc).then(result => {
      const root = result.meshes[0];
      root.name = `Prop_${prop.id}`;
      // Normalized height ~2.6m
      const bounds = root.getHierarchyBoundingVectors();
      const sizeY = Math.max(bounds.max.y - bounds.min.y, 0.1);
      const s = (2.6 / sizeY) * (prop.scale || 1.0);
      root.scaling.setAll(s);

      const updatedBounds = root.getHierarchyBoundingVectors();
      const offsetY = -updatedBounds.min.y;
      root.position.set(prop.x, offsetY, prop.z);
      root.rotation.y = prop.rotationY || 0;

      root.metadata = { type: 'prop', id: prop.id };
      for (const m of result.meshes) {
        m.metadata = { type: 'prop', id: prop.id };
        m.isPickable = true;
      }
      propMeshesMap.set(prop.id, root);
    }).catch(err => {
      console.warn('Fallback to procedural rack box:', err);
      const mesh = BABYLON.MeshBuilder.CreateBox(`Prop_${prop.id}`, { width: 1.6, height: 1.1, depth: 1.0 }, sc);
      mesh.position.set(prop.x, 0.55, prop.z);
      const mat = new BABYLON.StandardMaterial(`PropMat_${prop.id}`, sc);
      mat.diffuseColor = new BABYLON.Color3(0.25, 0.28, 0.35);
      mat.emissiveColor = new BABYLON.Color3(0.65, 0.38, 0.05);
      mesh.material = mat;
      mesh.rotation.y = prop.rotationY;
      mesh.scaling.setAll(prop.scale || 1.0);
      mesh.metadata = { type: 'prop', id: prop.id };
      mesh.isPickable = true;
      propMeshesMap.set(prop.id, mesh);
    });
    return;
  }

  if (prop.modelType === 'pallet') {
    BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'plastic_pallet.glb', sc).then(result => {
      const root = result.meshes[0];
      root.name = `Prop_${prop.id}`;

      // Euro-pallet dimensions: width ~1.2m
      const bounds = root.getHierarchyBoundingVectors();
      const maxHoriz = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 0.1);
      const s = (1.2 / maxHoriz) * (prop.scale || 1.0);
      root.scaling.setAll(s);

      const updatedBounds = root.getHierarchyBoundingVectors();
      const offsetY = -updatedBounds.min.y;
      root.position.set(prop.x, offsetY, prop.z);
      root.rotation.y = prop.rotationY || 0;

      root.metadata = { type: 'prop', id: prop.id };
      for (const m of result.meshes) {
        m.metadata = { type: 'prop', id: prop.id };
        m.isPickable = true;
      }
      propMeshesMap.set(prop.id, root);
    }).catch(err => {
      console.warn('Fallback to procedural pallet box:', err);
      const mesh = BABYLON.MeshBuilder.CreateBox(`Prop_${prop.id}`, { width: 1.2, height: 0.15, depth: 1.0 }, sc);
      mesh.position.set(prop.x, 0.075, prop.z);
      const mat = new BABYLON.StandardMaterial(`PropMat_${prop.id}`, sc);
      mat.diffuseColor = new BABYLON.Color3(0.15, 0.35, 0.65);
      mesh.material = mat;
      mesh.rotation.y = prop.rotationY;
      mesh.scaling.setAll(prop.scale || 1.0);
      mesh.metadata = { type: 'prop', id: prop.id };
      mesh.isPickable = true;
      propMeshesMap.set(prop.id, mesh);
    });
    return;
  }

  // Workstation / generic prop fallback
  const mesh = BABYLON.MeshBuilder.CreateBox(`Prop_${prop.id}`, { width: 1.5, height: 0.4, depth: 1.5 }, sc);
  mesh.position.set(prop.x, 0.2, prop.z);
  const mat = new BABYLON.StandardMaterial(`PropMat_${prop.id}`, sc);
  mat.diffuseColor = new BABYLON.Color3(0.18, 0.35, 0.25);
  mat.emissiveColor = new BABYLON.Color3(0.05, 0.45, 0.25);
  mesh.material = mat;
  mesh.rotation.y = prop.rotationY;
  mesh.scaling.setAll(prop.scale || 1.0);
  mesh.metadata = { type: 'prop', id: prop.id };
  mesh.isPickable = true;
  propMeshesMap.set(prop.id, mesh);
}
