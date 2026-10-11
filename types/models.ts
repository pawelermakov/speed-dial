export interface Settings {
  width: number;
  countColumns: number;
  space: number;
  verticalCenter: boolean;
  addButton: boolean;
  email: string;
}
export interface Bookmark {
  id: number;
  url: string;
  title: string;
  favicon: string;
  thumbnail: Blob | null;
  position: number;
}
export interface Snapshot { tabs: Bookmark[]; settings: Settings; background: Blob | null }
export interface CaptureRequest { type: 'capture'; requestId: string; url: string }
export interface CaptureResponse {
  requestId: string;
  title?: string;
  favicon?: string;
  thumbnail?: string;
  error?: string;
}
export const defaults: Settings = {
  width: 100, countColumns: 6, space: 24,
  verticalCenter: false, addButton: false, email: '',
};
