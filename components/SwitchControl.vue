<script setup lang="ts">
import { ref, useId } from 'vue';
const props = defineProps<{ modelValue: boolean; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const id = useId();
const input = ref<HTMLInputElement>();
function toggleRow(event: MouseEvent) {
  if (props.disabled || (event.target as Element).closest('button,input,label,a,[role="tooltip"]')) return;
  input.value?.click();
}
</script>
<template>
  <div class="switch-control relative flex items-center justify-between gap-3 min-h-10 cursor-pointer" @click="toggleRow">
    <div class="switch-caption flex items-center gap-1 min-w-0 flex-1">
      <label :for="id" class="min-w-0 cursor-pointer"><slot /></label>
      <slot name="label-extra" />
    </div>
    <input :id="id" ref="input" class="switch-input absolute right-0 z-1 opacity-0 cursor-pointer" type="checkbox" role="switch" :checked="modelValue" :aria-checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span class="switch-track relative block shrink-0" aria-hidden="true" />
  </div>
</template>
