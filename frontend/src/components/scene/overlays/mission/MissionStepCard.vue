<template>
  <div 
    class="mission-step-card"
    :class="{ 'step-active': isActive }"
    @click="$emit('click')"
  >
    <div class="step-card-top">
      <div class="step-index-badge">
        <Target v-if="isLast" :size="12" class="text-cyan inline-icon" />
        <span>第 {{ index + 1 }} 站{{ isLast ? ' (終點)' : '' }}</span>
      </div>
      <div class="step-node-select-wrap">
        <select 
          :value="step.node_id" 
          class="step-node-select"
          @change="$emit('change-node', ($event.target as HTMLSelectElement).value)"
        >
          <option 
            v-for="n in nodes" 
            :key="n.id" 
            :value="n.id"
          >
            {{ n.id }} - {{ n.name }} ({{ getNodeFunctionLabel(n.function) }}){{ getNodeOccupantLabel(n.id, fleetVehicles, selectedVehicleId) }}
          </option>
        </select>
      </div>

      <!-- Quick station cargo state toggle pill -->
      <button 
        v-if="isCargoNode(step.node_id, nodes)"
        type="button"
        class="step-cargo-toggle" 
        :class="{ 'has-cargo': getNodeObj(step.node_id, nodes)?.has_cargo }"
        @click.stop="getNodeObj(step.node_id, nodes) && $emit('toggle-cargo', getNodeObj(step.node_id, nodes)!)"
        :title="getNodeObj(step.node_id, nodes)?.has_cargo ? '點擊設為無貨' : '點擊設為有貨'"
      >
        <PackageMinus v-if="getNodeObj(step.node_id, nodes)?.has_cargo" :size="11" />
        <PackagePlus v-else :size="11" />
        <span>{{ getNodeObj(step.node_id, nodes)?.has_cargo ? '有貨' : '無貨' }}</span>
      </button>

      <button 
        v-if="canDelete" 
        class="step-delete-btn" 
        @click.stop="$emit('remove')"
        title="移除此站點"
      >
        <Trash2 :size="13" />
      </button>
    </div>

    <!-- Action Selector for this Step -->
    <div class="step-actions-row">
      <span class="step-action-lbl">抵達動作:</span>
      <div class="step-action-buttons">
        <button 
          type="button"
          :class="['step-act-btn', { active: step.action === 'none' }]"
          @click.stop="$emit('set-action', 'none')"
          title="純移動：抵達後不停留直接完成任務或往下一站"
        >
          <Shuffle :size="12" />
          <span>純移動</span>
        </button>
        <button 
          type="button"
          :class="['step-act-btn', 'act-wait', { active: step.action === 'wait' }]"
          @click.stop="$emit('set-action', 'wait')"
          title="原地等待：抵達站點後原地停留 3 秒作動計時，完成才結束"
        >
          <Clock :size="12" />
          <span>等待</span>
        </button>
        <button 
          type="button"
          :class="['step-act-btn', 'act-pick', { active: step.action === 'pick' }]"
          :disabled="!isCargoNode(step.node_id, nodes)"
          @click.stop="$emit('set-action', 'pick')"
          :title="isCargoNode(step.node_id, nodes) ? '取貨' : '⚠️ 非貨物站點，無法取貨'"
        >
          <PackagePlus :size="12" />
          <span>取貨</span>
        </button>
        <button 
          type="button"
          :class="['step-act-btn', 'act-drop', { active: step.action === 'drop' }]"
          :disabled="!isCargoNode(step.node_id, nodes)"
          @click.stop="$emit('set-action', 'drop')"
          :title="isCargoNode(step.node_id, nodes) ? '放貨' : '⚠️ 非貨物站點，無法放貨'"
        >
          <PackageMinus :size="12" />
          <span>放貨</span>
        </button>
        <!-- Charge restricted to charging stations only! -->
        <button 
          type="button"
          :class="['step-act-btn', 'act-charge', { active: step.action === 'charge' }]"
          :disabled="!isChargingNode(step.node_id, nodes)"
          @click.stop="$emit('set-action', 'charge')"
          :title="isChargingNode(step.node_id, nodes) ? '充電' : '⚠️ 非充電樁，無法充電'"
        >
          <BatteryCharging :size="12" />
          <span>充電</span>
        </button>
      </div>
    </div>

    <!-- Occupancy Warning -->
    <div v-if="isNodeOccupiedByOther(step.node_id, fleetVehicles, selectedVehicleId)" class="step-warning-text step-warning-occupied">
      ⚠️ 站點目前停靠車輛 {{ getOtherOccupantId(step.node_id, fleetVehicles, selectedVehicleId) }}，派送可能導致交管等待！
    </div>
    <div v-if="step.action === 'charge' && !isChargingNode(step.node_id, nodes)" class="step-warning-text">
      ⚠️ 此站非充電樁，無法充電
    </div>
    <div v-else-if="(step.action === 'pick' || step.action === 'drop') && !isCargoNode(step.node_id, nodes)" class="step-warning-text">
      ⚠️ 此站非貨物站，無法取放貨
    </div>
    <div v-else-if="step.action === 'pick' && isCargoNode(step.node_id, nodes) && !getNodeObj(step.node_id, nodes)?.has_cargo" class="step-warning-text">
      ⚠️ 站點無貨，無法取貨（可按右鍵設為有貨）
    </div>
    <div v-else-if="step.action === 'drop' && isCargoNode(step.node_id, nodes) && getNodeObj(step.node_id, nodes)?.has_cargo" class="step-warning-text">
      ⚠️ 站點已有貨，無法放貨（可按右鍵設為無貨）
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Target,
  Trash2,
  PackagePlus,
  PackageMinus,
  Shuffle,
  Clock,
  BatteryCharging
} from 'lucide-vue-next';
import type { LayoutNode, DispatchAction } from '../../../../types';
import {
  isCargoNode,
  isChargingNode,
  getNodeObj,
  getNodeFunctionLabel,
  isNodeOccupiedByOther,
  getOtherOccupantId,
  getNodeOccupantLabel
} from '../../../../scene/layout/nodeUtils';

defineProps<{
  step: { node_id: string; action: DispatchAction };
  index: number;
  isLast: boolean;
  isActive: boolean;
  canDelete: boolean;
  nodes: LayoutNode[];
  fleetVehicles: Record<string, any>;
  selectedVehicleId: string | null;
}>();

defineEmits<{
  (e: 'click'): void;
  (e: 'change-node', nodeId: string): void;
  (e: 'toggle-cargo', node: LayoutNode): void;
  (e: 'remove'): void;
  (e: 'set-action', action: DispatchAction): void;
}>();
</script>

<style scoped>
.mission-step-card {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.mission-step-card:hover {
  background: rgba(51, 65, 85, 0.7);
  border-color: rgba(56, 189, 248, 0.3);
}

.mission-step-card.step-active {
  border-color: rgba(56, 189, 248, 0.7);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
  background: rgba(15, 23, 42, 0.95);
}

.step-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-index-badge {
  font-size: 11px;
  font-weight: 700;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  padding: 2px 6px;
  border-radius: 6px;
  white-space: nowrap;
}

.step-node-select-wrap {
  flex: 1;
}

.step-node-select {
  width: 100%;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 11.5px;
  padding: 4px 6px;
  outline: none;
  cursor: pointer;
}

.step-node-select:focus {
  border-color: #38bdf8;
}

.step-cargo-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #f59e0b;
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.step-cargo-toggle:hover {
  background: rgba(245, 158, 11, 0.2);
}

.step-cargo-toggle.has-cargo {
  border-color: rgba(16, 185, 129, 0.5);
  color: #10b981;
}

.step-delete-btn {
  background: transparent;
  border: none;
  color: #ef4444;
  opacity: 0.7;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-delete-btn:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.15);
}

.step-actions-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.step-action-lbl {
  font-size: 10px;
  color: #94a3b8;
}

.step-action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.step-act-btn {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.step-act-btn:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.8);
  color: #ffffff;
}

.step-act-btn.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
  font-weight: 600;
}

.step-act-btn.act-wait.active {
  background: rgba(251, 191, 36, 0.2);
  border-color: #fbbf24;
  color: #fbbf24;
}

.step-act-btn.act-pick.active {
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
  color: #fbbf24;
}

.step-act-btn.act-drop.active {
  background: rgba(16, 185, 129, 0.2);
  border-color: #10b981;
  color: #34d399;
}

.step-act-btn.act-charge.active {
  background: rgba(168, 85, 247, 0.2);
  border-color: #a855f7;
  color: #c084fc;
}

.step-act-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-style: dashed;
}

.step-warning-text {
  font-size: 10px;
  color: #f59e0b;
  margin-top: 1px;
}

.inline-icon {
  margin-right: 2px;
  vertical-align: -1px;
}
</style>
