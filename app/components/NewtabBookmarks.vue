<script setup lang="ts">
import { useUiI18n } from '../common/i18n';

import { useScreen } from '../composables/useScreen';
import { FolderTabs } from '../modules/bookmarks/components';
import { BookmarkGrid } from '../modules/bookmarks/components';
import EmptyState from '../common/components/EmptyState.vue';
const { t: $t, formatMessage } = useUiI18n();

const {
  dial,
  search,
  settings,
  bookmarks,
  folders,
  focus,
  contextActions,
  context,
  disabled,
  overlayOpen,
  presentation,
} = useScreen();
const { snapshot, loading, revision, refresh } = dial;
const { openSettings } = settings;
const {
  bookmarkContent,
  searching,
  searchError,
  showEmptySearch,
  closeSearch,
  searchControl,
  results,
  folderNames,
} = search;
const { creatingFolder, editingFolder, selectFolder, reorderFolders } = folders;
const { openBookmark, reorder } = bookmarks;
const add = () => {
  void openBookmark();
};
const { contextTarget, rememberContextTarget } = focus;
const { showContext, showFolderContext } = contextActions;
const { motionEnabled } = presentation;
</script>
<template>
  <div class="bookmark-area flex flex-col flex-1">
    <div v-if="!loading && !snapshot.rootId" class="surface-empty text-center my-8">
      <p>{{ $t('bookmarks.source.choose_in_settings') }}</p>
      <button class="mt-3" :disabled="disabled" @click="openSettings">
        {{ $t('settings.open') }}
      </button>
    </div>
    <template v-else-if="!loading">
      <div
        v-if="snapshot.folders.length || creatingFolder"
        class="bookmark-toolbar relative flex items-center min-h-12 my-4 mx-auto"
        :style="{ width: snapshot.settings.width + '%' }"
      >
        <FolderTabs
          :context-id="context ? contextTarget?.id : undefined"
          :motion-enabled="motionEnabled"
          :revision="revision"
          :folders="snapshot.folders"
          :active-id="snapshot.activeId"
          :disabled="disabled"
          :creating="creatingFolder"
          :editing="editingFolder"
          @select="selectFolder"
          @context="showFolderContext"
          @background="
            (event) => {
              if (!disabled && !overlayOpen) {
                rememberContextTarget();
                context = { x: event.clientX, y: event.clientY };
              }
            }
          "
          @reorder="reorderFolders"
          @refresh="refresh"
        />
      </div>
      <div
        ref="bookmarkContent"
        class="bookmark-content flex flex-col flex-1"
        :class="{ 'justify-center': snapshot.settings.verticalCenter }"
      >
        <p v-if="searching && searchError" role="alert" class="surface-empty text-center my-4">
          {{ formatMessage(searchError) }}
          <button @click.stop="revision++">{{ $t('common.retry') }}</button>
        </p>
        <EmptyState
          v-else-if="showEmptySearch"
          class="bookmark-search-empty my-6"
          :title="$t('search.bookmarks.empty.title')"
          :description="$t('search.bookmarks.empty.description')"
          :action-label="$t('search.clear')"
          symbol="search"
          announce
          :disabled="disabled"
          @action="
            closeSearch();
            searchControl?.focus();
          "
          :style="{ width: 'min(440px,' + snapshot.settings.width + '%)' }"
        />
        <BookmarkGrid
          :context-id="context ? contextTarget?.id : undefined"
          :motion-enabled="motionEnabled"
          :folder-id="snapshot.activeId"
          :revision="revision"
          :folder-names="folderNames"
          :tabs="searching ? results : snapshot.tabs"
          :searching="searching"
          :settings="snapshot.settings"
          :disabled="disabled"
          @add="add"
          @context="showContext"
          @reorder="reorder"
          @refresh="refresh"
        />
      </div>
    </template>
  </div>
</template>
