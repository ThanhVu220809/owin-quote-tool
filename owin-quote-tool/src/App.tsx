import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  BookOpen,
  Calculator,
  ChevronRight,
  FileText,
  Menu,
  Package,
} from 'lucide-react';
import { ProductsView } from '@/features/products/ProductsView';
import { QuoteView } from '@/features/quote/QuoteView';
import { BangGiaView } from '@/features/catalogue/BangGiaView';
import { TinhTamNhomView } from '@/features/aluminum/TinhTamNhomView';
import { SyncBar } from '@/features/sync/SyncBar';

type Tab = 'products' | 'quotes' | 'catalogue' | 'aluminum';

const menuItems: Array<{ key: Tab; label: string; icon: ReactNode }> = [
  { key: 'products', label: 'Sản phẩm', icon: <Package size={20} /> },
  { key: 'quotes', label: 'Báo giá', icon: <FileText size={20} /> },
  { key: 'catalogue', label: 'Bảng giá', icon: <BookOpen size={20} /> },
  { key: 'aluminum', label: 'Tính tạm nhôm', icon: <Calculator size={20} /> },
];

function App() {
  const [tab, setTab] = useState<Tab>('products');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    setIsSidebarOpen(false);
  };

  return (
    <div className="admin-shell">
      {isSidebarOpen && <button className="admin-sidebar-backdrop" aria-label="Đóng menu" onClick={() => setIsSidebarOpen(false)} />}
      <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div>
          <button className="admin-brand" onClick={() => selectTab('products')}>
            <span className="admin-brand-mark">O</span>
            <span>OWIN Tool</span>
          </button>
          <nav className="admin-nav" aria-label="Công cụ OWIN">
            {menuItems.map((item) => (
              <button
                key={item.key}
                className={`admin-nav-item ${tab === item.key ? 'active' : ''}`}
                onClick={() => selectTab(item.key)}
              >
                <span className="admin-nav-label">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {tab === item.key && <ChevronRight size={16} />}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header-left">
            <button className="admin-menu-toggle" onClick={() => setIsSidebarOpen((current) => !current)} aria-label="Mở menu">
              <Menu size={20} />
            </button>
            <p>Công cụ báo giá OWIN</p>
          </div>
        </header>

        <main className="admin-content">
          <div className="admin-sync-strip no-print">
            <SyncBar />
          </div>
          <div style={{ display: tab === 'products' ? 'block' : 'none' }}>
            <ProductsView onOpenCatalogue={() => selectTab('catalogue')} />
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
    </div>
  );
}

export default App;
