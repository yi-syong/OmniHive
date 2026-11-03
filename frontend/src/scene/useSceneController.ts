import { computed, onMounted, onBeforeUnmount, type Ref } from 'vue';
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
import type { LayoutNode, LayoutEdge } from '../types';
import { getNodeObj as getNodeObjUtil } from './layout/nodeUtils';
import { resolvePickedNodeFromPointer as resolvePickedNodeFromPointerUtil } from './editor/picking';
import {
  computeSmartSnap as computeSmartSnapUtil,
  checkObjectClearanceCollision as checkObjectClearanceCollisionUtil,
  MIN_CLEARANCE_DIST
} from './editor/snapping';
import type { SceneContext } from './types';
import {
  createOrUpdateVehicleVisual as createOrUpdateVehicleVisualMod,
  updateVehiclesEditModeState as updateVehiclesEditModeStateMod,
  loadAGVModel as loadAGVModelMod,
  type VehicleVisualContext
} from './vehicles/vehicleVisuals';
import {
  clearVehicleCargo as clearVehicleCargoMod,
  mountStaticCargo as mountStaticCargoMod,
  performPickAnimation as performPickAnimationMod,
  performDropAnimation as performDropAnimationMod
} from './vehicles/cargo';
import {
  updateVehicleOverheadBadge as updateVehicleOverheadBadgeMod,
  updateVehicleTrajectory as updateVehicleTrajectoryMod
} from './vehicles/vehicleBadge';
import {
  createEdgeInScene as createEdgeInSceneMod,
  updateEdgesForNode as updateEdgesForNodeMod,
  updateDynamicPathMaterials as updateDynamicPathMaterialsMod,
  rebuildEdgesOnly as rebuildEdgesOnlyMod,
  type EdgeMeshContext
} from './layout/edgeMeshes';
import {
  updateAllNodeTextures as updateAllNodeTexturesMod,
  toggleStationCargo as toggleStationCargoMod,
  createNodeInScene as createNodeInSceneMod,
  type NodeMeshContext
} from './layout/nodeMeshes';
import {
  loadAndRenderLayout as loadAndRenderLayoutMod,
  rebuildLayoutInScene as rebuildLayoutInSceneMod,
  type LayoutBuilderContext
} from './layout/layoutBuilder';
import {
  setupGizmoManager as setupGizmoManagerMod,
  attachGizmoToTarget as attachGizmoToTargetMod,
  highlightSelectedNode as highlightSelectedNodeMod,
  highlightStartNode as highlightStartNodeMod,
  clearNodeSelection as clearNodeSelectionMod,
  type SelectionContext
} from './editor/selection';
import {
  disposeEdgePreviewMeshes as disposeEdgePreviewMeshesMod,
  cancelEdgeConnection as cancelEdgeConnectionMod,
  updateEdgeCreationPreview as updateEdgeCreationPreviewMod,
  completeEdgeConnection as completeEdgeConnectionMod,
  type EdgeConnectionContext
} from './editor/edgePreview';
import {
  deleteNodeById as deleteNodeByIdMod,
  deleteEdgeById as deleteEdgeByIdMod,
  deletePropById as deletePropByIdMod,
  handleSaveLayout as handleSaveLayoutMod,
  resetToStandardTemplate as resetToStandardTemplateMod,
  clearCanvasEntirely as clearCanvasEntirelyMod,
  handleCancelEdit as handleCancelEditMod,
  type LayoutCommandsContext
} from './editor/layoutCommands';
import {
  setupInteractivePointerEvents as setupInteractivePointerEventsMod,
  closeCargoContextMenu as closeCargoContextMenuMod,
  setNodeCargoStatus as setNodeCargoStatusMod,
  type PointerEventsContext
} from './editor/pointerEvents';
import {
  createNodeRotationWidget as createNodeRotationWidgetMod,
  clearNodeRotationWidget as clearNodeRotationWidgetMod,
  rotateNode as rotateNodeMod,
  setNodeHeading as setNodeHeadingMod,
  rotateSelectedElement as rotateSelectedElementMod,
  type RotationOpsContext
} from './editor/rotationWidget';
import {
  clearAlignmentGuideLines as clearAlignmentGuideLinesMod,
  updateAlignmentGuideLines as updateAlignmentGuideLinesMod,
  updateGhostPadVisual as updateGhostPadVisualMod,
  hideGhostPlacementPad as hideGhostPlacementPadMod
} from './editor/ghostPad';
import { useMissionDispatch } from './dispatch/useMissionDispatch';
import {
  initBabylonEngine,
  setCameraView as setCameraViewEngine,
  handleKeyDown as handleKeyDownEngine
} from './engine';
import { setupSceneWatchers } from './watchers';
import { createSceneState } from './sceneState';
import { startRenderLoop } from './renderLoop';

export function useSceneController(
  canvasRef: Ref<HTMLCanvasElement | null>,
  emit: (e: 'notify', msg: string, type: 'success' | 'info' | 'warn') => void
) {
  const state = createSceneState();

  let engine: BABYLON.Engine | null = null;
  let scene: BABYLON.Scene | null = null;
  let camera: BABYLON.ArcRotateCamera | null = null;
  let gizmoManager: BABYLON.GizmoManager | null = null;

  let agvRoot: BABYLON.TransformNode | null = null;
  let cargoMesh: BABYLON.AbstractMesh | BABYLON.TransformNode | null = null;
  let beaconMaterial: BABYLON.StandardMaterial | null = null;
  let agvHaloMesh: BABYLON.Mesh | null = null;

  const getNodeObj = (nodeId: string): LayoutNode | undefined => getNodeObjUtil(nodeId, factoryLayout.nodes);
  const resolvePickedNodeFromPointer = (sc: BABYLON.Scene, pickResult?: BABYLON.Nullable<BABYLON.PickingInfo>) =>
    resolvePickedNodeFromPointerUtil(sc, pickResult, factoryLayout.nodes, fleetVehicles, state.vehicleVisuals);
  const checkObjectClearanceCollision = (x: number, z: number, excludeId?: string, minDistance: number = MIN_CLEARANCE_DIST) =>
    checkObjectClearanceCollisionUtil(x, z, factoryLayout.nodes, factoryLayout.props, excludeId, minDistance);
  const computeSmartSnap = (rawX: number, rawZ: number, excludeNodeId?: string) =>
    computeSmartSnapUtil(rawX, rawZ, factoryLayout.nodes, excludeNodeId, 0.35, 0.5);

  const clearAlignmentGuideLines = () => clearAlignmentGuideLinesMod(state.ghostPadState);
  const updateAlignmentGuideLines = (sc: BABYLON.Scene, posX: number, posZ: number, alignedNodesX: LayoutNode[], alignedNodesZ: LayoutNode[]) =>
    updateAlignmentGuideLinesMod(sc, posX, posZ, alignedNodesX, alignedNodesZ, state.ghostPadState);
  const updateGhostPadVisual = (sc: BABYLON.Scene, func: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo') =>
    updateGhostPadVisualMod(sc, state.ghostPadState, func);
  const hideGhostPlacementPad = () => hideGhostPlacementPadMod(state.ghostPadState);

  const rotationOpsContext: RotationOpsContext = {
    get sc() { return scene!; },
    nodes: factoryLayout.nodes,
    props: factoryLayout.props,
    nodeMeshesMap: state.nodeMeshesMap,
    propMeshesMap: state.propMeshesMap,
    selectedEditorNodeId: state.selectedEditorNodeId,
    selectedEditorPropId: state.selectedEditorPropId,
    widgetState: state.rotationWidgetState,
    cargoContextMenuNode: state.cargoContextMenu,
    markLayoutDirty: () => markLayoutDirty(),
    notify: (msg, type) => emit('notify', msg, type || 'info')
  };

  const createNodeRotationWidget = (sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh | null, nodeId: string) =>
    createNodeRotationWidgetMod(sc, nodeMesh, nodeId, factoryLayout.nodes, state.rotationWidgetState);
  const clearNodeRotationWidget = () => clearNodeRotationWidgetMod(state.rotationWidgetState);
  const rotateNode = (nodeId: string, deltaDegrees: number = 90) => rotateNodeMod(nodeId, deltaDegrees, rotationOpsContext);
  const setNodeHeading = (nodeId: string, targetDeg: number) => setNodeHeadingMod(nodeId, targetDeg, rotationOpsContext);
  const rotateSelectedElement = (deltaDegrees: number = 90) => rotateSelectedElementMod(deltaDegrees, rotationOpsContext);

  // Mission Dispatch composable
  const missionDispatch = useMissionDispatch({
    factoryLayout,
    quickDispatchSteps,
    currentAgvStartNode: state.currentAgvStartNode,
    is3DQuickDispatchActive,
    currentAppMode,
    selectedVehicleId,
    get agvHaloMesh() { return agvHaloMesh; },
    fleetVehicles,
    agvState,
    getScene: () => scene,
    getNodeObj,
    cancelOrder,
    sendDispatchOrder,
    notify: (msg, type) => emit('notify', msg, type || 'info')
  });

  const {
    activeStepIndex,
    handleCancelCurrentMission,
    updateQuickDispatchPreviewLine,
    addNewDispatchStep,
    removeDispatchStep,
    setStepAction,
    onStepNodeChange,
    resetDispatchSteps,
    addOrSelectNodeFromMap,
    closeQuickDispatch,
    handleQuickDispatchLaunch
  } = missionDispatch;

  const sceneContext: SceneContext = {
    get canvas() { return canvasRef.value!; },
    get engine() { return engine!; },
    get scene() { return scene!; },
    get camera() { return camera!; },
    get gizmoManager() { return gizmoManager!; },
    nodeMeshesMap: state.nodeMeshesMap,
    edgeMeshesMap: state.edgeMeshesMap,
    edgeArrowMeshesMap: state.edgeArrowMeshesMap,
    propMeshesMap: state.propMeshesMap,
    stationPalletMap: state.stationPalletMap as unknown as Map<string, BABYLON.TransformNode>,
    stationCargoMap: state.stationCargoMap,
    nodeTextureMap: state.nodeTextureMap,
    vehicleVisuals: state.vehicleVisuals,
    get agvRoot() { return agvRoot; },
    set agvRoot(val) { agvRoot = val; },
    get cargoMesh() { return cargoMesh; },
    set cargoMesh(val) { cargoMesh = val; },
    get agvHaloMesh() { return agvHaloMesh; },
    set agvHaloMesh(val) { agvHaloMesh = val; },
    get beaconMaterial() { return beaconMaterial; },
    set beaconMaterial(val) { beaconMaterial = val; },
    selectedEditorNodeId: state.selectedEditorNodeId,
    selectedEditorPropId: state.selectedEditorPropId,
    edgeFirstNodeId: state.edgeFirstNodeId,
    hoveredNodeId: state.hoveredNodeId,
    edgeDirectionMode: state.edgeDirectionMode,
    newNodeFunction: state.newNodeFunction,
    get nodeRotationWidgetRoot() { return state.rotationWidgetState.widgetRoot; },
    set nodeRotationWidgetRoot(val) { state.rotationWidgetState.widgetRoot = val; },
    get nodeRotationWidgetMeshes() { return state.rotationWidgetState.widgetMeshes; },
    get ghostPlacementPad() { return state.ghostPadState.ghostPlacementPad; },
    set ghostPlacementPad(val) { state.ghostPadState.ghostPlacementPad = val; },
    get ghostPadMaterial() { return state.ghostPadState.ghostPadMaterial; },
    set ghostPadMaterial(val) { state.ghostPadState.ghostPadMaterial = val; },
    get ghostPlacementRing() { return state.ghostPadState.ghostPlacementRing; },
    set ghostPlacementRing(val) { state.ghostPadState.ghostPlacementRing = val; },
    get alignmentGuideLinesMesh() { return state.ghostPadState.alignmentGuideLinesMesh; },
    set alignmentGuideLinesMesh(val) { state.ghostPadState.alignmentGuideLinesMesh = val; },
    get alignmentMarkersMesh() { return state.ghostPadState.alignmentMarkersMesh; },
    set alignmentMarkersMesh(val) { state.ghostPadState.alignmentMarkersMesh = val; },
    get previewConnectionLine() { return state.edgePreviewState.rubberBandLine; },
    set previewConnectionLine(val) { state.edgePreviewState.rubberBandLine = val; },
    get previewTargetSnapRing() { return state.edgePreviewState.previewTargetSnapRing; },
    set previewTargetSnapRing(val) { state.edgePreviewState.previewTargetSnapRing = val; },
    get previewTargetSnapDisc() { return state.edgePreviewState.previewEndpointReticle; },
    set previewTargetSnapDisc(val) { state.edgePreviewState.previewEndpointReticle = val; },
    get previewHoverStartRing() { return state.edgePreviewState.previewHoverStartRing; },
    set previewHoverStartRing(val) { state.edgePreviewState.previewHoverStartRing = val; },
    get previewArrowMeshes() { return state.edgePreviewState.previewEdgeArrows; },
    set previewArrowMeshes(val) { state.edgePreviewState.previewEdgeArrows = val; },
    get quickDispatchPreviewLine() { return missionDispatch.getPreviewLine(); },
    set quickDispatchPreviewLine(_val) {},
    notify: (msg, type) => emit('notify', msg, type || 'info')
  };

  const vehicleVisualContext = computed<VehicleVisualContext>(() => ({
    sc: scene!,
    ctx: sceneContext,
    selectedVehicleId,
    currentAppMode,
    agvNodesList: state.agvNodesList,
    selectedLiftNodeName: state.selectedLiftNodeName,
    baseLiftPosY: state.baseLiftPosY,
    is3DQuickDispatchActive,
    fleetVehicles,
    agvState,
  }));

  const createOrUpdateVehicleVisual = (_sc: BABYLON.Scene, vehicleId: string, initPos?: { x: number; z: number; theta?: number }) =>
    createOrUpdateVehicleVisualMod(vehicleVisualContext.value, vehicleId, initPos);
  const updateVehiclesEditModeState = (isEdit: boolean) => updateVehiclesEditModeStateMod(sceneContext, isEdit);
  const loadAGVModel = (_sc: BABYLON.Scene) => loadAGVModelMod(vehicleVisualContext.value);
  const updateVehicleOverheadBadge = (sc: BABYLON.Scene, visual: any, vData: any) => updateVehicleOverheadBadgeMod(sc, visual, vData);
  const updateVehicleTrajectory = (sc: BABYLON.Scene, visual: any, vData: any) => updateVehicleTrajectoryMod(sc, visual, vData, factoryLayout.nodes);
  const clearVehicleCargo = (vehicleId: string) => clearVehicleCargoMod(vehicleId, sceneContext, state.baseLiftPosY.value, state.selectedLiftNodeName.value);
  const mountStaticCargo = (sc: BABYLON.Scene, vehicleId: string = 'AGV-001') => mountStaticCargoMod(sc, vehicleId, sceneContext, state.baseLiftPosY.value, state.selectedLiftNodeName.value);
  const performPickAnimation = (sc: BABYLON.Scene, vehicleId: string = 'AGV-001') =>
    performPickAnimationMod(sc, vehicleId, sceneContext, currentTimeScale.value, state.baseLiftPosY.value, state.selectedLiftNodeName.value);
  const performDropAnimation = (sc: BABYLON.Scene, vehicleId: string = 'AGV-001') =>
    performDropAnimationMod(sc, vehicleId, sceneContext, currentTimeScale.value, state.baseLiftPosY.value, state.selectedLiftNodeName.value);

  const edgeMeshContext: EdgeMeshContext = {
    factoryLayout,
    edgeMeshesMap: state.edgeMeshesMap,
    edgeArrowMeshesMap: state.edgeArrowMeshesMap,
    get fleetVehicles() { return fleetVehicles; },
    get agvState() { return agvState; },
    get selectedVehicleId() { return selectedVehicleId.value; }
  };

  const createEdgeInScene = (sc: BABYLON.Scene, edge: LayoutEdge) => createEdgeInSceneMod(sc, edge, edgeMeshContext);
  const updateEdgesForNode = (sc: BABYLON.Scene, nodeId: string) => updateEdgesForNodeMod(sc, nodeId, edgeMeshContext);
  const updateDynamicPathMaterials = () => updateDynamicPathMaterialsMod(edgeMeshContext);
  const rebuildEdgesOnly = (sc: BABYLON.Scene) => rebuildEdgesOnlyMod(sc, edgeMeshContext);

  const nodeMeshContext: NodeMeshContext = {
    factoryLayout,
    nodeMeshesMap: state.nodeMeshesMap,
    stationPalletMap: state.stationPalletMap as unknown as Map<string, BABYLON.TransformNode>,
    stationCargoMap: state.stationCargoMap,
    nodeTextureMap: state.nodeTextureMap,
    fleetVehicles,
    agvState,
    is3DQuickDispatchActive,
    currentAgvStartNode: state.currentAgvStartNode,
    quickDispatchSteps,
    currentAppMode,
    currentEditorTool,
    selectedEditorNodeId: state.selectedEditorNodeId,
    selectedEditorPropId: state.selectedEditorPropId,
    get camera() { return camera; },
    getCanvas: () => canvasRef.value,
    get gizmoManager() { return gizmoManager; },
    getNodeRotationWidgetRoot: () => state.rotationWidgetState.widgetRoot,
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

  const updateAllNodeTextures = () => updateAllNodeTexturesMod(nodeMeshContext);
  const toggleStationCargo = (node: LayoutNode, forceState?: boolean) => toggleStationCargoMod(node, forceState, scene!, nodeMeshContext);
  const createNodeInScene = (sc: BABYLON.Scene, node: LayoutNode) => createNodeInSceneMod(sc, node, nodeMeshContext);

  const layoutBuilderContext: LayoutBuilderContext = {
    factoryLayout,
    nodeMeshCtx: nodeMeshContext,
    edgeMeshCtx: edgeMeshContext,
    propMeshesMap: state.propMeshesMap,
    fetchLayout: () => fetchLayout(),
    currentAppMode,
    hasUnsavedChanges
  };

  const rebuildLayoutInScene = (sc: BABYLON.Scene) => rebuildLayoutInSceneMod(sc, layoutBuilderContext);
  const loadAndRenderLayout = (sc: BABYLON.Scene) => loadAndRenderLayoutMod(sc, layoutBuilderContext);

  const selectionContext: SelectionContext = {
    factoryLayout,
    nodeMeshesMap: state.nodeMeshesMap,
    propMeshesMap: state.propMeshesMap,
    selectedEditorNodeId: state.selectedEditorNodeId,
    selectedEditorPropId: state.selectedEditorPropId,
    selectionState: state.selectionState,
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

  const attachGizmoToTarget = (mesh: BABYLON.AbstractMesh | null) => attachGizmoToTargetMod(scene!, mesh, selectionContext);
  const highlightSelectedNode = (sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) => highlightSelectedNodeMod(sc, nodeMesh, selectionContext);
  const highlightStartNode = (sc: BABYLON.Scene, nodeMesh: BABYLON.AbstractMesh) => highlightStartNodeMod(sc, nodeMesh, selectionContext);
  const clearNodeSelection = () => clearNodeSelectionMod(selectionContext);
  const setupGizmoManager = (sc: BABYLON.Scene) => setupGizmoManagerMod(sc, selectionContext);

  const edgeConnectionContext: EdgeConnectionContext = {
    factoryLayout,
    edgeMeshesMap: state.edgeMeshesMap,
    edgeArrowMeshesMap: state.edgeArrowMeshesMap,
    createEdgeInScene: (sc, edge) => createEdgeInScene(sc, edge),
    updateDynamicPathMaterials: () => updateDynamicPathMaterials(),
    markLayoutDirty: () => markLayoutDirty(),
    notify: (msg, type) => emit('notify', msg, type || 'info'),
    cancelEdgeConnection: () => cancelEdgeConnection()
  };

  const disposeEdgePreviewMeshes = (includeStartRing: boolean = true) => disposeEdgePreviewMeshesMod(state.edgePreviewState, clearNodeSelection, includeStartRing);
  const cancelEdgeConnection = () => cancelEdgeConnectionMod(state.edgePreviewState, state.edgeFirstNodeId, state.hoveredNodeId, clearNodeSelection);
  const updateEdgeCreationPreview = (sc: BABYLON.Scene, startPoint: BABYLON.Vector3, endPoint: BABYLON.Vector3, isSnapped: boolean, targetId: string | null) =>
    updateEdgeCreationPreviewMod(sc, startPoint, endPoint, isSnapped, targetId, state.edgeDirectionMode.value === 'bidirectional', state.edgePreviewState, clearNodeSelection);
  const completeEdgeConnection = (sc: BABYLON.Scene, startId: string, endId: string) =>
    completeEdgeConnectionMod(sc, startId, endId, state.edgeDirectionMode.value === 'bidirectional', edgeConnectionContext);

  const layoutCommandsContext: LayoutCommandsContext = {
    factoryLayout,
    nodeMeshesMap: state.nodeMeshesMap,
    nodeTextureMap: state.nodeTextureMap,
    stationPalletMap: state.stationPalletMap as unknown as Map<string, BABYLON.TransformNode>,
    stationCargoMap: state.stationCargoMap,
    edgeMeshesMap: state.edgeMeshesMap,
    edgeArrowMeshesMap: state.edgeArrowMeshesMap,
    propMeshesMap: state.propMeshesMap,
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
    showResetModal: state.showResetModal,
    notify: (msg, type) => emit('notify', msg, type || 'info')
  };

  const deleteNodeById = (nodeId: string) => deleteNodeByIdMod(nodeId, scene!, layoutCommandsContext);
  const deleteEdgeById = (edgeId: string) => deleteEdgeByIdMod(edgeId, scene!, layoutCommandsContext);
  const deletePropById = (propId: string) => deletePropByIdMod(propId, layoutCommandsContext);
  const handleSaveLayout = () => handleSaveLayoutMod(layoutCommandsContext);
  const resetToStandardTemplate = () => resetToStandardTemplateMod(scene!, layoutCommandsContext);
  const clearCanvasEntirely = () => clearCanvasEntirelyMod(scene!, layoutCommandsContext);
  const handleCancelEdit = () => handleCancelEditMod(scene!, layoutCommandsContext);

  const pointerEventsContext: PointerEventsContext = {
    currentAppMode,
    currentEditorTool,
    selectedVehicleId,
    selectVehicle: (id) => selectVehicle(id),
    dashboardActiveTab,
    is3DQuickDispatchActive,
    resetDispatchSteps: () => resetDispatchSteps(),
    setCameraView: (view) => setCameraView(view),
    vehicleVisuals: state.vehicleVisuals,
    updateQuickDispatchPreviewLine: (sc) => updateQuickDispatchPreviewLine(sc),
    nodeMeshesMap: state.nodeMeshesMap,
    resolvePickedNodeFromPointer: (sc, pick) => resolvePickedNodeFromPointer(sc, pick),
    addOrSelectNodeFromMap: (nodeId) => addOrSelectNodeFromMap(nodeId),
    factoryLayout,
    fleetVehicles,
    cargoContextMenu: state.cargoContextMenu,
    toggleStationCargo: (node, hasCargo) => toggleStationCargo(node, hasCargo),
    edgeFirstNodeId: state.edgeFirstNodeId,
    hoveredNodeId: state.hoveredNodeId,
    completeEdgeConnection: (sc, startId, endId) => completeEdgeConnection(sc, startId, endId),
    cancelEdgeConnection: () => cancelEdgeConnection(),
    disposeEdgePreviewMeshes: (includeStartRing) => disposeEdgePreviewMeshes(includeStartRing),
    updateEdgeCreationPreview: (sc, startPoint, endPoint, isSnapped, targetId) => updateEdgeCreationPreview(sc, startPoint, endPoint, isSnapped, targetId),
    edgePreviewState: state.edgePreviewState,
    newNodeFunction: state.newNodeFunction,
    updateGhostPadVisual: (sc, func) => updateGhostPadVisual(sc, func),
    hideGhostPlacementPad: () => hideGhostPlacementPad(),
    ghostPadState: state.ghostPadState,
    computeSmartSnap: (x, z) => computeSmartSnap(x, z),
    checkObjectClearanceCollision: (x, z, excludeId, minDist) => checkObjectClearanceCollision(x, z, excludeId, minDist),
    setNodeHeading: (id, deg) => setNodeHeading(id, deg),
    rotateNode: (id, deg) => rotateNode(id, deg),
    selectedEditorNodeId: state.selectedEditorNodeId,
    selectedEditorPropId: state.selectedEditorPropId,
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

  const closeCargoContextMenu = () => closeCargoContextMenuMod(state.cargoContextMenu);
  const setNodeCargoStatus = (node: LayoutNode, hasCargo: boolean) => setNodeCargoStatusMod(node, hasCargo, toggleStationCargo, state.cargoContextMenu);
  const setupInteractivePointerEvents = (sc: BABYLON.Scene) => setupInteractivePointerEventsMod(sc, pointerEventsContext);

  function setCameraView(view: 'iso' | 'top' | 'follow') {
    const followTarget = selectedVehicleId.value ? state.vehicleVisuals.get(selectedVehicleId.value)?.root : agvRoot;
    setCameraViewEngine(camera, view, state.currentView, followTarget);
  }

  function handleResize() {
    if (engine) engine.resize();
  }

  function handleKeyDown(e: KeyboardEvent) {
    handleKeyDownEngine(e, {
      is3DQuickDispatchActive,
      closeQuickDispatch,
      cancelEdgeConnection,
      clearNodeSelection,
      attachGizmoToTarget: (mesh) => attachGizmoToTarget(mesh),
      deleteNodeById,
      deletePropById,
      rotateSelectedElement,
      setCameraView,
      selectedEditorNodeId: state.selectedEditorNodeId,
      selectedEditorPropId: state.selectedEditorPropId
    });
  }

  onMounted(async () => {
    if (!canvasRef.value) return;

    const bEngine = initBabylonEngine(canvasRef.value);
    engine = bEngine.engine;
    scene = bEngine.scene;
    camera = bEngine.camera;

    setupGizmoManager(scene);
    setupInteractivePointerEvents(scene);
    await loadAGVModel(scene);
    await loadAndRenderLayout(scene);

    setupSceneWatchers({
      getScene: () => scene,
      factoryLayout,
      fleetVehicles,
      agvState,
      vehicleVisuals: state.vehicleVisuals,
      selectedVehicleId,
      currentTimeScale,
      currentAppMode,
      currentEditorTool,
      newNodeFunction: state.newNodeFunction,
      edgeDirectionMode: state.edgeDirectionMode,
      edgeFirstNodeId: state.edgeFirstNodeId,
      hoveredNodeId: state.hoveredNodeId,
      currentAgvStartNode: state.currentAgvStartNode,
      quickDispatchSteps,
      is3DQuickDispatchActive,
      cameraFollowTrigger,
      getGizmoManager: () => gizmoManager,
      getCargoMesh: () => cargoMesh,
      getTargetPos: () => state.targetPos,
      getEndpointReticle: () => state.edgePreviewState.previewEndpointReticle,
      nodeMeshesMap: state.nodeMeshesMap,
      onVisualEvent,
      onDispatchError,
      toggleStationCargo,
      performPickAnimation,
      performDropAnimation,
      clearVehicleCargo,
      mountStaticCargo,
      createOrUpdateVehicleVisual,
      updateVehiclesEditModeState,
      updateVehicleOverheadBadge,
      updateVehicleTrajectory,
      updateDynamicPathMaterials,
      updateAllNodeTextures,
      setCameraView,
      updateGhostPadVisual,
      updateEdgeCreationPreview,
      cancelEdgeConnection,
      hideGhostPlacementPad,
      clearNodeSelection,
      notify: (msg, type) => emit('notify', msg, type || 'info')
    });

    startRenderLoop(engine, {
      getScene: () => scene,
      getCamera: () => camera,
      vehicleVisuals: state.vehicleVisuals,
      fleetVehicles,
      agvState,
      factoryLayout,
      selectedVehicleId,
      currentView: state.currentView,
      updateVehicleOverheadBadge,
      getAgvRoot: () => agvRoot,
      currentPos: state.currentPos
    });

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

  return {
    currentAppMode,
    currentView: state.currentView,
    setCameraView,
    currentEditorTool,
    newNodeFunction: state.newNodeFunction,
    edgeDirectionMode: state.edgeDirectionMode,
    hasUnsavedChanges,
    handleSaveLayout,
    handleCancelEdit,
    showResetModal: state.showResetModal,
    resetToStandardTemplate,
    clearCanvasEntirely,
    edgeFirstNodeId: state.edgeFirstNodeId,
    hoveredNodeId: state.hoveredNodeId,
    cancelEdgeConnection,
    cargoContextMenu: state.cargoContextMenu,
    closeCargoContextMenu,
    setNodeCargoStatus,
    is3DQuickDispatchActive,
    isMissionPanelMinimized: state.isMissionPanelMinimized,
    selectedVehicleId,
    currentAgvStartNode: state.currentAgvStartNode,
    currentSelectedVehicleState: state.currentSelectedVehicleState,
    quickDispatchSteps,
    activeStepIndex,
    factoryLayout,
    fleetVehicles,
    isCurrentVehicleBusy: state.isCurrentVehicleBusy,
    closeQuickDispatch,
    handleCancelCurrentMission,
    onStepNodeChange,
    toggleStationCargo,
    removeDispatchStep,
    setStepAction,
    addNewDispatchStep,
    resetDispatchSteps,
    handleQuickDispatchLaunch
  };
}
