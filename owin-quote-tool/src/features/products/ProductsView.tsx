import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { useProducts } from './useProducts';
import { ProductForm } from './ProductForm';
import { ProductList } from './ProductList';

/** Màn quản lý sản phẩm gốc (catalog). */
export function ProductsView() {
  const { productRecords, loading, saveProduct, deleteProduct } = useProducts();
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Gợi ý auto-suggest rút từ các giá trị đã nhập trong catalog.
  const suggestions = useMemo(
    () => ({
      category: productRecords.map((p) => p.category).filter(Boolean),
      productName: productRecords.map((p) => p.name).filter(Boolean),
      specKey: productRecords.flatMap((p) => p.specs.map((s) => s.key)).filter(Boolean),
      specValue: productRecords.flatMap((p) => p.specs.map((s) => s.value)).filter(Boolean),
      accessoryName: productRecords.flatMap((p) => p.accessories.map((a) => a.name)).filter(Boolean),
    }),
    [productRecords],
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
            onSave={saveProduct}
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
