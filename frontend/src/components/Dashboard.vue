<template>
  <div class="dashboard-container">
    <div class="panel-content">
      <!-- ========================================== -->
      <!-- VIEW A: Fleet Overview (總體車隊狀態)       -->
      <!-- ========================================== -->
      <div v-if="dashboardActiveTab === 'fleet'" class="fleet-view-wrap">
        <!-- Fleet Header -->
        <div class="panel-header">
          <div class="header-icon-box fleet-box">
            <Truck :size="18" class="text-cyan" />
          </div>
          <div class="header-text">
            <h2 class="header-title">車隊運行總覽</h2>
            <span class="header-subtitle">全廠 AGV 車群即時監控</span>
          </div>
          <div class="status-badge badge-fleet-count">
            <span class="pulsing-dot"></span>
            {{ fleetOnlineCount }} 輛在線
          </div>
          <button 
            class="panel-close-btn" 
            @click="$emit('close')" 
            title="收合儀表板"
            aria-label="收合儀表板"
          >
            <X :size="15" />
          </button>
        </div>

        <!-- Live Connection Signal -->
        <div class="telemetry-trust-bar">
          <div class="trust-item">
            <span :class="['live-indicator', isTelemetryStale ? 'stale' : (isConnected ? 'live' : 'offline')]"></span>
            <span class="trust-label">{{ isTelemetryStale ? '數據延遲' : (isConnected ? '車隊通訊正常' : '通訊中斷') }}</span>
          </div>
          <div class="trust-meta">
            <span class="meta-item">VDA 5050 / MQTT</span>
          </div>
        </div>

        <div class="cards-stack">
          <!-- 1. Fleet KPI Summary 2x2 Grid -->
          <div class="fleet-kpi-grid">
            <div class="kpi-card">
              <div class="kpi-header">
                <Bot :size="13" class="text-cyan" />
                <span class="kpi-title">車隊在線率</span>
              </div>
              <div class="kpi-value-row">
                <span class="kpi-num">{{ fleetOnlineCount }}</span>
                <span class="kpi-sub">/ 2 輛 ({{ (fleetOnlineCount / 2 * 100).toFixed(0) }}%)</span>
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-header">
                <BatteryCharging :size="13" class="text-emerald" />
                <span class="kpi-title">平均電量</span>
              </div>
              <div class="kpi-value-row">
                <span class="kpi-num">{{ fleetAverageBattery.toFixed(0) }}</span>
                <span class="kpi-unit">%</span>
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-header">
                <Navigation :size="13" class="text-amber" />
                <span class="kpi-title">任務狀態</span>
              </div>
              <div class="kpi-value-row">
                <span class="kpi-status-text" :class="fleetStatusSummary.includes('行駛') ? 'text-cyan' : (fleetStatusSummary.includes('交管') ? 'text-amber' : 'text-slate')">
                  {{ fleetStatusSummary }}
                </span>
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-header">
                <PackageCheck :size="13" class="text-purple" />
                <span class="kpi-title">載貨統計</span>
              </div>
              <div class="kpi-value-row">
                <span class="kpi-status-text">
                  {{ fleetCargoSummary }}
                </span>
              </div>
            </div>
          </div>

          <!-- 1.1 VDA 5050 Traffic Control Strategy Hot-Swap Card -->
          <div class="strategy-selector-card">
            <div class="strategy-card-header">
              <div class="strategy-title-group">
                <GitFork :size="13" class="text-cyan" />
                <span class="strategy-title">VDA 5050 交管演算法</span>
              </div>
              <span class="strategy-badge" :class="trafficMetrics.strategy_name === 'reroute' ? 'badge-reroute' : 'badge-wait'">
                {{ trafficMetrics.strategy_name === 'reroute' ? '動態繞路模式' : '死等淨空模式' }}
              </span>
            </div>
            <div class="strategy-button-group">
              <button 
                :class="['strat-btn', { active: trafficMetrics.strategy_name === 'wait' }]"
                @click="setTrafficStrategy('wait')"
                title="死等淨空：前方節點未釋放 (Horizon) 立即原地煞停，絕對安全零繞路"
              >
                <PauseCircle :size="12" />
                <span>等待優先 (Wait)</span>
              </button>
              <button 
                :class="['strat-btn', { active: trafficMetrics.strategy_name === 'reroute' }]"
                @click="setTrafficStrategy('reroute')"
                title="動態繞路：停等超過閾值自動觸發 A* 尋求避障替代路線，提升全廠吞吐量"
              >
                <Shuffle :size="12" />
                <span>繞路優先 (Reroute)</span>
              </button>
            </div>

            <!-- Deadlock Recovery Quick Action -->
            <div class="strategy-emergency-row">
              <button 
                type="button"
                class="strat-unstick-btn"
                @click="handleDashboardFleetReset"
                title="強制釋放全場預約路權，中斷卡死任務並重設車隊至待命狀態"
              >
                <ShieldAlert :size="13" />
                <span>一鍵解除全場死鎖 (Unstick Fleet)</span>
              </button>
            </div>
          </div>

          <!-- 1.2 A/B Testing Telemetry KPI Cards -->
          <div class="ab-metrics-section">
            <div class="ab-metrics-head">
              <span class="ab-metrics-title">A/B 演算法驗證量化數據</span>
              <span class="ab-metrics-sub">即時效能對比</span>
            </div>
            <div class="ab-metrics-grid">
              <!-- KPI 1: 全廠吞吐量 -->
              <div class="ab-kpi-card">
                <div class="kpi-header">
                  <CheckCircle2 :size="12" class="text-emerald" />
                  <span class="kpi-title">全廠吞吐量</span>
                </div>
                <div class="kpi-value-row">
                  <span class="kpi-num text-emerald">{{ trafficMetrics.throughput }}</span>
                  <span class="kpi-unit">單</span>
                </div>
                <span class="kpi-sub">累計成功完成</span>
              </div>

              <!-- KPI 2: 交管閒置總時長 -->
              <div class="ab-kpi-card">
                <div class="kpi-header">
                  <Clock :size="12" class="text-amber" />
                  <span class="kpi-title">交管閒置時長</span>
                </div>
                <div class="kpi-value-row">
                  <span class="kpi-num" :class="trafficMetrics.total_wait_time_sec > 5 ? 'text-amber' : 'text-slate'">
                    {{ trafficMetrics.total_wait_time_sec.toFixed(1) }}
                  </span>
                  <span class="kpi-unit">s</span>
                </div>
                <span class="kpi-sub">路權未發被迫煞停</span>
              </div>

              <!-- KPI 3: 平均額外耗能比 -->
              <div class="ab-kpi-card">
                <div class="kpi-header">
                  <TrendingUp :size="12" class="text-purple" />
                  <span class="kpi-title">平均額外耗損</span>
                </div>
                <div class="kpi-value-row">
                  <span class="kpi-num" :class="trafficMetrics.avg_extra_cost_pct > 0 ? 'text-purple' : 'text-slate'">
                    +{{ trafficMetrics.avg_extra_cost_pct.toFixed(1) }}
                  </span>
                  <span class="kpi-unit">%</span>
                </div>
                <span class="kpi-sub">繞路避雍塞代價</span>
              </div>
            </div>
          </div>

          <!-- 2. Fleet Vehicle Cards List -->
          <div class="fleet-list-section">
            <div class="fleet-section-head">
              <span class="fleet-section-title">全域車輛列表</span>
              <span class="fleet-section-sub">點擊卡片查看單車詳細遙測</span>
            </div>

            <!-- Dynamic Fleet Vehicle Cards -->
            <div 
              v-for="veh in activeVehicleList"
              :key="veh.vehicle_id"
              class="vehicle-fleet-card active-agv"
              @click="drillDownToVehicle(veh.vehicle_id)"
              :title="`點擊進入 ${veh.vehicle_id} 單車遙測面板`"
            >
              <div class="vcard-top">
                <div class="vcard-title-group">
                  <div class="vcard-avatar">
                    <Bot :size="16" :class="veh.vehicle_id === 'AGV-001' ? 'text-cyan' : 'text-amber'" />
                  </div>
                  <div>
                    <div class="vcard-name-row">
                      <span class="vcard-name">{{ veh.vehicle_id }}</span>
                      <span class="vcard-type-tag">{{ veh.vehicle_id === 'AGV-001' ? '頂升叉車' : '重載搬運' }}</span>
                    </div>
                    <span class="vcard-loc">
                      停靠: <strong>{{ veh.task_info?.current_node || 'Node-01' }}</strong> · {{ getNodeName(veh.task_info?.current_node) }}
                    </span>
                  </div>
                </div>
                <div :class="['status-badge', getVehicleStatus(veh).badgeClass]">
                  <span class="pulsing-dot"></span>
                  {{ getVehicleStatus(veh).label }}
                </div>
              </div>

              <!-- Quick Metrics Grid -->
              <div class="vcard-metrics">
                <div class="vcard-metric-col">
                  <span class="vm-lbl">速度</span>
                  <span class="vm-val">{{ ((veh.velocity || 0) * 3.6).toFixed(1) }} <small>km/h</small></span>
                </div>
                <div class="vcard-metric-col">
                  <span class="vm-lbl">電量</span>
                  <span class="vm-val" :class="getBatteryLevelClass(veh.battery?.level || 0)">
                    {{ (veh.battery?.level || 0).toFixed(0) }}%
                  </span>
                </div>
                <div class="vcard-metric-col">
                  <span class="vm-lbl">載重</span>
                  <span class="vm-val">{{ veh.task_info?.has_cargo ? '📦 載貨' : '空載' }}</span>
                </div>
              </div>

              <!-- Battery Mini Progress Bar -->
              <div class="vcard-bat-bar">
                <div 
                  class="vcard-bat-fill" 
                  :class="getBatteryLevelClass(veh.battery?.level || 0)"
                  :style="{ width: `${veh.battery?.level || 0}%` }"
                ></div>
              </div>

              <div class="vcard-footer">
                <span class="vcard-drill-hint">查看詳細遙測與數據 ➔</span>
                <button 
                  class="btn-vcard-dispatch"
                  @click.stop="openDispatchForVehicle(veh.vehicle_id)"
                  :title="`開啟 ${veh.vehicle_id} 任務派遣`"
                >
                  <Navigation :size="12" />
                  <span>派車</span>
                </button>
              </div>
            </div>

            <!-- Standby Slot Placeholder when fleet is empty -->
            <div v-if="activeVehicleList.length === 0" class="vehicle-fleet-card standby-agv">
              <div class="vcard-top">
                <div class="vcard-title-group">
                  <div class="vcard-avatar standby">
                    <Bot :size="16" class="text-slate" />
                  </div>
                  <div>
                    <div class="vcard-name-row">
                      <span class="vcard-name text-slate">無上線車輛</span>
                      <span class="vcard-type-tag standby">待機中</span>
                    </div>
                    <span class="vcard-loc text-slate">等待模擬器或車輛 MQTT 連線...</span>
                  </div>
                </div>
                <span class="status-badge badge-standby">離線</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- VIEW B: Single Vehicle Detail Telemetry    -->
      <!-- ========================================== -->
      <div v-else class="vehicle-view-wrap">
        <!-- Back Bar to Fleet Overview -->
        <div class="drill-back-bar">
          <button class="btn-back-fleet" @click="dashboardActiveTab = 'fleet'; is3DQuickDispatchActive = false;">
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
          <!-- 1. 行駛速度 -->
          <div class="data-card">
            <div class="card-head">
              <div class="flex-align-center gap-6">
                <Gauge :size="14" class="text-cyan" />
                <span class="card-title">行駛速度</span>
              </div>
              <span class="card-pill">上限 15 km/h</span>
            </div>
            <div class="metric-container">
              <div class="metric-primary">
                <span class="metric-number">{{ formatNum(agvState.velocity) }}</span>
                <span class="metric-unit">m/s</span>
                <span class="metric-speed-kmh">({{ (agvState.velocity * 3.6).toFixed(1) }} km/h)</span>
              </div>
              <div class="progress-track">
                <div 
                  class="progress-fill speed-fill" 
                  :style="{ width: `${Math.min(100, (agvState.velocity / 4.17) * 100)}%` }"
                ></div>
              </div>
            </div>
          </div>

          <!-- 2. 車輛電量 -->
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
                <div class="metric-primary">
                  <span class="metric-number">{{ agvState.battery.level.toFixed(1) }}</span>
                  <span class="metric-unit">%</span>
                </div>
                <div class="battery-rate-tag" :class="agvState.battery.charging ? 'rate-charge' : 'rate-drain'">
                  <span>{{ agvState.battery.charging ? '充電中 (+1.5%/s)' : (agvState.task_info.has_cargo ? '載重運轉中' : '一般運作') }}</span>
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
                <span class="drain-indicator-label">載重狀態:</span>
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

          <!-- 4. 即時位置 -->
          <div class="data-card">
            <div class="card-head">
              <span class="card-title">車輛即時位置</span>
              <div class="node-sequence">
                <span class="node-badge prev">{{ agvState.task_info.previous_node || 'N1' }}</span>
                <span class="seq-arrow">→</span>
                <span class="node-badge curr">{{ agvState.task_info.current_node || 'N1' }}</span>
              </div>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { 
  Activity, 
  Gauge, 
  BatteryCharging, 
  Battery, 
  Terminal, 
  X, 
  Route,
  Truck,
  Bot,
  Navigation,
  PackageCheck,
  ChevronLeft,
  GitFork,
  PauseCircle,
  Shuffle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ShieldAlert
} from 'lucide-vue-next';
import { 
  agvState, 
  isConnected, 
  isTelemetryStale,
  factoryLayout,
  selectedVehicleId,
  dashboardActiveTab,
  is3DQuickDispatchActive,
  requestCameraFollowVehicle,
  trafficMetrics,
  setTrafficStrategy,
  fleetVehicles,
  selectVehicle,
  currentAppMode,
  resetFleet
} from '../services/websocket';
import type { StateUpdateMessage } from '../types';

defineEmits<{ (e: 'close'): void }>();

function handleDashboardFleetReset() {
  if (confirm('🚨 確定要一鍵解除全場死鎖？\n系統將立即釋放所有車輛的鎖定路權，中斷停等任務並重設車隊至待命狀態。')) {
    resetFleet();
  }
}

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

function getVehicleStatus(veh?: any) {
  if (!veh || !veh.task_info) {
    return { label: '待命中', badgeClass: 'badge-idle' };
  }
  if (veh.task_info.is_traffic_wait) {
    return { label: '交管停等', badgeClass: 'badge-traffic-wait' };
  }
  switch (veh.task_info.status) {
    case 'DRIVING':
      return { label: '行駛中', badgeClass: 'badge-driving' };
    case 'ACTING':
      return { label: '動作執行中', badgeClass: 'badge-acting' };
    case 'IDLE':
    default:
      return { label: '待命中', badgeClass: 'badge-idle' };
  }
}

const activeVehicleList = computed(() => {
  const list: (StateUpdateMessage & { vehicle_id: string })[] = [];
  const entries = Object.entries(fleetVehicles);
  if (entries.length > 0) {
    for (const [id, v] of entries) {
      list.push({ ...v, vehicle_id: id });
    }
  } else if (agvState.agv_id) {
    list.push({ ...agvState, vehicle_id: agvState.agv_id });
  }
  return list;
});

const fleetOnlineCount = computed(() => {
  const count = Object.keys(fleetVehicles).length;
  return count > 0 ? count : 1;
});

const fleetAverageBattery = computed(() => {
  const vehs = Object.values(fleetVehicles);
  if (vehs.length === 0) return agvState.battery.level;
  const sum = vehs.reduce((acc, v) => acc + (v.battery?.level || 0), 0);
  return sum / vehs.length;
});

const fleetStatusSummary = computed(() => {
  const vehs = Object.values(fleetVehicles);
  if (vehs.length === 0) {
    if (agvState.task_info.is_traffic_wait) return '1 輛交管停等';
    if (agvState.task_info.status === 'DRIVING') return '1 輛行駛中';
    if (agvState.task_info.status === 'ACTING') return '1 輛作業中';
    return '全體待命中';
  }
  const driving = vehs.filter(v => v.task_info?.status === 'DRIVING').length;
  const acting = vehs.filter(v => v.task_info?.status === 'ACTING').length;
  const waiting = vehs.filter(v => v.task_info?.is_traffic_wait).length;
  if (waiting > 0) return `${waiting} 輛交管停等`;
  if (driving > 0) return `${driving} 輛行駛中`;
  if (acting > 0) return `${acting} 輛作業中`;
  return '全體待命中';
});

const fleetCargoSummary = computed(() => {
  const vehs = Object.values(fleetVehicles);
  if (vehs.length === 0) {
    return agvState.task_info.has_cargo ? '1 輛載貨中' : '全體空載';
  }
  const cargoCount = vehs.filter(v => v.task_info?.has_cargo).length;
  return cargoCount > 0 ? `${cargoCount} 輛載貨中` : '全體空載';
});

function drillDownToVehicle(vehId: string) {
  selectVehicle(vehId);
  dashboardActiveTab.value = 'vehicle';
  requestCameraFollowVehicle(vehId);
}

function openDispatchForVehicle(vehId: string) {
  selectVehicle(vehId);
  currentAppMode.value = 'simulate';
  is3DQuickDispatchActive.value = true;
  requestCameraFollowVehicle(vehId);
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

<style scoped>
.dashboard-container {
  position: relative;
  width: min(350px, calc(100vw - 32px));
  max-height: calc(100vh - 84px);
  overflow-y: auto;
  overflow-x: hidden;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}

.panel-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ================= Fleet View Styles ================= */
.fleet-view-wrap,
.vehicle-view-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-icon-box.fleet-box {
  background: rgba(14, 165, 233, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
}

.badge-fleet-count {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: #34d399;
}

/* Fleet KPI Grid */
.fleet-kpi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.kpi-card {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpi-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kpi-title {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.kpi-num {
  font-size: 18px;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.1;
  font-family: 'JetBrains Mono', monospace, sans-serif;
}

.kpi-unit {
  font-size: 12px;
  color: #38bdf8;
  font-weight: 600;
}

.kpi-sub {
  font-size: 10.5px;
  color: #64748b;
}

.kpi-status-text {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

/* Strategy Selector Card */
.strategy-selector-card {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.strategy-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.strategy-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.strategy-title {
  font-size: 11.5px;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: 0.2px;
}

.strategy-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid;
  letter-spacing: 0.3px;
}

.badge-wait {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.badge-reroute {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
}

.strategy-button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.strat-btn {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.strat-btn:hover {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.3);
  color: #f1f5f9;
}

.strat-btn.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.6);
  color: #38bdf8;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}

.strategy-emergency-row {
  margin-top: 2px;
}

.strat-unstick-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(225, 29, 72, 0.12);
  border: 1px solid rgba(244, 63, 94, 0.3);
  color: #fda4af;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.strat-unstick-btn:hover {
  background: rgba(225, 29, 72, 0.25);
  border-color: rgba(244, 63, 94, 0.55);
  color: #ffffff;
  box-shadow: 0 0 12px rgba(244, 63, 94, 0.25);
}

/* A/B Testing Telemetry KPI Section */
.ab-metrics-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ab-metrics-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px;
}

.ab-metrics-title {
  font-size: 11.5px;
  font-weight: 700;
  color: #cbd5e1;
}

.ab-metrics-sub {
  font-size: 10px;
  color: #64748b;
}

.ab-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.ab-kpi-card {
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: center;
  align-items: center;
}

.ab-kpi-card .kpi-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.ab-kpi-card .kpi-title {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 600;
  white-space: nowrap;
}

.ab-kpi-card .kpi-value-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
}

.ab-kpi-card .kpi-num {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.1;
  font-family: 'JetBrains Mono', monospace;
}

.ab-kpi-card .kpi-unit {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
}

.ab-kpi-card .kpi-sub {
  font-size: 9px;
  color: #64748b;
  white-space: nowrap;
}

/* Fleet Vehicles Section */
.fleet-list-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fleet-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 4px;
}

.fleet-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: 0.3px;
}

.fleet-section-sub {
  font-size: 10.5px;
  color: #64748b;
}

/* Vehicle Fleet Card */
.vehicle-fleet-card {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.vehicle-fleet-card.active-agv:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(56, 189, 248, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), 0 0 12px rgba(56, 189, 248, 0.15);
}

.vehicle-fleet-card.standby-agv {
  opacity: 0.65;
  cursor: default;
  border-style: dashed;
}

.vcard-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.vcard-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vcard-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.vcard-avatar.standby {
  background: rgba(100, 116, 139, 0.1);
  border-color: rgba(100, 116, 139, 0.25);
}

.vcard-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vcard-name {
  font-size: 13.5px;
  font-weight: 700;
  color: #f8fafc;
}

.vcard-type-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
}

.vcard-type-tag.standby {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

.vcard-loc {
  font-size: 11px;
  color: #94a3b8;
  display: block;
  margin-top: 2px;
}

.vcard-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  background: rgba(15, 23, 42, 0.4);
  padding: 6px 8px;
  border-radius: 8px;
}

.vcard-metrics.standby {
  grid-template-columns: 1fr 1fr;
}

.vcard-metric-col {
  display: flex;
  flex-direction: column;
}

.vm-lbl {
  font-size: 10px;
  color: #64748b;
}

.vm-val {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.vm-val-mono {
  font-size: 10.5px;
  color: #94a3b8;
  font-family: monospace;
}

.vcard-bat-bar {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.vcard-bat-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.vcard-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 2px;
}

.vcard-drill-hint {
  font-size: 11px;
  color: #38bdf8;
  font-weight: 500;
}

.btn-vcard-dispatch {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(14, 165, 233, 0.2);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-vcard-dispatch:hover {
  background: rgba(14, 165, 233, 0.35);
  color: #ffffff;
}

.badge-standby {
  background: rgba(100, 116, 139, 0.15);
  border-color: rgba(100, 116, 139, 0.3);
  color: #94a3b8;
}

/* ================= Single Vehicle View Styles ================= */
.drill-back-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-back-fleet {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #38bdf8;
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-back-fleet:hover {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: #ffffff;
}

.drill-indicator-tag {
  font-size: 10.5px;
  color: #64748b;
  font-weight: 500;
}

.vehicle-detail-header {
  padding-top: 0;
}

/* Header & Shared Styles */
.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-text {
  flex: 1;
}

.header-title {
  font-size: 14.5px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
  line-height: 1.2;
}

.header-subtitle {
  font-size: 11px;
  color: #94a3b8;
  margin: 0;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid;
  flex-shrink: 0;
}

.badge-idle {
  background: rgba(100, 116, 139, 0.15);
  border-color: rgba(100, 116, 139, 0.3);
  color: #94a3b8;
}

.badge-driving {
  background: rgba(14, 165, 233, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
}

.badge-acting {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.badge-traffic-wait {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
}

.pulsing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.5s infinite;
}

.panel-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.panel-close-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.1);
}

/* Trust Bar */
.telemetry-trust-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.trust-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.live-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.live-indicator.live {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.live-indicator.stale {
  background: #f59e0b;
}

.live-indicator.offline {
  background: #ef4444;
}

.trust-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.trust-meta .meta-item {
  font-size: 10.5px;
  color: #64748b;
}

/* Cards Stack */
.cards-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.data-card {
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.flex-align-center {
  display: flex;
  align-items: center;
}

.gap-6 {
  gap: 6px;
}

.card-title {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.card-pill {
  font-size: 10.5px;
  color: #64748b;
}

.metric-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-primary {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.metric-number {
  font-size: 24px;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1;
  font-family: 'JetBrains Mono', monospace, sans-serif;
}

.metric-unit {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 600;
}

.metric-speed-kmh {
  font-size: 12px;
  color: #38bdf8;
  font-weight: 500;
  margin-left: 4px;
}

.progress-track {
  width: 100%;
  height: 5px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.speed-fill {
  background: linear-gradient(90deg, #0ea5e9, #38bdf8);
}

.bat-good {
  background: #10b981;
  color: #10b981;
}

.bat-medium {
  background: #f59e0b;
  color: #f59e0b;
}

.bat-low {
  background: #ef4444;
  color: #ef4444;
}

.battery-split {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.charging-tag {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 6px;
}

.mode-charge {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.mode-acting {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.mode-moving {
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
}

.mode-idle {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

.battery-rate-tag {
  font-size: 11px;
  font-weight: 500;
}

.rate-charge {
  color: #34d399;
}

.rate-drain {
  color: #94a3b8;
}

.cargo-drain-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  margin-top: 2px;
}

.drain-indicator-label {
  color: #64748b;
}

.drain-badge {
  font-size: 11px;
  font-weight: 600;
}

.cargo-loaded {
  color: #fbbf24;
}

.cargo-empty {
  color: #94a3b8;
}

/* Route Status */
.vda-route-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11.5px;
}

.route-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.route-k {
  color: #64748b;
  flex-shrink: 0;
  font-size: 11px;
}

.route-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.edge-tag {
  font-size: 10px;
  font-family: monospace;
  padding: 1px 5px;
  border-radius: 4px;
}

.edge-tag.active {
  background: rgba(14, 165, 233, 0.2);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
}

.edge-tag.passed {
  background: rgba(100, 116, 139, 0.15);
  color: #64748b;
}

.text-dim {
  color: #64748b;
  font-size: 11px;
}

/* Coordinates */
.node-sequence {
  display: flex;
  align-items: center;
  gap: 4px;
}

.node-badge {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
}

.node-badge.prev {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

.node-badge.curr {
  background: rgba(14, 165, 233, 0.25);
  color: #38bdf8;
}

.seq-arrow {
  color: #64748b;
  font-size: 10px;
}

.coords-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.coord-box {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.axis-tag {
  font-size: 9.5px;
  color: #64748b;
  font-weight: 700;
}

.coord-value {
  font-size: 12.5px;
  font-weight: 700;
  color: #f8fafc;
  font-family: monospace;
  margin: 1px 0;
}

.coord-unit {
  font-size: 9.5px;
  color: #64748b;
}

.heading-box {
  position: relative;
}

.mini-compass {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(56, 189, 248, 0.4);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.compass-needle {
  width: 2px;
  height: 8px;
  background: #38bdf8;
  border-radius: 1px;
  transform-origin: center;
}

/* Terminal Card */
.terminal-card {
  background: rgba(10, 15, 28, 0.6);
}

.action-tag {
  font-size: 10px;
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
}

.terminal-screen {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.term-line {
  line-height: 1.35;
}

.term-msg {
  color: #cbd5e1;
}

.term-target {
  color: #94a3b8;
}

.term-highlight {
  color: #38bdf8;
  font-weight: 700;
}

/* Color Classes */
.text-cyan { color: #38bdf8; }
.text-emerald { color: #10b981; }
.text-amber { color: #f59e0b; }
.text-purple { color: #c084fc; }
.text-slate { color: #94a3b8; }

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.7; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.7; }
}
</style>
