<template>
  <div 
    class="mission-minimized-capsule"
    @click="$emit('expand')"
    title="點擊展開完整任務派遣面板"
  >
    <span class="capsule-pulse-dot"></span>
    <div class="capsule-text">
      <span class="capsule-title">{{ vehicleId }} 派工</span>
      <span class="capsule-route">{{ startNode }} ➔ {{ destNode || '未設定' }} ({{ stepCount }}站)</span>
    </div>
    <ChevronRight :size="14" class="capsule-chevron" />
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';

defineProps<{
  vehicleId: string;
  startNode: string;
  destNode?: string;
  stepCount: number;
}>();

defineEmits<{
  (e: 'expand'): void;
}>();
</script>

<style scoped>
.mission-minimized-capsule {
  position: absolute;
  top: 72px;
  left: 20px;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(56, 189, 248, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 24px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  z-index: 40;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(56, 189, 248, 0.2);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.mission-minimized-capsule:hover {
  background: rgba(30, 41, 59, 0.98);
  border-color: #38bdf8;
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6), 0 0 22px rgba(56, 189, 248, 0.35);
}

.capsule-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 10px #38bdf8;
  animation: pulse-capsule 1.8s infinite ease-in-out;
  flex-shrink: 0;
}

@keyframes pulse-capsule {
  0%, 100% { transform: scale(0.9); opacity: 0.8; }
  50% { transform: scale(1.25); opacity: 1; }
}

.capsule-text {
  display: flex;
  flex-direction: column;
}

.capsule-title {
  font-size: 11px;
  font-weight: 700;
  color: #f8fafc;
}

.capsule-route {
  font-size: 10.5px;
  color: #38bdf8;
  font-family: monospace;
}

.capsule-chevron {
  color: #94a3b8;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.mission-minimized-capsule:hover .capsule-chevron {
  color: #38bdf8;
  transform: translateX(2px);
}
</style>
