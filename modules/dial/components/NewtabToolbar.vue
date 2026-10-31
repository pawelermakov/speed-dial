<script setup lang="ts">
import { t } from '../../../services/i18n';
import { useScreen } from '../screenContext';
import SearchBar from '../../../components/SearchBar.vue';
import WeatherWidget from '../../../components/WeatherWidget.vue';
import MailIndicators from '../../../components/MailIndicators.vue';
const { dial, search, settings, backup, disabled } = useScreen();
const { snapshot, changeSearchProvider } = dial;
const { searchText, searchControl, focusSearchResult } = search;
const { settingsOpen, openSettings } = settings;
const { mailRevision } = backup;
</script>
<template>
  <header
    class="relative shrink-0"
    :class="{
      'has-weather': snapshot.settings.weatherEnabled,
      'has-mail-services': snapshot.settings.gmailEnabled || snapshot.settings.yandexMailEnabled,
    }"
  >
    <SearchBar
      ref="searchControl"
      v-model="searchText"
      :bookmark-search="snapshot.settings.bookmarkSearch"
      :movie-search="snapshot.settings.movieSearch"
      @submit-bookmarks="focusSearchResult"
      :provider="snapshot.settings.searchProvider"
      :disabled="disabled"
      :save-provider="changeSearchProvider"
    />
    <div class="tools flex items-center gap-2">
      <WeatherWidget
        v-if="snapshot.settings.weatherEnabled"
        :city="snapshot.settings.weatherCity"
        :provider="snapshot.settings.weatherProvider"
      />
      <MailIndicators :key="mailRevision" :settings="snapshot.settings" />
      <button
        class="settings-trigger ui-folder inline-flex size-12 items-center justify-center"
        :aria-label="t('settings.title')"
        :title="t('settings.title')"
        aria-haspopup="dialog"
        :aria-expanded="settingsOpen"
        :aria-controls="settingsOpen ? 'settings-modal' : undefined"
        :disabled="disabled"
        @click="openSettings"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <g transform="translate(0 1)">
            <path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3Z" />
            <circle cx="12" cy="11" r="3" />
          </g>
        </svg>
      </button>
    </div>
  </header>
</template>
