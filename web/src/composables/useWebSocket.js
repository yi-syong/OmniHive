import { ref, onMounted, onUnmounted } from 'vue'
import { useVehicleStore } from '../stores/vehicleStore'

export function useWebSocket() {
  const store = useVehicleStore()
  const ws = ref(null)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 20
  const baseDelay = 1000
  let reconnectTimer = null

  function getWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/ws`
  }

  function connect() {
    if (ws.value?.readyState === WebSocket.OPEN) return

    store.setConnectionStatus('connecting')
    const url = getWsUrl()

    try {
      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        console.log('[WS] Connected')
        store.setConnectionStatus('connected')
        reconnectAttempts.value = 0
      }

      ws.value.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          handleMessage(msg)
        } catch (e) {
          console.error('[WS] Parse error:', e)
        }
      }

      ws.value.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason)
        store.setConnectionStatus('disconnected')
        scheduleReconnect()
      }

      ws.value.onerror = (error) => {
        console.error('[WS] Error:', error)
      }
    } catch (e) {
      console.error('[WS] Connection failed:', e)
      store.setConnectionStatus('disconnected')
      scheduleReconnect()
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'state':
        store.updateFromState(msg.payload)
        break
      case 'visualization':
        store.updateFromVisualization(msg.payload)
        break
      case 'connection':
        store.updateFromConnection(msg.payload)
        break
      default:
        console.warn('[WS] Unknown message type:', msg.type)
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts.value >= maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached')
      return
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      baseDelay * Math.pow(2, reconnectAttempts.value) + Math.random() * 1000,
      30000
    )

    console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts.value + 1})`)
    reconnectTimer = setTimeout(() => {
      reconnectAttempts.value++
      connect()
    }, delay)
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    connect,
    disconnect,
    reconnectAttempts,
  }
}
