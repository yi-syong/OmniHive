<template>
  <div class="map-wrapper">
    <div id="map-container" ref="mapContainer"></div>

    <!-- Mode Toggle -->
    <div class="mode-toggle" v-if="store.selectedVehicleId && store.selectedMapName !== 'all'">
      <button :class="{ active: store.dashboardMode === 'monitoring' }" @click="setMode('monitoring')">
        <i class="fas fa-eye"></i> Monitoring
      </button>
      <button :class="{ active: store.dashboardMode === 'dispatch' }" @click="setMode('dispatch')">
        <i class="fas fa-route"></i> Dispatch
      </button>
    </div>

    <!-- Dispatch Panel -->
    <div class="dispatch-panel" v-if="store.dashboardMode === 'dispatch'">
      <h3>Dispatch Order</h3>
      <p class="subtitle">Click nodes to build path for <strong>{{ store.selectedVehicleId }}</strong></p>
      
      <div class="selected-path" v-if="dispatchPath.length > 0">
        <div v-for="(nodeId, idx) in dispatchPath" :key="idx" class="path-node">
          {{ nodeId }}
          <i v-if="idx < dispatchPath.length - 1" class="fas fa-arrow-right"></i>
        </div>
      </div>
      <div v-else class="empty-path">No nodes selected.</div>

      <div class="dispatch-actions">
        <button class="btn-clear" @click="clearPath" :disabled="dispatchPath.length === 0">Clear</button>
        <button class="btn-send" @click="submitOrder" :disabled="dispatchPath.length === 0 || isSending">
          <i class="fas fa-paper-plane" v-if="!isSending"></i>
          {{ isSending ? 'Sending...' : 'Send Order' }}
        </button>
      </div>
      <div v-if="error" class="error-msg">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import L from 'leaflet'
import { useVehicleStore } from '../stores/vehicleStore'
import { useEditorStore } from '../stores/editorStore'
import { useOrderApi } from '../composables/useOrderApi'

const store = useVehicleStore()
const editorStore = useEditorStore()
const { isSending, error, sendOrder } = useOrderApi()
const mapContainer = ref(null)

let map = null
const markers = new Map() // maps serialNumber to L.polygon (vehicle footprint)
let imageOverlay = null
let gridGroup = null
let boundaryLayer = null
let networkGroup = null
let pathGroup = null
let trajectoryGroup = null

// Dispatch state
const dispatchPath = ref([])
let networkNodes = []

function setMode(mode) {
  store.dashboardMode = mode
  if (mode === 'dispatch') {
    loadNetwork()
  } else {
    clearDispatch()
  }
}

function clearPath() {
  dispatchPath.value = []
  renderDispatchPath()
}

function clearDispatch() {
  clearPath()
  if (networkGroup) networkGroup.clearLayers()
}

async function submitOrder() {
  if (dispatchPath.value.length === 0) return
  const success = await sendOrder(store.selectedVehicleId, dispatchPath.value)
  if (success) {
    setMode('monitoring') // auto switch back
  }
}

// Vehicle Polygon Factory (Real dimensions in meters)
function getVehiclePolygonCoords(x, y, theta, length = 1.6, width = 1.0) {
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  
  // Calculate 4 corners relative to center (0,0) then rotate and translate
  const corners = [
    { cx: length / 2, cy: width / 2 },
    { cx: -length / 2, cy: width / 2 },
    { cx: -length / 2, cy: -width / 2 },
    { cx: length / 2, cy: -width / 2 }
  ]
  
  return corners.map(c => {
    // Leaflet uses [y, x] for coordinates
    const rx = c.cx * cosT - c.cy * sinT
    const ry = c.cx * sinT + c.cy * cosT
    return [y + ry, x + rx] // L.polygon takes [lat(y), lng(x)]
  })
}

// Direction indicator (triangle pointing forward)
function getVehicleDirIndicator(x, y, theta, length = 1.6) {
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  const nose = length / 2
  return [y + nose * sinT, x + nose * cosT]
}

async function initMap() {
  map = L.map(mapContainer.value, {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 5,
    zoomControl: true,
    attributionControl: false,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120,
  })

  gridGroup = L.layerGroup().addTo(map)
  networkGroup = L.layerGroup().addTo(map)
  pathGroup = L.layerGroup().addTo(map)
  trajectoryGroup = L.layerGroup().addTo(map)

  await editorStore.fetchMaps()
  
  if (store.selectedMapName !== 'all') {
    const activeMap = editorStore.maps.find(m => m.name === store.selectedMapName)
    if (activeMap) {
      await loadMapImage(activeMap)
      loadTrajectories()
    } else {
      loadDefaultView()
    }
  } else {
    loadDefaultView()
  }
}

function loadDefaultView() {
  if (imageOverlay) {
    map.removeLayer(imageOverlay)
    imageOverlay = null
  }
  map.setView([50, 100], 0)
  gridGroup.clearLayers()
  if (boundaryLayer) map.removeLayer(boundaryLayer)

  drawGrid(200, 100)
  const corner1 = L.latLng(0, 0)
  const corner2 = L.latLng(100, 200)
  boundaryLayer = L.rectangle([corner1, corner2], {
    color: 'rgba(255, 152, 0, 0.3)',
    weight: 2,
    fill: false,
    dashArray: '8, 4',
  }).addTo(map)
}

const loadMapImage = (mapData) => {
  return new Promise((resolve) => {
    if (!mapData || !mapData.imageUrl) {
      resolve()
      return
    }

    gridGroup.clearLayers()
    if (boundaryLayer) {
      map.removeLayer(boundaryLayer)
      boundaryLayer = null
    }

    const img = new Image()
    img.onload = () => {
      const w = img.width
      const h = img.height
      const bounds = [[0, 0], [h, w]]

      if (imageOverlay) map.removeLayer(imageOverlay)
      imageOverlay = L.imageOverlay(mapData.imageUrl, bounds).addTo(map)
      imageOverlay.bringToBack()
      
      map.fitBounds(bounds)
      resolve()
    }
    img.onerror = () => resolve()
    img.src = mapData.imageUrl
  })
}

function drawGrid(width, height) {
  const step = 10
  for (let x = 0; x <= width; x += step) {
    L.polyline([[0, x], [height, x]], { color: 'rgba(255, 255, 255, 0.06)', weight: 1 }).addTo(gridGroup)
  }
  for (let y = 0; y <= height; y += step) {
    L.polyline([[y, 0], [y, width]], { color: 'rgba(255, 255, 255, 0.06)', weight: 1 }).addTo(gridGroup)
  }
}

// Map real dimensions to vehicle
function updateMarkers() {
  let vehicleList = store.vehicleList

  if (store.selectedMapName !== 'all') {
    vehicleList = vehicleList.filter(v => v.mapId === store.selectedMapName)
  }

  vehicleList.forEach(vehicle => {
    const key = vehicle.serialNumber
    const color = store.getStatusColor(vehicle)
    const coords = getVehiclePolygonCoords(vehicle.x, vehicle.y, vehicle.theta)

    if (markers.has(key)) {
      const { poly, dirLine } = markers.get(key)
      poly.setLatLngs(coords)
      poly.setStyle({ color: color, fillColor: color })
      
      const nose = getVehicleDirIndicator(vehicle.x, vehicle.y, vehicle.theta)
      dirLine.setLatLngs([[vehicle.y, vehicle.x], nose])
      dirLine.setStyle({ color: '#fff' })
    } else {
      const poly = L.polygon(coords, {
        color: color,
        fillColor: color,
        fillOpacity: 0.4,
        weight: 2,
        className: 'vehicle-polygon'
      }).on('click', () => {
        store.selectVehicle(key)
      }).addTo(map)

      poly.bindTooltip(() => {
        const v = store.vehicles.get(key)
        if (!v) return key
        const status = store.getStatus(v)
        return `<b>${key}</b><br/>🔋 ${v.batteryCharge?.toFixed(0) ?? '?'}% | ${status}`
      }, { direction: 'top' })

      const nose = getVehicleDirIndicator(vehicle.x, vehicle.y, vehicle.theta)
      const dirLine = L.polyline([[vehicle.y, vehicle.x], nose], {
        color: '#fff',
        weight: 2,
        dashArray: '2, 4'
      }).addTo(map)

      markers.set(key, { poly, dirLine })
    }
  })

  for (const [key, layers] of markers) {
    if (!store.vehicles.has(key)) {
      map.removeLayer(layers.poly)
      map.removeLayer(layers.dirLine)
      markers.delete(key)
    }
  }
}

// Network and Dispatch
async function loadNetwork() {
  if (store.selectedMapName === 'all') return
  const activeMap = editorStore.maps.find(m => m.name === store.selectedMapName)
  if (!activeMap) return
  
  networkGroup.clearLayers()
  
  try {
    const res = await fetch(`/api/v1/network?mapId=${activeMap.id}`)
    if (res.ok) {
      const data = await res.json()
      networkNodes = data.nodes || []
      const edges = data.edges || []

      // Draw edges
      edges.forEach(edge => {
        const start = networkNodes.find(n => n.nodeId === edge.startNodeId)
        const end = networkNodes.find(n => n.nodeId === edge.endNodeId)
        if (start && end) {
          L.polyline([[start.y, start.x], [end.y, end.x]], {
            color: 'rgba(255, 255, 255, 0.3)',
            weight: 2,
            dashArray: '5, 5'
          }).addTo(networkGroup)
        }
      })

      // Draw nodes
      networkNodes.forEach(node => {
        L.circleMarker([node.y, node.x], {
          radius: 6,
          color: '#2196F3',
          fillColor: '#1976D2',
          fillOpacity: 0.8,
          weight: 2,
          className: 'dispatch-node'
        })
        .on('click', () => handleNodeClick(node.nodeId))
        .bindTooltip(node.nodeId, { permanent: true, direction: 'right', className: 'node-label' })
        .addTo(networkGroup)
      })
    }
  } catch (err) {
    console.error("Failed to load network:", err)
  }
}

function handleNodeClick(nodeId) {
  if (store.dashboardMode !== 'dispatch') return
  
  const lastNode = dispatchPath.value[dispatchPath.value.length - 1]
  if (lastNode === nodeId) return // prevent double click
  
  dispatchPath.value.push(nodeId)
  renderDispatchPath()
}

function renderDispatchPath() {
  pathGroup.clearLayers()
  if (dispatchPath.value.length < 2) return

  const pathCoords = []
  dispatchPath.value.forEach(nodeId => {
    const node = networkNodes.find(n => n.nodeId === nodeId)
    if (node) pathCoords.push([node.y, node.x])
  })

  L.polyline(pathCoords, {
    color: '#00E5FF',
    weight: 4,
    opacity: 0.8
  }).addTo(pathGroup)
}

// Trajectory history
async function loadTrajectories() {
  if (!store.selectedVehicleId) return
  trajectoryGroup.clearLayers()

  try {
    const res = await fetch(`/api/v1/vehicles/${store.selectedVehicleId}/trajectory`)
    if (res.ok) {
      const points = await res.json()
      if (points.length < 2) return

      // Filter points to current map
      const mapPoints = points.filter(p => p.mapId === store.selectedMapName)
      if (mapPoints.length < 2) return

      const coords = mapPoints.map(p => [p.y, p.x])
      L.polyline(coords, {
        color: 'rgba(255, 255, 255, 0.15)',
        weight: 3,
        dashArray: '4, 8'
      }).addTo(trajectoryGroup)
    }
  } catch (err) {
    console.error("Failed to load trajectory:", err)
  }
}

function flyToVehicle(serialNumber) {
  if (!serialNumber || !markers.has(serialNumber)) return
  const { poly } = markers.get(serialNumber)
  map.flyTo(poly.getBounds().getCenter(), 2, { duration: 0.5 })
  poly.openTooltip()
  loadTrajectories()
}

let updateInterval = null
onMounted(() => {
  initMap()
  updateInterval = setInterval(updateMarkers, 200)
})

onUnmounted(() => {
  if (updateInterval) clearInterval(updateInterval)
  if (map) map.remove()
})

watch(() => store.selectedVehicleId, (newId) => {
  if (newId) {
    flyToVehicle(newId)
  } else {
    trajectoryGroup.clearLayers()
    if (store.dashboardMode === 'dispatch') setMode('monitoring')
  }
})

watch(() => store.selectedMapName, async (newMapName) => {
  if (store.dashboardMode === 'dispatch') setMode('monitoring')
  
  if (newMapName === 'all') {
    loadDefaultView()
  } else {
    await editorStore.fetchMaps()
    const activeMap = editorStore.maps.find(m => m.name === newMapName)
    if (activeMap) {
      await loadMapImage(activeMap)
      loadTrajectories()
    } else {
      loadDefaultView()
    }
  }
  
  for (const [key, layers] of markers) {
    map.removeLayer(layers.poly)
    map.removeLayer(layers.dirLine)
  }
  markers.clear()
  updateMarkers()
})

defineExpose({ flyToVehicle })
</script>

<style scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

#map-container {
  width: 100%;
  height: 100%;
  border-radius: 0;
  z-index: 1;
}

.mode-toggle {
  position: absolute;
  top: 20px;
  left: 60px; /* Right of zoom controls */
  z-index: 1000;
  display: flex;
  background: rgba(20, 20, 25, 0.85);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.mode-toggle button {
  background: transparent;
  border: none;
  color: #888;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-toggle button:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.mode-toggle button.active {
  background: rgba(33, 150, 243, 0.2);
  color: #42A5F5;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2);
}

.dispatch-panel {
  position: absolute;
  top: 80px;
  left: 60px;
  z-index: 1000;
  background: rgba(20, 20, 25, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  width: 300px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  color: #fff;
}

.dispatch-panel h3 {
  margin: 0 0 4px 0;
  font-size: 1.1rem;
  color: #fff;
}

.dispatch-panel .subtitle {
  margin: 0 0 16px 0;
  font-size: 0.85rem;
  color: #aaa;
}

.selected-path {
  background: rgba(0,0,0,0.3);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.empty-path {
  color: #666;
  font-style: italic;
  font-size: 0.9rem;
  margin-bottom: 16px;
  padding: 12px;
  text-align: center;
}

.path-node {
  background: rgba(33, 150, 243, 0.2);
  color: #90CAF9;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.path-node i {
  color: #555;
  font-size: 0.7rem;
}

.dispatch-actions {
  display: flex;
  gap: 12px;
}

.dispatch-actions button {
  flex: 1;
  padding: 10px;
  border-radius: 6px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-clear {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.btn-clear:hover:not(:disabled) { background: rgba(255, 255, 255, 0.15); }
.btn-clear:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-send {
  background: #2196F3;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-send:hover:not(:disabled) { background: #1976D2; box-shadow: 0 0 15px rgba(33, 150, 243, 0.4); }
.btn-send:disabled { background: #333; color: #777; cursor: not-allowed; }

.error-msg {
  color: #F44336;
  font-size: 0.85rem;
  margin-top: 12px;
  padding: 8px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 4px;
}

:deep(.vehicle-polygon) {
  transition: all 0.2s ease;
}
:deep(.dispatch-node) {
  cursor: crosshair !important;
}
:deep(.node-label) {
  background: transparent !important;
  border: none !important;
  color: rgba(255,255,255,0.7) !important;
  box-shadow: none !important;
  font-size: 10px;
  font-weight: bold;
}
</style>
