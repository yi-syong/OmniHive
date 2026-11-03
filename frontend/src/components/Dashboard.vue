<template>
  <div class="dashboard-container">
    <div class="panel-content">
      <FleetOverview 
        v-if="dashboardActiveTab === 'fleet'" 
        @close="$emit('close')" 
      />
      <VehicleDetail 
        v-else 
        @close="$emit('close')" 
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import FleetOverview from './dashboard/FleetOverview.vue';
import VehicleDetail from './dashboard/VehicleDetail.vue';
import { dashboardActiveTab } from '../services/websocket';

defineEmits<{ (e: 'close'): void }>();
</script>

<style>
@import './dashboard/dashboard.css';
</style>
