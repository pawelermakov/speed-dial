// Shared file-input/download interaction for isolated browser profiles only.
export const dataClick=(exec,label)=>exec('const e=[...document.querySelectorAll(".data-management button,.settings button")].find(e=>e.getAttribute("aria-label")===arguments[0]||e.textContent.trim()===arguments[0]);if(!e)throw Error(arguments[0]);e.focus();e.click();',label);
export async function openData(exec,until){
 if(!await exec('return !!document.querySelector(".settings");')){await exec('document.querySelector(".settings-trigger").click();');await until('return !!document.querySelector(".settings");');}
 await dataClick(exec,'Управление данными');await until('return !!document.querySelector(".data-management")&&!document.querySelector(".settings")&&!document.querySelector(".modal-panel-enter-active");');
}
export async function chooseBackup(exec,value,name='backup.json'){
 await exec('const input=document.querySelector(".data-management input[type=file]"),dt=new DataTransfer();dt.items.add(new File([arguments[0]],arguments[1],{type:"application/json"}));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));',typeof value==='string'?value:JSON.stringify(value),name);
}
export async function captureBackup(exec,until){
 await exec('window.backupDownload=null;window.backupOriginalClick??=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.backupDownload={name:this.download,url:this.href};}else backupOriginalClick.call(this);};');
 await openExport(exec,until);await dataClick(exec,'Экспортировать');await until('return !!backupDownload&&document.querySelector(".data-management [role=status]")?.textContent.includes("запущено");');
 const backup=await exec('return JSON.parse(await (await fetch(backupDownload.url)).text());');
 await until('return document.activeElement?.textContent.trim()==="Готово";');
 await reopenData(exec,until);return backup;
}

export async function reopenData(exec,until){
 await dataClick(exec,'Готово');await until('return !document.querySelector(".data-management")&&document.activeElement?.matches(".settings-trigger");');await openData(exec,until);
}

export async function selectSections(exec,selected){
 await exec('for(const label of document.querySelectorAll(".backup-option")){const input=label.querySelector("input"),name=label.querySelector("span").firstChild.textContent.trim();const checked=arguments[0].includes(name);if(input.checked!==checked)input.click();}',selected);
}

export async function openExport(exec,until){
 await dataClick(exec,'Экспорт');await until('return !!document.querySelector(".export-summary")&&!document.querySelector(".export-summary").disabled;');
}
