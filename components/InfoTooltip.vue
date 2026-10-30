<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
defineProps<{ id: string; label: string; target?: string }>();
const root = ref<HTMLElement>(),
  tooltip = ref<HTMLElement>(),
  open = ref(false),
  position = ref<Record<string, string>>({});
let placementGeneration = 0,
  closeTimer: ReturnType<typeof setTimeout> | undefined;
function keepOpen() {
  clearTimeout(closeTimer);
}
function scheduleClose() {
  keepOpen();
  closeTimer = setTimeout(close, 150);
}
async function show() {
  keepOpen();
  const rect = root.value?.getBoundingClientRect();
  if (!rect) return;
  const generation = ++placementGeneration,
    viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0,
    viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth,
    viewportHeight = viewport?.height ?? window.innerHeight;
  const width = Math.min(260, Math.max(0, viewportWidth - 32));
  const left = Math.max(
    viewportLeft + 16,
    Math.min(rect.left + rect.width / 2 - width / 2, viewportLeft + viewportWidth - width - 16),
  );
  position.value = {
    left: `${left}px`,
    width: `${width}px`,
    top: `${viewportTop + 16}px`,
    maxHeight: `${Math.max(0, viewportHeight - 32)}px`,
  };
  open.value = true;
  await nextTick();
  if (!open.value || generation !== placementGeneration || !tooltip.value) return;
  const height = tooltip.value.getBoundingClientRect().height;
  const below = Math.max(0, viewportTop + viewportHeight - 16 - rect.bottom - 8),
    above = Math.max(0, rect.top - 8 - viewportTop - 16);
  const upwards = below < height && above > below,
    available = upwards ? above : below;
  // In very short windows, allow overlap with the trigger rather than clip the text.
  if (available < 48) return;
  position.value = {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${available}px`,
    top: `${upwards ? rect.top - 8 - Math.min(height, available) : rect.bottom + 8}px`,
  };
}
function close() {
  keepOpen();
  placementGeneration++;
  open.value = false;
}
function scrolled(event: Event) {
  if (event.target === tooltip.value) return;
  if (
    root.value?.matches(':hover') ||
    tooltip.value?.matches(':hover') ||
    root.value?.contains(document.activeElement)
  )
    void show();
  else close();
}
function escape(event: KeyboardEvent) {
  if (!open.value) return;
  event.preventDefault();
  event.stopPropagation();
  close();
}
function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node) && !tooltip.value?.contains(event.target as Node))
    close();
}
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  window.addEventListener('resize', close);
  document.addEventListener('scroll', scrolled, true);
});
onUnmounted(() => {
  keepOpen();
  document.removeEventListener('pointerdown', outside);
  window.removeEventListener('resize', close);
  document.removeEventListener('scroll', scrolled, true);
});
</script>
<template>
  <span
    ref="root"
    class="info-help inline-flex items-center justify-center shrink-0 align-middle leading-none font-normal"
    @pointerenter="show"
    @pointerleave="scheduleClose"
    @focusout="close"
    @keydown.esc="escape"
  >
    <button
      type="button"
      :aria-label="label"
      :aria-describedby="id"
      :aria-expanded="open"
      class="size-9 inline-flex items-center justify-center rounded-[var(--ui-radius)] ui-hover"
      @focus="show"
      @click="show"
    >
      <svg
        class="block size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10h.01" />
      </svg>
    </button>
    <Teleport defer :to="target ?? '.page'">
      <span
        ref="tooltip"
        @pointerenter="keepOpen"
        @pointerleave="scheduleClose"
        :id="id"
        role="tooltip"
        class="info-tooltip fixed p-3 text-sm leading-normal text-left ui-glass"
        :class="{ 'is-open': open }"
        :style="position"
        ><slot
      /></span>
    </Teleport>
  </span>
</template>
<style scoped>
.info-tooltip {
  z-index: 50;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--motion-standard) var(--ease-state),
    visibility var(--motion-standard) var(--ease-state);
}
.info-tooltip.is-open {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
}
@media (prefers-reduced-motion: reduce) {
  .info-tooltip {
    transition: none;
  }
}
</style>
