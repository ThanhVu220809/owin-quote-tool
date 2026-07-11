import type {
  AluminumCalculationRecord,
  OwinDB,
  ProductRecord,
  QuoteRecord,
  SuggestionRecord,
} from '@/types/models';
import { getAllProductsRaw, bulkPut, normalizeProductRecord } from '@/features/products/productStore';
import { bulkPutQuotes, getAllQuotesRaw } from '@/features/quote/quoteStore';
import { bulkPutSuggestions, getAllSuggestionRecords } from '@/lib/suggestions';
import {
  bulkPutAluminumCalculations,
  getAllAluminumCalculationsRaw,
  normalizeAluminumCalculationRecord,
} from '@/features/aluminum/aluminumEstimatorStorage';
import { notifyProductsChanged } from '@/features/products/productEvents';
import { downloadDB, uploadDB } from './driveSync';
import { mergeEntities, type Conflict } from './merge';
import { downloadReferencedImages, uploadReferencedImages } from './imageSync';

const SCHEMA_VERSION = 2;

export type TransferMode = 'push-other' | 'pull-other';

export interface TransferConflictContext {
  mode: TransferMode;
  token: string;
  local: ProductRecord[];
  remote: ProductRecord[];
  localQuotes: QuoteRecord[];
  remoteQuotes: QuoteRecord[];
  localSuggestions: SuggestionRecord[];
  remoteSuggestions: SuggestionRecord[];
  localAluminum: AluminumCalculationRecord[];
  remoteAluminum: AluminumCalculationRecord[];
}

export type TransferStatus =
  | {
      state: 'conflict';
      mode: TransferMode;
      conflicts: Conflict<ProductRecord>[];
      merged: ProductRecord[];
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
  finalProducts: ProductRecord[],
): Promise<TransferStatus> {
  if (context.mode === 'push-other') {
    const { count, errors } = await uploadReferencedImages(
      finalProducts,
      context.localQuotes,
      context.token,
    );
    await uploadDB(
      buildDB(finalProducts, context.localQuotes, context.localSuggestions, context.localAluminum),
      context.token,
    );
    return {
      state: 'done',
      mode: context.mode,
      products: finalProducts.length,
      images: count,
      imageErrors: errors,
    };
  }

  await bulkPut(finalProducts);
  await bulkPutQuotes(context.remoteQuotes);
  await bulkPutSuggestions(context.remoteSuggestions);
  await bulkPutAluminumCalculations(context.remoteAluminum);
  const { count, errors } = await downloadReferencedImages(
    finalProducts,
    context.remoteQuotes,
    context.token,
  );
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
  const localQuotes = await getAllQuotesRaw();
  const localSuggestions = await getAllSuggestionRecords();
  const localAluminum = await getAllAluminumCalculationsRaw();

  // "Đẩy kho" là publish/replace: kho trên máy này là nguồn chuẩn và ghi đè toàn bộ
  // tài khoản đích. Không tải rồi merge kho đích, vì khác biệt schema/sortOrder sau một
  // lần deploy sẽ biến mọi sản phẩm thành BR-8 dù tên và giá hoàn toàn giống nhau.
  if (mode === 'push-other') {
    const context: TransferConflictContext = {
      mode,
      token,
      local,
      remote: [],
      localQuotes,
      remoteQuotes: [],
      localSuggestions,
      remoteSuggestions: [],
      localAluminum,
      remoteAluminum: [],
    };
    return finishTransfer(context, local);
  }

  const remoteDB = await downloadDB(token);
  if (!remoteDB) return { state: 'empty-remote', mode };

  const remote = (remoteDB?.products ?? []).map((product, index) =>
    normalizeProductRecord(product, index + 1),
  );
  const remoteQuotes = remoteDB?.quotes ?? [];
  const remoteSuggestions = remoteDB?.suggestions ?? [];
  const remoteAluminum = normalizeRemoteAluminum(remoteDB?.aluminumCalculations);
  // "Lấy kho" vẫn gộp an toàn: hai tài khoản độc lập nên không có base chung; mọi
  // khác biệt thực cùng mã phải được người dùng chọn, tránh nuốt thay đổi local.
  const { merged, conflicts } = mergeEntities(local, remote, []);
  const context: TransferConflictContext = {
    mode,
    token,
    local,
    remote,
    localQuotes,
    remoteQuotes,
    localSuggestions,
    remoteSuggestions,
    localAluminum,
    remoteAluminum,
  };

  if (conflicts.length > 0) {
    return { state: 'conflict', mode, conflicts, merged, context };
  }
  return finishTransfer(context, merged);
}

function normalizeRemoteAluminum(records: unknown): AluminumCalculationRecord[] {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => normalizeAluminumCalculationRecord(record))
    .filter((record): record is AluminumCalculationRecord => record !== null);
}

function buildDB(
  products: ProductRecord[],
  quotes: QuoteRecord[],
  suggestions: SuggestionRecord[],
  aluminumCalculations: AluminumCalculationRecord[],
): OwinDB {
  return {
    schemaVersion: SCHEMA_VERSION,
    systems: [],
    products,
    quotes,
    suggestions,
    aluminumCalculations,
  };
}
