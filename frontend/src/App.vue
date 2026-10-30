<template>
  <div class="app-layout">
    <!-- 3D Babylon.js Fullscreen Canvas -->
    <BabylonScene ref="sceneRef" @notify="handleSceneNotify" />

    <!-- Top Navigation Header -->
    <header class="top-nav">
      <!-- Left: Brand -->
      <div class="nav-left">
        <div class="brand">
          <div class="brand-logo">
            <Bot :size="19" class="brand-svg text-cyan" />
          </div>
          <div class="brand-text">
            <div class="brand-title-row">
              <h1 class="brand-title">OmniHive 智慧工廠</h1>
              <span class="version-tag">VDA 5050</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Center: Mode Switcher & Simulation Speed Control -->
      <div class="nav-center">
        <div class="mode-switcher" role="tablist" aria-label="系統運作模式">
          <button 
            :class="['mode-tab', { active: currentAppMode === 'simulate' }]"
            @click="handleSwitchMode('simulate')"
            role="tab"
            :aria-selected="currentAppMode === 'simulate'"
          >
            <Play :size="13" />
            <span>模擬監控</span>
          </button>
          <button 
            :class="['mode-tab', 'edit-tab', { active: currentAppMode === 'edit' }]"
            @click="handleSwitchMode('edit')"
            role="tab"
            :aria-selected="currentAppMode === 'edit'"
          >
            <PencilRuler :size="13" />
            <span>編輯地圖</span>
          </button>
        </div>

        <!-- 全域模擬倍率控制 (置於全域控制列而非監控面板) -->
        <div v-if="currentAppMode === 'simulate'" class="sim-speed-control" title="調整車輛行駛與物理模擬步長倍率">
          <div class="speed-label-group">
            <Zap :size="12" class="text-amber" />
            <span class="speed-label">倍率</span>
          </div>
          <div class="speed-btns">
            <button 
              v-for="s in [1, 2, 5, 10]" 
              :key="s"
              :class="['speed-pill', { active: currentTimeScale === s }]"
              @click="setTimeScale(s)"
            >
              {{ s }}×
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Status, Dashboard Toggle, Connection -->
      <div class="nav-right">
        <!-- Dirty State Indicator -->
        <div v-if="hasUnsavedChanges" class="tech-badge dirty-badge" title="地圖有未儲存變更，切換至模擬前請先儲存">
          <AlertTriangle :size="13" class="badge-icon text-amber" />
          <span class="badge-text">未儲存變更</span>
        </div>

        <!-- 一鍵解除卡死 (緊急處置按鈕，僅在模擬監控模式顯示) -->
        <button 
          v-if="currentAppMode === 'simulate'"
          class="hud-nav-btn emergency-btn"
          @click="handleGlobalFleetReset"
          title="緊急解除全場路權死鎖與卡死任務，釋放車隊回歸待命 (一鍵脫困)"
        >
          <ShieldAlert :size="14" class="text-rose" />
          <span class="btn-text">一鍵解除卡死</span>
        </button>

        <!-- 功能 1 切換按鈕: 車況儀表板 (僅在模擬監控模式顯示) -->
        <button 
          v-if="currentAppMode === 'simulate'"
          :class="['hud-nav-btn', { active: showDashboard }]" 
          @click="showDashboard = !showDashboard"
          title="開啟/關閉車況儀表板"
        >
          <Activity :size="14" />
          <span class="btn-text">車況儀表</span>
        </button>

        <!-- Connection Indicator -->
        <div :class="['conn-indicator', isConnected ? 'online' : 'offline']" :title="isConnected ? '後端連線正常' : '嘗試連線中'">
          <span class="pulse-indicator"></span>
          <span class="conn-text">{{ isConnected ? '連線正常' : '斷線' }}</span>
        </div>
      </div>
    </header>

    <!-- 功能 1: 即時狀態儀表板 (右側懸浮面板) -->
    <transition name="slide-right">
      <aside v-show="showDashboard" class="ui-overlay ui-right" :class="{ 'faded-for-edit': currentAppMode === 'edit' }">
        <Dashboard @close="showDashboard = false" />
      </aside>
    </transition>

    <!-- Unsaved Layout Changes Interceptor Modal -->
    <transition name="modal-fade">
      <div v-if="showUnsavedModal" class="modal-overlay" @click.self="showUnsavedModal = false">
        <div class="modal-card">
          <div class="modal-header">
            <div class="modal-header-icon">
              <AlertTriangle :size="24" class="text-amber" />
            </div>
            <div>
              <h3 class="modal-title">尚未儲存地圖變更</h3>
              <p class="modal-subtitle">編輯模式下的變更尚未同步至後端</p>
            </div>
          </div>
          
          <div class="modal-body">
            <p class="modal-desc">
              您在地圖上新增或調整了站點與路徑，但尚未寫入後端 (<code>factory_layout.json</code>)。
            </p>
            <div class="warning-callout">
              <ShieldAlert :size="18" class="text-amber shrink-0" />
              <span>若直接切換至模擬模式並派工，後端路徑規劃引擎將無法識別新站點，導致任務失敗。</span>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-modal btn-cancel" @click="showUnsavedModal = false">
              繼續編輯
            </button>
            <button class="btn-modal btn-discard" @click="handleDiscardAndSimulate">
              放棄變更並切換
            </button>
            <button class="btn-modal btn-save-primary" @click="handleSaveAndSimulate">
              <Save :size="15" />
              儲存並開始模擬
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Notification Toast for Visual Events & Scene Actions -->
    <transition name="toast">
      <div v-if="toastMessage" :class="['toast-notification', `toast-${toastType}`]">
        <component :is="toastIconComponent" :size="18" class="toast-icon-svg" />
        <span class="toast-text">{{ toastMessage }}</span>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, markRaw, watch } from 'vue';
import { 
  Bot, 
  Activity,
  Zap,
  PackageCheck, 
  Truck, 
  Bell, 
  Play, 
  PencilRuler, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  Save,
  ShieldAlert
} from 'lucide-vue-next';
import BabylonScene from './components/BabylonScene.vue';
import Dashboard from './components/Dashboard.vue';
import { 
  connectWebSocket, 
  isConnected, 
  onVisualEvent, 
  currentAppMode, 
  currentTimeScale,
  setTimeScale,
  hasUnsavedChanges,
  clearLayoutDirty,
  resetFleet
} from './services/websocket';

const sceneRef = ref<any>(null);
const showDashboard = ref(true);
const showUnsavedModal = ref(false);

function handleGlobalFleetReset() {
  if (confirm('🚨 確定要一鍵解除全場死鎖？\n系統將立即釋放所有車輛的鎖定路權，中斷停等任務並重設車隊至待命狀態。')) {
    resetFleet();
    showToast(ShieldAlert, '🚨 已發送全場脫困指令，所有車輛已解除死鎖並回歸待命！', 'warn');
  }
}

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
  if (sceneRef.value?.handleResetLayout) {
    await sceneRef.value.handleResetLayout();
  }
  clearLayoutDirty();
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
.app-layout {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--color-bg-base);
}

/* Responsive Top Navigation Header */
.top-nav {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  background: linear-gradient(180deg, rgba(7, 10, 18, 0.96) 0%, rgba(7, 10, 18, 0.8) 100%);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  z-index: 40;
  gap: 12px;
}

.nav-left {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.nav-center {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex: 1;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(14, 165, 233, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
}

.brand-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: var(--color-text-title);
  margin: 0;
  white-space: nowrap;
}

.version-tag {
  font-size: 9px;
  font-weight: 800;
  background: linear-gradient(135deg, #0284c7, #0ea5e9);
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

/* Mode Switcher Pill */
.mode-switcher {
  display: flex;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 30px;
  padding: 3px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.mode-tab {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}

.mode-tab:hover {
  color: #f8fafc;
}

.mode-tab.active {
  background: rgba(14, 165, 233, 0.22);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.45);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
}

.edit-tab.active {
  background: rgba(245, 158, 11, 0.22);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.45);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
}

/* Simulation Speed Control Pill */
.sim-speed-control {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 20px;
  padding: 3px 8px 3px 10px;
}

.speed-label-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.speed-label {
  font-size: 11px;
  color: #fbbf24;
  font-weight: 600;
  white-space: nowrap;
}

.speed-btns {
  display: flex;
  gap: 2px;
}

.speed-pill {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 7px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.speed-pill:hover {
  color: #ffffff;
}

.speed-pill.active {
  background: rgba(245, 158, 11, 0.25);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.text-cyan { color: #38bdf8; }
.text-amber { color: #f59e0b; }

/* Function 1: Dashboard Toggle Button */
.hud-nav-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(30, 41, 59, 0.65);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.hud-nav-btn:hover {
  background: rgba(51, 65, 85, 0.8);
  color: #f1f5f9;
  border-color: rgba(56, 189, 248, 0.3);
}

.hud-nav-btn.active {
  background: rgba(14, 165, 233, 0.18);
  border-color: rgba(56, 189, 248, 0.45);
  color: #38bdf8;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}

.emergency-btn {
  background: rgba(225, 29, 72, 0.15);
  border-color: rgba(244, 63, 94, 0.35);
  color: #fda4af;
}

.emergency-btn:hover {
  background: rgba(225, 29, 72, 0.28);
  border-color: rgba(244, 63, 94, 0.6);
  color: #ffffff;
  box-shadow: 0 0 14px rgba(244, 63, 94, 0.35);
}

.text-rose {
  color: #fb7185;
}

.tech-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border-radius: var(--radius-pill);
  background: rgba(30, 41, 59, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid var(--color-card-border);
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-body);
  white-space: nowrap;
}

.conn-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.conn-indicator.online {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #34d399;
}

.conn-indicator.offline {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.pulse-indicator {
  width: 6.5px;
  height: 6.5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}

/* Right Floating Overlay for Dashboard */
.ui-overlay {
  position: absolute;
  top: 68px;
  bottom: 20px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.ui-right {
  right: 18px;
}

.faded-for-edit {
  opacity: 0.85;
}



/* Slide Right Transition */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

/* Toast Notification */
.toast-notification {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--radius-pill);
  padding: 9px 20px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--color-text-title);
  font-size: 12.5px;
  font-weight: 600;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  z-index: 100;
  max-width: 90vw;
  text-align: center;
}

.toast-success {
  border: 1px solid rgba(16, 185, 129, 0.4);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.2);
}
.toast-success .toast-icon-svg { color: #10b981; }

.toast-warn {
  border: 1px solid rgba(245, 158, 11, 0.4);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(245, 158, 11, 0.2);
}
.toast-warn .toast-icon-svg { color: #f59e0b; }

.toast-info {
  border: 1px solid rgba(56, 189, 248, 0.4);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.2);
}
.toast-info .toast-icon-svg { color: #38bdf8; }

.toast-enter-active,
.toast-leave-active {
  transition: all var(--transition-normal);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px) scale(0.95);
}

.dirty-badge {
  background: rgba(245, 158, 11, 0.18);
  border-color: rgba(245, 158, 11, 0.5);
  color: #fbbf24;
  font-weight: 700;
  animation: pulse-border 2s infinite ease-in-out;
}

@keyframes pulse-border {
  0%, 100% { border-color: rgba(245, 158, 11, 0.4); box-shadow: 0 0 0 rgba(245, 158, 11, 0); }
  50% { border-color: rgba(245, 158, 11, 0.9); box-shadow: 0 0 10px rgba(245, 158, 11, 0.3); }
}

/* Modal Overlay & Card */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 7, 15, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 100%;
  max-width: 460px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 18px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(245, 158, 11, 0.15);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-header-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-title);
}

.modal-subtitle {
  margin: 2px 0 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--color-text-body);
}

.modal-desc code {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 5px;
  border-radius: 4px;
  color: #38bdf8;
  font-family: monospace;
  font-size: 11.5px;
}

.warning-callout {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 9px;
  padding: 9px 11px;
  font-size: 11.5px;
  color: #fde68a;
  line-height: 1.45;
}

.modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn-modal {
  padding: 8px 14px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s ease;
  border: none;
}

.btn-cancel {
  background: rgba(51, 65, 85, 0.4);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.btn-cancel:hover {
  background: rgba(51, 65, 85, 0.7);
  color: #f8fafc;
}

.btn-discard {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
.btn-discard:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #fecaca;
}

.btn-save-primary {
  background: linear-gradient(135deg, #0284c7, #0ea5e9);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
}
.btn-save-primary:hover {
  background: linear-gradient(135deg, #0369a1, #0284c7);
}

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.25s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }

/* ---------------------------------------------------- */
/* RWD Media Queries */
/* ---------------------------------------------------- */
@media (max-width: 1200px) {
  .version-tag {
    display: none;
  }
  .nav-center {
    gap: 8px;
  }
}

@media (max-width: 960px) {
  .top-nav {
    padding: 6px 12px;
    min-height: 52px;
  }
  .brand-title {
    font-size: 13.5px;
  }
  .mode-tab {
    padding: 5px 12px;
    font-size: 11px;
  }
  .speed-label {
    display: none;
  }
  .hud-nav-btn {
    padding: 5px 9px;
  }
  .hud-nav-btn .btn-text {
    display: none;
  }
  .dirty-badge .badge-text {
    display: none;
  }
  .conn-indicator .conn-text {
    display: none;
  }
  .conn-indicator {
    padding: 6px 8px;
  }
  .ui-right {
    right: 10px;
    top: 60px;
    bottom: 12px;
  }
}

@media (max-width: 680px) {
  .brand-text {
    display: none;
  }
  .sim-speed-control {
    display: none;
  }
  .ui-right {
    right: 8px;
    left: 8px;
    width: auto;
  }
}
</style>
