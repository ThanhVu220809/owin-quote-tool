import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { openImageLightbox } from '@/components/imageLightboxStore';
import { SmartNumberInput } from '@/components/SmartNumberInput';
import { parseSmartNumber } from '@/lib/format/smartNumber';
import { formatEstimatorMoney } from '@/features/aluminum/estimator/estimator';
import { getAluminumProfileImageDisplay } from '@/features/aluminum/estimator/profileImage';
import type { AluminumEstimatorRowPatch } from '@/features/aluminum/aluminumEstimatorStorage';
import type { AluminumEstimatorRowViewModel } from '@/features/aluminum/aluminumRowModel';
import { usePaginationEnabled } from '@/features/settings/paginationSettings';

/** Danh sách cây nhôm: bảng cho desktop, thẻ cho điện thoại (đổi theo breakpoint trong aluminum.css). */
export function AluminumTable({
  rows,
  onRowChange,
  onAddProfile,
  onDeleteProfile,
}: {
  rows: AluminumEstimatorRowViewModel[];
  onRowChange: (rowId: string, patch: AluminumEstimatorRowPatch) => void;
  onAddProfile: () => void;
  onDeleteProfile: (row: AluminumEstimatorRowViewModel['source']) => void;
}) {
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const paginationEnabled = usePaginationEnabled('aluminum');
  // Tắt phân trang: một trang duy nhất chứa trọn danh sách.
  const effectivePageSize = paginationEnabled ? pageSize : Math.max(1, rows.length);
  const totalPages = Math.max(1, Math.ceil(rows.length / effectivePageSize));
  const page = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * effectivePageSize;
    return rows.slice(start, start + effectivePageSize);
  }, [page, effectivePageSize, rows]);
  const firstItemNumber = rows.length === 0 ? 0 : (page - 1) * effectivePageSize + 1;
  const lastItemNumber = rows.length === 0 ? 0 : Math.min(page * effectivePageSize, rows.length);

  const renderInput = (
    rowId: string,
    key: 'quantity' | 'unitPrice',
    value: string,
    label: string,
    className: string,
  ) => {
    const numeric = parseSmartNumber(value, {
      mode: key === 'quantity' ? 'int' : 'currency',
      min: 0,
    });
    return (
      <SmartNumberInput
        aria-label={label}
        className={className}
        mode={key === 'quantity' ? 'int' : 'currency'}
        min={0}
        value={numeric}
        onChange={(n) => {
          // Lưu chuỗi: 0 → "" để ô trống, gõ tiếp được; còn lại số thuần.
          onRowChange(rowId, { [key]: n === 0 ? '' : String(n) });
        }}
        onClick={(event) => event.stopPropagation()}
        placeholder="0"
      />
    );
  };

  const renderImage = (source: AluminumEstimatorRowViewModel['source']) => {
    const image = getAluminumProfileImageDisplay(source.image);
    return (
      <div className="aluminum-image-cell">
        {image.kind === 'image' ? (
          <img
            src={image.src}
            alt={`Hình ${source.code}`}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span>{image.label}</span>
        )}
      </div>
    );
  };

  const openRowImage = (source: AluminumEstimatorRowViewModel['source']) => {
    const image = getAluminumProfileImageDisplay(source.image);
    if (image.kind === 'image') openImageLightbox(image.src);
  };

  return (
    <>
      {/* Desktop / tablet ngang: bảng */}
      <div className="aluminum-table-shell aluminum-table-desktop">
        <div className="aluminum-table-toolbar">
          <span>Danh sách cây nhôm</span>
          <button type="button" className="btn btn-primary" onClick={onAddProfile}>
            <Plus size={16} /> Thêm loại nhôm
          </button>
        </div>
        <div className="aluminum-table-wrap">
          <table className="aluminum-table aluminum-table-compact">
            <colgroup>
              <col className="aluminum-col-image" />
              <col className="aluminum-col-code" />
              <col className="aluminum-col-description" />
              <col className="aluminum-col-quantity" />
              <col className="aluminum-col-price" />
              <col className="aluminum-col-total" />
              <col className="aluminum-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Hình</th>
                <th>Mã cây</th>
                <th>Mô tả</th>
                <th>SL</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
                <th className="aluminum-actions-header">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map(({ source, input, calculated }) => {
              // Chỉ nhấn hàng đang được tính. Đơn giá có sẵn không có nghĩa là
              // người dùng đã chọn cây nhôm này cho báo giá hiện tại.
              const isActive = calculated.quantity > 0;
              const lineTotalText = calculated.lineTotal > 0
                ? `${formatEstimatorMoney(calculated.lineTotal)} đ`
                : '—';

                return (
                  <tr
                    key={source.rowId}
                    className={`aluminum-row-clickable${isActive ? ' active' : ''}`}
                    onClick={() => openRowImage(source)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') openRowImage(source);
                    }}
                    aria-label={`Xem hình ${source.code}`}
                  >
                    <td>{renderImage(source)}</td>
                    <td className="code">{source.code}</td>
                    <td className="description">{source.description}</td>
                    <td className="input-cell center" onClick={(event) => event.stopPropagation()}>
                      {renderInput(source.rowId, 'quantity', input.quantity, `SL cây ${source.code}`, 'aluminum-qty-input')}
                    </td>
                    <td className="input-cell num" onClick={(event) => event.stopPropagation()}>
                      {renderInput(source.rowId, 'unitPrice', input.unitPrice, `Đơn giá ${source.code}`, 'aluminum-price-input')}
                    </td>
                    <td className={calculated.lineTotal > 0 ? 'num total' : 'num muted'}>{lineTotalText}</td>
                    <td className="aluminum-profile-actions" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => onDeleteProfile(source)}
                        aria-label={`Xoá ${source.code}`}
                        title="Xoá cây nhôm khỏi bảng"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {paginationEnabled && (
          <nav className="aluminum-pagination" aria-label="Phân trang danh sách cây nhôm">
            <div className="aluminum-pagination-summary">
              <span>Hiển thị {firstItemNumber}–{lastItemNumber} / {rows.length} cây</span>
              <label>
                Mỗi trang
                <select
                  className="input aluminum-page-size-select"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value) as 10 | 25 | 50);
                    setCurrentPage(1);
                  }}
                  aria-label="Số dòng mỗi trang"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
            <div className="aluminum-pagination-controls">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={page === 1}
                aria-label="Trang trước"
              >
                <ChevronLeft size={17} />
              </button>
              <span aria-live="polite">Trang <strong>{page}</strong> / {totalPages}</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                aria-label="Trang sau"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </nav>
        )}
      </div>

      {/* Điện thoại: thẻ gọn, không cuộn ngang */}
      <div className="aluminum-card-list" aria-label="Danh sách cây nhôm">
        <button type="button" className="btn btn-primary aluminum-card-add" onClick={onAddProfile}>
          <Plus size={16} /> Thêm loại nhôm
        </button>
        {rows.map(({ source, input, calculated }) => {
          const isActive = calculated.quantity > 0;
          const lineTotalText = calculated.lineTotal > 0
            ? `${formatEstimatorMoney(calculated.lineTotal)} đ`
            : '—';

          return (
            <article
              key={source.rowId}
              className={`aluminum-card${isActive ? ' active' : ''}`}
              onClick={() => openRowImage(source)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') openRowImage(source);
              }}
              aria-label={`Xem hình ${source.code}`}
            >
              <div className="aluminum-card-top">
                {renderImage(source)}
                <div className="aluminum-card-meta">
                  <strong className="aluminum-card-code">{source.code}</strong>
                  <span className="aluminum-card-desc">{source.description}</span>
                </div>
              </div>
              <div className="aluminum-card-fields" onClick={(event) => event.stopPropagation()}>
                <label className="aluminum-card-field">
                  <span>SL</span>
                  {renderInput(source.rowId, 'quantity', input.quantity, `SL cây ${source.code}`, 'aluminum-qty-input')}
                </label>
                <label className="aluminum-card-field aluminum-card-field-price">
                  <span>Đơn giá</span>
                  {renderInput(source.rowId, 'unitPrice', input.unitPrice, `Đơn giá ${source.code}`, 'aluminum-price-input')}
                </label>
                <div className="aluminum-card-field aluminum-card-total">
                  <span>Thành tiền</span>
                  <strong className={calculated.lineTotal > 0 ? 'total' : 'muted'}>{lineTotalText}</strong>
                </div>
              </div>
              <button
                type="button"
                className="aluminum-card-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteProfile(source);
                }}
              >
                <Trash2 size={15} /> Xoá cây nhôm này
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
