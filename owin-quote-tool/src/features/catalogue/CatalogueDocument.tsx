import { memo } from 'react';
import type { CatalogueBlockRow } from '@/lib/catalogue/catalogueRows';
import { CatalogueRow } from '@/features/catalogue/CatalogueRow';
import { useProgressiveReveal } from '@/lib/list/useProgressiveReveal';

/**
 * Mỗi block là một tbody để trình duyệt/PDF không ngắt trang giữa sản phẩm và phụ kiện.
 *
 * `memo` theo mảng block: block đã dựng rồi thì mỗi đợt trải thêm không phải
 * dựng lại — `buildCatalogueBlockRows` trả về cùng tham chiếu khi dữ liệu không đổi.
 */
const CatalogueBlock = memo(function CatalogueBlock({ block }: { block: CatalogueBlockRow[] }) {
  return (
    <tbody className="catalogue-item-block">
      {block.map((row, index) => (
        <CatalogueRow key={`${row.productCode}-${row.rowType}-${index}`} row={row} />
      ))}
    </tbody>
  );
});

/**
 * Tài liệu bảng giá khổ A4 — cùng khung với bản xuất PDF/Excel nên kích thước cột,
 * padding và cỡ chữ trong stylesheet phải giữ nguyên.
 */
export function CatalogueDocument({
  rows,
  blocks,
}: {
  rows: CatalogueBlockRow[];
  blocks: CatalogueBlockRow[][];
}) {
  // Cả danh mục nằm trên một tài liệu: trải dần từng đợt block để lần dựng đầu
  // không chiếm hết luồng chính (333 sản phẩm ≈ 1.300 hàng).
  const visibleBlocks = useProgressiveReveal(blocks, 15);

  return (
    <div className="preview-doc bang-gia-doc">
      <table className="bang-gia-table">
        <colgroup>
          <col style={{ width: '3%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '26%' }} />
          <col style={{ width: '3.5%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '8.5%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
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
          visibleBlocks.map((block, index) => <CatalogueBlock key={`${block[0].productCode}-${index}`} block={block} />)
        )}
      </table>
    </div>
  );
}
