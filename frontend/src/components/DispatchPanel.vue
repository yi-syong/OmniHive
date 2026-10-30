<template>
  <div :class="['dispatch-container', { collapsed: isCollapsed, 'in-edit-mode': currentAppMode === 'edit' }]">
    <!-- Collapse Toggle Button -->
    <button 
      class="panel-collapse-btn" 
      @click="isCollapsed = !isCollapsed" 
      :title="isCollapsed ? '展開派發面板' : '收合派發面板'"
    >
      <ChevronRight v-if="isCollapsed" :size="16" />
      <ChevronLeft v-else :size="16" />
    </button>

    <div v-show="!isCollapsed" class="panel-content">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-icon-box">
          <Send :size="16" class="text-cyan" />
        </div>
        <div class="header-text">
          <h2 class="header-title">任務派發</h2>
          <span class="header-subtitle">VDA 5050 · AGV 控制</span>
        </div>
        <div :class="['status-chip', currentAppMode === 'edit' ? 'chip-edit-lock' : (isBusy ? 'chip-busy' : 'chip-ready')]">
          <span class="status-dot"></span>
          {{ currentAppMode === 'edit' ? '編輯鎖定' : (isBusy ? '執行中' : '可派發') }}
        </div>
      </div>

      <!-- Edit Mode Lock Banner -->
      <div v-if="currentAppMode === 'edit'" class="edit-lock-banner">
        <ShieldAlert :size="14" class="text-amber shrink-0" />
        <span>編輯模式中派發已鎖定，請先儲存場域配置。</span>
      </div>

      <!-- Dispatch Form Body -->
      <div v-else class="dispatch-body">
        <!-- Target Node Selection -->
        <div class="control-section">
          <div class="section-label">
            <Navigation :size="13" />
            <span>目標站點</span>
          </div>
          <select v-model="selectedNodeForDispatch" class="node-select">
            <option v-for="node in availableNodes" :key="node.id" :value="node.id">
              {{ node.id }} · {{ node.name }} ({{ getNodeRoleLabel(node.function) }})
            </option>
          </select>
        </div>

        <!-- Action Selection -->
        <div class="control-section">
          <div class="section-label">
            <Workflow :size="13" />
            <span>作業指令</span>
          </div>
          <div class="action-grid">
            <button
              v-for="act in actions"
              :key="act.value"
              :class="['action-btn', { active: selectedAction === act.value, disabled: isActionDisabled(act.value) }]"
              :disabled="isActionDisabled(act.value)"
              @click="!isActionDisabled(act.value) && (selectedAction = act.value)"
              :title="getActionTooltip(act.value)"
            >
              <component :is="act.icon" :size="13" />
              <span>{{ act.label }}</span>
            </button>
          </div>
        </div>

        <!-- Primary Dispatch Button / Abort Button -->
        <button 
          v-if="isBusy"
          class="primary-dispatch-btn btn-abort-busy" 
          @click="handleAbort"
          title="立即中止目前任務並解除停等"
        >
          <XCircle :size="15" />
          <span>🛑 中止任務 / 解除卡死</span>
        </button>
        <button 
          v-else
          class="primary-dispatch-btn" 
          :disabled="!isConnected"
          @click="handleDispatch"
        >
          <Send :size="15" />
          <span>發送派工訂單</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { 
  Send, 
  Navigation, 
  Workflow, 
  Package, 
  Truck, 
  Zap, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  ShieldAlert,
  XCircle 
} from 'lucide-vue-next';
import { 
  agvState, 
  isConnected, 
  sendDispatchOrder, 
  cancelOrder,
  selectedVehicleId,
  factoryLayout, 
  currentAppMode, 
  selectedNodeForDispatch 
} from '../services/websocket';
import type { DispatchAction } from '../types';

const isCollapsed = ref(false);
const selectedAction = ref<DispatchAction>('none');
const isBusy = computed(() => agvState.task_info?.status === 'DRIVING' || agvState.task_info?.status === 'ACTING' || !!agvState.task_info?.is_traffic_wait);

function handleAbort() {
  const vId = selectedVehicleId.value || 'AGV-001';
  cancelOrder(vId, '側邊控制面板中止任務');
}

const availableNodes = computed(() => {
  return factoryLayout.nodes || [];
});

function isChargingNode(nodeId: string): boolean {
  const node = availableNodes.value.find(n => n.id === nodeId);
  return !!node && (node.function === 'Idle/Charge' || node.function === 'Charge' || node.name.includes('充電'));
}

function isCargoNode(nodeId: string): boolean {
  const node = availableNodes.value.find(n => n.id === nodeId);
  return !!node && (node.function === 'Cargo' || node.function === 'Pick-up' || node.function === 'Drop-off');
}

function getNodeRoleLabel(func: string): string {
  switch (func) {
    case 'Idle/Charge':
    case 'Charge': return '充電站';
    case 'Transit': return '通道點';
    case 'Wait': return '等待點';
    case 'Cargo':
    case 'Pick-up':
    case 'Drop-off': return '貨物站';
    default: return func;
  }
}

const actions = [
  { value: 'none' as DispatchAction, label: '純移動', icon: Navigation },
  { value: 'wait' as DispatchAction, label: '等待', icon: Clock },
  { value: 'pick' as DispatchAction, label: '取貨', icon: Package },
  { value: 'drop' as DispatchAction, label: '放貨', icon: Truck },
  { value: 'charge' as DispatchAction, label: '充電', icon: Zap },
];

function isActionDisabled(act: DispatchAction): boolean {
  const targetId = selectedNodeForDispatch.value;
  if (!targetId) return false;
  if (act === 'charge') return !isChargingNode(targetId);
  if (act === 'pick' || act === 'drop') return !isCargoNode(targetId);
  return false;
}

function getActionTooltip(act: DispatchAction): string {
  const targetId = selectedNodeForDispatch.value;
  if (!targetId) return '';
  if (act === 'charge' && !isChargingNode(targetId)) return '⚠️ 此站非充電樁，無法充電';
  if ((act === 'pick' || act === 'drop') && !isCargoNode(targetId)) return '⚠️ 此站非貨物站，無法取放貨';
  if (act === 'none') return '純移動：抵達站點不停留直接完成';
  if (act === 'wait') return '原地等待：抵達站點後原地計時停留 3 秒';
  return '';
}

watch(selectedNodeForDispatch, (newNodeId) => {
  if (isActionDisabled(selectedAction.value)) {
    if (isCargoNode(newNodeId)) selectedAction.value = 'pick';
    else if (isChargingNode(newNodeId)) selectedAction.value = 'charge';
    else selectedAction.value = 'none';
  }
}, { immediate: true });

function handleDispatch() {
  if (currentAppMode.value === 'edit' || !isConnected.value || isBusy.value) return;
  sendDispatchOrder(selectedNodeForDispatch.value, selectedAction.value);
}
</script>

<style scoped>
.dispatch-container {
  position: absolute;
  top: 68px;
  left: 18px;
  width: 320px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(14, 165, 233, 0.1);
  z-index: 25;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.dispatch-container.collapsed {
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: 12px;
}

.panel-collapse-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  transition: all 0.15s ease;
}

.panel-collapse-btn:hover {
  background: rgba(51, 65, 85, 0.9);
  color: #f8fafc;
}

.dispatch-container.collapsed .panel-collapse-btn {
  top: 9px;
  right: 9px;
}

.panel-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon-box {
  width: 32px;
  height: 32px;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-text {
  flex: 1;
  min-width: 0;
}

.header-title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: #f8fafc;
}

.header-subtitle {
  font-size: 10px;
  color: #94a3b8;
}

.status-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 10.5px;
  font-weight: 600;
}

.chip-ready {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.chip-busy {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.chip-edit-lock {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.edit-lock-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 10px;
  color: #fbbf24;
  font-size: 11px;
  line-height: 1.4;
}

.dispatch-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}

.node-select {
  width: 100%;
  padding: 8px 10px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #f8fafc;
  font-size: 11.5px;
  outline: none;
  cursor: pointer;
}

.node-select:focus {
  border-color: #38bdf8;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 5px;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #94a3b8;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(.disabled) {
  background: rgba(51, 65, 85, 0.8);
  color: #f8fafc;
}

.action-btn.active {
  background: rgba(14, 165, 233, 0.2);
  border-color: rgba(56, 189, 248, 0.5);
  color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
}

.action-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(0.8);
}

.primary-dispatch-btn {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: linear-gradient(135deg, #0284c7, #0ea5e9);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
  transition: all 0.15s ease;
}

.primary-dispatch-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0369a1, #0284c7);
  transform: translateY(-1px);
}

.primary-dispatch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-abort-busy {
  background: linear-gradient(135deg, #dc2626, #ef4444) !important;
  box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4) !important;
}

.btn-abort-busy:hover {
  background: linear-gradient(135deg, #b91c1c, #dc2626) !important;
}
</style>
