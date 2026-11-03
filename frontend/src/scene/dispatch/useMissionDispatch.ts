import { ref, type Ref } from 'vue';
import * as BABYLON from '@babylonjs/core';
import type { AppMode, DispatchAction, FactoryLayout, LayoutNode } from '../../types';
import { isCargoNode, isChargingNode, getActionLabel } from '../layout/nodeUtils';

export interface MissionDispatchContext {
  factoryLayout: FactoryLayout;
  quickDispatchSteps: Ref<Array<{ node_id: string; action: DispatchAction }>>;
  currentAgvStartNode: Ref<string | null>;
  is3DQuickDispatchActive: Ref<boolean>;
  currentAppMode: Ref<AppMode>;
  selectedVehicleId: Ref<string>;
  agvHaloMesh: BABYLON.Mesh | null;
  fleetVehicles: Record<string, any>;
  agvState: any;
  getScene: () => BABYLON.Scene | null;
  getNodeObj: (nodeId: string) => LayoutNode | undefined;
  cancelOrder: (vehId: string, reason: string) => void;
  sendDispatchOrder: (steps: any[], action?: any, vehId?: string) => boolean;
  notify: (msg: string, type?: 'info' | 'warn' | 'success') => void;
}

export function useMissionDispatch(ctx: MissionDispatchContext) {
  const activeStepIndex = ref<number | null>(null);
  let quickDispatchPreviewLine: BABYLON.LinesMesh | null = null;

  function handleCancelCurrentMission() {
    const currentVehId = ctx.selectedVehicleId.value || 'AGV-001';
    ctx.cancelOrder(currentVehId, '使用者手動終止任務');
    ctx.notify(`已發送終止指令至 ${currentVehId}`, 'warn');
  }

  function updateQuickDispatchPreviewLine(sc: BABYLON.Scene) {
    if (quickDispatchPreviewLine) {
      quickDispatchPreviewLine.dispose();
      quickDispatchPreviewLine = null;
    }
    if (!ctx.is3DQuickDispatchActive.value || ctx.currentAppMode.value !== 'simulate') return;

    const startNode = ctx.factoryLayout.nodes.find(n => n.id === ctx.currentAgvStartNode.value);
    if (!startNode) return;

    const points: BABYLON.Vector3[] = [
      new BABYLON.Vector3(startNode.x, 0.06, startNode.z)
    ];

    for (const step of ctx.quickDispatchSteps.value) {
      const n = ctx.factoryLayout.nodes.find(node => node.id === step.node_id);
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

  function addNewDispatchStep() {
    const currentCount = ctx.quickDispatchSteps.value.length;
    const lastNodeId = currentCount > 0 ? ctx.quickDispatchSteps.value[currentCount - 1].node_id : ctx.currentAgvStartNode.value;
    const candidate = ctx.factoryLayout.nodes.find(n => n.id !== lastNodeId) || ctx.factoryLayout.nodes[0];
    const nextNodeId = candidate ? candidate.id : 'Node-02';
    
    ctx.quickDispatchSteps.value.push({
      node_id: nextNodeId,
      action: 'none'
    });
    activeStepIndex.value = ctx.quickDispatchSteps.value.length - 1;
    const sc = ctx.getScene();
    if (sc) updateQuickDispatchPreviewLine(sc);
  }

  function removeDispatchStep(index: number) {
    if (ctx.quickDispatchSteps.value.length <= 1) return;
    ctx.quickDispatchSteps.value.splice(index, 1);
    if (activeStepIndex.value !== null) {
      if (activeStepIndex.value >= ctx.quickDispatchSteps.value.length) {
        activeStepIndex.value = ctx.quickDispatchSteps.value.length - 1;
      }
    }
    const sc = ctx.getScene();
    if (sc) updateQuickDispatchPreviewLine(sc);
  }

  function setStepAction(index: number, action: DispatchAction) {
    const step = ctx.quickDispatchSteps.value[index];
    if (!step) return;
    const node = ctx.getNodeObj(step.node_id);
    const nodeFunc = node?.function;
    
    // Restriction: Only charging station can charge!
    if (action === 'charge' && !isChargingNode(step.node_id, ctx.factoryLayout.nodes)) {
      ctx.notify(`站點 ${step.node_id} (${nodeFunc || '未知'}) 非充電樁，無法指派充電任務`, 'warn');
      return;
    }
    
    // Restriction: Only Cargo stations can pick or drop!
    if ((action === 'pick' || action === 'drop') && !isCargoNode(step.node_id, ctx.factoryLayout.nodes)) {
      ctx.notify(`站點 ${step.node_id} 非貨物站，無法指派取放貨任務`, 'warn');
      return;
    }
    
    step.action = action;
  }

  function onStepNodeChange(index: number) {
    const step = ctx.quickDispatchSteps.value[index];
    if (!step) return;
    
    // Auto-correct incompatible actions when target node changes
    if (step.action === 'charge' && !isChargingNode(step.node_id, ctx.factoryLayout.nodes)) {
      step.action = 'none';
      ctx.notify(`站點 ${step.node_id} 非充電樁，已自動變更為純移動`, 'info');
    } else if ((step.action === 'pick' || step.action === 'drop') && !isCargoNode(step.node_id, ctx.factoryLayout.nodes)) {
      step.action = 'none';
      ctx.notify(`站點 ${step.node_id} 非貨物站，已自動變更為純移動`, 'info');
    }
    
    const sc = ctx.getScene();
    if (sc) updateQuickDispatchPreviewLine(sc);
  }

  function resetDispatchSteps() {
    const defaultTarget = ctx.factoryLayout.nodes.find(n => n.id !== ctx.currentAgvStartNode.value)?.id || 'Node-03';
    ctx.quickDispatchSteps.value = [
      { node_id: defaultTarget, action: 'none' }
    ];
    activeStepIndex.value = 0;
    const sc = ctx.getScene();
    if (sc) updateQuickDispatchPreviewLine(sc);
  }

  function addOrSelectNodeFromMap(nodeId: string) {
    if (ctx.quickDispatchSteps.value.length === 0) {
      ctx.quickDispatchSteps.value.push({ node_id: nodeId, action: 'none' });
      activeStepIndex.value = 0;
    } else if (activeStepIndex.value !== null && ctx.quickDispatchSteps.value[activeStepIndex.value]) {
      const step = ctx.quickDispatchSteps.value[activeStepIndex.value];
      step.node_id = nodeId;
      if (step.action === 'charge' && !isChargingNode(nodeId, ctx.factoryLayout.nodes)) {
        step.action = 'none';
      } else if ((step.action === 'pick' || step.action === 'drop') && !isCargoNode(nodeId, ctx.factoryLayout.nodes)) {
        step.action = 'none';
      }
    } else {
      const lastStep = ctx.quickDispatchSteps.value[ctx.quickDispatchSteps.value.length - 1];
      if (lastStep.node_id !== nodeId) {
        ctx.quickDispatchSteps.value.push({ node_id: nodeId, action: 'none' });
        activeStepIndex.value = ctx.quickDispatchSteps.value.length - 1;
      }
    }
    const sc = ctx.getScene();
    if (sc) updateQuickDispatchPreviewLine(sc);
  }

  function closeQuickDispatch() {
    ctx.is3DQuickDispatchActive.value = false;
    ctx.quickDispatchSteps.value = [];
    if (ctx.agvHaloMesh) ctx.agvHaloMesh.isVisible = false;
    if (quickDispatchPreviewLine) {
      quickDispatchPreviewLine.dispose();
      quickDispatchPreviewLine = null;
    }
  }

  function handleQuickDispatchLaunch() {
    if (ctx.quickDispatchSteps.value.length === 0) {
      ctx.notify('請至少加入一個目標站點！', 'warn');
      return;
    }

    if (ctx.quickDispatchSteps.value.length === 1 && ctx.quickDispatchSteps.value[0].node_id === ctx.currentAgvStartNode.value) {
      ctx.notify(`車輛目前已在站點 ${ctx.currentAgvStartNode.value}，請選擇其他目標站點！`, 'warn');
      return;
    }

    // Real-world validation: Check charging station and cargo pick/drop rules (auto-sanitize to pure travel)
    const currentVeh = ctx.fleetVehicles[ctx.selectedVehicleId.value] || (ctx.selectedVehicleId.value === ctx.agvState.agv_id ? ctx.agvState : null);
    let simulatedAgvHasCargo = !!currentVeh?.task_info?.has_cargo;

    for (let i = 0; i < ctx.quickDispatchSteps.value.length; i++) {
      const s = ctx.quickDispatchSteps.value[i];
      const nodeObj = ctx.factoryLayout.nodes.find(n => n.id === s.node_id);

      if (s.action === 'charge' && !isChargingNode(s.node_id, ctx.factoryLayout.nodes)) {
        s.action = 'none';
        ctx.notify(`第 ${i + 1} 站 (${s.node_id}) 非充電樁，已自動變更為純移動`, 'info');
      } else if ((s.action === 'pick' || s.action === 'drop') && !isCargoNode(s.node_id, ctx.factoryLayout.nodes)) {
        s.action = 'none';
        ctx.notify(`第 ${i + 1} 站 (${s.node_id}) 非貨物站，已自動變更為純移動`, 'info');
      } else if (s.action === 'pick') {
        if (simulatedAgvHasCargo) {
          s.action = 'none';
          ctx.notify(`⚠️ 車輛 ${ctx.selectedVehicleId.value} 已載貨，第 ${i + 1} 站自動轉為純移動`, 'info');
        } else if (nodeObj && !nodeObj.has_cargo) {
          s.action = 'none';
          ctx.notify(`⚠️ 第 ${i + 1} 站 (${s.node_id}) 棧板無貨物，已轉為純移動`, 'info');
        } else {
          simulatedAgvHasCargo = true;
        }
      } else if (s.action === 'drop') {
        if (!simulatedAgvHasCargo) {
          s.action = 'none';
          ctx.notify(`⚠️ 車輛 ${ctx.selectedVehicleId.value} 目前空載，第 ${i + 1} 站自動轉為純移動`, 'info');
        } else if (nodeObj && nodeObj.has_cargo) {
          s.action = 'none';
          ctx.notify(`⚠️ 第 ${i + 1} 站 (${s.node_id}) 棧板已有貨，已轉為純移動`, 'info');
        } else {
          simulatedAgvHasCargo = false;
        }
      }
    }

    const ok = ctx.sendDispatchOrder(ctx.quickDispatchSteps.value, 'none', ctx.selectedVehicleId.value);
    if (ok) {
      const summary = ctx.quickDispatchSteps.value.map(s => `${s.node_id}(${getActionLabel(s.action)})`).join(' ➔ ');
      ctx.notify(`已成功派遣任務！動線: ${summary}`, 'success');
      closeQuickDispatch();
    } else {
      ctx.notify('派發任務失敗，請檢查 WebSocket 後端連線', 'warn');
    }
  }

  return {
    activeStepIndex,
    getPreviewLine: () => quickDispatchPreviewLine,
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
  };
}
