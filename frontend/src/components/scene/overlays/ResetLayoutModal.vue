<template>
  <div class="reset-modal-overlay" @click.self="$emit('close')">
    <div class="reset-modal-card">
      <div class="reset-modal-header">
        <div class="reset-icon-box">
          <RotateCcw :size="18" />
        </div>
        <div class="reset-title-group">
          <h3>重設 / 清空場域地圖</h3>
          <span class="reset-subtitle">重新開始或載入乾淨拓撲</span>
        </div>
        <button class="reset-modal-close" @click="$emit('close')">
          <X :size="14" />
        </button>
      </div>
      <p class="reset-modal-desc">
        若現有站點發生重疊或需要重新配置，您可以選擇載入標準測試地圖，或將畫布完全清空：
      </p>
      <div class="reset-options-list">
        <button type="button" class="reset-option-card template-card" @click="$emit('reset-template')">
          <div class="option-icon-badge">✨</div>
          <div class="option-content">
            <div class="option-title">載入標準測試拓撲 (推薦)</div>
            <div class="option-detail">自動建立 4 個連通站點：充電站⚡ + 中央通道 + 取貨站 (有貨📦) + 放貨站 (無貨)，可直接測試取放貨。</div>
          </div>
        </button>

        <button type="button" class="reset-option-card clear-card" @click="$emit('clear-canvas')">
          <div class="option-icon-badge">🗑️</div>
          <div class="option-content">
            <div class="option-title">完全清空地圖 (空白畫布)</div>
            <div class="option-detail">清空所有節點與路徑，清除所有物件，讓您從零開始自由規劃。</div>
          </div>
        </button>
      </div>
      <div class="reset-modal-footer">
        <button type="button" class="btn-cancel-modal" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RotateCcw, X } from 'lucide-vue-next';

defineEmits<{
  (e: 'close'): void;
  (e: 'reset-template'): void;
  (e: 'clear-canvas'): void;
}>();
</script>

<style scoped>
.reset-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeInModal 0.2s ease-out;
}

@keyframes fadeInModal {
  from { opacity: 0; }
  to { opacity: 1; }
}

.reset-modal-card {
  width: 100%;
  max-width: 480px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: scaleUpModal 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleUpModal {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.reset-modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.reset-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #38bdf8;
  flex-shrink: 0;
}

.reset-title-group {
  flex: 1;
  min-width: 0;
}

.reset-title-group h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
}

.reset-subtitle {
  font-size: 11px;
  color: #94a3b8;
}

.reset-modal-close {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.reset-modal-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.reset-modal-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: #cbd5e1;
}

.reset-options-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reset-option-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.template-card {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(99, 102, 241, 0.12));
  border-color: rgba(56, 189, 248, 0.35);
}

.template-card:hover {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.22), rgba(99, 102, 241, 0.22));
  border-color: rgba(56, 189, 248, 0.65);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(14, 165, 233, 0.2);
}

.clear-card {
  background: rgba(30, 41, 59, 0.6);
  border-color: rgba(239, 68, 68, 0.25);
}

.clear-card:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(239, 68, 68, 0.15);
}

.option-icon-badge {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}

.option-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.option-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #f8fafc;
}

.template-card .option-title {
  color: #38bdf8;
}

.clear-card .option-title {
  color: #f87171;
}

.option-detail {
  font-size: 11.5px;
  line-height: 1.5;
  color: #94a3b8;
}

.reset-modal-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.btn-cancel-modal {
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 7px 16px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel-modal:hover {
  background: rgba(51, 65, 85, 0.85);
  color: #e2e8f0;
}
</style>
