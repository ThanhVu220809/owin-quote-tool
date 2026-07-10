import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Pencil, Plus, Search, X } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { useProducts } from './useProducts';
import { getProductRecord } from './productStore';
import { ProductForm } from './ProductForm';
import { ProductList } from './ProductList';
import { ProductThumb } from './ProductThumb';
import { rememberProductSuggestions } from '@/lib/suggestions';
import { useSuggestions } from '@/lib/useSuggestions';
import { formatVND } from '@/utils/format';
import { sortCategoryNames } from '@/config/categoryOrder';

const PRODUCT_SUGGESTION_TYPES = [
  'accessory_package_name',
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

function accessoryNames(products: ProductRecord[]): string[] {
  return products.flatMap((product) => [
    ...product.accessories.map((accessory) => accessory.name),
    ...fixedAccessoryItemNames(product),
    ...parseJsonArray(product.extraAccessories).map((item) => String(item.name || '')),
  ]).filter(Boolean);
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
      accessoryName: [
        ...(seededSuggestions.accessory_name ?? []),
        ...accessoryNames(productRecords),
      ],
      accessoryPackageName: [
        ...(seededSuggestions.accessory_package_name ?? []),
        ...fixedPackageNames(productRecords),
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
