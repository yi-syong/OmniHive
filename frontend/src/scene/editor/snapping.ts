import * as BABYLON from '@babylonjs/core';
import type { LayoutNode, LayoutProp } from '../../types';
import type { SmartSnapResult, CollisionCheckResult } from '../types';
import { getNodeColor } from '../layout/nodeUtils';
import { drawCadPlacementFootprint } from '../textures/editorGraphics';

export const MIN_CLEARANCE_DIST = 1.0;

/**
 * 計算智慧吸附座標 (網格吸附 + 與現有站點 X/Z 軸自動對齊)
 */
export function computeSmartSnap(
  rawX: number,
  rawZ: number,
  nodes: LayoutNode[],
  excludeNodeId?: string,
  snapThreshold: number = 0.35,
  gridStep: number = 0.5
): SmartSnapResult {
  let snappedX = Math.round(rawX / gridStep) * gridStep;
  let snappedZ = Math.round(rawZ / gridStep) * gridStep;
  const alignedNodesX: LayoutNode[] = [];
  const alignedNodesZ: LayoutNode[] = [];

  let minDiffX = snapThreshold;
  let minDiffZ = snapThreshold;

  for (const node of nodes) {
    if (excludeNodeId && node.id === excludeNodeId) continue;

    const diffX = Math.abs(rawX - node.x);
    if (diffX < minDiffX) {
      minDiffX = diffX;
      snappedX = node.x;
      alignedNodesX.length = 0;
      alignedNodesX.push(node);
    } else if (Math.abs(diffX - minDiffX) < 0.001 && diffX < snapThreshold) {
      alignedNodesX.push(node);
    }

    const diffZ = Math.abs(rawZ - node.z);
    if (diffZ < minDiffZ) {
      minDiffZ = diffZ;
      snappedZ = node.z;
      alignedNodesZ.length = 0;
      alignedNodesZ.push(node);
    } else if (Math.abs(diffZ - minDiffZ) < 0.001 && diffZ < snapThreshold) {
      alignedNodesZ.push(node);
    }
  }

  return {
    snappedX: Math.round(snappedX * 100) / 100,
    snappedZ: Math.round(snappedZ * 100) / 100,
    alignedNodesX,
    alignedNodesZ
  };
}

/**
 * 檢查給定座標 (x, z) 是否與現有物件（其他節點、物件）距離過近產生重疊
 */
export function checkObjectClearanceCollision(
  x: number,
  z: number,
  nodes: LayoutNode[],
  props: LayoutProp[] = [],
  excludeId?: string,
  minDistance: number = MIN_CLEARANCE_DIST
): CollisionCheckResult {
  for (const n of nodes) {
    if (n.id === excludeId) continue;
    const dist = Math.hypot(x - n.x, z - n.z);
    if (dist < minDistance) {
      return { hasCollision: true, conflictingWith: `站點 ${n.id} (${n.name})`, distance: dist };
    }
  }

  for (const p of props) {
    if (p.id === excludeId) continue;
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist < minDistance) {
      return { hasCollision: true, conflictingWith: `物件 ${p.id}`, distance: dist };
    }
  }

  return { hasCollision: false };
}

export class GhostPlacementManager {
  public ghostPlacementPad: BABYLON.Mesh | null = null;
  public ghostPadMaterial: BABYLON.StandardMaterial | null = null;
  public ghostPlacementRing: BABYLON.Mesh | null = null;
  public ghostRingMaterial: BABYLON.StandardMaterial | null = null;
  public ghostCadDynamicTexture: BABYLON.DynamicTexture | null = null;
  public alignmentGuideLinesMesh: BABYLON.LinesMesh | null = null;
  public alignmentMarkersMesh: BABYLON.LinesMesh | null = null;

  ensureGhostPlacementPad(sc: BABYLON.Scene, func: string = 'Transit') {
    if (!this.ghostPlacementPad) {
      this.ghostPlacementPad = BABYLON.MeshBuilder.CreateCylinder('GhostPlacementPad', {
        diameter: 0.85,
        height: 0.02,
        tessellation: 32
      }, sc);
      this.ghostPadMaterial = new BABYLON.StandardMaterial('GhostPadMat', sc);
      const col = getNodeColor(func);
      this.ghostPadMaterial.diffuseColor = col;
      this.ghostPadMaterial.emissiveColor = col.scale(0.8);
      this.ghostPadMaterial.alpha = 0.35;
      this.ghostPlacementPad.material = this.ghostPadMaterial;
      this.ghostPlacementPad.isPickable = false;

      this.ghostPlacementRing = BABYLON.MeshBuilder.CreateTorus('GhostPlacementRing', {
        diameter: 0.95,
        thickness: 0.02,
        tessellation: 32
      }, sc);
      this.ghostPlacementRing.parent = this.ghostPlacementPad;
      this.ghostPlacementRing.position.set(0, 0.005, 0);
      this.ghostRingMaterial = new BABYLON.StandardMaterial('GhostRingMat', sc);
      this.ghostRingMaterial.emissiveColor = col;
      this.ghostRingMaterial.alpha = 0.70;
      this.ghostPlacementRing.material = this.ghostRingMaterial;
      this.ghostPlacementRing.isPickable = false;

      // Professional CAD Holographic Alignment Footprint Frame (1.4m x 1.2m)
      const ghostCadPlane = BABYLON.MeshBuilder.CreatePlane('GhostCadFootprint', {
        width: 1.4,
        height: 1.2
      }, sc);
      ghostCadPlane.rotation.x = Math.PI / 2;
      ghostCadPlane.position.set(0, 0.008, 0);
      ghostCadPlane.parent = this.ghostPlacementPad;
      ghostCadPlane.isPickable = false;

      this.ghostCadDynamicTexture = new BABYLON.DynamicTexture('GhostCadTex', { width: 512, height: 440 }, sc, false);
      this.ghostCadDynamicTexture.hasAlpha = true;
      const ctx = this.ghostCadDynamicTexture.getContext() as unknown as CanvasRenderingContext2D;
      drawCadPlacementFootprint(ctx, 512, 440, func);
      this.ghostCadDynamicTexture.update();

      const cadMat = new BABYLON.StandardMaterial('GhostCadMat', sc);
      cadMat.diffuseTexture = this.ghostCadDynamicTexture;
      cadMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
      cadMat.useAlphaFromDiffuseTexture = true;
      cadMat.disableLighting = true;
      cadMat.backFaceCulling = false;
      ghostCadPlane.material = cadMat;

      this.ghostPlacementPad.setEnabled(false);
    }
  }

  updateGhostPadVisual(sc: BABYLON.Scene, func: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo') {
    this.ensureGhostPlacementPad(sc, func);
    if (!this.ghostCadDynamicTexture) return;
    const ctx = this.ghostCadDynamicTexture.getContext() as unknown as CanvasRenderingContext2D;
    drawCadPlacementFootprint(ctx, 512, 440, func);
    this.ghostCadDynamicTexture.update();

    const color = getNodeColor(func);
    if (this.ghostPadMaterial) {
      this.ghostPadMaterial.diffuseColor = color;
      this.ghostPadMaterial.emissiveColor = color.scale(0.85);
    }
    if (this.ghostRingMaterial) {
      this.ghostRingMaterial.emissiveColor = color;
    }
  }

  hideGhostPlacementPad() {
    if (this.ghostPlacementPad) {
      this.ghostPlacementPad.setEnabled(false);
    }
    this.clearAlignmentGuideLines();
  }

  clearAlignmentGuideLines() {
    if (this.alignmentGuideLinesMesh) {
      this.alignmentGuideLinesMesh.dispose();
      this.alignmentGuideLinesMesh = null;
    }
    if (this.alignmentMarkersMesh) {
      this.alignmentMarkersMesh.dispose();
      this.alignmentMarkersMesh = null;
    }
  }

  dispose() {
    this.hideGhostPlacementPad();
    if (this.ghostPlacementRing) {
      this.ghostPlacementRing.dispose();
      this.ghostPlacementRing = null;
    }
    if (this.ghostPlacementPad) {
      this.ghostPlacementPad.dispose();
      this.ghostPlacementPad = null;
    }
    if (this.ghostCadDynamicTexture) {
      this.ghostCadDynamicTexture.dispose();
      this.ghostCadDynamicTexture = null;
    }
  }
}
