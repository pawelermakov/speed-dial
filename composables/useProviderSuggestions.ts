import { ref, shallowRef, watch, onUnmounted, type Ref } from 'vue';
import type { SearchProviderId, SearchSuggestion } from '../types/models';
import { providerSuggestions } from '../services/searchProviders';

export function useProviderSuggestions(query: Ref<string>, provider: Ref<SearchProviderId>) {
  const items=shallowRef<SearchSuggestion[]>([]), error=ref(''), loaded=ref(false);
  let timer:ReturnType<typeof setTimeout> | undefined, request:AbortController | undefined, generation=0;
  const stop=watch([query,provider],()=>{
    clearTimeout(timer);request?.abort();const current=++generation;
    items.value=[];error.value='';loaded.value=false;
    const text=query.value.trim(), source=provider.value;
    if (!text) return;
    timer=setTimeout(async()=>{
      const controller=new AbortController();request=controller;
      try {const next=await providerSuggestions(source,text,controller.signal);if(current===generation)items.value=next;}
      catch {if(current===generation&&!controller.signal.aborted)error.value='Подсказки временно недоступны';}
      finally {if(current===generation)loaded.value=true;}
    },250);
  },{flush:'sync'});
  onUnmounted(()=>{generation++;stop();clearTimeout(timer);request?.abort();});
  return {items,error,loaded};
}
