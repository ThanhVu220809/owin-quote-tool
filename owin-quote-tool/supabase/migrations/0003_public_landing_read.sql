-- ============================================================================
-- MIGRATION 0003 — quyền đọc cho trang công khai (owin-landing)
--
-- Chạy SAU 0002. Chạy xong thì chạy lại schema.sql để hội tụ policy/hàm.
--
-- Trang công khai là một project riêng, KHÔNG có đăng nhập. Nó đọc Supabase
-- bằng anon key. Migration này mở đúng hai thứ nó cần, không rộng hơn:
--
--   1. Sản phẩm công khai của cửa hàng công khai — đọc được BẤT KỂ trạng thái
--      đăng nhập.
--   2. MỘT document nội dung website trong app_documents.
--
-- KHÔNG đụng tới: quotes · stores · store_members · profiles · suggestions ·
-- và mọi document khác trong app_documents (state tính nhôm nằm ở đó).
--
-- GHI CHÚ: `stores.is_public` của cửa hàng 'owin' ĐÃ bật từ trước, không cần
-- migration nào bật nó. Kiểm lại bằng: select public.public_store_ids();
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Sản phẩm công khai: đọc được bất kể đã đăng nhập hay chưa
--
-- LỖI ĐANG SỬA: `products_anon_read` chỉ áp cho role `anon`. Người ĐANG đăng
-- nhập mở trang công khai sẽ thấy TRỐNG, vì role `authenticated` chỉ còn
-- `products_member_all` (đòi phải là thành viên cửa hàng đó). Nhân viên OWIN
-- hay bất kỳ ai có tài khoản đều gặp, và triệu chứng "web trắng trơn với người
-- này mà bình thường với người kia" rất khó đoán ra nguyên nhân.
--
-- Đây KHÔNG phải "người đăng nhập được bỏ qua phân quyền". Quyền công khai và
-- quyền thành viên là hai đường riêng, được OR với nhau: đường công khai chỉ
-- mở đúng phạm vi dưới đây và mở cho MỌI người như nhau.
-- ---------------------------------------------------------------------------
drop policy if exists products_anon_read   on public.products;
drop policy if exists products_public_read on public.products;

create policy products_public_read on public.products
  for select to anon, authenticated
  using (
    deleted_at is null
    and is_public = true
    and store_id in (select public.public_store_ids())
  );

-- ---------------------------------------------------------------------------
-- 2. Nội dung website (hero, liên hệ, thương hiệu, sản phẩm nổi bật)
--
-- app_documents là bảng dùng chung cho nhiều loại cấu hình theo cửa hàng —
-- trong đó có state của tab Tính nhôm. Mở cả bảng cho anon là lộ dữ liệu nội
-- bộ, nên policy dưới đây khoá đúng MỘT khoá document.
--
-- Thêm loại nội dung công khai mới thì thêm khoá vào danh sách này, đừng nới
-- điều kiện thành `true`.
-- ---------------------------------------------------------------------------
grant select on public.app_documents to anon;

drop policy if exists app_documents_public_read on public.app_documents;

create policy app_documents_public_read on public.app_documents
  for select to anon, authenticated
  using (
    deleted_at is null
    and id = 'owin_landing_content_v1'
    and store_id in (select public.public_store_ids())
  );

commit;

-- ============================================================================
-- NGHIỆM THU — chạy khi đã ĐĂNG XUẤT hẳn (anon key), rồi lặp lại khi ĐÃ đăng
-- nhập. Cả hai lần phải ra cùng kết quả:
--
--   select count(*) from products;          -- > 0, chỉ sản phẩm công khai
--   select * from quotes limit 1;           -- phải LỖI quyền
--   select * from stores limit 1;           -- phải LỖI quyền
--   select * from app_documents limit 1;    -- chỉ thấy owin_landing_content_v1
--
-- Đọc được nhiều hơn bốn dòng trên là migration này sai, không phải "tiện hơn".
-- ============================================================================
