import type { QuoteRecord } from '@/types/models';
import type { calculateQuote } from '@/lib/quote/quoteCalculator';
import { CurrencyInput } from '@/components/CurrencyInput';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Field, SaveFeedback, TotalLine } from '@/features/quote/QuoteFormPrimitives';
import type { SaveUiState } from '@/features/quote/QuoteFormPrimitives';
import type { VietnamProvince } from '@/features/quote/vietnamAddressApi';

/** Thẻ đầu form: thông tin khách hàng và trạng thái lưu. */
export function QuoteFormTopGrid({
  customerName,
  customerPhone,
  customerEmail,
  customerStreet,
  customerProvinceCode,
  customerWardCode,
  addressProvinces,
  addressLoading,
  addressError,
  quoteDate,
  depositVnd,
  quoteCode,
  status,
  suggestions,
  saveUiState,
  saveError,
  message,
  onCustomerName,
  onCustomerPhone,
  onCustomerEmail,
  onCustomerStreet,
  onCustomerProvince,
  onCustomerWard,
  onQuoteDate,
  onDeposit,
  onRetrySave,
}: {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerStreet: string;
  customerProvinceCode: string;
  customerWardCode: string;
  addressProvinces: VietnamProvince[];
  addressLoading: boolean;
  addressError: string;
  quoteDate: string;
  depositVnd: number;
  quoteCode: string;
  status: QuoteRecord['status'];
  suggestions: Record<string, string[]>;
  saveUiState: SaveUiState;
  saveError: string;
  message: string;
  onCustomerName: (value: string) => void;
  onCustomerPhone: (value: string) => void;
  onCustomerEmail: (value: string) => void;
  onCustomerStreet: (value: string) => void;
  onCustomerProvince: (value: string) => void;
  onCustomerWard: (value: string) => void;
  onQuoteDate: (value: string) => void;
  onDeposit: (value: number) => void;
  onRetrySave: () => void;
}) {
  const saveHint = saveUiState === 'idle'
    ? 'Thêm hạng mục rồi bấm «Lưu báo giá».'
    : saveUiState === 'pending'
      ? 'Có thay đổi chưa lưu.'
      : saveUiState === 'saving'
        ? 'Đang lưu…'
        : saveUiState === 'saved'
          ? 'Đã lưu.'
          : '';

  return (
    <div className="quote-section-block quote-customer-section">
      <div className="quote-section-label">Thông tin khách hàng</div>
      <div className="card quote-customer-card">
        <div className="quote-customer-form-shell">
      <div className="quote-customer-grid">
        <Field label="Họ tên" required value={customerName} onChange={onCustomerName} suggestions={suggestions.customer_name} />
        <Field label="Điện thoại" required value={customerPhone} onChange={onCustomerPhone} />
        <SearchableSelect
          label="Tỉnh/Thành"
          required
          value={customerProvinceCode}
          options={addressProvinces.map((province) => ({ value: String(province.code), label: province.name }))}
          onChange={onCustomerProvince}
          disabled={addressProvinces.length === 0}
          loading={addressLoading}
          searchPlaceholder="Gõ tên tỉnh/thành…"
        />
        <SearchableSelect
          label="Phường/Xã"
          required
          value={customerWardCode}
          options={addressProvinces
            .find((province) => String(province.code) === customerProvinceCode)
            ?.wards.map((ward) => ({ value: String(ward.code), label: ward.name })) || []}
          onChange={onCustomerWard}
          disabled={!customerProvinceCode}
          loading={addressLoading}
          searchPlaceholder="Gõ tên phường/xã…"
        />
        <div className="field">
          <label>Số nhà/Tên đường <span className="required-mark">*</span></label>
          <input
            className="input"
            value={customerStreet}
            onChange={(event) => onCustomerStreet(event.target.value)}
            placeholder="Số nhà A, ngõ B, đường C"
            autoComplete="street-address"
          />
        </div>
      </div>
      <div className="quote-customer-secondary-grid">
        <Field label="Email (không bắt buộc)" value={customerEmail} onChange={onCustomerEmail} />
        <div className="field">
          <label>Ngày báo giá</label>
          <input className="input" type="date" value={quoteDate} onChange={(e) => onQuoteDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Tạm ứng</label>
          <CurrencyInput value={depositVnd} onChange={onDeposit} placeholder="0" />
        </div>
      </div>
      {addressLoading && <div className="product-sub quote-address-status">Đang tải tỉnh/thành và phường/xã…</div>}
      {addressError && <div className="product-sub quote-address-status" role="alert">{addressError} Bạn vẫn có thể nhập địa chỉ ở ô số nhà/tên đường.</div>}
      <div className="product-sub quote-customer-status-line">
        {quoteCode || 'Chưa có mã'} · Trạng thái: {status}
        {saveHint && <> · {saveHint}</>}
      </div>
      {saveUiState === 'error' && (
        <SaveFeedback
          state={saveUiState}
          error={saveError}
          onRetry={onRetrySave}
        />
      )}
      {message && !saveError && <div className="product-sub" style={{ color: 'var(--ios-green)' }}>{message}</div>}
        </div>
      </div>
    </div>
  );
}

/** Tổng kết đặt sau danh sách hạng mục để khép lại flow báo giá. */
export function QuoteTotalsCard({ summary }: { summary: ReturnType<typeof calculateQuote>['summary'] }) {
  return (
    <section className="quote-section-block quote-totals-section">
      <div className="quote-section-label">Tổng tiền</div>
      <div className="card quote-totals-card quote-summary-card">
      <div className="quote-summary-heading">
        <div>
          <div className="product-sub">Tự động cập nhật theo các hạng mục báo giá</div>
        </div>
        <span className="quote-summary-badge">Tổng kết báo giá</span>
      </div>
      <div className="quote-summary-lines">
        <TotalLine label="Tiền sản phẩm" value={summary.subtotalProductVnd} />
        <TotalLine label="Tiền phụ kiện" value={summary.subtotalAccessoryVnd} />
        <TotalLine label="Tổng trước làm tròn" value={summary.totalVnd} />
        <TotalLine label="Làm tròn xuống" value={summary.roundedTotalVnd} strong />
        <TotalLine label="Cần thanh toán" value={summary.balanceVnd} strong />
      </div>
      </div>
    </section>
  );
}
