import type { OwinDB, Product } from '@/types/models';
import { getAllProductsRaw, bulkPut } from '@/features/products/productStore';
import { notifyProductsChanged } from '@/features/products/productEvents';
import { getImage, saveImage } from '@/utils/imageStorage';
import { downloadDB, downloadImage, uploadDB, uploadImage } from './driveSync';
import { mergeEntities, type Conflict } from './merge';

const SCHEMA_VERSION = 1;

export type TransferMode = 'push-other' | 'pull-other';

export interface TransferConflictContext {
  mode: TransferMode;
  token: string;
  local: Product[];
  remote: Product[];
}

export type TransferStatus =
  | {
      state: 'conflict';
      mode: TransferMode;
      conflicts: Conflict<Product>[];
      merged: Product[];
      context: TransferConflictContext;
    }
  | { state: 'empty-remote'; mode: 'pull-other' }
  | {
      state: 'done';
      mode: TransferMode;
      products: number;
      images: number;
      imageErrors: number;
    };

export async function beginPushToOtherAccount(token: string): Promise<TransferStatus> {
  return beginTransfer('push-other', token);
}

export async function beginPullFromOtherAccount(token: string): Promise<TransferStatus> {
  return beginTransfer('pull-other', token);
}

export async function finishTransfer(
  context: TransferConflictContext,
  finalProducts: Product[],
): Promise<TransferStatus> {
  if (context.mode === 'push-other') {
    const { count, errors } = await uploadLocalImages(finalProducts, context.local, context.token);
    await uploadDB(buildDB(finalProducts), context.token);
    return {
      state: 'done',
      mode: context.mode,
      products: finalProducts.length,
      images: count,
      imageErrors: errors,
    };
  }

  await bulkPut(finalProducts);
  const { count, errors } = await downloadRemoteImages(finalProducts, context.remote, context.token);
  notifyProductsChanged();
  return {
    state: 'done',
    mode: context.mode,
    products: finalProducts.length,
    images: count,
    imageErrors: errors,
  };
}

async function beginTransfer(mode: TransferMode, token: string): Promise<TransferStatus> {
  const local = await getAllProductsRaw();
  const remoteDB = await downloadDB(token);
  if (mode === 'pull-other' && !remoteDB) return { state: 'empty-remote', mode };

  const remote = remoteDB?.products ?? [];
  // Giao dịch giữa 2 tài khoản ĐỘC LẬP: KHÔNG dùng base của owner (vô nghĩa với tài
  // khoản kia, dễ nuốt thầm). base rỗng → mọi khác biệt cùng mã đều thành conflict cho
  // người chọn (đúng ý "gộp thông minh").
  const { merged, conflicts } = mergeEntities(local, remote, []);
  const context: TransferConflictContext = { mode, token, local, remote };

  if (conflicts.length > 0) {
    return { state: 'conflict', mode, conflicts, merged, context };
  }
  return finishTransfer(context, merged);
}

function buildDB(products: Product[]): OwinDB {
  return { schemaVersion: SCHEMA_VERSION, systems: [], products };
}

function collectImageIdsFromSource(finalProducts: Product[], sourceProducts: Product[]): string[] {
  const finalById = new Map(finalProducts.map((product) => [product.id, product]));
  const ids = new Set<string>();

  for (const source of sourceProducts) {
    const final = finalById.get(source.id);
    if (final === source && source.imageId) ids.add(source.imageId);
  }
  return [...ids];
}

async function uploadLocalImages(
  finalProducts: Product[],
  localProducts: Product[],
  token: string,
): Promise<{ count: number; errors: number }> {
  let count = 0;
  let errors = 0;
  for (const imageId of collectImageIdsFromSource(finalProducts, localProducts)) {
    try {
      const blob = await getImage(imageId);
      if (!blob) continue;
      await uploadImage(imageId, blob, token);
      count += 1;
    } catch {
      errors += 1;
    }
  }
  return { count, errors };
}

async function downloadRemoteImages(
  finalProducts: Product[],
  remoteProducts: Product[],
  token: string,
): Promise<{ count: number; errors: number }> {
  let count = 0;
  let errors = 0;
  for (const imageId of collectImageIdsFromSource(finalProducts, remoteProducts)) {
    try {
      const blob = await downloadImage(imageId, token);
      if (!blob) continue;
      await saveImage(imageId, blob);
      count += 1;
    } catch {
      errors += 1;
    }
  }
  return { count, errors };
}
