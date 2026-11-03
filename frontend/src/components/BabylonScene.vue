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
import type { LayoutNode, LayoutEdge, DispatchAction } from '../types';
import {
  isChargingNode as isChargingNodeUtil,
  isCargoNode as isCargoNodeUtil,
  getNodeObj as getNodeObjUtil,
  getActionLabel
} from '../scene/layout/nodeUtils';
import {
  resolvePickedNodeFromPointer as resolvePickedNodeFromPointerUtil
} from '../scene/editor/picking';
import {
  computeSmartSnap as computeSmartSnapUtil,
  checkObjectClearanceCollision as checkObjectClearanceCollisionUtil,
  MIN_CLEARANCE_DIST
} from '../scene/editor/snapping';
import type { VehicleVisual, SceneContext } from '../scene/types';
import {
  createOrUpdateVehicleVisual as createOrUpdateVehicleVisualMod,
  updateVehiclesEditModeState as updateVehiclesEditModeStateMod,
  loadAGVModel as loadAGVModelMod,
  type VehicleVisualContext
} from '../scene/vehicles/vehicleVisuals';
import {
  clearVehicleCargo as clearVehicleCargoMod,
  mountStaticCargo as mountStaticCargoMod,
  performPickAnimation as performPickAnimationMod,
  performDropAnimation as performDropAnimationMod
} from '../scene/vehicles/cargo';
import {
  updateVehicleOverheadBadge as updateVehicleOverheadBadgeMod,
  updateVehicleTrajectory as updateVehicleTrajectoryMod
} from '../scene/vehicles/vehicleBadge';
import {
  createEdgeInScene as createEdgeInSceneMod,
  updateEdgesForNode as updateEdgesForNodeMod,
  updateDynamicPathMaterials as updateDynamicPathMaterialsMod,
  rebuildEdgesOnly as rebuildEdgesOnlyMod,
  type EdgeMeshContext
} from '../scene/layout/edgeMeshes';

import {
  updateAllNodeTextures as updateAllNodeTexturesMod,
  toggleStationCargo as toggleStationCargoMod,
  createNodeInScene as createNodeInSceneMod,
  type NodeMeshContext
} from '../scene/layout/nodeMeshes';
import {
  loadAndRenderLayout as loadAndRenderLayoutMod,
  rebuildLayoutInScene as rebuildLayoutInSceneMod,
  type LayoutBuilderContext
} from '../scene/layout/layoutBuilder';
import {
  createNodeRotationWidget as createNodeRotationWidgetMod,
  clearNodeRotationWidget as clearNodeRotationWidgetMod,
  rotateNode as rotateNodeMod,
  setNodeHeading as setNodeHeadingMod,
  rotateSelectedElement as rotateSelectedElementMod,
  type RotationOpsContext,
  type RotationWidgetState
} from '../scene/editor/rotationWidget';
import {
  createSelectionState,
  setupGizmoManager as setupGizmoManagerMod,
  attachGizmoToTarget as attachGizmoToTargetMod,
  highlightSelectedNode as highlightSelectedNodeMod,
  highlightStartNode as highlightStartNodeMod,
  clearNodeSelection as clearNodeSelectionMod,
  type SelectionContext
} from '../scene/editor/selection';
import {
  createEdgePreviewState,
  disposeEdgePreviewMeshes as disposeEdgePreviewMeshesMod,
  cancelEdgeConnection as cancelEdgeConnectionMod,
  updateEdgeCreationPreview as updateEdgeCreationPreviewMod,
  completeEdgeConnection as completeEdgeConnectionMod,
  type EdgeConnectionContext
} from '../scene/editor/edgePreview';
import {
  deleteNodeById as deleteNodeByIdMod,
  deleteEdgeById as deleteEdgeByIdMod,
  deletePropById as deletePropByIdMod,
  handleSaveLayout as handleSaveLayoutMod,
  handleResetLayout as handleResetLayoutMod,
  resetToStandardTemplate as resetToStandardTemplateMod,
  clearCanvasEntirely as clearCanvasEntirelyMod,
  handleCancelEdit as handleCancelEditMod,
  type LayoutCommandsContext
} from '../scene/editor/layoutCommands';
import {
  setupInteractivePointerEvents as setupInteractivePointerEventsMod,
  closeCargoContextMenu as closeCargoContextMenuMod,
  setNodeCargoStatus as setNodeCargoStatusMod,
  type PointerEventsContext
} from '../scene/editor/pointerEvents';
import {
  createGhostPadState,
  clearAlignmentGuideLines as clearAlignmentGuideLinesMod,
  updateAlignmentGuideLines as updateAlignmentGuideLinesMod,
  updateGhostPadVisual as updateGhostPadVisualMod,
  hideGhostPlacementPad as hideGhostPlacementPadMod
} from '../scene/editor/ghostPad';

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
const selectionState = createSelectionState();
const edgePreviewState = createEdgePreviewState();

// Edit Mode Selected Element Tracking & 90-Degree Stepped Rotation
const selectedEditorNodeId = ref<string | null>(null);
const selectedEditorPropId = ref<string | null>(null);

// 3D Rotation Widget State
const rotationWidgetState: RotationWidgetState = {
  widgetRoot: null,
  widgetMeshes: []
};

// Ghost Pad & Alignment Guide State
const ghostPadState = createGhostPadState();

const getNodeObj = (nodeId: string): LayoutNode | undefined => getNodeObjUtil(nodeId, factoryLayout.nodes);
const isCargoNode = (nodeId: string): boolean => isCargoNodeUtil(nodeId, factoryLayout.nodes);
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

const computeSmartSnap = (
  rawX: number,
  rawZ: number,
  excludeNodeId?: string,
  snapThreshold: number = 0.35,
  gridStep: number = 0.5
) => computeSmartSnapUtil(rawX, rawZ, factoryLayout.nodes, excludeNodeId, snapThreshold, gridStep);

const clearAlignmentGuideLines = () =>
  clearAlignmentGuideLinesMod(ghostPadState);

const updateAlignmentGuideLines = (
  sc: BABYLON.Scene,
  posX: number,
  posZ: number,
  alignedNodesX: LayoutNode[],
  alignedNodesZ: LayoutNode[]
) => updateAlignmentGuideLinesMod(sc, posX, posZ, alignedNodesX, alignedNodesZ, ghostPadState);

const updateGhostPadVisual = (sc: BABYLON.Scene, func: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo') =>
  updateGhostPadVisualMod(sc, ghostPadState, func);

const hideGhostPlacementPad = () =>
  hideGhostPlacementPadMod(ghostPadState);

const rotationOpsContext: RotationOpsContext = {
  get sc() { return scene!; },
  nodes: factoryLayout.nodes,
  props: factoryLayout.props,
  nodeMeshesMap,
  propMeshesMap,
  selectedEditorNodeId,
  selectedEditorPropId,
  widgetState: rotationWidgetState,
  cargoContextMenuNode: cargoContextMenu,
  markLayoutDirty: () => markLayoutDirty(),
  notify: (msg, type) => emit('notify', msg, type || 'info')
};

const createNodeRotationWidget = (sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh | null, nodeId: string) =>
  createNodeRotationWidgetMod(sc, nodeMesh, nodeId, factoryLayout.nodes, rotationWidgetState);

const clearNodeRotationWidget = () =>
  clearNodeRotationWidgetMod(rotationWidgetState);

const rotateNode = (nodeId: string, deltaDegrees: number = 90) =>
  rotateNodeMod(nodeId, deltaDegrees, rotationOpsContext);

const setNodeHeading = (nodeId: string, targetDeg: number) =>
  setNodeHeadingMod(nodeId, targetDeg, rotationOpsContext);

const rotateSelectedElement = (deltaDegrees: number = 90) =>
  rotateSelectedElementMod(deltaDegrees, rotationOpsContext);

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
        } else if (edgePreviewState.previewEndpointReticle) {
          endPoint = edgePreviewState.previewEndpointReticle.position.clone();
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
// Scene Context & Vehicle / Layout Delegates
// ----------------------------------------------------
const sceneContext: SceneContext = {
  get canvas() { return canvasRef.value!; },
  get engine() { return engine!; },
  get scene() { return scene!; },
  get camera() { return camera!; },
  get gizmoManager() { return gizmoManager!; },

  nodeMeshesMap,
  edgeMeshesMap,
  edgeArrowMeshesMap,
  propMeshesMap,
  stationPalletMap: stationPalletMap as unknown as Map<string, BABYLON.TransformNode>,
  stationCargoMap,
  nodeTextureMap,

  vehicleVisuals,
  get agvRoot() { return agvRoot; },
  set agvRoot(val) { agvRoot = val; },
  get cargoMesh() { return cargoMesh; },
  set cargoMesh(val) { cargoMesh = val; },
  get agvHaloMesh() { return agvHaloMesh; },
  set agvHaloMesh(val) { agvHaloMesh = val; },
  get beaconMaterial() { return beaconMaterial; },
  set beaconMaterial(val) { beaconMaterial = val; },

  selectedEditorNodeId,
  selectedEditorPropId,
  edgeFirstNodeId,
  hoveredNodeId,
  edgeDirectionMode,
  newNodeFunction,

  get nodeRotationWidgetRoot() { return rotationWidgetState.widgetRoot; },
  set nodeRotationWidgetRoot(val) { rotationWidgetState.widgetRoot = val; },
  get nodeRotationWidgetMeshes() { return rotationWidgetState.widgetMeshes; },

  get ghostPlacementPad() { return ghostPadState.ghostPlacementPad; },
  set ghostPlacementPad(val) { ghostPadState.ghostPlacementPad = val; },
  get ghostPadMaterial() { return ghostPadState.ghostPadMaterial; },
  set ghostPadMaterial(val) { ghostPadState.ghostPadMaterial = val; },
  get ghostPlacementRing() { return ghostPadState.ghostPlacementRing; },
  set ghostPlacementRing(val) { ghostPadState.ghostPlacementRing = val; },

  get alignmentGuideLinesMesh() { return ghostPadState.alignmentGuideLinesMesh; },
  set alignmentGuideLinesMesh(val) { ghostPadState.alignmentGuideLinesMesh = val; },
  get alignmentMarkersMesh() { return ghostPadState.alignmentMarkersMesh; },
  set alignmentMarkersMesh(val) { ghostPadState.alignmentMarkersMesh = val; },

  get previewConnectionLine() { return edgePreviewState.rubberBandLine; },
  set previewConnectionLine(val) { edgePreviewState.rubberBandLine = val; },
  get previewTargetSnapRing() { return edgePreviewState.previewTargetSnapRing; },
  set previewTargetSnapRing(val) { edgePreviewState.previewTargetSnapRing = val; },
  get previewTargetSnapDisc() { return edgePreviewState.previewEndpointReticle; },
  set previewTargetSnapDisc(val) { edgePreviewState.previewEndpointReticle = val; },
  get previewHoverStartRing() { return edgePreviewState.previewHoverStartRing; },
  set previewHoverStartRing(val) { edgePreviewState.previewHoverStartRing = val; },
  get previewArrowMeshes() { return edgePreviewState.previewEdgeArrows; },
  set previewArrowMeshes(val) { edgePreviewState.previewEdgeArrows = val; },

  get quickDispatchPreviewLine() { return quickDispatchPreviewLine; },
  set quickDispatchPreviewLine(val) { quickDispatchPreviewLine = val; },

  notify: (msg, type) => emit('notify', msg, type || 'info')
};

const vehicleVisualContext = computed<VehicleVisualContext>(() => ({
  sc: scene!,
  ctx: sceneContext,
  selectedVehicleId,
  currentAppMode,
  agvNodesList,
  selectedLiftNodeName,
  baseLiftPosY,
  is3DQuickDispatchActive,
  fleetVehicles,
  agvState,
}));

const createOrUpdateVehicleVisual = (_sc: BABYLON.Scene, vehicleId: string, initPos?: { x: number; z: number; theta?: number }) =>
  createOrUpdateVehicleVisualMod(vehicleVisualContext.value, vehicleId, initPos);

const updateVehiclesEditModeState = (isEdit: boolean) =>
  updateVehiclesEditModeStateMod(sceneContext, isEdit);

const loadAGVModel = (_sc: BABYLON.Scene) =>
  loadAGVModelMod(vehicleVisualContext.value);

const updateVehicleOverheadBadge = (sc: BABYLON.Scene, visual: VehicleVisual, vData: any) =>
  updateVehicleOverheadBadgeMod(sc, visual, vData);

const updateVehicleTrajectory = (sc: BABYLON.Scene, visual: VehicleVisual, vData: any) =>
  updateVehicleTrajectoryMod(sc, visual, vData, factoryLayout.nodes);

const clearVehicleCargo = (vehicleId: string) =>
  clearVehicleCargoMod(vehicleId, sceneContext, baseLiftPosY.value, selectedLiftNodeName.value);

const mountStaticCargo = (sc: BABYLON.Scene, vehicleId: string = 'AGV-001') =>
  mountStaticCargoMod(sc, vehicleId, sceneContext, baseLiftPosY.value, selectedLiftNodeName.value);

const performPickAnimation = (sc: BABYLON.Scene, vehicleId: string = 'AGV-001') =>
  performPickAnimationMod(sc, vehicleId, sceneContext, currentTimeScale.value, baseLiftPosY.value, selectedLiftNodeName.value);

const performDropAnimation = (sc: BABYLON.Scene, vehicleId: string = 'AGV-001') =>
  performDropAnimationMod(sc, vehicleId, sceneContext, currentTimeScale.value, baseLiftPosY.value, selectedLiftNodeName.value);

const edgeMeshContext: EdgeMeshContext = {
  factoryLayout,
  edgeMeshesMap,
  edgeArrowMeshesMap,
  get fleetVehicles() { return fleetVehicles; },
  get agvState() { return agvState; },
  get selectedVehicleId() { return selectedVehicleId.value; }
};

const createEdgeInScene = (sc: BABYLON.Scene, edge: LayoutEdge) =>
  createEdgeInSceneMod(sc, edge, edgeMeshContext);

const updateEdgesForNode = (sc: BABYLON.Scene, nodeId: string) =>
  updateEdgesForNodeMod(sc, nodeId, edgeMeshContext);

const updateDynamicPathMaterials = () =>
  updateDynamicPathMaterialsMod(edgeMeshContext);

const rebuildEdgesOnly = (sc: BABYLON.Scene) =>
  rebuildEdgesOnlyMod(sc, edgeMeshContext);

const nodeMeshContext: NodeMeshContext = {
  factoryLayout,
  nodeMeshesMap,
  stationPalletMap: stationPalletMap as unknown as Map<string, BABYLON.TransformNode>,
  stationCargoMap,
  nodeTextureMap,
  fleetVehicles,
  agvState,
  is3DQuickDispatchActive,
  currentAgvStartNode,
  quickDispatchSteps,
  currentAppMode,
  currentEditorTool,
  selectedEditorNodeId,
  selectedEditorPropId,
  get camera() { return camera; },
  getCanvas: () => canvasRef.value,
  get gizmoManager() { return gizmoManager; },
  getNodeRotationWidgetRoot: () => rotationWidgetState.widgetRoot,
  highlightSelectedNode: (sc, mesh) => highlightSelectedNode(sc, mesh),
  computeSmartSnap: (x, z, excludeId) => computeSmartSnap(x, z, excludeId),
  checkObjectClearanceCollision: (x, z, excludeId, minDist) => checkObjectClearanceCollision(x, z, excludeId, minDist),
  updateAlignmentGuideLines: (sc, x, z, ax, az) => updateAlignmentGuideLines(sc, x, z, ax, az),
  clearAlignmentGuideLines: () => clearAlignmentGuideLines(),
  updateEdgesForNode: (sc, nodeId) => updateEdgesForNode(sc, nodeId),
  createNodeRotationWidget: (sc, mesh, nodeId) => createNodeRotationWidget(sc, mesh, nodeId),
  markLayoutDirty: () => markLayoutDirty(),
  notify: (msg, type) => emit('notify', msg, type || 'info')
};

const updateAllNodeTextures = () =>
  updateAllNodeTexturesMod(nodeMeshContext);

const toggleStationCargo = (node: LayoutNode, forceState?: boolean) =>
  toggleStationCargoMod(node, forceState, scene!, nodeMeshContext);

const createNodeInScene = (sc: BABYLON.Scene, node: LayoutNode) =>
  createNodeInSceneMod(sc, node, nodeMeshContext);

const layoutBuilderContext: LayoutBuilderContext = {
  factoryLayout,
  nodeMeshCtx: nodeMeshContext,
  edgeMeshCtx: edgeMeshContext,
  propMeshesMap,
  fetchLayout: () => fetchLayout(),
  currentAppMode,
  hasUnsavedChanges
};

const rebuildLayoutInScene = (sc: BABYLON.Scene) =>
  rebuildLayoutInSceneMod(sc, layoutBuilderContext);

const loadAndRenderLayout = (sc: BABYLON.Scene) =>
  loadAndRenderLayoutMod(sc, layoutBuilderContext);

// ----------------------------------------------------
// Scene Editor Contexts & Delegates (Selection, Preview, Commands, Pointer)
// ----------------------------------------------------
const selectionContext: SelectionContext = {
  factoryLayout,
  nodeMeshesMap,
  propMeshesMap,
  selectedEditorNodeId,
  selectedEditorPropId,
  selectionState,
  getGizmoManager: () => gizmoManager,
  setGizmoManager: (gm) => { gizmoManager = gm; },
  updateEdgesForNode: (sc, nodeId) => updateEdgesForNode(sc, nodeId),
  rebuildEdgesOnly: (sc) => rebuildEdgesOnly(sc),
  createNodeRotationWidget: (sc, nodeMesh, nodeId) => createNodeRotationWidget(sc, nodeMesh, nodeId),
  clearNodeRotationWidget: () => clearNodeRotationWidget(),
  checkObjectClearanceCollision: (x, z, id, minDist) => checkObjectClearanceCollision(x, z, id, minDist),
  markLayoutDirty: () => markLayoutDirty(),
  notify: (msg, type) => emit('notify', msg, type || 'info')
};

const attachGizmoToTarget = (mesh: BABYLON.AbstractMesh | null) =>
  attachGizmoToTargetMod(scene!, mesh, selectionContext);

const highlightSelectedNode = (sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) =>
  highlightSelectedNodeMod(sc, nodeMesh, selectionContext);

const highlightStartNode = (sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) =>
  highlightStartNodeMod(sc, nodeMesh, selectionContext);

const clearNodeSelection = () =>
  clearNodeSelectionMod(selectionContext);

const setupGizmoManager = (sc: BABYLON.Scene) =>
  setupGizmoManagerMod(sc, selectionContext);

const edgeConnectionContext: EdgeConnectionContext = {
  factoryLayout,
  edgeMeshesMap,
  edgeArrowMeshesMap,
  createEdgeInScene: (sc, edge) => createEdgeInScene(sc, edge),
  updateDynamicPathMaterials: () => updateDynamicPathMaterials(),
  markLayoutDirty: () => markLayoutDirty(),
  notify: (msg, type) => emit('notify', msg, type || 'info'),
  cancelEdgeConnection: () => cancelEdgeConnection()
};

const disposeEdgePreviewMeshes = (includeStartRing: boolean = true) =>
  disposeEdgePreviewMeshesMod(edgePreviewState, clearNodeSelection, includeStartRing);

const cancelEdgeConnection = () =>
  cancelEdgeConnectionMod(edgePreviewState, edgeFirstNodeId, hoveredNodeId, clearNodeSelection);

const updateEdgeCreationPreview = (sc: BABYLON.Scene, startPoint: BABYLON.Vector3, endPoint: BABYLON.Vector3, isSnapped: boolean, targetId: string | null) =>
  updateEdgeCreationPreviewMod(sc, startPoint, endPoint, isSnapped, targetId, edgeDirectionMode.value === 'bidirectional', edgePreviewState, clearNodeSelection);

const completeEdgeConnection = (sc: BABYLON.Scene, startId: string, endId: string) =>
  completeEdgeConnectionMod(sc, startId, endId, edgeDirectionMode.value === 'bidirectional', edgeConnectionContext);

const layoutCommandsContext: LayoutCommandsContext = {
  factoryLayout,
  nodeMeshesMap,
  nodeTextureMap,
  stationPalletMap: stationPalletMap as unknown as Map<string, BABYLON.TransformNode>,
  stationCargoMap,
  edgeMeshesMap,
  edgeArrowMeshesMap,
  propMeshesMap,
  getGizmoManager: () => gizmoManager,
  rebuildEdgesOnly: (sc) => rebuildEdgesOnly(sc),
  rebuildLayoutInScene: (sc) => rebuildLayoutInScene(sc),
  clearNodeSelection: () => clearNodeSelection(),
  cancelEdgeConnection: () => cancelEdgeConnection(),
  closeCargoContextMenu: () => closeCargoContextMenu(),
  attachGizmoToTarget: (mesh) => attachGizmoToTarget(mesh),
  markLayoutDirty: () => markLayoutDirty(),
  clearLayoutDirty: () => clearLayoutDirty(),
  saveLayout: (layout) => saveLayout(layout),
  fetchLayout: (force) => fetchLayout(force),
  currentAppMode,
  currentEditorTool,
  showResetModal,
  notify: (msg, type) => emit('notify', msg, type || 'info')
};

const deleteNodeById = (nodeId: string) =>
  deleteNodeByIdMod(nodeId, scene!, layoutCommandsContext);

const deleteEdgeById = (edgeId: string) =>
  deleteEdgeByIdMod(edgeId, scene!, layoutCommandsContext);

const deletePropById = (propId: string) =>
  deletePropByIdMod(propId, layoutCommandsContext);

const handleSaveLayout = () =>
  handleSaveLayoutMod(layoutCommandsContext);

const handleResetLayout = () =>
  handleResetLayoutMod(scene!, layoutCommandsContext);

const resetToStandardTemplate = () =>
  resetToStandardTemplateMod(scene!, layoutCommandsContext);

const clearCanvasEntirely = () =>
  clearCanvasEntirelyMod(scene!, layoutCommandsContext);

const handleCancelEdit = () =>
  handleCancelEditMod(scene!, layoutCommandsContext);

const pointerEventsContext: PointerEventsContext = {
  currentAppMode,
  currentEditorTool,
  selectedVehicleId,
  selectVehicle: (id) => selectVehicle(id),
  dashboardActiveTab,
  is3DQuickDispatchActive,
  resetDispatchSteps: () => resetDispatchSteps(),
  setCameraView: (view) => setCameraView(view),
  vehicleVisuals,
  updateQuickDispatchPreviewLine: (sc) => updateQuickDispatchPreviewLine(sc),
  nodeMeshesMap,
  resolvePickedNodeFromPointer: (sc, pick) => resolvePickedNodeFromPointer(sc, pick),
  addOrSelectNodeFromMap: (nodeId) => addOrSelectNodeFromMap(nodeId),
  factoryLayout,
  fleetVehicles,
  cargoContextMenu,
  toggleStationCargo: (node, hasCargo) => toggleStationCargo(node, hasCargo),
  edgeFirstNodeId,
  hoveredNodeId,
  completeEdgeConnection: (sc, startId, endId) => completeEdgeConnection(sc, startId, endId),
  cancelEdgeConnection: () => cancelEdgeConnection(),
  disposeEdgePreviewMeshes: (includeStartRing) => disposeEdgePreviewMeshes(includeStartRing),
  updateEdgeCreationPreview: (sc, startPoint, endPoint, isSnapped, targetId) => updateEdgeCreationPreview(sc, startPoint, endPoint, isSnapped, targetId),
  edgePreviewState,
  newNodeFunction,
  updateGhostPadVisual: (sc, func) => updateGhostPadVisual(sc, func),
  hideGhostPlacementPad: () => hideGhostPlacementPad(),
  ghostPadState,
  computeSmartSnap: (x, z) => computeSmartSnap(x, z),
  checkObjectClearanceCollision: (x, z, excludeId, minDist) => checkObjectClearanceCollision(x, z, excludeId, minDist),
  setNodeHeading: (id, deg) => setNodeHeading(id, deg),
  rotateNode: (id, deg) => rotateNode(id, deg),
  selectedEditorNodeId,
  selectedEditorPropId,
  attachGizmoToTarget: (mesh) => attachGizmoToTarget(mesh),
  highlightSelectedNode: (sc, mesh) => highlightSelectedNode(sc, mesh),
  highlightStartNode: (sc, mesh) => highlightStartNode(sc, mesh),
  clearNodeSelection: () => clearNodeSelection(),
  createNodeInScene: (sc, node) => createNodeInScene(sc, node),
  clearAlignmentGuideLines: () => clearAlignmentGuideLines(),
  markLayoutDirty: () => markLayoutDirty(),
  deleteNodeById: (id) => deleteNodeById(id),
  deleteEdgeById: (id) => deleteEdgeById(id),
  deletePropById: (id) => deletePropById(id),
  get camera() { return camera; },
  notify: (msg, type) => emit('notify', msg, type || 'info')
};

const closeCargoContextMenu = () =>
  closeCargoContextMenuMod(cargoContextMenu);

const setNodeCargoStatus = (node: LayoutNode, hasCargo: boolean) =>
  setNodeCargoStatusMod(node, hasCargo, pointerEventsContext);

const setupInteractivePointerEvents = (sc: BABYLON.Scene) =>
  setupInteractivePointerEventsMod(sc, pointerEventsContext);

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
