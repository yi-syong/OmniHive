<template>
  <header class="top-nav">
    <!-- Left: Brand & Execution Controls -->
    <div class="nav-left">
      <div class="brand">
        <div class="brand-logo">
          <Bot :size="19" class="brand-svg text-cyan" />
        </div>
        <div class="brand-text">
          <div class="brand-title-row">
            <h1 class="brand-title">OmniHive 智慧工廠</h1>
            <span class="version-tag">VDA 5050</span>
          </div>
        </div>
      </div>

      <!-- Group 2: 執行控制 (倍率 + 交管策略) -->
      <div v-if="currentAppMode === 'simulate'" class="nav-controls-group">
        <!-- 全域模擬倍率控制 -->
        <div class="sim-speed-control" title="調整車輛行駛與物理模擬步長倍率">
          <div class="speed-label-group">
            <Zap :size="12" class="text-amber" />
            <span class="speed-label">倍率</span>
          </div>
          <div class="speed-btns">
            <button 
              v-for="s in [1, 2, 5, 10]" 
              :key="s"
              :class="['speed-pill', { active: currentTimeScale === s }]"
              @click="setTimeScale(s)"
            >
              {{ s }}×
            </button>
          </div>
        </div>

        <!-- VDA 5050 車隊交管策略切換 (等待優先 / 動態繞路) -->
        <div class="sim-speed-control strategy-toggle-control" title="VDA 5050 車隊交管演算法：切換等待或動態繞路">
          <div class="speed-label-group">
            <GitFork :size="12" class="text-cyan" />
            <span class="speed-label text-cyan">交管</span>
          </div>
          <div class="speed-btns">
            <button 
              :class="['speed-pill', 'strat-pill', { active: trafficMetrics.strategy_name === 'wait' }]"
              @click="setTrafficStrategy('wait')"
              title="死等淨空：前方節點未釋放立即原地煞停，絕對安全零繞路"
            >
              等待優先
            </button>
            <button 
              :class="['speed-pill', 'strat-pill', { active: trafficMetrics.strategy_name === 'reroute' }]"
              @click="setTrafficStrategy('reroute')"
              title="動態繞路：停等逾時自動 A* 避障尋求替代路線，提升全廠吞吐量"
            >
              動態繞路
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Center: 模擬監控 與 編輯地圖 置中模式切換 -->
    <div class="nav-center">
      <div class="mode-switcher" role="tablist" aria-label="系統運作模式">
        <button 
          :class="['mode-tab', { active: currentAppMode === 'simulate' }]"
          @click="$emit('switch-mode', 'simulate')"
          role="tab"
          :aria-selected="currentAppMode === 'simulate'"
        >
          <Play :size="13" />
          <span>模擬監控</span>
        </button>
        <button 
          :class="['mode-tab', 'edit-tab', { active: currentAppMode === 'edit' }]"
          @click="$emit('switch-mode', 'edit')"
          role="tab"
          :aria-selected="currentAppMode === 'edit'"
        >
          <PencilRuler :size="13" />
          <span>編輯地圖</span>
        </button>
      </div>
    </div>

    <!-- Right: 系統狀態 & 獨立高風險操作分組 -->
    <div class="nav-right">
      <!-- Dirty State Indicator -->
      <div v-if="hasUnsavedChanges" class="tech-badge dirty-badge" title="地圖有未儲存變更，切換至模擬前請先儲存">
        <AlertTriangle :size="13" class="badge-icon text-amber" />
        <span class="badge-text">未儲存變更</span>
      </div>

      <!-- 狀態與監控群組 -->
      <div class="nav-status-group">
        <!-- Connection Indicator -->
        <div :class="['conn-indicator', isConnected ? 'online' : 'offline']" :title="isConnected ? '後端連線正常' : '嘗試連線中'">
          <span class="pulse-indicator"></span>
          <span class="conn-text">{{ isConnected ? '連線正常' : '斷線' }}</span>
        </div>

        <!-- 功能 1 切換按鈕: 車況儀表板 (僅在模擬監控模式顯示) -->
        <button 
          v-if="currentAppMode === 'simulate'"
          :class="['hud-nav-btn', { active: showDashboard }]" 
          @click="$emit('update:showDashboard', !showDashboard)"
          title="開啟/收合車況儀表板"
        >
          <Activity :size="14" />
          <span class="btn-text">車況面板</span>
        </button>
      </div>

      <!-- 獨立高風險危險操作分組 (需二次確認) -->
      <div v-if="currentAppMode === 'simulate'" class="nav-danger-group">
        <button 
          class="hud-nav-btn emergency-btn"
          @click="$emit('open-deadlock')"
          title="緊急解除全場路權死鎖與卡死任務 (點擊後進行二次確認)"
        >
          <ShieldAlert :size="14" class="text-rose" />
          <span class="btn-text">解卡死</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { 
  Bot, 
  Activity, 
  Zap, 
  Play, 
  PencilRuler, 
  AlertTriangle, 
  ShieldAlert, 
  GitFork 
} from 'lucide-vue-next';
import { 
  isConnected, 
  currentAppMode, 
  currentTimeScale, 
  setTimeScale, 
  hasUnsavedChanges, 
  trafficMetrics, 
  setTrafficStrategy 
} from '../../services/websocket';

defineProps<{
  showDashboard: boolean;
}>();

defineEmits<{
  (e: 'update:showDashboard', val: boolean): void;
  (e: 'switch-mode', mode: 'simulate' | 'edit'): void;
  (e: 'open-deadlock'): void;
}>();
</script>
