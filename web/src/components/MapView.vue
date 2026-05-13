<template>
  <div id="map-container" ref="mapContainer"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import { useVehicleStore } from '../stores/vehicleStore'

const store = useVehicleStore()
const mapContainer = ref(null)

let map = null
const markers = new Map()

// Vehicle icon SVG factory
function createVehicleIcon(color, theta = 0) {
  const rotation = (theta * 180 / Math.PI)
  const svg = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${rotation}, 16, 16)">
        <circle cx="16" cy="16" r="12" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2"/>
        <polygon points="16,4 24,22 16,18 8,22" fill="${color}" fill-opacity="0.8"/>
      </g>
    </svg>`

  return L.divIcon({
    html: svg,
    className: 'vehicle-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

// Charging station icon
function createChargingIcon() {
  const svg = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#26A69A" fill-opacity="0.3" stroke="#26A69A" stroke-width="1.5"/>
      <path d="M13 2L5 14h5l-1 8 8-12h-5l1-8z" fill="#26A69A"/>
    </svg>`

  return L.divIcon({
    html: svg,
    className: 'charging-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function initMap() {
  map = L.map(mapContainer.value, {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 5,
    zoomControl: true,
    attributionControl: false,
  })

  // Factory floor: 200m wide x 100m tall
  // In CRS.Simple: [y, x] = [lat, lng]
  // Set initial view to center of factory
  map.setView([50, 100], 0)

  // Draw grid background
  const factoryWidth = 200
  const factoryHeight = 100
  drawGrid(factoryWidth, factoryHeight)

  // Add factory boundary
  const corner1 = L.latLng(0, 0)
  const corner2 = L.latLng(factoryHeight, factoryWidth)
  L.rectangle([corner1, corner2], {
    color: 'rgba(255, 152, 0, 0.3)',
    weight: 2,
    fill: false,
    dashArray: '8, 4',
  }).addTo(map)

  // Add charging station markers
  const chargingStations = [
    { name: 'CS-01', x: 10, y: 10 },
    { name: 'CS-02', x: 190, y: 90 },
  ]

  chargingStations.forEach(cs => {
    L.marker([cs.y, cs.x], { icon: createChargingIcon() })
      .bindTooltip(`⚡ ${cs.name}`, {
        permanent: true,
        direction: 'top',
        offset: [0, -16],
        className: 'charging-tooltip',
      })
      .addTo(map)
  })
}

function drawGrid(width, height) {
  const gridGroup = L.layerGroup().addTo(map)
  const step = 10 // 10m grid

  // Vertical lines
  for (let x = 0; x <= width; x += step) {
    L.polyline([[0, x], [height, x]], {
      color: 'rgba(255, 255, 255, 0.06)',
      weight: 1,
    }).addTo(gridGroup)
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += step) {
    L.polyline([[y, 0], [y, width]], {
      color: 'rgba(255, 255, 255, 0.06)',
      weight: 1,
    }).addTo(gridGroup)
  }

  // Axis labels
  for (let x = 0; x <= width; x += 50) {
    L.marker([-3, x], {
      icon: L.divIcon({
        html: `<span style="color: rgba(255,255,255,0.3); font-size: 10px; font-family: 'JetBrains Mono', monospace;">${x}m</span>`,
        className: 'grid-label',
        iconSize: [30, 15],
        iconAnchor: [15, 0],
      })
    }).addTo(gridGroup)
  }

  for (let y = 0; y <= height; y += 50) {
    L.marker([y, -5], {
      icon: L.divIcon({
        html: `<span style="color: rgba(255,255,255,0.3); font-size: 10px; font-family: 'JetBrains Mono', monospace;">${y}m</span>`,
        className: 'grid-label',
        iconSize: [30, 15],
        iconAnchor: [30, 7],
      })
    }).addTo(gridGroup)
  }
}

function updateMarkers() {
  const vehicleList = store.vehicleList

  vehicleList.forEach(vehicle => {
    const key = vehicle.serialNumber
    const color = store.getStatusColor(vehicle)
    const icon = createVehicleIcon(color, vehicle.theta || 0)
    const latLng = [vehicle.y || 0, vehicle.x || 0]

    if (markers.has(key)) {
      const marker = markers.get(key)
      marker.setLatLng(latLng)
      marker.setIcon(icon)
    } else {
      const marker = L.marker(latLng, { icon })
        .on('click', () => {
          store.selectVehicle(vehicle.serialNumber)
        })
        .addTo(map)

      marker.bindTooltip(() => {
        const v = store.vehicles.get(key)
        if (!v) return key
        const status = store.getStatus(v)
        return `<b>${key}</b><br/>🔋 ${v.batteryCharge?.toFixed(0) ?? '?'}% | ${status}`
      }, { direction: 'top', offset: [0, -20] })

      markers.set(key, marker)
    }
  })

  // Remove markers for vehicles that no longer exist
  for (const [key, marker] of markers) {
    if (!store.vehicles.has(key)) {
      map.removeLayer(marker)
      markers.delete(key)
    }
  }
}

// Fly to selected vehicle
function flyToVehicle(serialNumber) {
  if (!serialNumber || !markers.has(serialNumber)) return
  const marker = markers.get(serialNumber)
  map.flyTo(marker.getLatLng(), 2, { duration: 0.5 })
  marker.openTooltip()
}

// Watch for vehicle updates
let updateInterval = null

onMounted(() => {
  initMap()
  updateInterval = setInterval(updateMarkers, 200) // 5 fps update
})

onUnmounted(() => {
  if (updateInterval) clearInterval(updateInterval)
  if (map) map.remove()
})

// Watch selected vehicle changes to fly to it
watch(() => store.selectedVehicleId, (newId) => {
  if (newId) flyToVehicle(newId)
})

defineExpose({ flyToVehicle })
</script>

<style scoped>
#map-container {
  width: 100%;
  height: 100%;
  border-radius: 0;
}

:deep(.vehicle-marker) {
  background: none !important;
  border: none !important;
  transition: transform 0.2s ease;
}

:deep(.charging-marker) {
  background: none !important;
  border: none !important;
}

:deep(.charging-tooltip) {
  background: rgba(38, 166, 154, 0.2) !important;
  border: 1px solid rgba(38, 166, 154, 0.5) !important;
  color: #26A69A !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 2px 8px !important;
  box-shadow: none !important;
}

:deep(.charging-tooltip::before) {
  border-top-color: rgba(38, 166, 154, 0.5) !important;
}

:deep(.grid-label) {
  background: none !important;
  border: none !important;
}
</style>
