<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
defineProps<{ id: string; label: string; target?: string }>();
const root=ref<HTMLElement>(), open=ref(false), position=ref<Record<string,string>>({});
function show(){
  const rect=root.value?.getBoundingClientRect();
  if(!rect)return;
  const width=Math.min(260,window.innerWidth-32);
  position.value={left:`${Math.max(16,Math.min(rect.left+rect.width/2-width/2,window.innerWidth-width-16))}px`,width:`${width}px`,...(rect.bottom+120>window.innerHeight?{bottom:`${window.innerHeight-rect.top+8}px`}:{top:`${rect.bottom+8}px`})};
  open.value=true;
}
function close(){open.value=false;}
function scrolled(){if(root.value?.matches(':hover'))show();else close();}
function outside(event:PointerEvent){if(!root.value?.contains(event.target as Node))close();}
onMounted(()=>{document.addEventListener('pointerdown',outside);window.addEventListener('resize',close);document.addEventListener('scroll',scrolled,true);});
onUnmounted(()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',close);document.removeEventListener('scroll',scrolled,true);});
</script>
<template>
  <span ref="root" class="info-help inline-flex items-center justify-center shrink-0 align-middle leading-none font-normal" @pointerenter="show" @pointerleave="close" @focusout="close" @keydown.esc.stop.prevent="close">
    <button type="button" :aria-label="label" :aria-describedby="id" :aria-expanded="open" class="size-7 inline-flex items-center justify-center rounded-[var(--ui-radius)] ui-hover" @focus="show" @click="show">
      <svg class="block size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg>
    </button>
    <Teleport defer :to="target ?? '.page'">
    <span :id="id" role="tooltip" class="info-tooltip fixed p-3 text-sm leading-normal text-left ui-glass" :class="{'is-open':open}" :style="position"><slot/></span>
    </Teleport>
  </span>
</template>
<style scoped>
.info-tooltip {z-index:50;visibility:hidden;opacity:0;pointer-events:none;transition:opacity 250ms ease-in-out,visibility 250ms ease-in-out;}
.info-tooltip.is-open {visibility:visible;opacity:1;}
@media(prefers-reduced-motion:reduce){.info-tooltip{transition:none;}}
</style>
