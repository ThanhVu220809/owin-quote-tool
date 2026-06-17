import { useState, useMemo, useEffect } from 'react';
import { Trash2, Package, FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import type { Customer, Product, QuoteLine, Accessory } from '@/types/models';
import { useProducts } from '@/features/products/useProducts';
import { ProductThumb } from '@/features/products/ProductThumb';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Switch } from '@/components/Switch';
import { formatVND } from '@/utils/format';
import { getImageDataUrl } from '@/utils/imageStorage';
import { tinhDong, tinhTongBaoGia, tinhTongLamTron, createLineFromProduct } from './quoteCalc';
import { QuotePreview } from './QuotePreview';
import { exportFormat1, exportFormat2 } from '@/features/export/wordExport';
import { exportExcel } from '@/features/export/excelExport';
import { exportQuotePDF } from '@/features/export/pdfExport';

const emptyCustomer: Customer = { ten: '', sdt: '', diaChi: '', email: '' };

export function QuoteView() {
  const { products, loading } = useProducts();
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [tamUng, setTamUng] = useState(0);
  const [previewFormat, setPreviewFormat] = useState<1 | 2>(1);
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // Nạp dataURL ảnh cho các dòng có imageId (preview F2 + Word F2).
  useEffect(() => {
    const ids = Array.from(new Set(lines.map((l) => l.imageId).filter(Boolean) as string[]));
    let active = true;
    (async () => {
      const map: Record<string, string> = {};
      for (const id of ids) {
        if (imageMap[id]) {
          map[id] = imageMap[id];
          continue;
        }
        const url = await getImageDataUrl(id);
        if (url) map[id] = url;
      }
      if (active) setImageMap(map);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  const addProduct = (p: Product) => setLines((ls) => [...ls, createLineFromProduct(p)]);
  const removeLine = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id));
  const updateLine = (id: string, patch: Partial<QuoteLine>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const updateAcc = (lineId: string, accId: string, patch: Partial<Accessory>) =>
    setLines((ls) =>
      ls.map((l) =>
        l.id === lineId
          ? { ...l, accessories: l.accessories.map((a) => (a.id === accId ? { ...a, ...patch } : a)) }
          : l,
      ),
    );

  const setCust = (k: keyof Customer, v: string) => setCustomer((c) => ({ ...c, [k]: v }));

  const total = useMemo(() => tinhTongBaoGia(lines), [lines]);
  const totalLamTron = useMemo(() => tinhTongLamTron(lines), [lines]);

  const runExport = async (fn: () => Promise<void> | void) => {
    setExportErr(null);
    setExporting(true);
    try {
      await fn();
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const doExport = (fmt: 1 | 2) =>
    runExport(() => (fmt === 1 ? exportFormat1(customer, lines, tamUng) : exportFormat2(customer, lines, imageMap, tamUng)));
  const doExcel = () => runExport(() => exportExcel(customer, lines, tamUng));
  const doPDF = () => exportQuotePDF();

  return (
    <div>
      <h1 className="app-title">Tạo báo giá</h1>
      <p className="app-subtitle">{loading ? 'Đang tải kho…' : `${products.length} sản phẩm trong kho`}</p>

      {/* FORM KHÁCH */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Thông tin khách hàng</div>
        <div className="two-col">
          <div className="field">
            <label>Tên khách</label>
            <input className="input" value={customer.ten} onChange={(e) => setCust('ten', e.target.value)} />
          </div>
          <div className="field">
            <label>SĐT</label>
            <input className="input" value={customer.sdt} onChange={(e) => setCust('sdt', e.target.value)} />
          </div>
          <div className="field">
            <label>Địa chỉ</label>
            <input className="input" value={customer.diaChi} onChange={(e) => setCust('diaChi', e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" value={customer.email} onChange={(e) => setCust('email', e.target.value)} />
          </div>
        </div>
      </div>

      {/* GRID CHỌN SẢN PHẨM */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Chọn sản phẩm (bấm để thêm vào báo giá)</div>
        <div className="pick-grid">
          {products.map((p) => (
            <button key={p.id} className="pick-card" onClick={() => addProduct(p)} data-pick={p.ma}>
              {p.imageId ? (
                <ProductThumb imageId={p.imageId} fill />
              ) : (
                <div className="ph">
                  <Package size={26} color="var(--ios-gray1)" />
                </div>
              )}
              <div className="nm">{p.ten}</div>
              <div className="cd">{p.ma} · {formatVND(p.donGiaGoc)}/{p.dvt}</div>
            </button>
          ))}
        </div>
      </div>

      {/* BẢNG BÁO GIÁ EDITABLE */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Bảng tính ({lines.length} dòng)</div>
        {lines.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>Chưa có dòng nào. Bấm sản phẩm ở trên để thêm.</div>
        ) : (
          <table className="quote-table">
            <thead>
              <tr>
                <th className="l">Sản phẩm</th>
                <th>Rộng</th>
                <th>Cao</th>
                <th>SL</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const t = tinhDong(line);
                const isBo = line.dvt === 'Bộ';
                return (
                  <FragmentRow
                    key={line.id}
                    line={line}
                    isBo={isBo}
                    tienChinh={t.tienChinh}
                    onUpdate={(patch) => updateLine(line.id, patch)}
                    onRemove={() => removeLine(line.id)}
                    onAcc={(accId, patch) => updateAcc(line.id, accId, patch)}
                  />
                );
              })}
              <tr className="qt-total-row">
                <td className="l" colSpan={5}>TỔNG CỘNG</td>
                <td>{formatVND(total)}</td>
                <td></td>
              </tr>
              <tr className="qt-total-row qt-total-sub">
                <td className="l" colSpan={5}>LÀM TRÒN (xuống 100.000)</td>
                <td>{formatVND(totalLamTron)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}

        <div className="field" style={{ marginTop: 12, maxWidth: 220 }}>
          <label>Tạm ứng (đ)</label>
          <input
            className="input"
            type="number"
            value={tamUng || ''}
            onChange={(e) => setTamUng(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* EXPORT */}
      <div className="toolbar no-print">
        <button className="btn btn-primary" disabled={lines.length === 0 || exporting} onClick={() => doExport(1)}>
          <FileDown size={18} style={{ verticalAlign: '-3px' }} /> Word — Báo giá (F1)
        </button>
        <button className="btn btn-ghost" disabled={lines.length === 0 || exporting} onClick={() => doExport(2)}>
          <FileDown size={18} style={{ verticalAlign: '-3px' }} /> Word — Bảng giá (F2)
        </button>
        <button className="btn btn-ghost" disabled={lines.length === 0 || exporting} onClick={doExcel}>
          <FileSpreadsheet size={18} style={{ verticalAlign: '-3px' }} /> Xuất Excel
        </button>
        <button className="btn btn-ghost" disabled={lines.length === 0} onClick={doPDF}>
          <Printer size={18} style={{ verticalAlign: '-3px' }} /> Xuất PDF
        </button>
        {exporting && <span className="muted">Đang xuất…</span>}
        {exportErr && <span style={{ color: 'var(--ios-red)' }}>{exportErr}</span>}
      </div>

      {/* PREVIEW */}
      <div style={{ margin: '16px 0' }}>
        <SegmentedControl
          options={[
            { label: 'Format 1 — Báo giá', value: '1' },
            { label: 'Format 2 — Bảng giá', value: '2' },
          ]}
          value={String(previewFormat)}
          onChange={(v) => setPreviewFormat(Number(v) as 1 | 2)}
        />
      </div>
      <QuotePreview
        format={previewFormat}
        customer={customer}
        lines={lines}
        imageMap={imageMap}
        tamUng={tamUng}
      />
    </div>
  );
}

/** Dòng sản phẩm + (nếu có) các hàng phụ kiện toggle ngay dưới. */
function FragmentRow({
  line,
  isBo,
  tienChinh,
  onUpdate,
  onRemove,
  onAcc,
}: {
  line: QuoteLine;
  isBo: boolean;
  tienChinh: number;
  onUpdate: (patch: Partial<QuoteLine>) => void;
  onRemove: () => void;
  onAcc: (accId: string, patch: Partial<Accessory>) => void;
}) {
  return (
    <>
      <tr>
        <td className="l">
          <div style={{ fontWeight: 600 }}>{line.ten}</div>
          <div className="muted" style={{ fontSize: 12 }}>{line.ma} · {line.dvt}</div>
        </td>
        <td>
          {isBo ? '—' : (
            <input
              type="number" step="0.001" value={line.rong ?? ''}
              onChange={(e) => onUpdate({ rong: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          )}
        </td>
        <td>
          {isBo ? '—' : (
            <input
              type="number" step="0.001" value={line.cao ?? ''}
              onChange={(e) => onUpdate({ cao: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          )}
        </td>
        <td>
          <input
            type="number" value={line.sl}
            onChange={(e) => onUpdate({ sl: Number(e.target.value) || 0 })}
          />
        </td>
        <td>
          <input
            className="wide" type="number" value={line.donGia}
            onChange={(e) => onUpdate({ donGia: Number(e.target.value) || 0 })}
          />
        </td>
        <td data-tien-chinh={tienChinh}>{formatVND(tienChinh)}</td>
        <td>
          <button className="icon-btn danger" onClick={onRemove} aria-label="Xoá dòng"><Trash2 size={15} /></button>
        </td>
      </tr>
      {line.accessories.map((a) => (
        <tr key={a.id} className="qt-acc">
          <td className="l" style={{ paddingLeft: 20 }}>
            <Switch checked={a.enabled} onChange={(v) => onAcc(a.id, { enabled: v })} aria-label={`Bật ${a.ten}`} />
            <span style={{ marginLeft: 8 }}>{a.ten}</span>
          </td>
          <td colSpan={2}></td>
          <td>
            <input type="number" value={a.sl} onChange={(e) => onAcc(a.id, { sl: Number(e.target.value) || 0 })} />
          </td>
          <td>
            <input className="wide" type="number" value={a.donGia} onChange={(e) => onAcc(a.id, { donGia: Number(e.target.value) || 0 })} />
          </td>
          <td>{a.enabled ? formatVND(Math.round(a.sl * a.donGia)) : '—'}</td>
          <td></td>
        </tr>
      ))}
    </>
  );
}
