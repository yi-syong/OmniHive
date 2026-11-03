<template>
  <div class="scene-container">
    <canvas ref="canvasRef" class="render-canvas"></canvas>

    <!-- Top Camera & Global Field View Selector -->
    <CameraToolbar 
      :current-view="currentView" 
      :in-edit-mode="currentAppMode === 'edit'" 
      @change-view="setCameraView" 
    />

    <!-- Edit Mode Floating Action Bar -->
    <transition name="fade">
      <EditToolbar
        v-if="currentAppMode === 'edit'"
        v-model:editor-tool="currentEditorTool"
        v-model:new-node-function="newNodeFunction"
        v-model:edge-direction-mode="edgeDirectionMode"
        @reset="showResetModal = true"
        @save="handleSaveLayout"
        @cancel="handleCancelEdit"
      />
    </transition>

    <!-- Reset / Clear Map Confirmation Modal -->
    <transition name="fade">
      <ResetLayoutModal
        v-if="showResetModal"
        @close="showResetModal = false"
        @reset-template="resetToStandardTemplate"
        @clear-canvas="clearCanvasEntirely"
      />
    </transition>

    <!-- Rubber-band Connection Interactive Hint Banner -->
    <transition name="fade">
      <EdgeHintBanner
        v-if="currentAppMode === 'edit' && currentEditorTool === 'add_edge' && edgeFirstNodeId"
        :edge-first-node-id="edgeFirstNodeId"
        :hovered-node-id="hoveredNodeId"
        :edge-direction-mode="edgeDirectionMode"
        @cancel="cancelEdgeConnection"
      />
    </transition>

    <!-- Right-Click Station Cargo Status Context Menu -->
    <transition name="fade">
      <CargoContextMenu
        v-if="cargoContextMenu.visible && cargoContextMenu.node"
        :node="cargoContextMenu.node"
        :x="cargoContextMenu.x"
        :y="cargoContextMenu.y"
        @close="closeCargoContextMenu"
        @set-status="setNodeCargoStatus"
      />
    </transition>

    <!-- Minimized Task Capsule -->
    <transition name="fade">
      <MissionMinimizedCapsule
        v-if="currentAppMode === 'simulate' && is3DQuickDispatchActive && isMissionPanelMinimized"
        :vehicle-id="selectedVehicleId || 'AGV-001'"
        :start-node="currentAgvStartNode"
        :dest-node="quickDispatchSteps[0]?.node_id"
        :step-count="quickDispatchSteps.length"
        @expand="isMissionPanelMinimized = false"
      />
    </transition>

    <!-- Non-blocking Left-side Floating Mission Dispatch Panel -->
    <transition name="slide-left">
      <MissionDispatchPanel
        v-if="currentAppMode === 'simulate' && is3DQuickDispatchActive && !isMissionPanelMinimized"
        :selected-vehicle-id="selectedVehicleId"
        :current-selected-vehicle-state="currentSelectedVehicleState"
        :current-agv-start-node="currentAgvStartNode"
        :quick-dispatch-steps="quickDispatchSteps"
        :active-step-index="activeStepIndex"
        :nodes="factoryLayout.nodes"
        :fleet-vehicles="fleetVehicles"
        :is-current-vehicle-busy="isCurrentVehicleBusy"
        @minimize="isMissionPanelMinimized = true"
        @close="closeQuickDispatch"
        @cancel-current-mission="handleCancelCurrentMission"
        @update:active-step-index="activeStepIndex = $event"
        @step-node-change="onStepNodeChange"
        @toggle-cargo="toggleStationCargo"
        @remove-step="removeDispatchStep"
        @set-step-action="setStepAction"
        @add-step="addNewDispatchStep"
        @reset-steps="resetDispatchSteps"
        @launch="handleQuickDispatchLaunch"
      />
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import CameraToolbar from './scene/overlays/CameraToolbar.vue';
import EditToolbar from './scene/overlays/EditToolbar.vue';
import ResetLayoutModal from './scene/overlays/ResetLayoutModal.vue';
import EdgeHintBanner from './scene/overlays/EdgeHintBanner.vue';
import CargoContextMenu from './scene/overlays/CargoContextMenu.vue';
import MissionMinimizedCapsule from './scene/overlays/mission/MissionMinimizedCapsule.vue';
import MissionDispatchPanel from './scene/overlays/mission/MissionDispatchPanel.vue';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { 
  agvState, 
  factoryLayout, 
  currentAppMode, 
  currentEditorTool, 
  fetchLayout, 
  saveLayout, 
  onVisualEvent, 
  markLayoutDirty, 
  clearLayoutDirty,
  hasUnsavedChanges,
  is3DQuickDispatchActive,
  quickDispatchSteps,
  sendDispatchOrder,
  cancelOrder,
  onDispatchError,
  selectedVehicleId,
  selectVehicle,
  dashboardActiveTab,
  cameraFollowTrigger,
  fleetVehicles,
  currentTimeScale
} from '../services/websocket';
import type { LayoutNode, LayoutProp, LayoutEdge, DispatchAction } from '../types';
import {
  getNodeColor,
  getNodeFunctionLabel,
  getNodeTypeDefaultDesc,
  isChargingNode as isChargingNodeUtil,
  isCargoNode as isCargoNodeUtil,
  getNodeObj as getNodeObjUtil,
  getActionLabel
} from '../scene/layout/nodeUtils';
import {
  drawRoundRect,
  drawCadPlacementFootprint,
  drawLargeDirectionArrow
} from '../scene/textures/editorGraphics';
import { drawStationIconTexture } from '../scene/textures/stationIcon';
import {
  resolvePickedNodeFromPointer as resolvePickedNodeFromPointerUtil
} from '../scene/editor/picking';
import {
  computeSmartSnap as computeSmartSnapUtil,
  checkObjectClearanceCollision as checkObjectClearanceCollisionUtil,
  MIN_CLEARANCE_DIST
} from '../scene/editor/snapping';

const emit = defineEmits<{
  (e: 'notify', msg: string, type: 'success' | 'info' | 'warn'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const currentView = ref<'iso' | 'top' | 'follow'>('iso');

// Babylon references
let engine: BABYLON.Engine | null = null;
let scene: BABYLON.Scene | null = null;
let camera: BABYLON.ArcRotateCamera | null = null;
let gizmoManager: BABYLON.GizmoManager | null = null;

// ----------------------------------------------------
// Multi-AGV Fleet Visual Management
// ----------------------------------------------------
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

const vehicleVisuals = new Map<string, VehicleVisual>();

// Backward compatible primary reference pointers
let agvRoot: BABYLON.TransformNode | null = null;
let cargoMesh: BABYLON.AbstractMesh | BABYLON.TransformNode | null = null;
let beaconMaterial: BABYLON.StandardMaterial | null = null;
let agvHaloMesh: BABYLON.Mesh | null = null;
let quickDispatchPreviewLine: BABYLON.LinesMesh | null = null;

// Dynamic Path & Node meshes dictionary for fast updates
const nodeMeshesMap = new Map<string, BABYLON.Mesh>();
const activeStepIndex = ref<number | null>(0);
const currentSelectedVehicleState = computed(() => {
  return fleetVehicles[selectedVehicleId.value] || agvState;
});
const currentAgvStartNode = computed(() => currentSelectedVehicleState.value.task_info?.current_node || 'Node-01');

const isCurrentVehicleBusy = computed(() => {
  const st = currentSelectedVehicleState.value?.task_info?.status;
  const isWait = !!currentSelectedVehicleState.value?.task_info?.is_traffic_wait;
  return st === 'DRIVING' || st === 'ACTING' || isWait;
});

// Left floating mission dispatch panel minimize toggle
const isMissionPanelMinimized = ref(false);

function handleCancelCurrentMission() {
  const vId = selectedVehicleId.value || 'AGV-001';
  cancelOrder(vId, '使用者手動中止任務 / 解除卡死');
  emit('notify', `🛑 已發送中止指令給車輛 ${vId}，釋放交管路權！`, 'info');
}

const edgeMeshesMap = new Map<string, BABYLON.LinesMesh | BABYLON.Mesh>();
const edgeArrowMeshesMap = new Map<string, BABYLON.AbstractMesh[]>();
const propMeshesMap = new Map<string, BABYLON.AbstractMesh>();

// Dev Tool: GLB Node bindings
const agvNodesList = ref<string[]>([]);
const selectedLiftNodeName = ref<string>('');
const baseLiftPosY = ref<number>(0);

// Edit Mode: Node Type sub-options (Requirement 1: Pick/Drop is unified into Cargo)
const newNodeFunction = ref<'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'>('Transit');


// Right-click Cargo Context Menu (Requirement 5)
const cargoContextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  node: LayoutNode | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  node: null
});

// Reset / Clear Map Dialog State
const showResetModal = ref(false);

// Station Pallet & Cargo Meshes
const stationPalletMap = new Map<string, BABYLON.AbstractMesh>();
const stationCargoMap = new Map<string, BABYLON.AbstractMesh>();
const nodeTextureMap = new Map<string, { texture: BABYLON.DynamicTexture, plane: BABYLON.Mesh }>();

// Interactive Rubber-band connection state & Edge configuration
const edgeFirstNodeId = ref<string | null>(null);
const hoveredNodeId = ref<string | null>(null);
const edgeDirectionMode = ref<'oneway' | 'bidirectional'>('oneway');
let rubberBandLine: BABYLON.LinesMesh | null = null;
let nodeSelectionRing: BABYLON.Mesh | null = null;

// High-Fidelity 3D Edge Preview System
let previewEdgeTube: BABYLON.Mesh | null = null;
let previewEdgeArrows: BABYLON.AbstractMesh[] = [];
let previewTargetSnapRing: BABYLON.Mesh | null = null;
let previewEndpointReticle: BABYLON.Mesh | null = null;
let previewEdgeBadge: BABYLON.Mesh | null = null;
let previewHoverStartRing: BABYLON.Mesh | null = null;

// Edit Mode Selected Element Tracking & 90-Degree Stepped Rotation
const selectedEditorNodeId = ref<string | null>(null);
const selectedEditorPropId = ref<string | null>(null);

// Interactive 3D Rotation & Directional Widget around Selected Node
let nodeRotationWidgetRoot: BABYLON.TransformNode | null = null;
let nodeRotationWidgetMeshes: BABYLON.AbstractMesh[] = [];

// Smart Alignment Guides & Snapping State
let alignmentGuideLinesMesh: BABYLON.LinesMesh | null = null;
let alignmentMarkersMesh: BABYLON.LinesMesh | null = null;
let ghostPlacementPad: BABYLON.Mesh | null = null;
let ghostPlacementRing: BABYLON.Mesh | null = null;
let ghostCadDynamicTexture: BABYLON.DynamicTexture | null = null;
let ghostPadMaterial: BABYLON.StandardMaterial | null = null;
let ghostRingMaterial: BABYLON.StandardMaterial | null = null;

const getNodeObj = (nodeId: string): LayoutNode | undefined => getNodeObjUtil(nodeId, factoryLayout.nodes);
const isCargoNode = (nodeId: string): boolean => isCargoNodeUtil(nodeId, factoryLayout.nodes);

function createNodeRotationWidget(sc: BABYLON.Scene, _nodeMesh: BABYLON.AbstractMesh, nodeId: string) {
  clearNodeRotationWidget();

  const node = factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const currentDeg = Math.round(((node.rotationY || 0) * 180) / Math.PI) % 360;
  const normalizedDeg = ((currentDeg % 360) + 360) % 360;

  const cx = _nodeMesh?.position?.x ?? node.x;
  const cz = _nodeMesh?.position?.z ?? node.z;
  const y = (isCargoNode(nodeId) && node.has_cargo) ? 0.175 : 0.046;

  // Root TransformNode for widget so arrows move synchronously with the node during drag
  nodeRotationWidgetRoot = new BABYLON.TransformNode(`NodeRotWidgetRoot_${nodeId}`, sc);
  nodeRotationWidgetRoot.position.set(cx, y, cz);

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
    arrowPlane.parent = nodeRotationWidgetRoot;
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

    nodeRotationWidgetMeshes.push(arrowPlane);
  };

  // 4 Directional Arrows (Fixed World Orientation: ↑=0°, →=90°, ↓=180°, ←=270°)
  const arrowDist = 0.78;
  makeArrow(`BtnDir_Up_${nodeId}`, 0, arrowDist, 0, 0, normalizedDeg === 0);
  makeArrow(`BtnDir_Right_${nodeId}`, arrowDist, 0, Math.PI / 2, 90, normalizedDeg === 90);
  makeArrow(`BtnDir_Down_${nodeId}`, 0, -arrowDist, Math.PI, 180, normalizedDeg === 180);
  makeArrow(`BtnDir_Left_${nodeId}`, -arrowDist, 0, -Math.PI / 2, 270, normalizedDeg === 270);
}

function clearNodeRotationWidget() {
  for (const m of nodeRotationWidgetMeshes) {
    if (m.material) m.material.dispose();
    m.dispose();
  }
  nodeRotationWidgetMeshes.length = 0;
  if (nodeRotationWidgetRoot) {
    nodeRotationWidgetRoot.dispose();
    nodeRotationWidgetRoot = null;
  }
}

// ----------------------------------------------------
// Smart Alignment Guides & Grid Snapping Engine
// ----------------------------------------------------
const computeSmartSnap = (
  rawX: number,
  rawZ: number,
  excludeNodeId?: string,
  snapThreshold: number = 0.35,
  gridStep: number = 0.5
) => computeSmartSnapUtil(rawX, rawZ, factoryLayout.nodes, excludeNodeId, snapThreshold, gridStep);

function clearAlignmentGuideLines() {
  if (alignmentGuideLinesMesh) {
    alignmentGuideLinesMesh.dispose();
    alignmentGuideLinesMesh = null;
  }
  if (alignmentMarkersMesh) {
    alignmentMarkersMesh.dispose();
    alignmentMarkersMesh = null;
  }
}

function updateAlignmentGuideLines(
  _sc: BABYLON.Scene,
  _posX: number,
  _posZ: number,
  _alignedNodesX: LayoutNode[],
  _alignedNodesZ: LayoutNode[]
) {
  clearAlignmentGuideLines();
}

function ensureGhostPlacementPad(sc: BABYLON.Scene) {
  if (!ghostPlacementPad) {
    ghostPlacementPad = BABYLON.MeshBuilder.CreateCylinder('GhostPlacementPad', {
      diameter: 0.85,
      height: 0.02,
      tessellation: 32
    }, sc);
    ghostPadMaterial = new BABYLON.StandardMaterial('GhostPadMat', sc);
    const col = getNodeColor(newNodeFunction.value);
    ghostPadMaterial.diffuseColor = col;
    ghostPadMaterial.emissiveColor = col.scale(0.8);
    ghostPadMaterial.alpha = 0.35;
    ghostPlacementPad.material = ghostPadMaterial;
    ghostPlacementPad.isPickable = false;

    ghostPlacementRing = BABYLON.MeshBuilder.CreateTorus('GhostPlacementRing', {
      diameter: 0.95,
      thickness: 0.02,
      tessellation: 32
    }, sc);
    ghostPlacementRing.parent = ghostPlacementPad;
    ghostPlacementRing.position.set(0, 0.005, 0);
    ghostRingMaterial = new BABYLON.StandardMaterial('GhostRingMat', sc);
    ghostRingMaterial.emissiveColor = col;
    ghostRingMaterial.alpha = 0.70;
    ghostPlacementRing.material = ghostRingMaterial;
    ghostPlacementRing.isPickable = false;

    // Professional CAD Holographic Alignment Footprint Frame (1.4m x 1.2m)
    const ghostCadPlane = BABYLON.MeshBuilder.CreatePlane('GhostCadFootprint', {
      width: 1.4,
      height: 1.2
    }, sc);
    ghostCadPlane.rotation.x = Math.PI / 2;
    ghostCadPlane.position.set(0, 0.008, 0);
    ghostCadPlane.parent = ghostPlacementPad;
    ghostCadPlane.isPickable = false;

    ghostCadDynamicTexture = new BABYLON.DynamicTexture('GhostCadTex', { width: 512, height: 440 }, sc, false);
    ghostCadDynamicTexture.hasAlpha = true;
    const ctx = ghostCadDynamicTexture.getContext() as unknown as CanvasRenderingContext2D;
    drawCadPlacementFootprint(ctx, 512, 440, newNodeFunction.value);
    ghostCadDynamicTexture.update();

    const cadMat = new BABYLON.StandardMaterial('GhostCadMat', sc);
    cadMat.diffuseTexture = ghostCadDynamicTexture;
    cadMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    cadMat.useAlphaFromDiffuseTexture = true;
    cadMat.disableLighting = true;
    cadMat.backFaceCulling = false;
    ghostCadPlane.material = cadMat;

    ghostPlacementPad.setEnabled(false);
  }
}

function updateGhostPadVisual(sc: BABYLON.Scene, func: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo') {
  ensureGhostPlacementPad(sc);
  if (!ghostCadDynamicTexture) return;
  const ctx = ghostCadDynamicTexture.getContext() as unknown as CanvasRenderingContext2D;
  drawCadPlacementFootprint(ctx, 512, 440, func);
  ghostCadDynamicTexture.update();

  const color = getNodeColor(func);
  if (ghostPadMaterial) {
    ghostPadMaterial.diffuseColor = color;
    ghostPadMaterial.emissiveColor = color.scale(0.85);
  }
  if (ghostRingMaterial) {
    ghostRingMaterial.emissiveColor = color;
  }
}

function hideGhostPlacementPad() {
  if (ghostPlacementPad) {
    ghostPlacementPad.setEnabled(false);
  }
  clearAlignmentGuideLines();
}

function rotateNode(nodeId: string, deltaDegrees: number = 90) {
  const node = factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const currentRad = node.rotationY || 0;
  let currentDeg = Math.round((currentRad * 180) / Math.PI);
  currentDeg = Math.round(currentDeg / 90) * 90;
  let nextDeg = (currentDeg + deltaDegrees) % 360;
  if (nextDeg < 0) nextDeg += 360;

  const nextRad = Math.round(((nextDeg * Math.PI) / 180) * 10000) / 10000;
  node.rotationY = nextRad;

  const pad = nodeMeshesMap.get(nodeId);
  if (pad) {
    pad.rotation.y = nextRad;
    if (scene && selectedEditorNodeId.value === nodeId) {
      createNodeRotationWidget(scene, pad, nodeId);
    }
  }
  if (cargoContextMenu.value.node?.id === nodeId) {
    cargoContextMenu.value.node.rotationY = nextRad;
  }

  markLayoutDirty();
  emit('notify', `已將站點 ${node.name || node.id} 轉向至 ${nextDeg}°`, 'info');
}

function setNodeHeading(nodeId: string, targetDeg: number) {
  const node = factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const nextDeg = ((targetDeg % 360) + 360) % 360;
  const nextRad = Math.round(((nextDeg * Math.PI) / 180) * 10000) / 10000;
  node.rotationY = nextRad;

  const pad = nodeMeshesMap.get(nodeId);
  if (pad) {
    pad.rotation.y = nextRad;
    if (scene && selectedEditorNodeId.value === nodeId) {
      createNodeRotationWidget(scene, pad, nodeId);
    }
  }
  if (cargoContextMenu.value.node?.id === nodeId) {
    cargoContextMenu.value.node.rotationY = nextRad;
  }

  markLayoutDirty();
  emit('notify', `已將站點 ${node.name || node.id} 轉向至 ${nextDeg}°`, 'info');
}

function rotateProp(propId: string, deltaDegrees: number = 90) {
  const prop = factoryLayout.props.find(p => p.id === propId);
  if (!prop) return;
  const currentRad = prop.rotationY || 0;
  let currentDeg = Math.round((currentRad * 180) / Math.PI);
  currentDeg = Math.round(currentDeg / 90) * 90;
  let nextDeg = (currentDeg + deltaDegrees) % 360;
  if (nextDeg < 0) nextDeg += 360;

  const nextRad = Math.round(((nextDeg * Math.PI) / 180) * 10000) / 10000;
  prop.rotationY = nextRad;
  const mesh = propMeshesMap.get(propId);
  if (mesh) {
    mesh.rotation.y = nextRad;
  }
  markLayoutDirty();
  emit('notify', `已將物件 ${propId} 旋轉至 ${nextDeg}°`, 'info');
}

function rotateSelectedElement(deltaDegrees: number = 90) {
  if (selectedEditorNodeId.value) {
    rotateNode(selectedEditorNodeId.value, deltaDegrees);
  } else if (selectedEditorPropId.value) {
    rotateProp(selectedEditorPropId.value, deltaDegrees);
  }
}

// Kinematics Interpolation
const targetPos = new BABYLON.Vector3(0, 0, 0);
let currentPos = new BABYLON.Vector3(0, 0, 0);

onMounted(async () => {
  if (!canvasRef.value) return;

  // 1. Initialize Babylon Engine & Scene
  engine = new BABYLON.Engine(canvasRef.value, true, { preserveDrawingBuffer: true, stencil: true });
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.11, 1.0); // Slate OLED dark

  // 2. Setup Camera
  camera = new BABYLON.ArcRotateCamera(
    'FactoryCamera',
    -Math.PI / 3,
    Math.PI / 3.2,
    28,
    new BABYLON.Vector3(5, 0, 5),
    scene
  );
  camera.attachControl(canvasRef.value, true);
  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 55;
  camera.upperBetaLimit = Math.PI / 2 - 0.05;

  // 3. Setup Lighting
  const hemiLight = new BABYLON.HemisphericLight('HemiLight', new BABYLON.Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.7;
  hemiLight.diffuse = new BABYLON.Color3(0.9, 0.95, 1.0);
  hemiLight.groundColor = new BABYLON.Color3(0.12, 0.15, 0.22);

  const dirLight = new BABYLON.DirectionalLight('DirLight', new BABYLON.Vector3(-1, -2, -1), scene);
  dirLight.position = new BABYLON.Vector3(20, 35, 20);
  dirLight.intensity = 0.9;
  dirLight.diffuse = new BABYLON.Color3(1, 0.98, 0.94);

  // 4. Setup Floor
  createFactoryFloor(scene);

  // 5. Setup GizmoManager for Edit Mode
  setupGizmoManager(scene);

  // 6. Setup Interactive Pointer Events (Rubber-band, Picking, Selection)
  setupInteractivePointerEvents(scene);

  // 7. Load AGV .glb Model (or fallback to procedural chassis)
  await loadAGVModel(scene);

  // 8. Load Layout from Backend (nodes, edges, static props)
  await loadAndRenderLayout(scene);

  // 9. Register Visual Events for Cargo
  let isPickAnimationRunning = false;
  let isDropAnimationRunning = false;

  onVisualEvent((event, vehicleId) => {
    const vId = vehicleId || 'AGV-001';
    const vState = fleetVehicles[vId] || agvState;
    const currNodeId = vState.task_info?.current_node;

    if (event === 'pick_start') {
      if (!isPickAnimationRunning) {
        isPickAnimationRunning = true;
        const scale = currentTimeScale.value || 1;
        const pickDelay = Math.max(150, Math.round(1100 / scale));
        // 在進叉起升時刻隱藏站點靜態貨物，由車輛抬升牙叉接管，徹底避免重疊！
        setTimeout(() => {
          if (currNodeId) {
            const stNode = factoryLayout.nodes.find(n => n.id === currNodeId);
            if (stNode && isCargoNode(stNode.id)) {
              toggleStationCargo(stNode, false);
            }
          }
        }, pickDelay);

        performPickAnimation(scene!, vId).finally(() => {
          const resetDelay = Math.max(500, Math.round(3800 / scale));
          setTimeout(() => { isPickAnimationRunning = false; }, resetDelay);
        });
      }
    } else if (event === 'pick_done') {
      // 動作結束，只做狀態重設，絕不重複執行取貨動畫
      isPickAnimationRunning = false;
    } else if (event === 'drop_start') {
      if (!isDropAnimationRunning) {
        isDropAnimationRunning = true;
        const scale = currentTimeScale.value || 1;
        const dropDelay = Math.max(200, Math.round(2100 / scale));
        // 在放貨降落時刻將貨物交棒由站點棧板顯示
        setTimeout(() => {
          if (currNodeId) {
            const stNode = factoryLayout.nodes.find(n => n.id === currNodeId);
            if (stNode && isCargoNode(stNode.id)) {
              toggleStationCargo(stNode, true);
            }
          }
        }, dropDelay);

        performDropAnimation(scene!, vId);
        const resetDelay = Math.max(500, Math.round(3800 / scale));
        setTimeout(() => { isDropAnimationRunning = false; }, resetDelay);
      }
    } else if (event === 'drop_done') {
      isDropAnimationRunning = false;
      // 放貨完成，立即強制徹底清理車輛上可能殘留的棧板與貨物模型
      clearVehicleCargo(vId);
      if (currNodeId) {
        const stNode = factoryLayout.nodes.find(n => n.id === currNodeId);
        if (stNode && isCargoNode(stNode.id)) {
          toggleStationCargo(stNode, true);
        }
      }
    }
  });

  // Listen for backend dispatch rejection errors
  onDispatchError((err) => {
    emit('notify', `⚠️ 派發被拒絕：${err}`, 'warn');
  });

  // Watch AGV Task Cargo State to keep static cargo synced
  watch(
    () => agvState.task_info.has_cargo,
    (hasCargo) => {
      if (hasCargo && !cargoMesh && !isPickAnimationRunning && agvState.task_info.status !== 'ACTING' && scene) {
        mountStaticCargo(scene, 'AGV-001');
      } else if (!hasCargo && (cargoMesh || vehicleVisuals.get('AGV-001')?.cargoMesh) && !isDropAnimationRunning && agvState.task_info.status !== 'ACTING') {
        clearVehicleCargo('AGV-001');
      }
    },
    { immediate: true }
  );

  // 10. Watch All Fleet Vehicles Dynamically
  watch(
    () => fleetVehicles,
    (fleet) => {
      if (!scene) return;
      for (const [vId, vData] of Object.entries(fleet)) {
        let visual = vehicleVisuals.get(vId);
        if (!visual) {
          createOrUpdateVehicleVisual(scene, vId, {
            x: vData.position.x,
            z: vData.position.z !== undefined ? vData.position.z : vData.position.y,
            theta: vData.position.theta
          });
          visual = vehicleVisuals.get(vId);
          if (!visual) continue;
          updateVehiclesEditModeState(currentAppMode.value === 'edit');
        }

        let rawX = vData.position.x;
        let rawZ = vData.position.z !== undefined ? vData.position.z : vData.position.y;
        let tTheta = vData.position.theta;

        visual.targetPos.x = rawX;
        visual.targetPos.z = rawZ;
        visual.targetTheta = tTheta;

        if (visual.trafficWaitMesh) {
          visual.trafficWaitMesh.isVisible = !!vData.task_info?.is_traffic_wait;
        }

        // 確保車輛載貨與棧板視覺完全符合後端狀態機
        if (vData.task_info) {
          if (vData.task_info.has_cargo === false && !isDropAnimationRunning && vData.task_info.status !== 'ACTING') {
            if (visual.cargoMesh || (vId === 'AGV-001' && cargoMesh)) {
              clearVehicleCargo(vId);
            }
          } else if (vData.task_info.has_cargo === true && !visual.cargoMesh && !isPickAnimationRunning && vData.task_info.status !== 'ACTING') {
            mountStaticCargo(scene, vId);
          }
        }

        updateVehicleOverheadBadge(scene, visual, vData);
        updateVehicleTrajectory(scene, visual, vData);

        if (vId === 'AGV-001' || vId === selectedVehicleId.value) {
          targetPos.copyFrom(visual.targetPos);
        }
      }
    },
    { deep: true, immediate: true }
  );

  // Watch selectedVehicleId and quick dispatch to update all halos
  watch(
    [() => selectedVehicleId.value, () => is3DQuickDispatchActive.value],
    ([vId, active]) => {
      for (const [id, visual] of vehicleVisuals.entries()) {
        if (visual.haloMesh) {
          visual.haloMesh.isVisible = active && id === vId;
        }
      }
    }
  );

  // Watch all fleet edge & node states to keep path tubes illuminated and station status rings updated
  watch(
    () => [
      agvState.edge_states, 
      agvState.passed_edges, 
      agvState.node_states,
      agvState.task_info?.current_node,
      agvState.task_info?.status,
      ...Object.values(fleetVehicles).map(v => v.edge_states),
      ...Object.values(fleetVehicles).map(v => v.passed_edges),
      ...Object.values(fleetVehicles).map(v => v.node_states),
      ...Object.values(fleetVehicles).map(v => v.task_info?.current_node),
      ...Object.values(fleetVehicles).map(v => v.task_info?.status),
      quickDispatchSteps.value.length,
      currentAgvStartNode.value,
      is3DQuickDispatchActive.value
    ],
    () => {
      updateDynamicPathMaterials();
      updateAllNodeTextures();
    },
    { deep: true }
  );

  watch(cameraFollowTrigger, () => {
    if (currentAppMode.value === 'simulate') {
      setCameraView('follow');
    }
  });

  watch(
    () => newNodeFunction.value,
    (func) => {
      if (scene && currentEditorTool.value === 'add_node') {
        updateGhostPadVisual(scene, func);
      }
    }
  );

  watch(
    () => edgeDirectionMode.value,
    () => {
      if (currentAppMode.value === 'edit' && currentEditorTool.value === 'add_edge' && edgeFirstNodeId.value && scene) {
        const startNode = factoryLayout.nodes.find(n => n.id === edgeFirstNodeId.value);
        if (!startNode) return;
        const startPoint = new BABYLON.Vector3(startNode.x, 0.05, startNode.z);
        let endPoint: BABYLON.Vector3 | null = null;
        let isSnapped = false;
        let targetId: string | null = null;
        if (hoveredNodeId.value) {
          const targetNode = factoryLayout.nodes.find(n => n.id === hoveredNodeId.value);
          if (targetNode) {
            endPoint = new BABYLON.Vector3(targetNode.x, 0.05, targetNode.z);
            isSnapped = true;
            targetId = hoveredNodeId.value;
          }
        } else if (previewEndpointReticle) {
          endPoint = previewEndpointReticle.position.clone();
        }
        if (endPoint) {
          updateEdgeCreationPreview(scene, startPoint, endPoint, isSnapped, targetId);
        }
      }
    }
  );

  function syncNodeDragBehaviors() {
    const canDrag = (currentAppMode.value === 'edit' && currentEditorTool.value === 'select');
    nodeMeshesMap.forEach((pad) => {
      const dragBehavior = pad.behaviors.find(b => b.name === 'PointerDrag') as BABYLON.PointerDragBehavior | undefined;
      if (dragBehavior) {
        dragBehavior.enabled = canDrag;
      }
    });
  }

  // 12. Watch App Mode & Editor Tool change
  watch(
    [() => currentAppMode.value, () => currentEditorTool.value],
    ([mode, tool]) => {
      syncNodeDragBehaviors();
      updateVehiclesEditModeState(mode === 'edit');
      if (!gizmoManager) return;
      cancelEdgeConnection();

      if (mode === 'edit') {
        gizmoManager.attachToMesh(null);
        if (tool === 'select') {
          gizmoManager.positionGizmoEnabled = true;
          gizmoManager.rotationGizmoEnabled = true;
        } else {
          gizmoManager.positionGizmoEnabled = false;
          gizmoManager.rotationGizmoEnabled = false;
        }
      } else {
        gizmoManager.attachToMesh(null);
        gizmoManager.positionGizmoEnabled = false;
        gizmoManager.rotationGizmoEnabled = false;
      }

      if (mode !== 'edit' || tool !== 'add_node') {
        hideGhostPlacementPad();
      }
      if (mode !== 'edit' || tool !== 'select') {
        clearNodeSelection();
      }
    }
  );

  // 13. Render Loop with 60FPS Lerp Interpolation
  engine.runRenderLoop(() => {
    if (!scene) return;

    for (const v of vehicleVisuals.values()) {
      v.currentPos = BABYLON.Vector3.Lerp(v.currentPos, v.targetPos, 0.18);

      let diff = v.targetTheta - v.currentTheta;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      v.currentTheta += diff * 0.18;

      v.root.position.copyFrom(v.currentPos);
      v.root.rotation.y = v.currentTheta;

      // Update active path trajectory origin smoothly as vehicle moves
      if (v.activeTrajectoryMesh && !v.activeTrajectoryMesh.isDisposed()) {
        const vData = fleetVehicles[v.id] || (v.id === 'AGV-001' ? agvState : null);
        if (vData && vData.node_states && vData.node_states.length > 0 && vData.task_info?.status === 'DRIVING') {
          const pts: BABYLON.Vector3[] = [];
          pts.push(new BABYLON.Vector3(v.currentPos.x, 0.05, v.currentPos.z));
          for (const nId of vData.node_states) {
            const node = factoryLayout.nodes.find(n => n.id === nId);
            if (node) {
              pts.push(new BABYLON.Vector3(node.x, 0.05, node.z));
            }
          }
          if (pts.length >= 2) {
            v.activeTrajectoryMesh = BABYLON.MeshBuilder.CreateLines(`Trajectory_${v.id}`, {
              points: pts,
              instance: v.activeTrajectoryMesh
            }, scene);
          }
        }
      }

      if (currentView.value === 'follow' && camera && selectedVehicleId.value === v.id) {
        camera.target = BABYLON.Vector3.Lerp(camera.target, v.root.position, 0.1);
      }

      // Live animated battery charging loop
      const vData = fleetVehicles[v.id] || (v.id === 'AGV-001' ? agvState : null);
      if (vData) {
        const isCharging = !!vData.battery?.charging || vData.task_info?.action === 'charge' || vData.task_info?.display_message?.includes('充電');
        if (isCharging && scene) {
          updateVehicleOverheadBadge(scene, v, vData);
        }
      }
    }

    if (agvRoot && vehicleVisuals.has('AGV-001')) {
      const v1 = vehicleVisuals.get('AGV-001')!;
      currentPos.copyFrom(v1.currentPos);
    }

    scene.render();
  });

  // Keyboard shortcut listener (Esc to cancel edge/selection, Del to delete)
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', handleResize);
  if (canvasRef.value) {
    canvasRef.value.addEventListener('contextmenu', (e) => e.preventDefault());
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', handleResize);
  if (engine) {
    engine.dispose();
    engine = null;
  }
});

function handleResize() {
  if (engine) engine.resize();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (is3DQuickDispatchActive.value) {
      closeQuickDispatch();
    }
    cancelEdgeConnection();
    closeCargoContextMenu();
    clearNodeSelection();
    gizmoManager?.attachToMesh(null);
  } else if ((e.key === 'r' || e.key === 'R') && currentAppMode.value === 'edit' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const activeTag = (document.activeElement?.tagName || '').toLowerCase();
    if (activeTag !== 'input' && activeTag !== 'textarea') {
      e.preventDefault();
      rotateSelectedElement(e.shiftKey ? -90 : 90);
    }
  } else if (currentAppMode.value === 'edit' && selectedEditorNodeId.value && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const activeTag = (document.activeElement?.tagName || '').toLowerCase();
    if (activeTag !== 'input' && activeTag !== 'textarea') {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setNodeHeading(selectedEditorNodeId.value, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setNodeHeading(selectedEditorNodeId.value, 90);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setNodeHeading(selectedEditorNodeId.value, 180);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setNodeHeading(selectedEditorNodeId.value, 270);
      }
    }
  }
}

// ----------------------------------------------------
// Floor Construction
// ----------------------------------------------------
function createFactoryFloor(sc: BABYLON.Scene) {
  const ground = BABYLON.MeshBuilder.CreateGround('GroundFloor', { width: 44, height: 44, subdivisions: 2 }, sc);
  const groundMat = new BABYLON.StandardMaterial('GroundMat', sc);
  groundMat.diffuseColor = new BABYLON.Color3(0.06, 0.08, 0.13);
  groundMat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.07);
  ground.material = groundMat;
  ground.position.y = -0.01;
  ground.isPickable = true;

  // Grid Lines
  const gridLines: BABYLON.Vector3[][] = [];
  for (let x = -20; x <= 30; x += 2.5) {
    gridLines.push([new BABYLON.Vector3(x, 0.005, -20), new BABYLON.Vector3(x, 0.005, 30)]);
  }
  for (let z = -20; z <= 30; z += 2.5) {
    gridLines.push([new BABYLON.Vector3(-20, 0.005, z), new BABYLON.Vector3(30, 0.005, z)]);
  }
  const gridMesh = BABYLON.MeshBuilder.CreateLineSystem('GridLines', { lines: gridLines }, sc);
  gridMesh.color = new BABYLON.Color3(0.12, 0.16, 0.25);
  gridMesh.isPickable = false;
}

// ----------------------------------------------------
// 3.4 AGV .glb Model Loading & Procedural Mesh Animation
// ----------------------------------------------------
const VEHICLE_PALETTES = [
  { name: 'Cyan', color: new BABYLON.Color3(0.04, 0.75, 0.95), hex: '#06b6d4' },
  { name: 'Amber', color: new BABYLON.Color3(0.95, 0.55, 0.08), hex: '#f59e0b' },
  { name: 'Emerald', color: new BABYLON.Color3(0.1, 0.8, 0.45), hex: '#10b981' },
  { name: 'Violet', color: new BABYLON.Color3(0.65, 0.35, 0.95), hex: '#8b5cf6' },
];

async function createOrUpdateVehicleVisual(
  sc: BABYLON.Scene, 
  vehicleId: string, 
  initPos?: { x: number; z: number; theta?: number }
): Promise<VehicleVisual> {
  let existing = vehicleVisuals.get(vehicleId);
  if (existing) return existing;

  const idx = vehicleVisuals.size;
  const palette = VEHICLE_PALETTES[idx % VEHICLE_PALETTES.length];

  const root = new BABYLON.TransformNode(`Vehicle_${vehicleId}_Root`, sc);
  const px = initPos?.x ?? (idx === 0 ? 0 : 0);
  const pz = initPos?.z ?? (idx === 0 ? 0 : 10);
  const pTheta = initPos?.theta ?? Math.PI / 2;

  root.position.set(px, 0, pz);
  root.rotation.y = pTheta;

  const cPos = new BABYLON.Vector3(px, 0, pz);
  const tPos = new BABYLON.Vector3(px, 0, pz);

  const visual: VehicleVisual = {
    id: vehicleId,
    root,
    glbRoot: null,
    cargoMesh: null,
    haloMesh: null,
    trafficWaitMesh: null,
    overheadBadgeMesh: null,
    overheadBadgeTexture: null,
    lastBadgeSig: '',
    activeTrajectoryMesh: null,
    targetPos: tPos,
    currentPos: cPos,
    targetTheta: pTheta,
    currentTheta: pTheta,
    liftNode: null,
    baseLiftPosY: 0,
    isPickAnimationRunning: false,
    isDropAnimationRunning: false,
    color: palette.color,
  };

  vehicleVisuals.set(vehicleId, visual);
  if (vehicleId === 'AGV-001' || !agvRoot) {
    agvRoot = root;
  }

  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'agv.glb', sc);
    const glbRoot = result.meshes[0];
    glbRoot.parent = root;
    visual.glbRoot = glbRoot;

    const hierarchy = glbRoot.getHierarchyBoundingVectors();
    const size = hierarchy.max.subtract(hierarchy.min);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = maxDim > 0 ? 1.6 / maxDim : 0.01;
    glbRoot.scaling.setAll(scaleFactor);
    glbRoot.position.set(0, 0.05, 0);
    glbRoot.rotation.y = Math.PI;

    const accentMat = new BABYLON.StandardMaterial(`Mat_${vehicleId}`, sc);
    accentMat.diffuseColor = palette.color;
    accentMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    const foundNames: string[] = [];
    result.transformNodes.forEach(tn => {
      if (tn.name) foundNames.push(tn.name);
    });
    result.meshes.forEach(m => {
      m.isPickable = true;
      m.metadata = { type: 'agv', id: vehicleId };
      if (m.name && (m.name.toLowerCase().includes('body') || m.name.toLowerCase().includes('chassis'))) {
        m.material = accentMat;
      }
      if (m.name && !foundNames.includes(m.name)) foundNames.push(m.name);
    });

    if (vehicleId === 'AGV-001') {
      agvNodesList.value = foundNames;
    }

    const hitbox = BABYLON.MeshBuilder.CreateBox(`Hitbox_${vehicleId}`, { width: 1.8, height: 1.2, depth: 2.2 }, sc);
    hitbox.parent = root;
    hitbox.position.y = 0.4;
    hitbox.isPickable = true;
    hitbox.visibility = 0;
    hitbox.metadata = { type: 'agv', id: vehicleId };

    const forkNode = result.transformNodes.find(tn => tn.name === 'Object001');
    if (forkNode) {
      visual.liftNode = forkNode;
      visual.baseLiftPosY = 0;
      if (vehicleId === 'AGV-001') {
        selectedLiftNodeName.value = 'Object001';
        baseLiftPosY.value = 0;
        root.computeWorldMatrix(true);
        forkNode.computeWorldMatrix(true);
        const forkBounds = forkNode.getHierarchyBoundingVectors(true);
        forkRestTopY = forkBounds.min.y - root.position.y + 0.03;
        forkLiftMeters = GLB_FORK_LIFT_UNITS * scaleFactor;
      }
    }
  } catch (err) {
    console.warn(`[Babylon] Failed to load agv.glb for ${vehicleId}, using fallback:`, err);
    createFallbackAGV(sc, root, vehicleId);
  }

  // Halo for vehicle
  const halo = BABYLON.MeshBuilder.CreateTorus(`Halo_${vehicleId}`, { diameter: 2.2, thickness: 0.05, tessellation: 32 }, sc);
  halo.parent = root;
  halo.position.y = 0.03;
  const haloMat = new BABYLON.StandardMaterial(`HaloMat_${vehicleId}`, sc);
  haloMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  haloMat.emissiveColor = palette.color;
  halo.material = haloMat;
  halo.isVisible = (selectedVehicleId.value === vehicleId);
  halo.isPickable = false;
  visual.haloMesh = halo;

  if (vehicleId === 'AGV-001') {
    agvHaloMesh = halo;
  }

  // Traffic Wait Mesh
  visual.trafficWaitMesh = createTrafficWaitIndicator(sc, root, `TrafficWait_${vehicleId}`);

  if (currentAppMode.value === 'edit') {
    updateVehiclesEditModeState(true);
  }

  return visual;
}

/**
 * 編輯模式下車輛視覺處理：
 * 1. 將所有車輛模型與碰撞框設為非可點選 (isPickable = false)，讓點擊/懸停射線直接穿透到底部站點圓盤
 * 2. 設置半透明度 (visibility = 0.45)，讓使用者能清晰透視車身下的站點 Pad、旋轉方向箭頭與標記
 * 3. 切回模擬模式時恢復 100% 不透明與可選取狀態 (Hitbox 保持隱形)
 */
function updateVehiclesEditModeState(isEdit: boolean) {
  for (const visual of vehicleVisuals.values()) {
    if (!visual.root) continue;
    const meshes = visual.root.getChildMeshes(false);
    for (const m of meshes) {
      if (m.name.startsWith('Hitbox_')) {
        m.isPickable = !isEdit;
        m.visibility = 0;
      } else if (m.name.startsWith('Halo_') || m.name.startsWith('TrafficWait_')) {
        m.isPickable = false;
      } else {
        m.isPickable = !isEdit;
        m.visibility = isEdit ? 0.45 : 1.0;
      }
    }
  }
}

async function loadAGVModel(sc: BABYLON.Scene) {
  const ids = Object.keys(fleetVehicles);
  const initialIds = ids.length > 0 ? ids : ['AGV-001', 'AGV-002'];

  for (const id of initialIds) {
    const v = fleetVehicles[id];
    const pos = v?.position ? {
      x: v.position.x,
      z: v.position.z !== undefined ? v.position.z : v.position.y,
      theta: v.position.theta
    } : (id === 'AGV-002' ? { x: 0, z: 10, theta: Math.PI / 2 } : { x: 0, z: 0, theta: Math.PI / 2 });

    await createOrUpdateVehicleVisual(sc, id, pos);
  }

  updateVehiclesEditModeState(currentAppMode.value === 'edit');
  createAGVBeacon(sc);
}

function createTrafficWaitIndicator(sc: BABYLON.Scene, parentRoot: BABYLON.TransformNode, name: string): BABYLON.Mesh {
  const waitMesh = BABYLON.MeshBuilder.CreateCylinder(name, {
    diameter: 0.55,
    height: 0.08,
    tessellation: 24
  }, sc);
  waitMesh.parent = parentRoot;
  waitMesh.position.set(0, 1.6, 0);
  const mat = new BABYLON.StandardMaterial(`${name}_Mat`, sc);
  mat.diffuseColor = new BABYLON.Color3(0.95, 0.15, 0.15);
  mat.emissiveColor = new BABYLON.Color3(1.0, 0.2, 0.2);
  waitMesh.material = mat;
  waitMesh.isVisible = false;
  waitMesh.isPickable = false;
  return waitMesh;
}

// ----------------------------------------------------
// Requirement 3: Vehicle Overhead Dynamic Holographic Totem Emblem (No tiny text!)
// ----------------------------------------------------
function drawChargingBatteryBadge(ctx: CanvasRenderingContext2D, now: number) {
  ctx.clearRect(0, 0, 256, 256);

  // 1. Outer Dark Emerald/Cyan Glass Container with pulsing neon glow
  const pulse = 0.75 + 0.25 * Math.sin(now * 0.006);
  ctx.save();
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(4, 32, 38, 0.94)';
  ctx.fill();

  ctx.lineWidth = 12;
  ctx.strokeStyle = `rgba(0, 245, 255, ${pulse})`;
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 22;
  ctx.stroke();

  // Thin inner accent circle
  ctx.beginPath();
  ctx.arc(128, 128, 98, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 245, 255, 0.45)';
  ctx.shadowBlur = 0;
  ctx.stroke();

  // 2. Vertical Battery Body
  const bx = 86;
  const by = 82;
  const bw = 84;
  const bh = 122;
  const br = 10;

  // Battery terminal (+) on top
  const tw = 36;
  const th = 10;
  const tx = 128 - tw / 2;
  const ty = by - th + 2;
  drawRoundRect(ctx, tx, ty, tw, th, 4);
  ctx.fillStyle = '#00f5ff';
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 10;
  ctx.fill();

  // Battery casing outline
  drawRoundRect(ctx, bx, by, bw, bh, br);
  ctx.fillStyle = 'rgba(2, 16, 22, 0.90)';
  ctx.fill();
  ctx.strokeStyle = '#00f5ff';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 12;
  ctx.stroke();

  // 3. Animated Energy Fill Level (4 Segmented Bars from bottom to top)
  const cycle = (now % 1400) / 1400; // 0.0 to 1.0 (1.4s cycle)
  const totalBars = 4;
  const barSpacing = 4;
  const innerPad = 7;
  const innerW = bw - innerPad * 2;
  const innerH = bh - innerPad * 2;
  const singleBarH = (innerH - (totalBars - 1) * barSpacing) / totalBars;

  let activeBars = Math.floor(cycle * (totalBars + 1));
  if (activeBars > totalBars) activeBars = totalBars;

  for (let i = 0; i < totalBars; i++) {
    const barY = by + bh - innerPad - (i + 1) * singleBarH - i * barSpacing;
    const isLit = i < activeBars;

    if (isLit) {
      const colors = ['#10b981', '#34d399', '#38bdf8', '#00f5ff'];
      ctx.fillStyle = colors[i] || '#00f5ff';
      ctx.shadowColor = colors[i] || '#00f5ff';
      ctx.shadowBlur = 12;
      drawRoundRect(ctx, bx + innerPad, barY, innerW, singleBarH, 4);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0, 245, 255, 0.08)';
      ctx.shadowBlur = 0;
      drawRoundRect(ctx, bx + innerPad, barY, innerW, singleBarH, 4);
      ctx.fill();
    }
  }

  // 4. Center Glowing Lightning Icon ⚡ Overlay
  ctx.font = 'bold 36px "Segoe UI Symbol", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#fef08a';
  ctx.shadowBlur = 14;
  ctx.fillText('⚡', 128, 143);

  ctx.restore();
}

function updateVehicleOverheadBadge(
  sc: BABYLON.Scene,
  visual: VehicleVisual,
  vData: any
) {
  if (!visual.overheadBadgeMesh) {
    const plane = BABYLON.MeshBuilder.CreatePlane(`Badge_${visual.id}`, { size: 0.85 }, sc);
    plane.parent = visual.root;
    plane.position.set(0, 1.72, 0);
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;

    const tex = new BABYLON.DynamicTexture(`BadgeTex_${visual.id}`, { width: 256, height: 256 }, sc, true);
    tex.hasAlpha = true;
    const mat = new BABYLON.StandardMaterial(`BadgeMat_${visual.id}`, sc);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    plane.material = mat;

    visual.overheadBadgeMesh = plane;
    visual.overheadBadgeTexture = tex;
  }

  const isCharging = !!vData.battery?.charging || vData.task_info?.action === 'charge' || vData.task_info?.display_message?.includes('充電');
  if (isCharging) {
    visual.lastBadgeSig = ''; // Force continuous animation update
    const tex = visual.overheadBadgeTexture;
    if (tex) {
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
      drawChargingBatteryBadge(ctx, performance.now());
      tex.update();
    }
    return;
  }

  const isTrafficWait = !!vData.task_info?.is_traffic_wait;
  const isActing = vData.task_info?.status === 'ACTING';
  const action = vData.task_info?.action;
  const isDriving = vData.task_info?.status === 'DRIVING';

  // Signature based purely on visual state (no tiny battery text)
  const stateKey = isTrafficWait ? 'wait' : (isActing ? `acting_${action}` : (isDriving ? 'driving' : 'idle'));
  const sig = `${visual.id}_${stateKey}`;
  if (visual.lastBadgeSig === sig) return;
  visual.lastBadgeSig = sig;

  const tex = visual.overheadBadgeTexture;
  if (!tex) return;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 256);

  let ringColor = '#10b981';
  let glowColor = '#34d399';
  let innerBg = 'rgba(6, 78, 59, 0.88)';
  let totemGlyph = '●';
  let totemColor = '#34d399';
  let fontSize = 135;

  if (isTrafficWait) {
    // 🛑 Crimson Alert Stop Totem
    ringColor = '#ef4444';
    glowColor = '#f43f5e';
    innerBg = 'rgba(69, 10, 10, 0.94)';
    totemGlyph = '🛑';
    totemColor = '#ffffff';
    fontSize = 140;
  } else if (isActing && action === 'pick') {
    // 📦 Golden Amber Pick Cargo Totem
    ringColor = '#f59e0b';
    glowColor = '#fbbf24';
    innerBg = 'rgba(69, 26, 3, 0.92)';
    totemGlyph = '📦';
    totemColor = '#fbbf24';
    fontSize = 140;
  } else if (isActing && action === 'drop') {
    // 📥 Regal Purple Drop Cargo Totem
    ringColor = '#a855f7';
    glowColor = '#c084fc';
    innerBg = 'rgba(59, 7, 100, 0.92)';
    totemGlyph = '📥';
    totemColor = '#e9d5ff';
    fontSize = 140;
  } else if (isActing) {
    // ⚙️ General Acting
    ringColor = '#f59e0b';
    glowColor = '#fbbf24';
    innerBg = 'rgba(69, 26, 3, 0.92)';
    totemGlyph = '⚙️';
    totemColor = '#fbbf24';
    fontSize = 140;
  } else if (isDriving) {
    // ➤ Turbo Sky Blue Navigation Totem
    ringColor = '#38bdf8';
    glowColor = '#0ea5e9';
    innerBg = 'rgba(8, 47, 73, 0.90)';
    totemGlyph = '➤';
    totemColor = '#38bdf8';
    fontSize = 150;
  } else {
    // ◉ Standby / Idle Totem
    ringColor = '#10b981';
    glowColor = '#34d399';
    innerBg = 'rgba(6, 78, 59, 0.85)';
    totemGlyph = '●';
    totemColor = '#34d399';
    fontSize = 130;
  }

  ctx.save();

  // 1. Draw outer glowing ring
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fillStyle = innerBg;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = ringColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 24;
  ctx.stroke();

  // 2. Draw inner thin accent ring
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.shadowBlur = 0;
  ctx.stroke();

  // 3. Draw giant high-contrast totem symbol in center (no tiny text!)
  ctx.font = `bold ${fontSize}px "Segoe UI Symbol", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = totemColor;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18;
  ctx.fillText(totemGlyph, 128, 132);

  ctx.restore();
  tex.update();
}

// ----------------------------------------------------
// Requirement 4: Real-time Active Trajectory Ribbon & Pruning
// ----------------------------------------------------
function updateVehicleTrajectory(
  sc: BABYLON.Scene,
  visual: VehicleVisual,
  vData: any
) {
  const isDriving = vData.task_info?.status === 'DRIVING';
  const nodeStates = vData.node_states || [];

  if (!isDriving || nodeStates.length === 0) {
    if (visual.activeTrajectoryMesh) {
      visual.activeTrajectoryMesh.dispose();
      visual.activeTrajectoryMesh = null;
    }
    return;
  }

  // Build point sequence: Live vehicle position -> Remaining unpassed nodes
  const pts: BABYLON.Vector3[] = [];
  pts.push(new BABYLON.Vector3(visual.currentPos.x, 0.05, visual.currentPos.z));

  for (const nId of nodeStates) {
    const node = factoryLayout.nodes.find(n => n.id === nId);
    if (node) {
      pts.push(new BABYLON.Vector3(node.x, 0.05, node.z));
    }
  }

  if (pts.length < 2) {
    if (visual.activeTrajectoryMesh) {
      visual.activeTrajectoryMesh.dispose();
      visual.activeTrajectoryMesh = null;
    }
    return;
  }

  if (visual.activeTrajectoryMesh && !visual.activeTrajectoryMesh.isDisposed()) {
    visual.activeTrajectoryMesh = BABYLON.MeshBuilder.CreateLines(`Trajectory_${visual.id}`, {
      points: pts,
      instance: visual.activeTrajectoryMesh
    }, sc);
  } else {
    const line = BABYLON.MeshBuilder.CreateLines(`Trajectory_${visual.id}`, {
      points: pts,
      updatable: true
    }, sc);
    line.color = visual.color || new BABYLON.Color3(0, 0.95, 1.0);
    line.isPickable = false;
    visual.activeTrajectoryMesh = line;
  }
}

function createFallbackAGV(sc: BABYLON.Scene, parentRoot: BABYLON.TransformNode = agvRoot!, vehId: string = 'AGV-001') {
  if (!parentRoot) return;
  // Main chassis (body at rear)
  const chassis = BABYLON.MeshBuilder.CreateBox(`AGV_Chassis_${vehId}`, { width: 0.9, height: 0.45, depth: 1.1 }, sc);
  chassis.parent = parentRoot;
  chassis.position.set(0, 0.225, -0.2);
  chassis.isPickable = true;
  chassis.metadata = { type: 'agv', id: vehId };
  const chassisMat = new BABYLON.StandardMaterial(`AGV_ChassisMat_${vehId}`, sc);
  chassisMat.diffuseColor = new BABYLON.Color3(0.15, 0.17, 0.22);
  chassis.material = chassisMat;

  // Mast vertical columns
  const mast = BABYLON.MeshBuilder.CreateBox(`AGV_Mast_${vehId}`, { width: 0.5, height: 1.2, depth: 0.08 }, sc);
  mast.parent = parentRoot;
  mast.position.set(0, 0.6, 0.35);
  mast.material = chassisMat;

  // Fork Carriage Root
  const forkCarriage = new BABYLON.TransformNode(`AGV_ForkCarriage_${vehId}`, sc);
  forkCarriage.parent = parentRoot;
  forkCarriage.position.set(0, 0.08, 0.4);

  // Left & right fork tines (牙叉)
  const forkMat = new BABYLON.StandardMaterial(`AGV_ForkMat_${vehId}`, sc);
  forkMat.diffuseColor = new BABYLON.Color3(0.92, 0.72, 0.1); // Industrial safety yellow forks
  forkMat.emissiveColor = new BABYLON.Color3(0.15, 0.12, 0.02);

  const forkL = BABYLON.MeshBuilder.CreateBox(`Fork_Left_${vehId}`, { width: 0.09, height: 0.04, depth: 0.6 }, sc);
  forkL.parent = forkCarriage;
  forkL.position.set(-0.16, 0, 0.3);
  forkL.material = forkMat;

  const forkR = BABYLON.MeshBuilder.CreateBox('Fork_Right', { width: 0.09, height: 0.04, depth: 0.6 }, sc);
  forkR.parent = forkCarriage;
  forkR.position.set(0.16, 0, 0.3);
  forkR.material = forkMat;

  agvNodesList.value = ['AGV_ForkCarriage', 'AGV_Chassis'];
  selectedLiftNodeName.value = 'AGV_ForkCarriage';
  baseLiftPosY.value = 0.08;
  forkRestTopY = 0.10;   // 程序化牙叉: carriage 0.08 + 半厚 0.02
  forkLiftMeters = 0.30;
  createAGVSelectionHalo(sc);
}

function createAGVSelectionHalo(sc: BABYLON.Scene) {
  if (!agvRoot) return;
  if (agvHaloMesh) agvHaloMesh.dispose();
  agvHaloMesh = BABYLON.MeshBuilder.CreateTorus('AGV_Halo', {
    diameter: 2.2,
    thickness: 0.05,
    tessellation: 32
  }, sc);
  agvHaloMesh.parent = agvRoot;
  agvHaloMesh.position.y = 0.03;
  const mat = new BABYLON.StandardMaterial('AGV_HaloMat', sc);
  mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  mat.emissiveColor = new BABYLON.Color3(0.06, 0.75, 1.0); // Bright Neon Cyan
  agvHaloMesh.material = mat;
  agvHaloMesh.isVisible = is3DQuickDispatchActive.value;
  agvHaloMesh.isPickable = false;
}

function createAGVBeacon(sc: BABYLON.Scene) {
  if (!agvRoot) return;
  const beacon = BABYLON.MeshBuilder.CreateSphere('AGV_Beacon', { diameter: 0.2, segments: 16 }, sc);
  beacon.parent = agvRoot;
  beacon.position.set(0, 0.52, -0.6);
  beaconMaterial = new BABYLON.StandardMaterial('BeaconMat', sc);
  beaconMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.85, 0.4);
  beacon.material = beaconMaterial;

  watch(
    () => agvState.task_info.status,
    (st) => {
      if (!beaconMaterial) return;
      if (st === 'DRIVING') beaconMaterial.emissiveColor = new BABYLON.Color3(0.06, 0.75, 1.0);
      else if (st === 'ACTING') beaconMaterial.emissiveColor = new BABYLON.Color3(1.0, 0.55, 0.0);
      else beaconMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.85, 0.4);
    },
    { immediate: true }
  );
}

// ----------------------------------------------------
// 3.4 Pick & Drop Dynamic Cargo Animation (using guess_box.glb on Forklift Tines)
// ----------------------------------------------------
// NOTE: guess_box.glb 的實際階層尺寸約 218 單位 (Sketchfab FBX 匯出帶 100x 節點縮放),
// 不能用固定 scaling 值，必須以 getHierarchyBoundingVectors() 量測後正規化到目標尺寸。
// 【修改貨箱尺寸】：修改 CARGO_SIZE 數值即可 (單位為公尺)。
// 原為 0.35 (35cm)，依需求縮小 90% (剩餘 10%) 即為 0.035 (3.5cm)。若需其他尺寸可直接填入 (例: 0.15 = 15cm)。
const CARGO_SIZE = 0.65;           // 貨箱最終邊長 (公尺)
const CARGO_HALF = CARGO_SIZE / 2;
const FORK_FRONT_Z = 0.7;           // 牙叉中心在車體座標的前方偏移
const GLB_FORK_LIFT_UNITS = 48;     // agv.glb 牙叉節點 (Object001) 在模型原始單位下的抬升量

// 由 loadAGVModel / createFallbackAGV 依實際模型量測後填入 (AGV 本地座標, 公尺)
let forkRestTopY = 0.10;            // 牙叉放下時的上緣高度
let forkLiftMeters = 0.28;          // 牙叉抬升高度

const cargoGroundY = () => 0.0;                                          // 棧板貼地時底面高度
const cargoElevatedY = () => forkRestTopY + forkLiftMeters;             // 棧板置於抬升牙叉上的高度

function getForkLiftTargetY(liftNode: BABYLON.TransformNode | BABYLON.Mesh): number {
  return liftNode.name === 'Object001'
    ? baseLiftPosY.value + GLB_FORK_LIFT_UNITS
    : baseLiftPosY.value + forkLiftMeters;
}

/** 載入 plastic_pallet.glb 並依階層包圍盒正規化，寬度 1.2m */
async function loadNormalizedPallet(sc: BABYLON.Scene): Promise<BABYLON.AbstractMesh> {
  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'plastic_pallet.glb', sc);
    const palletRoot = result.meshes[0];
    palletRoot.name = 'PlasticPallet';
    const bounds = palletRoot.getHierarchyBoundingVectors(true);
    const maxHoriz = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 0.1);
    const s = 1.2 / maxHoriz;
    palletRoot.scaling.setAll(s);
    for (const m of result.meshes) {
      m.isPickable = true;
    }
    return palletRoot;
  } catch (err) {
    console.warn('[Pallet] plastic_pallet.glb 載入失敗，改用程序化棧板:', err);
    const box = BABYLON.MeshBuilder.CreateBox('PalletFallback', { width: 1.2, height: 0.14, depth: 1.0 }, sc);
    const mat = new BABYLON.StandardMaterial('PalletMat', sc);
    mat.diffuseColor = new BABYLON.Color3(0.12, 0.28, 0.48);
    box.material = mat;
    box.isPickable = true;
    return box;
  }
}

/** 載入 guess_box.glb 並依階層包圍盒正規化為 CARGO_SIZE 邊長、中心置於原點 */
async function loadNormalizedCargo(sc: BABYLON.Scene): Promise<BABYLON.AbstractMesh> {
  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/models/', 'guess_box.glb', sc);
    const boxRoot = result.meshes[0];
    boxRoot.name = 'CargoBox_Guess';

    // 必須在掛到 AGV 之前量測，避免父節點轉換影響包圍盒
    const bounds = boxRoot.getHierarchyBoundingVectors(true);
    const size = bounds.max.subtract(bounds.min);
    const maxDim = Math.max(size.x, size.y, size.z, 1e-3);
    const s = CARGO_SIZE / maxDim;
    boxRoot.scaling.scaleInPlace(s);

    // 修正模型原點偏移，讓貨箱幾何中心位於 root 原點
    const center = bounds.min.add(bounds.max).scale(0.5 * s);
    boxRoot.position.subtractInPlace(center);

    for (const m of result.meshes) m.isPickable = false;
    return boxRoot;
  } catch (err) {
    console.warn('[Cargo] guess_box.glb 載入失敗，改用程序化貨箱:', err);
    const fallback = BABYLON.MeshBuilder.CreateBox('CargoBox', { size: CARGO_SIZE }, sc);
    const cargoMat = new BABYLON.StandardMaterial('CargoMat', sc);
    cargoMat.diffuseColor = new BABYLON.Color3(0.94, 0.52, 0.1);
    fallback.material = cargoMat;
    fallback.isPickable = false;
    return fallback;
  }
}

/** 包一層 TransformNode，讓車載貨物同時具備棧板與貨物（有貨時=棧板+貨物） */
async function createCargoHolder(sc: BABYLON.Scene, y: number, parentRoot: BABYLON.TransformNode | null = agvRoot): Promise<BABYLON.TransformNode> {
  const holder = new BABYLON.TransformNode('CargoHolder', sc);

  // 1. 牙叉底部的棧板 (plastic pallet)
  const pallet = await loadNormalizedPallet(sc);
  pallet.parent = holder;
  pallet.position.set(0, 0, 0);

  // 2. 棧板頂部的貨箱 (箱底緊貼棧板上表面，棧板高約 0.14m)
  const box = await loadNormalizedCargo(sc);
  box.parent = holder;
  box.position.set(0, 0.14 + CARGO_HALF, 0);

  if (parentRoot) {
    holder.parent = parentRoot;
  }
  holder.position.set(0, y, FORK_FRONT_Z);
  return holder;
}

/** 清理指定車輛上的任何貨物與棧板，並將牙叉復位至最低休息高度 */
function clearVehicleCargo(vehicleId: string) {
  const visual = vehicleVisuals.get(vehicleId);
  if (visual?.cargoMesh) {
    visual.cargoMesh.dispose();
    visual.cargoMesh = null;
  }
  if (vehicleId === 'AGV-001' && cargoMesh) {
    cargoMesh.dispose();
    cargoMesh = null;
  }
  const root = visual?.root || (vehicleId === 'AGV-001' ? agvRoot : null);
  if (root) {
    const children = root.getChildren ? root.getChildren() : [];
    for (const child of children) {
      if (child.name.includes('Cargo') || child.name.includes('Holder') || child.name.includes('Pallet')) {
        child.dispose();
      }
    }
  }
  const liftNode = visual?.liftNode || (selectedLiftNodeName.value && scene ? scene.getNodeByName(selectedLiftNodeName.value) : null) as BABYLON.TransformNode | BABYLON.Mesh | null;
  if (liftNode && 'position' in liftNode) {
    liftNode.position.y = baseLiftPosY.value;
  }
}

async function mountStaticCargo(sc: BABYLON.Scene, vehicleId: string = 'AGV-001') {
  const visual = vehicleVisuals.get(vehicleId);
  const root = visual?.root || agvRoot;
  if (!root) return;
  if (visual?.cargoMesh || (vehicleId === 'AGV-001' && cargoMesh)) return;

  const holder = await createCargoHolder(sc, cargoElevatedY(), root);
  if (visual) visual.cargoMesh = holder;
  if (vehicleId === 'AGV-001') cargoMesh = holder;

  const liftNode = visual?.liftNode || (selectedLiftNodeName.value ? sc.getNodeByName(selectedLiftNodeName.value) : null) as BABYLON.TransformNode | BABYLON.Mesh | null;
  if (liftNode && 'position' in liftNode) {
    liftNode.position.y = getForkLiftTargetY(liftNode);
  }
}

async function performPickAnimation(sc: BABYLON.Scene, vehicleId: string = 'AGV-001') {
  const visual = vehicleVisuals.get(vehicleId);
  const root = visual?.root || agvRoot;
  if (!root) return;

  clearVehicleCargo(vehicleId);

  const liftNode = visual?.liftNode || (selectedLiftNodeName.value ? sc.getNodeByName(selectedLiftNodeName.value) : null) as BABYLON.TransformNode | BABYLON.Mesh | null;
  if (liftNode && 'position' in liftNode) {
    liftNode.position.y = baseLiftPosY.value;
  }

  const scale = currentTimeScale.value || 1.0;
  const liftDelayMs = Math.max(250, Math.round(1100 / scale));

  // 伸入棧板底部後，牙叉連同棧板與貨物一同托起升空！
  setTimeout(async () => {
    const holder = await createCargoHolder(sc, cargoGroundY(), root);
    if (visual) visual.cargoMesh = holder;
    if (vehicleId === 'AGV-001') cargoMesh = holder;

    const ease = new BABYLON.CubicEase();
    ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

    if (liftNode && 'position' in liftNode) {
      BABYLON.Animation.CreateAndStartAnimation(
        'forkPickAnim', liftNode, 'position.y', 30, 30,
        baseLiftPosY.value, getForkLiftTargetY(liftNode),
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease
      );
    }

    BABYLON.Animation.CreateAndStartAnimation(
      'boxPickAnim', holder, 'position.y', 30, 30,
      cargoGroundY(), cargoElevatedY(),
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease
    );
  }, liftDelayMs);
}

function performDropAnimation(sc: BABYLON.Scene, vehicleId: string = 'AGV-001') {
  const visual = vehicleVisuals.get(vehicleId);
  const liftNode = visual?.liftNode || (selectedLiftNodeName.value ? sc.getNodeByName(selectedLiftNodeName.value) : null) as BABYLON.TransformNode | BABYLON.Mesh | null;
  const holder = visual?.cargoMesh || (vehicleId === 'AGV-001' ? cargoMesh : null);

  const scale = currentTimeScale.value || 1.0;
  const dropWaitMs = Math.max(250, Math.round(1100 / scale));
  const disposeDelayMs = Math.max(200, Math.round(1000 / scale));

  setTimeout(() => {
    const ease = new BABYLON.CubicEase();
    ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

    // 牙叉下降 (放貨到棧板/地面)
    if (liftNode && 'position' in liftNode) {
      BABYLON.Animation.CreateAndStartAnimation(
        'forkDropAnim', liftNode, 'position.y', 30, 30,
        liftNode.position.y, baseLiftPosY.value,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease
      );
    }

    if (holder) {
      // 貨箱與棧板隨牙叉平穩降到地面
      BABYLON.Animation.CreateAndStartAnimation(
        'cargoLowerToGround', holder, 'position.y', 30, 30,
        holder.position.y, cargoGroundY(),
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT, ease
      );

      // 降到地面後脫離 AGV，由站點棧板接收並徹底銷毀車載模型
      setTimeout(() => {
        try {
          if (!holder.isDisposed()) {
            holder.dispose();
          }
        } catch (e) {
          console.warn('Disposing dropped cargo holder:', e);
        }
        clearVehicleCargo(vehicleId);
      }, disposeDelayMs);
    }
  }, dropWaitMs);
}

// ----------------------------------------------------
// 3.1 & 3.5 Layout Rendering & Directional Arrows
// ----------------------------------------------------
async function loadAndRenderLayout(sc: BABYLON.Scene) {
  // If in edit mode with unsaved changes, preserve and restore user's in-progress edits from localStorage!
  if (currentAppMode.value === 'edit' && hasUnsavedChanges.value) {
    try {
      const draftStr = localStorage.getItem('omnihive_edit_draft');
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft && draft.nodes && draft.nodes.length > 0) {
          factoryLayout.version = draft.version || '2.0.0';
          factoryLayout.nodes = draft.nodes;
          factoryLayout.edges = draft.edges || [];
          factoryLayout.props = draft.props || [];
          rebuildLayoutInScene(sc);
          console.log('[BabylonScene] Restored edit draft upon load');
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse draft in BabylonScene:', e);
    }
  }

  await fetchLayout();
  rebuildLayoutInScene(sc);
}

function rebuildLayoutInScene(sc: BABYLON.Scene) {
  nodeMeshesMap.forEach(m => m.dispose());
  nodeMeshesMap.clear();

  stationPalletMap.forEach(m => m.dispose());
  stationPalletMap.clear();

  stationCargoMap.forEach(m => m.dispose());
  stationCargoMap.clear();

  nodeTextureMap.clear();



  edgeMeshesMap.forEach(m => m.dispose());
  edgeMeshesMap.clear();

  edgeArrowMeshesMap.forEach(arrows => arrows.forEach(a => a.dispose()));
  edgeArrowMeshesMap.clear();

  propMeshesMap.forEach(m => m.dispose());
  propMeshesMap.clear();

  factoryLayout.nodes.forEach(node => {
    createNodeInScene(sc, node);
  });

  // Ensure at most one edge exists between any two nodes (prevent duplicates/overlap)
  const edgePairMap = new Map<string, LayoutEdge>();
  for (const edge of factoryLayout.edges) {
    const pairKey = [edge.startNodeId, edge.endNodeId].sort().join('---');
    edgePairMap.set(pairKey, edge);
  }
  factoryLayout.edges = Array.from(edgePairMap.values());

  factoryLayout.edges.forEach(edge => {
    createEdgeInScene(sc, edge);
  });

  factoryLayout.props.forEach(prop => {
    createPropInScene(sc, prop);
  });

  updateDynamicPathMaterials();
}

const isChargingNode = (nodeId: string): boolean => isChargingNodeUtil(nodeId, factoryLayout.nodes);

const resolvePickedNodeFromPointer = (
  sc: BABYLON.Scene,
  pickResult?: BABYLON.Nullable<BABYLON.PickingInfo>
) => resolvePickedNodeFromPointerUtil(sc, pickResult, factoryLayout.nodes, fleetVehicles, vehicleVisuals);

const checkObjectClearanceCollision = (
  x: number, 
  z: number, 
  excludeId?: string, 
  minDistance: number = MIN_CLEARANCE_DIST
) => checkObjectClearanceCollisionUtil(x, z, factoryLayout.nodes, factoryLayout.props, excludeId, minDistance);

/**
 * 切換貨物站點的棧板載貨狀態 (有貨: 棧板+貨物 / 無貨: 無棧板無貨物)
 */
async function toggleStationCargo(node: LayoutNode, forceState?: boolean) {
  if (!node || !isCargoNode(node.id)) return;
  const newState = forceState !== undefined ? forceState : !node.has_cargo;
  node.has_cargo = newState;

  const pad = nodeMeshesMap.get(node.id);
  const existingCargo = stationCargoMap.get(node.id);
  const existingPallet = stationPalletMap.get(node.id);

  if (newState) {
    if (pad) {
      pad.position.y = 0.16;
    }
    if (!existingPallet && scene) {
      try {
        const palletRoot = await loadNormalizedPallet(scene);
        palletRoot.name = `StationPallet_${node.id}`;
        palletRoot.metadata = { type: 'node', id: node.id, subType: 'pallet' };
        if (pad) {
          palletRoot.parent = pad;
          palletRoot.position.set(0, -0.16, 0);
        } else {
          palletRoot.position.set(node.x, 0, node.z);
        }
        for (const m of (palletRoot.getChildMeshes ? palletRoot.getChildMeshes() : [])) {
          m.metadata = { type: 'node', id: node.id, subType: 'pallet' };
          m.isPickable = true;
        }
        stationPalletMap.set(node.id, palletRoot);
      } catch (err) {
        console.warn('Failed to load station pallet:', err);
      }
    }
    if (!existingCargo && scene) {
      const boxMesh = await loadNormalizedCargo(scene);
      boxMesh.name = `StationCargo_${node.id}`;
      if (pad) {
        boxMesh.parent = pad;
        boxMesh.position.set(0, 0.02 + CARGO_HALF, 0);
      } else {
        boxMesh.position.set(node.x, 0.16 + 0.02 + CARGO_HALF, node.z);
      }
      boxMesh.metadata = { type: 'node', id: node.id, subType: 'cargo' };
      boxMesh.isPickable = true;
      stationCargoMap.set(node.id, boxMesh);
    }
    const existingCargoIcon = scene?.getMeshByName(`CargoIcon_${node.id}`);
    if (existingCargoIcon) {
      existingCargoIcon.isVisible = false;
    }
  } else {
    if (pad) {
      pad.position.y = 0.04;
    }
    if (existingCargo) {
      existingCargo.dispose();
      stationCargoMap.delete(node.id);
    }
    if (existingPallet) {
      existingPallet.dispose();
      stationPalletMap.delete(node.id);
    }
    const existingCargoIcon = scene?.getMeshByName(`CargoIcon_${node.id}`);
    if (existingCargoIcon) {
      existingCargoIcon.isVisible = true;
    }
  }
  updateNodeTexture(node.id);
  markLayoutDirty();
  emit('notify', `${node.name || node.id}: 已設為「${node.has_cargo ? '有貨 (棧板+貨物)' : '無貨 (無棧板)'}」`, 'info');
}



function getNodeStatus(nodeId: string): 'normal' | 'active' | 'waiting' | 'occupied' | 'fault' {
  const node = factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return 'normal';

  // Check if occupied by any AGV
  for (const v of Object.values(fleetVehicles)) {
    if (v.task_info?.current_node === nodeId) {
      if (v.task_info?.is_traffic_wait) return 'waiting';
      if (v.task_info?.status === 'DRIVING' || v.task_info?.status === 'ACTING') return 'active';
      return 'occupied';
    }
    const dx = v.position.x - node.x;
    const dz = v.position.z - node.z;
    if (dx * dx + dz * dz < 0.64) {
      if (v.task_info?.is_traffic_wait) return 'waiting';
      if (v.task_info?.status === 'DRIVING' || v.task_info?.status === 'ACTING') return 'active';
      return 'occupied';
    }
  }

  // AGV-001 check
  if (agvState.task_info?.current_node === nodeId) {
    if (agvState.task_info?.is_traffic_wait) return 'waiting';
    if (agvState.task_info?.status === 'DRIVING' || agvState.task_info?.status === 'ACTING') return 'active';
    return 'occupied';
  }

  // Check if reserved by any active route
  const isReserved = Object.values(fleetVehicles).some(v => v.node_states?.includes(nodeId)) || agvState.node_states?.includes(nodeId);
  if (isReserved) return 'active';

  // Check if cargo on station
  if (isCargoNode(nodeId) && node.has_cargo) {
    return 'occupied';
  }

  return 'normal';
}

function getNodeBadge(nodeId: string): 'start' | 'target' | null {
  if (is3DQuickDispatchActive.value) {
    if (currentAgvStartNode.value === nodeId) return 'start';
    const lastStep = quickDispatchSteps.value[quickDispatchSteps.value.length - 1];
    if (lastStep?.node_id === nodeId) return 'target';
  }
  return null;
}

function updateNodeTexture(nodeId: string) {
  const entry = nodeTextureMap.get(nodeId);
  if (!entry) return;
  const node = factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const ctx = entry.texture.getContext() as unknown as CanvasRenderingContext2D;
  const status = getNodeStatus(nodeId);
  const badge = getNodeBadge(nodeId);
  drawStationIconTexture(ctx, 512, 512, node, status, badge);
  entry.texture.update();
}

function updateAllNodeTextures() {
  for (const nodeId of nodeTextureMap.keys()) {
    updateNodeTexture(nodeId);
  }
}

function createNodeInScene(sc: BABYLON.Scene, node: LayoutNode) {
  const isCargoStation = isCargoNode(node.id);
  const padY = (isCargoStation && node.has_cargo) ? 0.16 : 0.04;

  // Station chassis disc
  const pad = BABYLON.MeshBuilder.CreateCylinder(`Pad_${node.id}`, {
    diameter: 0.90,
    height: 0.03,
    tessellation: 36
  }, sc);
  pad.position.set(node.x, padY, node.z);
  pad.rotation.y = node.rotationY || 0;
  pad.metadata = { type: 'node', id: node.id };
  pad.isPickable = true;

  const padMat = new BABYLON.StandardMaterial(`PadMat_${node.id}`, sc);
  padMat.diffuseColor = new BABYLON.Color3(0.08, 0.12, 0.20);
  padMat.emissiveColor = new BABYLON.Color3(0.04, 0.06, 0.10);
  pad.material = padMat;

  // Vector Dynamic Texture Plane with Double Concentric Rings & Concept Blueprint Icons
  const iconPlane = BABYLON.MeshBuilder.CreatePlane(`NodeIconPlane_${node.id}`, { size: 0.88 }, sc);
  iconPlane.rotation.x = Math.PI / 2;
  iconPlane.position.set(0, 0.021, 0);
  iconPlane.parent = pad;
  iconPlane.isPickable = false;

  const nodeTex = new BABYLON.DynamicTexture(`NodeTex_${node.id}`, { width: 512, height: 512 }, sc, true);
  nodeTex.hasAlpha = true;
  const ctx = nodeTex.getContext() as unknown as CanvasRenderingContext2D;
  const status = getNodeStatus(node.id);
  const badge = getNodeBadge(node.id);
  drawStationIconTexture(ctx, 512, 512, node, status, badge);
  nodeTex.update();

  const iconMat = new BABYLON.StandardMaterial(`NodeIconMat_${node.id}`, sc);
  iconMat.diffuseTexture = nodeTex;
  iconMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  iconMat.useAlphaFromDiffuseTexture = true;
  iconMat.disableLighting = true;
  iconPlane.material = iconMat;

  nodeTextureMap.set(node.id, { texture: nodeTex, plane: iconPlane });

  // If Cargo station: Plastic pallet + Cargo box ONLY when node.has_cargo is true
  if (isCargoStation) {
    if (node.has_cargo) {
      loadNormalizedPallet(sc).then(palletRoot => {
        palletRoot.name = `StationPallet_${node.id}`;
        palletRoot.parent = pad;
        palletRoot.metadata = { type: 'node', id: node.id, subType: 'pallet' };
        for (const m of (palletRoot.getChildMeshes ? palletRoot.getChildMeshes() : [])) {
          m.metadata = { type: 'node', id: node.id, subType: 'pallet' };
          m.isPickable = true;
        }
        palletRoot.position.set(0, -0.16, 0);
        stationPalletMap.set(node.id, palletRoot);
      }).catch(err => {
        console.warn('Fallback procedural pallet:', err);
      });

      loadNormalizedCargo(sc).then(boxMesh => {
        boxMesh.name = `StationCargo_${node.id}`;
        boxMesh.parent = pad;
        boxMesh.position.set(0, 0.02 + CARGO_HALF, 0);
        boxMesh.metadata = { type: 'node', id: node.id, subType: 'cargo' };
        boxMesh.isPickable = true;
        stationCargoMap.set(node.id, boxMesh);
      });
    }
  }

  // Direct 2D floor planar drag behavior without directional arrows
  const dragBehavior = new BABYLON.PointerDragBehavior({
    dragPlaneNormal: new BABYLON.Vector3(0, 1, 0)
  });
  dragBehavior.useObjectOrientationForDragging = false;
  dragBehavior.enabled = (currentAppMode.value === 'edit' && currentEditorTool.value === 'select');

  let dragStartPos = { x: node.x, z: node.z };

  dragBehavior.onDragStartObservable.add(() => {
    if (camera) camera.detachControl();
    dragStartPos = { x: node.x, z: node.z };
    selectedEditorNodeId.value = node.id;
    selectedEditorPropId.value = null;
    gizmoManager?.attachToMesh(null);
    highlightSelectedNode(sc, pad);
  });

  dragBehavior.onDragObservable.add(() => {
    pad.position.y = (isCargoNode(node.id) && node.has_cargo) ? 0.16 : 0.04;
    const snap = computeSmartSnap(pad.position.x, pad.position.z, node.id);
    pad.position.x = snap.snappedX;
    pad.position.z = snap.snappedZ;
    updateAlignmentGuideLines(sc, snap.snappedX, snap.snappedZ, snap.alignedNodesX, snap.alignedNodesZ);

    const n = factoryLayout.nodes.find(item => item.id === node.id);
    if (n) {
      n.x = snap.snappedX;
      n.z = snap.snappedZ;
      updateEdgesForNode(sc, node.id);
    }

    // Real-time synchronization of directional arrows during dragging
    if (nodeRotationWidgetRoot && selectedEditorNodeId.value === node.id) {
      const widgetY = (isCargoNode(node.id) && node.has_cargo) ? 0.175 : 0.046;
      nodeRotationWidgetRoot.position.set(snap.snappedX, widgetY, snap.snappedZ);
    }
  });

  dragBehavior.onDragEndObservable.add(() => {
    if (camera && canvasRef.value) camera.attachControl(canvasRef.value, true);
    pad.position.y = (isCargoNode(node.id) && node.has_cargo) ? 0.16 : 0.04;
    clearAlignmentGuideLines();
    const snap = computeSmartSnap(pad.position.x, pad.position.z, node.id);
    const candidateX = snap.snappedX;
    const candidateZ = snap.snappedZ;
    pad.position.x = candidateX;
    pad.position.z = candidateZ;

    const collision = checkObjectClearanceCollision(candidateX, candidateZ, node.id, MIN_CLEARANCE_DIST);
    const n = factoryLayout.nodes.find(item => item.id === node.id);

    if (collision.hasCollision && n) {
      n.x = dragStartPos.x;
      n.z = dragStartPos.z;
      pad.position.x = dragStartPos.x;
      pad.position.z = dragStartPos.z;
      updateEdgesForNode(sc, node.id);
      if (nodeRotationWidgetRoot && selectedEditorNodeId.value === node.id) {
        const widgetY = (isCargoNode(node.id) && node.has_cargo) ? 0.175 : 0.046;
        nodeRotationWidgetRoot.position.set(dragStartPos.x, widgetY, dragStartPos.z);
      }
      emit('notify', `⚠️ 物件重疊衝突：與 ${collision.conflictingWith} 間距過近 (${collision.distance?.toFixed(2)}m < ${MIN_CLEARANCE_DIST}m)，已自動復原至安全間距！`, 'warn');
    } else if (n) {
      n.x = candidateX;
      n.z = candidateZ;
      pad.position.x = n.x;
      pad.position.z = n.z;
      updateEdgesForNode(sc, node.id);
      if (nodeRotationWidgetRoot && selectedEditorNodeId.value === node.id) {
        const widgetY = (isCargoNode(node.id) && node.has_cargo) ? 0.175 : 0.046;
        nodeRotationWidgetRoot.position.set(n.x, widgetY, n.z);
      }
      markLayoutDirty();
      emit('notify', `已移動站點: ${node.name || node.id}`, 'info');
    }

    if (selectedEditorNodeId.value === node.id) {
      createNodeRotationWidget(sc, pad, node.id);
    }
  });

  pad.addBehavior(dragBehavior);
  nodeMeshesMap.set(node.id, pad);
}

function updateEdgesForNode(sc: BABYLON.Scene, nodeId: string) {
  const connectedEdges = factoryLayout.edges.filter(
    e => e.startNodeId === nodeId || e.endNodeId === nodeId
  );
  if (connectedEdges.length === 0) return;

  connectedEdges.forEach(edge => {
    const oldMesh = edgeMeshesMap.get(edge.id);
    if (oldMesh) {
      if (oldMesh.material) oldMesh.material.dispose();
      oldMesh.dispose();
      edgeMeshesMap.delete(edge.id);
    }
    const oldArrows = edgeArrowMeshesMap.get(edge.id);
    if (oldArrows) {
      oldArrows.forEach(a => {
        if (a.material) a.material.dispose();
        a.dispose();
      });
      edgeArrowMeshesMap.delete(edge.id);
    }
    createEdgeInScene(sc, edge);
  });

  updateDynamicPathMaterials();
}



// Item 3: Golden Proportions for Path Tube & High-Visibility Directional Indicators
function createEdgeInScene(sc: BABYLON.Scene, edge: LayoutEdge) {
  const start = factoryLayout.nodes.find(n => n.id === edge.startNodeId);
  const end = factoryLayout.nodes.find(n => n.id === edge.endNodeId);
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
  edgeMeshesMap.set(edge.id, tube);

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

  edgeArrowMeshesMap.set(edge.id, arrows);
}

// 3.1 Dynamic Path Material Rendering: VDA 5050 Base (solid) vs Horizon (dim translucent) vs Passed
function updateDynamicPathMaterials() {
  const selVeh = fleetVehicles[selectedVehicleId.value] || agvState;
  const activeEdges = selVeh?.edge_states || agvState.edge_states || [];

  // Also collect active driving edges from all moving vehicles in fleet
  const drivingEdges = new Set<string>();
  const horizonEdges = new Set<string>();
  for (const v of Object.values(fleetVehicles)) {
    if (v.edge_states && v.edge_states.length > 0) {
      drivingEdges.add(v.edge_states[0]);
      for (let i = 1; i < v.edge_states.length; i++) {
        horizonEdges.add(v.edge_states[i]);
      }
    }
  }

  edgeMeshesMap.forEach((mesh, edgeId) => {
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

    const arrows = edgeArrowMeshesMap.get(edgeId);
    if (arrows) {
      const edgeObj = factoryLayout.edges.find(e => e.id === edgeId);
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

function createPropInScene(sc: BABYLON.Scene, prop: LayoutProp) {
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

// ----------------------------------------------------
// Gizmo Setup & Layout Sync (Item 1: Strictly 2D Planar Ground Movement)
// ----------------------------------------------------
function setupGizmoManager(sc: BABYLON.Scene) {
  gizmoManager = new BABYLON.GizmoManager(sc);
  gizmoManager.positionGizmoEnabled = true;
  gizmoManager.rotationGizmoEnabled = true;

  let nodeDragStartPos = { x: 0, z: 0 };
  let propDragStartPos = { x: 0, z: 0 };

  if (gizmoManager.gizmos.positionGizmo) {
    const pos = gizmoManager.gizmos.positionGizmo;
    pos.planarGizmoEnabled = true;
    if (pos.yGizmo) pos.yGizmo.isEnabled = false; // Strictly forbid Y-axis vertical translation!
    if (pos.xPlaneGizmo) pos.xPlaneGizmo.isEnabled = false;
    if (pos.zPlaneGizmo) pos.zPlaneGizmo.isEnabled = false;
    if (pos.yPlaneGizmo) pos.yPlaneGizmo.isEnabled = true; // X-Z ground plane movement handle

    pos.onDragStartObservable.add(() => {
      const m = gizmoManager?.attachedMesh;
      if (m && m.metadata?.type === 'node') {
        const n = factoryLayout.nodes.find(p => p.id === m.metadata.id);
        if (n) {
          nodeDragStartPos = { x: n.x, z: n.z };
        }
      } else if (m && m.metadata?.type === 'prop') {
        const prop = factoryLayout.props.find(p => p.id === m.metadata.id);
        if (prop) {
          propDragStartPos = { x: prop.x, z: prop.z };
        }
      }
    });

    pos.onDragObservable.add(() => {
      const m = gizmoManager?.attachedMesh;
      if (m && m.metadata?.type === 'node') {
        m.position.y = 0.04;
        const n = factoryLayout.nodes.find(item => item.id === m.metadata.id);
        if (n) {
          n.x = m.position.x;
          n.z = m.position.z;
          updateEdgesForNode(sc, n.id);
        }
      }
    });

    pos.onDragEndObservable.add(() => {
      const m = gizmoManager?.attachedMesh;
      if (m && m.metadata?.type === 'node') {
        m.position.y = 0.04;
        const candidateX = Math.round(m.position.x * 100) / 100;
        const candidateZ = Math.round(m.position.z * 100) / 100;
        const collision = checkObjectClearanceCollision(candidateX, candidateZ, m.metadata.id, MIN_CLEARANCE_DIST);
        const n = factoryLayout.nodes.find(item => item.id === m.metadata.id);
        if (collision.hasCollision && n) {
          n.x = nodeDragStartPos.x;
          n.z = nodeDragStartPos.z;
          m.position.x = nodeDragStartPos.x;
          m.position.z = nodeDragStartPos.z;
          updateEdgesForNode(sc, n.id);
          emit('notify', `⚠️ 物件重疊衝突：與 ${collision.conflictingWith} 間距過近 (${collision.distance?.toFixed(2)}m < ${MIN_CLEARANCE_DIST}m)，已自動復原至安全位置！`, 'warn');
          return;
        } else if (n) {
          n.x = candidateX;
          n.z = candidateZ;
          m.position.x = candidateX;
          m.position.z = candidateZ;
          updateEdgesForNode(sc, n.id);
          markLayoutDirty();
        }
      } else if (m && m.metadata?.type === 'prop') {
        const prop = factoryLayout.props.find(p => p.id === m.metadata.id);
        if (prop) {
          const candidateX = Math.round(m.position.x * 100) / 100;
          const candidateZ = Math.round(m.position.z * 100) / 100;
          const collision = checkObjectClearanceCollision(candidateX, candidateZ, prop.id, MIN_CLEARANCE_DIST);
          if (collision.hasCollision) {
            // Revert!
            m.position.x = propDragStartPos.x;
            m.position.z = propDragStartPos.z;
            prop.x = propDragStartPos.x;
            prop.z = propDragStartPos.z;
            emit('notify', `⚠️ 物件重疊衝突：與 ${collision.conflictingWith} 間距過近 (${collision.distance?.toFixed(2)}m < ${MIN_CLEARANCE_DIST}m)，已自動復原至安全位置！`, 'warn');
            return;
          }
        }
      }
      syncGizmoTargetToLayout();
      markLayoutDirty();
    });
  }

  if (gizmoManager.gizmos.rotationGizmo) {
    const rot = gizmoManager.gizmos.rotationGizmo;
    if (rot.xGizmo) rot.xGizmo.isEnabled = false;
    if (rot.zGizmo) rot.zGizmo.isEnabled = false;
    if (rot.yGizmo) rot.yGizmo.isEnabled = true; // Allow Y rotation for props only

    rot.onDragEndObservable.add(() => {
      syncGizmoTargetToLayout();
      markLayoutDirty();
    });
  }

  // Detach initially
  gizmoManager.attachToMesh(null);
  gizmoManager.positionGizmoEnabled = false;
  gizmoManager.rotationGizmoEnabled = false;
}

function attachGizmoToTarget(mesh: BABYLON.AbstractMesh | null) {
  if (!gizmoManager) return;
  if (!mesh || !mesh.metadata) {
    gizmoManager.attachToMesh(null);
    clearNodeSelection();
    selectedEditorNodeId.value = null;
    selectedEditorPropId.value = null;
    return;
  }

  const meta = mesh.metadata;
  if (meta.type === 'node') {
    selectedEditorNodeId.value = meta.id;
    selectedEditorPropId.value = null;
    const targetNodeMesh = nodeMeshesMap.get(meta.id) || mesh;
    highlightSelectedNode(scene!, targetNodeMesh);

    // Requirement: No ugly gizmo arrows for nodes! Direct floor PointerDragBehavior is used.
    gizmoManager.attachToMesh(null);
    gizmoManager.rotationGizmoEnabled = false;
    gizmoManager.positionGizmoEnabled = false;
  } else if (meta.type === 'prop') {
    clearNodeSelection();
    selectedEditorPropId.value = meta.id;
    selectedEditorNodeId.value = null;
    const targetPropMesh = propMeshesMap.get(meta.id) || mesh;
    gizmoManager.positionGizmoEnabled = true;
    gizmoManager.rotationGizmoEnabled = true;
    gizmoManager.attachToMesh(targetPropMesh);

    if (gizmoManager.gizmos.positionGizmo) {
      const pos = gizmoManager.gizmos.positionGizmo;
      if (pos.yGizmo) pos.yGizmo.isEnabled = false;
      pos.planarGizmoEnabled = true;
      if (pos.xGizmo) pos.xGizmo.isEnabled = true;
      if (pos.zGizmo) pos.zGizmo.isEnabled = true;
      if (pos.xPlaneGizmo) pos.xPlaneGizmo.isEnabled = false;
      if (pos.zPlaneGizmo) pos.zPlaneGizmo.isEnabled = false;
      if (pos.yPlaneGizmo) pos.yPlaneGizmo.isEnabled = true;
    }
    if (gizmoManager.gizmos.rotationGizmo) {
      const rot = gizmoManager.gizmos.rotationGizmo;
      if (rot.xGizmo) rot.xGizmo.isEnabled = false;
      if (rot.zGizmo) rot.zGizmo.isEnabled = false;
      if (rot.yGizmo) rot.yGizmo.isEnabled = true;
    }
  }
}

function syncGizmoTargetToLayout() {
  if (!gizmoManager || !gizmoManager.attachedMesh) return;
  const m = gizmoManager.attachedMesh;
  const meta = m.metadata;
  if (!meta) return;

  if (meta.type === 'node') {
    m.position.y = 0.04;
    const node = factoryLayout.nodes.find(n => n.id === meta.id);
    if (node) {
      node.x = Math.round(m.position.x * 100) / 100;
      node.z = Math.round(m.position.z * 100) / 100;
      node.y = 0;
      rebuildEdgesOnly(scene!);
    }
  } else if (meta.type === 'prop') {
    const prop = factoryLayout.props.find(p => p.id === meta.id);
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

function rebuildEdgesOnly(sc: BABYLON.Scene) {
  edgeMeshesMap.forEach(m => m.dispose());
  edgeMeshesMap.clear();

  edgeArrowMeshesMap.forEach(arrows => arrows.forEach(a => a.dispose()));
  edgeArrowMeshesMap.clear();

  factoryLayout.edges.forEach(edge => {
    createEdgeInScene(sc, edge);
  });
  updateDynamicPathMaterials();
}

// ----------------------------------------------------
// Problem 2: Rubber-band Connection & Pointer Events
// ----------------------------------------------------
function setupInteractivePointerEvents(sc: BABYLON.Scene) {
  sc.onPointerObservable.add((pointerInfo) => {
    // Requirement 5: Global Right-click handling for station cargo status editing
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
      const evt = pointerInfo.event as MouseEvent;
      if (evt && evt.button === 2) {
        handleRightClick(sc, pointerInfo);
        return;
      }
      if (cargoContextMenu.value.visible) {
        closeCargoContextMenu();
      }
    }

    // 1. Simulation Mode: Interactive 3D Vehicle & Node Dispatch
    if (currentAppMode.value === 'simulate') {
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
        const pick = pointerInfo.pickInfo;
        if (pick && pick.hit && pick.pickedMesh) {
          const type = pick.pickedMesh.metadata?.type;
          if (type === 'agv' || type === 'node' || resolvePickedNodeFromPointer(sc, pick)) {
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
        if (is3DQuickDispatchActive.value) {
          const targetNodeId = resolvePickedNodeFromPointer(sc, pick);
          const currVehNode = fleetVehicles[selectedVehicleId.value]?.task_info?.current_node;
          if (targetNodeId && targetNodeId !== currVehNode) {
            const padMesh = nodeMeshesMap.get(targetNodeId) || pick.pickedMesh;
            triggerNodeTargetRipple(sc, padMesh);
            addOrSelectNodeFromMap(targetNodeId);
            updateQuickDispatchPreviewLine(sc);
            const nodeObj = factoryLayout.nodes.find(n => n.id === targetNodeId);
            emit('notify', `已加入站點: ${targetNodeId} (${nodeObj?.name || ''}) - ${getNodeFunctionLabel(nodeObj?.function || '')}`, 'info');
            return;
          }
        }

        // A. Clicked AGV Vehicle directly in 3D!
        if (pick.pickedMesh.metadata?.type === 'agv') {
          const vId = pick.pickedMesh.metadata.id || 'AGV-001';
          selectedVehicleId.value = vId;
          selectVehicle(vId);
          dashboardActiveTab.value = 'vehicle';
          is3DQuickDispatchActive.value = true;
          resetDispatchSteps();
          setCameraView('follow');
          for (const [id, visual] of vehicleVisuals.entries()) {
            if (visual.haloMesh) visual.haloMesh.isVisible = (vId === id);
          }
          updateQuickDispatchPreviewLine(sc);
          emit('notify', `已鎖定車輛 ${selectedVehicleId.value}`, 'info');
          return;
        }

        // B. Clicked Node directly in 3D!
        const clickedNodeId = resolvePickedNodeFromPointer(sc, pick);
        if (clickedNodeId) {
          const padMesh = nodeMeshesMap.get(clickedNodeId) || pick.pickedMesh;
          triggerNodeTargetRipple(sc, padMesh);

          if (is3DQuickDispatchActive.value) {
            addOrSelectNodeFromMap(clickedNodeId);
            updateQuickDispatchPreviewLine(sc);
            const nodeObj = factoryLayout.nodes.find(n => n.id === clickedNodeId);
            emit('notify', `已加入站點: ${clickedNodeId} (${nodeObj?.name || ''}) - ${getNodeFunctionLabel(nodeObj?.function || '')}`, 'info');
          } else {
            const nodeObj = factoryLayout.nodes.find(n => n.id === clickedNodeId);
            emit('notify', `站點資訊: ${clickedNodeId} (${nodeObj?.name || ''}) - ${getNodeFunctionLabel(nodeObj?.function || '')}`, 'info');
          }
          return;
        }
      }
      return;
    }

    // 2. Edit Mode: Tool interactions
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
      handlePointerMoveInEditMode(sc, pointerInfo);
    } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
      handlePointerDownInEditMode(sc, pointerInfo);
    } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
      handlePointerUpInEditMode(sc, pointerInfo);
    }
  });
}

// ----------------------------------------------------
// Requirement 5: Station Cargo Context Menu Handlers
// ----------------------------------------------------
function handleRightClick(sc: BABYLON.Scene, pointerInfo: BABYLON.PointerInfo) {
  const pick = pointerInfo.pickInfo;
  const evt = pointerInfo.event as MouseEvent;

  if (!pick || !pick.hit || !pick.pickedMesh) {
    closeCargoContextMenu();
    return;
  }

  const pickedNodeId = resolvePickedNodeFromPointer(sc, pick);
  if (pickedNodeId) {
    const node = factoryLayout.nodes.find(n => n.id === pickedNodeId);
    if (node) {
      if (isCargoNode(node.id)) {
        openCargoContextMenu(evt, node);
        return;
      } else {
        closeCargoContextMenu();
        emit('notify', `站點 ${node.id} (${getNodeFunctionLabel(node.function)}) 非貨物站，無法編輯貨物狀態`, 'info');
        return;
      }
    }
  }
  closeCargoContextMenu();
}

function openCargoContextMenu(evt: MouseEvent, node: LayoutNode) {
  const menuWidth = 180;
  const menuHeight = 110;
  let x = evt.clientX;
  let y = evt.clientY;

  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 12;
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 12;
  }

  cargoContextMenu.value = {
    visible: true,
    x,
    y,
    node
  };
}

function closeCargoContextMenu() {
  cargoContextMenu.value.visible = false;
  cargoContextMenu.value.node = null;
}

async function setNodeCargoStatus(node: LayoutNode, hasCargo: boolean) {
  await toggleStationCargo(node, hasCargo);
  closeCargoContextMenu();
}

function triggerNodeTargetRipple(sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) {
  const ripple = BABYLON.MeshBuilder.CreateTorus('Ripple', { diameter: 1.6, thickness: 0.05, tessellation: 32 }, sc);
  ripple.position.copyFrom(nodeMesh.position);
  ripple.position.y += 0.02;

  const mat = new BABYLON.StandardMaterial('RippleMat', sc);
  mat.emissiveColor = new BABYLON.Color3(0.2, 0.9, 1.0);
  mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
  ripple.material = mat;

  BABYLON.Animation.CreateAndStartAnimation(
    'rippleScale',
    ripple,
    'scaling',
    30,
    18,
    new BABYLON.Vector3(1, 1, 1),
    new BABYLON.Vector3(1.5, 1.5, 1.5),
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  );

  setTimeout(() => {
    ripple.dispose();
  }, 600);
}

// ----------------------------------------------------
// High-Fidelity 3D Edge Preview System
// ----------------------------------------------------
function disposeEdgePreviewMeshes(includeStartRing = true) {
  if (previewEdgeTube) {
    if (previewEdgeTube.material) previewEdgeTube.material.dispose();
    previewEdgeTube.dispose();
    previewEdgeTube = null;
  }
  if (rubberBandLine) {
    rubberBandLine.dispose();
    rubberBandLine = null;
  }
  previewEdgeArrows.forEach(a => {
    if (a.material) a.material.dispose();
    a.dispose();
  });
  previewEdgeArrows = [];
  if (previewTargetSnapRing) {
    if (previewTargetSnapRing.material) previewTargetSnapRing.material.dispose();
    previewTargetSnapRing.dispose();
    previewTargetSnapRing = null;
  }
  if (previewEndpointReticle) {
    if (previewEndpointReticle.material) previewEndpointReticle.material.dispose();
    previewEndpointReticle.dispose();
    previewEndpointReticle = null;
  }
  if (previewEdgeBadge) {
    const mat = previewEdgeBadge.material as BABYLON.StandardMaterial | null;
    if (mat) {
      if (mat.diffuseTexture) mat.diffuseTexture.dispose();
      mat.dispose();
    }
    previewEdgeBadge.dispose();
    previewEdgeBadge = null;
  }
  if (previewHoverStartRing) {
    if (previewHoverStartRing.material) previewHoverStartRing.material.dispose();
    previewHoverStartRing.dispose();
    previewHoverStartRing = null;
  }
  if (includeStartRing) {
    clearNodeSelection();
  }
}

function updateEdgeCreationPreview(
  sc: BABYLON.Scene,
  startPoint: BABYLON.Vector3,
  endPoint: BABYLON.Vector3,
  isSnapped: boolean,
  targetNodeId: string | null
) {
  const dist = BABYLON.Vector3.Distance(startPoint, endPoint);
  if (dist < 0.08) {
    disposeEdgePreviewMeshes(false);
    return;
  }

  const dx = endPoint.x - startPoint.x;
  const dz = endPoint.z - startPoint.z;
  const forwardTheta = Math.atan2(dx, dz);
  const midPoint = BABYLON.Vector3.Lerp(startPoint, endPoint, 0.5);
  midPoint.y = 0.05;

  const isBidir = (edgeDirectionMode.value === 'bidirectional');

  // Palette: Snapped is Emerald Green (#10b981), Floating is Electric Cyan / Amber
  const previewColor = isSnapped
    ? new BABYLON.Color3(0.06, 0.95, 0.55)
    : (isBidir ? new BABYLON.Color3(0.06, 0.85, 1.0) : new BABYLON.Color3(0.98, 0.65, 0.08));

  // 1. 3D Volumetric Path Tube
  if (previewEdgeTube) {
    previewEdgeTube.dispose();
    previewEdgeTube = null;
  }
  previewEdgeTube = BABYLON.MeshBuilder.CreateTube('PreviewEdgeTube', {
    path: [startPoint, endPoint],
    radius: 0.038,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE
  }, sc);
  previewEdgeTube.isPickable = false;

  const tubeMat = new BABYLON.StandardMaterial('PreviewEdgeTubeMat', sc);
  tubeMat.diffuseColor = previewColor;
  tubeMat.emissiveColor = previewColor.scale(0.85);
  tubeMat.alpha = 0.88;
  previewEdgeTube.material = tubeMat;

  // 2. High-contrast Dashed Line Core
  if (rubberBandLine) {
    rubberBandLine.dispose();
    rubberBandLine = null;
  }
  rubberBandLine = BABYLON.MeshBuilder.CreateDashedLines('RubberBandPreview', {
    points: [
      new BABYLON.Vector3(startPoint.x, 0.065, startPoint.z),
      new BABYLON.Vector3(endPoint.x, 0.065, endPoint.z)
    ],
    dashSize: 0.35,
    gapSize: 0.20,
    dashNb: Math.max(6, Math.floor(dist * 3))
  }, sc);
  rubberBandLine.color = new BABYLON.Color3(1, 1, 1);
  rubberBandLine.isPickable = false;

  // 3. Directional Arrows
  previewEdgeArrows.forEach(a => {
    if (a.material) a.material.dispose();
    a.dispose();
  });
  previewEdgeArrows = [];

  const arrowMat = new BABYLON.StandardMaterial('PreviewArrowMat', sc);
  if (isBidir) {
    arrowMat.diffuseColor = new BABYLON.Color3(0.0, 0.85, 0.70);
    arrowMat.emissiveColor = new BABYLON.Color3(0.0, 0.96, 0.82);
  } else {
    arrowMat.diffuseColor = new BABYLON.Color3(0.95, 0.55, 0.05);
    arrowMat.emissiveColor = new BABYLON.Color3(1.0, 0.65, 0.08);
  }
  arrowMat.alpha = 0.95;

  if (isBidir) {
    const p1 = BABYLON.Vector3.Lerp(startPoint, endPoint, 0.38);
    const arrow1 = BABYLON.MeshBuilder.CreateCylinder('PreviewArr1', {
      diameterTop: 0,
      diameterBottom: 0.35,
      height: 0.48,
      tessellation: 3
    }, sc);
    arrow1.position.set(p1.x, 0.06, p1.z);
    arrow1.rotation.x = Math.PI / 2;
    arrow1.rotation.y = forwardTheta;
    arrow1.material = arrowMat;
    arrow1.isPickable = false;
    previewEdgeArrows.push(arrow1);

    const p2 = BABYLON.Vector3.Lerp(startPoint, endPoint, 0.62);
    const arrow2 = BABYLON.MeshBuilder.CreateCylinder('PreviewArr2', {
      diameterTop: 0,
      diameterBottom: 0.35,
      height: 0.48,
      tessellation: 3
    }, sc);
    arrow2.position.set(p2.x, 0.06, p2.z);
    arrow2.rotation.x = Math.PI / 2;
    arrow2.rotation.y = forwardTheta + Math.PI;
    arrow2.material = arrowMat;
    arrow2.isPickable = false;
    previewEdgeArrows.push(arrow2);
  } else {
    const pMid = BABYLON.Vector3.Lerp(startPoint, endPoint, 0.50);
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
    previewEdgeArrows.push(arrow);
  }

  // 4. Snapped Target Node Halo vs Floating Endpoint Reticle
  if (isSnapped && targetNodeId) {
    if (previewEndpointReticle) {
      previewEndpointReticle.dispose();
      previewEndpointReticle = null;
    }
    if (!previewTargetSnapRing) {
      previewTargetSnapRing = BABYLON.MeshBuilder.CreateTorus('PreviewTargetSnapRing', {
        diameter: 0.95,
        thickness: 0.035,
        tessellation: 32
      }, sc);
      const snapMat = new BABYLON.StandardMaterial('TargetSnapMat', sc);
      snapMat.diffuseColor = new BABYLON.Color3(0.06, 0.95, 0.55);
      snapMat.emissiveColor = new BABYLON.Color3(0.2, 1.0, 0.6);
      previewTargetSnapRing.material = snapMat;
      previewTargetSnapRing.isPickable = false;
    }
    previewTargetSnapRing.position.set(endPoint.x, 0.045, endPoint.z);
    previewTargetSnapRing.setEnabled(true);
  } else {
    if (previewTargetSnapRing) {
      previewTargetSnapRing.dispose();
      previewTargetSnapRing = null;
    }
    if (!previewEndpointReticle) {
      previewEndpointReticle = BABYLON.MeshBuilder.CreateDisc('PreviewEndpointReticle', {
        radius: 0.20,
        tessellation: 24
      }, sc);
      previewEndpointReticle.rotation.x = Math.PI / 2;
      const reticleMat = new BABYLON.StandardMaterial('ReticleMat', sc);
      reticleMat.diffuseColor = previewColor;
      reticleMat.emissiveColor = previewColor;
      reticleMat.alpha = 0.65;
      previewEndpointReticle.material = reticleMat;
      previewEndpointReticle.isPickable = false;
    }
    previewEndpointReticle.position.set(endPoint.x, 0.045, endPoint.z);
    previewEndpointReticle.setEnabled(true);
  }

  // Remove redundant floating distance badge on path as requested
  if (previewEdgeBadge) {
    previewEdgeBadge.dispose();
    previewEdgeBadge = null;
  }
}

function completeEdgeConnection(sc: BABYLON.Scene, startId: string, endId: string) {
  cancelEdgeConnection();

  const isBidir = (edgeDirectionMode.value === 'bidirectional');

  // Check if edge already exists between these two nodes in EITHER direction
  const existingIdx = factoryLayout.edges.findIndex(e => 
    (e.startNodeId === startId && e.endNodeId === endId) ||
    (e.startNodeId === endId && e.endNodeId === startId)
  );

  if (existingIdx >= 0) {
    const existingEdge = factoryLayout.edges[existingIdx];
    
    const oldMesh = edgeMeshesMap.get(existingEdge.id);
    if (oldMesh) {
      oldMesh.dispose();
      edgeMeshesMap.delete(existingEdge.id);
    }
    const oldArrows = edgeArrowMeshesMap.get(existingEdge.id);
    if (oldArrows) {
      oldArrows.forEach(a => a.dispose());
      edgeArrowMeshesMap.delete(existingEdge.id);
    }

    existingEdge.startNodeId = startId;
    existingEdge.endNodeId = endId;
    existingEdge.bidirectional = isBidir;

    createEdgeInScene(sc, existingEdge);
    updateDynamicPathMaterials();
    markLayoutDirty();
    emit('notify', `已更新路徑: ${startId} ${isBidir ? '⇄' : '➔'} ${endId} (${isBidir ? '雙向' : '單向'})`, 'success');
  } else {
    const edgeId = `Edge-${startId.replace('Node-', '')}-${endId.replace('Node-', '')}`;
    const newEdge: LayoutEdge = {
      id: edgeId,
      startNodeId: startId,
      endNodeId: endId,
      bidirectional: isBidir
    };
    factoryLayout.edges.push(newEdge);
    createEdgeInScene(sc, newEdge);
    updateDynamicPathMaterials();
    markLayoutDirty();
    emit('notify', `已建立路徑: ${startId} ${isBidir ? '⇄' : '➔'} ${endId} (${isBidir ? '雙向' : '單向'})`, 'success');
  }
}

function handlePointerUpInEditMode(sc: BABYLON.Scene, pointerInfo: BABYLON.PointerInfo) {
  const tool = currentEditorTool.value;
  if (tool === 'add_edge' && edgeFirstNodeId.value) {
    const targetId = hoveredNodeId.value || resolvePickedNodeFromPointer(sc, pointerInfo.pickInfo);
    if (targetId && targetId !== edgeFirstNodeId.value) {
      completeEdgeConnection(sc, edgeFirstNodeId.value, targetId);
    }
  }
}

function handlePointerMoveInEditMode(sc: BABYLON.Scene, pointerInfo: BABYLON.PointerInfo) {
  const tool = currentEditorTool.value;

  if (tool === 'add_node') {
    if (rubberBandLine) {
      rubberBandLine.dispose();
      rubberBandLine = null;
    }
    hoveredNodeId.value = null;
    updateGhostPadVisual(sc, newNodeFunction.value);

    // Compute exact ground intersection using camera picking ray
    const ray = sc.createPickingRay(sc.pointerX, sc.pointerY, BABYLON.Matrix.Identity(), camera || sc.activeCamera);
    let floorPoint: BABYLON.Vector3 | null = null;
    if (ray && Math.abs(ray.direction.y) > 0.0001) {
      const t = (0.04 - ray.origin.y) / ray.direction.y;
      if (t > 0) {
        floorPoint = ray.origin.add(ray.direction.scale(t));
      }
    }

    if (floorPoint && ghostPlacementPad) {
      const snap = computeSmartSnap(floorPoint.x, floorPoint.z);
      ghostPlacementPad.position.set(snap.snappedX, 0.045, snap.snappedZ);
      ghostPlacementPad.setEnabled(true);
      sc.defaultCursor = 'crosshair';
    } else {
      hideGhostPlacementPad();
    }
    return;
  }

  // Hide ghost pad if not in add_node mode
  hideGhostPlacementPad();

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

  if (tool === 'add_edge' && !edgeFirstNodeId.value) {
    disposeEdgePreviewMeshes(false);
    
    // Check if hovering over any node to highlight as candidate start
    const hoverNodeId = resolvePickedNodeFromPointer(sc, pointerInfo.pickInfo);
    if (hoverNodeId) {
      const node = factoryLayout.nodes.find(n => n.id === hoverNodeId);
      if (node) {
        sc.defaultCursor = 'pointer';
        if (!previewHoverStartRing) {
          previewHoverStartRing = BABYLON.MeshBuilder.CreateTorus('PreviewHoverStartRing', {
            diameter: 0.88,
            thickness: 0.025,
            tessellation: 32
          }, sc);
          const mat = new BABYLON.StandardMaterial('HoverStartMat', sc);
          mat.diffuseColor = new BABYLON.Color3(0.06, 0.75, 1.0);
          mat.emissiveColor = new BABYLON.Color3(0.06, 0.85, 1.0);
          previewHoverStartRing.material = mat;
          previewHoverStartRing.isPickable = false;
        }
        previewHoverStartRing.position.set(node.x, 0.045, node.z);
        previewHoverStartRing.setEnabled(true);
        return;
      }
    }
    if (previewHoverStartRing) {
      previewHoverStartRing.setEnabled(false);
    }
    sc.defaultCursor = 'crosshair';
    return;
  }

  if (tool === 'add_edge' && edgeFirstNodeId.value) {
    if (previewHoverStartRing) {
      previewHoverStartRing.setEnabled(false);
    }
    const startNode = factoryLayout.nodes.find(n => n.id === edgeFirstNodeId.value);
    if (!startNode) return;

    // Robust raycast onto ground plane y = 0.05
    const ray = sc.createPickingRay(sc.pointerX, sc.pointerY, BABYLON.Matrix.Identity(), camera || sc.activeCamera);
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
    let targetId = resolvePickedNodeFromPointer(sc, pointerInfo.pickInfo);
    if (targetId === edgeFirstNodeId.value) {
      targetId = null;
    }

    if (!targetId && groundPoint) {
      let closestDist = 1.25;
      for (const node of factoryLayout.nodes) {
        if (node.id === edgeFirstNodeId.value) continue;
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
      const targetNode = factoryLayout.nodes.find(n => n.id === targetId);
      if (targetNode) {
        endPoint = new BABYLON.Vector3(targetNode.x, 0.05, targetNode.z);
        hoveredNodeId.value = targetId;
        sc.defaultCursor = 'pointer';
        isSnapped = true;
      } else {
        endPoint = groundPoint;
        hoveredNodeId.value = null;
        sc.defaultCursor = 'crosshair';
      }
    } else {
      endPoint = groundPoint;
      hoveredNodeId.value = null;
      sc.defaultCursor = 'crosshair';
    }

    updateEdgeCreationPreview(sc, startPoint, endPoint, isSnapped, targetId);
    return;
  }

  // Not in add_edge tool
  disposeEdgePreviewMeshes(false);
}

function handlePointerDownInEditMode(sc: BABYLON.Scene, pointerInfo: BABYLON.PointerInfo) {
  const tool = currentEditorTool.value;
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
      const targetId = meta?.id || selectedEditorNodeId.value;
      if (targetId) {
        if (meta?.action === 'set') {
          setNodeHeading(targetId, meta.deg);
        } else {
          rotateNode(targetId, meta?.deg || 90);
        }
      }
      return;
    }

    const pickedNodeId = resolvePickedNodeFromPointer(sc, pickResult);
    if (pickedNodeId) {
      selectedEditorNodeId.value = pickedNodeId;
      selectedEditorPropId.value = null;
      const padMesh = nodeMeshesMap.get(pickedNodeId);
      if (padMesh) {
        attachGizmoToTarget(padMesh);
        highlightSelectedNode(sc, padMesh);
      }
    } else if (pickedMesh?.metadata?.type === 'prop') {
      selectedEditorPropId.value = pickedMesh.metadata.id;
      selectedEditorNodeId.value = null;
      attachGizmoToTarget(pickedMesh);
      clearNodeSelection();
    } else {
      selectedEditorNodeId.value = null;
      selectedEditorPropId.value = null;
      attachGizmoToTarget(null);
      clearNodeSelection();
    }
  } else if (tool === 'add_node') {
    let point = pickResult?.pickedPoint;
    if (!point) {
      const ray = sc.createPickingRay(sc.pointerX, sc.pointerY, BABYLON.Matrix.Identity(), camera || sc.activeCamera);
      if (ray && Math.abs(ray.direction.y) > 0.0001) {
        const t = (0.04 - ray.origin.y) / ray.direction.y;
        if (t > 0) {
          point = ray.origin.add(ray.direction.scale(t));
        }
      }
    }
    if (point) {
      const snap = computeSmartSnap(point.x, point.z);
      const targetX = snap.snappedX;
      const targetZ = snap.snappedZ;
      const collision = checkObjectClearanceCollision(targetX, targetZ, undefined, MIN_CLEARANCE_DIST);
      if (collision.hasCollision) {
        emit('notify', `⚠️ 無法在此放置站點：與 ${collision.conflictingWith} 重疊 (${collision.distance?.toFixed(2)}m < ${MIN_CLEARANCE_DIST}m)，請保持安全間距！`, 'warn');
        return;
      }

      // Monotonic ID generation: find highest numeric suffix to prevent collision after deletions
      let maxNum = 0;
      for (const n of factoryLayout.nodes) {
        const m = n.id.match(/^Node-(\d+)$/);
        if (m) {
          const val = parseInt(m[1], 10);
          if (val > maxNum) maxNum = val;
        }
      }
      const newId = `Node-${String(maxNum + 1).padStart(2, '0')}`;
      const func = newNodeFunction.value;
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
      factoryLayout.nodes.push(newNode);
      createNodeInScene(sc, newNode);

      hideGhostPlacementPad();
      clearAlignmentGuideLines();
      markLayoutDirty();
      emit('notify', `已新增 ${typeLabel}: ${newId}`, 'success');
    }
  } else if (tool === 'add_edge') {
    const pickedNodeId = resolvePickedNodeFromPointer(sc, pickResult);
    if (pickedNodeId) {
      const nodeId = pickedNodeId;

      if (!edgeFirstNodeId.value) {
        // Step 1: Select start node
        edgeFirstNodeId.value = nodeId;
        const nodeMesh = nodeMeshesMap.get(nodeId) || pickedMesh;
        if (nodeMesh) highlightStartNode(sc, nodeMesh);
        emit('notify', `已選取起點: ${nodeId}，請拖曳預覽線並點擊目標節點`, 'info');
      } else if (edgeFirstNodeId.value === nodeId) {
        emit('notify', '起點與終點不能為同一節點', 'warn');
      } else {
        // Step 2: Connect to end node
        completeEdgeConnection(sc, edgeFirstNodeId.value, nodeId);
      }
    } else {
      cancelEdgeConnection();
    }
  } else if (tool === 'delete') {
    const pickedNodeId = resolvePickedNodeFromPointer(sc, pickResult);
    if (pickedNodeId) {
      deleteNodeById(pickedNodeId);
      return;
    }
    if (pickedMesh && pickedMesh.metadata) {
      const meta = pickedMesh.metadata;
      if (meta.type === 'edge') {
        deleteEdgeById(meta.id);
      } else if (meta.type === 'prop') {
        deletePropById(meta.id);
      }
    }
  }
}

function deleteNodeById(nodeId: string) {
  if (!scene) return;
  const node = factoryLayout.nodes.find(n => n.id === nodeId);
  if (!node) return;

  factoryLayout.nodes = factoryLayout.nodes.filter(n => n.id !== nodeId);
  factoryLayout.edges = factoryLayout.edges.filter(e => e.startNodeId !== nodeId && e.endNodeId !== nodeId);

  const padMesh = nodeMeshesMap.get(nodeId);
  if (padMesh) {
    padMesh.dispose();
    nodeMeshesMap.delete(nodeId);
    nodeTextureMap.delete(nodeId);
  }
  const pallet = stationPalletMap.get(nodeId);
  if (pallet) {
    pallet.dispose();
    stationPalletMap.delete(nodeId);
  }
  const cargo = stationCargoMap.get(nodeId);
  if (cargo) {
    cargo.dispose();
    stationCargoMap.delete(nodeId);
  }

  rebuildEdgesOnly(scene);
  gizmoManager?.attachToMesh(null);
  clearNodeSelection();
  markLayoutDirty();
  emit('notify', `已刪除節點: ${nodeId}`, 'info');
}

function deleteEdgeById(edgeId: string) {
  if (!scene) return;
  factoryLayout.edges = factoryLayout.edges.filter(e => e.id !== edgeId);
  const oldMesh = edgeMeshesMap.get(edgeId);
  if (oldMesh) {
    if (oldMesh.material) oldMesh.material.dispose();
    oldMesh.dispose();
    edgeMeshesMap.delete(edgeId);
  }
  const arrows = edgeArrowMeshesMap.get(edgeId);
  if (arrows) {
    arrows.forEach(a => a.dispose());
    edgeArrowMeshesMap.delete(edgeId);
  }
  markLayoutDirty();
  emit('notify', `已刪除路徑: ${edgeId}`, 'info');
}

function deletePropById(propId: string) {
  factoryLayout.props = factoryLayout.props.filter(p => p.id !== propId);
  const pMesh = propMeshesMap.get(propId);
  if (pMesh) {
    pMesh.dispose();
    propMeshesMap.delete(propId);
  }
  gizmoManager?.attachToMesh(null);
  markLayoutDirty();
  emit('notify', `已刪除物件: ${propId}`, 'info');
}

function highlightSelectedNode(sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) {
  clearNodeSelection();
  const nodeId = nodeMesh.metadata?.id;
  if (nodeId) {
    selectedEditorNodeId.value = nodeId;
    selectedEditorPropId.value = null;
    createNodeRotationWidget(sc, nodeMesh, nodeId);
  }
}

function highlightStartNode(sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) {
  clearNodeSelection();
  nodeSelectionRing = BABYLON.MeshBuilder.CreateTorus('SelectedNodeTorus', { 
    diameter: 0.85, 
    thickness: 0.025, 
    tessellation: 32 
  }, sc);
  nodeSelectionRing.parent = nodeMesh;
  nodeSelectionRing.position.set(0, 0.01, 0);
  const mat = new BABYLON.StandardMaterial('StartNodeMat', sc);
  mat.emissiveColor = new BABYLON.Color3(0.96, 0.62, 0.04);
  nodeSelectionRing.material = mat;
  nodeSelectionRing.isPickable = false;
}

function clearNodeSelection() {
  clearNodeRotationWidget();
  if (nodeSelectionRing) {
    nodeSelectionRing.dispose();
    nodeSelectionRing = null;
  }
  selectedEditorNodeId.value = null;
}

function cancelEdgeConnection() {
  edgeFirstNodeId.value = null;
  hoveredNodeId.value = null;
  disposeEdgePreviewMeshes(true);
}

// ----------------------------------------------------
// Save & Reset Layout Handlers
// ----------------------------------------------------
async function handleSaveLayout() {
  const ok = await saveLayout({
    version: '2.0.0',
    nodes: factoryLayout.nodes,
    edges: factoryLayout.edges,
    props: factoryLayout.props
  });
  if (ok) {
    clearLayoutDirty();
    currentAppMode.value = 'simulate';
    emit('notify', '場域配置已成功儲存至後端，已自動返回【模擬模式】！', 'success');
  } else {
    emit('notify', '儲存場域失敗，請確認後端連線', 'warn');
  }
}

async function handleResetLayout() {
  await fetchLayout();
  if (scene) rebuildLayoutInScene(scene);
  clearLayoutDirty();
  emit('notify', '已重新載入場域設定', 'info');
}

function resetToStandardTemplate() {
  showResetModal.value = false;
  factoryLayout.nodes = [
    {
      id: 'Node-01',
      name: '充電站 Node-01',
      x: 0.0,
      y: 0.0,
      z: 0.0,
      function: 'Idle/Charge',
      description: 'AGV 待命與自動充電站',
      has_cargo: false
    },
    {
      id: 'Node-02',
      name: '通道點 Node-02',
      x: 6.0,
      y: 0.0,
      z: 0.0,
      function: 'Transit',
      description: '中央導航通道點',
      has_cargo: false
    },
    {
      id: 'Node-03',
      name: '貨物站 Node-03',
      x: 12.0,
      y: 0.0,
      z: 0.0,
      function: 'Cargo',
      description: '智慧貨物取貨站點（有貨）',
      has_cargo: true
    },
    {
      id: 'Node-04',
      name: '貨物站 Node-04',
      x: 6.0,
      y: 0.0,
      z: 6.0,
      function: 'Cargo',
      description: '智慧貨物卸貨站點（無貨）',
      has_cargo: false
    }
  ];

  factoryLayout.edges = [
    { id: 'Edge-01-02', startNodeId: 'Node-01', endNodeId: 'Node-02', bidirectional: true },
    { id: 'Edge-02-03', startNodeId: 'Node-02', endNodeId: 'Node-03', bidirectional: true },
    { id: 'Edge-03-04', startNodeId: 'Node-03', endNodeId: 'Node-04', bidirectional: true },
    { id: 'Edge-02-04', startNodeId: 'Node-02', endNodeId: 'Node-04', bidirectional: true }
  ];

  factoryLayout.props = [];

  if (scene) rebuildLayoutInScene(scene);
  markLayoutDirty();
  emit('notify', '已載入標準測試拓撲 (4 站點：充電站⚡ + 通道 + 取貨站[有貨] + 放貨站[無貨])，請點擊「儲存並模擬」！', 'success');
}

function clearCanvasEntirely() {
  showResetModal.value = false;
  factoryLayout.nodes = [];
  factoryLayout.edges = [];
  factoryLayout.props = [];
  if (scene) rebuildLayoutInScene(scene);
  markLayoutDirty();
  emit('notify', '已清空地圖所有節點與路徑 (空白畫布)，您可以開始從零建立！', 'info');
}

async function handleCancelEdit() {
  clearLayoutDirty();
  await fetchLayout(true);
  if (scene) rebuildLayoutInScene(scene);
  currentAppMode.value = 'simulate';
  currentEditorTool.value = 'select';
  attachGizmoToTarget(null);
  clearNodeSelection();
  cancelEdgeConnection();
  closeCargoContextMenu();
  emit('notify', '已取消編輯，未儲存的場域變更已捨棄並返回模擬模式', 'info');
}

// ----------------------------------------------------
// Item 1: Multi-Step Vehicle Mission Dispatch Helpers
// ----------------------------------------------------


function addNewDispatchStep() {
  const currentCount = quickDispatchSteps.value.length;
  const lastNodeId = currentCount > 0 ? quickDispatchSteps.value[currentCount - 1].node_id : currentAgvStartNode.value;
  const candidate = factoryLayout.nodes.find(n => n.id !== lastNodeId) || factoryLayout.nodes[0];
  const nextNodeId = candidate ? candidate.id : 'Node-02';
  
  quickDispatchSteps.value.push({
    node_id: nextNodeId,
    action: 'none'
  });
  activeStepIndex.value = quickDispatchSteps.value.length - 1;
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function removeDispatchStep(index: number) {
  if (quickDispatchSteps.value.length <= 1) return;
  quickDispatchSteps.value.splice(index, 1);
  if (activeStepIndex.value !== null) {
    if (activeStepIndex.value >= quickDispatchSteps.value.length) {
      activeStepIndex.value = quickDispatchSteps.value.length - 1;
    }
  }
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function setStepAction(index: number, action: DispatchAction) {
  const step = quickDispatchSteps.value[index];
  if (!step) return;
  const node = getNodeObj(step.node_id);
  const nodeFunc = node?.function;
  
  // Restriction: Only charging station can charge!
  if (action === 'charge' && !isChargingNode(step.node_id)) {
    emit('notify', `站點 ${step.node_id} (${nodeFunc || '未知'}) 非充電樁，無法指派充電任務`, 'warn');
    return;
  }
  
  // Restriction: Only Cargo stations can pick or drop!
  if ((action === 'pick' || action === 'drop') && !isCargoNode(step.node_id)) {
    emit('notify', `站點 ${step.node_id} 非貨物站，無法指派取放貨任務`, 'warn');
    return;
  }
  
  step.action = action;
}

function onStepNodeChange(index: number) {
  const step = quickDispatchSteps.value[index];
  if (!step) return;
  
  // Auto-correct incompatible actions when target node changes
  if (step.action === 'charge' && !isChargingNode(step.node_id)) {
    step.action = 'none';
    emit('notify', `站點 ${step.node_id} 非充電樁，已自動變更為純移動`, 'info');
  } else if ((step.action === 'pick' || step.action === 'drop') && !isCargoNode(step.node_id)) {
    step.action = 'none';
    emit('notify', `站點 ${step.node_id} 非貨物站，已自動變更為純移動`, 'info');
  }
  
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function resetDispatchSteps() {
  const defaultTarget = factoryLayout.nodes.find(n => n.id !== currentAgvStartNode.value)?.id || 'Node-03';
  quickDispatchSteps.value = [
    { node_id: defaultTarget, action: 'none' }
  ];
  activeStepIndex.value = 0;
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function addOrSelectNodeFromMap(nodeId: string) {
  if (quickDispatchSteps.value.length === 0) {
    quickDispatchSteps.value.push({ node_id: nodeId, action: 'none' });
    activeStepIndex.value = 0;
  } else if (activeStepIndex.value !== null && quickDispatchSteps.value[activeStepIndex.value]) {
    const step = quickDispatchSteps.value[activeStepIndex.value];
    step.node_id = nodeId;
    if (step.action === 'charge' && !isChargingNode(nodeId)) {
      step.action = 'none';
    } else if ((step.action === 'pick' || step.action === 'drop') && !isCargoNode(nodeId)) {
      step.action = 'none';
    }
  } else {
    const lastStep = quickDispatchSteps.value[quickDispatchSteps.value.length - 1];
    if (lastStep.node_id !== nodeId) {
      quickDispatchSteps.value.push({ node_id: nodeId, action: 'none' });
      activeStepIndex.value = quickDispatchSteps.value.length - 1;
    }
  }
  if (scene) updateQuickDispatchPreviewLine(scene);
}

function closeQuickDispatch() {
  is3DQuickDispatchActive.value = false;
  quickDispatchSteps.value = [];
  if (agvHaloMesh) agvHaloMesh.isVisible = false;
  if (quickDispatchPreviewLine) {
    quickDispatchPreviewLine.dispose();
    quickDispatchPreviewLine = null;
  }
}

function updateQuickDispatchPreviewLine(sc: BABYLON.Scene) {
  if (quickDispatchPreviewLine) {
    quickDispatchPreviewLine.dispose();
    quickDispatchPreviewLine = null;
  }
  if (!is3DQuickDispatchActive.value || currentAppMode.value !== 'simulate') return;

  const startNode = factoryLayout.nodes.find(n => n.id === currentAgvStartNode.value);
  if (!startNode) return;

  const points: BABYLON.Vector3[] = [
    new BABYLON.Vector3(startNode.x, 0.06, startNode.z)
  ];

  for (const step of quickDispatchSteps.value) {
    const n = factoryLayout.nodes.find(node => node.id === step.node_id);
    if (n) {
      points.push(new BABYLON.Vector3(n.x, 0.06, n.z));
    }
  }

  if (points.length < 2) return;

  quickDispatchPreviewLine = BABYLON.MeshBuilder.CreateDashedLines('QuickDispatchNavPreview', {
    points: points,
    dashSize: 2.0,
    gapSize: 1.2,
    dashNb: 80
  }, sc);
  quickDispatchPreviewLine.color = new BABYLON.Color3(0.06, 0.75, 1.0); // Bright Cyan
  quickDispatchPreviewLine.isPickable = false;
}

function handleQuickDispatchLaunch() {
  if (quickDispatchSteps.value.length === 0) {
    emit('notify', '請至少加入一個目標站點！', 'warn');
    return;
  }

  if (quickDispatchSteps.value.length === 1 && quickDispatchSteps.value[0].node_id === currentAgvStartNode.value) {
    emit('notify', `車輛目前已在站點 ${currentAgvStartNode.value}，請選擇其他目標站點！`, 'warn');
    return;
  }

  // Real-world validation: Check charging station and cargo pick/drop rules (auto-sanitize to pure travel)
  const currentVeh = fleetVehicles[selectedVehicleId.value] || (selectedVehicleId.value === agvState.agv_id ? agvState : null);
  let simulatedAgvHasCargo = !!currentVeh?.task_info?.has_cargo;

  for (let i = 0; i < quickDispatchSteps.value.length; i++) {
    const s = quickDispatchSteps.value[i];
    const nodeObj = factoryLayout.nodes.find(n => n.id === s.node_id);

    if (s.action === 'charge' && !isChargingNode(s.node_id)) {
      s.action = 'none';
      emit('notify', `第 ${i + 1} 站 (${s.node_id}) 非充電樁，已自動變更為純移動`, 'info');
    } else if ((s.action === 'pick' || s.action === 'drop') && !isCargoNode(s.node_id)) {
      s.action = 'none';
      emit('notify', `第 ${i + 1} 站 (${s.node_id}) 非貨物站，已自動變更為純移動`, 'info');
    } else if (s.action === 'pick') {
      if (simulatedAgvHasCargo) {
        s.action = 'none';
        emit('notify', `⚠️ 車輛 ${selectedVehicleId.value} 已載貨，第 ${i + 1} 站自動轉為純移動`, 'info');
      } else if (nodeObj && !nodeObj.has_cargo) {
        s.action = 'none';
        emit('notify', `⚠️ 第 ${i + 1} 站 (${s.node_id}) 棧板無貨物，已轉為純移動`, 'info');
      } else {
        simulatedAgvHasCargo = true;
      }
    } else if (s.action === 'drop') {
      if (!simulatedAgvHasCargo) {
        s.action = 'none';
        emit('notify', `⚠️ 車輛 ${selectedVehicleId.value} 目前空載，第 ${i + 1} 站自動轉為純移動`, 'info');
      } else if (nodeObj && nodeObj.has_cargo) {
        s.action = 'none';
        emit('notify', `⚠️ 第 ${i + 1} 站 (${s.node_id}) 棧板已有貨，已轉為純移動`, 'info');
      } else {
        simulatedAgvHasCargo = false;
      }
    }
  }

  const ok = sendDispatchOrder(quickDispatchSteps.value, 'none', selectedVehicleId.value);
  if (ok) {
    const summary = quickDispatchSteps.value.map(s => `${s.node_id}(${getActionLabel(s.action)})`).join(' ➔ ');
    emit('notify', `已成功派遣任務！動線: ${summary}`, 'success');
    closeQuickDispatch();
  } else {
    emit('notify', '派發任務失敗，請檢查 WebSocket 後端連線', 'warn');
  }
}

// Camera View Helpers: Macro Factory Overview vs Micro Vehicle Follow
function setCameraView(view: 'iso' | 'top' | 'follow') {
  currentView.value = view;
  if (!camera) return;

  if (view === 'follow') {
    // Smoothly zoom in to closer radius and transition target to vehicle
    BABYLON.Animation.CreateAndStartAnimation(
      'camFollowRadius',
      camera,
      'radius',
      30,
      18,
      camera.radius,
      15,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    const activeRoot = vehicleVisuals.get(selectedVehicleId.value)?.root || agvRoot;
    if (activeRoot) {
      BABYLON.Animation.CreateAndStartAnimation(
        'camTargetX',
        camera.target,
        'x',
        30,
        18,
        camera.target.x,
        activeRoot.position.x,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      BABYLON.Animation.CreateAndStartAnimation(
        'camTargetY',
        camera.target,
        'y',
        30,
        18,
        camera.target.y,
        activeRoot.position.y,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      BABYLON.Animation.CreateAndStartAnimation(
        'camTargetZ',
        camera.target,
        'z',
        30,
        18,
        camera.target.z,
        activeRoot.position.z,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
    }
  } else {
    // Return to macro global factory view
    dashboardActiveTab.value = 'fleet';
    closeQuickDispatch();

    BABYLON.Animation.CreateAndStartAnimation(
      'camReset',
      camera,
      'radius',
      30,
      18,
      camera.radius,
      view === 'top' ? 26 : 28,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    if (view === 'iso') {
      BABYLON.Animation.CreateAndStartAnimation('camA', camera, 'alpha', 30, 20, camera.alpha, -Math.PI / 3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      BABYLON.Animation.CreateAndStartAnimation('camB', camera, 'beta', 30, 20, camera.beta, Math.PI / 3.2, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      camera.target = new BABYLON.Vector3(5, 0, 5);
    } else if (view === 'top') {
      BABYLON.Animation.CreateAndStartAnimation('camA', camera, 'alpha', 30, 20, camera.alpha, -Math.PI / 2, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      BABYLON.Animation.CreateAndStartAnimation('camB', camera, 'beta', 30, 20, camera.beta, 0.05, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      camera.target = new BABYLON.Vector3(5, 0, 5);
    }
  }
}

defineExpose({
  handleSaveLayout,
  handleResetLayout,
  handleCancelEdit
});
</script>

<style scoped>
.scene-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.render-canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}

/* Transitions */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Bottom-Left Map Navigation & Interaction Legend */
.map-controls-legend {
  position: absolute;
  bottom: 66px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 20px;
  z-index: 35;
  pointer-events: none;
  font-size: 10.5px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.legend-badge {
  display: flex;
  align-items: center;
  gap: 5px;
}

.key-tag {
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9.5px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.legend-desc {
  color: #94a3b8;
}

.legend-divider {
  width: 1px;
  height: 10px;
  background: rgba(255, 255, 255, 0.12);
}
</style>
