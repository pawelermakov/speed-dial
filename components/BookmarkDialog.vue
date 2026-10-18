<script setup lang="ts">
import { ui } from '../utils/ui';
import { ref } from 'vue';
import type { Bookmark, Category } from '../types/models';
import ModalDialog from './ModalDialog.vue';
const props = defineProps<{ bookmark?: Bookmark; categories: Category[]; busy: boolean; error: string }>();
const emit = defineEmits<{ close: []; save: [value: { url: string; title: string; capture: boolean; parentId?: string }] }>();
const url = ref(props.bookmark?.url ?? '');
const title = ref(props.bookmark?.title ?? '');
const capture = ref(false);
const parentId = ref(props.bookmark?.parentId);
</script>
<template>
  <ModalDialog :title="bookmark ? 'Изменить закладку' : 'Добавить закладку'" :busy="busy" @close="emit('close')">
    <form class="bookmark-form [&_.input]:mt-0 [&_.input]:mb-4" @submit.prevent="emit('save', { url, title, capture, parentId })">
      <label class="block"><span class="sr-only">Адрес сайта</span><input v-model="url" class="input mt-1" :class="ui.input" autofocus required :disabled="busy" placeholder="Введите адрес сайта..." /></label>
      <label class="block"><span class="sr-only">Заголовок</span><input v-model="title" class="input mt-1" :class="ui.input" placeholder="Введите название закладки" :disabled="busy" /></label>
      <label v-if="!bookmark" class="capture-option flex items-start gap-2 [&_input]:accent-[var(--ui-accent)] [&_input]:w-[22px] [&_input]:h-[22px] [&_input]:shrink-0"><input v-model="capture" type="checkbox" :disabled="busy" class="mt-1" />
        <span>Создать эскиз: сайт временно откроется в активной вкладке.</span>
      </label>
      <label v-if="bookmark">Категория<select v-model="parentId" :disabled="busy" class="ui-control w-full p-2 mb-3"><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.title }}</option></select></label>
      <p v-if="error" role="alert" class="text-red-800">{{ error }}</p>
      <p v-if="busy" role="status">Сохранение… Захват сайта может занять до 20 секунд.</p>
      <button class="button w-full" :class="ui.button" :disabled="busy"><span class="ui-action-label">{{ bookmark ? 'Сохранить' : 'Добавить' }}</span></button>
      <button v-if="!bookmark && error" type="button" class="button w-full" :class="ui.button" :disabled="busy"
        @click="emit('save', { url, title, capture: false })"><span class="ui-action-label">Сохранить без эскиза</span></button>
    </form>
  </ModalDialog>
</template>
