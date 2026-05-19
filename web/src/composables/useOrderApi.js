import { ref } from 'vue'

const API_BASE = '/api/v1'

export function useOrderApi() {
  const isSending = ref(false)
  const error = ref(null)

  const sendOrder = async (vehicleId, nodeIds) => {
    isSending.value = true
    error.value = null
    try {
      const response = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vehicleId, nodeIds }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send order')
      }
      return true
    } catch (e) {
      error.value = e.message
      return false
    } finally {
      isSending.value = false
    }
  }

  const sendAction = async (vehicleId, actionType, params = {}) => {
    isSending.value = true
    error.value = null
    try {
      const response = await fetch(`${API_BASE}/vehicles/${vehicleId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actionType, ...params }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send action')
      }
      return true
    } catch (e) {
      error.value = e.message
      return false
    } finally {
      isSending.value = false
    }
  }

  return {
    isSending,
    error,
    sendOrder,
    sendAction
  }
}
