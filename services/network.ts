import type { MailProvider } from './mail';
export class MailError extends Error {
 constructor(readonly kind:'unauthenticated'|'error'|'unsupported',message:string){super(message);this.name='MailError';}
}
export function parseMailCount(value: unknown): number {
  const response = value as { status?: unknown; data?: { mail_cnt?: unknown } } | null;
  if (response?.status === 'noauth') throw new MailError('unauthenticated','Нет авторизации Mail.ru.');
  if(response?.status!==undefined&&response.status!=='ok')throw new MailError('error','Mail.ru вернул ошибку проверки.');
  const raw = response?.data?.mail_cnt;
  const count = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new MailError('error','Mail.ru не вернул корректный счётчик писем.');
  return count;
}
export async function unreadMail(signal:AbortSignal):Promise<number> {
 const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(8000)]);
 const read=async (email?:string):Promise<unknown>=>{
  const params=new URLSearchParams({mac:'1'});if(email)params.set('Login',email);
  const response=await fetch('https://portal.mail.ru/NaviData?'+params,{signal:requestSignal,credentials:'include',cache:'no-store',redirect:'error'});
  if(response.status===401)throw new MailError('unauthenticated','Нет авторизации Mail.ru.');
  if(!response.ok)throw new MailError('error','Не удалось проверить почту.');
  return response.json();
 };
 const value=await read();
 const response=value as {status?:unknown;data?:{mail_cnt?:unknown;email?:unknown;list?:unknown}}|null;
 if(response?.status==='noauth'||response?.status!=='ok'||Object.hasOwn(response?.data??{},'mail_cnt'))return parseMailCount(value);
 const data=response.data;
 const validEmail=(value:unknown):value is string=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
 let email=validEmail(data?.email)?data.email:undefined;
 if(!email&&Array.isArray(data?.list)&&data.list.length===1&&validEmail(data.list[0]))email=data.list[0];
 if(!email)throw new MailError('unsupported','Mail.ru не указал текущий аккаунт.');
 // Only the current (or sole) account; never guess among multiple signed-in accounts.
 return parseMailCount(await read(email));
}

function validCount(raw:unknown):number {
 const value=typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):raw;
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new MailError('error','Некорректный счётчик почты.');
 return value;
}
export function parseGmailCount(xml:string):number {
 if(xml.length>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new MailError('error','Недопустимый формат счётчика Gmail.');
 const document=new DOMParser().parseFromString(xml,'application/xml'),root=document.documentElement;
 if(document.getElementsByTagNameNS('*','parsererror').length||root.localName!=='feed'||!['http://purl.org/atom/ns#','http://www.w3.org/2005/Atom'].includes(root.namespaceURI??''))throw new MailError('error','Gmail не вернул почтовый feed.');
 const fields=[...root.children].filter(node=>node.localName==='fullcount'&&node.namespaceURI===root.namespaceURI);
 if(fields.length!==1||fields[0]!.children.length)throw new MailError('error','Gmail не вернул точный счётчик.');
 return validCount(fields[0]!.textContent?.trim());
}
export function parseYandexMailCount(value:unknown):number {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new MailError('error','Яндекс не вернул счётчик.');
 const data=value as {error?:unknown;counters?:{unread?:unknown}};
 if(data.error)throw new MailError('error','Яндекс вернул ошибку проверки.');
 return validCount(data.counters?.unread);
}
export const mailCounterUrls={gmail:'https://mail.google.com/mail/u/0/feed/atom',yandex:'https://mail.yandex.ru/api/v2/serp/counters?silent'} as const;
export async function unreadProvider(provider:MailProvider,signal:AbortSignal):Promise<number> {
 if(provider==='mailru')return unreadMail(signal);
 const response=await fetch(mailCounterUrls[provider],{credentials:'include',cache:'no-store',redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
 if(response.status===401)throw new MailError('unauthenticated','Войдите в почту.');
 if(response.status===404||response.status===410)throw new MailError('unsupported','Сервис счётчика недоступен.');
 if(!response.ok||response.type==='opaqueredirect'||response.status>=300)throw new MailError('error','Не удалось проверить почту.');
 return provider==='gmail'?parseGmailCount(await response.text()):parseYandexMailCount(await response.json());
}
