# OWIN Quote Tool — Dev notes

> Showcase & kiến trúc tổng quan: xem [README root monorepo](../README.md).

Công cụ nội bộ React/Vite, production: [`saigonfox.online`](https://saigonfox.online).

## Stack nhanh

- **Supabase Auth** — đăng nhập; signup public tắt
- **Postgres** — source of truth (products, quotes, suggestions, app_data)
- **Storage** — ảnh catalogue public URL; ảnh báo giá private
- **Realtime** — multi-device sync
- **GitHub Actions/Pages** — lint · test · build · deploy từ `main`

Form chỉ ghi Supabase khi bấm **Lưu**. Không lưu data nghiệp vụ vào IndexedDB/localStorage.

## Chạy local

```bash
cp .env.example .env
npm ci
npm run dev
```

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-key>
```

Không đặt `service_role`, PAT hoặc mật khẩu vào source/frontend.

## Kiểm tra

```bash
npm run lint
npm test
npm run build
```

Schema idempotent: `supabase/schema.sql`.  
`review-screenshots/` đã ignore (có thể chứa data khách).

## Module quan trọng

| Path | Việc |
|---|---|
| `src/types/models.ts` | Kiểu ProductRecord / QuoteRecord |
| `src/lib/quote-engine/` | Tính SL, phụ kiện, tổng, làm tròn |
| `src/features/export/` | Word / Excel / PDF |
| `src/features/supabase/` | Auth, repos, Realtime, merge |
| `src/lib/media/` | Resolve & pipeline ảnh |
