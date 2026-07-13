import { useState } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, Calculator, FileText, Package } from 'lucide-react';
import { SupabaseGate } from '@/features/supabase/SupabaseGate';
import { AccountMenu } from '@/features/supabase/AccountMenu';
import { ProductsView } from '@/features/products/ProductsView';
import { QuoteView } from '@/features/quote/QuoteView';
import { BangGiaView } from '@/features/catalogue/BangGiaView';
import { TinhTamNhomView } from '@/features/aluminum/TinhTamNhomView';

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
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set(['products']));

  const activateTab = (nextTab: Tab) => {
    setVisitedTabs((current) => {
      if (current.has(nextTab)) return current;
      const next = new Set(current);
      next.add(nextTab);
      return next;
    });
    setTab(nextTab);
  };

  return (
    <SupabaseGate>
      <div className="tool-shell">
        <header className="tool-topnav no-print">
          <button type="button" className="tool-brand" onClick={() => activateTab('products')}>
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
                onClick={() => activateTab(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="tool-topnav-actions">
            <AccountMenu />
          </div>
        </header>

        <main className="tool-content">
          {visitedTabs.has('products') && (
            <div hidden={tab !== 'products'}>
              <ProductsView onOpenCatalogue={() => activateTab('catalogue')} />
            </div>
          )}
          {visitedTabs.has('quotes') && (
            <div hidden={tab !== 'quotes'}>
              <QuoteView />
            </div>
          )}
          {visitedTabs.has('aluminum') && (
            <div hidden={tab !== 'aluminum'}>
              <TinhTamNhomView />
            </div>
          )}
          {visitedTabs.has('catalogue') && (
            <div hidden={tab !== 'catalogue'}>
              <BangGiaView />
            </div>
          )}
        </main>
      </div>
    </SupabaseGate>
  );
}

export default App;
