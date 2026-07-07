import { useState } from 'react';
import { Package, FileText } from 'lucide-react';
import { ProductsView } from '@/features/products/ProductsView';
import { QuoteView } from '@/features/quote/QuoteView';
import { BangGiaView } from '@/features/catalogue/BangGiaView';
import { SyncBar } from '@/features/sync/SyncBar';

type Tab = 'products' | 'quote' | 'bang-gia';

function App() {
  const [tab, setTab] = useState<Tab>('products');
  return (
    <div className="app-shell">
      <SyncBar />
      <div className="nav-tabs">
        <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>
          <Package size={16} style={{ verticalAlign: '-3px' }} /> Kho sản phẩm
        </button>
        <button className={tab === 'quote' ? 'active' : ''} onClick={() => setTab('quote')}>
          <FileText size={16} style={{ verticalAlign: '-3px' }} /> Báo giá
        </button>
        <button className={tab === 'bang-gia' ? 'active' : ''} onClick={() => setTab('bang-gia')}>
          <FileText size={16} style={{ verticalAlign: '-3px' }} /> Bảng giá
        </button>
      </div>
      {/* Giữ cả 2 view mounted, ẩn cái không active → không mất state báo giá khi đổi tab. */}
      <div style={{ display: tab === 'products' ? 'block' : 'none' }}>
        <ProductsView />
      </div>
      <div style={{ display: tab === 'quote' ? 'block' : 'none' }}>
        <QuoteView />
      </div>
      <div style={{ display: tab === 'bang-gia' ? 'block' : 'none' }}>
        <BangGiaView />
      </div>
    </div>
  );
}

export default App;
