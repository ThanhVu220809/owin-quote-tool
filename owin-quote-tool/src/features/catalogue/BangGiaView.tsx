import { BookOpen, FileDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProducts } from '@/features/products/useProducts';
import { ProductThumb } from '@/features/products/ProductThumb';
import { printPreviewDocument } from '@/features/export/pdfExport';
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
  const { productRecords, loading, error: productsError, retry } = useProducts();
  const [exporting, setExporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportError, setExportError] = useState('');
  const rows = useMemo(() => buildCatalogueBlockRows(productRecords), [productRecords]);
  // Group so category stays with first product and accessories stay with product for print keep-together.
  const blocks = useMemo(() => {
    const out: CatalogueBlockRow[][] = [];
    let current: CatalogueBlockRow[] | null = null;
    let hasProduct = false;
    rows.forEach((row) => {
      if (row.rowType === 'category') {
        if (current) out.push(current);
        current = [row];
        hasProduct = false;
        return;
      }
      if (row.rowType === 'product') {
        if (current && hasProduct) {
          out.push(current);
          current = [row];
        } else if (current) {
          current.push(row);
        } else {
          current = [row];
        }
        hasProduct = true;
        return;
      }
      if (!current) current = [];
      current.push(row);
    });
    if (current) out.push(current);
    return out;
  }, [rows]);

  const exportWord = async () => {
    setExporting(true);
    setExportError('');
    try {
      const { exportBangGiaWord } = await import('@/features/export/wordExport');
      await exportBangGiaWord(productRecords);
    } catch {
      setExportError('Không thể xuất bảng giá Word. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    setExportingExcel(true);
    setExportError('');
    try {
      const { exportBangGiaExcel } = await import('@/features/export/catalogueExcelExport');
      await exportBangGiaExcel(productRecords);
    } catch {
      setExportError('Không thể xuất bảng giá Excel. Vui lòng thử lại.');
    } finally {
      setExportingExcel(false);
    }
  };

  const printCatalogue = async () => {
    setExportError('');
    try {
      await printPreviewDocument();
    } catch {
      setExportError('Không thể mở chế độ In/PDF. Vui lòng thử lại.');
    }
  };

  return (
    <section className="admin-page catalogue-page">
      <div className="toolbar catalogue-toolbar no-print">
        <div>
          <h1 className="app-title">Bảng giá</h1>
          <p className="app-subtitle">BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN · {loading ? 'Đang tải…' : `${productRecords.length} sản phẩm`}</p>
        </div>
        <div className="spacer" />
        <button
          className="btn btn-ghost"
          disabled={productRecords.length === 0 || exporting}
          onClick={() => void exportWord()}
        >
          <FileDown size={17} style={{ verticalAlign: '-3px' }} /> {exporting ? 'Đang xuất…' : 'Tải Word (.docx)'}
        </button>
        <button
          className="btn btn-ghost"
          disabled={productRecords.length === 0 || exportingExcel}
          onClick={() => void exportExcel()}
        >
          <FileDown size={17} style={{ verticalAlign: '-3px' }} /> {exportingExcel ? 'Đang xuất…' : 'Tải Excel (.xlsx)'}
        </button>
        <button className="btn btn-primary" onClick={() => void printCatalogue()}>
          <BookOpen size={17} style={{ verticalAlign: '-3px' }} /> In / PDF
        </button>
      </div>

      {(productsError || exportError) && (
        <div className="product-data-error no-print" role="alert">
          <span>{exportError || productsError}</span>
          {productsError && (
            <button type="button" className="btn btn-ghost" onClick={() => void retry()}>
              Thử tải lại
            </button>
          )}
        </div>
      )}

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
              <th colSpan={2} className="logo-cell">
                <img src={`${import.meta.env.BASE_URL}owin-user-assets/logo/logo.webp`} alt="OWIN" />
              </th>
              <th colSpan={8} className="company-cell">HOÀNG ANH OWIN</th>
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
    return (
      <tr className="category-row">
        <td colSpan={10}>{row.categoryName}</td>
      </tr>
    );
  }

  const isProduct = row.rowType === 'product';
  return (
    <tr className={row.rowType}>
      {isProduct && <td rowSpan={row.sttRowSpan}>{row.stt}</td>}
        {isProduct && (
          <td rowSpan={row.imageRowSpan} className="image-cell">
            <div className="bang-gia-image-frame">
              <ProductThumb imagePath={row.imagePath} fill />
            </div>
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
