<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { unreadMail } from '../services/network';
const props = defineProps<{ email: string }>();
const count = ref(0);
const error = ref('');
let request: AbortController | undefined;
watch(() => props.email, async email => {
  request?.abort(); count.value = 0; error.value = '';
  if (!email) return;
  const controller = new AbortController(); request = controller;
  try {
    const value = await unreadMail(email, controller.signal);
    if (request === controller) count.value = value;
  } catch (cause) {
    if (request === controller && !controller.signal.aborted)
      error.value = 'Mail.ru: ' + (cause instanceof Error ? cause.message : String(cause));
  }
}, { immediate: true });
onUnmounted(() => request?.abort());
</script>
<template>
  <span v-if="email" class="mail-control relative inline-flex size-12 shrink-0">
  <a class="mail relative flex size-12 items-center justify-center" href="https://e.mail.ru/messages/inbox/"
    aria-label="Открыть почту Mail.ru" :title="error || 'Mail.ru: непрочитанных ' + count">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
    <span v-if="count > 0" class="badge absolute -top-1 -right-1 min-h-5 min-w-5 flex items-center justify-center rounded-full bg-[#dc3545] text-white text-xs font-semibold px-1 text-center">{{ count>99?'99+':count }}</span>
  </a>
  <span v-if="error" class="mail-error absolute right-0 top-full mt-2 w-[220px] max-w-[calc(100vw-32px)] ui-glass ui-error p-3" role="status">{{ error }}</span>
  </span>
</template>
