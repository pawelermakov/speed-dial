<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue';
import ModalDialog from './ModalDialog.vue';
import SelectChevron from './SelectChevron.vue';
import { folderOptionLabels } from '../services/bookmarks';
import { ui } from '../utils/ui';
import { backupLimits, downloadExport, parseImport, validateImportImages } from '../services/importExport';
import { allBackupSections, type BackupSelection } from '../types/models';
import type { FolderChoice, ImportData, ImportReport, PreparedExport, Settings } from '../types/models';
const props=defineProps<{rootId:string|null;settings:Settings;choices:()=>Promise<FolderChoice[]>;prepareExport:()=>Promise<PreparedExport>;exportData:(selection:BackupSelection,prepared:PreparedExport)=>Promise<{text:string;warnings:string[]}>;importData:(data:ImportData,id:string,expected:Settings,selection:BackupSelection)=>Promise<ImportReport>;resetData:()=>Promise<void>}>();
const emit=defineEmits<{close:[]}>();
const stage=ref<'home'|'export'|'import'|'reset'|'result'>('home'),busy=ref(false),status=ref(''),error=ref(''),folderError=ref('');
const result=shallowRef<{title:string;warning:boolean;summary?:string;stats?:Pick<ImportReport,'bookmarks'|'folders'|'images'>}>();
const resultStats=computed(()=>[
 {label:'Закладки',value:result.value?.stats?.bookmarks??0},
 {label:'Папки',value:result.value?.stats?.folders??0},
 {label:'Изображения',value:result.value?.stats?.images??0},
].filter(row=>row.value>0));
const done=ref<HTMLButtonElement>();
const fileInput=ref<HTMLInputElement>(),heading=ref<HTMLElement>(),homeAction=ref<HTMLButtonElement>();
const folders=ref<FolderChoice[]>([]),destination=ref(props.rootId??'');
const prepared=shallowRef<PreparedExport>();
const transferData=computed(()=>stage.value==='export'?prepared.value?.data:data.value);
const data=shallowRef<ImportData>(),expected=shallowRef<Settings>();
const folderLabels=computed(()=>folderOptionLabels(folders.value));
const selection=ref<BackupSelection>({...allBackupSections});
const options=[{key:'bookmarks',label:'Закладки и папки'},{key:'images',label:'Изображения закладок'},{key:'settings',label:'Настройки'},{key:'background',label:'Фон'}] as const;
const available=computed<BackupSelection>(()=>stage.value==='export'?{...allBackupSections}:{bookmarks:data.value?.bookmarks!==false,images:rows.value.some(row=>row.thumbnail||row.favicon),settings:!!data.value?.settings,background:data.value?.background!==undefined});
const hasSelection=computed(()=>options.some(row=>selection.value[row.key]&&available.value[row.key]));
const needsDestination=computed(()=>selection.value.bookmarks||selection.value.images);
const appliedMessage=(report:ImportReport)=>report.settings&&report.background?'Настройки и фон применены.':report.settings?'Настройки применены.':report.background?'Фон применён.':'';
async function chooseExport(){
  if(busy.value)return;busy.value=true;error.value='';status.value='';
  try{prepared.value=await props.prepareExport();selection.value={...allBackupSections};stage.value='export';}
  catch(cause){error.value=message(cause);}finally{busy.value=false;await focus();}
}
const rows=computed(()=>transferData.value?.entries.flatMap(row=>'url' in row?[row]:row.children)??[]);
const counts=computed(()=>({bookmarks:rows.value.length,folders:transferData.value?.entries.filter(row=>!('url' in row)).length??0,thumbnails:rows.value.filter(row=>row.thumbnail).length,favicons:rows.value.filter(row=>row.favicon).length}));
async function loadFolders(){try{folders.value=await props.choices();folderError.value='';if(!folders.value.some(row=>row.id===destination.value))destination.value=folders.value[0]?.id??'';}catch{folderError.value='Не удалось загрузить папки назначения. Откройте окно ещё раз.';}}
function message(cause:unknown){return cause instanceof Error?cause.message:String(cause);}
async function focus(){await nextTick();if(stage.value==='result')done.value?.focus();else heading.value?.focus();}
function complete(title:string,warning=false,summary?:string,stats?:Pick<ImportReport,'bookmarks'|'folders'|'images'>){result.value={title,warning,summary,stats};stage.value='result';}
async function back(){if(busy.value)return;stage.value='home';data.value=undefined;prepared.value=undefined;result.value=undefined;error.value='';status.value='';await nextTick();homeAction.value?.focus();}
async function exportFile(){
  if(busy.value||!hasSelection.value||!prepared.value)return;busy.value=true;error.value='';status.value='Создаём резервную копию…';
  try{const backup=await props.exportData({...selection.value},prepared.value);downloadExport(backup.text);status.value='Экспорт завершён. Скачивание файла резервной копии запущено.';
    const exported=JSON.parse(backup.text),rows=exported.entries.flatMap((row:{url?:string;children?:Array<{thumbnail?:string;favicon?:string}>})=>row.url?[row]:row.children??[]);
    const stats={bookmarks:selection.value.bookmarks?rows.length:0,folders:selection.value.bookmarks?exported.entries.filter((row:{url?:string})=>!row.url).length:0,images:rows.reduce((sum:number,row:{thumbnail?:string;favicon?:string})=>sum+Number(!!row.thumbnail)+Number(!!row.favicon),0)};
    status.value=[stats.bookmarks?'Экспортировано закладок: '+stats.bookmarks+'.':'',stats.folders?'Экспортировано папок: '+stats.folders+'.':'',stats.images?'Экспортировано изображений: '+stats.images+'.':'',exported.settings?'Настройки включены в копию.':'',Object.hasOwn(exported,'background')?'Фон включён в копию.':'','Скачивание файла резервной копии запущено.'].filter(Boolean).join(' ');
    if(backup.warnings.length)error.value=backup.warnings.slice(0,3).join(' ')+(backup.warnings.length>3?' Всего предупреждений: '+backup.warnings.length+'.':'');
    complete(backup.warnings.length?'Экспорт с предупреждениями':'Экспорт завершён',!!backup.warnings.length,'Скачивание файла резервной копии запущено.',stats);
  }
  catch(cause){status.value='';error.value=message(cause);}finally{busy.value=false;await focus();}
}
async function read(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file||busy.value)return;
  busy.value=true;error.value='';status.value='';
  try{
    if(file.size>backupLimits.file)throw new Error('Файл резервной копии больше 40 МБ.');
    const parsed=parseImport(await file.text());await validateImportImages(parsed);await loadFolders();
    data.value=parsed;expected.value={...props.settings};stage.value='import';selection.value={...available.value};
    if(!hasSelection.value){stage.value='home';throw new Error('В файле нет данных, доступных для импорта.');}
  }catch(cause){error.value=message(cause);}finally{busy.value=false;await focus();}
}
async function importFile(){
  if(busy.value||!data.value||!hasSelection.value||(needsDestination.value&&(!destination.value||!!folderError.value))||!expected.value)return;
  busy.value=true;error.value='';status.value='Импортируем выбранные данные…';
  try{
    const report=await props.importData(data.value,destination.value,expected.value,{...selection.value});
    status.value=[report.bookmarks?'Добавлено закладок: '+report.bookmarks+'.':'',report.folders?'Добавлено папок: '+report.folders+'.':'',report.images?'Восстановлено изображений: '+report.images+'.':'',appliedMessage(report),report.skipped?'Не найдено совпадающих закладок: '+report.skipped+'.':''].filter(Boolean).join(' ');
    if(report.error||report.warnings.length)error.value=[report.error,...report.warnings.slice(0,3)].filter(Boolean).join(' ')+' Уже добавленные записи и восстановленные изображения сохранены.';
    complete(report.error?'Импорт прерван':report.warnings.length?'Импорт с предупреждениями':'Импорт завершён',!!report.error||!!report.warnings.length,report.error?(report.bookmarks||report.folders||report.images?'Часть данных уже восстановлена.':'Данные не были добавлены.'):[report.warnings.length?'Часть данных не удалось восстановить.':'',appliedMessage(report),report.skipped?'Не найдено совпадающих закладок: '+report.skipped+'.':''].filter(Boolean).join(' ')||(report.images||report.bookmarks||report.folders?'Выбранные данные восстановлены.':'Новых данных нет.'),{bookmarks:report.bookmarks,folders:report.folders,images:report.images});data.value=undefined;
  }catch(cause){status.value='';error.value=message(cause);}finally{busy.value=false;await focus();}
}
async function reset(){
  if(busy.value)return;busy.value=true;error.value='';status.value='Сбрасываем настройки и локальный кэш…';
  try{await props.resetData();status.value='Настройки сброшены, фон и локальные изображения удалены. Закладки и выбранная папка сохранены.';complete('Настройки сброшены',false,'Фон и локальные изображения удалены. Закладки и выбранная папка сохранены.');}
  catch(cause){status.value='';error.value='Сброс выполнен не полностью. '+message(cause);complete('Сброс не завершён',true);}finally{busy.value=false;await focus();}
}
defineExpose({close:()=>{if(!busy.value)emit('close');}});
onMounted(loadFolders);
</script>
<template>
  <ModalDialog title="Управление данными" :busy="busy" wide @close="emit('close')">
    <div class="data-management flex flex-col gap-4 [overflow-wrap:anywhere]">
      <input ref="fileInput" class="hidden" type="file" accept=".json,application/json" aria-label="Файл резервной копии" @change="read" />
      <template v-if="stage==='home'">
        <button ref="homeAction" aria-label="Экспорт" type="button" class="data-action secondary" :class="ui.button" :disabled="busy" @click="chooseExport">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg>
          <span><strong>Экспорт</strong><span class="text-[var(--text-secondary)]">Скачать закладки, настройки и изображения</span></span>
        </button>
        <button aria-label="Импорт" type="button" class="data-action secondary" :class="ui.button" :disabled="busy" @click="fileInput?.click()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/></svg>
          <span><strong>Импорт</strong><span class="text-[var(--text-secondary)]">Восстановить данные из файла резервной копии</span></span>
        </button>
        <p v-if="folderError||!folders.length" class="text-[var(--text-secondary)] text-sm">{{folderError||'Для импорта закладок и изображений нужна доступная папка.'}}</p>
        <div class="border-t border-[var(--ui-border)] pt-4">
          <button aria-label="Сбросить настройки и кэш" type="button" class="data-action danger w-full" :class="ui.button" :disabled="busy" @click="stage='reset';error='';status='';focus()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>
            <span><strong>Сбросить настройки и кэш</strong><span class="text-[var(--text-secondary)]">Закладки и папки останутся</span></span>
          </button>
        </div>
      </template>
      <template v-else-if="stage==='export'">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">Будет экспортировано:</h3>
        <fieldset class="backup-options export-summary" :disabled="busy">
          <legend class="sr-only">Состав экспорта</legend>
          <label v-for="option in options" :key="option.key" class="backup-option"><input v-model="selection[option.key]" type="checkbox" /><span>{{option.label}}<span v-if="option.key==='bookmarks'" class="backup-detail">Закладки: {{counts.bookmarks}} · Папки: {{counts.folders}}</span><span v-else-if="option.key==='images'" class="backup-detail">Эскизы: {{counts.thumbnails}} · Иконки сайтов: {{counts.favicons}}</span><span v-else-if="option.key==='background'&&!prepared?.data.background" class="backup-detail">Без фона</span></span></label>
        </fieldset>
        <p v-if="selection.images&&!selection.bookmarks" class="text-[var(--text-secondary)] text-sm">Изображения сохранятся для восстановления у совпадающих закладок. Новые закладки при импорте создаваться не будут.</p>
        <div class="flex gap-2"><button type="button" class="secondary flex-1 whitespace-nowrap" :class="ui.button" :disabled="busy" @click="back">Назад</button><button type="button" class="flex-1 whitespace-nowrap" :class="ui.button" :disabled="busy||!hasSelection" @click="exportFile">Экспортировать</button></div>
      </template>
      <template v-else-if="stage==='import'&&data">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">Будет импортировано:</h3>
        <fieldset class="backup-options import-summary" :disabled="busy">
          <legend class="sr-only">Состав импорта</legend>
          <label v-for="option in options" :key="option.key" class="backup-option" :class="{'text-[var(--text-secondary)]':!available[option.key]}">
            <input v-model="selection[option.key]" type="checkbox" :disabled="!available[option.key]" />
            <span>{{option.label}}<span v-if="!available[option.key]" class="backup-detail">Нет в файле</span><span v-else-if="option.key==='bookmarks'" class="backup-detail">Закладки: {{counts.bookmarks}} · Папки: {{counts.folders}}</span><span v-else-if="option.key==='images'" class="backup-detail">Эскизы: {{counts.thumbnails}} · Иконки сайтов: {{counts.favicons}}</span><span v-else-if="option.key==='background'&&!data.background" class="backup-detail">Без фона</span></span>
          </label>
        </fieldset>
        <p v-if="needsDestination&&(folderError||!folders.length)" role="alert" class="text-[var(--danger)] text-sm">{{folderError||'Для импорта нужна доступная папка закладок.'}}</p>
        <label v-if="needsDestination" for="import-destination">{{selection.bookmarks?'Добавить в папку':'Найти закладки в папке'}}</label>
        <div v-if="needsDestination" class="ui-select"><select id="import-destination" v-model="destination" :disabled="busy" :class="ui.input"><option v-for="row in folderLabels" :key="row.id" :value="row.id">{{row.label}}</option></select><SelectChevron /></div>
        <div class="flex gap-2"><button type="button" class="secondary flex-1 whitespace-nowrap" :class="ui.button" :disabled="busy" @click="back">Назад</button><button type="button" class="flex-1 whitespace-nowrap" :class="ui.button" :disabled="busy||!hasSelection||(needsDestination&&(!!folderError||!destination||!folders.some(row=>row.id===destination)))" @click="importFile">Импортировать</button></div>
      </template>
      <template v-else-if="stage==='reset'">
        <h3 ref="heading" tabindex="-1" class="font-semibold outline-none">Сбросить настройки и кэш?</h3>
        <p>Настройки вернутся к значениям по умолчанию. Фон, эскизы и favicon удалятся только на этом устройстве. Настоящие закладки, папки и выбранная папка останутся.</p>
        <p class="text-[var(--text-secondary)] text-sm">Синхронизируемые настройки могут сброситься и на других устройствах с тем же аккаунтом браузера.</p>
        <div class="flex gap-2"><button type="button" class="flex-1" :class="ui.button" :disabled="busy" @click="back">Отмена</button><button type="button" class="danger flex-1" :class="ui.button" :disabled="busy" @click="reset">Сбросить</button></div>
      </template>
      <template v-else-if="result">
        <div class="data-result text-center" :data-warning="result.warning||undefined">
          <div class="result-symbol mx-auto mb-4" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path v-if="result.warning" d="M12 7v6m0 4h.01"/><path v-else d="m6 12 4 4 8-8"/></svg>
          </div>
          <h3 class="text-xl font-semibold leading-tight">{{result.title}}</h3>
          <p v-if="status||result.summary" role="status" aria-live="polite" class="mt-2 text-[var(--text-secondary)] text-sm"><span :class="{'sr-only':!!result.summary}">{{status||result.summary}}</span><span v-if="result.summary" aria-hidden="true">{{result.summary}}</span></p>
          <dl v-if="resultStats.length" class="result-stats grid mt-5" :style="{'--result-columns':resultStats.length}" aria-hidden="true">
            <div v-for="row in resultStats" :key="row.label"><dt>{{row.label}}</dt><dd>{{row.value}}</dd></div>
          </dl>
          <p v-if="error" role="alert" class="result-warning mt-4 text-left text-sm">{{error}}</p>
        </div>
        <button ref="done" type="button" class="mt-1" :class="ui.button" @click="emit('close')">Готово</button>
      </template>
      <p v-if="stage!=='result'&&status" role="status" aria-live="polite" class="text-[var(--text-secondary)] text-sm">{{status}}</p>
      <p v-if="stage!=='result'&&error" role="alert" class="text-[var(--danger)] text-sm">{{error}}</p>
    </div>
  </ModalDialog>
</template>
<style scoped>
.backup-options {border:1px solid var(--ui-border);border-radius:var(--radius-lg);overflow:hidden}
.backup-option {display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer}
.backup-option+.backup-option {border-top:1px solid var(--ui-border)}
.backup-option:has(input:disabled) {cursor:default}
.backup-option input {width:20px;height:20px;flex:none;accent-color:var(--ui-accent)}
.backup-detail {display:block;font-size:14px;color:var(--text-secondary);margin-top:2px}
.data-action {display:flex;align-items:center;gap:14px;text-align:left;padding:14px;min-width:0}
.data-action>svg {width:24px;height:24px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.data-action>span {min-width:0}
.data-action strong {display:block;font-weight:500}
.data-action span span {display:block;font-size:14px;font-weight:400;line-height:1.4;margin-top:3px}
.result-symbol {width:48px;height:48px;display:flex;align-items:center;justify-content:center;border:1.5px solid currentColor;border-radius:50%;color:var(--success)}
.result-symbol svg {width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.data-result[data-warning] .result-symbol {color:var(--ui-text)}
.result-stats {grid-template-columns:repeat(var(--result-columns),minmax(0,1fr));background:var(--surface-input);border:1px solid var(--ui-border);border-radius:var(--radius-action);padding:12px 0}
.result-stats>div {min-width:0;padding:0 4px;display:flex;flex-direction:column-reverse;gap:4px}
.result-stats>div+div {border-left:1px solid var(--ui-border)}
.result-stats dt {font-size:12px;color:var(--text-secondary)}
.result-stats dd {margin:0;font-size:22px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums}
.result-warning {border-top:1px solid var(--ui-border);padding-top:16px;color:var(--ui-text)}
@media(max-width:360px){
 .result-stats {grid-template-columns:1fr;padding:4px 12px}
 .result-stats>div {flex-direction:row;align-items:center;justify-content:space-between;padding:8px 0;gap:12px}
 .result-stats>div+div {border-left:0;border-top:1px solid var(--ui-border)}
 .result-stats dt {font-size:14px}
 .result-stats dd {font-size:18px}
}
</style>
