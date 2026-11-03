import type { Ref } from 'vue';
import * as BABYLON from '@babylonjs/core';
import type { LayoutNode } from '../types';

export interface VehicleVisual {
  id: string;
  root: BABYLON.TransformNode;
  glbRoot: BABYLON.AbstractMesh | null;
  cargoMesh: BABYLON.AbstractMesh | BABYLON.TransformNode | null;
  haloMesh: BABYLON.Mesh | null;
  trafficWaitMesh: BABYLON.Mesh | null;
  overheadBadgeMesh: BABYLON.Mesh | null;
  overheadBadgeTexture: BABYLON.DynamicTexture | null;
  lastBadgeSig: string;
  lastBadgeUpdate?: number;
  trajectoryPts?: BABYLON.Vector3[];
  activeTrajectoryMesh: BABYLON.LinesMesh | null;
  targetPos: BABYLON.Vector3;
  currentPos: BABYLON.Vector3;
  targetTheta: number;
  currentTheta: number;
  liftNode: BABYLON.TransformNode | BABYLON.Mesh | null;
  baseLiftPosY: number;
  isPickAnimationRunning: boolean;
  isDropAnimationRunning: boolean;
  color: BABYLON.Color3;
}

export interface NodeStyleProfile {
  nameZh: string;
  subZh: string;
  icon: string;
  themeColor: string;
  badgeBg: string;
  bgGradStart: string;
  bgGradEnd: string;
}

export interface SmartSnapResult {
  snappedX: number;
  snappedZ: number;
  alignedNodesX: LayoutNode[];
  alignedNodesZ: LayoutNode[];
}

export interface CollisionCheckResult {
  hasCollision: boolean;
  conflictingWith?: string;
  distance?: number;
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  engine: BABYLON.Engine;
  scene: BABYLON.Scene;
  camera: BABYLON.ArcRotateCamera;
  gizmoManager: BABYLON.GizmoManager;

  // Mesh maps
  nodeMeshesMap: Map<string, BABYLON.Mesh>;
  edgeMeshesMap: Map<string, BABYLON.LinesMesh | BABYLON.Mesh>;
  edgeArrowMeshesMap: Map<string, BABYLON.AbstractMesh[]>;
  propMeshesMap: Map<string, BABYLON.AbstractMesh>;
  stationPalletMap: Map<string, BABYLON.TransformNode>;
  stationCargoMap: Map<string, BABYLON.AbstractMesh>;
  nodeTextureMap: Map<string, { texture: BABYLON.DynamicTexture; plane: BABYLON.Mesh; lastSig?: string }>;

  // Vehicles
  vehicleVisuals: Map<string, VehicleVisual>;
  agvRoot: BABYLON.TransformNode | null;
  cargoMesh: BABYLON.AbstractMesh | BABYLON.TransformNode | null;
  agvHaloMesh: BABYLON.Mesh | null;
  beaconMaterial: BABYLON.StandardMaterial | null;

  // Editor selection & interactive state
  selectedEditorNodeId: Ref<string | null>;
  selectedEditorPropId: Ref<string | null>;
  edgeFirstNodeId: Ref<string | null>;
  hoveredNodeId: Ref<string | null>;
  edgeDirectionMode: Ref<'oneway' | 'bidirectional'>;
  newNodeFunction: Ref<'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'>;

  // Rotation Widget
  nodeRotationWidgetRoot: BABYLON.TransformNode | null;
  nodeRotationWidgetMeshes: BABYLON.AbstractMesh[];

  // Ghost Pad
  ghostPlacementPad: BABYLON.Mesh | null;
  ghostPadMaterial: BABYLON.StandardMaterial | null;
  ghostPlacementRing: BABYLON.Mesh | null;

  // Alignment Guides
  alignmentGuideLinesMesh: BABYLON.LinesMesh | null;
  alignmentMarkersMesh: BABYLON.LinesMesh | null;

  // Edge Preview
  previewConnectionLine: BABYLON.LinesMesh | null;
  previewTargetSnapRing: BABYLON.Mesh | null;
  previewTargetSnapDisc: BABYLON.Mesh | null;
  previewHoverStartRing: BABYLON.Mesh | null;
  previewArrowMeshes: BABYLON.AbstractMesh[];

  // Quick Dispatch Preview
  quickDispatchPreviewLine: BABYLON.LinesMesh | null;

  // Notification emitter
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}
