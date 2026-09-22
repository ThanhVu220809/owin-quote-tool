import { memo } from 'react';
import { ProductThumb } from '@/components/ProductThumb';
import type { CatalogueBlockRow } from '@/lib/catalogue/catalogueRows';
import { formatVND } from '@/lib/format/currency';

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

/**
 * Một hàng của bảng giá A4: tiêu đề danh mục, sản phẩm, hoặc phụ kiện.
 *
 * `memo` theo object hàng — hàng do `buildCatalogueBlockRows` dựng và giữ nguyên
 * tham chiếu khi dữ liệu không đổi, nên render lại tài liệu gần như miễn phí.
 */
export const CatalogueRow = memo(function CatalogueRow({ row }: { row: CatalogueBlockRow }) {
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
              {/* fill + CSS contain 95% ô: scale tới khi chạm ngang/dọc. Thumb nhẹ; PDF/Word dùng master. */}
              <ProductThumb imagePath={row.imagePath} fill thumb />
            </div>
          </td>
        )}
      <td className="description-cell"><Lines text={row.description} /></td>
      <td className="unit-cell">{row.unit}</td>
      <td className="dim-cell">{row.width || (row.rowType !== 'product' ? '—' : '')}</td>
      <td className="dim-cell">{row.height || (row.rowType !== 'product' ? '—' : '')}</td>
      <td className="kl-cell">{row.weight}</td>
      <td className="num"><Money value={row.unitPriceVnd} /></td>
      <td className="num"><Money value={row.amountVnd} /></td>
      {isProduct && (
        <td rowSpan={row.completedTotalRowSpan} className="num total-cell">
          <Money value={row.completedTotalVnd} />
        </td>
      )}
    </tr>
  );
});
