-- ============================================================================
-- OWIN QUOTE TOOL — Supabase schema
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run (1 lần).
-- Mô hình "document + cột index": giữ NGUYÊN record app dạng jsonb `data`
-- (migrate không mất field), đồng thời tách vài cột để query/hiển thị nhanh.
-- ============================================================================

-- ---------- Bảng sản phẩm (bảng giá) ----------
create table if not exists public.products (
  id               text primary key,          -- dùng product code hiện tại làm id
  code             text unique not null,
  name             text,
  category         text,
  unit             text,
  unit_price_vnd   bigint,
  size_text        text,
  cover_image_path text,                       -- đường dẫn ảnh trong Storage bucket
  sort_order       int,
  is_public        boolean default true,       -- để landing page sau này lọc
  data             jsonb not null,             -- full ProductRecord (không mất gì)
  updated_at       timestamptz default now(),
  deleted_at       timestamptz
);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_sort_idx     on public.products (sort_order);

-- ---------- Bảng báo giá ----------
create table if not exists public.quotes (
  id               text primary key,
  code             text unique,
  customer_name    text,
  customer_phone   text,
  quote_date       date,
  status           text,
  total_vnd        bigint,
  data             jsonb not null,             -- full QuoteRecord
  owner            uuid references auth.users, -- ai tạo báo giá (để xem tập trung)
  updated_at       timestamptz default now(),
  deleted_at       timestamptz
);
create index if not exists quotes_owner_idx on public.quotes (owner);
create index if not exists quotes_date_idx  on public.quotes (quote_date);

-- ---------- Cấp quyền cho Data API (vì "auto expose new tables" đang tắt) ----------
grant usage on schema public to anon, authenticated;
grant all privileges on public.products to authenticated;
grant all privileges on public.quotes   to authenticated;

-- ---------- RLS (Row Level Security) ----------
-- Giai đoạn TOOL-ADMIN: mọi thao tác đều cần đăng nhập (admin login 1 lần).
-- Landing công khai (anon đọc products) sẽ mở policy riêng ở phase sau.
alter table public.products enable row level security;
alter table public.quotes   enable row level security;

drop policy if exists products_auth_all on public.products;
create policy products_auth_all on public.products
  for all to authenticated using (true) with check (true);

drop policy if exists quotes_auth_all on public.quotes;
create policy quotes_auth_all on public.quotes
  for all to authenticated using (true) with check (true);

-- ---------- Tự cập nhật updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before update on public.quotes
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- STORAGE (ảnh sản phẩm)
-- Bucket product-images (Public = ON) — anon xem ảnh; authenticated upload/sửa/xoá.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');

drop policy if exists product_images_write on storage.objects;
create policy product_images_write on storage.objects
  for all to authenticated
  using (bucket_id = 'product-images') with check (bucket_id = 'product-images');
