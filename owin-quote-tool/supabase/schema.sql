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

-- ---------- Dữ liệu dùng chung khác (không lưu IndexedDB) ----------
-- Suggestions được lưu từng giá trị để mọi tài khoản cùng dùng autocomplete.
create table if not exists public.suggestions (
  id          text primary key,
  type        text not null,
  value       text not null,
  used_count  integer not null default 1,
  data        jsonb not null,
  updated_at  timestamptz default now()
);
create index if not exists suggestions_type_value_idx on public.suggestions (type, value);

-- Meta/cấu hình và trạng thái tính nhôm dùng document JSON để giữ nguyên shape app.
create table if not exists public.app_data (
  key         text primary key,
  data        jsonb not null,
  updated_at  timestamptz default now(),
  owner       uuid references auth.users
);

-- ---------- Cấp quyền cho Data API (vì "auto expose new tables" đang tắt) ----------
grant usage on schema public to anon, authenticated;
grant all privileges on public.products to authenticated;
grant all privileges on public.quotes   to authenticated;
grant all privileges on public.suggestions to authenticated;
grant all privileges on public.app_data to authenticated;

-- ---------- RLS (Row Level Security) ----------
-- Giai đoạn TOOL-ADMIN: mọi thao tác đều cần đăng nhập (admin login 1 lần).
-- Landing công khai (anon đọc products) sẽ mở policy riêng ở phase sau.
alter table public.products enable row level security;
alter table public.quotes   enable row level security;
alter table public.suggestions enable row level security;
alter table public.app_data enable row level security;

drop policy if exists products_auth_all on public.products;
create policy products_auth_all on public.products
  for all to authenticated using (true) with check (true);

drop policy if exists quotes_auth_all on public.quotes;
create policy quotes_auth_all on public.quotes
  for all to authenticated using (true) with check (true);

drop policy if exists suggestions_auth_all on public.suggestions;
create policy suggestions_auth_all on public.suggestions
  for all to authenticated using (true) with check (true);

drop policy if exists app_data_auth_all on public.app_data;
create policy app_data_auth_all on public.app_data
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

drop trigger if exists suggestions_touch on public.suggestions;
create trigger suggestions_touch before update on public.suggestions
  for each row execute function public.touch_updated_at();

drop trigger if exists app_data_touch on public.app_data;
create trigger app_data_touch before update on public.app_data
  for each row execute function public.touch_updated_at();

-- Realtime is the mechanism that lets another logged-in browser see edits
-- without manually pulling.  The client subscribes to these publications.
do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.quotes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.suggestions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.app_data;
exception when duplicate_object then null; end $$;

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
