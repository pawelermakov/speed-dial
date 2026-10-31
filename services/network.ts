// Compatibility exports; requests are bounded by the mail service.
export {
  MailError,
  parseMailCount,
  parseGmailCount,
  parseYandexMailCount,
  mailCounterUrls,
} from '../modules/dial/modules/mail/adapters/counters';
import { createMailModule } from '../modules/dial/modules/mail/newtab';
export const unreadProvider = createMailModule().unread;
export const unreadMail = (signal: AbortSignal) => unreadProvider('mailru', signal);
