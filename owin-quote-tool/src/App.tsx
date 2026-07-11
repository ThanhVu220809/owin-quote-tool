import { useState } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, Calculator, FileText, Package } from 'lucide-react';
import { ProductsView } from '@/features/products/ProductsView';
import { QuoteView } from '@/features/quote/QuoteView';
import { BangGiaView } from '@/features/catalogue/BangGiaView';
import { TinhTamNhomView } from '@/features/aluminum/TinhTamNhomView';
import { SyncBar } from '@/features/sync/SyncBar';

type Tab = 'products' | 'quotes' | 'catalogue' | 'aluminum';

const menuItems: Array<{ key: Tab; label: string; icon: ReactNode }> = [
  { key: 'products', label: 'Sản phẩm', icon: <Package size={18} /> },
  { key: 'quotes', label: 'Báo giá', icon: <FileText size={18} /> },
  { key: 'catalogue', label: 'Bảng giá', icon: <BookOpen size={18} /> },
  { key: 'aluminum', label: 'Tính nhôm', icon: <Calculator size={18} /> },
];

/**
 * Lightweight OWIN tool shell: horizontal top nav only.
 * No admin sidebar, avatar, notifications, or extra modules.
 */
function App() {
  const [tab, setTab] = useState<Tab>('products');

  return (
    <div className="tool-shell">
      <header className="tool-topnav no-print">
        <button type="button" className="tool-brand" onClick={() => setTab('products')}>
          <img
            className="tool-brand-logo"
            src={`${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`}
            alt="OWIN"
          />
          <span className="tool-brand-text">
            <strong>OWIN</strong>
            <small>Công cụ báo giá</small>
          </span>
        </button>

        <nav className="tool-nav" aria-label="Menu chính">
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`tool-nav-item ${tab === item.key ? 'active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="tool-topnav-actions">
          <SyncBar compact />
        </div>
      </header>

      <main className="tool-content">
        <div style={{ display: tab === 'products' ? 'block' : 'none' }}>
          <ProductsView onOpenCatalogue={() => setTab('catalogue')} />
        </div>
        <div style={{ display: tab === 'quotes' ? 'block' : 'none' }}>
          <QuoteView />
        </div>
        <div style={{ display: tab === 'aluminum' ? 'block' : 'none' }}>
          <TinhTamNhomView />
        </div>
        <div style={{ display: tab === 'catalogue' ? 'block' : 'none' }}>
          <BangGiaView />
        </div>
      </main>
    </div>
  );
}

export default App;
