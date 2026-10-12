<script setup lang="ts">
import { ref, onMounted } from 'vue';
import ModalDialog from './ModalDialog.vue';
import { repository } from '../composables/useDial';
import type { FolderChoice } from '../types/models';
const props = defineProps<{ busy: boolean; error: string }>();
const emit = defineEmits<{ close: []; select: [id: string]; create: [parent: string] }>();
const choices = ref<FolderChoice[]>([]), selected = ref(''), parent = ref(''), failure = ref('');
onMounted(async () => {
  try {
    choices.value = await repository.choices();
    const account = choices.value.filter(choice => choice.standard && choice.syncing);
    const parents = account.length ? account : choices.value.filter(choice => choice.standard);
    if (parents.length === 1) parent.value = parents[0]!.id;
  } catch (error) { failure.value = String(error); }
});
</script>
<template>
  <ModalDialog title="Основная папка закладок" :busy="props.busy" @close="emit('close')">
    <p class="mb-3">Выберите существующую папку. Её содержимое станет Speed Dial; закладки не копируются и не удаляются.</p>
    <label class="block">Папка<select v-model="selected" class="w-full my-3 p-2 bg-white" :disabled="busy"><option value="">Выберите папку</option><option v-for="choice in choices.filter(row => !row.standard)" :key="choice.id" :value="choice.id">{{ choice.path }}</option></select></label>
    <button :disabled="busy || !selected" @click="emit('select', selected)">Использовать папку</button>
    <hr class="my-4" />
    <label class="block">Создать Speed Dial внутри<select v-model="parent" class="w-full my-3 p-2 bg-white" :disabled="busy"><option value="">Выберите расположение</option><option v-for="choice in choices" :key="choice.id" :value="choice.id">{{ choice.path }}</option></select></label>
    <button :disabled="busy || !parent" @click="emit('create', parent)">Создать Speed Dial</button>
    <p v-if="error || failure" role="alert" class="text-red-800 mt-3">{{ error || failure }}</p>
  </ModalDialog>
</template>
