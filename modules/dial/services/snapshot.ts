import type { Snapshot } from '../entities/models';
import type { BookmarksModule } from '../modules/bookmarks';
import { defaults, type Settings, type SettingsPort } from '../modules/settings';
import type { AppearanceService } from '../modules/appearance';

export interface SnapshotReader {
  load(includeBackground?: boolean): Promise<Snapshot>;
  initialize(): Promise<Snapshot>;
}
export function createSnapshotReader(ports: {
  source: Pick<BookmarksModule['source'], 'prepareRead' | 'choices' | 'initialize'>;
  settings: Pick<SettingsPort, 'getValue'>;
  appearance: Pick<AppearanceService, 'readStored'>;
  validate(input: unknown): Settings;
}): SnapshotReader {
  async function load(includeBackground = true): Promise<Snapshot> {
    const complete = ports.source.prepareRead();
    const [envelope, background, choices] = await Promise.all([
      ports.settings.getValue(),
      includeBackground ? ports.appearance.readStored() : undefined,
      ports.source.choices(),
    ]);
    const view = await complete(choices);
    return {
      tabs: view.tabs,
      folders: view.folders,
      rootId: view.rootId,
      activeId: view.activeId,
      settings: envelope ? ports.validate(envelope.value) : { ...defaults },
      background: background?.blob ?? null,
      rootNotice: view.rootNotice,
    };
  }
  return {
    load,
    async initialize() {
      await ports.source.initialize();
      return load();
    },
  };
}
