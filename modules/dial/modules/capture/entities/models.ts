import type { MessageText } from '../../../../../shared/i18n/contracts';

export interface CaptureRequest {
  type: 'capture';
  requestId: string;
  url: string;
}
export interface CaptureResponse {
  requestId: string;
  title?: string;
  favicon?: string;
  thumbnail?: string;
  error?: MessageText;
}
