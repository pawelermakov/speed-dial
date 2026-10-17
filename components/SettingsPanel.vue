<script setup lang="ts">
import { ui } from '../utils/ui';
import { syncStatus, type SyncStatus } from '../services/sync';
import { reactive, shallowRef, ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { browser } from 'wxt/browser';
import { repository } from '../composables/useDial';
import type { Settings, FolderChoice } from '../types/models';
import { readImage } from '../services/images';
const props = defineProps<{ settings: Settings; busy: boolean; rootId: string | null; operationError: string }>();
const emit = defineEmits<{ close: []; save: [settings: Settings, background: Blob | null | undefined, rootId: string]; import: []; export: []; reset: [] }>();
const folders = ref<FolderChoice[]>([]);
const folderLoading = ref(true), folderError = ref('');
const selectedFolder = ref(props.rootId ?? '');
const folderEdited = ref(false);
const selectedChoice = computed(() => folders.value.find(row => row.id === selectedFolder.value));
let folderGeneration = 0, timer: ReturnType<typeof setTimeout> | undefined, disposed = false;
watch(() => props.rootId, id => { if (!folderEdited.value) selectedFolder.value = id ?? ''; });
async function loadFolders() {
  const generation = ++folderGeneration;
  folderLoading.value = true;
  try {
    const next = await repository.choices();
    if (disposed || generation !== folderGeneration) return;
    folders.value = next;
    folderError.value = '';
  } catch (cause) {
    if (!disposed && generation === folderGeneration) folderError.value = 'Не удалось загрузить папки закладок. ' + (cause instanceof Error ? cause.message : String(cause));
  } finally { if (!disposed && generation === folderGeneration) folderLoading.value = false; }
}
function scheduleFolders() {
  folderGeneration++;
  clearTimeout(timer);
  timer = setTimeout(() => { void loadFolders(); }, 60);
}
const api = browser.bookmarks;
const events = [api?.onCreated, api?.onRemoved, api?.onChanged, api?.onMoved, api?.onChildrenReordered, api?.onImportEnded];
onMounted(() => { events.forEach(event => event?.addListener(scheduleFolders)); void loadFolders(); });
onUnmounted(() => {
  disposed = true; folderGeneration++; clearTimeout(timer);
  events.forEach(event => event?.removeListener(scheduleFolders));
});
const sync = ref<SyncStatus>('unknown');
onMounted(async () => { sync.value = await syncStatus(); });
const syncLabels = { enabled: 'Включена', disabled: 'Выключена', unknown: 'Не удалось определить', unsupported: 'Статус синхронизации недоступен в Firefox' };
const initialSettings = { ...props.settings };
const draft = reactive({ ...initialSettings });
const background = shallowRef<Blob | null | undefined>();
const error = ref('');
const reading = ref(false);
function submit() {
  if (props.busy || reading.value || folderLoading.value || folderError.value || !selectedChoice.value) return;
  const keys = Object.keys(initialSettings) as Array<keyof Settings>;
  const changes = Object.fromEntries(keys.filter(key => draft[key] !== initialSettings[key]).map(key => [key, draft[key]]));
  emit('save', { ...props.settings, ...changes }, background.value, selectedFolder.value);
}
async function file(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0];
  if (!selected) return;
  reading.value = true; error.value = '';
  try { background.value = await readImage(selected); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { reading.value = false; }
}
</script>
<template>
  <div class="fixed inset-0 z-20" @click.self="!busy && emit('close')">
    <aside class="settings fixed top-0 right-0 h-full w-[min(300px,100vw)] p-[15px] bg-white/80 backdrop-blur-[10px] shadow-[0_1px_3px_rgb(50_50_50/0.3)] overflow-y-auto flex flex-col animate-slide motion-reduce:animate-none" aria-label="Настройки">
      <header class="settings-header shrink-0 text-base font-bold text-center border-b border-black/20 mb-4 pb-4 [&_h2]:text-base [&_h2]:font-bold [&_h2]:leading-[normal]"><h2>Настройки</h2><button class="sr-only focus:not-sr-only" aria-label="Закрыть настройки" :disabled="busy" @click="emit('close')">×</button></header>
      <div class="mb-4 text-sm"><p>Синхронизация Chrome: {{ syncLabels[sync] }}</p><p v-if="sync === 'disabled'">Включите синхронизацию Chrome, чтобы закладки были доступны на других устройствах.</p><p v-if="sync === 'unsupported'">Проверьте синхронизацию в настройках Firefox.</p><p>Общий статус не подтверждает включение синхронизации закладок или доставку изменений.</p></div>
      <form class="settings-form flex flex-col flex-1" @submit.prevent="submit">
        <div class="mb-4 min-w-0 text-sm">
          <label for="bookmark-folder" class="block mb-2">Папка закладок</label>
          <select id="bookmark-folder" v-model="selectedFolder" :title="selectedChoice?.path" class="w-full min-w-0 max-w-full rounded-[5px] border border-[#ced4da] bg-white p-2 text-sm truncate" :disabled="busy || folderLoading || !!folderError" @change="folderEdited = true">
            <option v-if="selectedFolder && !selectedChoice" :value="selectedFolder" disabled>{{ folderLoading ? 'Загрузка папок…' : 'Выбранная папка недоступна' }}</option>
            <option v-for="choice in folders" :key="choice.id" :value="choice.id" :title="choice.path">{{ choice.path }}</option>
          </select>
          <p v-if="folderLoading" role="status" class="mt-2">Загрузка папок…</p>
          <p v-else-if="folderError" role="alert" class="mt-2 text-red-800">{{ folderError }} <button type="button" :disabled="busy" @click="loadFolders">Повторить</button></p>
          <p v-else-if="selectedFolder && !selectedChoice" role="alert" class="mt-2 text-red-800">Выбранная папка недоступна. Выберите другую папку.</p>
        </div>
        <label class="settings-row flex justify-between items-center mb-2 text-sm leading-[normal] [&_input:not([type=checkbox])]:w-16 [&_input]:m-0 has-[[type=checkbox]]:relative has-[[type=checkbox]]:cursor-pointer [&_input[type=checkbox]]:absolute [&_input[type=checkbox]]:right-0 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6 [&_input[type=checkbox]]:opacity-0 [&_input[type=checkbox]]:z-1">Ширина (%):<input aria-label="Ширина (%)" v-model.number="draft.width" class="input" :class="ui.input" type="number" min="50" max="100" required :disabled="busy" /></label>
        <label class="settings-row flex justify-between items-center mb-2 text-sm leading-[normal] [&_input:not([type=checkbox])]:w-16 [&_input]:m-0 has-[[type=checkbox]]:relative has-[[type=checkbox]]:cursor-pointer [&_input[type=checkbox]]:peer [&_input[type=checkbox]]:absolute [&_input[type=checkbox]]:right-0 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6 [&_input[type=checkbox]]:opacity-0 [&_input[type=checkbox]]:z-1">Количество столбцов:<input aria-label="Количество столбцов" v-model.number="draft.countColumns" class="input" :class="ui.input" type="number" min="2" max="12" required :disabled="busy" /></label>
        <label class="settings-row flex justify-between items-center mb-2 text-sm leading-[normal] [&_input:not([type=checkbox])]:w-16 [&_input]:m-0 has-[[type=checkbox]]:relative has-[[type=checkbox]]:cursor-pointer [&_input[type=checkbox]]:peer [&_input[type=checkbox]]:absolute [&_input[type=checkbox]]:right-0 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6 [&_input[type=checkbox]]:opacity-0 [&_input[type=checkbox]]:z-1">Расстояние (px):<input aria-label="Расстояние (px)" v-model.number="draft.space" class="input" :class="ui.input" type="number" min="0" max="48" required :disabled="busy" /></label>
        <label class="settings-row flex justify-between items-center mb-2 text-sm leading-[normal] [&_input:not([type=checkbox])]:w-16 [&_input]:m-0 has-[[type=checkbox]]:relative has-[[type=checkbox]]:cursor-pointer [&_input[type=checkbox]]:peer [&_input[type=checkbox]]:absolute [&_input[type=checkbox]]:right-0 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6 [&_input[type=checkbox]]:opacity-0 [&_input[type=checkbox]]:z-1">Центрировать по вертикали:<input v-model="draft.verticalCenter" class="peer" type="checkbox" :disabled="busy" /><span class="checkmark block w-6 h-6 border border-[#ced4da] rounded-[5px] bg-white shrink-0 relative transition-all duration-250 ease-in-out motion-reduce:transition-none after:content-[''] after:absolute after:top-0 after:left-[6px] after:w-[6px] after:h-[14px] after:border-white after:border-solid after:border-r-[3px] after:border-b-[3px] after:rotate-45 after:opacity-0 after:invisible after:box-content after:transition-all after:duration-250 after:ease-in-out peer-checked:bg-[#ffcc00] peer-checked:border-[#ffcc00] peer-checked:after:opacity-100 peer-checked:after:visible peer-focus-visible:outline-1 peer-focus-visible:outline-[#54565a] peer-focus-visible:outline-offset-2" aria-hidden="true"></span></label>
        <label class="settings-row flex justify-between items-center mb-2 text-sm leading-[normal] [&_input:not([type=checkbox])]:w-16 [&_input]:m-0 has-[[type=checkbox]]:relative has-[[type=checkbox]]:cursor-pointer [&_input[type=checkbox]]:peer [&_input[type=checkbox]]:absolute [&_input[type=checkbox]]:right-0 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6 [&_input[type=checkbox]]:opacity-0 [&_input[type=checkbox]]:z-1">Показать кнопку &quot;+&quot;:<input aria-label="Показать кнопку «+»" v-model="draft.addButton" class="peer" type="checkbox" :disabled="busy" /><span class="checkmark block w-6 h-6 border border-[#ced4da] rounded-[5px] bg-white shrink-0 relative transition-all duration-250 ease-in-out motion-reduce:transition-none after:content-[''] after:absolute after:top-0 after:left-[6px] after:w-[6px] after:h-[14px] after:border-white after:border-solid after:border-r-[3px] after:border-b-[3px] after:rotate-45 after:opacity-0 after:invisible after:box-content after:transition-all after:duration-250 after:ease-in-out peer-checked:bg-[#ffcc00] peer-checked:border-[#ffcc00] peer-checked:after:opacity-100 peer-checked:after:visible peer-focus-visible:outline-1 peer-focus-visible:outline-[#54565a] peer-focus-visible:outline-offset-2" aria-hidden="true"></span></label>
        <div class="settings-row flex justify-between items-center mb-2 text-sm leading-[normal] [&_input:not([type=checkbox])]:w-16 [&_input]:m-0 has-[[type=checkbox]]:relative has-[[type=checkbox]]:cursor-pointer [&_input[type=checkbox]]:peer [&_input[type=checkbox]]:absolute [&_input[type=checkbox]]:right-0 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6 [&_input[type=checkbox]]:opacity-0 [&_input[type=checkbox]]:z-1"><span>Изменить фон:</span><input aria-label="Изменить фон" id="background" class="file-input" :class="ui.fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" :disabled="busy || reading" @change="file" /><label class="file-button" :class="ui.fileButton" for="background">Выберите файл</label></div>
        <button type="button" class="sr-only focus:not-sr-only" :disabled="busy" @click="background = null">Убрать пользовательский фон</button>
        <label class="settings-row settings-email flex justify-between items-center mb-2 text-sm leading-[normal] [&_input:not([type=checkbox])]:w-16 [&_input]:m-0 has-[[type=checkbox]]:relative has-[[type=checkbox]]:cursor-pointer [&_input[type=checkbox]]:peer [&_input[type=checkbox]]:absolute [&_input[type=checkbox]]:right-0 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6 [&_input[type=checkbox]]:opacity-0 [&_input[type=checkbox]]:z-1 [&_input:not([type=checkbox])]:w-[70%]">E-mail:<input aria-label="E-mail Mail.ru" v-model="draft.email" class="input" :class="ui.input" type="email" :disabled="busy" /></label>
        <p v-if="error || operationError" role="alert" class="text-red-800">{{ error || operationError }}</p>
        <button class="button" :class="ui.button" :disabled="busy || reading || folderLoading || !!folderError || !selectedChoice">Сохранить</button>
        <div class="settings-bottom mt-auto [&_.settings-row]:mb-4 [&_.button]:w-[calc(50%-8px)] [&>.button]:w-full">
          <div class="settings-row flex justify-between items-center mb-2 text-sm leading-[normal] [&_input:not([type=checkbox])]:w-16 [&_input]:m-0 has-[[type=checkbox]]:relative has-[[type=checkbox]]:cursor-pointer [&_input[type=checkbox]]:peer [&_input[type=checkbox]]:absolute [&_input[type=checkbox]]:right-0 [&_input[type=checkbox]]:w-6 [&_input[type=checkbox]]:h-6 [&_input[type=checkbox]]:opacity-0 [&_input[type=checkbox]]:z-1"><button type="button" class="button" :class="ui.button" :disabled="busy || reading || !rootId" @click="emit('import')">Импорт</button><button type="button" class="button" :class="ui.button" :disabled="busy || reading || !rootId" @click="emit('export')">Экспорт</button></div>
          <button type="button" class="button danger  !bg-[#dc3545] !border-[#dc3545] !text-white enabled:hover:!bg-[#bb2d3b]" :class="ui.button" :disabled="busy || reading" @click="emit('reset')">Сбросить настройки и кэш</button>
        </div>
      </form>
    </aside>
  </div>
</template>
