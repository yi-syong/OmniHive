<template>
  <div class="mission-dispatch-panel">
    <div class="mission-panel-header">
      <div class="mission-panel-title-wrap">
        <span class="mission-badge-dot"></span>
        <div class="mission-titles">
          <span class="mission-panel-title">{{ selectedVehicleId }} 任務派遣</span>
          <span class="mission-panel-sub">
            [{{ currentSelectedVehicleState?.task_info?.status || 'IDLE' }} · 電量 {{ (currentSelectedVehicleState?.battery?.level || 0).toFixed(0) }}%]
          </span>
        </div>
      </div>
      <div class="mission-header-btn-group">
        <button class="mission-panel-min-btn" @click="$emit('minimize')" title="最小化面板 (釋放地圖視野)">
          <Minimize2 :size="13" />
        </button>
        <button class="mission-panel-close" @click="$emit('close')" title="關閉任務派遣">
          <X :size="15" />
        </button>
      </div>
    </div>

    <div class="mission-panel-body custom-scrollbar">
      <!-- Deadlock / Traffic Wait Live Warning Box -->
      <div v-if="currentSelectedVehicleState?.task_info?.is_traffic_wait" class="mission-deadlock-alert">
        <div class="alert-icon-box">
          <AlertTriangle :size="16" class="text-amber" />
        </div>
        <div class="alert-text-content">
          <div class="alert-title">
            交管停等中 (已等待 {{ (currentSelectedVehicleState?.task_info?.wait_seconds || 0).toFixed(0) }} 秒)
          </div>
          <div class="alert-desc">
            {{ currentSelectedVehicleState?.task_info?.display_message || '等待前方路權釋放中...' }}
          </div>
        </div>
        <button 
          type="button" 
          class="btn-alert-abort" 
          @click="$emit('cancel-current-mission')"
          title="強制中止任務並釋放路權"
        >
          強制中止
        </button>
      </div>

      <!-- Starting Position Summary -->
      <div class="mission-start-badge">
        <Flag :size="14" class="text-emerald shrink-0" />
        <div class="start-text">
          <span class="start-lbl">起點站點</span>
          <span class="start-val">{{ currentAgvStartNode }} ({{ getNodeNameOnly(currentAgvStartNode, nodes) }})</span>
        </div>
      </div>

      <!-- Multi-Step Waypoints List -->
      <div class="mission-steps-section">
        <div class="steps-section-header">
          <span class="steps-header-title">行駛與作業站點序列</span>
          <span class="steps-count-badge">{{ quickDispatchSteps.length }} 站</span>
        </div>
        
        <div class="mission-step-list">
          <MissionStepCard
            v-for="(step, idx) in quickDispatchSteps" 
            :key="idx"
            :step="step"
            :index="idx"
            :is-last="idx === quickDispatchSteps.length - 1"
            :is-active="activeStepIndex === idx"
            :can-delete="quickDispatchSteps.length > 1"
            :nodes="nodes"
            :fleet-vehicles="fleetVehicles"
            :selected-vehicle-id="selectedVehicleId"
            @click="$emit('update:activeStepIndex', idx)"
            @change-node="$emit('step-node-change', idx, $event)"
            @toggle-cargo="$emit('toggle-cargo', $event)"
            @remove="$emit('remove-step', idx)"
            @set-action="$emit('set-step-action', idx, $event)"
          />
        </div>

        <!-- Add Step Button & Direct Click Hint -->
        <div class="steps-toolbar">
          <button class="btn-add-step" @click="$emit('add-step')">
            <Plus :size="14" />
            <span>加入下一站點</span>
          </button>
          <button 
            v-if="quickDispatchSteps.length > 1" 
            class="btn-reset-steps" 
            @click="$emit('reset-steps')"
            title="重設為單一目標"
          >
            重設
          </button>
        </div>
        <div class="steps-map-hint">
          <span>💡 提示：點擊 3D 地圖站點即可快速加入路徑；點擊站點亦會顯示其名稱與用途。</span>
        </div>
      </div>
    </div>

    <!-- Launch & Abort Footer (步驟 ④: 派工確認摘要) -->
    <div class="mission-panel-footer">
      <div v-if="!isCurrentVehicleBusy && quickDispatchSteps.length > 0" class="mission-preflight-card">
        <div class="preflight-head">
          <span class="preflight-badge">步驟 ④</span>
          <span class="preflight-title">任務確認摘要</span>
        </div>
        <div class="preflight-body">
          <div class="preflight-route">
            <span class="p-start">{{ currentAgvStartNode }}</span>
            <span class="p-arrow">➔</span>
            <span class="p-dest">{{ quickDispatchSteps.map(s => s.node_id).join(' ➔ ') }}</span>
          </div>
          <div class="preflight-meta">
            <span class="p-action">動作: {{ quickDispatchSteps.map(s => getStepActionDesc(s.action)).join(', ') }}</span>
          </div>
        </div>
      </div>

      <button 
        v-if="isCurrentVehicleBusy"
        type="button"
        class="btn-mission-abort"
        @click="$emit('cancel-current-mission')"
        title="立即中止進行中的任務並解除路權停等"
      >
        <XCircle :size="15" />
        <span>中止任務 / 解除卡死 (Abort)</span>
      </button>
      <button 
        v-else
        class="btn-mission-launch"
        :disabled="quickDispatchSteps.length === 0"
        @click="$emit('launch')"
      >
        <Send :size="15" />
        <span>立即執行任務 ({{ quickDispatchSteps.length }} 站)</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Minimize2,
  X,
  AlertTriangle,
  Flag,
  Plus,
  Send,
  XCircle
} from 'lucide-vue-next';
import type { LayoutNode, DispatchAction } from '../../../../types';
import { getNodeNameOnly, getStepActionDesc } from '../../../../scene/layout/nodeUtils';
import MissionStepCard from './MissionStepCard.vue';

defineProps<{
  selectedVehicleId: string | null;
  currentSelectedVehicleState: any;
  currentAgvStartNode: string;
  quickDispatchSteps: Array<{ node_id: string; action: DispatchAction }>;
  activeStepIndex: number | null;
  nodes: LayoutNode[];
  fleetVehicles: Record<string, any>;
  isCurrentVehicleBusy: boolean;
}>();

defineEmits<{
  (e: 'minimize'): void;
  (e: 'close'): void;
  (e: 'cancel-current-mission'): void;
  (e: 'update:activeStepIndex', idx: number | null): void;
  (e: 'step-node-change', idx: number, nodeId: string): void;
  (e: 'toggle-cargo', node: LayoutNode): void;
  (e: 'remove-step', idx: number): void;
  (e: 'set-step-action', idx: number, action: DispatchAction): void;
  (e: 'add-step'): void;
  (e: 'reset-steps'): void;
  (e: 'launch'): void;
}>();
</script>

<style src="./missionPanel.css"></style>
