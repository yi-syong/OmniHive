import type { Ref } from 'vue';
import * as BABYLON from '@babylonjs/core';
import type { SceneContext, VehicleVisual } from './types';

export interface SceneContextOptions {
  canvas: HTMLCanvasElement;
  engine: BABYLON.Engine;
  scene: BABYLON.Scene;
  camera: BABYLON.ArcRotateCamera;
  gizmoManager: BABYLON.GizmoManager;
  selectedEditorNodeId: Ref<string | null>;
  selectedEditorPropId: Ref<string | null>;
  edgeFirstNodeId: Ref<string | null>;
  hoveredNodeId: Ref<string | null>;
  edgeDirectionMode: Ref<'oneway' | 'bidirectional'>;
  newNodeFunction: Ref<'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'>;
  notify?: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}

export function createSceneContext(opts: SceneContextOptions): SceneContext {
  return {
    canvas: opts.canvas,
    engine: opts.engine,
    scene: opts.scene,
    camera: opts.camera,
    gizmoManager: opts.gizmoManager,

    nodeMeshesMap: new Map<string, BABYLON.Mesh>(),
    edgeMeshesMap: new Map<string, BABYLON.LinesMesh | BABYLON.Mesh>(),
    edgeArrowMeshesMap: new Map<string, BABYLON.AbstractMesh[]>(),
    propMeshesMap: new Map<string, BABYLON.AbstractMesh>(),
    stationPalletMap: new Map<string, BABYLON.TransformNode>(),
    stationCargoMap: new Map<string, BABYLON.Mesh>(),
    nodeTextureMap: new Map<string, { texture: BABYLON.DynamicTexture; plane: BABYLON.Mesh }>(),

    vehicleVisuals: new Map<string, VehicleVisual>(),
    agvRoot: null,
    cargoMesh: null,
    agvHaloMesh: null,
    beaconMaterial: null,

    selectedEditorNodeId: opts.selectedEditorNodeId,
    selectedEditorPropId: opts.selectedEditorPropId,
    edgeFirstNodeId: opts.edgeFirstNodeId,
    hoveredNodeId: opts.hoveredNodeId,
    edgeDirectionMode: opts.edgeDirectionMode,
    newNodeFunction: opts.newNodeFunction,

    nodeRotationWidgetRoot: null,
    nodeRotationWidgetMeshes: [],

    ghostPlacementPad: null,
    ghostPadMaterial: null,
    ghostPlacementRing: null,

    alignmentGuideLinesMesh: null,
    alignmentMarkersMesh: null,

    previewConnectionLine: null,
    previewTargetSnapRing: null,
    previewTargetSnapDisc: null,
    previewHoverStartRing: null,
    previewArrowMeshes: [],

    quickDispatchPreviewLine: null,

    notify: opts.notify || ((_msg, _type) => {})
  };
}
