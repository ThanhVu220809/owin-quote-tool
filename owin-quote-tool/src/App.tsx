import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  Calculator,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Users,
} from 'lucide-react';
import { ProductsView } from '@/features/products/ProductsView';
import { QuoteView } from '@/features/quote/QuoteView';
import { BangGiaView } from '@/features/catalogue/BangGiaView';
import { TinhTamNhomView } from '@/features/aluminum/TinhTamNhomView';
import { SyncBar } from '@/features/sync/SyncBar';
import { useProducts } from '@/features/products/useProducts';
import { getAllQuotes } from '@/features/quote/quoteStore';
import { formatVND } from '@/utils/format';

type Tab = 'dashboard' | 'products' | 'customers' | 'quotes' | 'aluminum' | 'catalogue';

const menuItems: Array<{ key: Tab; label: string; icon: ReactNode }> = [
  { key: 'dashboard', label: 'Tổng quan', icon: <LayoutDashboard size={20} /> },
  { key: 'products', label: 'Sản phẩm', icon: <Package size={20} /> },
  { key: 'customers', label: 'Khách hàng', icon: <Users size={20} /> },
  { key: 'quotes', label: 'Báo giá', icon: <FileText size={20} /> },
  { key: 'aluminum', label: 'Tính tạm nhôm', icon: <Calculator size={20} /> },
  { key: 'catalogue', label: 'Catalogue', icon: <BookOpen size={20} /> },
];

function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
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
          <button className="admin-brand" onClick={() => selectTab('dashboard')}>
            <span className="admin-brand-mark">O</span>
            <span>OWIN Admin</span>
          </button>
          <nav className="admin-nav" aria-label="Admin">
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
            <p>Hệ thống quản trị</p>
          </div>
          <div className="admin-header-actions">
            <button className="admin-round-btn" aria-label="Thông báo">
              <Bell size={18} />
              <span />
            </button>
            <div className="admin-user">
              <div className="admin-avatar">AD</div>
              <div>
                <strong>Administrator</strong>
                <small>Quản trị viên</small>
              </div>
            </div>
          </div>
        </header>

        <main className="admin-content">
          <div className="admin-sync-strip no-print">
            <SyncBar />
          </div>
          <div style={{ display: tab === 'dashboard' ? 'block' : 'none' }}>
            <DashboardView onNavigate={selectTab} />
          </div>
          <div style={{ display: tab === 'products' ? 'block' : 'none' }}>
            <ProductsView />
          </div>
          <div style={{ display: tab === 'customers' ? 'block' : 'none' }}>
            <CustomersView onCreateQuote={() => selectTab('quotes')} />
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

function DashboardView({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { productRecords } = useProducts();
  const [quoteStats, setQuoteStats] = useState({ count: 0, total: 0 });

  useEffect(() => {
    let alive = true;
    void getAllQuotes().then((quotes) => {
      if (!alive) return;
      setQuoteStats({
        count: quotes.length,
        total: quotes.reduce((sum, quote) => sum + quote.roundedTotalVnd, 0),
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <h1 className="app-title">Tổng quan hệ thống</h1>
          <p className="app-subtitle">Theo dõi nhanh dữ liệu sản phẩm, báo giá và công cụ vận hành.</p>
        </div>
      </div>

      <div className="admin-stat-grid">
        <button className="admin-stat-card" onClick={() => onNavigate('products')}>
          <span>Sản phẩm</span>
          <strong>{productRecords.length}</strong>
          <small>Danh mục đang lưu</small>
        </button>
        <button className="admin-stat-card" onClick={() => onNavigate('quotes')}>
          <span>Đơn báo giá</span>
          <strong>{quoteStats.count}</strong>
          <small>Lịch sử đã nhập</small>
        </button>
        <button className="admin-stat-card" onClick={() => onNavigate('catalogue')}>
          <span>Giá trị báo giá</span>
          <strong>{formatVND(quoteStats.total)}</strong>
          <small>Tổng đã làm tròn</small>
        </button>
        <button className="admin-stat-card" onClick={() => onNavigate('aluminum')}>
          <span>Tính tạm nhôm</span>
          <strong>6</strong>
          <small>Hệ nhôm tham chiếu</small>
        </button>
      </div>

      <div className="admin-dashboard-grid">
        <section className="card admin-dashboard-panel">
          <div className="section-label">Thao tác nhanh</div>
          <div className="admin-quick-actions">
            <button className="btn btn-primary" onClick={() => onNavigate('quotes')}>Tạo báo giá mới</button>
            <button className="btn btn-ghost" onClick={() => onNavigate('products')}>Quản lý sản phẩm</button>
            <button className="btn btn-ghost" onClick={() => onNavigate('catalogue')}>Mở Catalogue</button>
          </div>
        </section>
        <section className="card admin-dashboard-panel">
          <div className="section-label">Dữ liệu cục bộ</div>
          <p className="product-sub">
            Ứng dụng vẫn chạy client-side bằng IndexedDB/localforage, giữ đồng bộ Google Drive và tương thích GitHub Pages.
          </p>
        </section>
      </div>
    </section>
  );
}

function CustomersView({ onCreateQuote }: { onCreateQuote: () => void }) {
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <h1 className="app-title">Khách hàng</h1>
          <p className="app-subtitle">Thông tin khách hiện được học từ lịch sử báo giá và gợi ý thông minh.</p>
        </div>
        <button className="btn btn-primary" onClick={onCreateQuote}>Tạo báo giá</button>
      </div>
      <div className="card admin-empty-state">
        <Users size={28} />
        <div>
          <div className="product-name">Chưa tách kho khách hàng riêng</div>
          <div className="product-sub">Tên, địa chỉ và thông tin liên hệ vẫn được lưu cùng QuoteRecord để giữ đồng bộ hiện tại.</div>
        </div>
      </div>
    </section>
  );
}

export default App;
