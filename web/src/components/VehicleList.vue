<template>
  <div class="vehicle-list">
    <div class="list-header">
      <span class="header-title">🚗 Vehicles</span>
      <q-badge :color="store.onlineCount > 0 ? 'positive' : 'grey'" class="count-badge">
        {{ store.onlineCount }} / {{ store.totalCount }}
      </q-badge>
    </div>

    <!-- Map selector -->
    <div class="map-selector-container q-px-md q-pt-md">
      <q-select
        v-model="store.selectedMapName"
        :options="mapOptions"
        emit-value
        map-options
        dark
        dense
        outlined
        label="Select Map / Floor"
        class="full-width"
        color="orange"
      />
    </div>

    <!-- Filter tabs -->
    <div class="filter-tabs">
      <q-btn-toggle
        v-model="filter"
        no-caps
        rounded
        toggle-color="orange"
        text-color="grey-5"
        size="xs"
        :options="filterOptions"
        class="filter-toggle"
      />
    </div>

    <!-- Vehicle items -->
    <q-scroll-area class="vehicle-scroll">
      <transition-group name="list" tag="div">
        <div
          v-for="vehicle in filteredVehicles"
          :key="vehicle.serialNumber"
          class="vehicle-item"
          :class="{ selected: store.selectedVehicleId === vehicle.serialNumber }"
          @click="store.selectVehicle(vehicle.serialNumber)"
        >
          <div class="vehicle-status-dot" :style="{ backgroundColor: store.getStatusColor(vehicle) }"></div>

          <div class="vehicle-info">
            <div class="vehicle-name">{{ vehicle.serialNumber }}</div>
            <div class="vehicle-meta">
              <span class="status-label">{{ store.getStatus(vehicle) }}</span>
            </div>
          </div>

          <div class="vehicle-battery">
            <q-linear-progress
              :value="(vehicle.batteryCharge || 0) / 100"
              :color="batteryColor(vehicle.batteryCharge)"
              track-color="grey-9"
              size="6px"
              rounded
              class="battery-bar"
            />
            <span class="battery-text mono">{{ (vehicle.batteryCharge || 0).toFixed(0) }}%</span>
          </div>
        </div>
      </transition-group>

      <div v-if="filteredVehicles.length === 0" class="no-vehicles">
        <q-icon name="directions_car" size="32px" color="grey-7" />
        <span>No vehicles{{ filter !== 'all' ? ' matching filter' : '' }}</span>
      </div>
    </q-scroll-area>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useVehicleStore } from '../stores/vehicleStore'
import { useEditorStore } from '../stores/editorStore'

const store = useVehicleStore()
const editorStore = useEditorStore()
const filter = ref('all')

onMounted(async () => {
  await editorStore.fetchMaps()
})

const mapOptions = computed(() => {
  const options = [{ label: 'All Maps (Default Grid)', value: 'all' }]
  editorStore.maps.forEach(m => {
    options.push({ label: m.name, value: m.name })
  })
  return options
})

const filterOptions = [
  { label: 'All', value: 'all' },
  { label: '🟢', value: 'driving' },
  { label: '⚡', value: 'charging' },
  { label: '🔴', value: 'error' },
  { label: '⚪', value: 'offline' },
]

const filteredVehicles = computed(() => {
  let list = store.vehicleList
  
  // 1. Filter by selected map
  if (store.selectedMapName !== 'all') {
    list = list.filter(v => v.mapId === store.selectedMapName)
  }

  // 2. Filter by status tabs
  if (filter.value === 'all') return list
  return list.filter(v => {
    const status = store.getStatus(v)
    if (filter.value === 'offline') return status === 'offline'
    return status === filter.value
  })
})

function batteryColor(charge) {
  if (charge > 60) return 'positive'
  if (charge > 30) return 'warning'
  return 'negative'
}
</script>

<style scoped>
.vehicle-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--oh-bg-secondary);
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--oh-border);
}

.header-title {
  font-weight: 600;
  font-size: 14px;
}

.count-badge {
  font-size: 11px;
  padding: 2px 8px;
}

.filter-tabs {
  padding: 8px 12px;
  border-bottom: 1px solid var(--oh-border);
}

.filter-toggle {
  width: 100%;
}

.vehicle-scroll {
  flex: 1;
}

.vehicle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: var(--oh-transition);
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.vehicle-item:hover {
  background: var(--oh-bg-card);
}

.vehicle-item.selected {
  background: var(--oh-bg-card);
  border-left: 3px solid var(--oh-accent);
  padding-left: 13px;
}

.vehicle-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.vehicle-info {
  flex: 1;
  min-width: 0;
}

.vehicle-name {
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vehicle-meta {
  font-size: 11px;
  color: var(--oh-text-secondary);
  text-transform: capitalize;
}

.vehicle-battery {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 50px;
}

.battery-bar {
  width: 50px;
}

.battery-text {
  font-size: 11px;
  color: var(--oh-text-secondary);
}

.no-vehicles {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  color: var(--oh-text-secondary);
  font-size: 13px;
}

/* List transition */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
