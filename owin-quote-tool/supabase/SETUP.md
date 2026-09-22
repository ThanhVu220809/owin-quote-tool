# Supabase + GitHub Pages

## Supabase

1. Project mới: chạy toàn bộ `schema.sql` trong SQL Editor. File có thể chạy lại an toàn.
2. Project đã có dữ liệu theo schema cũ: chạy `migrations/` **theo đúng thứ tự số** trước, rồi mới chạy `schema.sql`. Migration đổi tên bảng/cột và gán dữ liệu cũ vào cửa hàng `owin`; bản web đang deploy sẽ hỏng cho tới khi deploy code mới.
3. Bật Email/Password Auth. Muốn đăng nhập Google/Facebook thì bật provider tương ứng trong Authentication → Providers và thêm URL ứng dụng vào Redirect URLs.
4. Quên mật khẩu dùng mã OTP: vào Authentication → Email Templates → **Reset Password** và thêm `{{ .Token }}` vào nội dung email. Template mặc định chỉ có link, không có mã số.
5. Bucket `product-images` cho URL ảnh catalogue công khai nhưng chặn anon list; bucket `quote-images` private cho ảnh riêng trong báo giá. RLS và Realtime được cấu hình bởi schema.
6. Chỉ đưa Project URL và anon key vào frontend. Không bao giờ đưa `service_role` hoặc PAT vào GitHub Pages.

## Mô hình đa cửa hàng

Tài khoản, mật khẩu, Google/Facebook và quên mật khẩu do Supabase Auth quản lý trong schema `auth`. Không có bảng user tự viết và không tự lưu mật khẩu.

| Bảng | Vai trò |
| --- | --- |
| `profiles` | Hồ sơ 1-1 với `auth.users`: tên hiển thị, email, ảnh đại diện, cờ Quản trị viên hệ thống |
| `stores` | Cửa hàng; `status` pending/active/rejected, `is_public` quyết định landing page có đọc được bảng giá không |
| `store_members` | Ai thuộc cửa hàng nào, `role` owner/manager/staff, `status` pending/active/disabled |
| `products` | Bảng giá riêng của từng cửa hàng + JSON document đầy đủ |
| `quotes` | Báo giá riêng của từng cửa hàng + snapshot đầy đủ |
| `suggestions` | Autocomplete đã học, dùng chung trong một cửa hàng |
| `app_documents` | Document cấu hình theo cửa hàng, gồm trạng thái tính nhôm |

## Ba vai trò

| Vai trò | Làm được gì | Ai duyệt |
| --- | --- | --- |
| Quản trị viên hệ thống | Duyệt/từ chối cửa hàng mới của toàn hệ thống | — |
| Chủ cửa hàng (`owner`) / Quản lý (`manager`) | Duyệt nhân viên xin vào, nâng/hạ vai trò, khoá thành viên | Quản trị viên hệ thống duyệt cửa hàng |
| Nhân viên (`staff`) | Dùng bảng giá và báo giá của cửa hàng | Chủ/Quản lý cửa hàng |

Quản trị viên hệ thống **khác** chủ cửa hàng và khác Quản lý: đánh dấu bằng `profiles.is_platform_admin`. Một người có thể là Quản trị viên hệ thống mà không sở hữu dữ liệu của cửa hàng nào — hai danh sách khai báo riêng ở đầu migration 0001 (`store_owner_email`) và 0002 (`platform_admin_emails`). Chữ "admin" trong toàn hệ thống chỉ mang nghĩa này — vai trò quản lý bên trong một cửa hàng tên là `manager`. Migration 0002 gán vai trò này cho chủ cửa hàng `owin`.

## Luồng duyệt

Người đăng nhập lần đầu được tạo `profiles` tự động nhưng **chưa thuộc cửa hàng nào**. Màn hình sẽ mời họ chọn một trong hai:

1. **Mở cửa hàng mới** — chỉ nhập tên; mã cửa hàng do server sinh từ tên đó (bỏ dấu tiếng Việt, trùng thì thêm hậu tố số). Cửa hàng ở `status = 'pending'`, Quản trị viên hệ thống duyệt trong **Menu tài khoản → Quản trị cửa hàng**. Từ chối không xoá yêu cầu — vẫn duyệt lại được sau.
2. **Xin vào cửa hàng có sẵn** — nhập mã cửa hàng (chính là `slug`). Yêu cầu vào `store_members` ở `status = 'pending'`, chủ/quản lý cửa hàng đó duyệt cũng ở màn Quản trị cửa hàng.

Cấp thêm Quản trị viên hệ thống (chỉ làm được bằng SQL, cố ý):

```sql
update public.profiles set is_platform_admin = true
where email = 'nguoiquantri@example.com';
```

Duyệt tay khi cần (ví dụ mất quyền vào app):

```sql
insert into public.store_members (store_id, user_id, role, status)
select 'owin', id, 'staff', 'active' from auth.users where email = 'nguoimoi@example.com'
on conflict (store_id, user_id) do update set status = 'active';
```

Mọi bảng nghiệp vụ bật RLS và chỉ thành viên `active` của cửa hàng mới đọc/ghi được dữ liệu của cửa hàng đó. Trigger `revision` đánh dấu mỗi lần cập nhật; trigger xóa mềm ngăn một form cũ hồi sinh sản phẩm/báo giá đã bị xóa trên máy khác. Realtime là cơ chế tự cập nhật, không có nút Sync và không có browser database dự phòng.

Storage đóng khung theo cửa hàng bằng đoạn đầu đường dẫn: ảnh mới nằm ở `<store_id>/img|thumb|export|products/...`. Ảnh tạo trước khi có đa cửa hàng nằm phẳng ở gốc bucket và **cố ý không di chuyển** — URL công khai của chúng đã nằm trong JSON sản phẩm và báo giá cũ, đổi chỗ là hỏng hết ảnh đang dùng. Nhóm đường dẫn phẳng đó chỉ thành viên cửa hàng `owin` chạm được, vì lúc chúng ra đời chưa có cửa hàng nào khác.

## GitHub Pages

Repository Settings → Secrets and variables → Actions cần hai secret:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Push vào `main` chạy CI rồi workflow Deploy GitHub Pages. Domain production là `admin.hoanganhowin.io.vn` và file `public/CNAME` giữ custom domain.

## Trạng thái migration

Dữ liệu trình duyệt cũ đã được chuyển lên Supabase. Bản production không còn importer hoặc browser database.
