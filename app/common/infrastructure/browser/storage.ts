import type { storage } from 'wxt/utils/storage';
export type BrowserStorage = Pick<typeof storage, 'defineItem'>;
