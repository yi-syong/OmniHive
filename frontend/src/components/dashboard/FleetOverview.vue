<template>
  <div class="fleet-view-wrap">
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

      <!-- 1.1 Fleet Traffic Performance KPI Section -->
      <div class="ab-metrics-section">
        <div class="ab-metrics-head">
          <span class="ab-metrics-title">車隊交管效能統計</span>
          <span class="ab-metrics-sub">即時效能指標</span>
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
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { 
  Truck, 
  Bot, 
  BatteryCharging, 
  Navigation, 
  PackageCheck, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  X 
} from 'lucide-vue-next';
import { 
  agvState, 
  isConnected, 
  isTelemetryStale, 
  factoryLayout, 
  dashboardActiveTab, 
  is3DQuickDispatchActive, 
  requestCameraFollowVehicle, 
  trafficMetrics, 
  fleetVehicles, 
  selectVehicle, 
  currentAppMode 
} from '../../services/websocket';
import type { StateUpdateMessage } from '../../types';

defineEmits<{ (e: 'close'): void }>();

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

function getBatteryLevelClass(level: number): string {
  if (level > 60) return 'bat-good';
  if (level > 25) return 'bat-medium';
  return 'bat-low';
}
</script>
