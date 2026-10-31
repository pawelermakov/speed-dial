import { createApp } from 'vue';
import { defaultLanguage } from '../../shared/i18n/contracts';
import { createNewtabApplication } from '../../app/createNewtabApplication';
import { provideServices } from '../../app/serviceContext';
import App from '../../App.vue';
import '../../assets/style.css';

const services = createNewtabApplication();
const app = createApp(App);
const { translations } = services;
translations.install(app);
provideServices(app, services);
app.onUnmount(services.dispose);
let disposed = false,
  mounted = false;
const mount = () => {
  if (!disposed) {
    app.mount('#app');
    mounted = true;
  }
};
void services.settings.getValue().then(
  (saved) => {
    if (disposed) return;
    translations.setLanguage(saved?.value.language ?? defaultLanguage);
    mount();
  },
  () => {
    if (disposed) return;
    translations.setLanguage(translations.language.value);
    mount();
  },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    if (mounted) app.unmount();
    else services.dispose();
  });
