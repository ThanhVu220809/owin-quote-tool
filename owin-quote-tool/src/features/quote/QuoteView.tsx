import { useEffect, useMemo, useState } from 'react';
import { Copy, FileDown, Plus, Printer, Save, Search, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type {
  AccessoryInput,
  DimensionInput,
  ProductUnit,
  QuoteInput,
  QuoteItemInput,
  QuoteRecord,
} from '@/types/models';
import { useProducts } from '@/features/products/useProducts';
import { formatVND } from '@/utils/format';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ExtraAccessoriesEditor, FixedAccessoryPackageEditor } from '@/components/AccessoryEditors';
import { calculateQuote } from '@/lib/quote/quoteCalculator';
import { generateQuoteCode } from '@/lib/quote/quoteCode';
import { generateSnapshot } from '@/lib/quote/quoteSnapshot';
import { createCustomQuoteItem, createQuoteItemFromProduct } from '@/lib/quote/productToQuoteItem';
import { rememberQuoteSuggestions } from '@/lib/suggestions';
import { useSuggestions } from '@/lib/useSuggestions';
import { exportQuotePDF } from '@/features/export/pdfExport';
import { ProductThumb } from '@/features/products/ProductThumb';
import {
  parseExtraAccessoriesJson,
  parseFixedAccessoriesJson,
  serializeExtraAccessoriesJson,
  serializeFixedAccessoriesJson,
} from '@/lib/quote/accessoryDrafts';
import { getAllQuotes, saveQuoteRecord } from './quoteStore';

const QUOTE_SUGGESTION_TYPES = [
  'customer_name',
  'customer_address',
  'item_name',
  'category',
  'accessory_name',
  'accessory_package_name',
] as const;

const todayInputValue = () => new Date().toISOString().slice(0, 10);

function makeItemCode(index: number): string {
  return `HM-${String(index + 1).padStart(2, '0')}`;
}

function unitLabel(unit: ProductUnit): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

function snapshotToInputs(quote: QuoteRecord): QuoteItemInput[] {
  return quote.snapshot.items.map((item) => ({
    sourceType: item.sourceType,
    productId: item.productId || null,
    productCode: item.quoteItemCode || item.productCode,
    quoteItemCode: item.quoteItemCode || item.productCode,
    itemName: item.itemName,
    productType: item.productType || null,
    category: item.category || item.groupName || null,
    groupName: item.groupName || item.category || null,
    coverImagePath: item.coverImagePath || item.image || null,
    image: item.image || item.coverImagePath || null,
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
    fixedAccessoryPackage: item.fixedAccessoryPackage || null,
    extraAccessories: item.extraAccessories || null,
    numericId: item.numericId || null,
  }));
}

export function QuoteView() {
  const { productRecords, loading } = useProducts();
  const { suggestions: seededSuggestions, refreshSuggestions } = useSuggestions(QUOTE_SUGGESTION_TYPES);
  const [history, setHistory] = useState<QuoteRecord[]>([]);
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
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const refreshHistory = async () => setHistory(await getAllQuotes());

  useEffect(() => {
    void refreshHistory();
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

  const quoteInput: QuoteInput = useMemo(
    () => ({
      customerId: null,
      customerName,
      customerPhone,
      customerEmail: customerEmail || null,
      customerAddress,
      quoteDate,
      depositVnd,
      items,
    }),
    [customerAddress, customerEmail, customerName, customerPhone, depositVnd, items, quoteDate],
  );
  const calculated = useMemo(() => calculateQuote(quoteInput), [quoteInput]);

  const resetForm = () => {
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
    setMessage('');
  };

  const addProduct = (productId: string) => {
    const product = productRecords.find((item) => item.id === productId);
    if (!product) return;
    setItems((current) => [...current, createQuoteItemFromProduct(product, makeItemCode(current.length))]);
  };

  const addCustom = () => setItems((current) => [...current, createCustomQuoteItem(makeItemCode(current.length))]);

  const updateItem = (index: number, patch: Partial<QuoteItemInput>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

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

  const persistQuote = async (
    nextStatus: 'DRAFT' | 'SAVED' | 'EXPORTED' = 'SAVED',
    options: { code?: string; exportFileName?: string } = {},
  ): Promise<QuoteRecord> => {
    setSaving(true);
    setMessage('');
    try {
      const existing = await getAllQuotes();
      const existingRecord = quoteId ? existing.find((quote) => quote.id === quoteId) ?? null : null;
      const code = options.code || quoteCode || generateQuoteCode(existing);
      const snapshot = generateSnapshot({ ...calculated, quoteCode: code }, code, new Date());
      const saved = await saveQuoteRecord({
        id: quoteId || undefined,
        code,
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
          productCode: item.quoteItemCode || item.productCode,
          itemName: item.itemName,
          category: item.category || null,
          imagePath: item.image || item.coverImagePath || null,
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
                type: 'docx',
                fileName: options.exportFileName,
                filePath: null,
                createdAt: new Date().toISOString(),
              },
            ]
          : existingRecord?.exports ?? [],
        folderPath: null,
        deletedAt: null,
      });
      setQuoteId(saved.id);
      setQuoteCode(saved.code);
      setStatus(saved.status);
      setMessage(`Đã lưu ${saved.code}`);
      await rememberQuoteSuggestions(quoteInput);
      await refreshSuggestions();
      await refreshHistory();
      return saved;
    } finally {
      setSaving(false);
    }
  };

  const exportWord = async () => {
    if (items.length === 0) return;
    setSaving(true);
    setMessage('');
    try {
      const existing = await getAllQuotes();
      const code = quoteCode || generateQuoteCode(existing);
      const { exportQuoteWord } = await import('@/features/export/wordExport');
      const fileName = await exportQuoteWord({ ...calculated, quoteCode: code }, code);
      await persistQuote('EXPORTED', { code, exportFileName: fileName });
    } finally {
      setSaving(false);
    }
  };

  const loadQuote = (quote: QuoteRecord, duplicate = false) => {
    setQuoteId(duplicate ? null : quote.id);
    setQuoteCode(duplicate ? '' : quote.code);
    setStatus(duplicate ? 'DRAFT' : quote.status);
    setCustomerName(quote.customerName);
    setCustomerPhone(quote.customerPhone);
    setCustomerEmail(quote.customerEmail || '');
    setCustomerAddress(quote.customerAddress);
    setQuoteDate((quote.quoteDate || quote.createdAt).slice(0, 10));
    setDepositVnd(quote.depositVnd);
    setItems(snapshotToInputs(quote));
    setMessage(duplicate ? `Đã nhân bản từ ${quote.code}` : `Đã tải ${quote.code}`);
  };

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="app-title">Tạo báo giá</h1>
          <p className="app-subtitle">
            {loading ? 'Đang tải kho…' : `${productRecords.length} sản phẩm · ${history.length} báo giá đã lưu`}
          </p>
        </div>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={resetForm}>Báo giá mới</button>
        <button className="btn btn-primary" disabled={items.length === 0 || saving} onClick={() => void persistQuote('SAVED')}>
          <Save size={17} style={{ verticalAlign: '-3px' }} /> {saving ? 'Đang lưu…' : 'Lưu báo giá'}
        </button>
        <button className="btn btn-ghost" disabled={items.length === 0 || saving} onClick={() => void exportWord()}>
          <FileDown size={17} style={{ verticalAlign: '-3px' }} /> Word
        </button>
        <button className="btn btn-ghost" disabled={items.length === 0} onClick={exportQuotePDF}>
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
          {message && <div className="product-sub" style={{ color: 'var(--ios-green)' }}>{message}</div>}
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="toolbar" style={{ margin: 0 }}>
          <div className="section-label" style={{ margin: 0 }}>Chọn sản phẩm</div>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={addCustom}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> Hạng mục tùy chỉnh
          </button>
        </div>
        <div className="two-col">
          <div className="field">
            <label><Search size={14} style={{ verticalAlign: '-2px' }} /> Tìm sản phẩm</label>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="field">
            <label>Danh mục</label>
            <select className="input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Tất cả</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        </div>
        <div className="pick-grid">
          {filteredProducts.map((product) => (
            <button key={product.id} className="pick-card product-pick-card" onClick={() => addProduct(product.id)}>
              <ProductThumb imagePath={product.coverImagePath} fill />
              <div className="nm">{product.name}</div>
              <div className="cd">{product.code} · {product.category}</div>
              <div className="pick-price">{formatVND(product.unitPriceVnd)}/{unitLabel(product.unit)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Hạng mục báo giá ({items.length})</div>
        {items.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>Chưa có hạng mục nào.</div>
        ) : (
          <div className="stack">
            {items.map((item, index) => (
              <QuoteItemCard
                key={`${item.productCode}-${index}`}
                index={index}
                item={item}
                calculated={calculated.items[index]}
                suggestions={seededSuggestions}
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
                    accessories: [...item.accessories, { name: '', quantityPerSet: 1, unitPriceVnd: 0, note: null, isEnabled: true }],
                  })
                }
                onDuplicate={() => setItems((current) => [...current.slice(0, index + 1), { ...item, productCode: makeItemCode(current.length), quoteItemCode: makeItemCode(current.length) }, ...current.slice(index + 1)])}
                onMoveUp={() => index > 0 && setItems((current) => current.map((row, i) => (i === index - 1 ? current[index] : i === index ? current[index - 1] : row)))}
                onMoveDown={() => index < items.length - 1 && setItems((current) => current.map((row, i) => (i === index + 1 ? current[index] : i === index ? current[index + 1] : row)))}
                onDelete={() => setItems((current) => current.filter((_, i) => i !== index))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Lịch sử báo giá</div>
        {history.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>Chưa có báo giá đã lưu.</div>
        ) : (
          history.map((quote) => (
            <div key={quote.id} className="product-row">
              <div className="product-meta">
                <div className="product-name">{quote.code}</div>
                <div className="product-sub">
                  {quote.customerName || 'Khách chưa đặt tên'} · {quote.status} · {formatVND(quote.roundedTotalVnd)}
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-ghost" onClick={() => loadQuote(quote)}>Mở</button>
                <button className="icon-btn" onClick={() => loadQuote(quote, true)} aria-label="Nhân bản">
                  <Copy size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <QuotePrintDocument quote={calculated} />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suggestions = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
}) {
  if (suggestions.length > 0) {
    return (
      <AutoSuggestInput
        label={label}
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

function QuotePrintDocument({ quote }: { quote: ReturnType<typeof calculateQuote> }) {
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
                      <ProductThumb imagePath={item.image || item.coverImagePath} fill />
                    </td>
                  )}
                  {lineIndex === 0 && (
                    <td rowSpan={Math.max(1, item.dimensions.length)} className="description-cell">
                      {[item.itemName, item.description, ...(item.specs || []).map((spec) => `- ${spec.key}: ${spec.value}`)]
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
  calculated,
  suggestions,
  onUpdate,
  onDimension,
  onAccessory,
  onAddDimension,
  onAddAccessory,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  index: number;
  item: QuoteItemInput;
  calculated: ReturnType<typeof calculateQuote>['items'][number] | undefined;
  suggestions: Record<string, string[]>;
  onUpdate: (patch: Partial<QuoteItemInput>) => void;
  onDimension: (lineIndex: number, patch: Partial<DimensionInput>) => void;
  onAccessory: (accIndex: number, patch: Partial<AccessoryInput>) => void;
  onAddDimension: () => void;
  onAddAccessory: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const fixedDraft = parseFixedAccessoriesJson(item.fixedAccessoryPackage, 1);
  const extraDraft = parseExtraAccessoriesJson(item.extraAccessories);
  const usesPackageAccessories = Boolean(item.fixedAccessoryPackage || extraDraft.length > 0);
  return (
    <div className="card" style={{ marginBottom: 12, boxShadow: 'none' }}>
      <div className="toolbar" style={{ margin: 0 }}>
        <div>
          <div className="section-label" style={{ margin: 0 }}>#{index + 1} · {item.productCode}</div>
          <div className="product-sub">{formatVND(calculated?.itemTotalVnd ?? 0)}</div>
        </div>
        <div className="spacer" />
        <button className="icon-btn" onClick={onMoveUp} aria-label="Lên"><ChevronUp size={16} /></button>
        <button className="icon-btn" onClick={onMoveDown} aria-label="Xuống"><ChevronDown size={16} /></button>
        <button className="icon-btn" onClick={onDuplicate} aria-label="Nhân bản"><Copy size={16} /></button>
        <button className="icon-btn danger" onClick={onDelete} aria-label="Xóa"><Trash2 size={16} /></button>
      </div>

      <div className="two-col">
        <Field label="Mã hạng mục" value={item.productCode} onChange={(value) => onUpdate({ productCode: value, quoteItemCode: value })} />
        <Field label="Tên hạng mục" value={item.itemName} onChange={(value) => onUpdate({ itemName: value })} suggestions={suggestions.item_name} />
        <Field label="Nhóm" value={item.category || ''} onChange={(value) => onUpdate({ category: value, groupName: value })} suggestions={suggestions.category} />
        <div className="field">
          <label>ĐVT chính</label>
          <select className="input" value={item.unit} onChange={(e) => onUpdate({ unit: e.target.value as ProductUnit })}>
            <option value="M2">m²</option>
            <option value="BO">Bộ</option>
            <option value="METER">md</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Mô tả</label>
        <textarea className="input" value={item.description || ''} onChange={(e) => onUpdate({ description: e.target.value })} rows={2} />
      </div>

      <div className="toolbar" style={{ margin: '10px 0 6px' }}>
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
          <span>Ghi chú</span>
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
              <input className="input" value={line.description || ''} onChange={(e) => onDimension(lineIndex, { description: e.target.value })} placeholder="Ghi chú" />
              <button className="icon-btn danger" onClick={() => onUpdate({ dimensions: item.dimensions.filter((_, i) => i !== lineIndex) })} aria-label="Xóa kích thước"><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>

      {!usesPackageAccessories && (
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

      <div className="two-col" style={{ gap: 12, marginTop: 14 }}>
        {item.fixedAccessoryPackage ? (
          <FixedAccessoryPackageEditor
            value={fixedDraft}
            onChange={(draft) => onUpdate({ fixedAccessoryPackage: serializeFixedAccessoriesJson(draft) })}
            suggestions={{
              accessoryName: suggestions.accessory_name ?? [],
              packageName: suggestions.accessory_package_name ?? [],
            }}
          />
        ) : (
          <div className="editor-panel">
            <div className="section-label">Bộ phụ kiện cố định</div>
            <div className="empty-line">Item này chưa dùng bộ phụ kiện cố định.</div>
            <button
              className="btn-link"
              type="button"
              onClick={() => onUpdate({ fixedAccessoryPackage: serializeFixedAccessoriesJson(fixedDraft) })}
            >
              <Plus size={15} /> Thêm bộ phụ kiện
            </button>
          </div>
        )}
        <ExtraAccessoriesEditor
          value={extraDraft}
          onChange={(drafts) => onUpdate({ extraAccessories: serializeExtraAccessoriesJson(drafts) })}
          suggestions={{ accessoryName: suggestions.accessory_name ?? [] }}
          title="Phụ kiện phát sinh riêng"
        />
      </div>
    </div>
  );
}
