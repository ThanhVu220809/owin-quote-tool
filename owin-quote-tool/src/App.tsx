import { useState } from 'react';
import type { ReactNode } from 'react';
import { BookOpen, Calculator, FileText, Package } from 'lucide-react';
import { AuthGate } from '@/features/auth/AuthGate';
import { AccountMenu } from '@/features/auth/AccountMenu';
import { ProductsView } from '@/features/products';
import { QuoteView } from '@/features/quote';
import { CatalogueView } from '@/features/catalogue';
import { AluminumEstimatorView } from '@/features/aluminum';
import { GlobalImageLightbox } from '@/components/ImageLightbox';

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
    <AuthGate>
      <div className="tool-shell" data-active-tab={tab}>
        <header className="tool-topnav no-print">
          <button type="button" className="tool-brand" onClick={() => activateTab('products')} aria-label="OWIN — về sản phẩm">
            <img
              className="tool-brand-logo"
              src={`${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`}
              alt=""
              width={36}
              height={36}
              decoding="async"
            />
            <span className="tool-brand-text">
              <strong>OWIN</strong>
              <small>Công cụ báo giá</small>
            </span>
          </button>

          <nav className="tool-nav" aria-label="Menu chính" role="tablist">
            {menuItems.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`tool-nav-item${active ? ' active' : ''}`}
                  onClick={() => activateTab(item.key)}
                >
                  <span className="tool-nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="tool-topnav-actions">
            <AccountMenu />
          </div>
        </header>

        <main className="tool-content" id="tool-main" tabIndex={-1}>
          <div className="tool-content-inner">
            {visitedTabs.has('products') && (
              <div hidden={tab !== 'products'} role="tabpanel" aria-label="Sản phẩm">
                <ProductsView onOpenCatalogue={() => activateTab('catalogue')} />
              </div>
            )}
            {visitedTabs.has('quotes') && (
              <div hidden={tab !== 'quotes'} role="tabpanel" aria-label="Báo giá">
                <QuoteView />
              </div>
            )}
            {visitedTabs.has('aluminum') && (
              <div hidden={tab !== 'aluminum'} role="tabpanel" aria-label="Tính nhôm">
                <AluminumEstimatorView />
              </div>
            )}
            {visitedTabs.has('catalogue') && (
              <div hidden={tab !== 'catalogue'} role="tabpanel" aria-label="Bảng giá">
                <CatalogueView />
              </div>
            )}
          </div>
        </main>
      </div>
      <GlobalImageLightbox />
    </AuthGate>
  );
}

export default App;
