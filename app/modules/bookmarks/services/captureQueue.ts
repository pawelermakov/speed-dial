import { message } from '../../../common/i18n/messages';
import type { CaptureHandler } from './interfaces';
export function createCaptureQueue(execute: CaptureHandler): CaptureHandler {
  let queue = Promise.resolve(),
    pending = 0;
  return (request, originTab, cancellation) => {
    if (pending >= 8)
      return Promise.resolve({
        requestId: request.requestId,
        error: message('capture.errors.queue_full'),
      });
    pending++;
    const task = queue.then(() => execute(request, originTab, cancellation));
    queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task.finally(() => {
      pending--;
    });
  };
}
