import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useVehicleStore = defineStore('vehicles', () => {
  // State
  const vehicles = ref(new Map())
  const selectedVehicleId = ref(null)
  const selectedMapName = ref('all')
  const connectionStatus = ref('disconnected') // disconnected, connecting, connected

  // Getters
  const vehicleList = computed(() => {
    return Array.from(vehicles.value.values()).sort((a, b) =>
      a.serialNumber.localeCompare(b.serialNumber)
    )
  })

  const selectedVehicle = computed(() => {
    if (!selectedVehicleId.value) return null
    return vehicles.value.get(selectedVehicleId.value) || null
  })

  const onlineCount = computed(() =>
    vehicleList.value.filter(v => v.connectionState === 'ONLINE').length
  )

  const drivingCount = computed(() =>
    vehicleList.value.filter(v => v.driving).length
  )

  const chargingCount = computed(() =>
    vehicleList.value.filter(v => v.charging).length
  )

  const errorCount = computed(() =>
    vehicleList.value.filter(v => v.errorCount > 0).length
  )

  const totalCount = computed(() => vehicles.value.size)

  // Actions
  function updateFromState(state) {
    const key = state.serialNumber
    const existing = vehicles.value.get(key) || {}

    vehicles.value.set(key, {
      ...existing,
      serialNumber: state.serialNumber,
      manufacturer: state.manufacturer,
      connectionState: 'ONLINE',
      driving: state.driving,
      paused: state.paused || false,
      operatingMode: state.operatingMode,
      batteryCharge: state.batteryState?.batteryCharge ?? 0,
      charging: state.batteryState?.charging ?? false,
      x: state.agvPosition?.x ?? 0,
      y: state.agvPosition?.y ?? 0,
      theta: state.agvPosition?.theta ?? 0,
      mapId: state.agvPosition?.mapId ?? 'factory-default',
      vx: state.velocity?.vx ?? 0,
      vy: state.velocity?.vy ?? 0,
      errors: state.errors || [],
      errorCount: (state.errors || []).length,
      lastUpdate: Date.now(),
    })

    // Trigger reactivity
    vehicles.value = new Map(vehicles.value)
  }

  function updateFromVisualization(viz) {
    const key = viz.serialNumber
    const existing = vehicles.value.get(key)
    if (!existing) return

    existing.x = viz.agvPosition?.x ?? existing.x
    existing.y = viz.agvPosition?.y ?? existing.y
    existing.theta = viz.agvPosition?.theta ?? existing.theta
    existing.mapId = viz.agvPosition?.mapId ?? existing.mapId
    existing.vx = viz.velocity?.vx ?? existing.vx
    existing.vy = viz.velocity?.vy ?? existing.vy
    existing.lastUpdate = Date.now()

    vehicles.value = new Map(vehicles.value)
  }

  function updateFromConnection(conn) {
    const key = conn.serialNumber
    const existing = vehicles.value.get(key) || {}

    vehicles.value.set(key, {
      ...existing,
      serialNumber: conn.serialNumber,
      manufacturer: conn.manufacturer,
      connectionState: conn.connectionState,
      lastUpdate: Date.now(),
    })

    vehicles.value = new Map(vehicles.value)
  }

  function selectVehicle(serialNumber) {
    selectedVehicleId.value = serialNumber
    const v = vehicles.value.get(serialNumber)
    if (v && v.mapId) {
      selectedMapName.value = v.mapId
    }
  }

  function clearSelection() {
    selectedVehicleId.value = null
  }

  function setConnectionStatus(status) {
    connectionStatus.value = status
  }

  // Get vehicle status label
  function getStatus(vehicle) {
    if (!vehicle) return 'unknown'
    if (vehicle.connectionState === 'OFFLINE') return 'offline'
    if (vehicle.connectionState === 'CONNECTIONBROKEN') return 'offline'
    if (vehicle.errorCount > 0) return 'error'
    if (vehicle.charging) return 'charging'
    if (vehicle.paused) return 'paused'
    if (vehicle.driving) return 'driving'
    return 'idle'
  }

  function getStatusColor(vehicle) {
    const status = getStatus(vehicle)
    const colors = {
      driving: '#4CAF50',
      charging: '#26A69A',
      error: '#F44336',
      paused: '#FFC107',
      offline: '#757575',
      idle: '#9E9E9E',
      unknown: '#757575',
    }
    return colors[status] || colors.unknown
  }

  return {
    vehicles,
    selectedVehicleId,
    selectedMapName,
    connectionStatus,
    vehicleList,
    selectedVehicle,
    onlineCount,
    drivingCount,
    chargingCount,
    errorCount,
    totalCount,
    updateFromState,
    updateFromVisualization,
    updateFromConnection,
    selectVehicle,
    clearSelection,
    setConnectionStatus,
    getStatus,
    getStatusColor,
  }
})
