<template>
  <div class="dashboard-layout">
    <TopBar />
    <div class="main-content">
      <div class="sidebar">
        <VehicleList />
      </div>
      <div class="map-area">
        <MapView ref="mapRef" />
      </div>
      <VehicleDetail />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useWebSocket } from './composables/useWebSocket'
import TopBar from './components/TopBar.vue'
import VehicleList from './components/VehicleList.vue'
import MapView from './components/MapView.vue'
import VehicleDetail from './components/VehicleDetail.vue'

const mapRef = ref(null)

// Initialize WebSocket connection
useWebSocket()
</script>

<style scoped>
.dashboard-layout {
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
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--oh-border);
}

.map-area {
  flex: 1;
  position: relative;
}
</style>
