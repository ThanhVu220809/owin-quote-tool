import { useSyncExternalStore } from 'react';
import type { Product, ProductRecord } from '@/types/models';
import {
  seedIfEmpty,
  getAllProductsRaw,
  toLegacyProduct,
  saveProduct as saveProductStore,
  deleteProduct as deleteProductStore,
} from '@/features/products/productStore';
import { PRODUCTS_CHANGED_EVENT } from '@/features/products/productEvents';
import { subscribeToProducts } from '@/features/supabase/productsRepo';

interface ProductCacheSnapshot {
  products: Product[];
  productRecords: ProductRecord[];
  loading: boolean;
  error: string | null;
}

type SaveProductInput = Parameters<typeof saveProductStore>[0];
type SaveProductOptions = Parameters<typeof saveProductStore>[1];

const listeners = new Set<() => void>();
let snapshot: ProductCacheSnapshot = {
  products: [],
  productRecords: [],
  loading: true,
  error: null,
};
let hasLoaded = false;
let latestRequestId = 0;
let activeRefresh: Promise<void> | null = null;
let refreshAfterCurrent = false;
let scheduledRefresh: ReturnType<typeof setTimeout> | undefined;
let automaticRetryTimer: ReturnType<typeof setTimeout> | undefined;
let stopManagerTimer: ReturnType<typeof setTimeout> | undefined;
let managerStarted = false;
let unsubscribeRealtime: (() => void) | undefined;
let consecutiveFailures = 0;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Không thể tải dữ liệu sản phẩm từ Supabase.';
}

function publish(next: ProductCacheSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ProductCacheSnapshot {
  return snapshot;
}

async function loadProducts(requestId: number): Promise<void> {
  try {
    await seedIfEmpty();
    const raw = await getAllProductsRaw();
    if (requestId !== latestRequestId) return;

    const active = raw.filter((product) => !product.deleted && !product.deletedAt);
    consecutiveFailures = 0;
    if (automaticRetryTimer) {
      clearTimeout(automaticRetryTimer);
      automaticRetryTimer = undefined;
    }
    hasLoaded = true;
    publish({
      products: active.map(toLegacyProduct).sort((a, b) => a.ma.localeCompare(b.ma)),
      productRecords: active,
      loading: false,
      error: null,
    });
  } catch (error) {
    if (requestId !== latestRequestId) return;
    publish({
      ...snapshot,
      loading: false,
      error: errorMessage(error),
    });
    consecutiveFailures += 1;
    if (
      managerStarted
      && consecutiveFailures <= 3
      && !automaticRetryTimer
      && (typeof navigator === 'undefined' || navigator.onLine)
    ) {
      automaticRetryTimer = setTimeout(() => {
        automaticRetryTimer = undefined;
        if (managerStarted) void requestRefresh(true);
      }, 1_000 * (2 ** (consecutiveFailures - 1)));
    }
  }
}

function beginRefresh(): Promise<void> {
  const requestId = ++latestRequestId;
  if (!hasLoaded || snapshot.error) {
    publish({
      ...snapshot,
      loading: !hasLoaded,
      error: null,
    });
  }

  const operation = loadProducts(requestId).finally(() => {
    if (activeRefresh !== operation) return;
    activeRefresh = null;
    if (refreshAfterCurrent) {
      refreshAfterCurrent = false;
      activeRefresh = beginRefresh();
    }
  });
  activeRefresh = operation;
  return operation;
}

async function waitUntilRefreshesSettle(observed: Promise<void>): Promise<void> {
  await observed;
  const next = activeRefresh;
  if (next && next !== observed) await waitUntilRefreshesSettle(next);
}

/**
 * Share an in-flight read. Events that can make that read stale request exactly
 * one follow-up read, regardless of how many events arrive while it is running.
 */
function requestRefresh(queueAfterActive = false): Promise<void> {
  if (!activeRefresh) return beginRefresh();
  if (!queueAfterActive) return activeRefresh;
  refreshAfterCurrent = true;
  return waitUntilRefreshesSettle(activeRefresh);
}

function cancelScheduledRefresh(): void {
  if (!scheduledRefresh) return;
  clearTimeout(scheduledRefresh);
  scheduledRefresh = undefined;
}

function scheduleRefresh(): void {
  cancelScheduledRefresh();
  scheduledRefresh = setTimeout(() => {
    scheduledRefresh = undefined;
    void requestRefresh(true);
  }, 80);
}

function refreshWhenVisible(): void {
  if (document.visibilityState === 'visible') scheduleRefresh();
}

function startManager(): void {
  if (stopManagerTimer) {
    clearTimeout(stopManagerTimer);
    stopManagerTimer = undefined;
  }
  if (managerStarted) return;
  managerStarted = true;

  // A StrictMode remount can occur while the first read is still running.
  // Reuse it instead of scheduling a duplicate request.
  if (!activeRefresh) void requestRefresh();

  if (typeof window === 'undefined') return;
  window.addEventListener(PRODUCTS_CHANGED_EVENT, scheduleRefresh);
  window.addEventListener('online', scheduleRefresh);
  window.addEventListener('focus', scheduleRefresh);
  document.addEventListener('visibilitychange', refreshWhenVisible);

  unsubscribeRealtime = subscribeToProducts(scheduleRefresh, (status) => {
    if (status === 'SUBSCRIBED') {
      // Close both the initial REST/subscription race and any reconnect gap.
      scheduleRefresh();
    }
  });
}

function stopManager(): void {
  if (!managerStarted) return;
  managerStarted = false;
  cancelScheduledRefresh();
  if (automaticRetryTimer) {
    clearTimeout(automaticRetryTimer);
    automaticRetryTimer = undefined;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener(PRODUCTS_CHANGED_EVENT, scheduleRefresh);
    window.removeEventListener('online', scheduleRefresh);
    window.removeEventListener('focus', scheduleRefresh);
    document.removeEventListener('visibilitychange', refreshWhenVisible);
  }
  unsubscribeRealtime?.();
  unsubscribeRealtime = undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  startManager();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    // Keep the singleton alive across quick tab/view transitions, but clean it
    // up after logout or when no product screen is used for a while.
    stopManagerTimer = setTimeout(() => {
      stopManagerTimer = undefined;
      if (listeners.size === 0) stopManager();
    }, 10_000);
  };
}

async function refreshProductCache(): Promise<void> {
  consecutiveFailures = 0;
  cancelScheduledRefresh();
  await requestRefresh(true);
}

async function saveProduct(input: SaveProductInput, options?: SaveProductOptions) {
  const saved = await saveProductStore(input, options);
  await refreshProductCache();
  return saved;
}

async function deleteProduct(id: string): Promise<void> {
  await deleteProductStore(id);
  await refreshProductCache();
}

/** A single live product catalogue cache backed directly by Supabase. */
export function useProducts() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...state,
    refresh: refreshProductCache,
    retry: refreshProductCache,
    saveProduct,
    deleteProduct,
  };
}
