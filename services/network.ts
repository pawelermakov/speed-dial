export async function fetchJson(url: string, signal: AbortSignal, credentials: RequestCredentials = 'omit'): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), credentials });
  if (!response.ok) throw new Error('Сервис ответил HTTP ' + response.status + '.');
  return response.json();
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
