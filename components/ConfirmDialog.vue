<script setup lang="ts">
import { useId } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { ui } from '../utils/ui';
const props=defineProps<{title:string;message:string;actionLabel:string;destructive:boolean;busy:boolean;error:string}>();
const emit=defineEmits<{close:[];confirm:[]}>();
const messageId=useId();
function escape(event:KeyboardEvent){
  if(event.isComposing)return;
  event.preventDefault();event.stopPropagation();
  if(!props.busy)emit('close');
}
</script>
<template>
  <ModalDialog class="confirmation-dialog" :title="title" :busy="busy" :aria-describedby="messageId" @keydown.esc="escape" @close="emit('close')">
    <div class="flex flex-col gap-4 text-base [overflow-wrap:anywhere]">
      <p :id="messageId">{{message}}</p>
      <p v-if="error" role="alert">{{error}}</p>
      <p v-if="busy" role="status">Выполнение…</p>
      <div class="grid grid-cols-2 gap-3">
        <button type="button" :class="[ui.button,{secondary:!destructive}]" autofocus :disabled="busy" @click="emit('close')"><span class="ui-action-label">Отмена</span></button>
        <button type="button" :class="[ui.button,{danger:destructive}]" :disabled="busy" @click="emit('confirm')"><span class="ui-action-label">{{actionLabel}}</span></button>
      </div>
    </div>
  </ModalDialog>
</template>
