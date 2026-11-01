<script setup lang="ts">
import { useUiI18n } from '../../../common/i18n';

import { computed, toRef } from 'vue';
import { getMailTranslates, type MailProviderDefinition } from '../helpers/presentation';
import { useMailCounter } from '../composables/useMailCounter';
import { useMailService } from '../context';
const { t: $t } = useUiI18n();

const { mailTooltip } = getMailTranslates($t);
const props = defineProps<{ provider: MailProviderDefinition }>();
const { count, status } = useMailCounter(
  toRef(() => props.provider.id),
  useMailService(),
);
const tooltip = computed(() => mailTooltip(props.provider.name, status.value));
</script>
<template>
  <span
    class="mail-control relative inline-flex size-12 shrink-0"
    :data-provider="provider.id"
    :data-status="status"
  >
    <a
      class="mail relative flex size-12 items-center justify-center"
      :href="provider.href"
      :aria-label="
        $t('mail.accessibility.open_with_status', {
          provider_name: provider.name,
          status:
            status === 'ready' && count !== null
              ? $t('mail.accessibility.unread_count', { count: count })
              : ' — ' + tooltip,
        })
      "
      :title="tooltip"
    >
      <svg
        v-if="provider.id === 'mailru'"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fill="#ff9e00"
          d="M12 2a10 10 0 1 0 5.8 18.1l-1.3-1.8A7.8 7.8 0 1 1 19.8 12v1.5a1.2 1.2 0 0 1-2.4 0V7.8h-2.2v.7a5 5 0 1 0 .7 7.6 3.4 3.4 0 0 0 6.1-2.6V12A10 10 0 0 0 12 2Zm0 7.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z"
        />
      </svg>
      <svg
        v-else-if="provider.id === 'gmail'"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke-width="3.5"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path stroke="#4285f4" d="M3 19V6" />
        <path stroke="#34a853" d="M21 19V6" />
        <path stroke="#ea4335" d="m3 6 9 7 9-7" />
        <path stroke="#c5221f" d="M3 6v5" />
        <path stroke="#fbbc04" d="M21 6v5" />
      </svg>
      <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="1" y="4" width="22" height="16" rx="3" fill="#fc3f1d" />
        <path d="m3 6 9 7 9-7" stroke="white" stroke-width="2" stroke-linejoin="round" />
      </svg>
      <span
        v-if="count !== null && count > 0"
        class="badge absolute -top-1 -right-1 min-h-5 min-w-5 flex items-center justify-center rounded-full text-xs font-semibold px-1 text-center"
        >{{ count > 99 ? '99+' : count }}</span
      >
    </a>
    <span
      v-if="status === 'error' || status === 'unauthenticated' || status === 'unsupported'"
      class="mail-error absolute right-0 top-full mt-2 w-[220px] max-w-[calc(100vw-32px)] ui-glass p-3"
      :class="{ 'ui-error': status === 'error' }"
      role="tooltip"
      >{{ tooltip }}</span
    >
  </span>
</template>
