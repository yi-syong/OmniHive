<template>
  <div class="canvas-container">
    <div id="editor-map" class="editor-map"></div>
    
    <!-- Calibration Overlay -->
    <div v-if="calibrating" class="calibration-overlay">
      <div class="calibration-banner bg-warning text-dark q-pa-sm text-center font-weight-bold">
        Calibration Mode: Click two points on the map to define a distance.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import L from 'leaflet'
import { Notify, Dialog } from 'quasar'
import { useEditorStore } from '../../stores/editorStore'

const store = useEditorStore()
let map = null
let imageOverlay = null
let nodeLayer = null
let edgeLayer = null

const calibrating = ref(false)
let calibPoints = []
let calibMarkers = []
let calibLine = null

const currentMap = computed(() => store.maps.find(m => m.id === store.activeMapId))

onMounted(async () => {
  initMap()
  window.addEventListener('editor:calibrate', startCalibration)
  window.addEventListener('editor:network-updated', renderNetwork)
  // Load map image if activeMapId is already set when component mounts
  if (store.activeMapId) {
    await loadMapImage()
    renderNetwork()
  }
})

onUnmounted(() => {
  if (map) map.remove()
  window.removeEventListener('editor:calibrate', startCalibration)
  window.removeEventListener('editor:network-updated', renderNetwork)
})

watch(() => store.activeMapId, async (newVal, oldVal) => {
  if (newVal === oldVal) return
  await loadMapImage()
  renderNetwork()
})

const initMap = () => {
  map = L.map('editor-map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 3,
    zoomControl: false,
    doubleClickZoom: false // disable to allow double click to add node
  })

  L.control.zoom({ position: 'bottomright' }).addTo(map)

  nodeLayer = L.layerGroup().addTo(map)
  edgeLayer = L.layerGroup().addTo(map)

  // Double click to add Node
  map.on('dblclick', (e) => {
    if (calibrating.value) return
    if (!currentMap.value) return
    
    // Create unsaved node
    const mpp = currentMap.value.metersPerPixel
    const newId = 'Node_' + Math.floor(Math.random()*1000)
    const newNode = {
      nodeId: newId,
      x: e.latlng.lng * mpp,
      y: e.latlng.lat * mpp, // Y is inverted in Leaflet Simple CRS usually, but lets keep it simple
      description: ''
    }
    
    // Select it to open property panel
    window.dispatchEvent(new CustomEvent('editor:select', {
      detail: { type: 'node', data: newNode }
    }))
    
    // Optimistically render it as a ghost
    renderNodeGhost(newNode)
  })

  // Calibration clicks
  map.on('click', (e) => {
    if (calibrating.value) {
      handleCalibrationClick(e.latlng)
    }
  })
}

const loadMapImage = () => {
  return new Promise((resolve) => {
    if (!currentMap.value || !currentMap.value.imageUrl) {
      if (imageOverlay) map.removeLayer(imageOverlay)
      resolve()
      return
    }

    console.log('[NetworkCanvas] Loading map image:', currentMap.value.imageUrl)

    const img = new Image()
    img.onload = () => {
      const w = img.width
      const h = img.height
      console.log('[NetworkCanvas] Image loaded:', w, 'x', h)
      const bounds = [[0, 0], [h, w]]

      if (imageOverlay) map.removeLayer(imageOverlay)
      imageOverlay = L.imageOverlay(currentMap.value.imageUrl, bounds).addTo(map)
      imageOverlay.bringToBack()
      
      map.fitBounds(bounds)
      resolve()
    }
    img.onerror = (err) => {
      console.error('[NetworkCanvas] Failed to load map image:', currentMap.value.imageUrl, err)
      resolve()
    }
    img.src = currentMap.value.imageUrl
  })
}

const renderNetwork = () => {
  nodeLayer.clearLayers()
  edgeLayer.clearLayers()

  if (!currentMap.value) return

  const mpp = currentMap.value.metersPerPixel
  
  // Render Edges
  store.edges.forEach(edge => {
    const startNode = store.nodes.find(n => n.nodeId === edge.startNodeId)
    const endNode = store.nodes.find(n => n.nodeId === edge.endNodeId)
    
    if (startNode && endNode) {
      const latlngs = [
        [startNode.y / mpp, startNode.x / mpp],
        [endNode.y / mpp, endNode.x / mpp]
      ]
      
      const polyline = L.polyline(latlngs, {
        color: edge.direction === 'bidirectional' ? '#2196F3' : '#FF9800',
        weight: 3,
        opacity: 0.8
      }).addTo(edgeLayer)

      polyline.on('click', () => {
        window.dispatchEvent(new CustomEvent('editor:select', {
          detail: { type: 'edge', data: edge }
        }))
      })
    }
  })

  // Render Nodes
  store.nodes.forEach(node => {
    const latlng = [node.y / mpp, node.x / mpp]
    const marker = L.circleMarker(latlng, {
      radius: 6,
      fillColor: '#4CAF50',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(nodeLayer)

    // Tooltip
    marker.bindTooltip(node.nodeId, { permanent: false, direction: 'top' })

    // Click to select
    marker.on('click', () => {
      window.dispatchEvent(new CustomEvent('editor:select', {
        detail: { type: 'node', data: node }
      }))
    })
  })
}

const renderNodeGhost = (node) => {
  if (!currentMap.value) return
  const mpp = currentMap.value.metersPerPixel
  L.circleMarker([node.y / mpp, node.x / mpp], {
    radius: 6,
    fillColor: '#FFC107', // Warning color for unsaved
    color: '#fff',
    weight: 2,
    dashArray: '4'
  }).addTo(nodeLayer)
}

// --- Calibration Logic ---
const startCalibration = () => {
  calibrating.value = true
  calibPoints = []
  clearCalibrationOverlays()
  map.getContainer().style.cursor = 'crosshair'
}

const handleCalibrationClick = (latlng) => {
  calibPoints.push(latlng)
  
  const marker = L.circleMarker(latlng, { color: 'red', radius: 5 }).addTo(map)
  calibMarkers.push(marker)

  if (calibPoints.length === 2) {
    // Draw line
    calibLine = L.polyline(calibPoints, { color: 'red', dashArray: '5, 5' }).addTo(map)
    
    // Calculate pixel distance
    const p1 = map.project(calibPoints[0], map.getMaxZoom())
    const p2 = map.project(calibPoints[1], map.getMaxZoom())
    const pixelDist = p1.distanceTo(p2)

    // Ask user for real world distance
    Dialog.create({
      title: 'Calibration',
      message: 'Enter the actual distance between these two points in meters:',
      prompt: {
        model: '',
        type: 'number'
      },
      cancel: true,
      persistent: true
    }).onOk(async data => {
      const realDist = parseFloat(data)
      if (realDist > 0) {
        const metersPerPixel = realDist / pixelDist
        await submitCalibration(metersPerPixel)
      } else {
        Notify.create({ message: 'Invalid distance', color: 'negative' })
      }
      endCalibration()
    }).onCancel(() => {
      endCalibration()
    })
  }
}

const submitCalibration = async (mpp) => {
  try {
    const res = await fetch(`/api/v1/maps/${store.activeMapId}/calibrate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metersPerPixel: mpp })
    })
    if (res.ok) {
      Notify.create({ message: 'Calibration saved!', color: 'positive' })
      await store.fetchMaps() // reload maps
      renderNetwork() // redraw
    }
  } catch (e) {
    Notify.create({ message: 'Calibration failed', color: 'negative' })
  }
}

const endCalibration = () => {
  calibrating.value = false
  clearCalibrationOverlays()
  map.getContainer().style.cursor = ''
}

const clearCalibrationOverlays = () => {
  calibMarkers.forEach(m => map.removeLayer(m))
  calibMarkers = []
  if (calibLine) {
    map.removeLayer(calibLine)
    calibLine = null
  }
}
</script>

<style scoped>
.canvas-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.editor-map {
  width: 100%;
  height: 100%;
  background-color: #0f0f1a; /* Dark background */
}

.calibration-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  pointer-events: none;
}
</style>
