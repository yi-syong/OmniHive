<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card modal-danger">
      <div class="modal-header">
        <div class="modal-header-icon danger-icon">
          <ShieldAlert :size="24" class="text-rose" />
        </div>
        <div>
          <h3 class="modal-title">確認強制解除全廠卡死？</h3>
          <p class="modal-subtitle">高風險操作 · 影響全廠在線車隊</p>
        </div>
      </div>
      
      <div class="modal-body">
        <p class="modal-desc">
          系統將強制中止所有正在執行與交管停等中的任務，立即釋放全廠鎖定之路權節點，並將車隊狀態重置為待命 (IDLE)。
        </p>
        <div class="danger-callout">
          <AlertTriangle :size="18" class="text-rose shrink-0" />
          <div>
            <strong>影響範圍：</strong>
            <span>全廠所有在線 AGV（立即中斷當前行駛路線與貨物對位流程）。</span>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-modal btn-cancel" @click="$emit('close')">
          取消 (保持現狀)
        </button>
        <button class="btn-modal btn-danger-action" @click="$emit('confirm')">
          <ShieldAlert :size="15" />
          確認解除卡死
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ShieldAlert, AlertTriangle } from 'lucide-vue-next';

defineEmits<{
  (e: 'close'): void;
  (e: 'confirm'): void;
}>();
</script>
