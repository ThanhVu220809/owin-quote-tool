import { useState } from 'react';
import { getAllProductsRaw } from '@/features/products/productStore';
import { getAllQuotesRaw } from '@/features/quote/quoteStore';
import { getAllSuggestionRecords } from '@/lib/suggestions';
import { getAllAluminumCalculationsRaw } from '@/features/aluminum/aluminumEstimatorStorage';
import { listImageIds, quoteImageStore } from '@/utils/imageStorage';
import { downloadBlob } from '@/utils/download';
import { getSyncDiagnostics } from './syncEngine';
import { resolveItemImage } from '@/lib/media/itemImageResolver';

export function DataDiagnostics({ onClose, onPullLatest, onPushOther, onForcePush, connected, busy: syncBusy }: { onClose: () => void; onPullLatest: () => void; onPushOther: () => void; onForcePush: () => void; connected: boolean; busy: boolean }) {
  const [report, setReport] = useState<Record<string, number> | null>(null);
  const [syncMeta, setSyncMeta] = useState<{ lastSuccessAt: string | null; bootstrapState: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inspect = async () => {
    setBusy(true);
    try {
      const [products, quotes, suggestions, aluminum, productImages, quoteImages] = await Promise.all([getAllProductsRaw(), getAllQuotesRaw(), getAllSuggestionRecords(), getAllAluminumCalculationsRaw(), listImageIds(), quoteImageStore.keys()]);
      setSyncMeta(await getSyncDiagnostics());
      const items = quotes.flatMap((quote) => quote.items || []);
      const resolved = await Promise.all(items.map((item) => resolveItemImage(item, products)));
      const missing = resolved.filter((image) => image.source === 'missing').length;
      setReport({ products: products.length, quotes: quotes.length, suggestions: suggestions.length, aluminum: aluminum.length, productImages: productImages.length, quoteOverrides: quoteImages.length, quoteItems: items.length, missingImages: missing });
    } finally { setBusy(false); }
  };
  const backup = async () => {
    const [products, quotes, suggestions, aluminum] = await Promise.all([getAllProductsRaw(), getAllQuotesRaw(), getAllSuggestionRecords(), getAllAluminumCalculationsRaw()]);
    downloadBlob(new Blob([JSON.stringify({ schemaVersion: 2, products, quotes, suggestions, aluminumCalculations: aluminum }, null, 2)], { type: 'application/json' }), `owin-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };
  return <div className="card sync-diagnostics" role="dialog" aria-label="Dữ liệu và đồng bộ"><div className="section-label">Dữ liệu & đồng bộ</div><div className="muted">Origin: {window.location.origin} · {navigator.onLine ? 'Đang online' : 'Offline'}</div>{syncMeta && <div className="muted">Bootstrap: {syncMeta.bootstrapState} · Đồng bộ thành công: {syncMeta.lastSuccessAt || 'chưa có'}</div>}{report && <div className="diagnostics-grid">{Object.entries(report).map(([key, value]) => <span key={key}><b>{value}</b> {key}</span>)}</div>}<div className="row-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => void inspect()}>Kiểm tra tính toàn vẹn dữ liệu</button><button className="btn btn-ghost" onClick={() => void backup()}>Xuất bản sao lưu</button>{connected && <><button className="btn btn-ghost" disabled={syncBusy} onClick={onPullLatest}>Tải bản mới nhất</button><button className="btn btn-ghost" disabled={syncBusy} onClick={onPushOther}>Đẩy kho khác</button><button className="btn btn-ghost" disabled={syncBusy} onClick={onForcePush}>Ghi đè Drive</button></>}<button className="btn btn-ghost" onClick={onClose}>Đóng</button></div></div>;
}
