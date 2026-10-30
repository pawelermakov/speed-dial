<script setup lang="ts">
import { t, formatMessage } from '../services/i18n';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import InfoTooltip from './InfoTooltip.vue';
import { ui } from '../utils/ui';
import { storage } from 'wxt/utils/storage';
import { syncStatus, type SyncStatus } from '../services/sync';
import { syncRequest } from '../services/syncClient';
import type { SyncState } from '../services/settingsSync';
defineProps<{ tooltipTarget?: string }>();
const status = ref<SyncStatus>('unknown'),
  checking = ref(false),
  email = ref('');
const state = ref<SyncState | null>(null);
const stateItem = storage.defineItem<SyncState>('local:settingsSyncState');
const unwatch = stateItem.watch((value) => {
  state.value = value;
});
let generation = 0;
const labels = {
  get enabled() {
    return t('sync.status.enabled');
  },
  get disabled() {
    return t('sync.status.disabled');
  },
  get unknown() {
    return t('sync.status.unknown');
  },
  get unavailable() {
    return t('sync.status.unavailable');
  },
};
const info = computed(
  () =>
    ({
      get enabled() {
        return t('sync.help.chrome_enabled');
      },
      get disabled() {
        return t('sync.help.chrome_disabled');
      },
      get unknown() {
        return t('sync.help.chrome_unknown');
      },
      get unavailable() {
        return t('sync.help.firefox');
      },
    })[status.value],
);
const icons = {
  enabled: 'circle-check',
  disabled: 'circle-x',
  unknown: 'circle-help',
  unavailable: 'circle-help',
};
async function check() {
  const current = ++generation;
  checking.value = true;
  const next = await syncStatus();
  if (current === generation) {
    status.value = next.status;
    email.value = next.email;
  }
  await syncRequest('retry');
  if (current === generation) checking.value = false;
}
async function confirm(transfer: boolean) {
  await syncRequest('confirm', transfer);
  await syncRequest('flush');
}
onMounted(() => {
  void check();
  void stateItem.getValue().then((value) => {
    state.value = value;
  });
});
onUnmounted(() => {
  generation++;
  unwatch();
});
</script>
<template>
  <section class="relative mb-5 text-base" :aria-label="t('sync.title')">
    <div class="flex items-center gap-2 mb-2">
      <h3 class="text-base leading-7 font-bold">{{ t('sync.title') }}</h3>
      <InfoTooltip :target="tooltipTarget" id="sync-info" :label="t('sync.help.label')">{{
        info
      }}</InfoTooltip>
    </div>
    <div class="sync-account grid gap-0">
      <p
        role="status"
        class="flex items-center gap-1.5 font-medium"
        :class="
          status === 'enabled'
            ? 'text-[var(--success)]'
            : status === 'disabled'
              ? 'text-[var(--danger)]'
              : 'text-[var(--ui-text)]'
        "
      >
        <svg
          :data-icon="icons[status]"
          class="size-5 shrink-0"
          :class="
            status === 'enabled'
              ? 'text-[var(--success)]'
              : status === 'disabled'
                ? 'text-[var(--danger)]'
                : 'text-[var(--text-secondary)]'
          "
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path v-if="status === 'enabled'" d="m8 12 3 3 5-6" />
          <path v-else-if="status === 'disabled'" d="m9 9 6 6m0-6-6 6" />
          <path v-else d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2m0 3h.01" /></svg
        ><span>{{ labels[status] }}</span>
      </p>
      <p
        class="sync-email min-w-0 truncate pl-[26px] text-sm leading-5 font-normal text-[var(--text-secondary)]"
        :tabindex="email ? 0 : undefined"
        :title="email || undefined"
      >
        {{
          email ||
          (status === 'unavailable'
            ? t('sync.firefox.check_settings')
            : t('sync.account.unavailable'))
        }}
      </p>
    </div>
    <div v-if="state?.error" role="alert" class="sync-notice ui-caption mt-2">
      <p>{{ formatMessage(state.error) }}</p>
      <button
        type="button"
        class="sync-action mt-3"
        :class="ui.button"
        :aria-busy="checking"
        :disabled="checking"
        @click="check"
      >
        <span class="ui-action-label">{{ t('common.retry') }}</span>
      </button>
    </div>
    <div v-if="state?.confirm" class="sync-notice ui-caption mt-3">
      <p>{{ t('sync.confirmation.description') }}</p>
      <div class="grid gap-2 mt-3">
        <button type="button" class="sync-action" :class="ui.button" @click="confirm(true)">
          <span class="ui-action-label">{{ t('sync.confirmation.use_local') }}</span></button
        ><button type="button" class="sync-action" :class="ui.button" @click="confirm(false)">
          <span class="ui-action-label">{{ t('sync.confirmation.use_defaults') }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.sync-notice {
  padding: 8px;
  border-radius: var(--ui-radius);
}
.sync-notice .sync-action .ui-action-label {
  background: transparent;
  color: inherit;
}
@media (forced-colors: active) {
  .sync-notice,
  .sync-notice .sync-action,
  .sync-notice .sync-action:enabled:hover {
    background: Canvas;
    color: CanvasText;
  }
}
</style>
