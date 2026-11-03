<template>
  <div class="edge-hint-banner">
    <div class="hint-pulse-dot"></div>
    <span class="hint-text">
      起點: <strong>{{ edgeFirstNodeId }}</strong> ➔ 
      <span v-if="hoveredNodeId" class="text-hover-node">終點: <strong>{{ hoveredNodeId }}</strong> (點擊完成連線)</span>
      <span v-else>拖曳游標並點擊目標節點 (按 Esc 取消)</span>
    </span>
    <span class="hint-mode-tag">{{ edgeDirectionMode === 'bidirectional' ? '雙向 (⇄)' : '單向 (➔)' }}</span>
    <button class="hint-cancel-btn" @click="$emit('cancel')">取消</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  edgeFirstNodeId: string;
  hoveredNodeId: string | null;
  edgeDirectionMode: 'oneway' | 'bidirectional';
}>();

defineEmits<{
  (e: 'cancel'): void;
}>();
</script>

<style scoped>
.edge-hint-banner {
  position: absolute;
  top: 130px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(245, 158, 11, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #f8fafc;
  font-size: 12px;
  font-weight: 500;
  padding: 8px 18px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(245, 158, 11, 0.2);
  z-index: 15;
}

.hint-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 10px #f59e0b;
  animation: pulse 1.2s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}

.text-hover-node {
  color: #38bdf8;
  font-weight: 700;
}

.hint-mode-tag {
  background: rgba(14, 165, 233, 0.18);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
}

.hint-cancel-btn {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
  border-radius: 8px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.hint-cancel-btn:hover {
  background: #ef4444;
  color: #ffffff;
}
</style>
