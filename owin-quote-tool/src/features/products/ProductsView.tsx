import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { useProducts } from './useProducts';
import { getProductRecord } from './productStore';
import { ProductForm } from './ProductForm';
import { ProductList } from './ProductList';
import { rememberProductSuggestions } from '@/lib/suggestions';
import { useSuggestions } from '@/lib/useSuggestions';

const PRODUCT_SUGGESTION_TYPES = [
  'accessory_package_name',
  'category',
  'product_name',
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
export function ProductsView() {
  const { productRecords, loading, saveProduct, deleteProduct } = useProducts();
  const { suggestions: seededSuggestions, refreshSuggestions } = useSuggestions(PRODUCT_SUGGESTION_TYPES);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Gợi ý auto-suggest rút từ các giá trị đã nhập trong catalog.
  const suggestions = useMemo(
    () => ({
      category: [
        ...(seededSuggestions.category ?? []),
        ...productRecords.map((p) => p.category).filter(Boolean),
      ],
      productName: [
        ...(seededSuggestions.product_name ?? []),
        ...productRecords.map((p) => p.name).filter(Boolean),
      ],
      specKey: productRecords.flatMap((p) => p.specs.map((s) => s.key)).filter(Boolean),
      specValue: [
        ...(seededSuggestions.spec_value ?? []),
        ...productRecords.flatMap((p) => p.specs.map((s) => s.value)).filter(Boolean),
      ],
      specValueColor: [
        ...(seededSuggestions.spec_value_color ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('mau')),
      ],
      specValueFrame: [
        ...(seededSuggestions.spec_value_frame ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('khung')),
      ],
      specValueSash: [
        ...(seededSuggestions.spec_value_sash ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('canh')),
      ],
      specValueThickness: [
        ...(seededSuggestions.spec_value_thickness ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('day')),
      ],
      specValueGlass: [
        ...(seededSuggestions.spec_value_glass ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('kinh')),
      ],
      specValueMolding: [
        ...(seededSuggestions.spec_value_molding ?? []),
        ...specValuesByKey(productRecords, (key) => key.includes('phao')),
      ],
      specValueProtectionBar: [
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
    setShowForm(true);
  };
  const openEdit = (p: ProductRecord) => {
    setEditing(p);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (p: ProductRecord) => {
    if (confirm(`Xoá sản phẩm "${p.name}" (${p.code})?`)) {
      await deleteProduct(p.id);
    }
  };

  const handleSave: typeof saveProduct = async (input) => {
    const saved = await saveProduct(input);
    const record = await getProductRecord(saved.id);
    if (record) await rememberProductSuggestions(record);
    await refreshSuggestions();
    return saved;
  };

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="app-title">Kho sản phẩm gốc</h1>
          <p className="app-subtitle">{loading ? 'Đang tải…' : `${productRecords.length} sản phẩm`}</p>
        </div>
        <div className="spacer" />
        {!showForm && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={18} style={{ verticalAlign: '-3px' }} /> Thêm sản phẩm
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ marginBottom: 20 }}>
          <ProductForm
            key={editing?.id ?? 'new'}
            editing={editing}
            suggestions={suggestions}
            onSave={handleSave}
            onCancel={closeForm}
          />
        </div>
      )}

      <div className="card">
        <ProductList products={productRecords} onEdit={openEdit} onDelete={handleDelete} />
      </div>
    </div>
  );
}
