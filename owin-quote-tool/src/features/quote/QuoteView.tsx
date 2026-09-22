/* Existing effects intentionally reset local view state after async store updates. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccessoryInput,
  DimensionInput,
  QuoteExportRecord,
  QuoteInput,
  QuoteItemInput,
  QuoteRecord,
} from '@/types/models';
import { useProducts } from '@/features/products';
import { normalizeCategoryName } from '@/lib/products/categoryOrder';
import { useTransientMessage } from '@/lib/browser/useTransientMessage';
import { reorderList, useDragReorder } from '@/components/DragReorder';
import { calculateQuote } from '@/lib/quote/quoteCalculator';
import { generateQuoteCode } from '@/features/quote/quoteCode';
import { generateSnapshot } from '@/features/quote/quoteSnapshot';
import { createCustomQuoteItem, createQuoteItemFromProduct } from '@/features/quote/productToQuoteItem';
import { rememberQuoteSuggestions } from '@/features/suggestions/suggestionStore';
import { useSuggestions } from '@/features/suggestions/useSuggestions';
import {
  sortQuoteItemsByMaxLineAmount,
  sortQuoteItemsWithKeys,
  sumItemDimensionQuantity,
} from '@/features/quote/quoteItemOrder';
import {
  buildAccessoryPackageCatalog,
  findOrphanAccessoryNames,
} from '@/lib/quote/accessoryPackages';
import { deleteQuote, getAllQuotes, saveQuoteRecord } from '@/features/quote/quoteStore';
import { operationError, todayInputValue } from '@/features/quote/quoteFormat';
import { QUOTE_SUGGESTION_TYPES } from '@/features/quote/quoteSuggestionFields';
import {
  changedQuoteSaveInput,
  cleanItemAccessoriesForPersist,
  confirmNormalizeItem,
  makeItemCode,
  makeItemUiKey,
  snapshotToInputs,
  withSyncedPackageQuantity,
} from '@/features/quote/quoteDraft';
import type { SaveUiState } from '@/features/quote/QuoteFormPrimitives';
import { useQuoteHistory } from '@/features/quote/useQuoteHistory';
import { QuoteListPanel } from '@/features/quote/QuoteListPanel';
import { QuoteDetailPanel } from '@/features/quote/QuoteDetailPanel';
import { QuoteFormHeader } from '@/features/quote/QuoteFormHeader';
import { QuoteFormTopGrid, QuoteTotalsCard } from '@/features/quote/QuoteFormTopGrid';
import { QuoteAddProductsCard, QuoteItemList } from '@/features/quote/QuoteItemList';
import { QuotePrintDocument } from '@/features/quote/QuotePrintDocument';
import { QuoteProductPicker } from '@/features/quote/QuoteProductPicker';
import { fetchVietnamAddresses, type VietnamProvince } from '@/features/quote/vietnamAddressApi';
import './quote.css';

interface DraftIdentity {
  generation: number;
  id: string;
  code: string;
}

interface PersistQuoteOptions {
  code?: string;
  exportFileName?: string;
  exportType?: QuoteExportRecord['type'];
  learnSuggestions?: boolean;
  quiet?: boolean;
  successMessage?: string;
}

type PersistQuote = (
  nextStatus?: 'DRAFT' | 'SAVED' | 'EXPORTED',
  options?: PersistQuoteOptions,
) => Promise<QuoteRecord>;

/** The app body is its own scroll container (#tool-main) — the window never scrolls. */
function scrollPageTop() {
  window.requestAnimationFrame(() => {
    const scroller = document.getElementById('tool-main');
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function formatVietnamAddress(street: string, ward: string, province: string): string {
  return [street.trim(), ward.trim(), province.trim()].filter(Boolean).join(', ');
}

export function QuoteView() {
  const { productRecords, loading } = useProducts();
  const { suggestions: seededSuggestions, refreshSuggestions } = useSuggestions(QUOTE_SUGGESTION_TYPES);
  const packageCatalog = useMemo(
    () => buildAccessoryPackageCatalog(productRecords),
    [productRecords],
  );
  const orphanAccessoryNames = useMemo(
    () => findOrphanAccessoryNames(productRecords, packageCatalog),
    [productRecords, packageCatalog],
  );
  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  const [detailQuote, setDetailQuote] = useState<QuoteRecord | null>(null);
  const [quoteSearch, setQuoteSearch] = useState('');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<QuoteRecord['status'] | ''>('');
  const {
    history,
    filteredHistory,
    historyLoading,
    historyError,
    refreshHistory,
    setHistoryLoading,
    setHistoryError,
  } = useQuoteHistory(quoteSearch, quoteStatusFilter);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteCode, setQuoteCode] = useState<string>('');
  const [status, setStatus] = useState<'DRAFT' | 'SAVED' | 'EXPORTED'>('DRAFT');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerStreet, setCustomerStreet] = useState('');
  const [customerProvinceCode, setCustomerProvinceCode] = useState('');
  const [customerWardCode, setCustomerWardCode] = useState('');
  const [addressProvinces, setAddressProvinces] = useState<VietnamProvince[]>([]);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressError, setAddressError] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayInputValue());
  const [depositVnd, setDepositVnd] = useState(0);
  const [items, setItems] = useState<QuoteItemInput[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  // Tab lọc ngang hạng mục theo loại cửa ('all' = tất cả).
  const [itemCategoryFilter, setItemCategoryFilter] = useState('all');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [message, setMessage] = useTransientMessage();
  const [saving, setSaving] = useState(false);
  const [saveUiState, setSaveUiState] = useState<SaveUiState>('idle');
  const [saveError, setSaveError] = useState('');
  const draftIdentityRef = useRef<DraftIdentity | null>(null);
  const formGenerationRef = useRef(0);
  const suppressNextAutosaveRef = useRef(false);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const acknowledgedQuoteRef = useRef<QuoteRecord | null>(null);
  const acknowledgedFormRef = useRef<QuoteInput | null>(null);
  const currentSignatureRef = useRef('');
  const currentHasItemsRef = useRef(false);
  const persistQuoteRef = useRef<PersistQuote | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const followupAutosaveTimerRef = useRef<number | null>(null);
  const retrySaveRef = useRef<{
    status: 'DRAFT' | 'SAVED' | 'EXPORTED';
    options: PersistQuoteOptions;
  } | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const busyCountRef = useRef(0);
  /** Stable UI keys parallel to items — used for expand/collapse without data loss. */
  const [itemUiKeys, setItemUiKeys] = useState<string[]>([]);
  /** Expanded (editing) item keys. Missing key = locked compact card. */
  const [expandedItemKeys, setExpandedItemKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setAddressLoading(true);
    setAddressError('');
    void fetchVietnamAddresses()
      .then((provinces) => {
        if (cancelled) return;
        setAddressProvinces(provinces);
        setAddressLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setAddressLoading(false);
        setAddressError(error instanceof Error ? error.message : 'Không tải được dữ liệu địa chỉ.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const beginBusy = () => {
    busyCountRef.current += 1;
    setSaving(true);
  };

  const endBusy = () => {
    busyCountRef.current = Math.max(0, busyCountRef.current - 1);
    if (busyCountRef.current === 0) setSaving(false);
  };

  const cancelPendingAutosave = () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (followupAutosaveTimerRef.current !== null) {
      window.clearTimeout(followupAutosaveTimerRef.current);
      followupAutosaveTimerRef.current = null;
    }
  };


  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          productRecords
            .map((product) => normalizeCategoryName(product.category))
            .filter(Boolean),
        ),
      ).sort(),
    [productRecords],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productRecords.filter((product) => {
      const categoryOk =
        !categoryFilter || normalizeCategoryName(product.category) === categoryFilter;
      const text = `${product.code} ${product.name} ${product.category}`.toLowerCase();
      return categoryOk && (!q || text.includes(q));
    });
  }, [categoryFilter, productRecords, search]);

  const selectedProvince = addressProvinces.find((province) => String(province.code) === customerProvinceCode);
  const selectedWard = selectedProvince?.wards.find((ward) => String(ward.code) === customerWardCode);
  const handleCustomerStreet = (value: string) => {
    setCustomerStreet(value);
    setCustomerAddress(formatVietnamAddress(value, selectedWard?.name || '', selectedProvince?.name || ''));
  };
  const handleCustomerProvince = (value: string) => {
    const province = addressProvinces.find((candidate) => String(candidate.code) === value);
    setCustomerProvinceCode(value);
    setCustomerWardCode('');
    setCustomerAddress(formatVietnamAddress(customerStreet, '', province?.name || ''));
  };
  const handleCustomerWard = (value: string) => {
    const ward = selectedProvince?.wards.find((candidate) => String(candidate.code) === value);
    setCustomerWardCode(value);
    setCustomerAddress(formatVietnamAddress(customerStreet, ward?.name || '', selectedProvince?.name || ''));
  };


  const quoteInput: QuoteInput = useMemo(
    () => ({
      customerId: null,
      customerName,
      customerPhone,
      customerEmail: customerEmail || null,
      customerAddress,
      quoteDate,
      depositVnd,
      items: items.map(cleanItemAccessoriesForPersist),
    }),
    [customerAddress, customerEmail, customerName, customerPhone, depositVnd, items, quoteDate],
  );
  const calculated = useMemo(() => calculateQuote(quoteInput), [quoteInput]);
  const autosaveSignature = useMemo(() => JSON.stringify(quoteInput), [quoteInput]);

  const resetForm = () => {
    cancelPendingAutosave();
    formGenerationRef.current += 1;
    draftIdentityRef.current = null;
    acknowledgedQuoteRef.current = null;
    acknowledgedFormRef.current = null;
    suppressNextAutosaveRef.current = false;
    lastSavedSignatureRef.current = null;
    retrySaveRef.current = null;
    setQuoteId(null);
    setQuoteCode('');
    setStatus('DRAFT');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerAddress('');
    setCustomerStreet('');
    setCustomerProvinceCode('');
    setCustomerWardCode('');
    setQuoteDate(todayInputValue());
    setDepositVnd(0);
    setItems([]);
    setItemUiKeys([]);
    setExpandedItemKeys(new Set());
    setMessage('');
    setSaveError('');
    setSaveUiState('idle');
  };

  const openNewQuote = () => {
    resetForm();
    setView('form');
    setDetailQuote(null);
    scrollPageTop();
  };

  const appendItem = (item: QuoteItemInput, options?: { expand?: boolean }) => {
    const key = makeItemUiKey();
    // SL bộ PK = tổng SL hạng mục; xếp theo max thành tiền dòng KT.
    const seeded = withSyncedPackageQuantity(item);
    const sorted = sortQuoteItemsWithKeys([...items, seeded], [...itemUiKeys, key]);
    setItems(sorted.items);
    setItemUiKeys(sorted.keys);
    if (options?.expand !== false) {
      setExpandedItemKeys((current) => new Set(current).add(key));
    }
  };

  const addProduct = (productId: string) => {
    const product = productRecords.find((item) => item.id === productId);
    if (!product) return;
    appendItem(createQuoteItemFromProduct(product, makeItemCode(items.length)), { expand: true });
    setProductPickerOpen(false);
  };

  const addCustom = () =>
    appendItem(createCustomQuoteItem(makeItemCode(items.length)), { expand: true });

  const updateItem = (index: number, patch: Partial<QuoteItemInput>) => {
    const affectsMoney =
      patch.dimensions !== undefined ||
      patch.unitPriceVnd !== undefined ||
      patch.unit !== undefined;
    const nextItems = items.map((item, i) => {
      if (i !== index) return item;
      let merged: QuoteItemInput = { ...item, ...patch };
      if (patch.dimensions) {
        const prevSl = sumItemDimensionQuantity(item);
        merged = { ...merged, dimensions: patch.dimensions };
        const nextSl = sumItemDimensionQuantity(merged);
        // Chỉ force (xoá manual + auto lại) khi tổng SL cửa đổi — đổi KT không đụng SL tay.
        merged = withSyncedPackageQuantity(merged, prevSl !== nextSl ? 'force' : 'auto');
      }
      return merged;
    });
    if (affectsMoney) {
      const sorted = sortQuoteItemsWithKeys(nextItems, itemUiKeys);
      setItems(sorted.items);
      setItemUiKeys(sorted.keys);
      return;
    }
    setItems(nextItems);
  };

  /** Collapse an item to its compact card. Silently tidies blank rows — no confirm prompt. */
  const collapseItem = (index: number) => {
    const key = itemUiKeys[index];
    setItems((current) =>
      current.map((item, i) => (i === index ? confirmNormalizeItem(item) : item)),
    );
    if (key) {
      setExpandedItemKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const expandItem = (index: number) => {
    const key = itemUiKeys[index];
    if (!key) return;
    setExpandedItemKeys((current) => new Set(current).add(key));
  };

  const removeItemAt = (index: number) => {
    const key = itemUiKeys[index];
    setItems((current) => current.filter((_, i) => i !== index));
    setItemUiKeys((current) => current.filter((_, i) => i !== index));
    if (key) {
      setExpandedItemKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  /** Drag-to-reorder items — moves the row and its parallel UI key together. */
  const reorderItems = (from: number, to: number) => {
    setItems((current) => reorderList(current, from, to));
    setItemUiKeys((current) => reorderList(current, from, to));
  };
  const itemDrag = useDragReorder(reorderItems);

  const duplicateItemAt = (index: number) => {
    const source = items[index];
    if (!source) return;
    const key = makeItemUiKey();
    const code = makeItemCode(items.length);
    const clone: QuoteItemInput = withSyncedPackageQuantity({
      ...confirmNormalizeItem(source),
      productCode: code,
      quoteItemCode: code,
    });
    const nextItems = [...items.slice(0, index + 1), clone, ...items.slice(index + 1)];
    const nextKeys = [...itemUiKeys.slice(0, index + 1), key, ...itemUiKeys.slice(index + 1)];
    const sorted = sortQuoteItemsWithKeys(nextItems, nextKeys);
    setItems(sorted.items);
    setItemUiKeys(sorted.keys);
    setExpandedItemKeys((current) => new Set(current).add(key));
  };

  const updateDimension = (itemIndex: number, lineIndex: number, patch: Partial<DimensionInput>) => {
    const nextItems = items.map((item, i) => {
      if (i !== itemIndex) return item;
      const prevSl = sumItemDimensionQuantity(item);
      const dimensions = item.dimensions.map((line, j) => (j === lineIndex ? { ...line, ...patch } : line));
      const next = { ...item, dimensions };
      const nextSl = sumItemDimensionQuantity(next);
      return withSyncedPackageQuantity(next, prevSl !== nextSl ? 'force' : 'auto');
    });
    const sorted = sortQuoteItemsWithKeys(nextItems, itemUiKeys);
    setItems(sorted.items);
    setItemUiKeys(sorted.keys);
  };

  const updateAccessory = (itemIndex: number, accIndex: number, patch: Partial<AccessoryInput>) =>
    setItems((current) =>
      current.map((item, i) =>
        i === itemIndex
          ? {
              ...item,
              accessories: item.accessories.map((acc, j) => (j === accIndex ? { ...acc, ...patch } : acc)),
            }
          : item,
      ),
    );

  const ensureDraftIdentity = (preferredCode?: string): DraftIdentity => {
    const generation = formGenerationRef.current;
    const current = draftIdentityRef.current;
    if (current?.generation === generation) {
      if (!preferredCode || preferredCode === current.code) return current;
      const updated = { ...current, code: preferredCode };
      draftIdentityRef.current = updated;
      return updated;
    }
    const identity: DraftIdentity = {
      generation,
      id: quoteId || crypto.randomUUID(),
      code: preferredCode || quoteCode || generateQuoteCode(history),
    };
    draftIdentityRef.current = identity;
    return identity;
  };

  const showOperationError = (prefix: string, error: unknown) => {
    const text = operationError(prefix, error);
    setSaveUiState('error');
    setSaveError(text);
    setMessage(text);
  };

  const persistQuote: PersistQuote = (
    nextStatus = 'SAVED',
    options = {},
  ) => {
    if (!options.quiet) cancelPendingAutosave();
    const identity = ensureDraftIdentity(options.code);
    const generation = identity.generation;
    const inputSignature = autosaveSignature;
    const retryRequest = { status: nextStatus, options };
    if (formGenerationRef.current === generation) retrySaveRef.current = retryRequest;
    beginBusy();
    if (formGenerationRef.current === generation) {
      setSaveUiState('saving');
      setSaveError('');
      if (!options.quiet) setMessage('');
    }

    const run = async (): Promise<QuoteRecord> => {
      try {
        const existing = await getAllQuotes();
        const existingRecord = existing.find((quote) => quote.id === identity.id) ?? null;
        const snapshot = generateSnapshot(
          { ...calculated, quoteCode: identity.code },
          identity.code,
          new Date(),
        );
        const candidate: Partial<QuoteRecord> = {
          id: identity.id,
          code: identity.code,
          customerId: null,
          customerName,
          customerPhone,
          customerEmail: customerEmail || null,
          customerAddress,
          quoteDate,
          depositVnd: calculated.summary.depositVnd,
          subtotalProductVnd: calculated.summary.subtotalProductVnd,
          subtotalAccessoryVnd: calculated.summary.subtotalAccessoryVnd,
          totalVnd: calculated.summary.totalVnd,
          roundedTotalVnd: calculated.summary.roundedTotalVnd,
          balanceVnd: calculated.summary.balanceVnd,
          status: nextStatus,
          snapshot,
          snapshotJson: JSON.stringify(snapshot),
          items: calculated.items.map((item, index) => ({
            id: `${item.quoteItemCode}-${index}`,
            sourceType: item.sourceType,
            productId: item.productId || null,
            sourceProductId: item.sourceProductId || item.productId || null,
            productCode: item.quoteItemCode || item.productCode,
            itemName: item.itemName,
            category: item.category || null,
            imagePath: item.image || item.coverImagePath || null,
            imageReference: item.imageReference || item.coverImagePath || item.image || null,
            imageOverridePath: item.imageOverridePath || null,
            unit: item.unit,
            description: item.description || null,
            unitPriceVnd: item.unitPriceVnd,
            productSubtotalVnd: item.productSubtotalVnd,
            accessorySubtotalVnd: item.accessorySubtotalVnd,
            itemTotalVnd: item.itemTotalVnd,
            fixedAccessoryPackage: item.fixedAccessoryPackage || null,
            extraAccessories: item.extraAccessories || null,
            snapshotJson: JSON.stringify(item),
            dimensions: item.dimensions.map((line, sortOrder) => ({
              unit: line.unit,
              widthM: line.widthM ?? 0,
              heightM: line.heightM ?? 0,
              quantity: line.quantity,
              calculatedQty: line.calculatedQty,
              unitPriceVnd: line.unitPriceVnd,
              lineTotalVnd: line.lineTotalVnd,
              description: line.description || null,
              sortOrder,
            })),
            accessories: item.accessories.map((accessory, sortOrder) => ({
              name: accessory.name,
              quantityPerSet: accessory.quantityPerSet,
              totalSet: accessory.totalSet,
              unitPriceVnd: accessory.unitPriceVnd,
              lineTotalVnd: accessory.lineTotalVnd,
              note: accessory.note || null,
              sortOrder,
            })),
            sortOrder: index,
          })),
          exports: options.exportFileName
            ? [
                ...(existingRecord?.exports ?? []),
                {
                  id: crypto.randomUUID(),
                  type: options.exportType ?? 'docx',
                  fileName: options.exportFileName,
                  filePath: null,
                  createdAt: new Date().toISOString(),
                },
              ]
            : existingRecord?.exports ?? [],
          folderPath: null,
          deletedAt: null,
        };
        const saveInput = changedQuoteSaveInput(
          acknowledgedFormRef.current,
          quoteInput,
          candidate,
          Boolean(options.exportFileName),
        );
        const saved = await saveQuoteRecord(saveInput, {
          baseRecord: acknowledgedQuoteRef.current,
        });

        if (formGenerationRef.current === generation) {
          acknowledgedQuoteRef.current = saved;
          acknowledgedFormRef.current = quoteInput;
          const isLatestInput = currentSignatureRef.current === inputSignature;
          setQuoteId(saved.id);
          setQuoteCode(saved.code);
          setStatus(saved.status);
          setSaveError('');
          if (retrySaveRef.current === retryRequest) retrySaveRef.current = null;
          if (isLatestInput) {
            lastSavedSignatureRef.current = inputSignature;
            setSaveUiState('saved');
            if (!options.quiet) {
              setMessage(options.successMessage || `Đã lưu ${saved.code} lên Supabase`);
            }
          } else {
            // Có chỉnh sửa trong lúc đang lưu — chờ user bấm Lưu lại (không auto).
            setSaveUiState('pending');
          }
        }

        if (options.learnSuggestions !== false) {
          try {
            await rememberQuoteSuggestions(quoteInput);
            if (formGenerationRef.current === generation) await refreshSuggestions();
          } catch {
            // Suggestions are secondary metadata; the quote itself is already safely saved.
          }
        }
        try {
          await refreshHistory();
        } catch {
          // Realtime will refresh the list again; never report a completed save as failed.
        }
        return saved;
      } catch (error) {
        if (formGenerationRef.current === generation) {
          const text = operationError('Không thể lưu lên Supabase', error);
          setSaveUiState('error');
          setSaveError(text);
          if (!options.quiet) setMessage(text);
        }
        throw error;
      } finally {
        endBusy();
      }
    };

    const queued = saveQueueRef.current.then(run, run);
    saveQueueRef.current = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  };

  useEffect(() => {
    persistQuoteRef.current = persistQuote;
  });

  // Chỉ đánh dấu dirty / saved — KHÔNG tự ghi Supabase (user bấm "Lưu báo giá").
  useEffect(() => {
    currentSignatureRef.current = autosaveSignature;
    currentHasItemsRef.current = items.length > 0;
    if (view !== 'form' || items.length === 0) {
      if (view === 'form') {
        if (suppressNextAutosaveRef.current) {
          suppressNextAutosaveRef.current = false;
          lastSavedSignatureRef.current = autosaveSignature;
        }
        setSaveUiState('idle');
      }
      return;
    }
    if (suppressNextAutosaveRef.current) {
      suppressNextAutosaveRef.current = false;
      lastSavedSignatureRef.current = autosaveSignature;
      setSaveUiState('saved');
      setSaveError('');
      return;
    }
    if (lastSavedSignatureRef.current === autosaveSignature) {
      setSaveUiState((current) => (current === 'error' || current === 'saving' ? current : 'saved'));
      return;
    }
    setSaveUiState((current) => (current === 'saving' ? current : 'pending'));
    setSaveError('');
  }, [autosaveSignature, items.length, view]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (view !== 'form' || items.length === 0) return;
      if (lastSavedSignatureRef.current === currentSignatureRef.current && busyCountRef.current === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [items.length, view]);

  const retryLastSave = () => {
    const retry = retrySaveRef.current ?? {
      status: 'SAVED' as const,
      options: { learnSuggestions: true, quiet: false },
    };
    void persistQuoteRef.current?.(retry.status, retry.options).catch(() => undefined);
  };

  const saveManually = async () => {
    if (items.length === 0) return;
    try {
      await persistQuote('SAVED', { learnSuggestions: true });
    } catch {
      // persistQuote renders an actionable error and keeps the draft ready for retry.
    }
  };

  /** Rời form: không auto-save — hỏi nếu còn thay đổi chưa lưu. */
  const confirmLeaveIfDirty = (): boolean => {
    cancelPendingAutosave();
    if (items.length === 0 || lastSavedSignatureRef.current === currentSignatureRef.current) {
      return true;
    }
    return window.confirm('Có thay đổi chưa lưu. Thoát mà không lưu?');
  };

  const backToQuoteList = () => {
    if (confirmLeaveIfDirty()) setView('list');
  };

  const startNewQuote = () => {
    if (confirmLeaveIfDirty()) openNewQuote();
  };

  // In/Xuất KHÔNG lưu dữ liệu — chỉ tạo file. Lưu bằng nút «Lưu báo giá».
  const exportWord = async () => {
    if (items.length === 0) return;
    beginBusy();
    setMessage('');
    setSaveError('');
    try {
      const { code } = ensureDraftIdentity();
      const { exportQuoteWord } = await import('@/features/export/wordExport');
      await exportQuoteWord({ ...calculated, quoteCode: code }, code, productRecords);
      setMessage(`Đã xuất Word ${code}`);
    } catch (error) {
      showOperationError('Không thể hoàn tất xuất Word', error);
    } finally {
      endBusy();
    }
  };

  const exportExcel = async () => {
    if (items.length === 0) return;
    beginBusy();
    setMessage('');
    setSaveError('');
    try {
      const { code } = ensureDraftIdentity();
      const { exportQuoteExcel } = await import('@/features/export/quoteExcelExport');
      await exportQuoteExcel({ ...calculated, quoteCode: code }, code, productRecords);
      setMessage(`Đã xuất Excel ${code}`);
    } catch (error) {
      showOperationError('Không thể hoàn tất xuất Excel', error);
    } finally {
      endBusy();
    }
  };

  const exportPdf = async () => {
    if (items.length === 0) return;
    beginBusy();
    setMessage('');
    setSaveError('');
    try {
      const { code } = ensureDraftIdentity();
      const { exportQuotePdf } = await import('@/features/export/quotePdfExport');
      await exportQuotePdf({ ...calculated, quoteCode: code }, code, productRecords);
      setMessage(`Đã xuất PDF ${code}`);
    } catch (error) {
      showOperationError('Không thể hoàn tất xuất PDF', error);
    } finally {
      endBusy();
    }
  };

  const recordSavedQuoteExport = async (
    quote: QuoteRecord,
    type: QuoteExportRecord['type'],
    fileName: string,
  ): Promise<QuoteRecord> => {
    const latest = (await getAllQuotes()).find((item) => item.id === quote.id) ?? quote;
    return saveQuoteRecord({
      ...latest,
      status: 'EXPORTED',
      exports: [
        ...(latest.exports ?? []),
        {
          id: crypto.randomUUID(),
          type,
          fileName,
          filePath: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  };

  const exportSavedQuote = async (quote: QuoteRecord) => {
    beginBusy();
    setMessage('');
    setSaveError('');
    try {
      const { exportQuoteWord } = await import('@/features/export/wordExport');
      const fileName = await exportQuoteWord(quote.snapshot, quote.code, productRecords);
      const saved = await recordSavedQuoteExport(quote, 'docx', fileName);
      if (detailQuote?.id === saved.id) setDetailQuote(saved);
      setMessage(`Đã xuất Word và ghi lịch sử ${quote.code}`);
      try { await refreshHistory(); } catch { /* Realtime retries list refresh. */ }
    } catch (error) {
      showOperationError('Không thể hoàn tất xuất Word', error);
    } finally {
      endBusy();
    }
  };

  const exportSavedQuoteExcel = async (quote: QuoteRecord) => {
    beginBusy();
    setMessage('');
    setSaveError('');
    try {
      const { exportQuoteExcel } = await import('@/features/export/quoteExcelExport');
      const fileName = await exportQuoteExcel(quote.snapshot, quote.code, productRecords);
      const saved = await recordSavedQuoteExport(quote, 'xlsx', fileName);
      if (detailQuote?.id === saved.id) setDetailQuote(saved);
      setMessage(`Đã xuất Excel và ghi lịch sử ${quote.code}`);
      try { await refreshHistory(); } catch { /* Realtime retries list refresh. */ }
    } catch (error) {
      showOperationError('Không thể hoàn tất xuất Excel', error);
    } finally {
      endBusy();
    }
  };

  const exportSavedQuotePdf = async (quote: QuoteRecord) => {
    beginBusy();
    setMessage('');
    setSaveError('');
    try {
      const { exportQuotePdf } = await import('@/features/export/quotePdfExport');
      const fileName = await exportQuotePdf(quote.snapshot, quote.code, productRecords);
      const saved = await recordSavedQuoteExport(quote, 'pdf', fileName);
      if (detailQuote?.id === saved.id) setDetailQuote(saved);
      setMessage(`Đã xuất PDF và ghi lịch sử ${quote.code}`);
      try { await refreshHistory(); } catch { /* Realtime retries list refresh. */ }
    } catch (error) {
      showOperationError('Không thể hoàn tất xuất PDF', error);
    } finally {
      endBusy();
    }
  };

  const deleteSavedQuote = async (quote: QuoteRecord) => {
    if (!window.confirm(`Xoá báo giá "${quote.code}"?`)) return;
    beginBusy();
    setSaveError('');
    try {
      await deleteQuote(quote.id);
      if (quoteId === quote.id) resetForm();
      if (detailQuote?.id === quote.id) setDetailQuote(null);
      setView('list');
      await refreshHistory();
      setMessage(`Đã xoá ${quote.code}`);
    } catch (error) {
      showOperationError('Không thể xoá báo giá', error);
    } finally {
      endBusy();
    }
  };

  const loadQuote = (quote: QuoteRecord, duplicate = false) => {
    cancelPendingAutosave();
    formGenerationRef.current += 1;
    draftIdentityRef.current = duplicate
      ? null
      : { generation: formGenerationRef.current, id: quote.id, code: quote.code };
    suppressNextAutosaveRef.current = !duplicate;
    lastSavedSignatureRef.current = null;
    setSaveError('');
    setSaveUiState(duplicate ? 'pending' : 'saved');
    setQuoteId(duplicate ? null : quote.id);
    setQuoteCode(duplicate ? '' : quote.code);
    setStatus(duplicate ? 'DRAFT' : quote.status);
    setCustomerName(quote.customerName);
    setCustomerPhone(quote.customerPhone);
    setCustomerEmail(quote.customerEmail || '');
    setCustomerAddress(quote.customerAddress);
    setCustomerStreet(quote.customerAddress);
    setCustomerProvinceCode('');
    setCustomerWardCode('');
    setQuoteDate((quote.quoteDate || quote.createdAt).slice(0, 10));
    setDepositVnd(quote.depositVnd);
    const loaded = sortQuoteItemsByMaxLineAmount(
      snapshotToInputs(quote).map((item) =>
        withSyncedPackageQuantity(confirmNormalizeItem(item), 'auto'),
      ),
    );
    acknowledgedQuoteRef.current = duplicate ? null : quote;
    acknowledgedFormRef.current = duplicate
      ? null
      : {
          customerId: null,
          customerName: quote.customerName,
          customerPhone: quote.customerPhone,
          customerEmail: quote.customerEmail || null,
          customerAddress: quote.customerAddress,
          quoteDate: (quote.quoteDate || quote.createdAt).slice(0, 10),
          depositVnd: quote.depositVnd,
          items: loaded.map(cleanItemAccessoriesForPersist),
        };
    setItems(loaded);
    // Loaded items start locked (compact). User taps Sửa/Mở rộng to edit.
    setItemUiKeys(loaded.map(() => makeItemUiKey()));
    setExpandedItemKeys(new Set());
    setMessage(duplicate ? `Đã nhân bản từ ${quote.code}` : `Đã tải ${quote.code}`);
    setView('form');
    setDetailQuote(null);
    scrollPageTop();
  };

  const openDetail = (quote: QuoteRecord) => {
    setMessage('');
    setSaveError('');
    setDetailQuote(quote);
    setView('detail');
    scrollPageTop();
  };

  if (view === 'list') {
    return (
      <QuoteListPanel
        history={history}
        filteredHistory={filteredHistory}
        quoteSearch={quoteSearch}
        quoteStatusFilter={quoteStatusFilter}
        message={message}
        loading={historyLoading}
        error={historyError}
        onSearch={setQuoteSearch}
        onStatusFilter={setQuoteStatusFilter}
        onCreate={openNewQuote}
        onView={openDetail}
        onEdit={loadQuote}
        onDuplicate={(quote) => loadQuote(quote, true)}
        onDelete={(quote) => void deleteSavedQuote(quote)}
        onRetry={() => {
          setHistoryError('');
          setHistoryLoading(true);
          void refreshHistory()
            .then(() => setHistoryLoading(false))
            .catch((error) => {
              setHistoryLoading(false);
              setHistoryError(operationError('Không thể tải danh sách báo giá từ Supabase', error));
            });
        }}
      />
    );
  }

  if (view === 'detail' && detailQuote) {
    return (
      <QuoteDetailPanel
        quote={detailQuote}
        products={productRecords}
        saving={saving}
        message={message}
        error={saveError}
        onBack={() => setView('list')}
        onEdit={() => loadQuote(detailQuote)}
        onDuplicate={() => loadQuote(detailQuote, true)}
        onDelete={() => void deleteSavedQuote(detailQuote)}
        onExport={() => void exportSavedQuote(detailQuote)}
        onExportExcel={() => void exportSavedQuoteExcel(detailQuote)}
        onExportPdf={() => void exportSavedQuotePdf(detailQuote)}
      />
    );
  }

  return (
    <section className="admin-page quote-workflow-page">
      <QuoteFormHeader
        quoteId={quoteId}
        loading={loading}
        productCount={productRecords.length}
        historyCount={history.length}
        itemCount={items.length}
        saving={saving}
        onBack={backToQuoteList}
        onNew={startNewQuote}
        onSave={() => void saveManually()}
        onExportWord={() => void exportWord()}
        onExportExcel={() => void exportExcel()}
        onExportPdf={() => void exportPdf()}
      />

      <div className="quote-intro-grid">
        <QuoteFormTopGrid
          customerName={customerName}
          customerPhone={customerPhone}
          customerEmail={customerEmail}
          customerStreet={customerStreet}
          customerProvinceCode={customerProvinceCode}
          customerWardCode={customerWardCode}
          addressProvinces={addressProvinces}
          addressLoading={addressLoading}
          addressError={addressError}
          quoteDate={quoteDate}
          depositVnd={depositVnd}
          quoteCode={quoteCode}
          status={status}
          suggestions={seededSuggestions}
          saveUiState={saveUiState}
          saveError={saveError}
          message={message}
          onCustomerName={setCustomerName}
          onCustomerPhone={setCustomerPhone}
          onCustomerEmail={setCustomerEmail}
          onCustomerStreet={handleCustomerStreet}
          onCustomerProvince={handleCustomerProvince}
          onCustomerWard={handleCustomerWard}
          onQuoteDate={setQuoteDate}
          onDeposit={setDepositVnd}
          onRetrySave={retryLastSave}
        />
        <div className="quote-intro-side">
          <QuoteAddProductsCard onOpenPicker={() => setProductPickerOpen(true)} onAddCustom={addCustom} />
          <QuoteTotalsCard summary={calculated.summary} />
        </div>
      </div>

      <QuoteItemList
        items={items}
        itemUiKeys={itemUiKeys}
        expandedItemKeys={expandedItemKeys}
        itemCategoryFilter={itemCategoryFilter}
        products={productRecords}
        calculated={calculated}
        suggestions={seededSuggestions}
        packageCatalog={packageCatalog}
        orphanAccessoryNames={orphanAccessoryNames}
        itemDrag={itemDrag}
        onItemCategoryFilter={setItemCategoryFilter}
        onUpdateItem={updateItem}
        onDimension={updateDimension}
        onAccessory={updateAccessory}
        onCollapse={collapseItem}
        onExpand={expandItem}
        onDuplicate={duplicateItemAt}
        onDelete={removeItemAt}
      />

      <QuotePrintDocument quote={calculated} products={productRecords} />
      <QuoteProductPicker
        isOpen={productPickerOpen}
        search={search}
        categoryFilter={categoryFilter}
        categories={categories}
        filteredProducts={filteredProducts}
        productCount={productRecords.length}
        onSearch={setSearch}
        onCategoryFilter={setCategoryFilter}
        onSelect={(productId) => addProduct(productId)}
        onClose={() => setProductPickerOpen(false)}
      />
    </section>
  );
}
