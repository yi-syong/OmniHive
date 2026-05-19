<template>
  <transition name="slide">
    <div v-if="vehicle" class="vehicle-detail glass-card">
      <div class="detail-header">
        <div class="header-left">
          <div class="vehicle-id">{{ vehicle.serialNumber }}</div>
          <div class="vehicle-manufacturer">{{ vehicle.manufacturer }}</div>
        </div>
        <q-btn flat round icon="close" size="sm" color="grey" @click="store.clearSelection()" />
      </div>

      <q-separator dark class="separator" />

      <!-- Status Badge -->
      <div class="status-section">
        <q-badge :style="{ backgroundColor: store.getStatusColor(vehicle) }" class="status-badge">
          {{ store.getStatus(vehicle).toUpperCase() }}
        </q-badge>
        <span class="operating-mode mono">{{ vehicle.operatingMode || 'N/A' }}</span>
      </div>

      <!-- Actions -->
      <div class="detail-section" v-if="store.dashboardMode === 'monitoring'">
        <div class="action-buttons">
          <button class="btn-action btn-pause" v-if="!vehicle.paused" @click="sendAction('startPause')" :disabled="isSending">Pause</button>
          <button class="btn-action btn-resume" v-else @click="sendAction('stopPause')" :disabled="isSending">Resume</button>
          <button class="btn-action btn-cancel" @click="sendAction('cancelOrder')" :disabled="isSending || !vehicle.currentOrderId">Cancel Order</button>
        </div>
      </div>

      <!-- Order Progress -->
      <div class="detail-section" v-if="vehicle.currentOrderId">
        <div class="section-title">📋 Current Order</div>
        <div class="order-info">
          <div class="order-id mono">{{ vehicle.currentOrderId }}</div>
          <div class="order-progress">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: orderProgressPercent + '%' }"></div>
            </div>
            <div class="progress-text">{{ completedNodes }} / {{ totalNodes }} Nodes</div>
          </div>
        </div>
      </div>

      <!-- Position -->
      <div class="detail-section">
        <div class="section-title">
          📍 Position
        </div>
        <div class="move-vehicle-row" v-if="store.dashboardMode === 'monitoring'">
          <q-select
            v-model="targetMap"
            :options="mapOptions"
            emit-value
            map-options
            dense
            outlined
            dark
            class="move-map-select"
            label="Map"
          />
          <button class="btn-init-pos" @click="initPosition" :disabled="!targetMap">
            Move Here
          </button>
        </div>
        <div class="data-grid">
          <div class="data-item">
            <span class="data-label">X</span>
            <span class="data-value mono">{{ (vehicle.x || 0).toFixed(2) }} m</span>
          </div>
          <div class="data-item">
            <span class="data-label">Y</span>
            <span class="data-value mono">{{ (vehicle.y || 0).toFixed(2) }} m</span>
          </div>
          <div class="data-item">
            <span class="data-label">θ</span>
            <span class="data-value mono">{{ ((vehicle.theta || 0) * 180 / Math.PI).toFixed(1) }}°</span>
          </div>
        </div>
      </div>

      <!-- Velocity -->
      <div class="detail-section">
        <div class="section-title">💨 Velocity</div>
        <div class="data-grid">
          <div class="data-item">
            <span class="data-label">Vx</span>
            <span class="data-value mono">{{ (vehicle.vx || 0).toFixed(2) }} m/s</span>
          </div>
          <div class="data-item">
            <span class="data-label">Vy</span>
            <span class="data-value mono">{{ (vehicle.vy || 0).toFixed(2) }} m/s</span>
          </div>
          <div class="data-item">
            <span class="data-label">Speed</span>
            <span class="data-value mono">{{ speed.toFixed(2) }} m/s</span>
          </div>
        </div>
      </div>

      <!-- Battery -->
      <div class="detail-section">
        <div class="section-title">
          🔋 Battery
          <q-icon v-if="vehicle.charging" name="bolt" color="teal" size="16px" class="pulse" />
        </div>
        <q-linear-progress
          :value="(vehicle.batteryCharge || 0) / 100"
          :color="batteryColor"
          track-color="grey-9"
          size="12px"
          rounded
          class="battery-progress"
        />
        <div class="battery-label mono">
          {{ (vehicle.batteryCharge || 0).toFixed(1) }}%
          <span v-if="vehicle.charging" class="charging-text">⚡ Charging</span>
        </div>
      </div>

      <!-- Errors -->
      <div v-if="vehicle.errors && vehicle.errors.length > 0" class="detail-section error-section">
        <div class="section-title">⚠️ Errors ({{ vehicle.errors.length }})</div>
        <div v-for="(error, idx) in vehicle.errors" :key="idx" class="error-item">
          <q-badge :color="error.errorLevel === 'FATAL' ? 'negative' : 'warning'" class="error-badge">
            {{ error.errorLevel }}
          </q-badge>
          <span class="error-desc">{{ error.errorDescription || error.errorType || 'Unknown error' }}</span>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useVehicleStore } from '../stores/vehicleStore'
import { useEditorStore } from '../stores/editorStore'
import { useOrderApi } from '../composables/useOrderApi'

const store = useVehicleStore()
const editorStore = useEditorStore()
const { isSending, sendAction: apiSendAction } = useOrderApi()

const vehicle = computed(() => store.selectedVehicle)
const targetMap = ref('')

onMounted(async () => {
  await editorStore.fetchMaps()
})

const mapOptions = computed(() => {
  return editorStore.maps.map(m => ({ label: m.name, value: m.name }))
})

const speed = computed(() => {
  if (!vehicle.value) return 0
  const vx = vehicle.value.vx || 0
  const vy = vehicle.value.vy || 0
  return Math.sqrt(vx * vx + vy * vy)
})

const batteryColor = computed(() => {
  const charge = vehicle.value?.batteryCharge || 0
  if (charge > 60) return 'positive'
  if (charge > 30) return 'warning'
  return 'negative'
})

// Order Progress
const totalNodes = computed(() => vehicle.value?.nodeStates?.length || 0)
const completedNodes = computed(() => {
  if (!vehicle.value?.nodeStates) return 0
  return vehicle.value.nodeStates.filter(n => n.released).length
})
const orderProgressPercent = computed(() => {
  if (totalNodes.value === 0) return 0
  return (completedNodes.value / totalNodes.value) * 100
})

// Actions
const sendAction = async (type) => {
  if (!vehicle.value) return
  await apiSendAction(vehicle.value.serialNumber, type)
}

const initPosition = async () => {
  if (!vehicle.value || !targetMap.value) return
  
  await apiSendAction(vehicle.value.serialNumber, 'initPosition', {
    x: 0,
    y: 0,
    theta: 0,
    mapId: targetMap.value
  })
}
</script>

<style scoped>
.vehicle-detail {
  width: 280px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  height: 100%;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.vehicle-id {
  font-size: 18px;
  font-weight: 700;
  color: var(--oh-accent);
}

.vehicle-manufacturer {
  font-size: 12px;
  color: var(--oh-text-secondary);
}

.separator {
  opacity: 0.1;
}

.status-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-badge {
  padding: 4px 12px;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.5px;
  border-radius: 6px;
}

.operating-mode {
  color: var(--oh-text-secondary);
  font-size: 12px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--oh-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.data-item {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 6px 8px;
}

.data-label {
  font-size: 10px;
  color: var(--oh-text-secondary);
  text-transform: uppercase;
}

.data-value {
  font-size: 13px;
  font-weight: 500;
}

.battery-progress {
  border-radius: 6px;
}

.battery-label {
  font-size: 13px;
  display: flex;
  justify-content: space-between;
}

.charging-text {
  color: var(--oh-charging);
  font-size: 11px;
}

.error-section {
  border: 1px solid rgba(244, 67, 54, 0.2);
  border-radius: var(--oh-radius);
  padding: 10px;
  background: rgba(244, 67, 54, 0.05);
}

.error-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.error-badge {
  font-size: 10px;
  padding: 2px 6px;
}

.error-desc {
  font-size: 12px;
  color: var(--oh-text-secondary);
}

/* Actions */
.action-buttons {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.btn-action {
  flex: 1;
  padding: 6px;
  border-radius: 4px;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-pause { background: #FFC107; color: #000; }
.btn-resume { background: #4CAF50; color: #fff; }
.btn-cancel { background: #F44336; color: #fff; }

.btn-init-pos {
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  height: 40px;
}
.btn-init-pos:disabled {
  background: #555;
  cursor: not-allowed;
}

.move-vehicle-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  margin-top: 4px;
}

.move-map-select {
  flex: 1;
}

/* Order Info */
.order-info {
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 6px;
}

.order-id {
  font-size: 10px;
  color: var(--oh-text-secondary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  background: #2196F3;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 10px;
  color: var(--oh-text-secondary);
  text-align: right;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
