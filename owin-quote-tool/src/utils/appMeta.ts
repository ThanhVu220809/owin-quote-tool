import { getHostedAppData, upsertHostedAppData } from '@/features/supabase/sharedDataRepo';

export const APP_SCHEMA_VERSION = 2;

export interface AppMeta {
  schemaVersion: number;
  nextNumericId?: number;
  migratedAt?: string;
}

const APP_META_KEY = 'app';

export async function getAppMeta(): Promise<AppMeta> {
  return (
    (await getHostedAppData<AppMeta>(APP_META_KEY)) ?? {
      schemaVersion: APP_SCHEMA_VERSION,
    }
  );
}

export async function saveAppMeta(meta: Partial<AppMeta>): Promise<AppMeta> {
  const current = await getAppMeta();
  const saved: AppMeta = {
    ...current,
    ...meta,
    schemaVersion: meta.schemaVersion ?? current.schemaVersion ?? APP_SCHEMA_VERSION,
  };
  await upsertHostedAppData(APP_META_KEY, saved);
  return saved;
}

export async function markMigrated(): Promise<AppMeta> {
  return saveAppMeta({
    schemaVersion: APP_SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
  });
}

/** LocalForage-compatible surface retained for callers while storage is hosted. */
export const appMetaStore = {
  getItem<T>(key: string): Promise<T | null> {
    return getHostedAppData<T>(key);
  },
  async setItem<T>(key: string, value: T): Promise<T> {
    await upsertHostedAppData(key, value);
    return value;
  },
};
