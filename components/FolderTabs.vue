<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import type { Folder } from '../types/models';
import { contextKey, plainNavigation } from '../utils/keyboard';
import { insertedOrder } from '../utils/reorder';
const props=defineProps<{contextId?:string;revision:number;motionEnabled:boolean;folders:Folder[];activeId:string|null;disabled:boolean;hidden:boolean;creating:boolean;editing?:{id:string;title:string}}>();
const emit=defineEmits<{select:[id:string];context:[event:MouseEvent|KeyboardEvent,folder:Folder];reorder:[ids:string[],expected:string[],revision:number];refresh:[];background:[event:MouseEvent]}>();
const root=computed(()=>props.folders.find(row=>row.virtual));
const folders=computed(()=>props.folders.filter(row=>!row.virtual));
const list=ref<HTMLElement>();
const fadeStart=ref(false),fadeEnd=ref(false);
function updateEdges(){const el=list.value;if(!el)return;el.style.setProperty('--folder-scroll-offset',el.scrollLeft+'px');fadeStart.value=el.scrollLeft>1;fadeEnd.value=el.scrollLeft+el.clientWidth<el.scrollWidth-1;}
function measureEdges(){
  const el=list.value;if(!el)return;
  el.style.setProperty('--folder-viewport-width',el.clientWidth+'px');
  for(const child of el.children){const item=child as HTMLElement;item.style.setProperty('--folder-item-offset',item.offsetLeft+'px');}
  updateEdges();
}
watch(() => props.motionEnabled, enabled => { if (!enabled && list.value) list.value.scrollTo({left:list.value.scrollLeft,behavior:'instant'}); });
let edgeObserver:ResizeObserver|undefined;
onMounted(()=>{edgeObserver=new ResizeObserver(measureEdges);if(list.value)edgeObserver.observe(list.value);measureEdges();});
onUnmounted(()=>edgeObserver?.disconnect());
watch(()=>[props.folders.map(row=>row.id+row.title).join(),props.activeId],async()=>{await nextTick();measureEdges();});
const source=ref<string>(), target=ref<string>(), after=ref(false);
let expected:string[]=[], suppressed=false, dragRevision=0;
function clear(){source.value=undefined;target.value=undefined;}
function end(){const cancelled=!!source.value;clear();setTimeout(()=>suppressed=false,100);if(cancelled)emit('refresh');}

watch(()=>props.revision,()=>{if(source.value)end();});
watch(()=>JSON.stringify([props.folders.map(row=>[row.id,row.title,row.index]),props.activeId,props.hidden,props.editing?.id,props.creating]),()=>end());
watch(()=>props.activeId,async()=>{
  await nextTick();
  const container=list.value,selected=container?.querySelector<HTMLElement>('[aria-pressed="true"]');
  if(!container||!selected)return;
  container.scrollTo({left:selected.offsetLeft-(container.clientWidth-selected.offsetWidth)/2,behavior:props.motionEnabled?'smooth':'instant'});
});
function start(event:DragEvent,id:string){if(props.disabled||props.hidden||props.editing||props.creating){event.preventDefault();return;}source.value=id;dragRevision=props.revision;expected=folders.value.map(row=>row.id);suppressed=true;event.dataTransfer?.setData('application/x-speeddial-folder',id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}
function over(event:DragEvent,id:string){if(!source.value||source.value===id)return;event.preventDefault();target.value=id;const r=(event.currentTarget as HTMLElement).getBoundingClientRect();after.value=event.clientX>r.left+r.width/2;}
function drop(event:DragEvent,id:string){event.preventDefault();if(!source.value)return;const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();const next=insertedOrder(expected,source.value,id,event.clientX>rect.left+rect.width/2);clear();if(next&&!props.disabled&&dragRevision===props.revision)emit('reorder',next,expected,dragRevision);}
function click(event:MouseEvent,id:string){if(suppressed){event.preventDefault();suppressed=false;return;}emit('select',id);}
function dragEnd(){end();}
function key(event: KeyboardEvent, folder: Folder) {
  if (props.disabled) return;
  if (contextKey(event)) {
    event.preventDefault(); event.stopPropagation();
    if (folder.virtual) { const r=(event.currentTarget as HTMLElement).getBoundingClientRect(); emit('background',new MouseEvent('contextmenu',{clientX:r.left,clientY:r.bottom})); }
    else emit('context', event, folder);
    return;
  }
  if (!plainNavigation(event) || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = Array.from(list.value?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowRight'?1:-1)));
  buttons[next]?.focus();
}

</script>
<template>
<nav @contextmenu.stop.prevent="emit('background',$event)" @dragover.prevent @drop.prevent.stop aria-label="Папки" class="folder-tabs flex items-center gap-2 min-w-0 w-full" :class="{'is-hidden':hidden}" :inert="hidden" :aria-hidden="hidden||undefined">
  <div ref="list" @scroll.passive="updateEdges" :class="{'fade-start':fadeStart,'fade-end':fadeEnd}" class="folder-scroll relative flex items-center gap-2 min-w-0 w-full overflow-x-scroll">
  <button v-if="root" @keydown="key($event, root)" :data-folder-id="root.id" aria-haspopup="menu" :aria-expanded="contextId === root.id" :aria-controls="contextId === root.id ? 'bookmark-context-menu' : undefined" class="ui-folder folder-root flex items-center gap-1.5 min-w-0 shrink-0 h-12 px-3" :aria-pressed="activeId===root.id" :title="root.title" :aria-label="root.title" :disabled="disabled" @click="emit('select',root.id)">
    <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 10V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1M3 10h18l-2 10H5L3 10Z"/></svg><span class="ui-action-label truncate">{{root.title}}</span>
  </button>
    <template v-for="folder in folders" :key="folder.id">
      <button class="ui-folder folder-tab relative inline-flex items-center justify-center shrink-0 h-12 px-3 max-w-[min(13rem,100%)]" :class="{dragging:source===folder.id,'drop-target':target===folder.id,'insert-before':target===folder.id&&!after,'insert-after':target===folder.id&&after}" :title="folder.title" :aria-pressed="activeId===folder.id" :disabled="disabled" :draggable="!disabled&&!creating&&!editing" aria-haspopup="menu" @click="click($event,folder.id)" @contextmenu.stop.prevent="emit('context',$event,folder)" @keydown="key($event, folder)" :data-folder-id="folder.id" :aria-expanded="contextId === folder.id" :aria-controls="contextId === folder.id ? 'bookmark-context-menu' : undefined" @dragstart="start($event,folder.id)" @dragover="over($event,folder.id)" @drop.stop="drop($event,folder.id)" @dragend="dragEnd"><span class="ui-action-label block truncate">{{folder.title}}</span></button>
    </template>
  </div>
</nav>
</template>
<style scoped>
.folder-tabs{opacity:1;visibility:visible;transition:opacity var(--motion-fast) var(--ease-state) var(--motion-fast),visibility 0s var(--motion-fast);}
.folder-tabs.is-hidden{opacity:0;visibility:hidden;pointer-events:none;transition-delay:0ms,var(--motion-fast);}
@media(prefers-reduced-motion:reduce){.folder-tabs{transition:none;}}
.folder-root{max-width:min(13rem,70%);}
.folder-scroll{scrollbar-width:thin;transition:--folder-edge-start var(--motion-fast) var(--ease-state),--folder-edge-end var(--motion-fast) var(--ease-state);--folder-edge-start:0px;--folder-edge-end:0px;}
.folder-scroll>.ui-folder{mask-image:linear-gradient(to right,transparent,#000 var(--folder-edge-start),#000 calc(100% - var(--folder-edge-end)),transparent);mask-size:var(--folder-viewport-width,100%) 100%;mask-position:calc(var(--folder-scroll-offset,0px) - var(--folder-item-offset,0px)) 0;mask-repeat:no-repeat;}
.folder-scroll:not(.fade-start):not(.fade-end){scrollbar-color:transparent transparent;}
.folder-scroll.fade-start{--folder-edge-start:24px;}
.folder-scroll.fade-end{--folder-edge-end:24px;}
@media(forced-colors:active){.folder-scroll>.ui-folder{mask-image:none;}}
.folder-tab{outline:3px solid transparent;outline-offset:-3px;}
.folder-tab.dragging{opacity:.4;}
.folder-tab.drop-target{outline-color:var(--ui-accent);}
@media(prefers-reduced-motion:reduce){.folder-tab{transition:none;}}
.insert-before{box-shadow:inset 3px 0 var(--ui-accent);}
.insert-after{box-shadow:inset -3px 0 var(--ui-accent);}
</style>
