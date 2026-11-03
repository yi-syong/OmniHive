<template>
  <div class="vehicle-view-wrap">
    <!-- Back Bar to Fleet Overview -->
    <div class="drill-back-bar">
      <button class="btn-back-fleet" @click="handleBackToFleet">
        <ChevronLeft :size="15" />
        <span>返回車隊總覽</span>
      </button>
      <span class="drill-indicator-tag">單車遙測</span>
      <button 
        class="panel-close-btn" 
        @click="$emit('close')" 
        title="收合儀表板"
        aria-label="收合儀表板"
      >
        <X :size="15" />
      </button>
    </div>

    <!-- Vehicle Detail Header -->
    <div class="panel-header vehicle-detail-header">
      <div class="header-icon-box">
        <Activity :size="18" class="text-cyan" />
      </div>
      <div class="header-text">
        <h2 class="header-title">{{ selectedVehicleId }} 即時狀態</h2>
        <span class="header-subtitle">當前停靠: {{ agvState.task_info.current_node || 'Node-01' }} · {{ getNodeName(agvState.task_info.current_node) }}</span>
      </div>
      <div :class="['status-badge', statusBadgeClass]">
        <span class="pulsing-dot"></span>
        {{ statusLabel }}
      </div>
    </div>

    <!-- Live Connection Signal -->
    <div class="telemetry-trust-bar">
      <div class="trust-item">
        <span :class="['live-indicator', isTelemetryStale ? 'stale' : (isConnected ? 'live' : 'offline')]"></span>
        <span class="trust-label">{{ isTelemetryStale ? '數據延遲' : (isConnected ? '連線傳輸中' : '連線中斷') }}</span>
      </div>
      <div class="trust-meta">
        <span class="meta-item">運作正常</span>
      </div>
    </div>

    <div class="cards-stack">
      <!-- 1. 行駛速度 (核心 KPI: m/s 主顯示，km/h 次要輔助) -->
      <div class="data-card">
        <div class="card-head">
          <div class="flex-align-center gap-6">
            <Gauge :size="14" class="text-cyan" />
            <span class="card-title">行駛速度</span>
          </div>
          <span class="card-pill">上限 15 km/h</span>
        </div>
        <div class="metric-container">
          <div class="metric-primary-large">
            <span class="metric-number-lg">{{ formatNum(agvState.velocity) }}</span>
            <span class="metric-unit-lg">m/s</span>
            <span class="metric-sub-speed">({{ (agvState.velocity * 3.6).toFixed(1) }} km/h)</span>
          </div>
          <div class="progress-track">
            <div 
              class="progress-fill speed-fill" 
              :style="{ width: `${Math.min(100, (agvState.velocity / 4.17) * 100)}%` }"
            ></div>
          </div>
        </div>
      </div>

      <!-- 2. 車輛電量 (核心 KPI: 大數值 + 預估運行時間) -->
      <div class="data-card">
        <div class="card-head">
          <div class="flex-align-center gap-6">
            <BatteryCharging v-if="agvState.battery.charging" :size="14" class="text-emerald" />
            <Battery v-else :size="14" class="text-cyan" />
            <span class="card-title">車輛電量</span>
          </div>
          <span :class="['charging-tag', getBatteryModeClass(agvState.battery.mode)]">
            {{ getBatteryModeLabel(agvState.battery.mode, agvState.battery.charging) }}
          </span>
        </div>
        <div class="metric-container">
          <div class="battery-split">
            <div class="metric-primary-large">
              <span class="metric-number-lg">{{ agvState.battery.level.toFixed(0) }}</span>
              <span class="metric-unit-lg">%</span>
              <span class="metric-sub-runtime">
                {{ agvState.battery.charging ? '(充電補電中)' : `(~${Math.max(0.5, (agvState.battery.level * 0.045)).toFixed(1)} 小時)` }}
              </span>
            </div>
            <div class="battery-rate-tag" :class="agvState.battery.charging ? 'rate-charge' : 'rate-drain'">
              <span>{{ agvState.battery.charging ? '補電中' : (agvState.task_info.has_cargo ? '載重運轉' : '待命運行') }}</span>
            </div>
          </div>
          <div class="progress-track">
            <div 
              :class="['progress-fill', getBatteryLevelClass(agvState.battery.level)]" 
              :style="{ width: `${agvState.battery.level}%` }"
            ></div>
          </div>
          <!-- Cargo load factor indicator -->
          <div class="cargo-drain-indicator">
            <span class="drain-indicator-label">貨物負載:</span>
            <span :class="['drain-badge', agvState.task_info.has_cargo ? 'cargo-loaded' : 'cargo-empty']">
              {{ agvState.task_info.has_cargo ? '📦 載貨作業中' : '空載' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 3. 行駛路徑進度 -->
      <div class="data-card">
        <div class="card-head">
          <div class="flex-align-center gap-6">
            <Route :size="14" class="text-cyan" />
            <span class="card-title">行駛路徑進度</span>
          </div>
          <span class="card-pill">
            {{ (agvState.node_states && agvState.node_states.length > 0) ? `剩餘 ${agvState.node_states.length} 站點` : '無待辦路線' }}
          </span>
        </div>
        <div class="vda-route-status">
          <div class="route-item">
            <span class="route-k">待行經路段:</span>
            <div class="route-tags" v-if="agvState.edge_states && agvState.edge_states.length > 0">
              <span v-for="e in agvState.edge_states" :key="e" class="edge-tag active">
                {{ e }}
              </span>
            </div>
            <span v-else class="text-dim">目前無路線（待命中）</span>
          </div>
          <div class="route-item" v-if="agvState.passed_edges && agvState.passed_edges.length > 0">
            <span class="route-k">已通過路段:</span>
            <div class="route-tags">
              <span v-for="pe in agvState.passed_edges" :key="pe" class="edge-tag passed">
                {{ pe }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. 即時位置 (預設折疊工程座標，避免干擾) -->
      <div class="data-card engineering-card">
        <button 
          type="button" 
          class="card-head-clickable" 
          @click="showEngineeringCoords = !showEngineeringCoords"
          title="展開/收合工程座標與詳細朝向"
        >
          <div class="flex-align-center gap-6">
            <Compass :size="14" class="text-cyan" />
            <span class="card-title">停靠位置: {{ agvState.task_info.current_node || 'Node-01' }}</span>
          </div>
          <div class="flex-align-center gap-6">
            <span class="card-pill">{{ showEngineeringCoords ? '收合' : '工程座標' }}</span>
            <ChevronDown :size="13" class="transition-transform" :class="{ 'rotate-180': showEngineeringCoords }" />
          </div>
        </button>

        <div v-show="showEngineeringCoords" class="coords-expanded-wrap">
          <div class="node-sequence mb-8">
            <span class="seq-lbl">站點序列:</span>
            <span class="node-badge prev">{{ agvState.task_info.previous_node || 'N1' }}</span>
            <span class="seq-arrow">→</span>
            <span class="node-badge curr">{{ agvState.task_info.current_node || 'N1' }}</span>
          </div>

          <div class="coords-row">
            <div class="coord-box">
              <span class="axis-tag">X</span>
              <span class="coord-value">{{ formatNum(agvState.position.x) }}</span>
              <span class="coord-unit">m</span>
            </div>
            <div class="coord-box">
              <span class="axis-tag">Y</span>
              <span class="coord-value">{{ formatNum(agvState.position.y) }}</span>
              <span class="coord-unit">m</span>
            </div>
            <div class="coord-box">
              <span class="axis-tag">Z</span>
              <span class="coord-value">{{ formatNum(agvState.position.z) }}</span>
              <span class="coord-unit">m</span>
            </div>
            <div class="coord-box heading-box">
              <span class="axis-tag">朝向</span>
              <span class="coord-value">{{ formatTheta(agvState.position.theta) }}</span>
              <span class="coord-unit">°</span>
              <div class="mini-compass" :title="`車頭角度: ${formatTheta(agvState.position.theta)}°`">
                <div 
                  class="compass-needle" 
                  :style="{ transform: `rotate(${agvState.position.theta}rad)` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 5. 任務執行歷程 -->
      <div class="data-card terminal-card">
        <div class="card-head">
          <div class="flex-align-center gap-6">
            <Terminal :size="13" class="text-cyan" />
            <span class="card-title">任務執行歷程</span>
          </div>
          <span v-if="agvState.task_info.action && agvState.task_info.action !== 'none'" class="action-tag">
            {{ formatAction(agvState.task_info.action) }}
          </span>
        </div>
        <div class="terminal-screen">
          <div class="term-line term-msg">{{ agvState.task_info.display_message }}</div>
          <div class="term-line term-target" v-if="agvState.task_info.target_node">
            目標站點: <span class="term-highlight">{{ agvState.task_info.target_node }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  Activity, 
  Gauge, 
  BatteryCharging, 
  Battery, 
  Terminal, 
  X, 
  Route, 
  ChevronLeft, 
  ChevronDown, 
  Compass 
} from 'lucide-vue-next';
import { 
  agvState, 
  isConnected, 
  isTelemetryStale, 
  factoryLayout, 
  selectedVehicleId, 
  dashboardActiveTab, 
  is3DQuickDispatchActive 
} from '../../services/websocket';

const emit = defineEmits<{ 
  (e: 'close'): void;
  (e: 'back-to-fleet'): void;
}>();

const showEngineeringCoords = ref(false);

const statusLabel = computed(() => {
  if (agvState.task_info.is_traffic_wait) {
    return '交管停等中';
  }
  switch (agvState.task_info.status) {
    case 'DRIVING':
      return '行駛中';
    case 'ACTING':
      return '動作執行中';
    case 'IDLE':
    default:
      return '待命中';
  }
});

const statusBadgeClass = computed(() => {
  if (agvState.task_info.is_traffic_wait) {
    return 'badge-traffic-wait';
  }
  switch (agvState.task_info.status) {
    case 'DRIVING':
      return 'badge-driving';
    case 'ACTING':
      return 'badge-acting';
    case 'IDLE':
    default:
      return 'badge-idle';
  }
});

function handleBackToFleet() {
  dashboardActiveTab.value = 'fleet';
  is3DQuickDispatchActive.value = false;
  emit('back-to-fleet');
}

function getNodeName(nodeId: string | undefined): string {
  if (!nodeId) return '待命區';
  const n = factoryLayout.nodes.find(node => node.id === nodeId);
  return n?.name || '站點';
}

function formatNum(val: number | undefined): string {
  if (val === undefined || isNaN(val)) return '0.00';
  return val.toFixed(2);
}

function formatTheta(rad: number | undefined): string {
  if (rad === undefined || isNaN(rad)) return '0';
  const deg = (rad * 180) / Math.PI;
  return deg.toFixed(0);
}

function formatAction(action: string): string {
  switch (action) {
    case 'pick':
      return '取貨作業';
    case 'drop':
      return '卸貨作業';
    case 'charge':
      return '充電作業';
    default:
      return action;
  }
}

function getBatteryLevelClass(level: number): string {
  if (level > 60) return 'bat-good';
  if (level > 25) return 'bat-medium';
  return 'bat-low';
}

function getBatteryModeLabel(mode: string | undefined, charging: boolean): string {
  if (charging || mode?.includes('CHARG')) {
    if (mode === 'CC_CHARGING') return '快充中';
    if (mode === 'CV_CHARGING') return '涓流補滿中';
    if (mode === 'CHARGED') return '電量已滿';
    return '充電中';
  }
  switch (mode) {
    case 'MOVING': return '行駛放電';
    case 'ACTING': return '高功率作動';
    case 'IDLE':
    default: return '待機中';
  }
}

function getBatteryModeClass(mode: string | undefined): string {
  if (mode === 'CC_CHARGING' || mode === 'CV_CHARGING' || mode === 'CHARGED') return 'mode-charge';
  if (mode === 'ACTING') return 'mode-acting';
  if (mode === 'MOVING') return 'mode-moving';
  return 'mode-idle';
}
</script>
