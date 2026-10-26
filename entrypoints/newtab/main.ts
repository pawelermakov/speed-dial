import { createApp } from 'vue';
import { defaultLanguage, setLanguage, language } from '../../services/i18n';
import { settingsItem } from '../../services/settings';
import App from '../../App.vue';
import '../../assets/style.css';
void settingsItem.getValue().then(saved=>{setLanguage(saved?.value.language??defaultLanguage);createApp(App).mount('#app');},()=>{setLanguage(language.value);createApp(App).mount('#app');});
