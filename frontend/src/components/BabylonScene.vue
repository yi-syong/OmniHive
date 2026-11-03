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
  getNodeFunctionLabel,
  getNodeTypeDefaultDesc,
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
  createGhostPadState,
  clearAlignmentGuideLines as clearAlignmentGuideLinesMod,
  updateAlignmentGuideLines as updateAlignmentGuideLinesMod,
  updateGhostPadVisual as updateGhostPadVisualMod,
  hideGhostPlacementPad as hideGhostPlacementPadMod,
  positionGhostPlacementPad
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

  get previewConnectionLine() { return rubberBandLine; },
  set previewConnectionLine(val) { rubberBandLine = val; },
  get previewTargetSnapRing() { return previewTargetSnapRing; },
  set previewTargetSnapRing(val) { previewTargetSnapRing = val; },
  get previewTargetSnapDisc() { return previewEndpointReticle; },
  set previewTargetSnapDisc(val) { previewEndpointReticle = val; },
  get previewHoverStartRing() { return previewHoverStartRing; },
  set previewHoverStartRing(val) { previewHoverStartRing = val; },
  get previewArrowMeshes() { return previewEdgeArrows; },
  set previewArrowMeshes(val) { previewEdgeArrows = val; },

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

    if (floorPoint && ghostPadState.ghostPlacementPad) {
      const snap = computeSmartSnap(floorPoint.x, floorPoint.z);
      positionGhostPlacementPad(ghostPadState, snap.snappedX, snap.snappedZ);
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
