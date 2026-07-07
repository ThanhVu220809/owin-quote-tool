import { useEffect, useId, useMemo, useState } from 'react';
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
import { calculateQuote } from '@/lib/quote/quoteCalculator';
import { generateQuoteCode } from '@/lib/quote/quoteCode';
import { generateSnapshot } from '@/lib/quote/quoteSnapshot';
import { createCustomQuoteItem, createQuoteItemFromProduct } from '@/lib/quote/productToQuoteItem';
import { rememberQuoteSuggestions } from '@/lib/suggestions';
import { useSuggestions } from '@/lib/useSuggestions';
import { exportQuotePDF } from '@/features/export/pdfExport';
import { ProductThumb } from '@/features/products/ProductThumb';
import { getAllQuotes, saveQuoteRecord } from './quoteStore';

const QUOTE_SUGGESTION_TYPES = [
  'customer_name',
  'customer_address',
  'item_name',
  'category',
  'accessory_name',
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
              <input className="input" type="number" value={depositVnd || ''} onChange={(e) => setDepositVnd(Number(e.target.value) || 0)} />
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
            <button key={product.id} className="pick-card" onClick={() => addProduct(product.id)}>
              <div className="nm">{product.name}</div>
              <div className="cd">{product.code} · {product.category}</div>
              <div className="cd">{formatVND(product.unitPriceVnd)}/{unitLabel(product.unit)}</div>
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
  const listId = useId();
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" list={listId} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {Array.from(new Set(suggestions.filter(Boolean))).map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
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
          const visibleAccessories = item.accessories.filter((accessory) => accessory.enabled !== false && accessory.lineTotalVnd > 0);
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
                    {[accessory.name, accessory.note].filter(Boolean).map((lineText, i) => <div key={i}>{lineText}</div>)}
                  </td>
                  <td>Bộ</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{accessory.quantityPerSet}</td>
                  <td>{accessory.totalSet}</td>
                  <td className="num">{formatVND(accessory.unitPriceVnd)}</td>
                  <td className="num">{formatVND(accessory.lineTotalVnd)}</td>
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
  const accessoryListId = useId();
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
      {item.dimensions.map((line, lineIndex) => (
        <div key={lineIndex} className="quote-table" style={{ display: 'grid', gridTemplateColumns: '80px repeat(5, minmax(72px, 1fr)) 44px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <select className="input" value={line.unit || item.unit} onChange={(e) => onDimension(lineIndex, { unit: e.target.value as ProductUnit })}>
            <option value="M2">m²</option>
            <option value="BO">Bộ</option>
            <option value="METER">md</option>
          </select>
          <input className="input" type="number" step="0.001" value={line.widthM ?? ''} onChange={(e) => onDimension(lineIndex, { widthM: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Rộng" />
          <input className="input" type="number" step="0.001" value={line.heightM ?? ''} onChange={(e) => onDimension(lineIndex, { heightM: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Cao" />
          <input className="input" type="number" value={line.quantity || ''} onChange={(e) => onDimension(lineIndex, { quantity: Number(e.target.value) || 0 })} placeholder="SL" />
          <input className="input" type="number" value={line.unitPriceVnd ?? item.unitPriceVnd} onChange={(e) => onDimension(lineIndex, { unitPriceVnd: Number(e.target.value) || 0 })} placeholder="Đơn giá" />
          <input className="input" value={line.description || ''} onChange={(e) => onDimension(lineIndex, { description: e.target.value })} placeholder="Ghi chú" />
          <button className="icon-btn danger" onClick={() => onUpdate({ dimensions: item.dimensions.filter((_, i) => i !== lineIndex) })} aria-label="Xóa kích thước"><Trash2 size={16} /></button>
        </div>
      ))}

      <div className="toolbar" style={{ margin: '10px 0 6px' }}>
        <div className="section-label" style={{ margin: 0 }}>Phụ kiện</div>
        <div className="spacer" />
        <button className="icon-btn" onClick={onAddAccessory} aria-label="Thêm phụ kiện"><Plus size={16} /></button>
      </div>
      {item.accessories.map((accessory, accIndex) => (
        <div key={accIndex} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px 90px 44px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input className="input" list={accessoryListId} value={accessory.name} onChange={(e) => onAccessory(accIndex, { name: e.target.value })} placeholder="Tên phụ kiện" />
          <input className="input" type="number" value={accessory.quantityPerSet || ''} onChange={(e) => onAccessory(accIndex, { quantityPerSet: Number(e.target.value) || 0 })} />
          <input className="input" type="number" value={accessory.unitPriceVnd || ''} onChange={(e) => onAccessory(accIndex, { unitPriceVnd: Number(e.target.value) || 0 })} />
          <select className="input" value={accessory.isEnabled === false ? 'off' : 'on'} onChange={(e) => onAccessory(accIndex, { isEnabled: e.target.value === 'on' })}>
            <option value="on">Bật</option>
            <option value="off">Tắt</option>
          </select>
          <button className="icon-btn danger" onClick={() => onUpdate({ accessories: item.accessories.filter((_, i) => i !== accIndex) })} aria-label="Xóa phụ kiện"><Trash2 size={16} /></button>
        </div>
      ))}
      <datalist id={accessoryListId}>
        {Array.from(new Set((suggestions.accessory_name ?? []).filter(Boolean))).map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      <div className="two-col" style={{ gap: 12 }}>
        <div className="field">
          <label>Bộ phụ kiện cố định JSON</label>
          <textarea className="input" value={item.fixedAccessoryPackage || ''} onChange={(e) => onUpdate({ fixedAccessoryPackage: e.target.value || null })} rows={3} />
        </div>
        <div className="field">
          <label>Phụ kiện phát sinh JSON</label>
          <textarea className="input" value={item.extraAccessories || ''} onChange={(e) => onUpdate({ extraAccessories: e.target.value || null })} rows={3} />
        </div>
      </div>
    </div>
  );
}
