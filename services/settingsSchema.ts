import { defaults, type Settings } from '../types/models';
import { validateSettings } from './validation';

// Settings is the sole allowlist: identities, image data and bookmark IDs never
// pass through this adapter. Adding a setting also requires its validator.
export const settingKeys = Object.keys(defaults) as (keyof Settings)[];
export const syncPrefix = 'settings.v1.';
export const folderKey = 'selectedFolder.v1';
export function validSetting<K extends keyof Settings>(key: K, value: unknown): value is Settings[K] {
  if (!settingKeys.includes(key) || typeof value !== typeof defaults[key]) return false;
  try {
    const normalized = validateSettings({ ...defaults, movieSearch:true, [key]: value })[key];
    return normalized === value;
  } catch { return false; }
}
export function syncPatch(values: Record<string, unknown>): Partial<Settings> {
  const patch: Partial<Settings> = {};
  for (const key of settingKeys) {
    const value = values[syncPrefix + key];
    if (validSetting(key, value)) Object.assign(patch, { [key]: value });
  }
  return patch;
}

// Trusted local snapshots may retain retired fields; imports stay strictly validated.
export function storedSettings(input:unknown):Settings {
 const source=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
 return validateSettings(Object.fromEntries(settingKeys.filter(key=>validSetting(key,source[key])).map(key=>[key,source[key]])));
}
