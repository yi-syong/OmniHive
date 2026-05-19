import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Notify } from 'quasar'

export const useEditorStore = defineStore('editor', () => {
  const maps = ref([])
  const activeMapId = ref(null)
  const nodes = ref([])
  const edges = ref([])

  // Load all maps from API
  const fetchMaps = async () => {
    try {
      const res = await fetch('/api/v1/maps')
      if (res.ok) {
        maps.value = await res.json()
      }
    } catch (e) {
      console.error('Failed to fetch maps', e)
    }
  }

  // Load network for a specific map
  const fetchNetwork = async (mapId) => {
    if (!mapId) return
    try {
      const res = await fetch(`/api/v1/network?mapId=${mapId}`)
      if (res.ok) {
        const data = await res.json()
        nodes.value = data.nodes || []
        edges.value = data.edges || []
      }
    } catch (e) {
      console.error('Failed to fetch network', e)
    }
  }

  // Switch active map
  const setActiveMap = async (id) => {
    activeMapId.value = id
    await fetchNetwork(id)
  }

  // Delete map
  const deleteMap = async (id) => {
    try {
      const res = await fetch(`/api/v1/maps/${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (activeMapId.value === id) {
          activeMapId.value = null
          nodes.value = []
          edges.value = []
        }
        await fetchMaps()
        return true
      }
    } catch (e) {
      console.error('Failed to delete map', e)
    }
    return false
  }

  return {
    maps,
    activeMapId,
    nodes,
    edges,
    fetchMaps,
    fetchNetwork,
    setActiveMap,
    deleteMap
  }
})
