import { createApp } from 'vue';
import { defaultLanguage, setLanguage, language } from '../../services/i18n';
import { createNewtabApplication } from '../../app/createNewtabApplication';
import { provideServices } from '../../app/serviceContext';
import App from '../../App.vue';
import '../../assets/style.css';

const services = createNewtabApplication();
const app = createApp(App);
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
    setLanguage(saved?.value.language ?? defaultLanguage);
    mount();
  },
  () => {
    if (disposed) return;
    setLanguage(language.value);
    mount();
  },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true;
    if (mounted) app.unmount();
    else services.dispose();
  });
