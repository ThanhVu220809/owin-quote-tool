/* Existing effects intentionally reset local view state after async store updates. */
/* eslint-disable react-hooks/set-state-in-effect, no-useless-assignment */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Eye, FileDown, FileUp, ImagePlus, LoaderCircle, Package, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import type {
  AccessoryInput,
  DimensionInput,
  ProductRecord,
  ProductUnit,
  QuoteExportRecord,
  QuoteInput,
  QuoteItemInput,
  QuoteRecord,
} from '@/types/models';
import { useProducts } from '@/features/products/useProducts';
import { formatVND } from '@/utils/format';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { DragHandle, reorderList, useDragReorder } from '@/components/DragReorder';
import { ExtraAccessoriesEditor, FixedAccessoryPackageEditor } from '@/components/AccessoryEditors';
import { calculateQuote } from '@/lib/quote/quoteCalculator';
import { generateQuoteCode } from '@/lib/quote/quoteCode';
import { generateSnapshot } from '@/lib/quote/quoteSnapshot';
import { createCustomQuoteItem, createQuoteItemFromProduct } from '@/lib/quote/productToQuoteItem';
import {
  DEFAULT_SPEC_KEYS,
  mergeSuggestionLists,
  rememberQuoteSuggestions,
  suggestionTypesForSpecKey,
} from '@/lib/suggestions';
import { useSuggestions } from '@/lib/useSuggestions';
import { exportQuotePDF } from '@/features/export/pdfExport';
import { ProductThumb, OWIN_LOGO } from '@/features/products/ProductThumb';
import { ProductPreviewCard } from '@/features/products/ProductPreviewCard';
import { ImageLightbox } from '@/components/ImageLightbox';
import { resolveImageUrl } from '@/utils/imagePaths';
import { compressAndUploadQuoteImage, ImageError } from '@/utils/imageStorage';
import {
  createEmptyFixedAccessoryDraft,
  parseExtraAccessoriesJson,
  parseFixedAccessoriesJson,
  serializeExtraAccessoriesJson,
  serializeFixedAccessoriesJson,
} from '@/lib/quote/accessoryDrafts';
import {
  buildAccessoryPackageCatalog,
  findOrphanAccessoryNames,
  type AccessoryPackageTemplate,
} from '@/lib/accessoryPackages';
import { importQuoteFromDocx } from '@/lib/quote/importQuoteFromDocx';
import { deleteQuote, getAllQuotes, saveQuoteRecord } from './quoteStore';
import { subscribeToQuotes } from '@/features/supabase/quotesRepo';
import { documentsEqual } from '@/features/supabase/threeWayMerge';

const QUOTE_SUGGESTION_TYPES = [
  'customer_name',
  'customer_address',
  'item_name',
  'product_name',
  'category',
  'color',
  'frame',
  'jamb',
  'sash',
  'thickness',
  'glass',
  'molding',
  'protection_bar',
  'spec_value',
  'spec_value_color',
  'spec_value_frame',
  'spec_value_jamb',
  'spec_value_glass',
  'spec_value_molding',
  'spec_value_protection_bar',
  'spec_value_sash',
  'spec_value_thickness',
  'accessory_name',
  'fixed_accessory_item',
  'extra_accessory_name',
  'accessory_package_name',
] as const;

const todayInputValue = () => new Date().toISOString().slice(0, 10);

type SaveUiState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

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

function operationError(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : '';
  return detail ? `${prefix}: ${detail}` : prefix;
}

function pdfExportFileName(code: string): string {
  return `Bao_gia_${code}.pdf`;
}

function makeItemCode(index: number): string {
  return `HM-${String(index + 1).padStart(2, '0')}`;
}

function makeItemUiKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `qi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function changedQuoteSaveInput(
  previousForm: QuoteInput | null,
  currentForm: QuoteInput,
  candidate: Partial<QuoteRecord>,
  includeExports: boolean,
): Partial<QuoteRecord> {
  if (!previousForm) return candidate;
  const patch: Partial<QuoteRecord> = {
    id: candidate.id,
    code: candidate.code,
    status: candidate.status,
  };
  const changed = <K extends keyof QuoteInput>(key: K) =>
    !documentsEqual(currentForm[key], previousForm[key]);

  if (changed('customerId')) patch.customerId = candidate.customerId;
  if (changed('customerName')) patch.customerName = candidate.customerName;
  if (changed('customerPhone')) patch.customerPhone = candidate.customerPhone;
  if (changed('customerEmail')) patch.customerEmail = candidate.customerEmail;
  if (changed('customerAddress')) patch.customerAddress = candidate.customerAddress;
  if (changed('quoteDate')) patch.quoteDate = candidate.quoteDate;

  const depositChanged = changed('depositVnd');
  const itemsChanged = changed('items');
  if (depositChanged || itemsChanged) {
    patch.depositVnd = candidate.depositVnd;
    patch.subtotalProductVnd = candidate.subtotalProductVnd;
    patch.subtotalAccessoryVnd = candidate.subtotalAccessoryVnd;
    patch.totalVnd = candidate.totalVnd;
    patch.roundedTotalVnd = candidate.roundedTotalVnd;
    patch.balanceVnd = candidate.balanceVnd;
  }
  if (itemsChanged) patch.items = candidate.items;

  const visibleFormChanged =
    changed('customerId') ||
    changed('customerName') ||
    changed('customerPhone') ||
    changed('customerEmail') ||
    changed('customerAddress') ||
    changed('quoteDate') ||
    depositChanged ||
    itemsChanged;
  if (visibleFormChanged) {
    patch.snapshot = candidate.snapshot;
    patch.snapshotJson = candidate.snapshotJson;
  }
  if (includeExports) patch.exports = candidate.exports;
  return patch;
}

/** Normalize a quote item for lock/save: drop blank draft rows, keep empty-value specs. */
function confirmNormalizeItem(item: QuoteItemInput): QuoteItemInput {
  const cleaned = cleanItemAccessoriesForPersist(item);
  const dimensions = (cleaned.dimensions || [])
    .map((line) => ({
      ...line,
      quantity: Math.max(0, Number(line.quantity || 0)),
      unitPriceVnd: Number(line.unitPriceVnd ?? cleaned.unitPriceVnd ?? 0) || 0,
      widthM: line.widthM == null || Number.isNaN(Number(line.widthM)) ? null : Number(line.widthM),
      heightM: line.heightM == null || Number.isNaN(Number(line.heightM)) ? null : Number(line.heightM),
      description: line.description?.trim() || null,
    }))
    .filter((line) => {
      const qty = Number(line.quantity || 0);
      const w = Number(line.widthM || 0);
      const h = Number(line.heightM || 0);
      const price = Number(line.unitPriceVnd || 0);
      return qty > 0 || w > 0 || h > 0 || price > 0 || Boolean(line.description);
    });

  return {
    ...cleaned,
    itemName: String(cleaned.itemName || '').trim() || 'Hạng mục',
    unitPriceVnd: Number(cleaned.unitPriceVnd || 0) || 0,
    dimensions:
      dimensions.length > 0
        ? dimensions
        : [
            {
              unit: cleaned.unit,
              widthM: cleaned.unit === 'BO' ? null : 0,
              heightM: cleaned.unit === 'BO' ? null : 0,
              quantity: 1,
              unitPriceVnd: Number(cleaned.unitPriceVnd || 0) || 0,
              description: null,
            },
          ],
    accessories: (cleaned.accessories || []).filter((accessory) => String(accessory.name || '').trim()),
  };
}

function unitLabel(unit: ProductUnit): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

function statusLabel(status: QuoteRecord['status']): string {
  if (status === 'EXPORTED') return 'Đã xuất';
  if (status === 'SAVED') return 'Đã lưu';
  return 'Nháp';
}

function formatShortDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('vi-VN');
}

function scrollPageTop() {
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/**
 * Drop the legacy phantom "Bộ phụ kiện đi kèm / Vật tư phụ" package (0đ, all-zero qty)
 * that older quotes accidentally baked into every item. Real packages (priced, custom
 * name, or non-zero quantities) are always kept untouched.
 */
function stripPhantomFixedPackage(value: string | null | undefined): string | null {
  if (!value) return null;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    return value;
  }
  if (!parsed || typeof parsed !== 'object') return value;
  const unitPrice = Number(parsed.unitPrice ?? parsed.unitPriceVnd ?? 0) || 0;
  const name = String(parsed.name ?? '').trim();
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const allZeroQty = items.every((entry) => Number((entry as Record<string, unknown>).quantity ?? 0) === 0);
  const onlyDefaultNames = items.every((entry) => {
    const itemName = String((entry as Record<string, unknown>).name ?? '').trim();
    return itemName === '' || itemName === 'Vật tư phụ';
  });
  const isPhantom =
    unitPrice === 0 &&
    (name === '' || name === 'Bộ phụ kiện đi kèm') &&
    allZeroQty &&
    onlyDefaultNames;
  return isPhantom ? null : value;
}

function snapshotToInputs(quote: QuoteRecord): QuoteItemInput[] {
  return quote.snapshot.items.map((item) => ({
    sourceType: item.sourceType,
    productId: item.productId || null,
    sourceProductId: item.sourceProductId || item.productId || null,
    productCode: item.quoteItemCode || item.productCode,
    quoteItemCode: item.quoteItemCode || item.productCode,
    itemName: item.itemName,
    productType: item.productType || null,
    category: item.category || item.groupName || null,
    groupName: item.groupName || item.category || null,
    coverImagePath: item.coverImagePath || item.image || null,
    image: item.image || item.coverImagePath || null,
    imageReference: item.imageReference || item.coverImagePath || item.image || null,
    imageOverridePath: item.imageOverridePath || null,
    unit: item.unit,
    description: item.description || '',
    unitPriceVnd: item.unitPriceVnd,
    specs: item.specs || [],
    dimensions: item.dimensions.map((line) => ({
      unit: line.unit,
      widthM: line.widthM,
      heightM: line.heightM,
      quantity: line.quantity,
      unitPriceVnd: line.unitPriceVnd,
      description: line.description || null,
    })),
    accessories: item.accessories.map((accessory) => ({
      name: accessory.name,
      quantityPerSet: accessory.quantityPerSet,
      unitPriceVnd: accessory.unitPriceVnd,
      note: accessory.note || null,
      isEnabled: accessory.isEnabled !== false && accessory.enabled !== false,
    })),
    fixedAccessoryPackage: stripPhantomFixedPackage(item.fixedAccessoryPackage),
    extraAccessories: item.extraAccessories || null,
    numericId: item.numericId || null,
  }));
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
  const [history, setHistory] = useState<QuoteRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteCode, setQuoteCode] = useState<string>('');
  const [status, setStatus] = useState<'DRAFT' | 'SAVED' | 'EXPORTED'>('DRAFT');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayInputValue());
  const [depositVnd, setDepositVnd] = useState(0);
  const [items, setItems] = useState<QuoteItemInput[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  // Tab lọc ngang hạng mục theo loại cửa ('all' = tất cả).
  const [itemCategoryFilter, setItemCategoryFilter] = useState('all');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState('');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<QuoteRecord['status'] | ''>('');
  const [message, setMessage] = useState('');
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
  const historyRequestIdRef = useRef(0);
  /** Stable UI keys parallel to items — used for expand/collapse without data loss. */
  const [itemUiKeys, setItemUiKeys] = useState<string[]>([]);
  /** Expanded (editing) item keys. Missing key = locked compact card. */
  const [expandedItemKeys, setExpandedItemKeys] = useState<Set<string>>(() => new Set());

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

  const refreshHistory = async (): Promise<boolean> => {
    const requestId = ++historyRequestIdRef.current;
    const quotes = await getAllQuotes();
    if (requestId !== historyRequestIdRef.current) return false;
    setHistory(quotes);
    return true;
  };

  useEffect(() => {
    let active = true;
    const retryTimers = new Set<number>();
    const reload = (attempt = 0) => {
      if (attempt === 0) setHistoryLoading(true);
      void refreshHistory()
        .then((applied) => {
          if (!active || !applied) return;
          setHistoryError('');
          setHistoryLoading(false);
        })
        .catch((error) => {
          if (!active) return;
          if (attempt < 2 && navigator.onLine) {
            const timer = window.setTimeout(() => {
              retryTimers.delete(timer);
              reload(attempt + 1);
            }, (attempt + 1) * 1_000);
            retryTimers.add(timer);
            return;
          }
          setHistoryLoading(false);
          setHistoryError(operationError('Không thể tải danh sách báo giá từ Supabase', error));
        });
    };
    const reloadWhenVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    reload();
    const reloadNow = () => reload(0);
    const unsubscribe = subscribeToQuotes(reloadNow, (status) => {
      // The first SUBSCRIBED closes the REST/socket race; later ones repair
      // anything missed while Realtime was reconnecting.
      if (status === 'SUBSCRIBED') reloadNow();
    });
    window.addEventListener('online', reloadNow);
    window.addEventListener('focus', reloadNow);
    document.addEventListener('visibilitychange', reloadWhenVisible);
    return () => {
      active = false;
      historyRequestIdRef.current += 1;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      unsubscribe();
      window.removeEventListener('online', reloadNow);
      window.removeEventListener('focus', reloadNow);
      document.removeEventListener('visibilitychange', reloadWhenVisible);
    };
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(productRecords.map((product) => product.category).filter(Boolean))).sort(),
    [productRecords],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productRecords.filter((product) => {
      const categoryOk = !categoryFilter || product.category === categoryFilter;
      const text = `${product.code} ${product.name} ${product.category}`.toLowerCase();
      return categoryOk && (!q || text.includes(q));
    });
  }, [categoryFilter, productRecords, search]);

  const filteredHistory = useMemo(() => {
    const q = quoteSearch.trim().toLowerCase();
    return history.filter((quote) => {
      const statusOk = !quoteStatusFilter || quote.status === quoteStatusFilter;
      const text = [
        quote.code,
        quote.customerName,
        quote.customerPhone,
        quote.customerEmail,
        quote.customerAddress,
        quote.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return statusOk && (!q || text.includes(q));
    });
  }, [history, quoteSearch, quoteStatusFilter]);

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

  const importWordInputRef = useRef<HTMLInputElement>(null);
  const [importingWord, setImportingWord] = useState(false);

  const handleImportWord = async (file: File) => {
    setImportingWord(true);
    setMessage('');
    try {
      const draft = await importQuoteFromDocx(file);
      resetForm();
      setCustomerName(draft.customerName);
      setCustomerAddress(draft.customerAddress);
      setQuoteDate(draft.quoteDate || todayInputValue());
      const keys = draft.items.map(() => makeItemUiKey());
      setItems(draft.items.map((item) => confirmNormalizeItem(item)));
      setItemUiKeys(keys);
      setExpandedItemKeys(new Set());
      setView('form');
      setDetailQuote(null);
      setMessage(
        `Đã import ${draft.items.length} hạng mục từ Word${draft.customerName ? ` · KH: ${draft.customerName}` : ''}. Kiểm tra rồi bấm Lưu.`,
      );
      scrollPageTop();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Import Word thất bại: ${error.message}`
          : 'Import Word thất bại. Kiểm tra đúng file báo giá OWIN.',
      );
    } finally {
      setImportingWord(false);
    }
  };

  const appendItem = (item: QuoteItemInput, options?: { expand?: boolean }) => {
    const key = makeItemUiKey();
    setItems((current) => [...current, item]);
    setItemUiKeys((current) => [...current, key]);
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

  const updateItem = (index: number, patch: Partial<QuoteItemInput>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

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
    const clone: QuoteItemInput = {
      ...confirmNormalizeItem(source),
      productCode: code,
      quoteItemCode: code,
    };
    setItems((current) => [...current.slice(0, index + 1), clone, ...current.slice(index + 1)]);
    setItemUiKeys((current) => [...current.slice(0, index + 1), key, ...current.slice(index + 1)]);
    setExpandedItemKeys((current) => new Set(current).add(key));
  };

  const updateDimension = (itemIndex: number, lineIndex: number, patch: Partial<DimensionInput>) =>
    setItems((current) =>
      current.map((item, i) =>
        i === itemIndex
          ? {
              ...item,
              dimensions: item.dimensions.map((line, j) => (j === lineIndex ? { ...line, ...patch } : line)),
            }
          : item,
      ),
    );

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
            setSaveUiState('pending');
            if (currentHasItemsRef.current && followupAutosaveTimerRef.current === null) {
              if (autosaveTimerRef.current !== null) {
                window.clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
              }
              followupAutosaveTimerRef.current = window.setTimeout(() => {
                followupAutosaveTimerRef.current = null;
                if (formGenerationRef.current !== generation) return;
                void persistQuoteRef.current?.('DRAFT', {
                  learnSuggestions: false,
                  quiet: true,
                }).catch(() => undefined);
              }, 0);
            }
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
      return undefined;
    }
    if (suppressNextAutosaveRef.current) {
      suppressNextAutosaveRef.current = false;
      lastSavedSignatureRef.current = autosaveSignature;
      setSaveUiState('saved');
      setSaveError('');
      return undefined;
    }
    if (lastSavedSignatureRef.current === autosaveSignature) {
      setSaveUiState('saved');
      return undefined;
    }

    setSaveUiState('pending');
    setSaveError('');
    const timer = window.setTimeout(() => {
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
      void persistQuoteRef.current?.('DRAFT', {
        learnSuggestions: false,
        quiet: true,
      }).catch(() => undefined);
    }, 1_000);
    autosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
    };
  }, [autosaveSignature, items.length, view]);

  useEffect(() => {
    if (view !== 'form' || items.length === 0) return undefined;
    const retryUnsavedDraft = () => {
      if (!navigator.onLine || busyCountRef.current > 0) return;
      if (lastSavedSignatureRef.current === currentSignatureRef.current) return;
      cancelPendingAutosave();
      void persistQuoteRef.current?.('DRAFT', {
        learnSuggestions: false,
        quiet: true,
      }).catch(() => undefined);
    };
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') retryUnsavedDraft();
    };
    window.addEventListener('online', retryUnsavedDraft);
    window.addEventListener('focus', retryUnsavedDraft);
    document.addEventListener('visibilitychange', retryWhenVisible);
    return () => {
      window.removeEventListener('online', retryUnsavedDraft);
      window.removeEventListener('focus', retryUnsavedDraft);
      document.removeEventListener('visibilitychange', retryWhenVisible);
    };
  }, [items.length, view]);

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
      status: 'DRAFT' as const,
      options: { learnSuggestions: false, quiet: true },
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

  const flushDraftBeforeLeaving = async (): Promise<boolean> => {
    cancelPendingAutosave();
    if (items.length === 0 || lastSavedSignatureRef.current === currentSignatureRef.current) {
      return true;
    }
    try {
      await persistQuote('DRAFT', { learnSuggestions: false, quiet: true });
      return lastSavedSignatureRef.current === currentSignatureRef.current;
    } catch {
      return false;
    }
  };

  const backToQuoteList = async () => {
    if (await flushDraftBeforeLeaving()) setView('list');
  };

  const startNewQuote = async () => {
    if (await flushDraftBeforeLeaving()) openNewQuote();
  };

  // In/Xuất KHÔNG lưu dữ liệu — chỉ tạo file từ dữ liệu hiện tại. Autosave (lúc gõ) lo phần lưu.
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

  const printCurrentQuote = async () => {
    if (items.length === 0) return;
    beginBusy();
    setMessage('');
    setSaveError('');
    try {
      await exportQuotePDF();
    } catch (error) {
      showOperationError('Không thể mở In/PDF', error);
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

  const printSavedQuote = async (quote: QuoteRecord) => {
    beginBusy();
    setMessage('');
    setSaveError('');
    try {
      const saved = await recordSavedQuoteExport(quote, 'pdf', pdfExportFileName(quote.code));
      if (detailQuote?.id === saved.id) setDetailQuote(saved);
      setMessage(`Đã ghi lịch sử In/PDF ${quote.code}`);
      try { await refreshHistory(); } catch { /* Realtime retries list refresh. */ }
      await exportQuotePDF();
    } catch (error) {
      showOperationError('Không thể lưu lịch sử In/PDF', error);
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
    setQuoteDate((quote.quoteDate || quote.createdAt).slice(0, 10));
    setDepositVnd(quote.depositVnd);
    const loaded = snapshotToInputs(quote).map((item) => confirmNormalizeItem(item));
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
      <>
        <input
          ref={importWordInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportWord(file);
            event.target.value = '';
          }}
        />
        <QuoteListPanel
          history={history}
          filteredHistory={filteredHistory}
          quoteSearch={quoteSearch}
          quoteStatusFilter={quoteStatusFilter}
          message={message}
          loading={historyLoading}
          error={historyError}
          importingWord={importingWord}
          onSearch={setQuoteSearch}
          onStatusFilter={setQuoteStatusFilter}
          onCreate={openNewQuote}
          onImportWord={() => importWordInputRef.current?.click()}
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
      </>
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
        onPrint={() => void printSavedQuote(detailQuote)}
      />
    );
  }

  return (
    <section className="admin-page quote-workflow-page">
      <div className="toolbar quote-form-heading">
        <button className="admin-back-button" onClick={() => void backToQuoteList()} aria-label="Quay lại danh sách báo giá">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="app-title">{quoteId ? 'Cập nhật báo giá' : 'Thiết kế & Lập báo giá'}</h1>
          <p className="app-subtitle">
            {loading ? 'Đang tải kho…' : `${productRecords.length} sản phẩm · ${history.length} báo giá đã lưu`}
          </p>
        </div>
        <div className="spacer" />
        <button className="btn btn-ghost" disabled={saving} onClick={() => void startNewQuote()}>Báo giá mới</button>
        <button className="btn btn-primary" disabled={items.length === 0 || saving} onClick={() => void saveManually()}>
          <Save size={17} style={{ verticalAlign: '-3px' }} /> {saving ? 'Đang lưu…' : 'Lưu báo giá'}
        </button>
        <button className="btn btn-ghost" disabled={items.length === 0 || saving} onClick={() => void exportWord()}>
          <FileDown size={17} style={{ verticalAlign: '-3px' }} /> Word
        </button>
        <button className="btn btn-ghost" disabled={items.length === 0 || saving} onClick={() => void exportExcel()}>
          <FileDown size={17} style={{ verticalAlign: '-3px' }} /> Excel
        </button>
        <button className="btn btn-ghost" disabled={items.length === 0 || saving} onClick={() => void printCurrentQuote()}>
          <Printer size={17} style={{ verticalAlign: '-3px' }} /> In/PDF
        </button>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="section-label">Thông tin khách hàng</div>
          <div className="two-col">
            <Field label="Tên khách" value={customerName} onChange={setCustomerName} suggestions={seededSuggestions.customer_name} />
            <Field label="SĐT" value={customerPhone} onChange={setCustomerPhone} />
            <Field label="Email" value={customerEmail} onChange={setCustomerEmail} />
            <Field label="Địa chỉ" value={customerAddress} onChange={setCustomerAddress} suggestions={seededSuggestions.customer_address} />
            <div className="field">
              <label>Ngày báo giá</label>
              <input className="input" type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Tạm ứng</label>
              <CurrencyInput value={depositVnd} onChange={setDepositVnd} placeholder="0" />
            </div>
          </div>
          <div className="product-sub">
            {quoteCode || 'Chưa có mã'} · Trạng thái: {status}
          </div>
          <SaveFeedback
            state={saveUiState}
            error={saveError}
            onRetry={retryLastSave}
          />
          {message && !saveError && <div className="product-sub" style={{ color: 'var(--ios-green)' }}>{message}</div>}
        </div>

        <div className="card">
          <div className="section-label">Tổng tiền</div>
          <TotalLine label="Tiền sản phẩm" value={calculated.summary.subtotalProductVnd} />
          <TotalLine label="Tiền phụ kiện" value={calculated.summary.subtotalAccessoryVnd} />
          <TotalLine label="Tổng trước làm tròn" value={calculated.summary.totalVnd} />
          <TotalLine label="Làm tròn xuống" value={calculated.summary.roundedTotalVnd} strong />
          <TotalLine label="Cần thanh toán" value={calculated.summary.balanceVnd} strong />
        </div>
      </div>

      <div className="card quote-add-products-card" style={{ marginTop: 16 }}>
        <div>
          <div className="section-label">Chọn sản phẩm</div>
          <div className="product-sub">Mở kho sản phẩm để chọn nhanh bằng hình ảnh, hoặc thêm hạng mục tùy chỉnh.</div>
        </div>
        <div className="quote-add-actions">
          <button className="btn btn-primary" onClick={() => setProductPickerOpen(true)}>
            <Package size={17} style={{ verticalAlign: '-3px' }} /> Chọn sản phẩm từ kho
          </button>
          <button className="btn btn-ghost" onClick={addCustom}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> Hạng mục tùy chỉnh
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Hạng mục báo giá ({items.length})</div>
        {(() => {
          const cats = Array.from(new Set(items.map((it) => (it.category || it.groupName || '').trim()).filter(Boolean)));
          if (cats.length < 2) return null;
          return (
            <div className="tool-nav no-print" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }} role="tablist">
              <button type="button" className={`tool-nav-item ${itemCategoryFilter === 'all' ? 'active' : ''}`} onClick={() => setItemCategoryFilter('all')}>Tất cả</button>
              {cats.map((c) => (
                <button key={c} type="button" className={`tool-nav-item ${itemCategoryFilter === c ? 'active' : ''}`} onClick={() => setItemCategoryFilter(c)}>{c}</button>
              ))}
            </div>
          );
        })()}
        {items.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>Chưa có hạng mục nào.</div>
        ) : (
          <div className="stack">
            {items.map((item, index) => {
              const uiKey = itemUiKeys[index] || `fallback-${index}`;
              const locked = !expandedItemKeys.has(uiKey);
              // Tab lọc: bỏ qua hạng mục không thuộc loại đang chọn (index giữ nguyên cho sửa/xóa).
              if (itemCategoryFilter !== 'all' && (item.category || item.groupName || '').trim() !== itemCategoryFilter) return null;
              return (
              <div key={uiKey} className="quote-item-drop" {...itemDrag.rowProps(index)}>
              <QuoteItemCard
                index={index}
                item={item}
                products={productRecords}
                locked={locked}
                calculated={calculated.items[index]}
                suggestions={seededSuggestions}
                packageCatalog={packageCatalog}
                orphanAccessoryNames={orphanAccessoryNames}
                dragHandleProps={itemDrag.handleProps(index)}
                onUpdate={(patch) => updateItem(index, patch)}
                onDimension={(lineIndex, patch) => updateDimension(index, lineIndex, patch)}
                onAccessory={(accIndex, patch) => updateAccessory(index, accIndex, patch)}
                onAddDimension={() =>
                  updateItem(index, {
                    dimensions: [
                      ...item.dimensions,
                      { unit: item.unit, widthM: item.unit === 'BO' ? null : 1, heightM: item.unit === 'BO' ? null : 1, quantity: 1, unitPriceVnd: item.unitPriceVnd },
                    ],
                  })
                }
                onAddAccessory={() =>
                  updateItem(index, {
                    accessories: [...item.accessories, { name: '', quantityPerSet: 0, unitPriceVnd: 0, note: null, isEnabled: true }],
                  })
                }
                onCollapse={() => collapseItem(index)}
                onExpand={() => expandItem(index)}
                onDuplicate={() => duplicateItemAt(index)}
                onDelete={() => removeItemAt(index)}
              />
              </div>
              );
            })}
          </div>
        )}
      </div>

      <QuotePrintDocument quote={calculated} products={productRecords} />
      <ProductPickerModal
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

function unitLabelShort(unit: ProductRecord['unit']): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

function ProductPickerModal({
  isOpen,
  search,
  categoryFilter,
  categories,
  filteredProducts,
  productCount,
  onSearch,
  onCategoryFilter,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  search: string;
  categoryFilter: string;
  categories: string[];
  filteredProducts: ProductRecord[];
  productCount: number;
  onSearch: (value: string) => void;
  onCategoryFilter: (value: string) => void;
  onSelect: (productId: string) => void;
  onClose: () => void;
}) {
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  const [detailProduct, setDetailProduct] = useState<ProductRecord | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCategoriesCollapsed(false);
      setDetailProduct(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="quote-picker-backdrop" role="presentation" onClick={onClose}>
      <div className="quote-picker-modal" role="dialog" aria-modal="true" aria-label="Chọn sản phẩm" onClick={(event) => event.stopPropagation()}>
        <div className="quote-picker-header">
          <div className="quote-picker-title">
            <div className="quote-picker-icon"><Package size={20} /></div>
            <div>
              <h2>Chọn sản phẩm</h2>
              <p>{productCount} sản phẩm · bấm ảnh để xem chi tiết · bấm thẻ để chọn nhanh</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng chọn sản phẩm">
            <X size={18} />
          </button>
        </div>

        <div className="quote-picker-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => {
              onSearch(event.target.value);
              onCategoryFilter('');
            }}
            placeholder="Tìm theo tên hoặc nhóm..."
            autoFocus
          />
        </div>

        <div className={`quote-picker-categories${categoriesCollapsed ? ' is-collapsed' : ''}`}>
          <button
            type="button"
            className="quote-picker-cat-toggle"
            onClick={() => setCategoriesCollapsed((v) => !v)}
          >
            {categoriesCollapsed ? 'Hiện danh mục' : 'Thu gọn danh mục'}
          </button>
          {!categoriesCollapsed && (
            <>
              <button className={!categoryFilter ? 'active' : ''} onClick={() => onCategoryFilter('')} type="button">
                Tất cả ({productCount})
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  className={categoryFilter === category ? 'active' : ''}
                  onClick={() => onCategoryFilter(category)}
                  type="button"
                >
                  {category}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="quote-picker-results">
          {filteredProducts.length === 0 ? (
            <div className="empty-line">Không tìm thấy sản phẩm phù hợp.</div>
          ) : (
            <div className="quote-picker-grid">
              {filteredProducts.map((product) => (
                <div key={product.id} className="quote-picker-card">
                  <button
                    type="button"
                    className="quote-picker-thumb image-fit-frame"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDetailProduct(product);
                      setCategoriesCollapsed(true);
                    }}
                    aria-label={`Xem chi tiết ${product.name}`}
                  >
                    <ProductThumb imagePath={product.coverImagePath} fill thumb />
                  </button>
                  <button
                    type="button"
                    className="quote-picker-card-body"
                    onClick={() => onSelect(product.id)}
                  >
                    <strong>{product.name}</strong>
                    {product.category ? <span className="quote-picker-meta">{product.category}</span> : null}
                    <span className="quote-picker-price">
                      {formatVND(product.unitPriceVnd)}
                      <small>/{unitLabelShort(product.unit)}</small>
                    </span>
                    <span className="quote-picker-choose">Chọn</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {detailProduct && (
        <ProductPreviewCard
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onSelect={(product) => {
            setDetailProduct(null);
            onSelect(product.id);
          }}
          selectLabel="Thêm vào báo giá"
        />
      )}
    </div>
  );
}

function QuoteListPanel({
  history,
  filteredHistory,
  quoteSearch,
  quoteStatusFilter,
  message,
  loading,
  error,
  importingWord,
  onSearch,
  onStatusFilter,
  onCreate,
  onImportWord,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onRetry,
}: {
  history: QuoteRecord[];
  filteredHistory: QuoteRecord[];
  quoteSearch: string;
  quoteStatusFilter: QuoteRecord['status'] | '';
  message: string;
  loading: boolean;
  error: string;
  importingWord?: boolean;
  onSearch: (value: string) => void;
  onStatusFilter: (value: QuoteRecord['status'] | '') => void;
  onCreate: () => void;
  onImportWord?: () => void;
  onView: (quote: QuoteRecord) => void;
  onEdit: (quote: QuoteRecord) => void;
  onDuplicate: (quote: QuoteRecord) => void;
  onDelete: (quote: QuoteRecord) => void;
  onRetry: () => void;
}) {
  return (
    <section className="admin-page quote-list-page">
      <div className="admin-page-heading">
        <div>
          <h1 className="app-title">Danh sách báo giá</h1>
          <p className="app-subtitle">Hồ sơ báo giá chi tiết nhôm kính hệ OWIN · {history.length} báo giá</p>
        </div>
        <div className="product-header-actions">
          <button className="btn btn-ghost" type="button" onClick={onImportWord} disabled={importingWord}>
            {importingWord ? (
              <LoaderCircle size={17} className="spin" style={{ verticalAlign: '-3px' }} />
            ) : (
              <FileUp size={17} style={{ verticalAlign: '-3px' }} />
            )}{' '}
            {importingWord ? 'Đang import…' : 'Import từ Word'}
          </button>
          <button className="btn btn-primary" onClick={onCreate}>
            <Plus size={18} style={{ verticalAlign: '-3px' }} /> Tạo báo giá mới
          </button>
        </div>
      </div>

      {message && <div className="product-toast">{message}</div>}
      {error && (
        <div className="product-data-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost" onClick={onRetry}>Thử tải lại</button>
        </div>
      )}

      <div className="product-filter-card">
        <div className="field product-filter-search">
          <label><Search size={15} style={{ verticalAlign: '-2px' }} /> Tìm báo giá</label>
          <input
            className="input"
            value={quoteSearch}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Tìm theo mã báo giá, tên khách, sđt..."
          />
        </div>
        <div className="field">
          <label>Trạng thái</label>
          <select
            className="input"
            value={quoteStatusFilter}
            onChange={(event) => onStatusFilter(event.target.value as QuoteRecord['status'] | '')}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Nháp</option>
            <option value="SAVED">Đã lưu</option>
            <option value="EXPORTED">Đã xuất</option>
          </select>
        </div>
      </div>

      <div className="quote-history-table-wrap quote-list-table-card">
        {loading ? (
          <div className="product-empty-card"><LoaderCircle className="spin" size={32} /><p>Đang tải báo giá từ Supabase…</p></div>
        ) : history.length === 0 ? (
          <div className="product-empty-card">
            <FileDown size={44} />
            <h3>Chưa có báo giá</h3>
            <p>Tạo báo giá mới để bắt đầu lưu lịch sử.</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="product-empty-card">
            <Search size={44} />
            <h3>Không tìm thấy báo giá</h3>
            <p>Thử đổi từ khóa hoặc trạng thái lọc.</p>
          </div>
        ) : (
          <table className="quote-history-table">
            <thead>
              <tr>
                <th>Mã báo giá</th>
                <th>Khách hàng</th>
                <th>Giá trị nhôm</th>
                <th>Phụ kiện</th>
                <th>Tổng cộng</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((quote) => (
                <tr key={quote.id}>
                  <td>
                    <button className="quote-code-button" onClick={() => onView(quote)}>
                      {quote.code}
                    </button>
                  </td>
                  <td>
                    <div className="quote-customer-name">{quote.customerName || 'Khách chưa đặt tên'}</div>
                    <div className="quote-customer-meta">{quote.customerPhone || quote.customerAddress || ''}</div>
                  </td>
                  <td className="num">{formatVND(quote.subtotalProductVnd)}</td>
                  <td className="num">{formatVND(quote.subtotalAccessoryVnd)}</td>
                  <td className="num total-cell">{formatVND(quote.roundedTotalVnd)}</td>
                  <td><span className={`quote-status-pill quote-status-${quote.status.toLowerCase()}`}>{statusLabel(quote.status)}</span></td>
                  <td>{formatShortDate(quote.createdAt)}</td>
                  <td>
                    <div className="quote-actions">
                      <button className="icon-btn" onClick={() => onView(quote)} aria-label="Xem báo giá">
                        <Eye size={16} />
                      </button>
                      <button className="btn btn-ghost" onClick={() => onEdit(quote)}>Sửa</button>
                      <button className="icon-btn" onClick={() => onDuplicate(quote)} aria-label="Nhân bản">
                        <Copy size={16} />
                      </button>
                      <button className="icon-btn danger" onClick={() => onDelete(quote)} aria-label="Xoá báo giá">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function QuoteDetailPanel({
  quote,
  products,
  saving,
  message,
  error,
  onBack,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
  onExportExcel,
  onPrint,
}: {
  quote: QuoteRecord;
  products: ProductRecord[];
  saving: boolean;
  message: string;
  error: string;
  onBack: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
}) {
  return (
    <section className="admin-page quote-detail-page">
      <div className="admin-page-heading">
        <div className="title-row">
          <button className="admin-back-button" onClick={onBack} aria-label="Quay lại danh sách báo giá">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="app-title">{quote.code}</h1>
            <p className="app-subtitle">{quote.customerName || 'Khách chưa đặt tên'} · {formatShortDate(quote.createdAt)}</p>
          </div>
        </div>
        <div className="quote-detail-actions">
          <button className="btn btn-ghost" onClick={onEdit}>Sửa</button>
          <button className="btn btn-ghost" onClick={onDuplicate}>
            <Copy size={16} style={{ verticalAlign: '-3px' }} /> Nhân bản
          </button>
          <button className="btn btn-ghost" disabled={saving} onClick={onExport}>
            <FileDown size={16} style={{ verticalAlign: '-3px' }} /> Word
          </button>
          <button className="btn btn-ghost" disabled={saving} onClick={onExportExcel}>
            <FileDown size={16} style={{ verticalAlign: '-3px' }} /> Excel
          </button>
          <button className="btn btn-ghost" disabled={saving} onClick={onPrint}>
            <Printer size={16} style={{ verticalAlign: '-3px' }} /> In/PDF
          </button>
          <button className="btn btn-danger" onClick={onDelete}>Xóa</button>
        </div>
      </div>

      {message && (
        <div className="product-toast" style={error ? { color: 'var(--ios-red)' } : undefined}>
          {message}
        </div>
      )}

      <div className="quote-detail-grid">
        <section className="card">
          <div className="section-label">Thông tin khách hàng</div>
          <div className="quote-detail-info">
            <div><span>Khách hàng</span><strong>{quote.customerName || '—'}</strong></div>
            <div><span>SĐT</span><strong>{quote.customerPhone || '—'}</strong></div>
            <div><span>Email</span><strong>{quote.customerEmail || '—'}</strong></div>
            <div><span>Địa chỉ</span><strong>{quote.customerAddress || '—'}</strong></div>
            <div><span>Ngày báo giá</span><strong>{formatShortDate(quote.quoteDate || quote.createdAt)}</strong></div>
            <div><span>Trạng thái</span><strong>{statusLabel(quote.status)}</strong></div>
          </div>
        </section>
        <section className="card">
          <div className="section-label">Tổng quan giá trị đơn hàng</div>
          <TotalLine label="Sản phẩm chính" value={quote.subtotalProductVnd} />
          <TotalLine label="Phụ kiện lắp đặt" value={quote.subtotalAccessoryVnd} />
          <TotalLine label="Tổng tiền" value={quote.totalVnd} />
          <TotalLine label="Làm tròn" value={quote.roundedTotalVnd} strong />
          <TotalLine label="Tạm ứng" value={quote.depositVnd} />
          <TotalLine label="Cần thanh toán" value={quote.balanceVnd} strong />
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Hạng mục báo giá ({quote.snapshot.items.length})</div>
        <div className="quote-detail-items">
          {quote.snapshot.items.map((item) => (
            <div key={`${item.quoteItemCode}-${item.sortOrder}`} className="quote-detail-item">
              <ProductThumb item={item} products={products} imagePath={item.coverImagePath || item.image || null} />
              <div>
                <div className="product-name">{item.quoteItemCode} · {item.itemName}</div>
                <div className="product-sub">
                  {item.category || item.groupName || '—'} · {formatVND(item.productSubtotalVnd)} · PK {formatVND(item.accessorySubtotalVnd)}
                </div>
              </div>
              <strong>{formatVND(item.itemTotalVnd)}</strong>
            </div>
          ))}
        </div>
      </section>

      <QuotePrintDocument quote={quote.snapshot} products={products} />
    </section>
  );
}

function SaveFeedback({
  state,
  error,
  onRetry,
}: {
  state: SaveUiState;
  error: string;
  onRetry: () => void;
}) {
  if (state === 'idle') {
    return <div className="product-sub">Thêm ít nhất một hạng mục để bật tự động lưu.</div>;
  }
  if (state === 'pending') {
    return <div className="product-sub">Có thay đổi · sẽ tự lưu lên Supabase sau 1 giây…</div>;
  }
  if (state === 'saving') {
    return (
      <div className="product-sub">
        <LoaderCircle className="spin" size={14} style={{ verticalAlign: '-2px' }} /> Đang lưu lên Supabase…
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="product-sub" style={{ color: 'var(--ios-red)' }} role="alert">
        {error || 'Không thể tự động lưu.'}{' '}
        <button type="button" className="btn btn-ghost" onClick={onRetry}>Thử lưu lại</button>
      </div>
    );
  }
  return <div className="product-sub" style={{ color: 'var(--ios-green)' }}>Đã tự động lưu trên Supabase.</div>;
}

function Field({
  label,
  value,
  onChange,
  suggestions = [],
  fieldKey,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  fieldKey?: string;
}) {
  if (suggestions.length > 0) {
    return (
      <AutoSuggestInput
        label={label}
        fieldKey={fieldKey || label}
        value={value}
        onChange={onChange}
        suggestions={suggestions}
      />
    );
  }
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TotalLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="switch-row">
      <span style={{ fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600 }}>{formatVND(value)}</span>
    </div>
  );
}

function parseJsonMaybe<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function compactNumber(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return '';
  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}


/** Clean blank accessory shells for calculate/save while editors keep them with keepEmpty. */
function cleanItemAccessoriesForPersist(item: QuoteItemInput): QuoteItemInput {
  // A null/empty package must stay empty — never materialize the phantom
  // "Bộ phụ kiện đi kèm / Vật tư phụ" default that used to leak into every quote.
  const hasFixed = item.fixedAccessoryPackage != null && item.fixedAccessoryPackage !== '';
  const fixed = hasFixed ? parseFixedAccessoriesJson(item.fixedAccessoryPackage, 1) : null;
  const extras = parseExtraAccessoriesJson(item.extraAccessories);
  return {
    ...item,
    // Keep spec keys even when value is empty.
    specs: (item.specs || [])
      .map((spec, sortOrder) => ({
        key: String(spec.key || '').trim(),
        value: String(spec.value || '').trim(),
        sortOrder,
      }))
      .filter((spec) => spec.key),
    fixedAccessoryPackage: fixed ? serializeFixedAccessoriesJson(fixed) : null,
    extraAccessories: serializeExtraAccessoriesJson(extras),
  };
}

function specValueSuggestionsForKey(key: string, suggestions: Record<string, string[]>): string[] {
  const types = suggestionTypesForSpecKey(key);
  const primary = types[0];
  if (primary === 'color' || primary === 'spec_value_color') {
    return mergeSuggestionLists(suggestions.color, suggestions.spec_value_color);
  }
  if (primary === 'protection_bar' || primary === 'spec_value_protection_bar') {
    return mergeSuggestionLists(suggestions.protection_bar, suggestions.spec_value_protection_bar);
  }
  if (primary === 'frame' || primary === 'spec_value_frame') {
    return mergeSuggestionLists(suggestions.frame, suggestions.spec_value_frame);
  }
  if (primary === 'jamb' || primary === 'spec_value_jamb') {
    return mergeSuggestionLists(suggestions.jamb, suggestions.spec_value_jamb);
  }
  if (primary === 'sash' || primary === 'spec_value_sash') {
    return mergeSuggestionLists(suggestions.sash, suggestions.spec_value_sash);
  }
  if (primary === 'thickness' || primary === 'spec_value_thickness') {
    return mergeSuggestionLists(suggestions.thickness, suggestions.spec_value_thickness);
  }
  if (primary === 'glass' || primary === 'spec_value_glass') {
    return mergeSuggestionLists(suggestions.glass, suggestions.spec_value_glass);
  }
  if (primary === 'molding' || primary === 'spec_value_molding') {
    return mergeSuggestionLists(suggestions.molding, suggestions.spec_value_molding);
  }
  // Unknown keys only: generic value pool — never mix category/product names.
  return suggestions.spec_value ?? [];
}

function accessoryItemText(name: unknown, quantity: unknown): string {
  const text = String(name || '').trim();
  if (!text) return '';
  const qty = Number(quantity ?? 0);
  return qty > 1 ? `${text} x${qty}` : text;
}

interface QuotePrintAccessoryRow {
  descriptionLines: string[];
  unit: string;
  quantity: string;
  weight: string;
  unitPriceVnd: number;
  amountVnd: number;
}

function buildQuotePrintAccessoryRows(item: ReturnType<typeof calculateQuote>['items'][number]): QuotePrintAccessoryRow[] {
  const rows: QuotePrintAccessoryRow[] = [];
  const fixed = parseJsonMaybe<Record<string, unknown> | null>(item.fixedAccessoryPackage, null);
  if (fixed) {
    const quantity = Number(fixed.packageQuantity ?? fixed.quantity ?? 1) || 1;
    const unitPrice = Number(fixed.unitPrice ?? fixed.unitPriceVnd ?? 0) || 0;
    const items = Array.isArray(fixed.items) ? fixed.items : [];
    rows.push({
      descriptionLines: [
        `${String(fixed.name || 'Bộ phụ kiện đi kèm').trim()}:`,
        ...items
          .map((entry) => {
            const row = entry as Record<string, unknown>;
            return accessoryItemText(row.name, row.quantity);
          })
          .filter(Boolean)
          .map((line) => `- ${line}`),
      ],
      unit: 'Bộ',
      quantity: compactNumber(quantity),
      weight: compactNumber(quantity),
      unitPriceVnd: unitPrice,
      amountVnd: Math.round(quantity * unitPrice),
    });
  }

  const extras = parseJsonMaybe<unknown[]>(item.extraAccessories, []);
  extras
    .filter((entry) => entry && String((entry as Record<string, unknown>).name || '').trim())
    .forEach((entry) => {
      const extra = entry as Record<string, unknown>;
      const unit = String(extra.unit || 'BO') as ProductUnit;
      const normalizedUnit = unit === 'M2' || unit === 'METER' || unit === 'BO' ? unit : 'BO';
      const quantity = Number(extra.quantity ?? extra.quantityPerSet ?? 1) || 1;
      const weight = normalizedUnit === 'BO' ? 0 : Number(extra.weight ?? extra.kl ?? 0) || 0;
      const unitPrice = Number(extra.unitPrice ?? extra.unitPriceVnd ?? 0) || 0;
      const basis = normalizedUnit === 'BO' ? quantity : weight;
      rows.push({
        descriptionLines: [String(extra.name || 'Phụ kiện phát sinh').trim()],
        unit: unitLabel(normalizedUnit),
        quantity: normalizedUnit === 'BO' ? compactNumber(quantity) : '',
        weight: normalizedUnit === 'BO' ? '' : compactNumber(weight),
        unitPriceVnd: unitPrice,
        amountVnd: Math.round(basis * unitPrice),
      });
    });

  if (rows.length > 0) return rows;
  return item.accessories
    .filter((accessory) => accessory.enabled !== false && accessory.lineTotalVnd > 0)
    .map((accessory) => ({
      descriptionLines: [accessory.name, accessory.note].filter(Boolean) as string[],
      unit: 'Bộ',
      quantity: compactNumber(accessory.quantityPerSet),
      weight: compactNumber(accessory.totalSet),
      unitPriceVnd: accessory.unitPriceVnd,
      amountVnd: accessory.lineTotalVnd,
    }));
}

function QuotePrintDocument({ quote, products }: { quote: ReturnType<typeof calculateQuote>; products: ProductRecord[] }) {
  const today = new Date(quote.quoteDate || new Date());
  return (
    <div className="preview-doc quote-print-doc">
      <div className="doc-title">BÁO GIÁ CÔNG TRÌNH</div>
      <div className="cust">
        <div><b>Khách hàng:</b> {quote.customerName || '—'}</div>
        <div><b>Địa chỉ:</b> {quote.customerAddress || '—'}</div>
        <div><b>SĐT:</b> {quote.customerPhone || '—'} &nbsp; <b>Email:</b> {quote.customerEmail || '—'}</div>
        <div className="doc-date">
          Ngày {today.getDate()} tháng {today.getMonth() + 1} năm {today.getFullYear()}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã SP</th>
            <th>Hình ảnh</th>
            <th>Mô tả chi tiết</th>
            <th>DV</th>
            <th>Rộng</th>
            <th>Cao</th>
            <th>SL</th>
            <th>KL</th>
            <th>Đơn giá</th>
            <th>Thành tiền</th>
          </tr>
        </thead>
        {quote.items.map((item, index) => {
          const visibleAccessories = buildQuotePrintAccessoryRows(item);
          const rowSpan = Math.max(1, item.dimensions.length + visibleAccessories.length);
          return (
            <tbody key={`${item.productCode}-${index}`} className="quote-item-block">
              {item.dimensions.map((line, lineIndex) => (
                <tr key={`d-${lineIndex}`}>
                  {lineIndex === 0 && <td rowSpan={rowSpan}>{index + 1}</td>}
                  {lineIndex === 0 && <td rowSpan={rowSpan}>{item.quoteItemCode || item.productCode}</td>}
                  {lineIndex === 0 && (
                    <td rowSpan={rowSpan} className="quote-image-cell">
                      <ProductThumb item={item} products={products} imagePath={item.image || item.coverImagePath} fill />
                    </td>
                  )}
                  {lineIndex === 0 && (
                    <td rowSpan={Math.max(1, item.dimensions.length)} className="description-cell">
                      {[
                        item.itemName,
                        ...(item.specs || [])
                          .filter((spec) => String(spec.key || '').trim())
                          .map((spec) => {
                            const key = String(spec.key).trim();
                            const value = String(spec.value || '').trim();
                            return value ? `- ${key}: ${value}` : `- ${key}`;
                          }),
                      ]
                        .filter(Boolean)
                        .map((lineText, i) => <div key={i}>{lineText}</div>)}
                    </td>
                  )}
                  <td>{unitLabel(line.unit)}</td>
                  <td>{line.unit === 'BO' ? '—' : line.widthM ?? ''}</td>
                  <td>{line.unit === 'BO' ? '—' : line.heightM ?? ''}</td>
                  <td>{line.quantity}</td>
                  <td>{line.calculatedQty}</td>
                  <td className="num">{formatVND(line.unitPriceVnd)}</td>
                  <td className="num">{formatVND(line.lineTotalVnd)}</td>
                </tr>
              ))}
              {visibleAccessories.map((accessory, accIndex) => (
                <tr key={`a-${accIndex}`} className="pk-row">
                  <td className="description-cell">
                    {accessory.descriptionLines.map((lineText, i) => <div key={i}>{lineText}</div>)}
                  </td>
                  <td>{accessory.unit}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{accessory.quantity || '—'}</td>
                  <td>{accessory.weight || '—'}</td>
                  <td className="num">{formatVND(accessory.unitPriceVnd)}</td>
                  <td className="num">{formatVND(accessory.amountVnd)}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      <div className="totals">
        <div><b>Tổng cộng:</b> {formatVND(quote.summary.totalVnd)}</div>
        <div>Làm tròn: {formatVND(quote.summary.roundedTotalVnd)}</div>
        <div>Tạm ứng: {formatVND(quote.summary.depositVnd)}</div>
        <div><b>Cần thanh toán:</b> {formatVND(quote.summary.balanceVnd)}</div>
      </div>
    </div>
  );
}

function QuoteItemCard({
  index,
  item,
  locked,
  calculated,
  suggestions,
  packageCatalog = [],
  orphanAccessoryNames = [],
  onUpdate,
  onDimension,
  onAccessory,
  onAddDimension,
  onAddAccessory,
  onCollapse,
  onExpand,
  onDuplicate,
  onDelete,
  dragHandleProps,
  products,
}: {
  index: number;
  item: QuoteItemInput;
  locked: boolean;
  calculated: ReturnType<typeof calculateQuote>['items'][number] | undefined;
  suggestions: Record<string, string[]>;
  packageCatalog?: AccessoryPackageTemplate[];
  orphanAccessoryNames?: string[];
  onUpdate: (patch: Partial<QuoteItemInput>) => void;
  onDimension: (lineIndex: number, patch: Partial<DimensionInput>) => void;
  onAccessory: (accIndex: number, patch: Partial<AccessoryInput>) => void;
  onAddDimension: () => void;
  onAddAccessory: () => void;
  onCollapse: () => void;
  onExpand: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  dragHandleProps: Record<string, unknown>;
  products: ProductRecord[];
}) {
  // Always keep an editable fixed-package shell (empty name is allowed).
  const fixedDraft =
    item.fixedAccessoryPackage != null && item.fixedAccessoryPackage !== ''
      ? parseFixedAccessoriesJson(item.fixedAccessoryPackage, 1)
      : createEmptyFixedAccessoryDraft(1);
  const extraDraft = parseExtraAccessoriesJson(item.extraAccessories);
  const usesPackageAccessories = Boolean(item.fixedAccessoryPackage || extraDraft.length > 0);
  const specs = item.specs ?? [];
  // Stable keys so clearing key/value never remounts the row (which felt like row delete).
  const specRowIds = specs.map((spec, index) => `qi-${index}-${item.productCode}-${spec.sortOrder ?? index}`);
  const updateSpec = (specIndex: number, patch: { key?: string; value?: string }) => {
    onUpdate({
      specs: specs.map((spec, currentIndex) =>
        currentIndex === specIndex ? { ...spec, ...patch, sortOrder: currentIndex } : spec,
      ),
    });
  };
  const specDrag = useDragReorder((from, to) => {
    onUpdate({
      specs: reorderList(specs, from, to).map((spec, sortOrder) => ({ ...spec, sortOrder })),
    });
  });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const imagePath = item.coverImagePath || item.image || null;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  /** Pick an image → compress/upload → persist only its Supabase CDN URL. */
  const chooseImageFromFile = async (file: File) => {
    setImageError(null);
    setImageBusy(true);
    try {
      const { url } = await compressAndUploadQuoteImage(file);
      onUpdate({ coverImagePath: url, image: url, imageReference: url, imageOverridePath: url });
    } catch (error) {
      setImageError(error instanceof ImageError ? error.message : 'Không thể tải ảnh lên Supabase.');
    } finally {
      setImageBusy(false);
    }
  };

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    if (!imagePath) {
      setLightboxUrl(OWIN_LOGO);
      return undefined;
    }
    void resolveImageUrl(imagePath).then((resolved) => {
      if (!active) return;
      if (resolved.revoke) revoked = resolved.url;
      setLightboxUrl(resolved.url || OWIN_LOGO);
    });
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [imagePath]);

  const accessorySummary = (() => {
    if (usesPackageAccessories) {
      const names = fixedDraft.items.map((row) => row.name.trim()).filter(Boolean);
      const extras = extraDraft.map((row) => row.name.trim()).filter(Boolean);
      const all = [...names, ...extras];
      if (fixedDraft.name.trim()) return `${fixedDraft.name}${all.length ? ` · ${all.slice(0, 3).join(', ')}` : ''}`;
      return all.slice(0, 4).join(', ') || '';
    }
    return item.accessories.map((acc) => acc.name).filter(Boolean).slice(0, 4).join(', ');
  })();
  const descBits = [
    item.category || item.groupName || '',
    item.description || '',
    ...(item.specs ?? []).filter((s) => s.value).slice(0, 2).map((s) => `${s.key}: ${s.value}`),
  ].filter(Boolean);

  if (locked) {
    return (
      <div className="card quote-item-card quote-item-card-locked">
        <div className="quote-item-locked-row quote-item-locked-row-rich">
          <button
            type="button"
            className="quote-item-thumb quote-item-thumb-btn quote-item-thumb-rich"
            onClick={() => setLightboxOpen(true)}
            aria-label="Xem ảnh lớn"
            title="Bấm để xem ảnh lớn"
          >
            <ProductThumb item={item} products={products} imagePath={imagePath} fill />
          </button>
          <button
            type="button"
            className="quote-item-locked-main"
            onClick={onExpand}
            aria-label={`Sửa hạng mục ${item.itemName || 'Hạng mục'}`}
            title="Bấm để sửa hạng mục"
          >
            <div className="quote-item-locked-title">
              <span className="quote-item-locked-index">#{index + 1}</span>
              <strong>{item.itemName || 'Hạng mục'}</strong>
            </div>
            {descBits.length > 0 && (
              <div className="quote-item-locked-desc">{descBits.join(' · ')}</div>
            )}
            {accessorySummary && (
              <div className="quote-item-locked-acc">
                <span>PK</span> {accessorySummary}
              </div>
            )}
            <div className="quote-item-locked-meta">
              <span className="quote-item-locked-total">{formatVND(calculated?.itemTotalVnd ?? 0)}</span>
            </div>
          </button>
          <div className="quote-item-actions quote-item-locked-actions">
            <button className="icon-btn" type="button" onClick={onDuplicate} aria-label="Nhân bản hạng mục">
              <Copy size={16} />
            </button>
            <button className="icon-btn danger" type="button" onClick={onDelete} aria-label="Xóa hạng mục">
              <Trash2 size={16} />
            </button>
            <DragHandle {...dragHandleProps} label="Kéo để đổi thứ tự hạng mục" />
          </div>
        </div>
        <ImageLightbox
          open={lightboxOpen}
          src={lightboxUrl}
          alt={item.itemName || 'Ảnh hạng mục'}
          onClose={() => setLightboxOpen(false)}
        />
      </div>
    );
  }

  return (
    <div
      className="card quote-item-card quote-item-card-editing"
      title="Nháy đúp vùng trống để thu gọn hạng mục"
      onDoubleClick={(event) => {
        const target = event.target as Element;
        const interactive = target.closest(
          'input, textarea, select, button, a, label, [contenteditable="true"], [role="combobox"], .autosuggest-menu',
        );
        if (!interactive) onCollapse();
      }}
    >
      <div className="quote-item-card-header">
        <button
          type="button"
          className="quote-item-thumb quote-item-thumb-btn quote-item-thumb-edit"
          onClick={() => imageInputRef.current?.click()}
          aria-label="Chọn ảnh từ máy"
          title="Bấm để chọn ảnh từ máy"
        >
          <ProductThumb item={item} products={products} imagePath={imagePath} fill />
          <span className="quote-item-thumb-overlay">
            {imageBusy ? <LoaderCircle size={16} className="spin" /> : <ImagePlus size={16} />}
          </span>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/*"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void chooseImageFromFile(file);
            event.target.value = '';
          }}
        />
        <div className="quote-item-card-main">
          <div className="quote-item-titleline">
            <div>
              <div className="section-label" style={{ margin: 0 }}>#{index + 1} · Đang sửa</div>
              <div className="product-sub">Tổng {formatVND(calculated?.itemTotalVnd ?? 0)}</div>
            </div>
            <div className="quote-item-actions">
              <DragHandle {...dragHandleProps} label="Kéo để đổi thứ tự hạng mục" />
              <button className="icon-btn" onClick={onDuplicate} aria-label="Nhân bản hạng mục"><Copy size={16} /></button>
              <button className="icon-btn danger" onClick={onDelete} aria-label="Xóa hạng mục"><Trash2 size={16} /></button>
            </div>
          </div>

          {imageError && <div className="hint" style={{ color: 'var(--ios-red)' }}>{imageError}</div>}

          {/* Chỉ cần Tên hạng mục — ĐVT lấy theo từng dòng kích thước (cột DV). */}
          <div className="quote-item-basic-grid quote-item-basic-grid-name-only">
            <Field
              label="Tên hạng mục"
              fieldKey="item_name"
              value={item.itemName}
              onChange={(value) => onUpdate({ itemName: value })}
              suggestions={mergeSuggestionLists(suggestions.item_name, suggestions.product_name)}
            />
          </div>
        </div>
      </div>

      <div className="quote-card-section">
        <div className="toolbar" style={{ margin: '0 0 8px' }}>
          <div className="section-label" style={{ margin: 0 }}>Kích thước</div>
          <div className="spacer" />
          <button className="icon-btn" onClick={onAddDimension} aria-label="Thêm kích thước"><Plus size={16} /></button>
        </div>
      <div className="quote-lines-editor">
        <div className="quote-lines-head">
          <span>DV</span>
          <span>Rộng</span>
          <span>Cao</span>
          <span>SL</span>
          <span>KL</span>
          <span>Đơn giá</span>
          <span>Thành tiền</span>
          <span />
        </div>
        {item.dimensions.map((line, lineIndex) => {
          const calculatedLine = calculated?.dimensions[lineIndex];
          return (
            <div key={lineIndex} className="quote-line-row">
              <select className="input" value={line.unit || item.unit} onChange={(e) => onDimension(lineIndex, { unit: e.target.value as ProductUnit })}>
                <option value="M2">m²</option>
                <option value="BO">Bộ</option>
                <option value="METER">md</option>
              </select>
              <input className="input" type="number" step="0.001" value={line.widthM ?? ''} onChange={(e) => onDimension(lineIndex, { widthM: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Rộng" />
              <input className="input" type="number" step="0.001" value={line.heightM ?? ''} onChange={(e) => onDimension(lineIndex, { heightM: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Cao" />
              <input className="input" type="number" min={1} value={line.quantity || ''} onChange={(e) => onDimension(lineIndex, { quantity: Number(e.target.value) || 1 })} placeholder="SL" />
              <div className="readonly-money muted-money">{calculatedLine?.calculatedQty?.toFixed(3) ?? '0.000'}</div>
              <CurrencyInput value={Number(line.unitPriceVnd ?? item.unitPriceVnd ?? 0)} onChange={(unitPriceVnd) => onDimension(lineIndex, { unitPriceVnd })} placeholder="Đơn giá" />
              <div className="readonly-money">{formatVND(calculatedLine?.lineTotalVnd ?? 0)}</div>
              <button className="icon-btn danger" onClick={() => onUpdate({ dimensions: item.dimensions.filter((_, i) => i !== lineIndex) })} aria-label="Xóa kích thước"><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>
      </div>

      {!usesPackageAccessories && item.accessories.length > 0 && (
        <>
          <div className="toolbar" style={{ margin: '10px 0 6px' }}>
            <div className="section-label" style={{ margin: 0 }}>Phụ kiện đi kèm cũ</div>
            <div className="spacer" />
            <button className="icon-btn" onClick={onAddAccessory} aria-label="Thêm phụ kiện"><Plus size={16} /></button>
          </div>
          {item.accessories.map((accessory, accIndex) => (
            <div key={accIndex} className="legacy-accessory-row">
              <AutoSuggestInput
                label="Tên"
                value={accessory.name}
                onChange={(name) => onAccessory(accIndex, { name })}
                suggestions={suggestions.accessory_name ?? []}
                placeholder="Tên phụ kiện"
              />
              <div className="field">
                <label>SL/Bộ</label>
                <input className="input" type="number" value={accessory.quantityPerSet || ''} onChange={(e) => onAccessory(accIndex, { quantityPerSet: Number(e.target.value) || 0 })} />
              </div>
              <div className="field">
                <label>Đơn giá</label>
                <CurrencyInput value={accessory.unitPriceVnd || 0} onChange={(unitPriceVnd) => onAccessory(accIndex, { unitPriceVnd })} />
              </div>
              <div className="field">
                <label>Trạng thái</label>
                <select className="input" value={accessory.isEnabled === false ? 'off' : 'on'} onChange={(e) => onAccessory(accIndex, { isEnabled: e.target.value === 'on' })}>
                  <option value="on">Bật</option>
                  <option value="off">Tắt</option>
                </select>
              </div>
              <button className="icon-btn danger" onClick={() => onUpdate({ accessories: item.accessories.filter((_, i) => i !== accIndex) })} aria-label="Xóa phụ kiện"><Trash2 size={16} /></button>
            </div>
          ))}
        </>
      )}

      <div className="quote-item-config-grid">
        <div className="editor-panel quote-spec-panel">
          <div className="toolbar editor-toolbar">
            <div className="section-label">Thông số kỹ thuật</div>
            <div className="spacer" />
            <button
              className="btn-link"
              type="button"
              onClick={() => onUpdate({ specs: [...specs, { key: '', value: '', sortOrder: specs.length }] })}
            >
              <Plus size={15} /> Thêm thông số
            </button>
          </div>
          <div className="spec-table-head">
            <span />
            <span>Tên thông số</span>
            <span>Giá trị</span>
            <span />
          </div>
          <div className="spec-row-list">
            {specs.length === 0 ? (
              <div className="empty-line">Chưa có thông số kỹ thuật.</div>
            ) : (
              specs.map((spec, specIndex) => (
                <div
                  key={specRowIds[specIndex]}
                  className="spec-editor-row"
                  data-row-id={specRowIds[specIndex]}
                  {...specDrag.rowProps(specIndex)}
                >
                  <DragHandle {...specDrag.handleProps(specIndex)} label="Kéo để đổi thứ tự thông số" />
                  <AutoSuggestInput
                    label="Tên"
                    fieldKey="spec_key"
                    value={spec.key}
                    onChange={(key) => updateSpec(specIndex, { key })}
                    suggestions={[...DEFAULT_SPEC_KEYS]}
                  />
                  <AutoSuggestInput
                    label="Giá trị"
                    fieldKey={`spec-value:${suggestionTypesForSpecKey(spec.key)[0] || 'spec_value'}`}
                    value={spec.value}
                    onChange={(value) => updateSpec(specIndex, { value })}
                    suggestions={specValueSuggestionsForKey(spec.key, suggestions)}
                  />
                  <div className="row-action-group">
                    <button
                      className="icon-btn danger"
                      type="button"
                      data-action="remove-row"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onUpdate({
                          specs: specs
                            .filter((_, currentIndex) => currentIndex !== specIndex)
                            .map((row, sortOrder) => ({ ...row, sortOrder })),
                        });
                      }}
                      aria-label="Xóa thông số"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <FixedAccessoryPackageEditor
          value={fixedDraft}
          onChange={(draft) =>
            onUpdate({
              // keepEmpty: empty package name never disables the accessory editor.
              fixedAccessoryPackage: serializeFixedAccessoriesJson(draft, { keepEmpty: true }),
            })
          }
          suggestions={{
            accessoryName: mergeSuggestionLists(
              suggestions.fixed_accessory_item,
              suggestions.accessory_name,
            ),
            packageName: [
              ...(suggestions.accessory_package_name ?? []),
              ...packageCatalog.map((pkg) => pkg.name),
            ],
            packageCatalog,
            orphanAccessoryNames,
          }}
        />
      </div>

      <div className="quote-item-extra">
        <ExtraAccessoriesEditor
          value={extraDraft}
          onChange={(drafts) =>
            onUpdate({
              // keepEmpty: blank extra rows stay while editing; cleaned only on quote save.
              extraAccessories: serializeExtraAccessoriesJson(drafts, { keepEmpty: true }) ?? '[]',
            })
          }
          suggestions={{ accessoryName: suggestions.extra_accessory_name ?? [] }}
          title="Phụ kiện phát sinh riêng"
        />
      </div>

      <div className="quote-item-summary-strip">
        <QuoteSummaryMetric label="Tiền sản phẩm" value={formatVND(calculated?.productSubtotalVnd ?? 0)} />
        <QuoteSummaryMetric label="Tiền phụ kiện" value={formatVND(calculated?.accessorySubtotalVnd ?? 0)} />
        <QuoteSummaryMetric label="Tổng hạng mục" value={formatVND(calculated?.itemTotalVnd ?? 0)} strong />
      </div>
    </div>
  );
}

function QuoteSummaryMetric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'summary-metric summary-metric-strong' : 'summary-metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
