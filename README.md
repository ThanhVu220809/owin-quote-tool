# OWIN Quote Tool — Báo giá nhôm kính

App tính báo giá + xuất Word, chạy client-side (Vite + React + TS). Code app nằm trong thư mục `owin-quote-tool/`.

## Yêu cầu
- **Node.js 22+** và npm (kiểm tra: `node -v`).

## Clone & cài
```bash
git clone https://github.com/T-Anh17/owin-quote-tool.git
cd owin-quote-tool/owin-quote-tool      # lưu ý: app ở thư mục con cùng tên
npm install
```

## Chạy test tự động (40 test) ⭐
```bash
npm run test
```
Kỳ vọng: **Test Files 7 passed · Tests 40 passed**. Bao trùm:
- Engine tính tiền full-precision (BR-1: S1 = `4.296.032đ` đúng từng đồng)
- Khối lượng 3 ĐVT (m²/md/Bộ), format tiền VN
- Lưu/đọc ảnh + sản phẩm trong IndexedDB, tombstone xoá mềm
- Tính dòng báo giá + override không phá kho (BR-6)
- Xuất Word 2 format (số khớp, nhúng ảnh)
- Sync merge LWW + tombstone + phát hiện conflict (BR-8)

## Chạy thử app
```bash
npm run dev        # mở http://localhost:5173
npm run build      # build production (tsc + vite), phải sạch lỗi
```
- Tab **Kho sản phẩm**: thêm/sửa/xoá, gắn ảnh (tự nén + xử lý EXIF).
- Tab **Báo giá**: chọn SP → nhập kích thước → số nhảy real-time → **Xuất Word** F1/F2.

## (Tuỳ chọn) Bật đồng bộ Google Drive
Sync cần backend riêng. Copy `.env.example` → `.env` và điền `VITE_GOOGLE_CLIENT_ID`,
`VITE_BACKEND_URL`, `VITE_SHARED_SECRET`. Không có `.env` thì app vẫn chạy đầy đủ
(offline-first, IndexedDB) — chỉ ẩn phần sync. Chi tiết dựng backend xem `OWIN_BUILD_RUNBOOK.md`.

## Cấu trúc
```
owin-quote-tool/            (repo)
├── Code.gs                 backend Apps Script (giữ secret, đổi token)
├── OWIN_BUILD_RUNBOOK.md   tài liệu build + checklist
└── owin-quote-tool/        app Vite React-TS  ← chạy lệnh npm trong đây
    └── src/                 ...*.test.ts là test
```
