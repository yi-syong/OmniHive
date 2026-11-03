import { ref, computed } from 'vue';
import * as BABYLON from '@babylonjs/core';
import type { LayoutNode } from '../types';
import type { VehicleVisual } from './types';
import { createGhostPadState } from './editor/ghostPad';
import { createSelectionState } from './editor/selection';
import { createEdgePreviewState } from './editor/edgePreview';
import type { RotationWidgetState } from './editor/rotationWidget';
import {
  agvState,
  fleetVehicles,
  selectedVehicleId
} from '../services/websocket';

export function createSceneState() {
  const currentView = ref<'iso' | 'top' | 'follow'>('iso');

  const vehicleVisuals = new Map<string, VehicleVisual>();
  const nodeMeshesMap = new Map<string, BABYLON.Mesh>();
  const edgeMeshesMap = new Map<string, BABYLON.LinesMesh | BABYLON.Mesh>();
  const edgeArrowMeshesMap = new Map<string, BABYLON.AbstractMesh[]>();
  const propMeshesMap = new Map<string, BABYLON.AbstractMesh>();
  const stationPalletMap = new Map<string, BABYLON.AbstractMesh>();
  const stationCargoMap = new Map<string, BABYLON.AbstractMesh>();
  const nodeTextureMap = new Map<string, { texture: BABYLON.DynamicTexture, plane: BABYLON.Mesh }>();

  const currentSelectedVehicleState = computed(() => fleetVehicles[selectedVehicleId.value] || agvState);
  const currentAgvStartNode = computed(() => currentSelectedVehicleState.value.task_info?.current_node || 'Node-01');
  const isCurrentVehicleBusy = computed(() => {
    const st = currentSelectedVehicleState.value?.task_info?.status;
    const isWait = !!currentSelectedVehicleState.value?.task_info?.is_traffic_wait;
    return st === 'DRIVING' || st === 'ACTING' || isWait;
  });

  const isMissionPanelMinimized = ref(false);
  const agvNodesList = ref<string[]>([]);
  const selectedLiftNodeName = ref<string>('');
  const baseLiftPosY = ref<number>(0);

  const newNodeFunction = ref<'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'>('Transit');
  const cargoContextMenu = ref<{ visible: boolean; x: number; y: number; node: LayoutNode | null }>({
    visible: false,
    x: 0,
    y: 0,
    node: null
  });
  const showResetModal = ref(false);

  const edgeFirstNodeId = ref<string | null>(null);
  const hoveredNodeId = ref<string | null>(null);
  const edgeDirectionMode = ref<'oneway' | 'bidirectional'>('oneway');
  const selectedEditorNodeId = ref<string | null>(null);
  const selectedEditorPropId = ref<string | null>(null);

  const rotationWidgetState: RotationWidgetState = { widgetRoot: null, widgetMeshes: [] };
  const ghostPadState = createGhostPadState();
  const selectionState = createSelectionState();
  const edgePreviewState = createEdgePreviewState();

  const targetPos = new BABYLON.Vector3(0, 0, 0);
  const currentPos = new BABYLON.Vector3(0, 0, 0);

  return {
    currentView,
    vehicleVisuals,
    nodeMeshesMap,
    edgeMeshesMap,
    edgeArrowMeshesMap,
    propMeshesMap,
    stationPalletMap,
    stationCargoMap,
    nodeTextureMap,
    currentSelectedVehicleState,
    currentAgvStartNode,
    isCurrentVehicleBusy,
    isMissionPanelMinimized,
    agvNodesList,
    selectedLiftNodeName,
    baseLiftPosY,
    newNodeFunction,
    cargoContextMenu,
    showResetModal,
    edgeFirstNodeId,
    hoveredNodeId,
    edgeDirectionMode,
    selectedEditorNodeId,
    selectedEditorPropId,
    rotationWidgetState,
    ghostPadState,
    selectionState,
    edgePreviewState,
    targetPos,
    currentPos
  };
}

export type SceneState = ReturnType<typeof createSceneState>;
