<script setup lang="ts">
import { t } from '../services/i18n';
import { computed } from 'vue';
import {
  forecastLink,
  type WeatherCityId,
  type WeatherProvider,
} from '../modules/dial/modules/weather/helpers/links';
const props = defineProps<{ city: WeatherCityId; provider: WeatherProvider }>();
const destination = computed(() => forecastLink(props.city, props.provider));
const label = computed(() =>
  destination.value.city
    ? t('weather.forecast.label', {
        city_name: destination.value.city.label,
        provider_name: destination.value.provider.label,
      })
    : t('common.open_named_service', { service_name: destination.value.provider.label }),
);
</script>
<template>
  <a class="weather-widget ui-folder" :href="destination.href" :aria-label="label" :title="label">
    <svg
      class="weather-symbol"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4v2m0 10v2M1 11h2m6-7L8 6M2 5l1 1M9 11a4 4 0 1 0-5 4" />
      <path d="M9 19a4 4 0 1 1 1-8 5 5 0 0 1 9 2 3 3 0 0 1 0 6Z" />
    </svg>
    <span class="weather-copy"
      ><span class="weather-caption">{{ t('weather.title') }}</span
      ><span class="weather-city">{{
        destination.city?.label ?? t('weather.open_service')
      }}</span></span
    >
  </a>
</template>
