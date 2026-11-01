<script setup lang="ts">
import { useUiI18n } from '../i18n';

import { useId } from 'vue';
const { formatMessage } = useUiI18n();

defineProps<{
  title: string;
  description: string;
  actionLabel: string;
  symbol: 'bookmark' | 'search';
  disabled?: boolean;
  announce?: boolean;
}>();
const emit = defineEmits<{ action: [] }>();
const titleId = useId();
</script>
<template>
  <section
    class="surface-empty empty-state"
    :role="announce ? 'status' : undefined"
    :aria-labelledby="titleId"
  >
    <svg
      class="empty-state-icon"
      width="40"
      height="40"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path v-if="symbol === 'bookmark'" d="M9 5h14a2 2 0 0 1 2 2v21l-9-6-9 6V7a2 2 0 0 1 2-2Z" />
      <template v-else>
        <circle cx="14" cy="14" r="9" />
        <path d="m21 21 7 7" />
      </template>
    </svg>
    <h2 :id="titleId" class="empty-state-title">{{ formatMessage(title) }}</h2>
    <p class="empty-state-description">{{ formatMessage(description) }}</p>
    <button
      type="button"
      class="ui-button empty-state-action"
      :class="{ 'add-card': symbol === 'bookmark' }"
      :disabled="disabled"
      @click="emit('action')"
    >
      {{ formatMessage(actionLabel) }}
    </button>
  </section>
</template>
<style scoped>
.empty-state {
  width: min(100%, 440px);
  margin-inline: auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-panel);
  background: var(--surface-empty);
  box-shadow: none;
  backdrop-filter: none;
}
.empty-state-icon {
  flex: none;
  margin-bottom: 16px;
  color: var(--text-secondary);
}
.empty-state-title {
  max-width: 100%;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  text-wrap: balance;
}
.empty-state-description {
  max-width: 34ch;
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.empty-state .empty-state-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 100%;
  width: auto;
  min-height: 40px;
  aspect-ratio: auto;
  margin-top: 24px;
  padding: 8px 18px;
  border: 1px solid transparent;
  border-radius: var(--radius-action);
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
  box-shadow: none;
  backdrop-filter: none;
  overflow-wrap: anywhere;
}
.empty-state .empty-state-action:enabled:hover {
  background: var(--ui-accent-hover);
  box-shadow: none;
}
.empty-state .empty-state-action:enabled:active {
  background: var(--ui-accent-pressed);
  box-shadow: none;
}
@media (pointer: coarse) {
  .empty-state .empty-state-action {
    min-height: 44px;
  }
}
@media (forced-colors: active) {
  .empty-state {
    background: Canvas;
    color: CanvasText;
    border-color: ButtonText;
  }
  .empty-state-icon,
  .empty-state-description {
    color: CanvasText;
  }
  .empty-state .empty-state-action {
    background: ButtonFace;
    color: ButtonText;
    border-color: ButtonText;
  }
  .empty-state .empty-state-action:enabled:hover,
  .empty-state .empty-state-action:enabled:active {
    background: Highlight;
    color: HighlightText;
  }
}
</style>
