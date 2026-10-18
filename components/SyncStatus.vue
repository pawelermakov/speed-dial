<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { syncStatus, type SyncStatus } from '../services/sync';
const status=ref<SyncStatus>('unknown'), checking=ref(false), info=ref(false);
let generation=0;
const labels={enabled:'Включена',disabled:'Выключена',unknown:'Не удалось определить',unsupported:'Статус недоступен'};
const icons={enabled:'circle-check',disabled:'circle-x',unknown:'circle-help',unsupported:'circle-minus'};
async function check(){const current=++generation;checking.value=true;const next=await syncStatus();if(current===generation){status.value=next;checking.value=false;}}
onMounted(()=>{void check();});onUnmounted(()=>generation++);
</script>
<template>
  <section class="mb-5 text-sm" aria-label="Синхронизация">
    <h3 class="font-bold mb-2">Синхронизация <button type="button" aria-label="О синхронизации" :aria-expanded="info" aria-controls="sync-info" class="ml-1" @click="info=!info">ⓘ</button></h3>
    <p role="status" class="flex items-center gap-2">
      <svg v-if="!checking" :data-icon="icons[status]" class="size-5 shrink-0" :class="status==='enabled'?'text-green-700':status==='disabled'?'text-red-700':'text-gray-600'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/><path v-if="status==='enabled'" d="m8 12 3 3 5-6"/><path v-else-if="status==='disabled'" d="m9 9 6 6m0-6-6 6"/><path v-else-if="status==='unsupported'" d="M8 12h8"/><path v-else d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2m0 3h.01"/>
      </svg>{{checking?'Проверка…':labels[status]}}
    </p>
    <p v-if="!checking&&status==='disabled'" class="mt-2">Включите синхронизацию вручную в настройках профиля Chrome.</p>
    <p v-if="!checking&&status==='unknown'" class="mt-2">Проверьте профиль Chrome и разрешение на получение статуса.</p>
    <p v-if="!checking&&status==='unsupported'" class="mt-2">Откройте настройки Firefox Sync, чтобы проверить синхронизацию.</p>
    <p v-if="info" id="sync-info" class="mt-2">Это общий статус синхронизации профиля Chrome. Он не гарантирует синхронизацию закладок и доставку изменений. Скриншоты и favicon хранятся локально. Firefox не предоставляет этот статус расширению.</p>
    <button type="button" class="mt-2 underline" :disabled="checking" @click="check">Проверить ещё раз</button>
  </section>
</template>
