<template>
  <div class="modal-overlay" @click.self="$emit('close')">
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
        <button class="btn-modal btn-cancel" @click="$emit('close')">
          繼續編輯
        </button>
        <button class="btn-modal btn-discard" @click="$emit('discard')">
          放棄變更並切換
        </button>
        <button class="btn-modal btn-save-primary" @click="$emit('save')">
          <Save :size="15" />
          儲存並開始模擬
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle, ShieldAlert, Save } from 'lucide-vue-next';

defineEmits<{
  (e: 'close'): void;
  (e: 'discard'): void;
  (e: 'save'): void;
}>();
</script>
