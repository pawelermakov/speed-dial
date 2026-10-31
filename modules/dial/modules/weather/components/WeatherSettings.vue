<script setup lang="ts">
import { t } from '../../../../../services/i18n';
import { weatherCities, weatherProviders } from '../helpers/links';
import SwitchControl from '../../../../../components/SwitchControl.vue';
import SelectChevron from '../../../../../components/SelectChevron.vue';
import { ui } from '../../../../../utils/ui';
import type { Settings } from '../../settings';
defineProps<{
  settings: Settings;
  busy: boolean;
  updateSettings(patch: Partial<Settings>): Promise<boolean>;
}>();
</script>
<template>
  <fieldset class="mb-5 min-w-0 weather-settings">
    <legend class="font-bold mb-2">{{ t('weather.title') }}</legend>
    <SwitchControl
      :model-value="settings.weatherEnabled"
      :disabled="busy"
      class="settings-row"
      @update:model-value="(value) => updateSettings({ weatherEnabled: value })"
      >{{ t('settings.weather.enabled') }}</SwitchControl
    >
    <div v-if="settings.weatherEnabled" class="mt-3">
      <label for="weather-city" class="block mb-2">{{ t('settings.weather.city') }}</label>
      <div class="ui-select mb-3">
        <select
          id="weather-city"
          :value="settings.weatherCity"
          :disabled="busy"
          :class="ui.input"
          @change="
            updateSettings({
              weatherCity: ($event.target as HTMLSelectElement).value as Settings['weatherCity'],
            })
          "
        >
          <option v-for="city in weatherCities" :key="city.id" :value="city.id">
            {{ city.label }}
          </option></select
        ><SelectChevron />
      </div>
      <label for="weather-provider" class="block mb-2">{{ t('settings.weather.provider') }}</label>
      <div class="ui-select">
        <select
          id="weather-provider"
          :value="settings.weatherProvider"
          :disabled="busy"
          :class="ui.input"
          @change="
            updateSettings({
              weatherProvider: ($event.target as HTMLSelectElement)
                .value as Settings['weatherProvider'],
            })
          "
        >
          <option v-for="provider in weatherProviders" :key="provider.id" :value="provider.id">
            {{ provider.label }}
          </option></select
        ><SelectChevron />
      </div>
    </div>
  </fieldset>
</template>
