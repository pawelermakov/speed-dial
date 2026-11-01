import { defineBackground } from 'wxt/utils/define-background';
import { createBackgroundApplication } from '../app/adapters/createBackgroundApplication';

export default defineBackground(() => {
  const application = createBackgroundApplication();
  if (import.meta.hot) import.meta.hot.dispose(application.dispose);
});
