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
  'category',
  'product_name',
  'spec_value',
  'accessory_name',
] as const;

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
      accessoryName: [
        ...(seededSuggestions.accessory_name ?? []),
        ...productRecords.flatMap((p) => p.accessories.map((a) => a.name)).filter(Boolean),
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
