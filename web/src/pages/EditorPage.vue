<template>
  <div class="editor-layout">
    <TopBar />
    <div class="main-content">
      <div class="sidebar">
        <div class="q-pa-md">
          <div class="text-h6 q-mb-md">Map Settings</div>
          
          <q-select 
            v-model="editorStore.activeMapId" 
            :options="mapOptions" 
            option-value="id" 
            option-label="name" 
            emit-value 
            map-options 
            label="Select Map" 
            outlined 
            dark
            class="q-mb-md"
            @update:model-value="onMapChange"
          />

          <q-btn color="primary" label="Upload New Map" class="full-width q-mb-md" @click="showUploadDialog = true" />

          <q-separator dark class="q-my-md" />

          <div v-if="editorStore.activeMapId">
            <div class="text-subtitle1 q-mb-sm">Current Map Info</div>
            <div class="text-body2 text-grey-5">
              Scale: {{ currentMap?.metersPerPixel.toFixed(3) || 1.0 }} m/px
            </div>
            <q-btn outline color="secondary" label="Calibrate Scale" class="full-width q-mt-sm" @click="startCalibration" />
            <q-btn flat color="negative" label="Delete Map" class="full-width q-mt-sm" @click="confirmDeleteMap" />
          </div>
        </div>
      </div>
      
      <div class="map-area">
        <NetworkCanvas v-if="editorStore.activeMapId" />
        <div v-else class="empty-state">
          <div class="text-h5 text-grey-6">Select or upload a map to begin editing</div>
        </div>
      </div>
      
      <PropertyPanel />
    </div>

    <!-- Upload Map Dialog -->
    <q-dialog v-model="showUploadDialog">
      <q-card class="bg-dark text-white" style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Upload New Map</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-input v-model="newMapName" label="Map Name" dark outlined autofocus class="q-mb-md" />
          <q-file v-model="newMapFile" label="Choose Image (PNG/JPG)" dark outlined accept="image/*" />
        </q-card-section>

        <q-card-actions align="right" class="text-primary">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn flat label="Upload" @click="uploadMap" :loading="uploading" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Notify, Dialog } from 'quasar'
import TopBar from '../components/TopBar.vue'
import NetworkCanvas from '../components/MapEditor/NetworkCanvas.vue'
import PropertyPanel from '../components/MapEditor/PropertyPanel.vue'
import { useEditorStore } from '../stores/editorStore'

const editorStore = useEditorStore()

const mapOptions = computed(() => editorStore.maps)
const currentMap = computed(() => editorStore.maps.find(m => m.id === editorStore.activeMapId))

// Upload Dialog
const showUploadDialog = ref(false)
const newMapName = ref('')
const newMapFile = ref(null)
const uploading = ref(false)

onMounted(() => {
  editorStore.fetchMaps()
})

const onMapChange = (val) => {
  editorStore.setActiveMap(val)
}

const startCalibration = () => {
  // Trigger event to canvas to enter calibration mode
  window.dispatchEvent(new CustomEvent('editor:calibrate'))
}

const uploadMap = async () => {
  if (!newMapName.value || !newMapFile.value) {
    Notify.create({ message: 'Name and image are required', color: 'negative' })
    return
  }

  uploading.value = true
  const formData = new FormData()
  formData.append('name', newMapName.value)
  formData.append('image', newMapFile.value)

  try {
    const res = await fetch('/api/v1/maps', {
      method: 'POST',
      body: formData
    })
    
    if (res.ok) {
      const newMap = await res.json()
      Notify.create({ message: 'Map uploaded successfully', color: 'positive' })
      showUploadDialog.value = false
      newMapName.value = ''
      newMapFile.value = null
      await editorStore.fetchMaps()
      // Auto-select the newly uploaded map
      await editorStore.setActiveMap(newMap.id)
    } else {
      Notify.create({ message: 'Upload failed', color: 'negative' })
    }
  } catch (e) {
    Notify.create({ message: 'Upload error', color: 'negative' })
  } finally {
    uploading.value = false
  }
}

const confirmDeleteMap = () => {
  if (!editorStore.activeMapId) return

  Dialog.create({
    title: 'Delete Map',
    message: 'Are you sure you want to delete this map? All associated nodes and edges will also be permanently deleted.',
    cancel: true,
    persistent: true,
    color: 'negative'
  }).onOk(async () => {
    const success = await editorStore.deleteMap(editorStore.activeMapId)
    if (success) {
      Notify.create({ message: 'Map deleted successfully', color: 'info' })
    } else {
      Notify.create({ message: 'Failed to delete map', color: 'negative' })
    }
  })
}
</script>

<style scoped>
.editor-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--oh-border);
  background: var(--oh-bg-secondary);
}

.map-area {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--oh-bg-primary);
}
</style>
