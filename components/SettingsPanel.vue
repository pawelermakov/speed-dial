<script setup lang="ts">
import { ui } from '../utils/ui';
import { reactive, ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { browser } from 'wxt/browser';
import { repository } from '../composables/useDial';
import type { Settings, FolderChoice } from '../types/models';
import { validateSettings } from '../services/validation';
import { readImage } from '../services/images';
import SyncStatus from './SyncStatus.vue';
const props=defineProps<{settings:Settings;busy:boolean;rootId:string|null;operationError:string;hasBackground:boolean;
  updateSettings:(patch:Partial<Settings>)=>Promise<boolean>;changeRoot:(id:string)=>Promise<boolean>;changeBackground:(blob:Blob|null)=>Promise<boolean>}>();
const emit=defineEmits<{close:[];import:[];export:[];reset:[];error:[message:string]}>();
const numberFields=[{key:'width',label:'Ширина (%)',min:50,max:100},{key:'countColumns',label:'Количество столбцов',min:2,max:12},{key:'space',label:'Расстояние (px)',min:0,max:48}] as const;
type BufferedKey='width'|'countColumns'|'space'|'email';
const values=reactive({width:String(props.settings.width),countColumns:String(props.settings.countColumns),space:String(props.settings.space),email:props.settings.email});
const inputErrors=reactive<Partial<Record<BufferedKey,string>>>({});
const pending=new Map<BufferedKey,string|number>(),timers=new Map<BufferedKey,ReturnType<typeof setTimeout>>();
const focused=ref<BufferedKey>();
const writes=new Set<Promise<unknown>>();
const error=ref(''),reading=ref(false);
let disposed=false,folderGeneration=0,folderRequest=0,fileGeneration=0,folderTimer:ReturnType<typeof setTimeout>|undefined,backgroundTask:Promise<unknown>|undefined;
function track<T>(promise:Promise<T>){writes.add(promise);void promise.finally(()=>writes.delete(promise)).catch(()=>{});return promise;}
watch(()=>props.settings,settings=>{for(const key of Object.keys(values) as BufferedKey[])if(focused.value!==key&&!pending.has(key))values[key]=String(settings[key]);});
function input(key:BufferedKey,event:Event){
  const element=event.target as HTMLInputElement;values[key]=element.value;
  try{
    if((key!=='email'&&!element.value.trim())||!element.validity.valid)throw new Error('Введите допустимое значение.');
    const next=validateSettings({...props.settings,[key]:element.value});
    pending.set(key,next[key]);delete inputErrors[key];clearTimeout(timers.get(key));
    timers.set(key,setTimeout(()=>{void flushField(key);},275));
  }catch{inputErrors[key]=key==='email'?'Введите корректный E-mail или очистите поле.':'Введите целое число в указанном диапазоне.';}
}
async function flushField(key:BufferedKey){
  clearTimeout(timers.get(key));timers.delete(key);
  if(!pending.has(key))return;
  const value=pending.get(key)!;pending.delete(key);
  const saved=await track(props.updateSettings({[key]:value}));
  if(!saved && values[key]===String(value) && !pending.has(key)){await nextTick();values[key]=String(props.settings[key]);}
}
async function flush(){await Promise.all([...pending.keys()].map(flushField));if(backgroundTask)await backgroundTask;while(writes.size)await Promise.allSettled([...writes]);}
async function close(){await flush();emit('close');}
async function action(name:'import'|'export'|'reset'){await flush();if(name==='import')emit('import');else if(name==='export')emit('export');else emit('reset');}
defineExpose({flush});
const folders=ref<FolderChoice[]>([]),folderLoading=ref(true),folderError=ref(''),selectedFolder=ref(props.rootId??'');
const selectedChoice=computed(()=>folders.value.find(row=>row.id===selectedFolder.value));
watch(()=>props.rootId,id=>{if(!folderRequest)selectedFolder.value=id??'';});
async function loadFolders(){const current=++folderGeneration;folderLoading.value=true;
  try{const next=await repository.choices();if(!disposed&&current===folderGeneration){folders.value=next;folderError.value='';}}
  catch(cause){if(!disposed&&current===folderGeneration)folderError.value='Не удалось загрузить папки. '+String(cause);}
  finally{if(!disposed&&current===folderGeneration)folderLoading.value=false;}}
function scheduleFolders(){folderGeneration++;clearTimeout(folderTimer);folderTimer=setTimeout(()=>{void loadFolders();},60);}
async function folderChanged(event:Event){const id=(event.target as HTMLSelectElement).value;selectedFolder.value=id;folderRequest++;
  try{await track(props.changeRoot(id));}finally{folderRequest--;if(!folderRequest)selectedFolder.value=props.rootId??'';}}
const api=browser.bookmarks;
const events=[api?.onCreated,api?.onRemoved,api?.onChanged,api?.onMoved,api?.onChildrenReordered,api?.onImportEnded];
onMounted(()=>{events.forEach(event=>event?.addListener(scheduleFolders));void loadFolders();});
onUnmounted(()=>{disposed=true;folderGeneration++;fileGeneration++;clearTimeout(folderTimer);events.forEach(event=>event?.removeListener(scheduleFolders));void flush();});
function file(event:Event){const element=event.target as HTMLInputElement,selected=element.files?.[0];if(!selected)return;const current=++fileGeneration;reading.value=true;error.value='';
  backgroundTask=(async()=>{try{const blob=await readImage(selected);if(current===fileGeneration)await track(props.changeBackground(blob));}
    catch(cause){if(current===fileGeneration){error.value='Фон: '+(cause instanceof Error?cause.message:String(cause));emit('error',error.value);}}
    finally{if(current===fileGeneration){reading.value=false;element.value='';}}})();}
const checkClass="peer absolute right-0 w-6 h-6 opacity-0 z-1 cursor-pointer";
const markClass="checkmark block size-6 border border-[#ced4da] rounded-[5px] bg-white shrink-0 relative peer-checked:bg-[#ffcc00] peer-checked:border-[#ffcc00] after:content-[''] after:absolute after:top-0 after:left-[6px] after:w-[6px] after:h-[14px] after:border-white after:border-solid after:border-r-[3px] after:border-b-[3px] after:rotate-45 after:opacity-0 peer-checked:after:opacity-100 peer-focus-visible:outline-1 peer-focus-visible:outline-[#54565a] peer-focus-visible:outline-offset-2";
const checkboxFields=[{key:'addButton',label:'Показать кнопку «+»'},{key:'bookmarkSearch',label:'Показывать поиск по закладкам'}] as const;
</script>
<template>
  <div class="fixed inset-0 z-20" @click.self="close">
    <aside class="settings fixed top-0 right-0 h-full w-[min(300px,100vw)] p-[15px] bg-white/80 backdrop-blur-[10px] shadow-[0_1px_3px_rgb(50_50_50/0.3)] overflow-y-auto flex flex-col animate-slide motion-reduce:animate-none" aria-label="Настройки">
      <header class="settings-header relative shrink-0 border-b border-black/20 mb-4 pb-4 pr-8"><h2 class="text-base font-bold">Настройки</h2><button type="button" class="absolute right-0 top-0 size-7 text-xl" aria-label="Закрыть настройки" @click="close">×</button></header>
      <SyncStatus />
      <form class="settings-form flex flex-col flex-1 min-w-0 text-sm" @submit.prevent>
        <fieldset class="mb-5 min-w-0"><legend class="font-bold mb-2">Закладки</legend>
          <label for="bookmark-folder" class="block mb-2">Папка закладок</label>
          <select id="bookmark-folder" :value="selectedFolder" :title="selectedChoice?.path" class="w-full min-w-0 max-w-full rounded-[5px] border border-[#ced4da] bg-white p-2 text-sm truncate mb-3" :disabled="busy||folderLoading||!!folderError" @change="folderChanged">
            <option v-if="selectedFolder&&!selectedChoice" :value="selectedFolder" disabled>{{folderLoading?'Загрузка папок…':'Выбранная папка недоступна'}}</option>
            <option v-for="choice in folders" :key="choice.id" :value="choice.id" :title="choice.path">{{choice.path}}</option>
          </select>
          <p v-if="folderLoading" role="status">Загрузка папок…</p><p v-if="folderError" role="alert" class="text-red-800">{{folderError}} <button type="button" @click="loadFolders">Повторить</button></p>
          <label v-for="field in checkboxFields" :key="field.key" class="settings-row relative flex justify-between items-center gap-2 mb-3 cursor-pointer"><span class="pr-2">{{field.label}}</span><input :aria-label="field.label" :checked="settings[field.key]" :class="checkClass" type="checkbox" :disabled="busy" @change="updateSettings({[field.key]:($event.target as HTMLInputElement).checked})"/><span :class="markClass" aria-hidden="true"/></label>
        </fieldset>
        <fieldset class="mb-5 min-w-0"><legend class="font-bold mb-2">Сетка</legend>
          <div v-for="field in numberFields" :key="field.key" class="mb-3"><label class="settings-row flex justify-between items-center gap-2">{{field.label}}:<input :aria-label="field.label" :value="values[field.key]" class="input !w-16 !m-0" :class="ui.input" type="number" :min="field.min" :max="field.max" :disabled="busy" :aria-invalid="!!inputErrors[field.key]" @focus="focused=field.key" @input="input(field.key,$event)" @change="flushField(field.key)" @blur="focused=undefined;flushField(field.key)"/></label><p v-if="inputErrors[field.key]" class="mt-1 text-red-800">{{inputErrors[field.key]}}</p></div>
          <label class="settings-row relative flex justify-between items-center gap-2 cursor-pointer"><span>Центрировать по вертикали</span><input aria-label="Центрировать по вертикали" :checked="settings.verticalCenter" :class="checkClass" type="checkbox" :disabled="busy" @change="updateSettings({verticalCenter:($event.target as HTMLInputElement).checked})"/><span :class="markClass" aria-hidden="true"/></label>
        </fieldset>
        <fieldset class="mb-5 min-w-0"><legend class="font-bold mb-2">Фон</legend>
          <div class="flex justify-between items-center gap-2"><input aria-label="Изменить фон" id="background" :class="ui.fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" :disabled="busy||reading" @change="file"/><label :class="ui.fileButton" for="background">Выберите файл</label></div>
          <p v-if="reading" role="status" class="mt-2">Обработка изображения…</p>
          <button v-if="hasBackground" type="button" class="mt-2 underline" :disabled="busy||reading" @click="track(changeBackground(null))">Удалить фон</button>
        </fieldset>
        <fieldset class="mb-5 min-w-0"><legend class="font-bold mb-2">Почта</legend>
          <label class="settings-email block">E-mail Mail.ru:<input aria-label="E-mail Mail.ru" :value="values.email" class="input mt-2" :class="ui.input" type="email" :disabled="busy" :aria-invalid="!!inputErrors.email" @focus="focused='email'" @input="input('email',$event)" @change="flushField('email')" @blur="focused=undefined;flushField('email')"/></label><p v-if="inputErrors.email" class="mt-1 text-red-800">{{inputErrors.email}}</p>
        </fieldset>
        <p v-if="error||operationError" role="alert" class="mb-3 text-red-800 break-words">{{error||operationError}}</p>
        <fieldset class="settings-bottom mt-auto min-w-0"><legend class="font-bold mb-2">Данные</legend><div class="flex gap-4 mb-3"><button type="button" class="button !w-[calc(50%-8px)]" :class="ui.button" :disabled="busy||reading||!rootId" @click="action('import')">Импорт</button><button type="button" class="button !w-[calc(50%-8px)]" :class="ui.button" :disabled="busy||reading||!rootId" @click="action('export')">Экспорт</button></div>
          <button type="button" class="button danger !bg-[#dc3545] !border-[#dc3545] !text-white enabled:hover:!bg-[#bb2d3b]" :class="ui.button" :disabled="busy||reading" @click="action('reset')">Сбросить настройки и кэш</button>
        </fieldset>
      </form>
    </aside>
  </div>
</template>
