# OWIN Quote Tool

Công cụ nội bộ React/Vite được deploy bằng GitHub Pages tại `saigonfox.online`.

## Kiến trúc

- Supabase Auth: đăng nhập người dùng.
- Supabase Postgres: nguồn dữ liệu duy nhất cho sản phẩm, báo giá, suggestions, meta và tính nhôm.
- Supabase Storage: ảnh sản phẩm/báo giá; app chỉ lưu URL CDN trong record.
- Supabase Realtime: trình duyệt đang mở tự cập nhật khi máy khác sửa dữ liệu.
- GitHub Actions/Pages: test, lint, build và deploy từ nhánh `main`.

App không lưu dữ liệu nghiệp vụ mới vào IndexedDB/localStorage. Menu có công cụ chỉ-đọc một lần để cứu dữ liệu IndexedDB từ phiên bản cũ lên Supabase.

## Chạy local

```bash
cp .env.example .env
npm ci
npm run dev
```

Hai biến bắt buộc:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-key>
```

Không đặt `service_role`, Supabase PAT hoặc mật khẩu người dùng vào source/frontend.

## Kiểm tra

```bash
npm run lint
npm test
npm run build
```

Schema idempotent nằm tại `supabase/schema.sql`.
