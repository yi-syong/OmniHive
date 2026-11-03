<template>
  <div class="edit-toolbar">
    <div class="edit-tool-group">
      <button 
        :class="['tool-btn', { active: editorTool === 'select' }]"
        @click="$emit('update:editorTool', 'select')"
        title="選取並拖曳移動站點或物件"
      >
        <Move :size="14" />
        <span>選取移動</span>
      </button>
      
      <button 
        :class="['tool-btn', { active: editorTool === 'add_node' }]"
        @click="$emit('update:editorTool', 'add_node')"
        title="選擇類型並點擊地面放置站點"
      >
        <PlusCircle :size="14" />
        <span>加節點</span>
      </button>

      <!-- Node Type Quick Selector -->
      <div v-if="editorTool === 'add_node'" class="edge-dir-selector node-type-selector">
        <button 
          v-for="opt in nodeTypeOptions" 
          :key="opt.value"
          :class="['dir-pill', { active: newNodeFunction === opt.value }]"
          @click="$emit('update:newNodeFunction', opt.value)"
          :title="opt.desc"
        >
          <component :is="opt.icon" :size="11" />
          <span>{{ opt.label }}</span>
        </button>
      </div>
      
      <!-- Intuitive Edge Tool with Direction Selector -->
      <button 
        :class="['tool-btn', { active: editorTool === 'add_edge' }]"
        @click="$emit('update:editorTool', 'add_edge')"
        title="點選起點與終點節點以建立路徑"
      >
        <GitCommit :size="14" />
        <span>建路徑</span>
      </button>

      <!-- Edge Direction Quick Toggle -->
      <div v-if="editorTool === 'add_edge'" class="edge-dir-selector">
        <button 
          :class="['dir-pill', { active: edgeDirectionMode === 'oneway' }]"
          @click="$emit('update:edgeDirectionMode', 'oneway')"
          title="單向通行 (起點 ➔ 終點)"
        >
          <ArrowRight :size="11" />
          <span>單向 (➔)</span>
        </button>
        <button 
          :class="['dir-pill', { active: edgeDirectionMode === 'bidirectional' }]"
          @click="$emit('update:edgeDirectionMode', 'bidirectional')"
          title="雙向通行 (雙向互通 ⇄)"
        >
          <ArrowLeftRight :size="11" />
          <span>雙向 (⇄)</span>
        </button>
      </div>

      <button 
        :class="['tool-btn', 'tool-btn-danger', { active: editorTool === 'delete' }]"
        @click="$emit('update:editorTool', 'delete')"
        title="點擊站點、路徑或物件直接刪除"
      >
        <Trash2 :size="14" />
        <span>刪除</span>
      </button>
    </div>

    <div class="edit-actions">
      <button class="action-btn reset-btn" @click="$emit('reset')" title="重設為乾淨測試地圖，或清空畫布重來">
        <RotateCcw :size="14" />
        <span>重設/清空</span>
      </button>
      <button class="action-btn save-btn" @click="$emit('save')" title="儲存當前場域拓撲並自動切換回模擬派車模式">
        <Save :size="14" />
        <span>儲存並模擬</span>
      </button>
      <button class="action-btn cancel-btn" @click="$emit('cancel')" title="取消編輯，捨棄未儲存之變更並返回模擬模式">
        <XCircle :size="14" />
        <span>取消編輯</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Move,
  PlusCircle,
  GitCommit,
  ArrowRight,
  ArrowLeftRight,
  Trash2,
  RotateCcw,
  Save,
  XCircle,
  Shuffle,
  Clock,
  BatteryCharging,
  PackagePlus
} from 'lucide-vue-next';

defineProps<{
  editorTool: string;
  newNodeFunction: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo';
  edgeDirectionMode: 'oneway' | 'bidirectional';
}>();

defineEmits<{
  (e: 'update:editorTool', val: 'select' | 'add_node' | 'add_edge' | 'delete'): void;
  (e: 'update:newNodeFunction', val: 'Transit' | 'Wait' | 'Idle/Charge' | 'Cargo'): void;
  (e: 'update:edgeDirectionMode', val: 'oneway' | 'bidirectional'): void;
  (e: 'reset'): void;
  (e: 'save'): void;
  (e: 'cancel'): void;
}>();

const nodeTypeOptions = [
  { value: 'Transit' as const, label: '交會點', icon: Shuffle, desc: '路網交會通道點 (藍色 🔀)' },
  { value: 'Wait' as const, label: '等待點', icon: Clock, desc: '原地等待避車點 (黃色 🕒)' },
  { value: 'Idle/Charge' as const, label: '充電站', icon: BatteryCharging, desc: '自動充電樁 (青色 [⚡])' },
  { value: 'Cargo' as const, label: '貨物站', icon: PackagePlus, desc: '取放貨棧板站 (橘色 📦)' },
];
</script>

<style scoped>
.edit-toolbar {
  position: absolute;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(15, 23, 42, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(245, 158, 11, 0.4);
  padding: 6px 14px;
  border-radius: 20px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 16px rgba(245, 158, 11, 0.15);
  z-index: 25;
  white-space: nowrap;
  max-width: 95vw;
}

.edit-tool-group {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.tool-btn {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 11px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: rgba(51, 65, 85, 0.8);
  color: #f8fafc;
}

.tool-btn.active {
  background: rgba(245, 158, 11, 0.18);
  border-color: #f59e0b;
  color: #fbbf24;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);
}

.tool-btn-danger.active {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #f87171;
}

.edge-dir-selector {
  display: flex;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
  flex-shrink: 0;
}

.node-type-selector {
  background: rgba(15, 23, 42, 0.85);
  border-radius: 10px;
  padding: 3px;
  gap: 3px;
}

.dir-pill {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.dir-pill:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f1f5f9;
}

.dir-pill.active {
  background: rgba(14, 165, 233, 0.25);
  color: #38bdf8;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
}

.node-type-selector .dir-pill.active {
  background: rgba(245, 158, 11, 0.16);
  border-color: rgba(245, 158, 11, 0.45);
  color: #fbbf24;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
}

.edit-actions {
  display: flex;
  gap: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  padding-left: 10px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 13px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.save-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
}

.save-btn:hover {
  background: linear-gradient(135deg, #34d399, #10b981);
  transform: translateY(-1px);
}

.cancel-btn {
  background: rgba(51, 65, 85, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
}

.cancel-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fca5a5;
  transform: translateY(-1px);
}

.reset-btn {
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.25);
  color: #94a3b8;
}

.reset-btn:hover {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.5);
  color: #38bdf8;
  transform: translateY(-1px);
}
</style>
