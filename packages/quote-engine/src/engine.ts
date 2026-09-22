/**
 * ENGINE TOÁN HỌC — trái tim của Owin Quote Tool.
 *
 * HẰNG SỐ NGHIỆP VỤ (BẤT BIẾN):
 *  - BR-1: thành tiền = (KL đã LÀM TRÒN 3 SỐ LẺ) × đơn giá, rồi Math.round()
 *          MỘT LẦN ở cuối. Làm tròn KL 3 số lẻ TRƯỚC khi nhân.
 *          Chuẩn: S1 1.196×1.796×1 = 2.148016 → 2.148 × 2.000.000 = 4.296.000đ.
 *          → quantity.ts: roundQuantity3 + roundMoneyToVnd.
 *  - BR-2: khối lượng HIỂN THỊ làm tròn 3 số lẻ — bằng đúng số đem nhân ở BR-1.
 *          → quantity.ts: roundQuantity3.
 *  - BR-3: 3 hệ ĐVT (ProductUnit):
 *          M2     : KL = rộng × cao × sl
 *          METER  : KL = (rộng + cao) × sl
 *          BO     : KL = sl (bỏ qua rộng/cao); thành tiền = sl × đơn giá.
 *          → quantity.ts: calculateDimensionQuantity.
 *  - BR-1b: TỔNG báo giá làm tròn XUỐNG bội số 100.000 (floor — "LÀM TRÒN" không
 *          bao giờ làm tăng số phải trả).
 *          → rounding.ts: roundMoneyDownToHundredThousands, totals.ts: calculateRoundedTotal.
 *  - BR-6: dòng báo giá là snapshot độc lập — sửa giá/phụ kiện trên dòng KHÔNG
 *          ghi ngược vào sản phẩm gốc trong kho.
 *          → lib/quote/productToQuoteItem.ts.
 */

export * from './engineTypes';
export * from './units';
export * from './quantity';
export * from './rounding';
export * from './accessoryPricing';
export * from './fixedAccessoryRules';
export * from './totals';
