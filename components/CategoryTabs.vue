<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import type { Category } from '../types/models';
import { insertedOrder } from '../utils/reorder';
const props=defineProps<{revision:number;categories:Category[];activeId:string|null;disabled:boolean;hidden:boolean;creating:boolean;editing?:{id:string;title:string}}>();
const emit=defineEmits<{select:[id:string];context:[event:MouseEvent|KeyboardEvent,category:Category];reorder:[ids:string[],expected:string[],revision:number];refresh:[];background:[event:MouseEvent]}>();
const root=computed(()=>props.categories.find(row=>row.virtual));
const folders=computed(()=>props.categories.filter(row=>!row.virtual));
const list=ref<HTMLElement>();
const source=ref<string>(), target=ref<string>(), after=ref(false);
let expected:string[]=[], suppressed=false, dragRevision=0;
function clear(){source.value=undefined;target.value=undefined;}
function end(){const cancelled=!!source.value;clear();setTimeout(()=>suppressed=false,100);if(cancelled)emit('refresh');}
watch(()=>props.categories,()=>end());
watch(()=>props.revision,()=>{if(source.value)end();});
watch(()=>[props.categories.map(row=>[row.id,row.title,row.index]).join(),props.activeId,props.hidden,props.editing?.id,props.creating],()=>end());
watch(()=>props.activeId,async()=>{await nextTick();const selected=list.value?.querySelector('[aria-pressed="true"]');if(selected){const el=selected as HTMLElement;list.value!.scrollLeft+=el.offsetLeft-list.value!.offsetLeft-(list.value!.clientWidth-el.clientWidth)/2;}});
function start(event:DragEvent,id:string){if(props.disabled||props.hidden||props.editing||props.creating){event.preventDefault();return;}source.value=id;dragRevision=props.revision;expected=folders.value.map(row=>row.id);suppressed=true;event.dataTransfer?.setData('application/x-speeddial-category',id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}
function over(event:DragEvent,id:string){if(!source.value||source.value===id)return;event.preventDefault();target.value=id;const r=(event.currentTarget as HTMLElement).getBoundingClientRect();after.value=event.clientX>r.left+r.width/2;}
function drop(event:DragEvent,id:string){event.preventDefault();if(!source.value)return;const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();const next=insertedOrder(expected,source.value,id,event.clientX>rect.left+rect.width/2);clear();if(next&&!props.disabled&&dragRevision===props.revision)emit('reorder',next,expected,dragRevision);}
function click(event:MouseEvent,id:string){if(suppressed){event.preventDefault();suppressed=false;return;}emit('select',id);}
function dragEnd(){end();}
</script>
<template>
<nav @contextmenu.stop.prevent="emit('background',$event)" @dragover.prevent @drop.prevent.stop aria-label="Категории" class="category-tabs flex items-center gap-2 min-w-0 w-full" :class="{'is-hidden':hidden}" :inert="hidden" :aria-hidden="hidden||undefined">
  <div ref="list" class="category-scroll relative flex items-center gap-2 min-w-0 w-full overflow-x-auto">
  <button v-if="root" class="ui-category category-root flex items-center gap-1.5 min-w-0 shrink-0 h-11 px-2" :aria-pressed="activeId===root.id" :title="root.title" :aria-label="root.title" :disabled="disabled" @click="emit('select',root.id)">
    <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 10V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1M3 10h18l-2 10H5L3 10Z"/></svg><span class="ui-action-label truncate">{{root.title}}</span>
  </button>
    <template v-for="category in folders" :key="category.id">
      <button class="ui-category category-tab relative inline-flex items-center justify-center shrink-0 h-11 px-2 max-w-[min(13rem,100%)]" :class="{dragging:source===category.id,'drop-target':target===category.id,'insert-before':target===category.id&&!after,'insert-after':target===category.id&&after}" :title="category.title" :aria-pressed="activeId===category.id" :disabled="disabled" :draggable="!disabled&&!creating&&!editing" aria-haspopup="menu" @click="click($event,category.id)" @contextmenu.stop.prevent="emit('context',$event,category)" @keydown.shift.f10.stop.prevent="emit('context',$event,category)" @dragstart="start($event,category.id)" @dragover="over($event,category.id)" @drop.stop="drop($event,category.id)" @dragend="dragEnd"><span class="ui-action-label block truncate">{{category.title}}</span></button>
    </template>
  </div>
</nav>
</template>
<style scoped>
.category-tabs{opacity:1;transition:opacity 80ms ease-out 170ms;}
.category-tabs.is-hidden{opacity:0;pointer-events:none;transition-delay:0ms;}
@media(prefers-reduced-motion:reduce){.category-tabs{transition:none;}}
.category-root{max-width:min(13rem,70%);}
.category-scroll{scrollbar-width:thin;}
.category-tab{outline:3px solid transparent;outline-offset:-3px;transition:background-color 250ms ease-in-out,outline-color 250ms ease-in-out,opacity 250ms ease-in-out;}
.category-tab.dragging{opacity:.4;}
.category-tab.drop-target{outline-color:var(--ui-accent);}
@media(prefers-reduced-motion:reduce){.category-tab{transition:none;}}
.insert-before{box-shadow:inset 3px 0 var(--ui-accent);}
.insert-after{box-shadow:inset -3px 0 var(--ui-accent);}
</style>
