import { watch, type Ref } from 'vue';
import * as BABYLON from '@babylonjs/core';
import type { AppMode, EditorTool, FactoryLayout, LayoutNode } from '../types';
import type { VehicleVisual } from './types';
import { isCargoNode } from './layout/nodeUtils';

export interface SceneWatchersContext {
  getScene: () => BABYLON.Scene | null;
  factoryLayout: FactoryLayout;
  fleetVehicles: Record<string, any>;
  agvState: any;
  vehicleVisuals: Map<string, VehicleVisual>;
  selectedVehicleId: Ref<string>;
  currentTimeScale: Ref<number>;
  currentAppMode: Ref<AppMode>;
  currentEditorTool: Ref<EditorTool>;
  newNodeFunction: Ref<'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'>;
  edgeDirectionMode: Ref<'oneway' | 'bidirectional'>;
  edgeFirstNodeId: Ref<string | null>;
  hoveredNodeId: Ref<string | null>;
  currentAgvStartNode: Ref<string | null>;
  quickDispatchSteps: Ref<Array<{ node_id: string }>>;
  is3DQuickDispatchActive: Ref<boolean>;
  cameraFollowTrigger: Ref<number>;
  getGizmoManager: () => BABYLON.GizmoManager | null;
  getCargoMesh: () => BABYLON.AbstractMesh | BABYLON.TransformNode | null;
  getTargetPos: () => BABYLON.Vector3;
  getEndpointReticle: () => BABYLON.Mesh | null;
  nodeMeshesMap: Map<string, BABYLON.Mesh>;

  // Callbacks
  onVisualEvent: (cb: (event: string, vehicleId?: string) => void) => void;
  onDispatchError: (cb: (err: string) => void) => void;
  toggleStationCargo: (node: LayoutNode, hasCargo: boolean) => Promise<void>;
  performPickAnimation: (sc: BABYLON.Scene, vId: string) => Promise<void>;
  performDropAnimation: (sc: BABYLON.Scene, vId: string) => void;
  clearVehicleCargo: (vId: string) => void;
  mountStaticCargo: (sc: BABYLON.Scene, vId: string) => Promise<void>;
  createOrUpdateVehicleVisual: (sc: BABYLON.Scene, vId: string, pos: { x: number; z: number; theta: number }) => Promise<any>;
  updateVehiclesEditModeState: (isEdit: boolean) => void;
  updateVehicleOverheadBadge: (sc: BABYLON.Scene, visual: VehicleVisual, vData: any) => void;
  updateVehicleTrajectory: (sc: BABYLON.Scene, visual: VehicleVisual, vData: any) => void;
  updateDynamicPathMaterials: () => void;
  updateAllNodeTextures: () => void;
  setCameraView: (view: 'iso' | 'top' | 'follow') => void;
  updateGhostPadVisual: (sc: BABYLON.Scene, func: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo') => void;
  updateEdgeCreationPreview: (sc: BABYLON.Scene, startPoint: BABYLON.Vector3, endPoint: BABYLON.Vector3, isSnapped: boolean, targetId: string | null) => void;
  cancelEdgeConnection: () => void;
  hideGhostPlacementPad: () => void;
  clearNodeSelection: () => void;
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}

export function setupSceneWatchers(ctx: SceneWatchersContext) {
  let isPickAnimationRunning = false;
  let isDropAnimationRunning = false;

  // 1. MQTT Visual Events for Cargo
  ctx.onVisualEvent((event, vehicleId) => {
    const vId = vehicleId || 'AGV-001';
    const vState = ctx.fleetVehicles[vId] || ctx.agvState;
    const currNodeId = vState.task_info?.current_node;
    const scene = ctx.getScene();

    if (event === 'pick_start') {
      if (!isPickAnimationRunning) {
        isPickAnimationRunning = true;
        const scale = ctx.currentTimeScale.value || 1;
        const pickDelay = Math.max(150, Math.round(1100 / scale));
        setTimeout(() => {
          if (currNodeId) {
            const stNode = ctx.factoryLayout.nodes.find(n => n.id === currNodeId);
            if (stNode && isCargoNode(stNode.id, ctx.factoryLayout.nodes)) {
              ctx.toggleStationCargo(stNode, false);
            }
          }
        }, pickDelay);

        if (scene) {
          ctx.performPickAnimation(scene, vId).finally(() => {
            const resetDelay = Math.max(500, Math.round(3800 / scale));
            setTimeout(() => { isPickAnimationRunning = false; }, resetDelay);
          });
        }
      }
    } else if (event === 'pick_done') {
      isPickAnimationRunning = false;
    } else if (event === 'drop_start') {
      if (!isDropAnimationRunning) {
        isDropAnimationRunning = true;
        const scale = ctx.currentTimeScale.value || 1;
        const dropDelay = Math.max(200, Math.round(2100 / scale));
        setTimeout(() => {
          if (currNodeId) {
            const stNode = ctx.factoryLayout.nodes.find(n => n.id === currNodeId);
            if (stNode && isCargoNode(stNode.id, ctx.factoryLayout.nodes)) {
              ctx.toggleStationCargo(stNode, true);
            }
          }
        }, dropDelay);

        if (scene) {
          ctx.performDropAnimation(scene, vId);
          const resetDelay = Math.max(500, Math.round(3800 / scale));
          setTimeout(() => { isDropAnimationRunning = false; }, resetDelay);
        }
      }
    } else if (event === 'drop_done') {
      isDropAnimationRunning = false;
      ctx.clearVehicleCargo(vId);
      if (currNodeId) {
        const stNode = ctx.factoryLayout.nodes.find(n => n.id === currNodeId);
        if (stNode && isCargoNode(stNode.id, ctx.factoryLayout.nodes)) {
          ctx.toggleStationCargo(stNode, true);
        }
      }
    }
  });

  // 2. Backend dispatch rejection errors
  ctx.onDispatchError((err) => {
    ctx.notify(`⚠️ 派發被拒絕：${err}`, 'warn');
  });

  // 3. Watch AGV Task Cargo State
  watch(
    () => ctx.agvState.task_info?.has_cargo,
    (hasCargo) => {
      const scene = ctx.getScene();
      const cargoMesh = ctx.getCargoMesh();
      if (hasCargo && !cargoMesh && !isPickAnimationRunning && ctx.agvState.task_info?.status !== 'ACTING' && scene) {
        ctx.mountStaticCargo(scene, 'AGV-001');
      } else if (!hasCargo && (cargoMesh || ctx.vehicleVisuals.get('AGV-001')?.cargoMesh) && !isDropAnimationRunning && ctx.agvState.task_info?.status !== 'ACTING') {
        ctx.clearVehicleCargo('AGV-001');
      }
    },
    { immediate: true }
  );

  // 4. Watch All Fleet Vehicles Dynamically
  watch(
    () => ctx.fleetVehicles,
    (fleet) => {
      const scene = ctx.getScene();
      if (!scene) return;
      const targetPos = ctx.getTargetPos();
      const cargoMesh = ctx.getCargoMesh();

      for (const [vId, vData] of Object.entries(fleet)) {
        let visual = ctx.vehicleVisuals.get(vId);
        if (!visual) {
          ctx.createOrUpdateVehicleVisual(scene, vId, {
            x: vData.position.x,
            z: vData.position.z !== undefined ? vData.position.z : vData.position.y,
            theta: vData.position.theta
          });
          visual = ctx.vehicleVisuals.get(vId);
          if (!visual) continue;
          ctx.updateVehiclesEditModeState(ctx.currentAppMode.value === 'edit');
        }

        const rawX = vData.position.x;
        const rawZ = vData.position.z !== undefined ? vData.position.z : vData.position.y;
        const tTheta = vData.position.theta;

        visual.targetPos.x = rawX;
        visual.targetPos.z = rawZ;
        visual.targetTheta = tTheta;

        if (visual.trafficWaitMesh) {
          visual.trafficWaitMesh.isVisible = !!vData.task_info?.is_traffic_wait;
        }

        if (vData.task_info) {
          if (vData.task_info.has_cargo === false && !isDropAnimationRunning && vData.task_info.status !== 'ACTING') {
            if (visual.cargoMesh || (vId === 'AGV-001' && cargoMesh)) {
              ctx.clearVehicleCargo(vId);
            }
          } else if (vData.task_info.has_cargo === true && !visual.cargoMesh && !isPickAnimationRunning && vData.task_info.status !== 'ACTING') {
            ctx.mountStaticCargo(scene, vId);
          }
        }

        ctx.updateVehicleOverheadBadge(scene, visual, vData);
        ctx.updateVehicleTrajectory(scene, visual, vData);

        if (vId === 'AGV-001' || vId === ctx.selectedVehicleId.value) {
          targetPos.copyFrom(visual.targetPos);
        }
      }
    },
    { deep: true, immediate: true }
  );

  // 5. Watch selectedVehicleId and quick dispatch to update all halos
  watch(
    [() => ctx.selectedVehicleId.value, () => ctx.is3DQuickDispatchActive.value],
    ([vId, active]) => {
      for (const [id, visual] of ctx.vehicleVisuals.entries()) {
        if (visual.haloMesh) {
          visual.haloMesh.isVisible = active && id === vId;
        }
      }
    }
  );

  // 6. Watch all fleet edge & node states
  watch(
    () => [
      ctx.agvState.edge_states, 
      ctx.agvState.passed_edges, 
      ctx.agvState.node_states,
      ctx.agvState.task_info?.current_node,
      ctx.agvState.task_info?.status,
      ...Object.values(ctx.fleetVehicles).map(v => v.edge_states),
      ...Object.values(ctx.fleetVehicles).map(v => v.passed_edges),
      ...Object.values(ctx.fleetVehicles).map(v => v.node_states),
      ...Object.values(ctx.fleetVehicles).map(v => v.task_info?.current_node),
      ...Object.values(ctx.fleetVehicles).map(v => v.task_info?.status),
      ctx.quickDispatchSteps.value.length,
      ctx.currentAgvStartNode.value,
      ctx.is3DQuickDispatchActive.value
    ],
    () => {
      ctx.updateDynamicPathMaterials();
      ctx.updateAllNodeTextures();
    },
    { deep: true }
  );

  // 7. Camera follow trigger
  watch(ctx.cameraFollowTrigger, () => {
    if (ctx.currentAppMode.value === 'simulate') {
      ctx.setCameraView('follow');
    }
  });

  // 8. Ghost pad function change
  watch(
    () => ctx.newNodeFunction.value,
    (func) => {
      const scene = ctx.getScene();
      if (scene && ctx.currentEditorTool.value === 'add_node') {
        ctx.updateGhostPadVisual(scene, func);
      }
    }
  );

  // 9. Edge direction mode change
  watch(
    () => ctx.edgeDirectionMode.value,
    () => {
      const scene = ctx.getScene();
      if (ctx.currentAppMode.value === 'edit' && ctx.currentEditorTool.value === 'add_edge' && ctx.edgeFirstNodeId.value && scene) {
        const startNode = ctx.factoryLayout.nodes.find(n => n.id === ctx.edgeFirstNodeId.value);
        if (!startNode) return;
        const startPoint = new BABYLON.Vector3(startNode.x, 0.05, startNode.z);
        let endPoint: BABYLON.Vector3 | null = null;
        let isSnapped = false;
        let targetId: string | null = null;
        if (ctx.hoveredNodeId.value) {
          const targetNode = ctx.factoryLayout.nodes.find(n => n.id === ctx.hoveredNodeId.value);
          if (targetNode) {
            endPoint = new BABYLON.Vector3(targetNode.x, 0.05, targetNode.z);
            isSnapped = true;
            targetId = ctx.hoveredNodeId.value;
          }
        } else {
          const reticle = ctx.getEndpointReticle();
          if (reticle) {
            endPoint = reticle.position.clone();
          }
        }
        if (endPoint) {
          ctx.updateEdgeCreationPreview(scene, startPoint, endPoint, isSnapped, targetId);
        }
      }
    }
  );

  function syncNodeDragBehaviors() {
    const canDrag = (ctx.currentAppMode.value === 'edit' && ctx.currentEditorTool.value === 'select');
    ctx.nodeMeshesMap.forEach((pad) => {
      const dragBehavior = pad.behaviors.find(b => b.name === 'PointerDrag') as BABYLON.PointerDragBehavior | undefined;
      if (dragBehavior) {
        dragBehavior.enabled = canDrag;
      }
    });
  }

  // 10. Watch App Mode & Editor Tool change
  watch(
    [() => ctx.currentAppMode.value, () => ctx.currentEditorTool.value],
    ([mode, tool]) => {
      syncNodeDragBehaviors();
      ctx.updateVehiclesEditModeState(mode === 'edit');
      const gm = ctx.getGizmoManager();
      if (!gm) return;
      ctx.cancelEdgeConnection();

      if (mode === 'edit') {
        gm.attachToMesh(null);
        if (tool === 'select') {
          gm.positionGizmoEnabled = true;
          gm.rotationGizmoEnabled = true;
        } else {
          gm.positionGizmoEnabled = false;
          gm.rotationGizmoEnabled = false;
        }
      } else {
        gm.attachToMesh(null);
        gm.positionGizmoEnabled = false;
        gm.rotationGizmoEnabled = false;
      }

      if (mode !== 'edit' || tool !== 'add_node') {
        ctx.hideGhostPlacementPad();
      }
      if (mode !== 'edit' || tool !== 'select') {
        ctx.clearNodeSelection();
      }
    }
  );
}
