<template>
  <div class="top-bar glass-card">
    <div class="bar-left">
      <span class="logo">🐝</span>
      <span class="brand-name">OmniHive</span>
      <q-badge color="orange-8" class="version-badge">Phase 1</q-badge>
    </div>

    <div class="bar-center">
      <div class="stat-item">
        <q-icon name="directions_car" size="16px" color="grey-5" />
        <span class="stat-value mono">{{ store.totalCount }}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <q-icon name="circle" size="10px" color="positive" />
        <span class="stat-value mono">{{ store.onlineCount }}</span>
        <span class="stat-label">Online</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <q-icon name="navigation" size="16px" color="green" />
        <span class="stat-value mono">{{ store.drivingCount }}</span>
        <span class="stat-label">Driving</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <q-icon name="bolt" size="16px" color="teal" />
        <span class="stat-value mono">{{ store.chargingCount }}</span>
        <span class="stat-label">Charging</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <q-icon name="error" size="16px" color="negative" />
        <span class="stat-value mono">{{ store.errorCount }}</span>
        <span class="stat-label">Errors</span>
      </div>
    </div>

    <div class="bar-right">
      <div class="connection-indicator" :class="store.connectionStatus">
        <span class="dot"></span>
        <span class="conn-text">{{ connectionLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useVehicleStore } from '../stores/vehicleStore'

const store = useVehicleStore()

const connectionLabel = computed(() => {
  switch (store.connectionStatus) {
    case 'connected': return 'Live'
    case 'connecting': return 'Connecting...'
    default: return 'Disconnected'
  }
})
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
  border-radius: 0;
  border-bottom: 1px solid var(--oh-border);
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  font-size: 22px;
}

.brand-name {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #FF9800, #FFB74D);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.version-badge {
  font-size: 10px;
  padding: 2px 6px;
}

.bar-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-weight: 600;
  font-size: 14px;
}

.stat-label {
  font-size: 11px;
  color: var(--oh-text-secondary);
}

.stat-divider {
  width: 1px;
  height: 20px;
  background: var(--oh-border);
}

.bar-right {
  display: flex;
  align-items: center;
}

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.connection-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.connection-indicator.connected {
  background: rgba(76, 175, 80, 0.1);
  color: #4CAF50;
}

.connection-indicator.connected .dot {
  background: #4CAF50;
  animation: pulse 2s ease-in-out infinite;
}

.connection-indicator.connecting {
  background: rgba(255, 193, 7, 0.1);
  color: #FFC107;
}

.connection-indicator.connecting .dot {
  background: #FFC107;
  animation: pulse 1s ease-in-out infinite;
}

.connection-indicator.disconnected {
  background: rgba(158, 158, 158, 0.1);
  color: #9E9E9E;
}

.connection-indicator.disconnected .dot {
  background: #9E9E9E;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
