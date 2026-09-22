/**
 * `@owin/quote-engine` — phép tính tiền dùng chung.
 *
 * Package này là NGUỒN CHÂN LÝ DUY NHẤT của giá. Công cụ quản trị và web công
 * khai đều import từ đây, để cùng một sản phẩm với cùng kích thước và số lượng
 * thì hai nơi không bao giờ ra hai con số.
 *
 * Thuần TypeScript: không React, không Supabase, không DOM, không biến môi
 * trường. Thêm bất kỳ thứ nào trong số đó vào đây là làm hỏng khả năng dùng lại
 * của chính package.
 *
 * NHỚ hai nhánh tiền làm tròn KHÁC nhau:
 *  - nhánh báo giá (`calculateQuote`) làm tròn tổng XUỐNG bội số 100.000;
 *  - nhánh bảng giá (`buildCatalogueMoneyBlocks`) thì KHÔNG.
 * Dùng nhầm nhánh là ra số khác công cụ quản trị.
 */

export * from './models';
export * from './engine';
export * from './quoteCalculator';
export * from './accessoryDrafts';
export * from './catalogueMoney';
export * from './categoryOrder';
export * from './titleCase';
export * from './productToQuoteItem';
