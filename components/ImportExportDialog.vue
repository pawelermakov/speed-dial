<script setup lang="ts">
import { ui } from '../utils/ui';
import { ref } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { downloadExport } from '../services/importExport';
const props = defineProps<{ mode: 'import' | 'export'; value?: string; busy: boolean; operationError: string }>();
const emit = defineEmits<{ close: []; import: [text: string] }>();
const text = ref(props.value ?? '');
const error = ref('');
const reading = ref(false);
async function read(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = ''; reading.value = true;
  try {
    if (file.size > 40 * 1024 * 1024) throw new Error('JSON больше 40 МБ.');
    text.value = await file.text();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { reading.value = false; }
}
</script>
<template>
  <ModalDialog :title="mode === 'import' ? 'Импорт данных' : 'Экспорт данных'" :busy="busy || reading" wide @close="emit('close')">
    <form class="transfer-form [&_textarea]:block [&_textarea]:w-full [&_textarea]:h-[min(400px,40dvh)] [&_textarea]:mt-0 [&_textarea]:mb-4 [&_textarea]:resize-none [&_textarea]:font-[monospace] [&_textarea]:text-base [&_.file-button]:w-full [&_.file-button]:h-[38px] [&_.file-button]:mb-4" @submit.prevent="emit('import', text)">
      <p class="mb-3" v-if="mode === 'import'">Импорт версии 2 добавит закладки и папки в выбранную папку. Возможны дубликаты. Настройки и фон будут применены после подтверждения.</p>
      <p class="sr-only" v-else>Скриншоты и favicon исключены из экспорта. Фон и настройки включены; эскизы можно обновить из меню карточки.</p>
      <label class="block"><span class="sr-only">JSON</span><textarea v-model="text" class="input mt-1" :class="ui.input" :readonly="mode === 'export'" :disabled="busy || reading" required /></label>
      <input v-if="mode === 'import'" aria-label="Выберите JSON-файл" id="fileimport" class="file-input" :class="ui.fileInput" type="file" accept=".json,application/json" :disabled="busy || reading" @change="read" /><label v-if="mode === 'import'" class="file-button" :class="ui.fileButton" for="fileimport">Открыть файл...</label>
      <p v-if="error || operationError" role="alert" class="text-red-800">{{ error || operationError }}</p>
      <button v-if="mode === 'import'" class="button w-full" :class="ui.button" :disabled="busy || reading"><span class="ui-action-label">Импортировать</span></button>
      <button v-else type="button" class="button w-full" :class="ui.button" @click="downloadExport(text)"><span class="ui-action-label">Сохранить в файл</span></button>
    </form>
  </ModalDialog>
</template>
