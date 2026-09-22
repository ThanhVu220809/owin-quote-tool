<<<<<<< HEAD
# owin-quote-tool
=======
# OWIN Quote Tool — phát triển

Tài liệu đầy đủ về chức năng, công thức, kiến trúc, dữ liệu, đồng bộ, ảnh, xuất tài liệu, phân quyền và triển khai nằm tại **[README gốc](../README.md)**. Đây là điểm tra cứu chính để tránh hai bản mô tả nghiệp vụ khác nhau.

## Chạy local

Dùng Node.js 22 và npm, chạy trong thư mục chứa file này:

```powershell
Copy-Item .env.example .env
npm ci
```

Điền `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` vào `.env`, áp dụng [schema](supabase/schema.sql) và cấu hình tài khoản theo [Supabase setup](supabase/SETUP.md), sau đó:

```powershell
npm run dev
```

## Kiểm tra

```powershell
npm run lint
npm test
npm run build
npm run preview
```

Build kiểm tra TypeScript và tạo `dist/`; preview phục vụ bản build local. `VITE_*` được nhúng vào frontend, chỉ dùng URL/anon key công khai.

## Bản đồ mã nguồn

| Phần | Vị trí |
| --- | --- |
| Shell/điều hướng | `src/App.tsx`, `src/styles/shell.css` |
| Design token (iOS) | `src/styles/tokens.css` |
| Control dùng chung | `src/styles/ios.css` |
| Component dùng chung | `src/styles/components.css` |
| Pattern nhiều tab dùng | `src/styles/patterns.css` |
| Màn hình/store | `src/features/` |
| Công thức báo giá | `src/lib/quoteEngine/`, `src/lib/quote/quoteCalculator.ts` |
| Bảng giá/thứ tự | `src/lib/catalogue/`, `src/lib/products/`, `src/features/quote/quoteItemOrder.ts` |
| Tính nhôm | `src/features/aluminum/` (kèm `estimator/`) |
| Dữ liệu/đồng bộ | `src/services/supabase/`, `supabase/schema.sql` |
| Kiểu document | `src/types/models.ts` |
| Ảnh | `src/lib/media/`, `src/services/supabase/imagesRepo.ts` |
| Word/Excel/PDF | `src/features/export/`; Word/in nhôm ở `src/features/aluminum/estimator/` |
| Template | `src/assets/templates/` |

## Cấu trúc một tính năng

Mỗi tab trên thanh điều hướng là một module tự chứa trong `src/features/`. Cả bốn
tab đều đã tách; `products` là bản mẫu tham chiếu:

```
src/features/products/
  index.ts               # bề mặt công khai — ngoài feature chỉ import từ đây
  products.css           # stylesheet riêng của tab (iOS)
  ProductsView.tsx       # orchestrator: state + gọi Supabase
  Product*.tsx           # panel/dialog con, chỉ dựng UI
  productDraft.ts        # công thức thuần của form (+ productDraft.test.ts)
  productSuggestions.ts  # pool gợi ý theo từng field
  productStore.ts / useProducts.ts / productEvents.ts   # dữ liệu
```

| Tab | Thư mục | Stylesheet | Logic thuần đã tách |
| --- | --- | --- | --- |
| Sản phẩm | `features/products/` | `products.css` | `productDraft.ts`, `productSuggestions.ts` |
| Báo giá | `features/quote/` | `quote.css` | `quoteDraft.ts`, `quotePrintModel.ts`, `quoteFormat.ts` |
| Bảng giá | `features/catalogue/` | `catalogue.css` | `catalogueBlocks.ts`, `useCatalogueExport.ts` |
| Tính nhôm | `features/aluminum/` | `aluminum.css` | `aluminumRowModel.ts`, `aluminumPageActions.ts` |

Quy ước: cái gì CHỈ một feature dùng thì nằm trong feature đó; logic domain dùng
chung từ hai feature trở lên ở lại `src/lib/`; UI dùng chung ở `src/components/`.
Quy ước này đã được áp: mọi module còn lại trong `src/lib/` đều có từ hai feature
trở lên dùng tới. Trước khi thêm file vào `src/lib/`, kiểm tra xem nó có thật sự
dùng chung không.
CSS xếp lớp theo thứ tự import trong `main.tsx`: `tokens.css` → `ios.css` →
`components.css` → `patterns.css` → `shell.css` → stylesheet của từng feature
(nạp sau nên thắng). Không còn file theme legacy: rule của một tab luôn nằm
trong stylesheet của tab đó.

Chuẩn giao diện nằm ở [IOS_STYLE_GUIDE.md](../IOS_STYLE_GUIDE.md); đọc mục 4–6
trước khi sửa UI và dùng checklist mục 15 trước khi hoàn tất.

Sửa công thức chạy `npx vitest run src/lib/quoteEngine src/lib/quote src/features/quote`; sửa template chạy `npx vitest run src/features/export` và kiểm tra trực quan file xuất. Giữ marker đúng hợp đồng DOCX, import bằng `@/`, component PascalCase và file logic camelCase.

Sản phẩm/báo giá lưu thủ công; xuất từ form báo giá không tự lưu. Đơn giá tính nhôm tự lưu còn số lượng chỉ trong phiên. Đọc quy tắc chi tiết trong README gốc trước khi sửa store/công thức.
>>>>>>> f1c4b55 (Reset repo and initialize clean main branch)
