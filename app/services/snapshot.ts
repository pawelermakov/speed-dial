import type { Snapshot } from '../entities/models';
import type { IBookmarksSource } from '../modules/bookmarks';
import { defaults, type Settings, type SettingsPort } from '../modules/settings';
import type { IAppearanceService } from '../modules/appearance';

export interface SnapshotReader {
  load(includeBackground?: boolean): Promise<Snapshot>;
  initialize(includeBackground?: boolean): Promise<Snapshot>;
}
export function createSnapshotReader(ports: {
  source: Pick<IBookmarksSource, 'prepareRead' | 'choices' | 'initialize'>;
  settings: Pick<SettingsPort, 'getValue'>;
  appearance: Pick<IAppearanceService, 'readStored'>;
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
    async initialize(includeBackground = true) {
      await ports.source.initialize();
      return load(includeBackground);
    },
  };
}
