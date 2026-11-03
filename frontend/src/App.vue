<template>
  <div class="app-layout">
    <!-- 3D Babylon.js Fullscreen Canvas -->
    <BabylonScene ref="sceneRef" @notify="handleSceneNotify" />

    <!-- Top Navigation Header -->
    <TopNavbar 
      v-model:show-dashboard="showDashboard"
      @switch-mode="handleSwitchMode"
      @open-deadlock="showDeadlockModal = true"
    />

    <!-- 抽屜邊緣切換把手 (當右側面板收合時，可一鍵快速展開) -->
    <button 
      v-if="!showDashboard && currentAppMode === 'simulate'"
      class="drawer-edge-toggle"
      @click="showDashboard = true"
      title="展開車隊與單車遙測儀表板"
    >
      <ChevronLeft :size="14" />
      <span>車況儀表</span>
    </button>

    <!-- 功能 1: 即時狀態儀表板 (右側懸浮面板) -->
    <transition name="slide-right">
      <aside v-show="showDashboard" class="ui-overlay ui-right" :class="{ 'faded-for-edit': currentAppMode === 'edit' }">
        <Dashboard @close="showDashboard = false" />
      </aside>
    </transition>

    <!-- Unsaved Layout Changes Interceptor Modal -->
    <transition name="modal-fade">
      <UnsavedModal 
        v-if="showUnsavedModal"
        @close="showUnsavedModal = false"
        @discard="handleDiscardAndSimulate"
        @save="handleSaveAndSimulate"
      />
    </transition>

    <!-- 一鍵解除卡死 二次確認安全對話框 -->
    <transition name="modal-fade">
      <DeadlockModal 
        v-if="showDeadlockModal"
        @close="showDeadlockModal = false"
        @confirm="confirmGlobalFleetReset"
      />
    </transition>

    <!-- Notification Toast for Visual Events & Scene Actions -->
    <ToastContainer 
      :message="toastMessage"
      :type="toastType"
      :icon="toastIconComponent"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, markRaw, watch } from 'vue';
import { 
  PackageCheck, 
  Truck, 
  Bell, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  ShieldAlert,
  ChevronLeft
} from 'lucide-vue-next';
import BabylonScene from './components/BabylonScene.vue';
import Dashboard from './components/Dashboard.vue';
import TopNavbar from './components/layout/TopNavbar.vue';
import UnsavedModal from './components/layout/UnsavedModal.vue';
import DeadlockModal from './components/layout/DeadlockModal.vue';
import ToastContainer from './components/layout/ToastContainer.vue';
import { 
  connectWebSocket, 
  onVisualEvent, 
  currentAppMode, 
  hasUnsavedChanges,
  clearLayoutDirty,
  resetFleet
} from './services/websocket';

const sceneRef = ref<any>(null);
const showDashboard = ref(true);
const showUnsavedModal = ref(false);
const showDeadlockModal = ref(false);

const toastMessage = ref<string | null>(null);
const toastType = ref<'success' | 'info' | 'warn'>('info');
const toastIconComponent = ref<any>(markRaw(Bell));
let toastTimer: number | null = null;

function showToast(iconComp: any, msg: string, type: 'success' | 'info' | 'warn' = 'info') {
  toastIconComponent.value = markRaw(iconComp);
  toastMessage.value = msg;
  toastType.value = type;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = null;
  }, 3500);
}

function handleSceneNotify(msg: string, type: 'success' | 'info' | 'warn') {
  let iconComp = Info;
  if (type === 'success') iconComp = CheckCircle2;
  else if (type === 'warn') iconComp = AlertTriangle;
  showToast(iconComp, msg, type);
}

function confirmGlobalFleetReset() {
  showDeadlockModal.value = false;
  resetFleet();
  showToast(ShieldAlert, '🚨 已發送全場脫困指令，所有車輛已解除死鎖並回歸待命！', 'warn');
}

function handleSwitchMode(mode: 'simulate' | 'edit') {
  if (mode === 'simulate' && currentAppMode.value === 'edit' && hasUnsavedChanges.value) {
    showUnsavedModal.value = true;
    return;
  }
  currentAppMode.value = mode;
}

async function handleSaveAndSimulate() {
  if (sceneRef.value?.handleSaveLayout) {
    await sceneRef.value.handleSaveLayout();
  }
  showUnsavedModal.value = false;
  currentAppMode.value = 'simulate';
  showToast(CheckCircle2, '場域設定已儲存至後端，已切換至模擬派工模式', 'success');
}

async function handleDiscardAndSimulate() {
  clearLayoutDirty();
  if (sceneRef.value?.handleResetLayout) {
    await sceneRef.value.handleResetLayout();
  }
  showUnsavedModal.value = false;
  currentAppMode.value = 'simulate';
  showToast(Info, '已放棄未儲存變更，還原為後端場域配置', 'info');
}

onMounted(() => {
  connectWebSocket();

  onVisualEvent((event) => {
    if (event === 'pick_done') {
      showToast(PackageCheck, 'AGV-001 已於目標站點完成取貨！零件平滑升降作動完成', 'success');
    } else if (event === 'drop_done') {
      showToast(Truck, 'AGV-001 已於目標站點完成卸貨！貨箱已平滑入庫', 'success');
    }
  });

  watch(currentAppMode, (newMode) => {
    if (newMode === 'edit') {
      showDashboard.value = false;
    } else if (newMode === 'simulate') {
      showDashboard.value = true;
    }
  });
});
</script>

<style scoped>
@import './components/layout/layout.css';
</style>
