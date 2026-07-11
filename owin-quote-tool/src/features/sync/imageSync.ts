import type { ProductRecord, QuoteRecord } from '@/types/models';
import { getImage, getQuoteImage, saveImage, saveQuoteImage } from '@/utils/imageStorage';
import { imageStoreKeyFromPath } from '@/utils/imagePaths';
import { downloadImage, uploadImage } from './driveSync';

export interface ImageSyncResult {
  count: number;
  errors: number;
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
    for (const item of quote.items ?? []) addImagePath(paths, item.imagePath);
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
  let count = 0;
  let errors = 0;

  for (const key of collectReferencedImageKeys(products, quotes)) {
    try {
      const blob = await getLocalImageBlob(key);
      if (!blob) continue;
      await uploadImage(key, blob, token);
      count += 1;
    } catch {
      errors += 1;
    }
  }

  return { count, errors };
}

export async function downloadReferencedImages(
  products: ProductRecord[],
  quotes: QuoteRecord[] = [],
  token?: string,
): Promise<ImageSyncResult> {
  let count = 0;
  let errors = 0;

  for (const key of collectReferencedImageKeys(products, quotes)) {
    try {
      const blob = await downloadImage(key, token);
      if (!blob) continue;
      await saveLocalImageBlob(key, blob);
      count += 1;
    } catch {
      errors += 1;
    }
  }

  return { count, errors };
}

export async function syncReferencedImages(
  products: ProductRecord[],
  quotes: QuoteRecord[] = [],
  token?: string,
): Promise<ImageSyncResult> {
  let count = 0;
  let errors = 0;

  for (const key of collectReferencedImageKeys(products, quotes)) {
    try {
      const local = await getLocalImageBlob(key);
      if (local) {
        await uploadImage(key, local, token);
        count += 1;
        continue;
      }

      const remote = await downloadImage(key, token);
      if (!remote) continue;
      await saveLocalImageBlob(key, remote);
      count += 1;
    } catch {
      errors += 1;
    }
  }

  return { count, errors };
}
