<script setup lang="ts">
import { useUiI18n } from '../../../common/i18n';

import { watch, ref, onUnmounted, computed, nextTick, onMounted } from 'vue';
import { isMovieProvider } from '../entities/models';
import type { SearchProviderId, SearchSuggestion } from '../entities/models';
import { getSearchTranslates, searchUrl } from '../helpers/presentation';
import { useProviderSuggestions } from '../composables/useProviderSuggestions';
const { formatMessage, t: $t } = useUiI18n();

const { searchProviders } = getSearchTranslates($t);
const props = defineProps<{
  provider: SearchProviderId;
  modelValue: string;
  bookmarkSearch: boolean;
  movieSearch: boolean;
  disabled: boolean;
  saveProvider: (provider: SearchProviderId) => Promise<boolean>;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'submit-bookmarks': [] }>();
const provider = ref(props.provider),
  selected = ref(-1),
  focused = ref(false),
  pointerSelection = ref(false);
const query = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});
const local = computed(() => provider.value === 'bookmarks');
const sources = computed(() =>
  searchProviders.filter(
    (source) =>
      (source.id !== 'bookmarks' || props.bookmarkSearch) &&
      (!isMovieProvider(source.id) || props.movieSearch),
  ),
);
const suggestions = ref<HTMLUListElement>(),
  form = ref<HTMLFormElement>(),
  searchInput = ref<HTMLInputElement>();
function clearQuery() {
  query.value = '';
  selected.value = -1;
  searchInput.value?.focus();
}
const dropdownStyle = ref<Record<string, string>>({});
function placeDropdown() {
  const el = form.value;
  if (!focused.value || !el) return;
  const rect = el.getBoundingClientRect(),
    viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0,
    height = viewport?.height ?? window.innerHeight;
  const below = top + height - rect.bottom - 22,
    above = rect.top - top - 22;
  const upwards = below < Math.min(160, height * 0.45) && above > below;
  const scale = rect.height / el.offsetHeight || 1;
  dropdownStyle.value = {
    maxHeight: `${Math.max(0, Math.min(360 * scale, height * 0.45, upwards ? above : below)) / scale}px`,
    ...(upwards
      ? { top: 'auto', bottom: 'calc(100% + 6px)' }
      : { top: 'calc(100% + 6px)', bottom: 'auto' }),
  };
}
watch([focused, query], async () => {
  await nextTick();
  placeDropdown();
});
onMounted(() => {
  window.addEventListener('resize', placeDropdown);
  window.addEventListener('scroll', placeDropdown, true);
  window.visualViewport?.addEventListener('resize', placeDropdown);
  window.visualViewport?.addEventListener('scroll', placeDropdown);
});
onUnmounted(() => {
  window.removeEventListener('resize', placeDropdown);
  window.removeEventListener('scroll', placeDropdown, true);
  window.visualViewport?.removeEventListener('resize', placeDropdown);
  window.visualViewport?.removeEventListener('scroll', placeDropdown);
});
watch(selected, async (index) => {
  if (index < 0) return;
  await nextTick();
  const list = suggestions.value,
    item = list?.children[index] as HTMLElement | undefined;
  if (!list || !item) return;
  if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
  else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
    list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
});
const { items, error, loaded } = useProviderSuggestions(query, provider);
const inputLabel = computed(() => $t(`search.${provider.value}.label`));
const inputPlaceholder = computed(() => $t(`search.${provider.value}.placeholder`));
let saveGeneration = 0;
watch(
  [() => props.provider, () => props.bookmarkSearch, () => props.movieSearch],
  ([value, bookmarks, movies]) => {
    provider.value =
      (value === 'bookmarks' && !bookmarks) || (!movies && isMovieProvider(value))
        ? 'yandex'
        : value;
  },
);
watch(
  () => props.disabled,
  (value) => {
    if (value) {
      focused.value = false;
      selected.value = -1;
    }
  },
);
watch(
  [query, provider, items],
  () => {
    selected.value = -1;
  },
  { flush: 'sync' },
);
onUnmounted(() => {
  saveGeneration++;
});
async function changeProvider(event: Event) {
  await chooseProvider((event.target as HTMLSelectElement).value as SearchProviderId);
}
async function chooseProvider(next: SearchProviderId) {
  if (
    (next === 'bookmarks' && !props.bookmarkSearch) ||
    (isMovieProvider(next) && !props.movieSearch)
  )
    return;
  provider.value = next;
  const current = ++saveGeneration;
  const saved = await props.saveProvider(next);
  if (current === saveGeneration && !saved) {
    if (next === 'bookmarks' && props.provider !== 'bookmarks') query.value = '';
    provider.value = props.provider;
  }
}
async function focus() {
  await nextTick();
  searchInput.value?.focus();
}
async function openBookmarks() {
  if (!props.bookmarkSearch || props.disabled) return;
  await chooseProvider('bookmarks');
  await focus();
}
defineExpose({ focus, openBookmarks });
function submit(item?: SearchSuggestion) {
  if (props.disabled) return;
  if (local.value) {
    emit('submit-bookmarks');
    return;
  }
  const text = (item?.label ?? query.value).trim();
  if (text) window.location.assign(item?.targetUrl ?? searchUrl(provider.value, text));
}
function pointSuggestion(index: number) {
  pointerSelection.value = true;
  selected.value = index;
}
function leaveSuggestion(index: number) {
  if (pointerSelection.value && selected.value === index) selected.value = -1;
}
function key(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (local.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      clearQuery();
    } else if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      submit();
    }
    return;
  }
  if (event.key === 'Escape' && focused.value) {
    event.preventDefault();
    event.stopPropagation();
    focused.value = false;
    selected.value = -1;
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    submit(focused.value && selected.value >= 0 ? items.value[selected.value] : undefined);
    return;
  }
  if (items.value.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    focused.value = true;
    pointerSelection.value = false;
    selected.value =
      selected.value < 0
        ? event.key === 'ArrowDown'
          ? 0
          : items.value.length - 1
        : (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + items.value.length) %
          items.value.length;
  }
}
</script>
<template>
  <form
    ref="form"
    class="search flex relative mx-auto w-full items-center"
    @submit.prevent="submit()"
  >
    <span
      aria-hidden="true"
      class="search-surface surface-control absolute inset-0 pointer-events-none"
    />
    <div class="search-provider ui-select ui-select--embedded relative min-w-0 shrink-0">
      <select
        :aria-label="$t('search.provider.label')"
        :value="provider"
        :disabled="disabled"
        class="ui-control h-full w-full"
        @change="changeProvider"
      >
        <option v-for="source in sources" :key="source.id" :value="source.id">
          {{ source.label }}
        </option>
      </select>
    </div>
    <input
      ref="searchInput"
      v-model="query"
      :disabled="disabled"
      class="min-w-0 flex-1 h-full px-3"
      name="text"
      :placeholder="inputPlaceholder"
      :aria-label="inputLabel"
      autocomplete="off"
      :role="local ? 'searchbox' : 'combobox'"
      :aria-expanded="local ? undefined : focused && items.length > 0"
      :aria-controls="focused && items.length ? 'suggestions' : undefined"
      :aria-autocomplete="local ? undefined : 'list'"
      :aria-activedescendant="focused && selected >= 0 ? 'suggestion-' + selected : undefined"
      @input="focused = true"
      @focus="focused = true"
      @blur="focused = false"
      @keydown="key"
    />
    <button
      v-if="query"
      type="button"
      class="search-clear ui-hover shrink-0 inline-flex items-center justify-center"
      :aria-label="$t('search.query.clear')"
      :disabled="disabled"
      @click="clearQuery"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="m6 6 8 8m0-8-8 8" />
      </svg>
    </button>
    <button
      class="search-submit ui-button shrink-0"
      :aria-label="$t('search.submit')"
      :disabled="disabled || !query.trim()"
    >
      <span>{{ $t('search.submit') }}</span
      ><svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </svg>
    </button>
    <ul
      ref="suggestions"
      v-if="!local && focused && items.length"
      id="suggestions"
      :style="dropdownStyle"
      class="suggestions search-dropdown absolute text-base z-5 ui-glass overflow-y-auto"
      role="listbox"
      :aria-label="$t('search.suggestions.label')"
    >
      <li
        v-for="(item, index) in items"
        :id="'suggestion-' + index"
        :key="item.id"
        role="option"
        :aria-selected="index === selected"
        :title="[item.label, item.subtitle].filter(Boolean).join(' · ')"
        class="cursor-pointer"
        @pointermove="pointSuggestion(index)"
        @pointerleave="leaveSuggestion(index)"
        @mousedown.left.prevent="submit(item)"
      >
        <span class="block truncate">{{ item.label }}</span
        ><span v-if="item.subtitle" class="block truncate text-sm text-[var(--text-secondary)]">{{
          item.subtitle
        }}</span>
      </li>
    </ul>
    <span
      v-if="!local && focused && loaded && query.trim() && !items.length"
      role="status"
      :style="dropdownStyle"
      class="search-dropdown absolute z-5 ui-glass px-4 py-2 text-sm overflow-y-auto"
      >{{ formatMessage(error) || $t('search.suggestions.empty') }}</span
    >
  </form>
</template>
