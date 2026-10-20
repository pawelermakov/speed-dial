<script setup lang="ts">
import { ui } from '../utils/ui';
import { computed, ref } from 'vue';
import { normalizeBookmarkUrl } from '../services/validation';
import type { Bookmark, Category } from '../types/models';
import ModalDialog from './ModalDialog.vue';
import InfoTooltip from './InfoTooltip.vue';
const props = defineProps<{ bookmark?: Bookmark; categories: Category[]; activeId?: string | null; busy: boolean; error: string; categoryError: string }>();
const emit = defineEmits<{ close: []; save: [value: { url: string; title: string; capture: boolean; parentId?: string; titleEdited: boolean }] }>();
const url = ref(props.bookmark?.url ?? '');
const title = ref(props.bookmark?.title ?? '');
const titleEdited = ref(false);
const capture = ref(true);
const parentId = ref(props.bookmark?.parentId ?? (props.categories.some(row => row.id === props.activeId) ? props.activeId! : props.categories[0]?.id));
const validUrl = computed(() => {
  try { normalizeBookmarkUrl(url.value); return true; }
  catch { return false; }
});
function submit() {
  if (props.busy || !validUrl.value) return;
  emit('save', { url: url.value, title: title.value, capture: capture.value, parentId: parentId.value, titleEdited: titleEdited.value });
}
</script>
<template>
  <ModalDialog id="bookmark-modal" :title="bookmark ? 'Изменить закладку' : 'Добавить закладку'" bookmark :busy="busy" @close="emit('close')">
    <form class="bookmark-form flex flex-col gap-4 min-w-0 text-base" novalidate @submit.prevent="submit">
      <div><label for="bookmark-url" class="block mb-1">Адрес сайта</label>
        <input id="bookmark-url" v-model="url" :class="ui.input" autofocus required :disabled="busy" />
      </div>
      <div><label for="bookmark-title" class="block mb-1">Название</label>
        <input id="bookmark-title" v-model="title" :class="ui.input" :disabled="busy" @input="titleEdited = true" />
      </div>
      <div><label for="bookmark-category" class="block mb-1">Категория</label>
        <select id="bookmark-category" v-model="parentId" :disabled="busy" :class="ui.input" :aria-invalid="!!categoryError" :aria-describedby="categoryError ? 'bookmark-category-error' : undefined"><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.title }}</option></select>
        <p v-if="categoryError" id="bookmark-category-error" role="alert" class="mt-1">{{ categoryError }}</p>
      </div>
      <div v-if="!bookmark" class="flex items-center gap-1">
        <label class="capture-option relative flex items-center gap-2 cursor-pointer">
          <input v-model="capture" type="checkbox" :disabled="busy" class="peer absolute left-0 size-6 opacity-0 z-1 cursor-pointer" />
          <span aria-hidden="true" class="checkmark block size-6 shrink-0 relative after:content-[''] after:absolute after:top-1/2 after:left-1/2 after:w-[6px] after:h-[12px] after:-translate-x-1/2 after:-translate-y-1/2 after:border-solid after:border-r-[3px] after:border-b-[3px] after:rotate-45 after:opacity-0 peer-checked:after:opacity-100 after:transition-opacity after:duration-250 motion-reduce:after:transition-none" />
          <span>Создать эскиз сайта</span>
        </label>
        <InfoTooltip id="bookmark-capture-info" label="О создании эскиза" target="#bookmark-modal">Сайт временно откроется для снимка и определения названия, если оно не указано</InfoTooltip>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="busy" role="status">Сохранение…</p>
      <button type="submit" class="button disabled:opacity-50" :class="ui.button" :disabled="busy || !validUrl"><span class="ui-action-label">{{ bookmark ? 'Сохранить' : 'Добавить' }}</span></button>
    </form>
  </ModalDialog>
</template>
<style scoped>
[aria-invalid="true"] { border-color: #8a2020; }
.capture-option:hover .checkmark { box-shadow: 0 0 0 3px rgb(var(--ui-accent-rgb) / .18); }
.button:disabled { opacity: .5; }
.bookmark-form :is(.ui-control, .ui-button) { height: 40px; box-sizing: border-box; line-height: 20px; }
</style>
