import type { useDial } from './useDial';
import type { Bookmark, Folder } from '../modules/bookmarks';
export type DialState = ReturnType<typeof useDial>;
export type ContextState = { x: number; y: number; bookmark?: Bookmark; folder?: Folder };
export type FocusTarget = { element: HTMLElement; selector?: string; id?: string; index: number };
