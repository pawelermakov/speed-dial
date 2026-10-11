<script setup lang="ts">
import { ui } from '../utils/ui';
import { ref } from 'vue';
import type { Bookmark } from '../types/models';
import ModalDialog from './ModalDialog.vue';
const props = defineProps<{ bookmark?: Bookmark; busy: boolean; error: string }>();
const emit = defineEmits<{ close: []; save: [value: { url: string; title: string; capture: boolean }] }>();
const url = ref(props.bookmark?.url ?? '');
const title = ref(props.bookmark?.title ?? '');
const capture = ref(true);
</script>
<template>
  <ModalDialog :title="bookmark ? 'Изменить закладку' : 'Добавить закладку'" :busy="busy" @close="emit('close')">
    <form class="bookmark-form [&_.input]:mt-0 [&_.input]:mb-4" @submit.prevent="emit('save', { url, title, capture })">
      <label class="block"><span class="sr-only">Адрес сайта</span><input v-model="url" class="input mt-1" :class="ui.input" autofocus required :disabled="busy" placeholder="Введите адрес сайта..." /></label>
      <label v-if="bookmark" class="block"><span class="sr-only">Заголовок</span><input v-model="title" class="input mt-1" :class="ui.input" placeholder="Введите название закладки" :disabled="busy" /></label>
      <label v-else class="capture-option sr-only focus-within:not-sr-only flex items-start gap-2 [&_input]:accent-[#ffcc00] [&_input]:w-[22px] [&_input]:h-[22px] [&_input]:shrink-0"><input v-model="capture" type="checkbox" :disabled="busy" class="mt-1" />
        <span>Создать эскиз: сайт временно откроется в активной вкладке.</span>
      </label>
      <p v-if="error" role="alert" class="text-red-800">{{ error }}</p>
      <p v-if="busy" role="status">Сохранение… Захват сайта может занять до 20 секунд.</p>
      <button class="button w-full" :class="ui.button" :disabled="busy">{{ bookmark ? 'Сохранить' : 'Добавить' }}</button>
      <button v-if="!bookmark && error" type="button" class="button w-full" :class="ui.button" :disabled="busy"
        @click="emit('save', { url, title, capture: false })">Сохранить без эскиза</button>
    </form>
  </ModalDialog>
</template>
