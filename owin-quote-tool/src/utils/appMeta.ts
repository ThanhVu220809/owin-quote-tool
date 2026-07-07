import localforage from 'localforage';

export const APP_SCHEMA_VERSION = 2;

export interface AppMeta {
  schemaVersion: number;
  nextNumericId?: number;
  migratedAt?: string;
}

const appMetaStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'app_meta',
  driver: localforage.INDEXEDDB,
  description: 'Schema/migration metadata for the browser-only app',
});

const APP_META_KEY = 'app';

export async function getAppMeta(): Promise<AppMeta> {
  return (
    (await appMetaStore.getItem<AppMeta>(APP_META_KEY)) ?? {
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
  await appMetaStore.setItem(APP_META_KEY, saved);
  return saved;
}

export async function markMigrated(): Promise<AppMeta> {
  return saveAppMeta({
    schemaVersion: APP_SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
  });
}

export { appMetaStore };
