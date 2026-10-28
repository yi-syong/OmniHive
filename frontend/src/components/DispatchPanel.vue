<template>
  <div :class="['dispatch-container', { collapsed: isCollapsed, 'in-edit-mode': currentAppMode === 'edit' }]">
    <!-- Collapse Toggle Button -->
    <button 
      class="panel-collapse-btn" 
      @click="isCollapsed = !isCollapsed" 
      :title="isCollapsed ? '展開派發面板' : '收合派發面板'"
      :aria-label="isCollapsed ? '展開派發面板' : '收合派發面板'"
    >
      <ChevronRight v-if="isCollapsed" :size="16" />
      <ChevronLeft v-else :size="16" />
    </button>

    <div v-show="!isCollapsed" class="panel-content">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-icon-box">
          <Send :size="18" class="text-cyan" />
        </div>
        <div class="header-text">
          <h2 class="header-title">任務派發中心</h2>
          <span class="header-subtitle">DISPATCH CONTROLLER · VDA 5050</span>
        </div>
        <div :class="['status-chip', currentAppMode === 'edit' ? 'chip-edit-lock' : (isBusy ? 'chip-busy' : 'chip-ready')]">
          <span class="status-dot"></span>
          {{ currentAppMode === 'edit' ? '編輯鎖定' : (isBusy ? '執行中' : '可派發') }}
        </div>
      </div>

      <!-- Problem 3 Solution: Edit Mode Lockout Warning Banner -->
      <div v-if="currentAppMode === 'edit'" class="edit-lock-banner">
        <div class="lock-head">
          <ShieldAlert :size="16" class="text-amber" />
          <span class="lock-title">場域編輯模式中 · 派發已鎖定</span>
        </div>
        <p class="lock-desc">
          為防止未儲存之路網導致 AGV 導航失敗與路徑計算錯誤，編輯期間暫停派發。
        </p>
        <div class="lock-hint-tag">
          <span>完成編輯後，請點選頂部工具列【儲存並開始模擬】</span>
        </div>
      </div>

      <!-- Active Content (Disabled/faded when in edit mode) -->
      <div :class="['dispatch-body', { 'disabled-dim': currentAppMode === 'edit' }]">
        
        <!-- Quick 3D Fleet Dispatch Banner in Left Panel -->
        <div v-if="currentAppMode === 'simulate'" class="panel-3d-hint-banner" @click="activate3DQuickDispatch">
          <Bot :size="16" class="text-cyan shrink-0" />
          <div class="hint-col">
            <span class="hint-main-text">3D 直覺派車中台已就緒</span>
            <span class="hint-sub-text">點擊此處或在 3D 場景直接點擊車輛與站點</span>
          </div>
          <ArrowRight :size="14" class="text-cyan shrink-0" />
        </div>
        
        <!-- Problem 1 Solution: Target Node Selector with Search & Filtering -->
        <div class="control-section">
          <div class="section-head-row">
            <label class="section-label">
              <Navigation :size="14" class="label-icon" />
              <span>目標導引節點 (Target Node)</span>
            </label>
            <div class="view-mode-toggle">
              <button 
                :class="['mode-btn', { active: viewMode === 'grid' }]" 
                @click="viewMode = 'grid'"
                title="卡片檢視"
              >
                <LayoutGrid :size="12" />
              </button>
              <button 
                :class="['mode-btn', { active: viewMode === 'list' }]" 
                @click="viewMode = 'list'"
                title="緊湊清單檢視"
              >
                <List :size="12" />
              </button>
            </div>
          </div>

          <!-- Quick Chips: Current / Recent Nodes -->
          <div class="quick-chips-row">
            <span class="chips-label">推薦:</span>
            <button 
              v-for="chip in quickChips" 
              :key="chip.id"
              :class="['chip-btn', { active: selectedNodeForDispatch === chip.id }]"
              @click="selectedNodeForDispatch = chip.id"
            >
              {{ chip.id }} ({{ chip.tag }})
            </button>
          </div>

          <!-- Search Input -->
          <div class="search-box">
            <Search :size="13" class="search-icon" />
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="搜尋節點 ID、名稱或功能..."
              class="search-input"
            />
            <button v-if="searchQuery" class="search-clear-btn" @click="searchQuery = ''">
              <X :size="12" />
            </button>
          </div>

          <!-- Category Filter Tabs -->
          <div class="category-tabs" role="tablist">
            <button 
              v-for="cat in categoryList" 
              :key="cat.key"
              :class="['cat-tab', { active: selectedCategory === cat.key }]"
              @click="selectedCategory = cat.key"
            >
              <span>{{ cat.label }}</span>
              <span class="cat-count">({{ cat.count }})</span>
            </button>
          </div>

          <!-- Filtered Node List / Grid Container -->
          <div :class="['node-container-scroll', viewMode === 'grid' ? 'node-grid' : 'node-list']">
            <template v-if="filteredNodes.length > 0">
              <button
                v-for="node in filteredNodes"
                :key="node.id"
                :class="['node-item', { active: selectedNodeForDispatch === node.id }, `node-${node.role}`]"
                @click="selectedNodeForDispatch = node.id"
                role="radio"
                :aria-checked="selectedNodeForDispatch === node.id"
              >
                <div class="node-id-tag" :style="{ borderLeftColor: node.accentColor }">
                  {{ node.id }}
                </div>
                <div class="node-details">
                  <div class="node-title-row">
                    <span class="node-title">{{ node.name }}</span>
                    <span class="node-role-badge" :style="{ color: node.accentColor }">{{ node.function }}</span>
                  </div>
                  <span class="node-coords">({{ node.x }}, {{ node.z }})</span>
                </div>
              </button>
            </template>
            <div v-else class="empty-nodes-hint">
              <Compass :size="18" class="text-dim" />
              <span>無相符節點，請嘗試其他關鍵字</span>
            </div>
          </div>
        </div>

        <!-- Action Selection -->
        <div class="control-section">
          <label class="section-label">
            <Workflow :size="14" class="label-icon" />
            <span>站點作業指令 (Station Action)</span>
          </label>
          <div class="action-grid" role="radiogroup" aria-label="作業指令">
            <button
              v-for="act in actions"
              :key="act.value"
              :class="['action-item', { active: selectedAction === act.value, disabled: isActionDisabled(act.value) }]"
              :disabled="isActionDisabled(act.value)"
              @click="!isActionDisabled(act.value) && (selectedAction = act.value)"
              role="radio"
              :aria-checked="selectedAction === act.value"
              :title="getActionTooltip(act.value)"
            >
              <component :is="act.iconComponent" :size="15" class="action-svg" />
              <span class="action-name">{{ act.label }}</span>
            </button>
          </div>
        </div>

        <!-- Primary Dispatch Button -->
        <button 
          class="primary-dispatch-btn" 
          :disabled="!isConnected || isBusy || currentAppMode === 'edit'"
          @click="handleDispatch"
        >
          <span class="btn-ripple"></span>
          <span class="btn-inner">
            <Send :size="16" />
            <span>
              {{ currentAppMode === 'edit' ? '編輯模式中禁止派發' : (isBusy ? 'AGV 任務執行中...' : '發送 VDA 5050 訂單') }}
            </span>
          </span>
        </button>

        <!-- Quick Presets -->
        <div class="quick-presets">
          <div class="presets-header">
            <Clock :size="13" class="text-muted" />
            <span class="presets-title">一鍵自動化情境 (Quick Presets)</span>
          </div>
          <div class="presets-list">
            <button 
              class="preset-item"
              :disabled="isBusy || !isConnected || currentAppMode === 'edit'"
              @click="runPreset('Node-03', 'pick')"
            >
              <Package :size="14" class="preset-icon text-amber" />
              <div class="preset-info">
                <span class="preset-name">標準取貨任務</span>
                <span class="preset-desc">前往 Node-03 · 裝載貨箱</span>
              </div>
              <ArrowRight :size="12" class="preset-arrow" />
            </button>

            <button 
              class="preset-item"
              :disabled="isBusy || !isConnected || currentAppMode === 'edit'"
              @click="runPreset('Node-04', 'drop')"
            >
              <Truck :size="14" class="preset-icon text-emerald" />
              <div class="preset-info">
                <span class="preset-name">標準卸貨任務</span>
                <span class="preset-desc">前往 Node-04 · 輸送帶入庫</span>
              </div>
              <ArrowRight :size="12" class="preset-arrow" />
            </button>

            <button 
              class="preset-item"
              :disabled="isBusy || !isConnected || currentAppMode === 'edit'"
              @click="runPreset('Node-01', 'charge')"
            >
              <Zap :size="14" class="preset-icon text-cyan" />
              <div class="preset-info">
                <span class="preset-name">返回充電樁</span>
                <span class="preset-desc">停靠 Node-01 · 補充電力</span>
              </div>
              <ArrowRight :size="12" class="preset-arrow" />
            </button>
          </div>
        </div>

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
  ArrowRight, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  X, 
  LayoutGrid, 
  List, 
  ShieldAlert, 
  Compass,
  Bot
} from 'lucide-vue-next';
import { 
  agvState, 
  isConnected, 
  sendDispatchOrder, 
  factoryLayout, 
  currentAppMode, 
  selectedNodeForDispatch,
  is3DQuickDispatchActive,
  quickDispatchStartNode,
  quickDispatchTargetNode,
  quickDispatchAction
} from '../services/websocket';

type ActionType = 'none' | 'wait' | 'pick' | 'drop' | 'charge';

const isCollapsed = ref(false);
const selectedAction = ref<ActionType>('none');
const searchQuery = ref('');
const selectedCategory = ref<'all' | 'charge' | 'pickup' | 'dropoff' | 'wait' | 'transit'>('all');
const viewMode = ref<'grid' | 'list'>('grid');

const isBusy = computed(() => agvState.task_info.status === 'DRIVING' || agvState.task_info.status === 'ACTING');

function getNodeAccent(func: string): string {
  switch (func) {
    case 'Idle/Charge':
    case 'Charge': return '#06b6d4';
    case 'Transit': return '#6366f1';
    case 'Wait': return '#f59e0b';
    case 'Cargo':
    case 'Pick-up':
    case 'Drop-off': return '#10b981';
    default: return '#38bdf8';
  }
}

function getNodeRole(func: string): 'charge' | 'cargo' | 'wait' | 'transit' {
  if (func.includes('Charge') || func.includes('Idle')) return 'charge';
  if (func.includes('Pick') || func.includes('Drop') || func.includes('Cargo')) return 'cargo';
  if (func.includes('Wait')) return 'wait';
  return 'transit';
}

const displayNodes = computed(() => {
  if (factoryLayout.nodes && factoryLayout.nodes.length > 0) {
    return factoryLayout.nodes.map(n => ({
      id: n.id,
      name: n.name,
      x: n.x,
      z: n.z,
      function: n.function,
      description: n.description,
      role: getNodeRole(n.function),
      accentColor: getNodeAccent(n.function)
    }));
  }
  return [
    { id: 'Node-01', name: '待命/充電區', x: 0, z: 0, function: 'Idle/Charge', description: '充電樁', role: 'charge' as const, accentColor: '#06b6d4' },
    { id: 'Node-02', name: '路徑轉折點', x: 10, z: 0, function: 'Transit', description: '通道', role: 'transit' as const, accentColor: '#6366f1' },
    { id: 'Node-03', name: '貨物站點 A', x: 10, z: 10, function: 'Cargo', description: '智慧貨架', role: 'cargo' as const, accentColor: '#10b981' },
    { id: 'Node-04', name: '貨物站點 B', x: 0, z: 10, function: 'Cargo', description: '輸送帶', role: 'cargo' as const, accentColor: '#10b981' },
  ];
});

// Category Tabs with Real-time Counts
const categoryList = computed(() => {
  const allNodes = displayNodes.value;
  return [
    { key: 'all' as const, label: '全部', count: allNodes.length },
    { key: 'cargo' as const, label: '貨物', count: allNodes.filter(n => n.role === 'cargo').length },
    { key: 'charge' as const, label: '充電', count: allNodes.filter(n => n.role === 'charge').length },
    { key: 'wait' as const, label: '等待', count: allNodes.filter(n => n.role === 'wait').length },
    { key: 'transit' as const, label: '通道', count: allNodes.filter(n => n.role === 'transit').length },
  ];
});

// Quick Chips (Recent / Current targets)
const quickChips = computed(() => {
  const chips: { id: string; tag: string }[] = [];
  const current = agvState.task_info.current_node;
  if (current) chips.push({ id: current, tag: '當前' });

  // Cargo station candidate
  const cargoNode = displayNodes.value.find(n => n.role === 'cargo');
  if (cargoNode && cargoNode.id !== current) chips.push({ id: cargoNode.id, tag: '貨物站' });

  // Charging station candidate
  const chargeNode = displayNodes.value.find(n => n.role === 'charge');
  if (chargeNode && chargeNode.id !== current && (!cargoNode || chargeNode.id !== cargoNode.id)) {
    chips.push({ id: chargeNode.id, tag: '充電' });
  }

  return chips.slice(0, 3);
});

// Filtered Nodes based on Search Query & Selected Category Tab
const filteredNodes = computed(() => {
  let list = displayNodes.value;

  if (selectedCategory.value !== 'all') {
    list = list.filter(n => n.role === selectedCategory.value);
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter(n => 
      n.id.toLowerCase().includes(query) ||
      n.name.toLowerCase().includes(query) ||
      n.function.toLowerCase().includes(query) ||
      n.description.toLowerCase().includes(query)
    );
  }

  return list;
});

const actions = [
  { value: 'none' as ActionType, label: '純移動 (不停留)', iconComponent: Navigation },
  { value: 'wait' as ActionType, label: '原地等待 (3秒)', iconComponent: Clock },
  { value: 'pick' as ActionType, label: '取貨 (Pick)', iconComponent: Package },
  { value: 'drop' as ActionType, label: '卸貨 (Drop)', iconComponent: Truck },
  { value: 'charge' as ActionType, label: '充電 (Charge)', iconComponent: Zap },
];

function isActionDisabled(act: ActionType): boolean {
  const node = displayNodes.value.find(n => n.id === selectedNodeForDispatch.value);
  if (!node) return false;
  if (act === 'charge') return node.role !== 'charge';
  if (act === 'pick' || act === 'drop') return node.role !== 'cargo';
  return false;
}

function getActionTooltip(act: ActionType): string {
  const node = displayNodes.value.find(n => n.id === selectedNodeForDispatch.value);
  if (!node) return '';
  if (act === 'charge' && node.role !== 'charge') return '⚠️ 此站非充電樁，無法指派充電';
  if ((act === 'pick' || act === 'drop') && node.role !== 'cargo') return '⚠️ 此站非貨物站，無法取放貨';
  if (act === 'none') return '純移動：車輛巡航移動，抵達後不停留直接完成任務';
  if (act === 'wait') return '原地等待：車輛到達後原地計時停留 3 秒，模擬安全防護或交通緩衝';
  return '';
}

watch(selectedNodeForDispatch, (newNodeId) => {
  const node = displayNodes.value.find(n => n.id === newNodeId);
  if (!node) return;
  if (isActionDisabled(selectedAction.value)) {
    if (node.role === 'cargo') selectedAction.value = 'pick';
    else if (node.role === 'charge') selectedAction.value = 'charge';
    else if (node.role === 'wait') selectedAction.value = 'wait';
    else selectedAction.value = 'none';
  }
}, { immediate: true });

function handleDispatch() {
  if (currentAppMode.value === 'edit') {
    alert('目前處於場域編輯模式，請先儲存並切換回模擬模式！');
    return;
  }
  if (!isConnected.value) {
    alert('後端尚未連線，請檢查後端是否啟動！');
    return;
  }
  sendDispatchOrder(selectedNodeForDispatch.value, selectedAction.value);
}

function runPreset(node: string, action: ActionType) {
  if (currentAppMode.value === 'edit') return;
  selectedNodeForDispatch.value = node;
  selectedAction.value = action;
  sendDispatchOrder(node, action);
}

function activate3DQuickDispatch() {
  if (currentAppMode.value === 'edit') return;
  is3DQuickDispatchActive.value = true;
  quickDispatchStartNode.value = agvState.task_info.current_node || 'Node-01';
  quickDispatchTargetNode.value = selectedNodeForDispatch.value;
  quickDispatchAction.value = selectedAction.value;
}
</script>

<style scoped>
.dispatch-container {
  position: relative;
  width: 370px;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--color-card-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-elevation);
  transition: all var(--transition-normal);
  user-select: none;
}

.dispatch-container.in-edit-mode {
  border-color: rgba(245, 158, 11, 0.4);
}

.dispatch-container.collapsed {
  width: 48px;
  height: 48px;
  background: rgba(15, 23, 42, 0.85);
  padding: 0;
  overflow: visible;
}

.dispatch-container.collapsed .panel-collapse-btn {
  right: 10px;
  top: 10px;
}

.panel-collapse-btn {
  position: absolute;
  top: 18px;
  right: -14px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  transition: all var(--transition-fast);
  z-index: 5;
}

.panel-collapse-btn:hover {
  background: #334155;
  color: #f8fafc;
  transform: scale(1.08);
}

.panel-content {
  padding: 18px;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-card-border);
  margin-bottom: 12px;
}

.header-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(14, 165, 233, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.text-cyan { color: #38bdf8; }
.text-amber { color: #f59e0b; }
.text-emerald { color: #10b981; }
.text-muted { color: #64748b; }
.text-dim { color: #64748b; }

.header-text {
  flex: 1;
}

.header-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--color-text-title);
  margin: 0;
}

.header-subtitle {
  font-size: 9.5px;
  color: var(--color-text-muted);
  font-weight: 600;
  letter-spacing: 0.5px;
  display: block;
}

.status-chip {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.chip-ready {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.chip-busy {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.chip-edit-lock {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* Edit Lock Warning Banner */
.edit-lock-banner {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 14px;
}

.lock-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.lock-title {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
}

.lock-desc {
  font-size: 11px;
  color: #cbd5e1;
  line-height: 1.45;
  margin-bottom: 8px;
}

.lock-hint-tag {
  background: rgba(245, 158, 11, 0.15);
  border: 1px dashed rgba(245, 158, 11, 0.4);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #fbbf24;
  text-align: center;
}

/* 3D Dispatch Hint Banner in Panel */
.panel-3d-hint-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.3);
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-3d-hint-banner:hover {
  background: rgba(14, 165, 233, 0.18);
  border-color: rgba(56, 189, 248, 0.6);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.2);
}

.hint-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.hint-main-text {
  font-size: 12px;
  font-weight: 700;
  color: #38bdf8;
}

.hint-sub-text {
  font-size: 10px;
  color: #94a3b8;
}

.dispatch-body.disabled-dim {
  opacity: 0.55;
  pointer-events: none;
}

.control-section {
  margin-bottom: 16px;
}

.section-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.label-icon {
  color: #38bdf8;
}

.view-mode-toggle {
  display: flex;
  background: rgba(15, 23, 42, 0.7);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.mode-btn {
  background: transparent;
  border: none;
  color: #64748b;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.mode-btn:hover {
  color: #cbd5e1;
}

.mode-btn.active {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
}

/* Quick Chips */
.quick-chips-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  overflow-x: auto;
}

.chips-label {
  font-size: 10px;
  color: #64748b;
  font-weight: 600;
}

.chip-btn {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 10px;
  color: #94a3b8;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.chip-btn:hover {
  color: #f8fafc;
  border-color: rgba(56, 189, 248, 0.3);
}

.chip-btn.active {
  background: rgba(14, 165, 233, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
  font-weight: 700;
}

/* Search Box */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: #64748b;
}

.search-input {
  width: 100%;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 7px 28px 7px 30px;
  font-size: 11.5px;
  color: #f8fafc;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #38bdf8;
}

.search-clear-btn {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
}

/* Category Tabs */
.category-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.cat-tab {
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 10.5px;
  color: #94a3b8;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: all 0.15s ease;
}

.cat-tab:hover {
  color: #f8fafc;
  background: rgba(51, 65, 85, 0.5);
}

.cat-tab.active {
  background: rgba(14, 165, 233, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  font-weight: 700;
}

.cat-count {
  font-size: 9.5px;
  opacity: 0.8;
}

/* Node Container Scrollable */
.node-container-scroll {
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;
}

.node-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.node-item {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-item);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  transition: all var(--transition-fast);
}

.node-list .node-item {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
}

.node-item:hover {
  background: rgba(51, 65, 85, 0.6);
  border-color: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.node-item.active {
  background: rgba(14, 165, 233, 0.15);
  border-color: #38bdf8;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.25);
}

.node-id-tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-title);
  border-left: 3px solid;
  padding-left: 6px;
  line-height: 1.2;
}

.node-details {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.node-list .node-details {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.node-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.node-title {
  font-size: 11px;
  color: var(--color-text-body);
}

.node-role-badge {
  font-size: 9px;
  font-weight: 700;
}

.node-coords {
  font-size: 9.5px;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
}

.empty-nodes-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  gap: 8px;
  font-size: 11px;
  color: #64748b;
  grid-column: 1 / -1;
}

/* Action grid */
.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.action-item {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-item);
  padding: 9px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-body);
  font-size: 11.5px;
  font-weight: 500;
  transition: all var(--transition-fast);
}

.action-item:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.6);
  transform: translateY(-1px);
}

.action-item:disabled,
.action-item.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: auto;
  filter: grayscale(0.8);
  border-color: rgba(255, 255, 255, 0.05);
  background: rgba(15, 23, 42, 0.4);
}

.action-item.active {
  background: rgba(245, 158, 11, 0.12);
  border-color: #f59e0b;
  color: #fbbf24;
  font-weight: 600;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.2);
}

.action-svg {
  flex-shrink: 0;
}

.primary-dispatch-btn {
  position: relative;
  width: 100%;
  padding: 13px;
  border-radius: var(--radius-item);
  border: none;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(2, 132, 199, 0.35);
  transition: all var(--transition-fast);
  margin-top: 4px;
}

.primary-dispatch-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  box-shadow: 0 6px 20px rgba(14, 165, 233, 0.5);
  transform: translateY(-1.5px);
}

.primary-dispatch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.btn-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.quick-presets {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--color-card-border);
}

.presets-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.presets-title {
  font-size: 10.5px;
  color: var(--color-text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.presets-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preset-item {
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid var(--color-card-border);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  transition: all var(--transition-fast);
}

.preset-item:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.6);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateX(2px);
}

.preset-icon {
  flex-shrink: 0;
}

.preset-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.preset-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-text-title);
}

.preset-desc {
  font-size: 9.5px;
  color: var(--color-text-muted);
}

.preset-arrow {
  color: var(--color-text-dim);
  transition: transform var(--transition-fast);
}

.preset-item:hover:not(:disabled) .preset-arrow {
  transform: translateX(2px);
  color: #38bdf8;
}
</style>
