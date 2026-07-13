# Supabase + GitHub Pages

## Supabase

1. Chạy toàn bộ `schema.sql` trong SQL Editor. File có thể chạy lại an toàn.
2. Bật Email/Password Auth và tạo user trong Authentication.
3. Bucket public `product-images`, RLS và Realtime được cấu hình bởi schema.
4. Chỉ đưa Project URL và anon key vào frontend. Không bao giờ đưa `service_role` hoặc PAT vào GitHub Pages.

Các bảng dùng chung:

- `products`: catalog + JSON document đầy đủ.
- `quotes`: báo giá + snapshot đầy đủ.
- `suggestions`: autocomplete đã học.
- `app_data`: meta và trạng thái tính nhôm.

## GitHub Pages

Repository Settings → Secrets and variables → Actions cần hai secret:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Push vào `main` chạy CI rồi workflow Deploy GitHub Pages. Domain production là `saigonfox.online` và file `public/CNAME` giữ custom domain.

## Chuyển dữ liệu cũ

Trên đúng trình duyệt từng chứa dữ liệu cũ: đăng nhập → menu dấu ba chấm → **Khôi phục dữ liệu trình duyệt cũ (một lần)**. Công cụ chỉ đọc LocalForage cũ và upsert lên Supabase; mọi thao tác mới vẫn ghi trực tiếp Supabase.
