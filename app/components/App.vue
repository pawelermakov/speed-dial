<script setup lang="ts">
import { useUiI18n } from '../common/i18n';
import { joinMessages } from '../common/i18n/messages';

import { provideScreen } from '../composables/useScreen';
import { useNewtabScreen } from '../composables/useNewtabScreen';
import NewtabToolbar from './NewtabToolbar.vue';
import NewtabBookmarks from './NewtabBookmarks.vue';
import NewtabDialogHost from './NewtabDialogHost.vue';
const { t: $t, formatMessage } = useUiI18n();

const screen = useNewtabScreen();
provideScreen(screen);
const { dial, settings, presentation, contextActions } = screen;
const { loading, notice, settingErrors } = dial;
const { settingsOpen } = settings;
const { keyboardFocus, backgroundUrl } = presentation;
const { showContext } = contextActions;
</script>
<template>
  <div
    :data-keyboard-focus="keyboardFocus || undefined"
    class="page relative font-[family-name:var(--ui-font)] leading-[normal] bg-center bg-cover bg-no-repeat [:where(&)_button]:cursor-pointer [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100 [:where(&)_button]:font-[family-name:var(--ui-font)] [:where(&)_input]:font-[family-name:var(--ui-font)] [:where(&)_textarea]:font-[family-name:var(--ui-font)] [:where(&)_button]:text-base [:where(&)_input]:text-base [:where(&)_textarea]:text-base [:where(&)_button]:font-normal [:where(&)_button]:leading-[normal] [:where(&)_input]:leading-[normal] [:where(&)_textarea]:leading-[normal] [:where(&)_button]:[-webkit-tap-highlight-color:transparent] [&_a]:[-webkit-tap-highlight-color:transparent] [:where(&)_input]:[-webkit-tap-highlight-color:transparent] [:where(&)_textarea]:[-webkit-tap-highlight-color:transparent] [&_input::placeholder]:opacity-100 [&_textarea::placeholder]:opacity-100 [&_*]:motion-reduce:transition-none [&_*]:motion-reduce:animate-none [&_*::before]:motion-reduce:transition-none [&_*::after]:motion-reduce:transition-none"
    @contextmenu="showContext"
  >
    <div
      aria-hidden="true"
      class="page-background fixed inset-0 pointer-events-none bg-center bg-cover bg-no-repeat"
      :class="{ 'is-ready': !!backgroundUrl }"
      :style="{
        backgroundImage: backgroundUrl
          ? 'linear-gradient(var(--wallpaper-shade),var(--wallpaper-shade)),url(' +
            backgroundUrl +
            ')'
          : undefined,
        backgroundColor: backgroundUrl ? '#808590' : undefined,
      }"
    />
    <main
      class="dial relative flex flex-col p-6 motion-reduce:transition-none [&.pushed]:pointer-events-none"
      :class="{ pushed: settingsOpen, 'is-loaded': !loading }"
    >
      <NewtabToolbar />
      <NewtabBookmarks />
    </main>
    <div
      v-if="!settingsOpen && Object.keys(settingErrors).length"
      role="alert"
      class="fixed bottom-4 left-4 right-4 p-4 rounded-[var(--ui-radius)] shadow-[var(--ui-shadow-popover)] z-50 break-words"
    >
      {{ formatMessage(joinMessages(Object.values(settingErrors))) }}
    </div>
    <div
      v-if="notice && !settingsOpen"
      role="status"
      class="notice fixed bottom-4 left-4 right-4 p-4 rounded-[var(--ui-radius)] shadow-[var(--ui-shadow-popover)] flex justify-between items-start gap-3 z-50 [overflow-wrap:anywhere]"
    >
      <span>{{ formatMessage(notice) }}</span
      ><button
        class="ui-hover rounded-full"
        :aria-label="$t('notifications.dismiss')"
        @click="notice = ''"
      >
        ×
      </button>
    </div>
    <NewtabDialogHost />
  </div>
</template>
