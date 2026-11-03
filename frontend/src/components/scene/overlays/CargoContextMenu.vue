<template>
  <div 
    v-if="node" 
    class="cargo-context-menu"
    :style="{ top: `${y}px`, left: `${x}px` }"
    @click.stop
    @contextmenu.prevent
  >
    <div class="context-menu-header">
      <div class="header-icon-box">
        <Package :size="14" />
      </div>
      <div class="header-info">
        <span class="context-title">{{ node.name || node.id }}</span>
        <span class="context-sub">貨物狀態</span>
      </div>
      <button class="context-close-btn" @click="$emit('close')" title="關閉">
        <X :size="13" />
      </button>
    </div>

    <div class="context-menu-body">
      <div class="cargo-toggle-group">
        <button 
          type="button"
          class="cargo-pill-btn"
          :class="{ active: node.has_cargo }"
          @click="$emit('set-status', node, true)"
        >
          <span class="cargo-status-dot has-cargo"></span>
          <span class="cargo-status-text">有貨</span>
          <Check v-if="node.has_cargo" :size="13" class="check-mark" />
        </button>

        <button 
          type="button"
          class="cargo-pill-btn"
          :class="{ active: !node.has_cargo }"
          @click="$emit('set-status', node, false)"
        >
          <span class="cargo-status-dot no-cargo"></span>
          <span class="cargo-status-text">無貨</span>
          <Check v-if="!node.has_cargo" :size="13" class="check-mark" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Package, X, Check } from 'lucide-vue-next';
import type { LayoutNode } from '../../../types';

defineProps<{
  node: LayoutNode | null;
  x: number;
  y: number;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'set-status', node: LayoutNode, hasCargo: boolean): void;
}>();
</script>

<style scoped>
.cargo-context-menu {
  position: fixed;
  background: rgba(15, 23, 42, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(245, 158, 11, 0.45);
  border-radius: 12px;
  padding: 8px 10px;
  width: 175px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8), 0 0 20px rgba(245, 158, 11, 0.18);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: contextMenuFadeIn 0.15s ease-out;
  user-select: none;
}

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.context-menu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-icon-box {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fbbf24;
  flex-shrink: 0;
}

.header-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.context-title {
  font-size: 11.5px;
  font-weight: 700;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-sub {
  font-size: 9.5px;
  color: #94a3b8;
}

.context-close-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s;
}

.context-close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f1f5f9;
}

.context-menu-body {
  display: flex;
  flex-direction: column;
}

.cargo-toggle-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.cargo-pill-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 8px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #94a3b8;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cargo-pill-btn:hover {
  background: rgba(51, 65, 85, 0.9);
  color: #f8fafc;
}

.cargo-pill-btn.active {
  background: rgba(245, 158, 11, 0.2);
  border-color: rgba(245, 158, 11, 0.55);
  color: #fbbf24;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
}

.cargo-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cargo-status-dot.has-cargo {
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}

.cargo-status-dot.no-cargo {
  border: 1.5px solid #94a3b8;
  background: transparent;
}
</style>
