<script setup lang="ts">
import { ref } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { ui } from '../utils/ui';
const props=defineProps<{title?:string;busy:boolean;error:string}>();
const emit=defineEmits<{close:[];save:[title:string]}>();
const name=ref(props.title??'');
function submit(){if(!props.busy&&name.value.trim())emit('save',name.value.trim());}
</script>
<template>
  <ModalDialog :title="title===undefined?'Новая категория':'Изменить категорию'" :busy="busy" @close="emit('close')">
    <form class="flex flex-col gap-4 text-base" @submit.prevent="submit">
      <div><label for="category-name" class="block mb-1">Название категории</label>
        <input id="category-name" v-model="name" :class="ui.input" class="h-10" autofocus maxlength="4096" :disabled="busy" :aria-describedby="error?'category-save-error':undefined" />
      </div>
      <p v-if="error" id="category-save-error" role="alert">{{error}}</p>
        <button type="submit" :class="ui.button" class="h-10" :disabled="busy||!name.trim()"><span class="ui-action-label">{{title===undefined?'Создать':'Сохранить'}}</span></button>
    </form>
  </ModalDialog>
</template>
