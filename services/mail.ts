import type { Settings } from '../types/models';
export const mailProviders=[
 {id:'mailru',name:'Mail.ru',href:'https://e.mail.ru/messages/inbox/'},
 {id:'gmail',name:'Gmail',href:'https://mail.google.com/mail/u/0/'},
 {id:'yandex',name:'Яндекс Почта',href:'https://mail.yandex.ru/'}
] as const;
export type MailProvider=typeof mailProviders[number]['id'];
export type MailStatus='loading'|'ready'|'unauthenticated'|'error'|'unsupported';
export function mailEnabled(settings:Settings,id:MailProvider):boolean {
 return id==='mailru'?settings.mailruEnabled:id==='gmail'?settings.gmailEnabled:settings.yandexMailEnabled;
}
export function mailTooltip(name:string,status:MailStatus):string {
 if(status==='unauthenticated')return 'Войдите в '+name;
 if(status==='error')return 'Не удалось проверить почту · '+name;
 if(status==='unsupported')return 'Счётчик недоступен · '+name;
 if(status==='loading')return 'Проверяем почту · '+name;
 return name;
}
