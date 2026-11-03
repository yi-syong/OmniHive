import * as BABYLON from '@babylonjs/core';
import type { Ref } from 'vue';
import type { VehicleVisual } from './types';
import type { FactoryLayout } from '../types';

export interface RenderLoopContext {
  getScene: () => BABYLON.Scene | null;
  getCamera: () => BABYLON.ArcRotateCamera | null;
  vehicleVisuals: Map<string, VehicleVisual>;
  fleetVehicles: Record<string, any>;
  agvState: any;
  factoryLayout: FactoryLayout;
  selectedVehicleId: Ref<string>;
  currentView: Ref<'iso' | 'top' | 'follow'>;
  updateVehicleOverheadBadge: (sc: BABYLON.Scene, visual: VehicleVisual, vData: any) => void;
  getAgvRoot: () => BABYLON.TransformNode | null;
  currentPos: BABYLON.Vector3;
}

export function startRenderLoop(
  engine: BABYLON.Engine,
  ctx: RenderLoopContext
) {
  engine.runRenderLoop(() => {
    const scene = ctx.getScene();
    if (!scene) return;

    const camera = ctx.getCamera();
    const selVehId = ctx.selectedVehicleId.value;

    for (const v of ctx.vehicleVisuals.values()) {
      v.currentPos = BABYLON.Vector3.Lerp(v.currentPos, v.targetPos, 0.18);

      let diff = v.targetTheta - v.currentTheta;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      v.currentTheta += diff * 0.18;

      v.root.position.copyFrom(v.currentPos);
      v.root.rotation.y = v.currentTheta;

      if (v.activeTrajectoryMesh && !v.activeTrajectoryMesh.isDisposed()) {
        const vData = ctx.fleetVehicles[v.id] || (v.id === 'AGV-001' ? ctx.agvState : null);
        if (vData && vData.node_states && vData.node_states.length > 0 && vData.task_info?.status === 'DRIVING') {
          const pts: BABYLON.Vector3[] = [];
          pts.push(new BABYLON.Vector3(v.currentPos.x, 0.05, v.currentPos.z));
          for (const nId of vData.node_states) {
            const node = ctx.factoryLayout.nodes.find(n => n.id === nId);
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

      if (ctx.currentView.value === 'follow' && camera && selVehId === v.id) {
        camera.target = BABYLON.Vector3.Lerp(camera.target, v.root.position, 0.1);
      }

      const vData = ctx.fleetVehicles[v.id] || (v.id === 'AGV-001' ? ctx.agvState : null);
      if (vData) {
        const isCharging = !!vData.battery?.charging || vData.task_info?.action === 'charge' || vData.task_info?.display_message?.includes('充電');
        if (isCharging) {
          ctx.updateVehicleOverheadBadge(scene, v, vData);
        }
      }
    }

    const agvRoot = ctx.getAgvRoot();
    if (agvRoot && ctx.vehicleVisuals.has('AGV-001')) {
      const v1 = ctx.vehicleVisuals.get('AGV-001')!;
      ctx.currentPos.copyFrom(v1.currentPos);
    }

    scene.render();
  });
}
