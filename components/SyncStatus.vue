<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { syncStatus, type SyncStatus } from '../services/sync';
const status=ref<SyncStatus>('unknown'), checking=ref(false), email=ref('');
let generation=0;
const labels={enabled:'Включена',disabled:'Выключена',unknown:'Не удалось определить',unsupported:'Статус недоступен'};
const info=computed(()=>status.value==='unsupported'?'Статус Firefox Sync можно проверить в настройках браузера.':'Статус синхронизации профиля Chrome. Синхронизация закладок настраивается в браузере.');
const icons={enabled:'circle-check',disabled:'circle-x',unknown:'circle-help',unsupported:'circle-minus'};
async function check(){const current=++generation;checking.value=true;const next=await syncStatus();if(current===generation){status.value=next.status;email.value=next.email;checking.value=false;}}
onMounted(()=>{void check();});onUnmounted(()=>generation++);
</script>
<template>
  <section class="mb-5 text-sm" aria-label="Синхронизация">
    <h3 class="font-bold mb-2 flex items-center gap-2">Синхронизация
      <span class="sync-help relative inline-flex group font-normal">
        <button type="button" aria-label="О синхронизации" aria-describedby="sync-info" class="size-5 inline-flex items-center justify-center rounded-[var(--ui-radius)] ui-hover"><svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg></button>
        <span id="sync-info" role="tooltip" class="sync-tooltip absolute left-[-120px] top-full mt-2 w-60 p-3 text-sm leading-normal ui-glass z-10 invisible opacity-0 group-hover:visible group-hover:opacity-100 ">{{info}}</span>
      </span>
    </h3>
    <div class="flex items-center justify-between gap-3">
    <p role="status" class="flex items-center gap-2 min-h-7 min-w-0 flex-1" :aria-label="email ? labels[status]+': '+email : undefined" :title="email ? labels[status]+': '+email : undefined" :class="email?'text-[var(--ui-text)]':status==='enabled'?'text-green-700':status==='disabled'?'text-red-700':'text-gray-600'">
      <svg :data-icon="icons[status]" class="size-5 shrink-0" :class="status==='enabled'?'text-green-700':status==='disabled'?'text-red-700':'text-gray-600'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/><path v-if="status==='enabled'" d="m8 12 3 3 5-6"/><path v-else-if="status==='disabled'" d="m9 9 6 6m0-6-6 6"/><path v-else-if="status==='unsupported'" d="M8 12h8"/><path v-else d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2m0 3h.01"/>
      </svg><span v-if="email" class="sync-email min-w-0 truncate">{{email}}</span><span v-else>{{labels[status]}}</span>
    </p>
      <button type="button" class="size-7 shrink-0 inline-flex items-center justify-center rounded-[var(--ui-radius)] ui-hover" aria-label="Проверить ещё раз" title="Проверить синхронизацию" :aria-busy="checking" :disabled="checking" @click="check">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4v6h-6"/><path d="M20 10a8 8 0 1 0-1 8"/></svg>
      </button>
    </div>
    <p v-if="status==='disabled'" class="mt-2">Включите синхронизацию вручную в настройках профиля Chrome.</p>
    <p v-if="status==='unknown'" class="mt-2">Проверьте профиль Chrome и разрешение на получение статуса.</p>
    <p v-if="status==='unsupported'" class="mt-2">Откройте настройки Firefox Sync, чтобы проверить синхронизацию.</p>
  </section>
</template>

<style scoped>
.sync-help:has(button:focus-visible) .sync-tooltip {visibility:visible;opacity:1;}
</style>
