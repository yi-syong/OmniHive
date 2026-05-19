<template>
  <div class="property-panel" v-if="selectedItem">
    <div class="panel-header">
      <div class="text-subtitle1 font-weight-bold">
        {{ selectedItem.type === 'node' ? 'Node Properties' : 'Edge Properties' }}
      </div>
      <q-btn flat round dense icon="close" size="sm" @click="closePanel" />
    </div>

    <div class="panel-body q-pa-md">
      <!-- Node Form -->
      <template v-if="selectedItem.type === 'node'">
        <q-input v-model="formData.nodeId" label="Node ID" dense outlined dark class="q-mb-md" />
        <q-input v-model.number="formData.x" label="X (m)" type="number" dense outlined dark class="q-mb-md" />
        <q-input v-model.number="formData.y" label="Y (m)" type="number" dense outlined dark class="q-mb-md" />
        <q-input v-model="formData.description" label="Description" dense outlined dark type="textarea" autogrow class="q-mb-md" />
        
        <q-expansion-item label="Advanced VDA5050 Settings" header-class="text-grey" dark class="bg-dark q-mt-md rounded-borders">
          <q-card class="bg-transparent">
            <q-card-section>
              <div class="text-caption text-grey">Additional actions and parameters (Phase 3)</div>
            </q-card-section>
          </q-card>
        </q-expansion-item>
      </template>

      <!-- Edge Form -->
      <template v-else-if="selectedItem.type === 'edge'">
        <q-input v-model="formData.edgeId" label="Edge ID" dense outlined dark class="q-mb-md" />
        <q-input v-model.number="formData.maxSpeed" label="Max Speed (m/s)" type="number" dense outlined dark class="q-mb-md" />
        
        <div class="text-caption text-grey-5 q-mb-xs">Direction</div>
        <q-btn-toggle
          v-model="formData.direction"
          dark
          spread
          class="q-mb-md"
          toggle-color="primary"
          :options="[
            {label: 'Bi-directional', value: 'bidirectional'},
            {label: 'Uni-directional', value: 'unidirectional'}
          ]"
        />

        <q-input v-model="formData.description" label="Description" dense outlined dark type="textarea" autogrow class="q-mb-md" />

        <q-expansion-item label="Advanced VDA5050 Settings" header-class="text-grey" dark class="bg-dark q-mt-md rounded-borders">
          <q-card class="bg-transparent">
            <q-card-section>
              <div class="text-caption text-grey">Trajectory and kinemetics bounds (Phase 3)</div>
            </q-card-section>
          </q-card>
        </q-expansion-item>
      </template>
    </div>

    <div class="panel-footer q-pa-md row justify-between">
      <q-btn outline color="negative" label="Delete" @click="deleteItem" />
      <q-btn color="primary" label="Save" @click="saveItem" :loading="saving" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Notify } from 'quasar'
import { useEditorStore } from '../../stores/editorStore'

const store = useEditorStore()
const selectedItem = ref(null) // { type: 'node'|'edge', data: Object }
const formData = ref({})
const saving = ref(false)

// Listen to selection events from NetworkCanvas
const handleSelection = (e) => {
  selectedItem.value = e.detail
  formData.value = { ...e.detail.data }
}

const handleDeselection = () => {
  selectedItem.value = null
}

onMounted(() => {
  window.addEventListener('editor:select', handleSelection)
  window.addEventListener('editor:deselect', handleDeselection)
})

onUnmounted(() => {
  window.removeEventListener('editor:select', handleSelection)
  window.removeEventListener('editor:deselect', handleDeselection)
})

const closePanel = () => {
  selectedItem.value = null
  window.dispatchEvent(new CustomEvent('editor:clear-selection'))
}

const saveItem = async () => {
  if (!store.activeMapId) return
  saving.value = true
  
  const isNew = !formData.value.id
  const endpoint = selectedItem.value.type === 'node' 
    ? `/api/v1/network/nodes${isNew ? '' : '/'+formData.value.id}`
    : `/api/v1/network/edges${isNew ? '' : '/'+formData.value.id}`
    
  const method = isNew ? 'POST' : 'PUT'

  try {
    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData.value, mapId: store.activeMapId })
    })

    if (res.ok) {
      Notify.create({ message: 'Saved successfully', color: 'positive' })
      await store.fetchNetwork(store.activeMapId) // refresh
      // Trigger canvas re-render
      window.dispatchEvent(new CustomEvent('editor:network-updated'))
      if (isNew) {
         const data = await res.json()
         formData.value.id = data.id // update to existing mode
      }
    } else {
      Notify.create({ message: 'Failed to save', color: 'negative' })
    }
  } catch (e) {
    console.error(e)
    Notify.create({ message: 'Error saving data', color: 'negative' })
  } finally {
    saving.value = false
  }
}

const deleteItem = async () => {
  if (!formData.value.id) {
    // Just a local new item, close panel
    closePanel()
    return
  }

  const endpoint = selectedItem.value.type === 'node' 
    ? `/api/v1/network/nodes/${formData.value.id}`
    : `/api/v1/network/edges/${formData.value.id}`

  try {
    const res = await fetch(endpoint, { method: 'DELETE' })
    if (res.ok) {
      Notify.create({ message: 'Deleted successfully', color: 'info' })
      closePanel()
      await store.fetchNetwork(store.activeMapId)
      window.dispatchEvent(new CustomEvent('editor:network-updated'))
    }
  } catch (e) {
    console.error(e)
    Notify.create({ message: 'Error deleting data', color: 'negative' })
  }
}
</script>

<style scoped>
.property-panel {
  width: 340px;
  background: var(--oh-bg-secondary);
  border-left: 1px solid var(--oh-border);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--oh-border);
  background: var(--oh-bg-primary);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
}

.panel-footer {
  border-top: 1px solid var(--oh-border);
  background: var(--oh-bg-primary);
}
</style>
