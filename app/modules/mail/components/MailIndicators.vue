<script setup lang="ts">
import { useUiI18n } from '../../../common/i18n';

import type { MailPreferences } from '../entities/models';
import { mailEnabled, getMailTranslates } from '../helpers/presentation';
import MailIndicator from './MailIndicator.vue';
const { t: $t } = useUiI18n();

const { mailProviders } = getMailTranslates($t);
defineProps<{ settings: MailPreferences }>();
</script>
<template>
  <div v-if="mailProviders.some((row) => mailEnabled(settings, row.id))" class="mail-indicators">
    <template v-for="provider in mailProviders" :key="provider.id"
      ><MailIndicator v-if="mailEnabled(settings, provider.id)" :provider="provider"
    /></template>
  </div>
</template>
