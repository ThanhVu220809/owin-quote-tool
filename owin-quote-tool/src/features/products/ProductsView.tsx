import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Pencil, Plus, Search, X, Percent } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { useProducts } from './useProducts';
import { bulkAdjustProductPrices, getProductRecord } from './productStore';
import { ProductForm } from './ProductForm';
import { ProductList } from './ProductList';
import { ProductThumb } from './ProductThumb';
import { rememberProductSuggestions } from '@/lib/suggestions';
import { useSuggestions } from '@/lib/useSuggestions';
import { formatVND } from '@/utils/format';
import { sortCategoryNames } from '@/config/categoryOrder';

const PRODUCT_SUGGESTION_TYPES = [
  'accessory_package_name',
  'fixed_accessory_item',
  'extra_accessory_name',
  'category',
  'product_name',
  'item_name',
  'color',
  'frame',
  'sash',
  'thickness',
  'glass',
  'molding',
  'protection_bar',
  'spec_value',
  'spec_value_color',
  'spec_value_frame',
  'spec_value_glass',
  'spec_value_molding',
  'spec_value_protection_bar',
  'spec_value_sash',
  'spec_value_thickness',
  'accessory_name',
  'jamb',
  'spec_value_jamb',
] as const;

function normalizeSpecKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function specValuesByKey(products: ProductRecord[], matcher: (key: string) => boolean): string[] {
  return products
    .flatMap((product) => product.specs.filter((spec) => matcher(normalizeSpecKey(spec.key))).map((spec) => spec.value))
    .filter(Boolean);
}

function parseJsonArray(value: string | null | undefined): Array<Record<string, unknown>> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fixedPackageNames(products: ProductRecord[]): string[] {
  return products
    .map((product) => {
      if (!product.fixedAccessoryPackage) return '';
      try {
        return String((JSON.parse(product.fixedAccessoryPackage) as Record<string, unknown>).name || '');
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function fixedAccessoryItemNames(product: ProductRecord): string[] {
  if (!product.fixedAccessoryPackage) return [];
  try {
    const fixed = JSON.parse(product.fixedAccessoryPackage) as { items?: Array<{ name?: unknown }> };
    return Array.isArray(fixed.items) ? fixed.items.map((item) => String(item.name || '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function fixedAccessoryNames(products: ProductRecord[]): string[] {
  return products.flatMap((product) => [
    ...product.accessories.map((accessory) => accessory.name),
    ...fixedAccessoryItemNames(product),
  ]).filter(Boolean);
}

function extraAccessoryNames(products: ProductRecord[]): string[] {
  return products
    .flatMap((product) => parseJsonArray(product.extraAccessories).map((item) => String(item.name || '')))
    .filter(Boolean);
}

/** Màn quản lý sản phẩm gốc (catalog). */
export function ProductsView({ onOpenCatalogue }: { onOpenCatalogue?: () => void }) {
  const { productRecords, loading, saveProduct, deleteProduct } = useProducts();
  const { suggestions: seededSuggestions, refreshSuggestions } = useSuggestions(PRODUCT_SUGGESTION_TYPES);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [previewProduct, setPreviewProduct] = useState<ProductRecord | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkPercent, setBulkPercent] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // Field-specific suggestion pools (no noisy global bucket for all fields).
  const suggestions = useMemo(
    () => ({
      category: [
        ...(seededSuggestions.category ?? []),
        ...productRecords.map((p) => p.category).filter(Boolean),
      ],
      productName: [
        ...(seededSuggestions.product_name ?? []),
        ...(seededSuggestions.item_name ?? []),
        ...productRecords.map((p) => p.name).filter(Boolean),
      ],
      // Spec keys are strict presets only — never mix random learned labels.
      specKey: [] as string[],
      specValue: [
        ...(seededSuggestions.spec_value ?? []),
      ],
      specValueColor: [
        ...(seededSuggestions.color ?? []),
        ...(seededSuggestions.spec_value_color ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('mau')),
      ],
      specValueFrame: [
        ...(seededSuggestions.frame ?? []),
        ...(seededSuggestions.spec_value_frame ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('khung') || key.includes('khuon')),
      ],
      specValueJamb: [
        ...(seededSuggestions.jamb ?? []),
        ...(seededSuggestions.spec_value_jamb ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('khuon')),
      ],
      specValueSash: [
        ...(seededSuggestions.sash ?? []),
        ...(seededSuggestions.spec_value_sash ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('canh')),
      ],
      specValueThickness: [
        ...(seededSuggestions.thickness ?? []),
        ...(seededSuggestions.spec_value_thickness ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('day')),
      ],
      specValueGlass: [
        ...(seededSuggestions.glass ?? []),
        ...(seededSuggestions.spec_value_glass ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('kinh')),
      ],
      specValueMolding: [
        ...(seededSuggestions.molding ?? []),
        ...(seededSuggestions.spec_value_molding ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('phao')),
      ],
      specValueProtectionBar: [
        ...(seededSuggestions.protection_bar ?? []),
        ...(seededSuggestions.spec_value_protection_bar ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('song') || key.includes('bao ve')),
      ],
      // Fixed package item names only (not extras).
      accessoryName: [
        ...(seededSuggestions.fixed_accessory_item ?? []),
        ...(seededSuggestions.accessory_name ?? []),
        ...fixedAccessoryNames(productRecords),
      ],
      accessoryPackageName: [
        ...(seededSuggestions.accessory_package_name ?? []),
        ...fixedPackageNames(productRecords),
      ],
      // Extra accessories only — separate from fixed package.
      extraAccessoryName: [
        ...(seededSuggestions.extra_accessory_name ?? []),
        ...extraAccessoryNames(productRecords),
      ],
    }),
    [productRecords, seededSuggestions],
  );

  const openNew = () => {
    setEditing(null);
    setMessage('');
    setShowForm(true);
  };
  const openEdit = (p: ProductRecord) => {
    setEditing(p);
    setMessage('');
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (p: ProductRecord) => {
    if (confirm(`Xoá sản phẩm "${p.name}" (${p.code})?`)) {
      await deleteProduct(p.id);
      setMessage(`Đã xoá "${p.name}".`);
    }
  };

  const handleDuplicate = async (p: ProductRecord) => {
    setDuplicatingId(p.id);
    setMessage('');
    try {
      const copyCode = `${p.code}-COPY-${String(Date.now()).slice(-4)}`;
      const saved = await saveProduct({
        ...p,
        id: undefined,
        numericId: undefined,
        code: copyCode,
        name: `Copy: ${p.name}`,
        isFeatured: false,
        createdAt: undefined,
        updatedAt: undefined,
        deletedAt: null,
        deleted: undefined,
      });
      const record = await getProductRecord(saved.id);
      if (record) {
        await rememberProductSuggestions(record);
        setEditing(record);
        setShowForm(true);
      }
      await refreshSuggestions();
      setMessage(`Đã nhân bản "${p.name}".`);
    } finally {
      setDuplicatingId(null);
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(productRecords.map((product) => product.category).filter(Boolean))).sort(sortCategoryNames),
    [productRecords],
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return productRecords.filter((product) => {
      const categoryOk = !selectedCategory || product.category === selectedCategory;
      const text = [
        product.code,
        product.name,
        product.category,
        product.unit,
        product.rawSizeText,
        product.specs.map((spec) => `${spec.key} ${spec.value}`).join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return categoryOk && (!q || text.includes(q));
    });
  }, [productRecords, searchQuery, selectedCategory]);

  const handleSave: typeof saveProduct = async (input) => {
    const saved = await saveProduct(input);
    const record = await getProductRecord(saved.id);
    if (record) await rememberProductSuggestions(record);
    await refreshSuggestions();
    return saved;
  };

  const bulkPercentValue = Number(bulkPercent.replace(',', '.'));
  const bulkPreview = Number.isFinite(bulkPercentValue)
    ? productRecords.map((product) => ({
        product,
        nextPrice: Math.max(0, Math.round(product.unitPriceVnd * (1 + bulkPercentValue / 100))),
      }))
    : [];

  const applyBulkPrice = async () => {
    if (!Number.isFinite(bulkPercentValue) || bulkPercent.trim() === '') return;
    if (!confirm(`Áp dụng thay đổi ${bulkPercentValue}% cho ${productRecords.length} sản phẩm đang hoạt động?`)) return;
    setBulkSaving(true);
    try {
      await bulkAdjustProductPrices(bulkPercentValue);
      setMessage(`Đã cập nhật giá ${productRecords.length} sản phẩm.`);
      setBulkPriceOpen(false);
      setBulkPercent('');
    } finally {
      setBulkSaving(false);
    }
  };

  if (showForm) {
    return (
      <section className="admin-page product-workflow-page">
        <div className="admin-page-heading">
          <div className="title-row">
            <button className="admin-back-button" onClick={closeForm} aria-label="Quay lại danh sách sản phẩm">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="app-title">{editing ? 'Cập nhật sản phẩm' : 'Tạo sản phẩm mới'}</h1>
              <p className="app-subtitle">Thiết lập thông tin, thông số, phụ kiện và ảnh sản phẩm.</p>
            </div>
          </div>
        </div>
        <ProductForm
          key={editing?.id ?? 'new'}
          editing={editing}
          suggestions={suggestions}
          onSave={handleSave}
          onCancel={closeForm}
        />
      </section>
    );
  }

  return (
    <section className="admin-page product-workflow-page">
      <div className="admin-page-heading">
        <div>
          <h1 className="app-title">Quản lý sản phẩm</h1>
          <p className="app-subtitle">
            {loading ? 'Đang tải danh mục sản phẩm…' : `Danh mục sản phẩm nhôm kính của hệ thống · ${productRecords.length} sản phẩm`}
          </p>
        </div>
        <div className="product-header-actions">
          <button className="btn btn-ghost" onClick={onOpenCatalogue}>
            <BookOpen size={17} style={{ verticalAlign: '-3px' }} /> Bảng giá
          </button>
          <button className="btn btn-ghost" onClick={() => setBulkPriceOpen(true)} disabled={!productRecords.length}>
            <Percent size={17} style={{ verticalAlign: '-3px' }} /> Cập nhật giá hàng loạt
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={18} style={{ verticalAlign: '-3px' }} /> Thêm sản phẩm
          </button>
        </div>
      </div>

      {message && <div className="product-toast">{message}</div>}

      <div className="product-filter-card">
        <div className="field product-filter-search">
          <label><Search size={15} style={{ verticalAlign: '-2px' }} /> Tìm sản phẩm</label>
          <input
            className="input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tìm theo tên hoặc nhóm sản phẩm..."
          />
        </div>
        <div className="field">
          <label>Nhóm sản phẩm</label>
          <select className="input" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
            <option value="">Tất cả nhóm sản phẩm</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      <ProductList
        products={filteredProducts}
        loading={loading}
        totalCount={productRecords.length}
        duplicatingId={duplicatingId}
        onEdit={openEdit}
        onDelete={handleDelete}
        onDuplicate={(product) => void handleDuplicate(product)}
        onPreview={setPreviewProduct}
      />

      {bulkPriceOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => !bulkSaving && setBulkPriceOpen(false)}>
          <div className="bulk-price-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-price-title" onClick={(event) => event.stopPropagation()}>
            <div className="product-preview-header">
              <div>
                <div className="product-name" id="bulk-price-title">Cập nhật giá hàng loạt</div>
                <div className="product-sub">Chỉ áp dụng cho sản phẩm đang hoạt động · không chạm sản phẩm đã xoá</div>
              </div>
              <button className="icon-btn" onClick={() => setBulkPriceOpen(false)} aria-label="Đóng"><X size={17} /></button>
            </div>
            <div className="bulk-price-body">
              <div className="field">
                <label htmlFor="bulk-percent">Điều chỉnh (%)</label>
                <input id="bulk-percent" className="input" inputMode="decimal" value={bulkPercent} onChange={(event) => setBulkPercent(event.target.value)} placeholder="Ví dụ: 5 hoặc -3" autoFocus />
              </div>
              {bulkPercent.trim() !== '' && Number.isFinite(bulkPercentValue) && (
                <div className="bulk-price-preview">
                  <div className="bulk-price-preview-head"><span>Sản phẩm</span><span>Giá cũ → giá mới</span></div>
                  {bulkPreview.slice(0, 8).map(({ product, nextPrice }) => <div key={product.id}><span>{product.name}</span><strong>{formatVND(product.unitPriceVnd)} → {formatVND(nextPrice)}</strong></div>)}
                  {bulkPreview.length > 8 && <small>… và {bulkPreview.length - 8} sản phẩm khác</small>}
                </div>
              )}
              <div className="toolbar">
                <div className="spacer" />
                <button className="btn btn-ghost" onClick={() => setBulkPriceOpen(false)} disabled={bulkSaving}>Huỷ</button>
                <button className="btn btn-primary" onClick={() => void applyBulkPrice()} disabled={bulkSaving || bulkPercent.trim() === '' || !Number.isFinite(bulkPercentValue)}>{bulkSaving ? 'Đang cập nhật…' : 'Xác nhận áp dụng'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewProduct && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPreviewProduct(null)}>
          <div className="product-preview-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="product-preview-header">
              <div>
                <div className="product-name">{previewProduct.name}</div>
                <div className="product-sub">{previewProduct.category} · {formatVND(previewProduct.unitPriceVnd)}</div>
              </div>
              <button className="icon-btn" onClick={() => setPreviewProduct(null)} aria-label="Đóng xem ảnh">
                <X size={17} />
              </button>
            </div>
            <div className="product-preview-body">
              <div className="product-preview-image">
                <ProductThumb imagePath={previewProduct.coverImagePath} fill />
              </div>
              <div className="product-preview-meta">
                <div>
                  <span>Danh mục</span>
                  <strong>{previewProduct.category}</strong>
                </div>
                <div>
                  <span>Đơn vị</span>
                  <strong>{previewProduct.unit === 'BO' ? 'Bộ' : previewProduct.unit === 'METER' ? 'md' : 'm²'}</strong>
                </div>
                <div>
                  <span>Kích thước mẫu</span>
                  <strong>{previewProduct.rawSizeText || '—'}</strong>
                </div>
                <div>
                  <span>Đơn giá</span>
                  <strong>{formatVND(previewProduct.unitPriceVnd)}</strong>
                </div>
                <button className="btn btn-primary" onClick={() => openEdit(previewProduct)}>
                  <Pencil size={16} style={{ verticalAlign: '-3px' }} /> Chỉnh sửa sản phẩm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
