import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Product } from '@/types/models';
import { useProducts } from './useProducts';
import { ProductForm } from './ProductForm';
import { ProductList } from './ProductList';

/** Màn quản lý sản phẩm gốc (catalog). */
export function ProductsView() {
  const { products, loading, saveProduct, deleteProduct } = useProducts();
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Gợi ý auto-suggest rút từ các giá trị đã nhập trong catalog.
  const suggestions = useMemo(
    () => ({
      mau: products.map((p) => p.mau ?? '').filter(Boolean),
      heNhom: products.map((p) => p.heNhom ?? '').filter(Boolean),
      khungBao: products.map((p) => p.khungBao ?? '').filter(Boolean),
      banCanh: products.map((p) => p.banCanh ?? '').filter(Boolean),
      kinh: products.map((p) => p.kinh ?? '').filter(Boolean),
    }),
    [products],
  );

  const openNew = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (p: Product) => {
    if (confirm(`Xoá sản phẩm "${p.ten}" (${p.ma})?`)) {
      await deleteProduct(p.id);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="app-title">Kho sản phẩm gốc</h1>
          <p className="app-subtitle">{loading ? 'Đang tải…' : `${products.length} sản phẩm`}</p>
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
            editing={editing}
            suggestions={suggestions}
            onSave={saveProduct}
            onCancel={closeForm}
          />
        </div>
      )}

      <div className="card">
        <ProductList products={products} onEdit={openEdit} onDelete={handleDelete} />
      </div>
    </div>
  );
}
