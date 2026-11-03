<template>
  <div :class="['camera-toolbar', { 'in-edit-mode': inEditMode }]">
    <button 
      :class="['cam-btn', { active: currentView === 'iso' }]" 
      @click="$emit('set-view', 'iso'); $emit('change-view', 'iso')"
      title="全廠鳥瞰等角視角"
    >
      <Box :size="14" />
      <span>等角全景</span>
    </button>
    <button 
      :class="['cam-btn', { active: currentView === 'top' }]" 
      @click="$emit('set-view', 'top'); $emit('change-view', 'top')"
      title="正上方全廠平面總覽"
    >
      <Compass :size="14" />
      <span>俯視平面</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Box, Compass } from 'lucide-vue-next';

defineProps<{
  currentView: 'iso' | 'top' | 'follow';
  inEditMode?: boolean;
}>();

defineEmits<{
  (e: 'set-view', view: 'iso' | 'top' | 'follow'): void;
  (e: 'change-view', view: 'iso' | 'top'): void;
}>();
</script>

<style scoped>
.camera-toolbar {
  position: absolute;
  bottom: 24px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 5px 12px;
  border-radius: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 50;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}

.camera-toolbar.in-edit-mode {
  border-color: rgba(245, 158, 11, 0.3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.cam-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.cam-btn:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.08);
}

.cam-btn.active {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  font-weight: 600;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}
</style>
