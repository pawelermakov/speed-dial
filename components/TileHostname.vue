<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { fitTileFont } from '../utils/tile';
const props = defineProps<{ hostname: string }>();
const box = ref<HTMLElement>();
const size = ref(12);
let observer: ResizeObserver | undefined;
let frame = 0;
let disposed = false;
let canvas: HTMLCanvasElement;
function measure() {
  const element = box.value;
  const context = canvas?.getContext('2d');
  if (!element || !context || !element.clientWidth || !element.clientHeight) return;
  const style = getComputedStyle(element);
  const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  size.value = fitTileFont(Math.max(0, width), element.clientHeight, value => {
    context.font = `500 ${value}px ${style.fontFamily}`;
    return context.measureText(props.hostname).width;
  });
}
function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
}
onMounted(() => {
  canvas = document.createElement('canvas');
  observer = new ResizeObserver(schedule);
  observer.observe(box.value!);
  schedule();
  void document.fonts.ready.then(() => { if (!disposed) schedule(); });
  document.fonts.addEventListener('loadingdone', schedule);
});
watch(() => props.hostname, schedule);
onUnmounted(() => {
  disposed = true;
  observer?.disconnect();
  cancelAnimationFrame(frame);
  document.fonts.removeEventListener('loadingdone', schedule);
});
</script>
<template>
  <span ref="box" class="tile-hostname absolute inset-0 flex items-center justify-center overflow-hidden" style="padding-inline: clamp(8px, 12%, 40px); font-family: var(--ui-font)" aria-hidden="true">
    <span class="block min-w-0 truncate font-medium leading-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.28)]" :style="{ fontSize: size + 'px' }">{{ hostname }}</span>
  </span>
</template>
