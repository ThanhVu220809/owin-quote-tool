/* HARNESS TẠM — chỉ để xem UI, xoá sau khi chụp. */
import { createRoot } from 'react-dom/client';
import type { ProductRecord } from '@/types/models';
import { ProductForm } from '@/features/products/ProductForm';
import '@/styles/tokens.css';
import '@/styles/ios.css';
import '@/styles/components.css';
import '@/styles/patterns.css';
import '@/styles/shell.css';
import '@/features/products/products.css';

const PRODUCT = {
  id: 'p1', numericId: 1, code: 'SP0001',
  name: 'Cửa Đi Mở Quay Nhôm OWIN Hệ Khuôn Phào',
  category: 'Cửa Chính', unit: 'BO', unitPriceVnd: 6000000,
  shortDesc: null, coverImagePath: null, gallery: [],
  rawSizeText: '2.00 x 2.60', rawPriceText: null,
  specs: [
    { key: 'Màu', value: 'Vân Gỗ Trắc', sortOrder: 0 },
    { key: 'Khung Bao', value: 'Tường Kép 23', sortOrder: 1 },
    { key: 'Bản Cánh', value: '140', sortOrder: 2 },
    { key: 'Độ Dày', value: '1.4 - 2 mm', sortOrder: 3 },
    { key: 'Loại Kính', value: 'Kính Hộp Nan Hoa Mờ Đồng', sortOrder: 4 },
  ],
  accessories: [],
  fixedAccessoryPackage: JSON.stringify({
    name: 'Bộ Phụ Kiện Daishin Chính Hãng', unitPrice: 8000000, quantity: 1,
    note: 'Món ưu ái để gộp Phào Nội Thất Trong Cánh · thanh ban vị',
    items: [
      { id: 'a1', name: 'Bản Lề Cối', quantity: 4 },
      { id: 'a2', name: 'Khóa', quantity: 1 },
      { id: 'a3', name: 'Chốt Cánh Phụ', quantity: 2 },
      { id: 'a4', name: 'Vân Tư Phụ', quantity: 1 },
    ],
  }),
  extraAccessories: JSON.stringify([
    { id: 'e1', name: 'Phào Biệt Thự', unit: 'md', quantity: 1, length: 0.4, unitPrice: 1620000, amount: 12408000 },
    { id: 'e2', name: 'Phào 1 Mặt', unit: 'md', quantity: 1, length: 0, unitPrice: 1500000, amount: 1500000 },
    { id: 'e3', name: 'Phào Nội Thất', unit: 'md', quantity: 1, length: 0, unitPrice: 3000000, amount: 3000000 },
  ]),
  isFeatured: false, isPublic: true, sortOrder: 0, folderPath: null,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null,
} as unknown as ProductRecord;

const SUGGESTIONS = {
  category: ['Cửa Chính', 'Cửa Sổ'], productName: [], specValue: [], specValueColor: [],
  accessoryName: [], accessoryPackageName: [], packageCatalog: [], orphanAccessoryNames: [],
  extraAccessoryName: [],
} as never;

createRoot(document.getElementById('root')!).render(
  <div className="tool-shell">
    <div className="tool-content">
      <div className="tool-content-inner">
        <section className="admin-page product-workflow-page">
          <ProductForm
            editing={PRODUCT}
            suggestions={SUGGESTIONS}
            onSave={async (i) => ({ ...PRODUCT, ...i }) as never}
            onCancel={() => {}}
          />
        </section>
      </div>
    </div>
  </div>,
);
