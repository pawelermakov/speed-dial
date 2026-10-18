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
  <a v-if="email" class="mail relative group block w-8 h-[23px] text-white/80 hover:text-white transition-all duration-250 ease-in-out motion-reduce:transition-none" href="https://e.mail.ru/messages/inbox/"
    aria-label="Открыть почту Mail.ru" :title="error || 'Mail.ru: непрочитанных ' + count">
    <svg width="32" height="23" viewBox="0 0 32 23" fill="currentColor" aria-hidden="true"><path d="M27.196 0H4.804C3.52789 0.00845052 2.30684 0.520956 1.40698 1.42582C0.507113 2.33068 0.00138056 3.55455 0 4.83069V17.6147C0.00845052 18.8908 0.520956 20.1118 1.42582 21.0117C2.33068 21.9116 3.55455 22.4173 4.83069 22.4187H27.196C28.4675 22.4103 29.6846 21.9015 30.5837 21.0023C31.4828 20.1032 31.9916 18.8862 32 17.6147V4.83069C31.9986 3.55455 31.4929 2.33068 30.593 1.42582C29.6932 0.520956 28.4721 0.00845052 27.196 0V0ZM29.598 20.4597L19.1306 11.5083C18.2582 12.2611 17.1443 12.6753 15.992 12.6753C14.8397 12.6753 13.7258 12.2611 12.8534 11.5083L2.57281 20.5825C2.28227 20.3816 2.02475 20.1366 1.80951 19.8565L12.0314 10.825L2.00701 2.32193C2.24535 2.04726 2.52655 1.81293 2.8397 1.62802L13.574 10.7289C14.2469 11.2937 15.0974 11.6033 15.976 11.6033C16.8545 11.6033 17.705 11.2937 18.378 10.7289L29.1123 1.65471C29.4254 1.83962 29.7066 2.07395 29.945 2.34862L19.9526 10.809L30.3079 19.659C30.1122 19.9596 29.873 20.2294 29.598 20.4597V20.4597Z" /></svg>
    <span v-if="count > 0" class="badge absolute -top-[10px] -right-[10px] w-5 h-5 min-w-5 flex items-center justify-center rounded-full bg-[#dc3545] text-white text-sm font-bold p-0 text-center">{{ count }}</span>
    <span v-if="error" class="mail-error text-xs absolute right-0 top-8 w-[220px] ui-glass ui-error p-2 text-[#8a2020] z-6 invisible opacity-0 transition-opacity duration-250 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100" role="status">{{ error }}</span>
  </a>
</template>
