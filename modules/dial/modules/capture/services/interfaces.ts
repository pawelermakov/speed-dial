import type { CaptureRequest, CaptureResponse } from '../entities/models';
import type { AutoNameTicket, BookmarkNode } from '../../bookmarks';
import type { MessageText } from '../../../../../shared/i18n/contracts';
export interface CaptureHandler {
  (request: CaptureRequest, originTab: number, cancellation: AbortSignal): Promise<CaptureResponse>;
}
export interface CaptureResult {
  title: string;
  favicon: string;
  thumbnail: Blob;
}
export interface CaptureClient {
  requestThumbnail(url: string): Promise<CaptureResult>;
  dispose(): void;
}
export interface CaptureBookmarksPort {
  autoNameTicket(id: string): Promise<AutoNameTicket | undefined>;
  bookmark(id: string): Promise<BookmarkNode>;
  cache(
    id: string,
    url: string,
    resource: 'thumbnail' | 'favicon',
    blob: Blob,
    expected?: { title: string; parentId?: string },
  ): Promise<void>;
  applyCapturedTitle(
    id: string,
    url: string,
    title: string,
    ticket: AutoNameTicket | undefined,
  ): Promise<void>;
}
export interface PreparedCapture {
  ticket: AutoNameTicket | undefined;
  expected: BookmarkNode;
}
export interface CaptureCompletion {
  refresh(): Promise<unknown>;
  announce(): void;
}
export interface CaptureWorkflowPorts extends CaptureCompletion {
  bookmarks: CaptureBookmarksPort;
  request(url: string): Promise<CaptureResult>;
  faviconBlob(url: string, hint?: string): Promise<Blob | null>;
  active(): boolean;
}
export type CaptureError = (message: MessageText) => Error;
