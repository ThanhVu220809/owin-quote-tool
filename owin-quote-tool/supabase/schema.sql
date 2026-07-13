-- ============================================================================
-- OWIN QUOTE TOOL — Supabase schema
-- Dán toàn bộ file này vào Supabase → SQL Editor → Run (1 lần).
-- Mô hình "document + cột index": record đầy đủ nằm trong jsonb `data`,
-- đồng thời các cột thường dùng được tách riêng để query/hiển thị nhanh.
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
  revision         bigint not null default 1,
  created_by       uuid references auth.users default auth.uid(),
  updated_by       uuid references auth.users default auth.uid(),
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
  owner            uuid references auth.users default auth.uid(),
  revision         bigint not null default 1,
  created_by       uuid references auth.users default auth.uid(),
  updated_by       uuid references auth.users default auth.uid(),
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
  revision    bigint not null default 1,
  created_by  uuid references auth.users default auth.uid(),
  updated_by  uuid references auth.users default auth.uid(),
  updated_at  timestamptz default now()
);
create index if not exists suggestions_type_value_idx on public.suggestions (type, value);

-- Meta/cấu hình và trạng thái tính nhôm dùng document JSON để giữ nguyên shape app.
create table if not exists public.app_data (
  key         text primary key,
  data        jsonb not null,
  updated_at  timestamptz default now(),
  owner       uuid references auth.users default auth.uid(),
  revision    bigint not null default 1,
  created_by  uuid references auth.users default auth.uid(),
  updated_by  uuid references auth.users default auth.uid()
);

-- Nâng cấp an toàn cho project đã tồn tại trước các cột audit/revision.
alter table public.products add column if not exists revision bigint not null default 1;
alter table public.products add column if not exists created_by uuid references auth.users default auth.uid();
alter table public.products add column if not exists updated_by uuid references auth.users default auth.uid();
alter table public.quotes add column if not exists revision bigint not null default 1;
alter table public.quotes add column if not exists created_by uuid references auth.users default auth.uid();
alter table public.quotes add column if not exists updated_by uuid references auth.users default auth.uid();
alter table public.quotes alter column owner set default auth.uid();
alter table public.suggestions add column if not exists revision bigint not null default 1;
alter table public.suggestions add column if not exists created_by uuid references auth.users default auth.uid();
alter table public.suggestions add column if not exists updated_by uuid references auth.users default auth.uid();
alter table public.app_data add column if not exists revision bigint not null default 1;
alter table public.app_data add column if not exists created_by uuid references auth.users default auth.uid();
alter table public.app_data add column if not exists updated_by uuid references auth.users default auth.uid();
alter table public.app_data alter column owner set default auth.uid();

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
begin
  new.updated_at = now();
  new.revision = old.revision + 1;
  new.updated_by = coalesce(auth.uid(), old.updated_by);
  return new;
end $$;

-- Xóa mềm luôn thắng một bản form cũ: client cũ không được vô tình hồi sinh
-- sản phẩm/báo giá đã bị xóa trên một máy khác.
create or replace function public.prevent_stale_restore()
returns trigger language plpgsql as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    -- 23514 is non-retryable. SQLSTATE 40001 makes PostgREST retry the same
    -- forbidden restore until the browser request appears to hang.
    raise exception 'record_was_deleted_on_another_client' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists products_prevent_stale_restore on public.products;
create trigger products_prevent_stale_restore before update on public.products
  for each row execute function public.prevent_stale_restore();

drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before update on public.quotes
  for each row execute function public.touch_updated_at();
drop trigger if exists quotes_prevent_stale_restore on public.quotes;
create trigger quotes_prevent_stale_restore before update on public.quotes
  for each row execute function public.prevent_stale_restore();

drop trigger if exists suggestions_touch on public.suggestions;
create trigger suggestions_touch before update on public.suggestions
  for each row execute function public.touch_updated_at();

drop trigger if exists app_data_touch on public.app_data;
create trigger app_data_touch before update on public.app_data
  for each row execute function public.touch_updated_at();

-- Ghi document app_data theo revision để hai trình duyệt không thể cùng ghi
-- đè một bản cũ. Revision 0 chỉ tạo mới khi key chưa tồn tại; update chỉ thành
-- công khi revision vẫn đúng. Không có dòng trả về nghĩa là CAS conflict.
create or replace function public.compare_and_swap_app_data(
  p_key text,
  p_expected_revision bigint,
  p_data jsonb
)
returns table(data jsonb, revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_key is null or btrim(p_key) = '' or p_expected_revision < 0 then
    raise exception 'app_data_key_and_revision_required' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    return query
      insert into public.app_data as target (key, data)
      values (p_key, p_data)
      on conflict (key) do nothing
      returning target.data, target.revision, target.updated_at;
    return;
  end if;

  return query
    update public.app_data as target
    set data = p_data
    where target.key = p_key and target.revision = p_expected_revision
    returning target.data, target.revision, target.updated_at;
end $$;

revoke all on function public.compare_and_swap_app_data(text, bigint, jsonb) from public, anon;
grant execute on function public.compare_and_swap_app_data(text, bigint, jsonb) to authenticated;

-- Các thao tác hàng loạt chỉ cập nhật đúng trường cần thiết ngay trong Postgres.
-- Không gửi lại cả JSON document cũ, tránh ghi đè chỉnh sửa từ máy khác.
create or replace function public.set_product_order(ordered_ids text[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
  stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  with desired as (
    select id, (ordinality - 1)::integer as sort_order
    from unnest(ordered_ids) with ordinality as item(id, ordinality)
  )
  update public.products as product
  set sort_order = desired.sort_order,
      data = jsonb_set(
        jsonb_set(product.data, '{sortOrder}', to_jsonb(desired.sort_order), true),
        '{updatedAt}', to_jsonb(stamp), true
      )
  from desired
  where product.id = desired.id and product.deleted_at is null;
  get diagnostics affected = row_count;
  return affected;
end $$;

create or replace function public.adjust_product_prices(percent_change double precision)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
  stamp text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  with calculated as (
    select id,
      greatest(0, round(coalesce(unit_price_vnd, 0) * (1 + percent_change / 100.0)))::bigint as next_price
    from public.products
    where deleted_at is null
  )
  update public.products as product
  set unit_price_vnd = calculated.next_price,
      data = jsonb_set(
        jsonb_set(product.data, '{unitPriceVnd}', to_jsonb(calculated.next_price), true),
        '{updatedAt}', to_jsonb(stamp), true
      )
  from calculated
  where product.id = calculated.id;
  get diagnostics affected = row_count;
  return affected;
end $$;

revoke all on function public.set_product_order(text[]) from public, anon;
revoke all on function public.adjust_product_prices(double precision) from public, anon;
grant execute on function public.set_product_order(text[]) to authenticated;
grant execute on function public.adjust_product_prices(double precision) to authenticated;

-- Optimistic writes for full product/quote documents. The browser sends the
-- revision it last acknowledged. A stale token never writes: the RPC returns
-- the newest row so the client can 3-way merge independent fields and retry.
-- A NULL token means "insert if absent", making a retry after a lost insert
-- response idempotent because the stable document id cannot be inserted twice.
create or replace function public.save_product_cas(proposed jsonb, expected_revision bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_id text := nullif(proposed->>'id', '');
  target_code text := nullif(proposed->>'code', '');
  proposed_deleted_at timestamptz := nullif(proposed->>'deletedAt', '')::timestamptz;
  current_row public.products%rowtype;
begin
  if target_id is null or target_code is null then
    raise exception 'product_id_and_code_required' using errcode = '22023';
  end if;

  if expected_revision is null then
    insert into public.products (
      id, code, name, category, unit, unit_price_vnd, size_text,
      cover_image_path, sort_order, is_public, data, deleted_at
    ) values (
      target_id,
      target_code,
      nullif(proposed->>'name', ''),
      nullif(proposed->>'category', ''),
      nullif(proposed->>'unit', ''),
      round(coalesce(nullif(proposed->>'unitPriceVnd', '')::numeric, 0))::bigint,
      nullif(proposed->>'rawSizeText', ''),
      nullif(proposed->>'coverImagePath', ''),
      case when proposed ? 'sortOrder' then (proposed->>'sortOrder')::integer else null end,
      coalesce((proposed->>'isPublic')::boolean, true),
      proposed,
      proposed_deleted_at
    )
    on conflict (id) do nothing
    returning * into current_row;

    if found then
      return jsonb_build_object(
        'status', 'applied', 'id', current_row.id, 'data', current_row.data,
        'revision', current_row.revision, 'deleted_at', current_row.deleted_at
      );
    end if;
  end if;

  update public.products
  set code = target_code,
      name = nullif(proposed->>'name', ''),
      category = nullif(proposed->>'category', ''),
      unit = nullif(proposed->>'unit', ''),
      unit_price_vnd = round(coalesce(nullif(proposed->>'unitPriceVnd', '')::numeric, 0))::bigint,
      size_text = nullif(proposed->>'rawSizeText', ''),
      cover_image_path = nullif(proposed->>'coverImagePath', ''),
      sort_order = case when proposed ? 'sortOrder' then (proposed->>'sortOrder')::integer else null end,
      is_public = coalesce((proposed->>'isPublic')::boolean, true),
      data = proposed,
      deleted_at = proposed_deleted_at
  where id = target_id
    and revision = expected_revision
    and deleted_at is null
  returning * into current_row;

  if found then
    return jsonb_build_object(
      'status', 'applied', 'id', current_row.id, 'data', current_row.data,
      'revision', current_row.revision, 'deleted_at', current_row.deleted_at
    );
  end if;

  select * into current_row from public.products where id = target_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  return jsonb_build_object(
    'status', case when current_row.deleted_at is null then 'conflict' else 'deleted' end,
    'id', current_row.id, 'data', current_row.data,
    'revision', current_row.revision, 'deleted_at', current_row.deleted_at
  );
end $$;

create or replace function public.save_quote_cas(proposed jsonb, expected_revision bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_id text := nullif(proposed->>'id', '');
  target_code text := nullif(proposed->>'code', '');
  proposed_deleted_at timestamptz := nullif(proposed->>'deletedAt', '')::timestamptz;
  proposed_quote_date date := nullif(left(coalesce(proposed->>'quoteDate', ''), 10), '')::date;
  current_row public.quotes%rowtype;
begin
  if target_id is null or target_code is null then
    raise exception 'quote_id_and_code_required' using errcode = '22023';
  end if;

  if expected_revision is null then
    insert into public.quotes (
      id, code, customer_name, customer_phone, quote_date, status,
      total_vnd, data, deleted_at
    ) values (
      target_id,
      target_code,
      nullif(proposed->>'customerName', ''),
      nullif(proposed->>'customerPhone', ''),
      proposed_quote_date,
      nullif(proposed->>'status', ''),
      round(coalesce(nullif(proposed->>'roundedTotalVnd', '')::numeric,
                     nullif(proposed->>'totalVnd', '')::numeric, 0))::bigint,
      proposed,
      proposed_deleted_at
    )
    on conflict (id) do nothing
    returning * into current_row;

    if found then
      return jsonb_build_object(
        'status', 'applied', 'id', current_row.id, 'data', current_row.data,
        'revision', current_row.revision, 'deleted_at', current_row.deleted_at
      );
    end if;
  end if;

  update public.quotes
  set code = target_code,
      customer_name = nullif(proposed->>'customerName', ''),
      customer_phone = nullif(proposed->>'customerPhone', ''),
      quote_date = proposed_quote_date,
      status = nullif(proposed->>'status', ''),
      total_vnd = round(coalesce(nullif(proposed->>'roundedTotalVnd', '')::numeric,
                                 nullif(proposed->>'totalVnd', '')::numeric, 0))::bigint,
      data = proposed,
      deleted_at = proposed_deleted_at
  where id = target_id
    and revision = expected_revision
    and deleted_at is null
  returning * into current_row;

  if found then
    return jsonb_build_object(
      'status', 'applied', 'id', current_row.id, 'data', current_row.data,
      'revision', current_row.revision, 'deleted_at', current_row.deleted_at
    );
  end if;

  select * into current_row from public.quotes where id = target_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  return jsonb_build_object(
    'status', case when current_row.deleted_at is null then 'conflict' else 'deleted' end,
    'id', current_row.id, 'data', current_row.data,
    'revision', current_row.revision, 'deleted_at', current_row.deleted_at
  );
end $$;

revoke all on function public.save_product_cas(jsonb, bigint) from public, anon;
revoke all on function public.save_quote_cas(jsonb, bigint) from public, anon;
grant execute on function public.save_product_cas(jsonb, bigint) to authenticated;
grant execute on function public.save_quote_cas(jsonb, bigint) to authenticated;

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
-- Bucket product-images (Public = ON) — URL ảnh công khai vẫn tải được, nhưng
-- anon không có policy SELECT nên không thể gọi API để liệt kê toàn bộ object.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists product_images_read on storage.objects;

drop policy if exists product_images_write on storage.objects;
create policy product_images_write on storage.objects
  for all to authenticated
  using (bucket_id = 'product-images') with check (bucket_id = 'product-images');

-- Ảnh ghi đè riêng của báo giá có thể gắn với công trình/khách hàng, vì vậy
-- bucket này KHÔNG public. Client đăng nhập tải bằng Storage API rồi tạo blob URL.
insert into storage.buckets (id, name, public)
values ('quote-images', 'quote-images', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists quote_images_auth_all on storage.objects;
create policy quote_images_auth_all on storage.objects
  for all to authenticated
  using (bucket_id = 'quote-images') with check (bucket_id = 'quote-images');
