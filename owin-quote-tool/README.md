# OWIN Quote Tool

Công cụ nội bộ React/Vite được deploy bằng GitHub Pages tại `saigonfox.online`.

## Kiến trúc

- Supabase Auth: đăng nhập người dùng.
- Supabase Postgres: nguồn dữ liệu duy nhất cho sản phẩm, báo giá, suggestions, meta và tính nhôm.
- Supabase Storage: ảnh sản phẩm/báo giá; app chỉ lưu URL CDN trong record.
- Supabase Realtime: trình duyệt đang mở tự cập nhật khi máy khác sửa dữ liệu.
- GitHub Actions/Pages: test, lint, build và deploy từ nhánh `main`.

Form sản phẩm, báo giá và bảng tính nhôm tự lưu sau khoảng 1 giây, chỉ báo “đã lưu” sau khi Supabase xác nhận. App không lưu dữ liệu nghiệp vụ vào IndexedDB/localStorage; localStorage chỉ chứa phiên đăng nhập Supabase. Dữ liệu cũ đã được chuyển xong lên Supabase.

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

Production tắt đăng ký công khai. Tài khoản mới phải được quản trị viên tạo và xác nhận trong Supabase Auth; không ghi mật khẩu vào repository hay GitHub Actions.

## Kiểm tra

```bash
npm run lint
npm test
npm run build
```

Schema idempotent nằm tại `supabase/schema.sql`.

Các file chụp màn hình/Word/PDF dùng kiểm tra thủ công phải để ngoài Git; `review-screenshots/` đã được ignore vì có thể chứa dữ liệu khách hàng.
