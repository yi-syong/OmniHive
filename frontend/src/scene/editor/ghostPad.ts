import * as BABYLON from '@babylonjs/core';
import type { LayoutNode } from '../../types';
import { drawCadPlacementFootprint } from '../textures/editorGraphics';
import { getNodeColor } from '../layout/nodeUtils';

export interface GhostPadState {
  ghostPlacementPad: BABYLON.Mesh | null;
  ghostPadMaterial: BABYLON.StandardMaterial | null;
  ghostPlacementRing: BABYLON.Mesh | null;
  ghostRingMaterial: BABYLON.StandardMaterial | null;
  ghostCadDynamicTexture: BABYLON.DynamicTexture | null;
  alignmentGuideLinesMesh: BABYLON.LinesMesh | null;
  alignmentMarkersMesh: BABYLON.LinesMesh | null;
}

export function createGhostPadState(): GhostPadState {
  return {
    ghostPlacementPad: null,
    ghostPadMaterial: null,
    ghostPlacementRing: null,
    ghostRingMaterial: null,
    ghostCadDynamicTexture: null,
    alignmentGuideLinesMesh: null,
    alignmentMarkersMesh: null,
  };
}

export function clearAlignmentGuideLines(state: GhostPadState) {
  if (state.alignmentGuideLinesMesh) {
    state.alignmentGuideLinesMesh.dispose();
    state.alignmentGuideLinesMesh = null;
  }
  if (state.alignmentMarkersMesh) {
    state.alignmentMarkersMesh.dispose();
    state.alignmentMarkersMesh = null;
  }
}

export function updateAlignmentGuideLines(
  _sc: BABYLON.Scene,
  _posX: number,
  _posZ: number,
  _alignedNodesX: LayoutNode[],
  _alignedNodesZ: LayoutNode[],
  state: GhostPadState
) {
  clearAlignmentGuideLines(state);
}

export function ensureGhostPlacementPad(
  sc: BABYLON.Scene,
  state: GhostPadState,
  newNodeFunction: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'
) {
  if (!state.ghostPlacementPad) {
    state.ghostPlacementPad = BABYLON.MeshBuilder.CreateCylinder('GhostPlacementPad', {
      diameter: 0.85,
      height: 0.02,
      tessellation: 32
    }, sc);
    state.ghostPadMaterial = new BABYLON.StandardMaterial('GhostPadMat', sc);
    const col = getNodeColor(newNodeFunction);
    state.ghostPadMaterial.diffuseColor = col;
    state.ghostPadMaterial.emissiveColor = col.scale(0.8);
    state.ghostPadMaterial.alpha = 0.35;
    state.ghostPlacementPad.material = state.ghostPadMaterial;
    state.ghostPlacementPad.isPickable = false;

    state.ghostPlacementRing = BABYLON.MeshBuilder.CreateTorus('GhostPlacementRing', {
      diameter: 0.95,
      thickness: 0.02,
      tessellation: 32
    }, sc);
    state.ghostPlacementRing.parent = state.ghostPlacementPad;
    state.ghostPlacementRing.position.set(0, 0.005, 0);
    state.ghostRingMaterial = new BABYLON.StandardMaterial('GhostRingMat', sc);
    state.ghostRingMaterial.emissiveColor = col;
    state.ghostRingMaterial.alpha = 0.70;
    state.ghostPlacementRing.material = state.ghostRingMaterial;
    state.ghostPlacementRing.isPickable = false;

    // Professional CAD Holographic Alignment Footprint Frame (1.4m x 1.2m)
    const ghostCadPlane = BABYLON.MeshBuilder.CreatePlane('GhostCadFootprint', {
      width: 1.4,
      height: 1.2
    }, sc);
    ghostCadPlane.rotation.x = Math.PI / 2;
    ghostCadPlane.position.set(0, 0.008, 0);
    ghostCadPlane.parent = state.ghostPlacementPad;
    ghostCadPlane.isPickable = false;

    state.ghostCadDynamicTexture = new BABYLON.DynamicTexture('GhostCadTex', { width: 512, height: 440 }, sc, false);
    state.ghostCadDynamicTexture.hasAlpha = true;
    const ctx = state.ghostCadDynamicTexture.getContext() as unknown as CanvasRenderingContext2D;
    drawCadPlacementFootprint(ctx, 512, 440, newNodeFunction);
    state.ghostCadDynamicTexture.update();

    const cadMat = new BABYLON.StandardMaterial('GhostCadMat', sc);
    cadMat.diffuseTexture = state.ghostCadDynamicTexture;
    cadMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    cadMat.useAlphaFromDiffuseTexture = true;
    cadMat.disableLighting = true;
    cadMat.backFaceCulling = false;
    ghostCadPlane.material = cadMat;

    state.ghostPlacementPad.setEnabled(false);
  }
}

export function updateGhostPadVisual(
  sc: BABYLON.Scene,
  state: GhostPadState,
  func: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'
) {
  ensureGhostPlacementPad(sc, state, func);
  if (!state.ghostCadDynamicTexture) return;
  const ctx = state.ghostCadDynamicTexture.getContext() as unknown as CanvasRenderingContext2D;
  drawCadPlacementFootprint(ctx, 512, 440, func);
  state.ghostCadDynamicTexture.update();

  const color = getNodeColor(func);
  if (state.ghostPadMaterial) {
    state.ghostPadMaterial.diffuseColor = color;
    state.ghostPadMaterial.emissiveColor = color.scale(0.85);
  }
  if (state.ghostRingMaterial) {
    state.ghostRingMaterial.emissiveColor = color;
  }
}

export function hideGhostPlacementPad(state: GhostPadState) {
  if (state.ghostPlacementPad) {
    state.ghostPlacementPad.setEnabled(false);
  }
  clearAlignmentGuideLines(state);
}

export function positionGhostPlacementPad(state: GhostPadState, x: number, z: number) {
  if (state.ghostPlacementPad) {
    state.ghostPlacementPad.position.set(x, 0.045, z);
    state.ghostPlacementPad.setEnabled(true);
  }
}

