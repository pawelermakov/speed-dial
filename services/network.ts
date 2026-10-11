export async function fetchJson(url: string, signal: AbortSignal, credentials: RequestCredentials = 'omit'): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), credentials });
  if (!response.ok) throw new Error('Сервис ответил HTTP ' + response.status + '.');
  return response.json();
}
export function parseSuggestions(value: unknown): string[] {
  if (!Array.isArray(value) || !Array.isArray(value[1])) throw new Error('Яндекс вернул неизвестный формат подсказок.');
  return value[1].filter((item): item is string => typeof item === 'string').slice(0, 10);
}
export async function suggestions(query: string, signal: AbortSignal): Promise<string[]> {
  const params = new URLSearchParams({ part: query });
  return parseSuggestions(await fetchJson('https://suggest.yandex.ru/suggest-sl?' + params, signal));
}
export function parseMailCount(value: unknown): number {
  const response = value as { status?: unknown; data?: { mail_cnt?: unknown } } | null;
  if (response?.status === 'noauth') throw new Error('Нет авторизации Mail.ru в этом профиле браузера. Откройте почту и войдите в аккаунт, затем обновите новую вкладку.');
  const raw = response?.data?.mail_cnt;
  const count = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('Mail.ru не вернул счётчик писем. Проверьте вход в почту.');
  return count;
}
export async function unreadMail(email: string, signal: AbortSignal): Promise<number> {
  const params = new URLSearchParams({ mac: '1', Login: email });
  return parseMailCount(await fetchJson('https://portal.mail.ru/NaviData?' + params, signal, 'include'));
}
