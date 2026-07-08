import { BookOpen, FileDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProducts } from '@/features/products/useProducts';
import { ProductThumb } from '@/features/products/ProductThumb';
import { buildCatalogueBlockRows, type CatalogueBlockRow } from '@/lib/catalogue/catalogueRows';
import { formatVND } from '@/utils/format';

function Lines({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      {text.split('\n').map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </>
  );
}

function Money({ value }: { value: number | null }) {
  return value ? <>{formatVND(value)}</> : null;
}

export function BangGiaView() {
  const { productRecords, loading } = useProducts();
  const [exporting, setExporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const rows = useMemo(() => buildCatalogueBlockRows(productRecords), [productRecords]);
  const blocks = useMemo(() => {
    const out: CatalogueBlockRow[][] = [];
    rows.forEach((row) => {
      if (row.rowType === 'category' || row.rowType === 'product' || out.length === 0) {
        out.push([row]);
      } else {
        out[out.length - 1].push(row);
      }
    });
    return out;
  }, [rows]);

  return (
    <section className="admin-page catalogue-page">
      <div className="toolbar catalogue-toolbar no-print">
        <div>
          <h1 className="app-title">Thư viện Catalogue</h1>
          <p className="app-subtitle">BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN · {loading ? 'Đang tải…' : `${productRecords.length} sản phẩm`}</p>
        </div>
        <div className="spacer" />
        <button
          className="btn btn-ghost"
          disabled={productRecords.length === 0 || exporting}
          onClick={() => {
            setExporting(true);
            import('@/features/export/wordExport')
              .then(({ exportBangGiaWord }) => exportBangGiaWord(productRecords))
              .finally(() => setExporting(false));
          }}
        >
          <FileDown size={17} style={{ verticalAlign: '-3px' }} /> {exporting ? 'Đang xuất…' : 'Tải Word (.docx)'}
        </button>
        <button
          className="btn btn-ghost"
          disabled={productRecords.length === 0 || exportingExcel}
          onClick={() => {
            setExportingExcel(true);
            import('@/features/export/catalogueExcelExport')
              .then(({ exportBangGiaExcel }) => exportBangGiaExcel(productRecords))
              .finally(() => setExportingExcel(false));
          }}
        >
          <FileDown size={17} style={{ verticalAlign: '-3px' }} /> {exportingExcel ? 'Đang xuất…' : 'Tải Excel (.xlsx)'}
        </button>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <BookOpen size={17} style={{ verticalAlign: '-3px' }} /> Tải Catalogue PDF
        </button>
      </div>

      <div className="preview-doc bang-gia-doc">
        <table className="bang-gia-table">
          <colgroup>
            <col style={{ width: '3.5%' }} />
            <col style={{ width: '19.9%' }} />
            <col style={{ width: '28.1%' }} />
            <col style={{ width: '3.5%' }} />
            <col style={{ width: '4.5%' }} />
            <col style={{ width: '3.9%' }} />
            <col style={{ width: '4.3%' }} />
            <col style={{ width: '10.7%' }} />
            <col style={{ width: '10.7%' }} />
            <col style={{ width: '10.8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th colSpan={2} className="logo-cell">HOÀNG ANH OWIN</th>
              <th colSpan={8} className="company-cell">Tiên Điền - Nghi Xuân - Hà Tĩnh · 0799040616</th>
            </tr>
            <tr>
              <th colSpan={10} className="title-cell">BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN</th>
            </tr>
            <tr>
              <th>STT</th>
              <th>Hình ảnh</th>
              <th>Mô tả chi tiết</th>
              <th>DV</th>
              <th>Rộng</th>
              <th>Cao</th>
              <th>KL</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
              <th>Tổng tiền</th>
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={10}>Chưa có sản phẩm.</td>
              </tr>
            </tbody>
          ) : (
            blocks.map((block, index) => <CatalogueBlock key={`${block[0].productCode}-${index}`} block={block} />)
          )}
        </table>
      </div>
    </section>
  );
}

function CatalogueBlock({ block }: { block: CatalogueBlockRow[] }) {
  const first = block[0];
  if (first.rowType === 'category') {
    return (
      <tbody className="catalogue-item-block">
        <tr className="category-row">
          <td colSpan={10}>{first.categoryName}</td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody className="catalogue-item-block">
      {block.map((row, index) => (
        <CatalogueRow key={`${row.productCode}-${row.rowType}-${index}`} row={row} />
      ))}
    </tbody>
  );
}

function CatalogueRow({ row }: { row: CatalogueBlockRow }) {
  if (row.rowType === 'category') {
    return null;
  }

  const isProduct = row.rowType === 'product';
  return (
    <tr className={row.rowType}>
      {isProduct && <td rowSpan={row.sttRowSpan}>{row.stt}</td>}
        {isProduct && (
          <td rowSpan={row.imageRowSpan} className="image-cell">
            <ProductThumb imagePath={row.imagePath} fill />
          </td>
        )}
      <td className="description-cell"><Lines text={row.description} /></td>
      <td>{row.unit}</td>
      <td>{row.width || (row.rowType !== 'product' ? '—' : '')}</td>
      <td>{row.height || (row.rowType !== 'product' ? '—' : '')}</td>
      <td>{row.weight}</td>
      <td className="num"><Money value={row.unitPriceVnd} /></td>
      <td className="num"><Money value={row.amountVnd} /></td>
      {isProduct && (
        <td rowSpan={row.completedTotalRowSpan} className="num total-cell">
          <Money value={row.completedTotalVnd} />
        </td>
      )}
    </tr>
  );
}
