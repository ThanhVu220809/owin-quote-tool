# Setup Supabase + Vercel cho OWIN Quote Tool

Mô hình: **Vercel** host web · **Supabase** chứa data + ảnh + đăng nhập · giữ **Vite + React**.

## A. Tạo Supabase (bạn làm — ~10 phút)

1. Vào **supabase.com** → đăng nhập → **New project**.
   - Region: **Singapore** (gần VN nhất).
   - Đặt mật khẩu database (lưu lại, chỉ dùng khi cần).
2. **SQL Editor** → New query → dán toàn bộ `schema.sql` → **Run**.
3. **Storage** → **New bucket** → tên đúng `product-images` → bật **Public** → Create.
   (Sau khi tạo bucket, chạy lại phần STORAGE ở cuối `schema.sql` nếu lúc đầu báo lỗi thiếu bucket.)
4. **Authentication → Users → Add user**: tạo 1 tài khoản admin (email + mật khẩu) — đây là tài khoản bạn login vào tool.
   - (Tuỳ chọn) Authentication → Providers → tắt "Confirm email" cho nhanh.
5. **Project Settings → API**, copy 2 giá trị gửi cho tôi:
   - **Project URL**  (dạng `https://xxxx.supabase.co`)
   - **anon public key**  (KHÔNG phải `service_role`)

> anon key là public, để trong bundle client là bình thường. TUYỆT ĐỐI không đưa `service_role` key vào client.

## B. Vercel (làm khi qua bước deploy)

1. **vercel.com** → New Project → import repo `owin-quote-tool`.
   - Root Directory: `owin-quote-tool`
   - Framework preset: **Vite** (tự nhận), Build: `npm run build`, Output: `dist`.
2. Environment Variables: thêm `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. (Sau khi chạy ổn) trỏ domain `saigonfox.online` sang Vercel.

## C. Phần tôi làm (sau khi có URL + anon key)

- Thêm `@supabase/supabase-js` + `supabaseClient.ts`.
- Viết lại tầng data: products/quotes đọc-ghi thẳng Supabase (bỏ full-sync Google Drive → hết "nặng lâu").
- Màn đăng nhập admin (login 1 lần, nhớ phiên).
- Script migrate: đẩy 142 sản phẩm hiện tại (**dedupe sạch `-COPY-`**) + ảnh lên Supabase Storage + báo giá.
- Giữ Google Sheet mirror như 1 kênh backup phụ (tuỳ chọn).
