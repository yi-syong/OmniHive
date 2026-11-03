<template>
  <div class="scene-container">
    <canvas ref="canvasRef" class="render-canvas"></canvas>

    <!-- Top Left Camera Perspective Switcher -->
    <CameraToolbar 
      :current-view="currentView" 
      :in-edit-mode="currentAppMode === 'edit'"
      @set-view="setCameraView" 
    />

    <!-- Layout 3D Map Editor Toolbar -->
    <EditToolbar
      v-if="currentAppMode === 'edit'"
      :editor-tool="currentEditorTool"
      :new-node-function="newNodeFunction"
      :edge-direction-mode="edgeDirectionMode"
      @save="handleSaveLayout"
      @cancel="handleCancelEdit"
      @reset="showResetModal = true"
      @update:editor-tool="currentEditorTool = $event"
      @update:new-node-function="newNodeFunction = $event"
      @update:edge-direction-mode="edgeDirectionMode = $event"
    />

    <!-- Reset Layout Template Selection Modal -->
    <transition name="fade">
      <ResetLayoutModal
        v-if="showResetModal"
        @close="showResetModal = false"
        @reset-template="resetToStandardTemplate"
        @clear-canvas="clearCanvasEntirely"
      />
    </transition>

    <!-- Rubber-band Connection Interactive Hint Banner -->
    <transition name="fade">
      <EdgeHintBanner
        v-if="currentAppMode === 'edit' && currentEditorTool === 'add_edge' && edgeFirstNodeId"
        :edge-first-node-id="edgeFirstNodeId"
        :hovered-node-id="hoveredNodeId"
        :edge-direction-mode="edgeDirectionMode"
        @cancel="cancelEdgeConnection"
      />
    </transition>

    <!-- Right-Click Station Cargo Status Context Menu -->
    <transition name="fade">
      <CargoContextMenu
        v-if="cargoContextMenu.visible && cargoContextMenu.node"
        :node="cargoContextMenu.node"
        :x="cargoContextMenu.x"
        :y="cargoContextMenu.y"
        @close="closeCargoContextMenu"
        @set-status="setNodeCargoStatus"
      />
    </transition>

    <!-- Minimized Task Capsule -->
    <transition name="fade">
      <MissionMinimizedCapsule
        v-if="currentAppMode === 'simulate' && is3DQuickDispatchActive && isMissionPanelMinimized"
        :vehicle-id="selectedVehicleId || 'AGV-001'"
        :start-node="currentAgvStartNode"
        :dest-node="quickDispatchSteps[0]?.node_id"
        :step-count="quickDispatchSteps.length"
        @expand="isMissionPanelMinimized = false"
      />
    </transition>

    <!-- Non-blocking Left-side Floating Mission Dispatch Panel -->
    <transition name="slide-left">
      <MissionDispatchPanel
        v-if="currentAppMode === 'simulate' && is3DQuickDispatchActive && !isMissionPanelMinimized"
        :selected-vehicle-id="selectedVehicleId"
        :current-selected-vehicle-state="currentSelectedVehicleState"
        :current-agv-start-node="currentAgvStartNode"
        :quick-dispatch-steps="quickDispatchSteps"
        :active-step-index="activeStepIndex"
        :nodes="factoryLayout.nodes"
        :fleet-vehicles="fleetVehicles"
        :is-current-vehicle-busy="isCurrentVehicleBusy"
        @minimize="isMissionPanelMinimized = true"
        @close="closeQuickDispatch"
        @cancel-current-mission="handleCancelCurrentMission"
        @update:active-step-index="activeStepIndex = $event"
        @step-node-change="onStepNodeChange"
        @toggle-cargo="toggleStationCargo"
        @remove-step="removeDispatchStep"
        @set-step-action="setStepAction"
        @add-step="addNewDispatchStep"
        @reset-steps="resetDispatchSteps"
        @launch="handleQuickDispatchLaunch"
      />
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import CameraToolbar from './scene/overlays/CameraToolbar.vue';
import EditToolbar from './scene/overlays/EditToolbar.vue';
import ResetLayoutModal from './scene/overlays/ResetLayoutModal.vue';
import EdgeHintBanner from './scene/overlays/EdgeHintBanner.vue';
import CargoContextMenu from './scene/overlays/CargoContextMenu.vue';
import MissionMinimizedCapsule from './scene/overlays/mission/MissionMinimizedCapsule.vue';
import MissionDispatchPanel from './scene/overlays/mission/MissionDispatchPanel.vue';
import { useSceneController } from '../scene/useSceneController';

const emit = defineEmits<{
  (e: 'notify', msg: string, type: 'success' | 'info' | 'warn'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

const {
  currentAppMode,
  currentView,
  setCameraView,
  currentEditorTool,
  newNodeFunction,
  edgeDirectionMode,
  handleSaveLayout,
  handleCancelEdit,
  showResetModal,
  resetToStandardTemplate,
  clearCanvasEntirely,
  edgeFirstNodeId,
  hoveredNodeId,
  cancelEdgeConnection,
  cargoContextMenu,
  closeCargoContextMenu,
  setNodeCargoStatus,
  is3DQuickDispatchActive,
  isMissionPanelMinimized,
  selectedVehicleId,
  currentAgvStartNode,
  currentSelectedVehicleState,
  quickDispatchSteps,
  activeStepIndex,
  factoryLayout,
  fleetVehicles,
  isCurrentVehicleBusy,
  closeQuickDispatch,
  handleCancelCurrentMission,
  onStepNodeChange,
  toggleStationCargo,
  removeDispatchStep,
  setStepAction,
  addNewDispatchStep,
  resetDispatchSteps,
  handleQuickDispatchLaunch
} = useSceneController(canvasRef, emit);

defineExpose({
  handleSaveLayout,
  handleResetLayout: resetToStandardTemplate
});
</script>

<style scoped>
.scene-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #0b0f19;
}

.render-canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
  outline: none;
}

/* Transitions */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
