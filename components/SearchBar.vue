<script setup lang="ts">
import { watch, ref, onUnmounted, computed } from 'vue';
import type { SearchProviderId, SearchSuggestion } from '../types/models';
import { searchProviders, searchUrl } from '../services/searchProviders';
import { useProviderSuggestions } from '../composables/useProviderSuggestions';
const props=defineProps<{ provider: SearchProviderId; disabled: boolean; saveProvider: (provider:SearchProviderId)=>Promise<boolean> }>();
const provider=ref(props.provider), query=ref(''), selected=ref(-1), focused=ref(false);
const {items,error,loaded}=useProviderSuggestions(query,provider);
const theme=computed(()=>({
  yandex:{accent:'#FFCC00',ink:'#000000'}, google:{accent:'#4285F4',ink:'#FFFFFF'},
  kinopoisk:{accent:'#FF5500',ink:'#FFFFFF'}, imdb:{accent:'#F5C518',ink:'#000000'},
  myshows:{accent:'#CC0000',ink:'#FFFFFF'},
})[provider.value]);
const inputLabel=computed(()=>({
  yandex:'Поиск в Яндексе', google:'Поиск в Google', kinopoisk:'Поиск на Кинопоиске',
  imdb:'Поиск на IMDb', myshows:'Поиск на MyShows',
})[provider.value]);
let saveGeneration=0;
watch(()=>props.provider,value=>{provider.value=value;});
watch([query,provider,items],()=>{selected.value=-1;},{flush:'sync'});
onUnmounted(()=>{saveGeneration++;});
async function changeProvider(event:Event) {
  const next=(event.target as HTMLSelectElement).value as SearchProviderId;
  provider.value=next;
  const current=++saveGeneration;
  const saved=await props.saveProvider(next);
  if(current===saveGeneration&&!saved)provider.value=props.provider;
}
function submit(item?:SearchSuggestion) {
  const text=(item?.label??query.value).trim();
  if(text)window.location.assign(item?.targetUrl??searchUrl(provider.value,text));
}
function key(event:KeyboardEvent) {
  if(event.isComposing)return;
  if(event.key==='Escape'){focused.value=false;selected.value=-1;return;}
  if(event.key==='Enter'){event.preventDefault();submit(focused.value&&selected.value>=0?items.value[selected.value]:undefined);return;}
  if(items.value.length&&['ArrowDown','ArrowUp'].includes(event.key)){
    event.preventDefault();focused.value=true;
    selected.value=selected.value<0?(event.key==='ArrowDown'?0:items.value.length-1):(selected.value+(event.key==='ArrowDown'?1:-1)+items.value.length)%items.value.length;
  }
}
</script>
<template>
  <form class="search flex relative mx-auto mb-6 w-full max-w-[700px] h-10 items-center" :style="{'--search-accent':theme.accent,'--search-ink':theme.ink}" @submit.prevent="submit()">
    <div class="relative h-10 w-[120px] min-w-0 shrink-0">
    <select aria-label="Где искать" :value="provider" :disabled="disabled" class="h-10 w-full appearance-none rounded-l-[var(--ui-radius)] border-2 border-[var(--search-accent)] bg-white pl-2 pr-7 text-black text-sm" @change="changeProvider">
      <option v-for="source in searchProviders" :key="source.id" :value="source.id">{{ source.label }}</option>
    </select>
    <svg class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-[var(--ui-text)]" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4h8L6 8z" /></svg>
    </div>
    <input v-model="query" class="min-w-0 flex-1 h-10 leading-10 px-2 sm:px-4 py-0 border-2 border-l-0 border-[var(--search-accent)] rounded-none bg-white text-black" name="text" :placeholder="inputLabel+'…'"
      :aria-label="inputLabel" autocomplete="off" role="combobox" :aria-expanded="focused && items.length > 0"
      aria-controls="suggestions" :aria-activedescendant="focused && selected >= 0 ? 'suggestion-' + selected : undefined"
      @input="focused = true" @focus="focused = true" @blur="focused = false" @keydown="key" />
    <button class="button w-[64px] sm:w-[85px] h-10 p-0 border-0 shrink-0 rounded-l-none rounded-r-[var(--ui-radius)] bg-[var(--search-accent)] enabled:hover:brightness-95 transition-[filter] duration-250 text-[var(--search-ink)] disabled:[color:color-mix(in_srgb,var(--search-ink)_40%,transparent)]" :disabled="!query.trim()">Найти</button>
    <ul v-if="focused && items.length" id="suggestions" class="suggestions absolute w-full text-base top-[43px] z-5 ui-glass overflow-hidden text-black" role="listbox">
      <li v-for="(item,index) in items" :id="'suggestion-'+index" :key="item.id" role="option" :aria-selected="index===selected" :title="[item.label,item.subtitle].filter(Boolean).join(' · ')"
        class="px-4 py-2 min-h-[35px] cursor-pointer transition-colors duration-250 aria-selected:[background-color:color-mix(in_srgb,var(--search-accent)_35%,white)]"
        @mouseenter="selected=index" @mouseleave="selected=-1" @mousedown.prevent="submit(item)">
        <span class="block truncate">{{ item.label }}</span><span v-if="item.subtitle" class="block truncate text-sm text-[var(--ui-text)]">{{ item.subtitle }}</span>
      </li>
    </ul>
    <span v-if="focused && loaded && query.trim() && !items.length" role="status" class="absolute top-[43px] z-5 w-full ui-glass px-4 py-2 text-sm">{{ error || 'Нет подсказок' }}</span>
  </form>
</template>
