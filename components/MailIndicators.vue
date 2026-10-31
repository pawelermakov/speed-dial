<script setup lang="ts">
import type { Settings } from '../modules/dial/modules/settings';
import { mailEnabled, mailProviders } from '../modules/dial/modules/mail/helpers/presentation';
import MailIndicator from './MailIndicator.vue';
defineProps<{ settings: Settings }>();
</script>
<template>
  <div v-if="mailProviders.some((row) => mailEnabled(settings, row.id))" class="mail-indicators">
    <template v-for="provider in mailProviders" :key="provider.id"
      ><MailIndicator v-if="mailEnabled(settings, provider.id)" :provider="provider"
    /></template>
  </div>
</template>
