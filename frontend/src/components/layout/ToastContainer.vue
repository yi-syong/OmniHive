<template>
  <transition name="toast">
    <div v-if="message" :class="['toast-notification', `toast-${type}`]">
      <component :is="icon" :size="18" class="toast-icon-svg" />
      <span class="toast-text">{{ message }}</span>
    </div>
  </transition>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  message: string | null;
  type: 'success' | 'info' | 'warn';
  icon: Component;
}>();
</script>
