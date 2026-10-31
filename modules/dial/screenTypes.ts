import type { useDial } from '../../composables/useDial';
import type { NewtabApplication } from '../../app/createNewtabApplication';
import type { Bookmark, Folder } from '../../types/models';
export type DialState = ReturnType<typeof useDial>;
export type ScreenServices = NewtabApplication;
export type ContextState = { x: number; y: number; bookmark?: Bookmark; folder?: Folder };
export type FocusTarget = { element: HTMLElement; selector?: string; id?: string; index: number };
