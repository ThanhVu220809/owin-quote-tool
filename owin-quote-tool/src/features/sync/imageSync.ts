import type { ProductRecord, QuoteRecord } from '@/types/models';
import { getImage, getQuoteImage, saveImage, saveQuoteImage } from '@/utils/imageStorage';
import { imageStoreKeyFromPath } from '@/utils/imagePaths';
import { downloadImage, findFileMetadata, uploadImage } from './driveSync';
import localforage from 'localforage';

export interface ImageSyncResult {
  count: number;
  errors: number;
}

const IMAGE_SYNC_CONCURRENCY = 4;
const imageMetaStore = localforage.createInstance({
  name: 'owin-quote-tool',
  storeName: 'sync-image-meta',
  driver: localforage.INDEXEDDB,
});

async function processImageKeys(
  keys: string[],
  processKey: (key: string) => Promise<boolean>,
): Promise<ImageSyncResult> {
  let nextIndex = 0;
  let count = 0;
  let errors = 0;

  const worker = async () => {
    while (nextIndex < keys.length) {
      const key = keys[nextIndex];
      nextIndex += 1;
      try {
        if (await processKey(key)) count += 1;
      } catch {
        errors += 1;
      }
    }
  };

  const workerCount = Math.min(IMAGE_SYNC_CONCURRENCY, keys.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { count, errors };
}

function addImagePath(paths: Set<string>, path: string | null | undefined): void {
  const key = imageStoreKeyFromPath(path);
  if (key) paths.add(key);
}

function addQuoteSnapshotImages(paths: Set<string>, quote: QuoteRecord): void {
  for (const item of quote.snapshot.items ?? []) {
    addImagePath(paths, item.image);
    addImagePath(paths, item.coverImagePath);
    addImagePath(paths, item.categoryImage);
    addImagePath(paths, item.categoryImagePath);
    addImagePath(paths, item.companyLogo);
    addImagePath(paths, item.imageReference);
  }
}

export function collectReferencedImageKeys(
  products: ProductRecord[],
  quotes: QuoteRecord[] = [],
): string[] {
  const paths = new Set<string>();

  for (const product of products) {
    addImagePath(paths, product.coverImagePath);
    for (const imagePath of product.gallery ?? []) addImagePath(paths, imagePath);
  }

  for (const quote of quotes) {
    for (const item of quote.items ?? []) {
      addImagePath(paths, item.imagePath);
      addImagePath(paths, item.imageReference);
    }
    addQuoteSnapshotImages(paths, quote);
  }

  return [...paths].sort();
}

function isQuoteImageKey(key: string): boolean {
  return key.startsWith('quotes/');
}

async function getLocalImageBlob(key: string): Promise<Blob | null> {
  return isQuoteImageKey(key) ? getQuoteImage(key) : getImage(key);
}

async function saveLocalImageBlob(key: string, blob: Blob): Promise<void> {
  if (isQuoteImageKey(key)) {
    await saveQuoteImage(key, blob);
    return;
  }
  await saveImage(key, blob);
}

export async function uploadReferencedImages(
  products: ProductRecord[],
  quotes: QuoteRecord[] = [],
  token?: string,
): Promise<ImageSyncResult> {
  return processImageKeys(collectReferencedImageKeys(products, quotes), async (key) => {
    const blob = await getLocalImageBlob(key);
    if (!blob) throw new Error(`Thiếu blob ảnh local: ${key}`);
    await uploadImage(key, blob, token);
    return true;
  });
}

export async function downloadReferencedImages(
  products: ProductRecord[],
  quotes: QuoteRecord[] = [],
  token?: string,
): Promise<ImageSyncResult> {
  return processImageKeys(collectReferencedImageKeys(products, quotes), async (key) => {
    const blob = await downloadImage(key, token);
    if (!blob) return false;
    await saveLocalImageBlob(key, blob);
    return true;
  });
}

export async function syncReferencedImages(
  products: ProductRecord[],
  quotes: QuoteRecord[] = [],
  token?: string,
): Promise<ImageSyncResult> {
  return processImageKeys(collectReferencedImageKeys(products, quotes), async (key) => {
    const local = await getLocalImageBlob(key);
    const remoteMeta = await findFileMetadata(`img_${key}`, token);
    const lastRemoteModified = await imageMetaStore.getItem<string>(key);

    // Remote changed since the last successful image sync: pull it before any upload.
    if (remoteMeta && remoteMeta.modifiedTime && remoteMeta.modifiedTime !== lastRemoteModified) {
      const remote = await downloadImage(key, token);
      if (!remote) return false;
      await saveLocalImageBlob(key, remote);
      await imageMetaStore.setItem(key, remoteMeta.modifiedTime);
      return true;
    }
    if (local) {
      // Metadata is published only after this binary upload succeeds.
      await uploadImage(key, local, token);
      const refreshed = await findFileMetadata(`img_${key}`, token);
      await imageMetaStore.setItem(key, refreshed?.modifiedTime ?? remoteMeta?.modifiedTime ?? '');
      return true;
    }

    const remote = await downloadImage(key, token);
    if (!remote) throw new Error(`Không tìm thấy ảnh local/Drive: ${key}`);
    await saveLocalImageBlob(key, remote);
    await imageMetaStore.setItem(key, remoteMeta?.modifiedTime ?? '');
    return true;
  });
}
