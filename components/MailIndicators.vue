<script setup lang="ts">
import { useUiI18n } from '../shared/i18n';

import type { Settings } from '../modules/dial/modules/settings';
import { mailEnabled, getMailTranslates } from '../modules/dial/modules/mail/helpers/presentation';
import MailIndicator from './MailIndicator.vue';
const { t: $t } = useUiI18n();

const { mailProviders } = getMailTranslates($t);
defineProps<{ settings: Settings }>();
</script>
<template>
  <div v-if="mailProviders.some((row) => mailEnabled(settings, row.id))" class="mail-indicators">
    <template v-for="provider in mailProviders" :key="provider.id"
      ><MailIndicator v-if="mailEnabled(settings, provider.id)" :provider="provider"
    /></template>
  </div>
</template>
