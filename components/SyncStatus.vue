<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import InfoTooltip from './InfoTooltip.vue';
import { ui } from '../utils/ui';
import { storage } from 'wxt/utils/storage';
import { syncStatus, type SyncStatus } from '../services/sync';
import { syncRequest } from '../services/syncClient';
import type { SyncState } from '../services/settingsSync';
const status=ref<SyncStatus>('unknown'), checking=ref(false), email=ref('');
const state=ref<SyncState|null>(null);
const stateItem=storage.defineItem<SyncState>('local:settingsSyncState');
const unwatch=stateItem.watch(value=>{state.value=value;});
let generation=0;
const labels={enabled:'Включена',disabled:'Выключена',unknown:'Не удалось определить',unsupported:'Статус недоступен'};
const info=computed(()=>({
  enabled:'Chrome синхронизирует настройки и выбранную папку. Фон и изображения хранятся на этом устройстве.',
  disabled:'Включите в Chrome синхронизацию «Расширения» и «Закладки».',
  unknown:'Проверьте синхронизацию в настройках Chrome.',
  unsupported:'В Firefox настройки сохраняются только на этом устройстве.',
})[status.value]);
const icons={enabled:'circle-check',disabled:'circle-x',unknown:'circle-help',unsupported:'circle-minus'};
async function check(){
  const current=++generation;checking.value=true;
  const next=await syncStatus();
  if(current===generation){status.value=next.status;email.value=next.email;}
  await syncRequest('retry');
  if(current===generation)checking.value=false;
}
async function confirm(transfer:boolean){await syncRequest('confirm',transfer);await syncRequest('flush');}
onMounted(()=>{void check();void stateItem.getValue().then(value=>{state.value=value;});});
onUnmounted(()=>{generation++;unwatch();});
</script>
<template>
  <section class="relative mb-5 text-sm" aria-label="Синхронизация">
    <div class="flex items-center gap-2 mb-2">
      <h3 class="text-base leading-7 font-bold">Синхронизация</h3>
      <InfoTooltip id="sync-info" label="О синхронизации">{{info}}</InfoTooltip>

    </div>
    <div class="sync-account grid gap-0">
      <p role="status" class="flex items-center gap-1.5 font-medium" :class="status==='enabled'?'text-green-700':status==='disabled'?'text-red-700':'text-[var(--ui-text)]'">
      <svg :data-icon="icons[status]" class="size-5 shrink-0" :class="status==='enabled'?'text-green-700':status==='disabled'?'text-red-700':'text-gray-600'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/><path v-if="status==='enabled'" d="m8 12 3 3 5-6"/><path v-else-if="status==='disabled'" d="m9 9 6 6m0-6-6 6"/><path v-else-if="status==='unsupported'" d="M8 12h8"/><path v-else d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2m0 3h.01"/>
      </svg><span>{{labels[status]}}</span>
      </p>
      <p v-if="status!=='unsupported'" class="sync-email min-w-0 truncate pl-[26px] text-sm leading-5 font-normal text-[color-mix(in_srgb,var(--ui-text)_70%,transparent)]" :tabindex="email?0:undefined" :title="email||undefined">{{email||'Аккаунт недоступен'}}</p>
    </div>
    <p v-if="status==='unsupported'" class="mt-2">Настройки сохраняются локально.</p>
    <div v-if="state?.error&&status!=='unsupported'" role="alert" class="sync-notice ui-caption mt-2">
      <p>{{state.error}}</p>
      <button type="button" class="sync-action mt-3" :class="ui.button" :aria-busy="checking" :disabled="checking" @click="check"><span class="ui-action-label">Повторить</span></button>
    </div>
    <div v-if="state?.confirm&&status!=='unsupported'" class="sync-notice ui-caption mt-3">
      <p>В облаке нет части настроек. Перенести их с этого устройства или использовать значения по умолчанию? Существующие облачные значения сохранятся.</p>
      <div class="grid gap-2 mt-3"><button type="button" class="sync-action" :class="ui.button" @click="confirm(true)"><span class="ui-action-label">Перенести локальные</span></button><button type="button" class="sync-action" :class="ui.button" @click="confirm(false)"><span class="ui-action-label">По умолчанию</span></button></div>
    </div>
  </section>
</template>
<style scoped>
.sync-notice {padding:8px;border-radius:var(--ui-radius);}
.sync-notice .sync-action {background:color-mix(in srgb,rgb(var(--ui-accent-rgb) / var(--ui-surface-alpha)) 35%,var(--ui-surface));color:var(--ui-text);}
.sync-notice .sync-action:enabled:hover {background:color-mix(in srgb,rgb(var(--ui-accent-rgb) / var(--ui-surface-alpha)) 50%,var(--ui-surface));}
.sync-notice .sync-action .ui-action-label {background:transparent;color:inherit;}
@media(forced-colors:active){.sync-notice,.sync-notice .sync-action,.sync-notice .sync-action:enabled:hover{background:Canvas;color:CanvasText;}}
</style>
