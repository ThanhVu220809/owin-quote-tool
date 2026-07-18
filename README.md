# OWIN Quote Tool

**Nền tảng báo giá & bảng giá cửa nhôm OWIN** — từ catalogue sản phẩm đến file Word/Excel/PDF gửi khách, chạy production trên domain riêng.

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  <img alt="GitHub Pages" src="https://img.shields.io/badge/GitHub_Pages-222?style=for-the-badge&logo=githubpages&logoColor=white" />
</p>

<p align="center">
  <a href="https://saigonfox.online"><strong>Live demo → saigonfox.online</strong></a>
  ·
  <a href="./owin-quote-tool/README.md">Hướng dẫn dev</a>
  ·
  <a href="./owin-quote-tool/supabase/SETUP.md">Supabase setup</a>
</p>

---

## Vì sao repo này “nặng ký”?

Đây không phải form CRUD đơn giản. Tool giải quyết bài toán **kinh doanh cửa nhôm thật**:

| Bài toán thực tế | Cách tool xử lý |
|---|---|
| Báo giá có m² / mét dài / bộ + phụ kiện | Quote engine riêng: quantity, accessory pricing, rounding VND |
| Khách cần file Word đẹp như template sales | Clone marker-row DOCX bằng PizZip — chạy 100% trên browser |
| Catalogue + ảnh + phụ kiện phải khớp Word/PDF | Cùng pipeline `buildCatalogueBlockRows` cho web, Word, Excel, PDF |
| Nhiều máy cùng sửa data | Supabase Realtime + soft-delete + `revision` optimistic concurrency |
| Ảnh HD không làm đơ UI | Master WebP sắc nét + thumbnail lazy + global lightbox |
| Dùng trên điện thoại ngoài công trình | Layout portrait/landscape densified cho products / quotes / aluminium |

---

## Tính năng chính

### 1. Sản phẩm (Catalogue)
- CRUD sản phẩm: mã, tên, danh mục, đơn vị (`BO` / `M2` / `METER`), giá, specs, gallery
- Phụ kiện theo set + gói phụ kiện cố định (rule-based suggestions)
- Drag-to-reorder thứ tự bảng giá
- Compress ảnh 4K-class, giữ Full HD, không re-encode mờ

### 2. Báo giá
- Chọn sản phẩm → kích thước → SL → phụ kiện → tổng
- Snapshot đầy đủ lúc lưu (giá/tên/ảnh lúc chốt không bị đổi khi catalogue đổi)
- Khoá item gọn (chỉ tên + tổng) khi không chỉnh
- Filter theo danh mục ngang; smart number / currency input (gõ thô, format on blur)
- Export **Word · Excel · PDF** — PDF tải file, không phụ thuộc print dialog trình duyệt

### 3. Bảng giá
- Xem catalogue theo block (category → product → accessories)
- Ảnh web/PDF **contain-fit 95% ô** (scale lên khi ảnh nhỏ, không crop)
- Word export **read-only + password** (khách xem, không sửa lung tung)
- Xuất theo 1 danh mục hoặc toàn bộ

### 4. Tính nhôm
- Ước lượng thanh profile theo hệ / màu
- Giá đơn vị theo màu; SL = số cái; quantity session-only
- Export Word/PDF kèm ảnh profile embed

---

## Kiến trúc

```text
┌─────────────────── Browser (React + Vite) ───────────────────┐
│  Products │ Quotes │ Catalogue │ Aluminum                    │
│       │ quote-engine │ export (Word/Excel/PDF) │ media      │
└───────────┬──────────────────────┬───────────────────────────┘
            │ Auth + REST + Realtime│ Storage (CDN URL only)
            ▼                       ▼
     Supabase Auth            product-images (public)
     Supabase Postgres        quote-images (private)
     RLS + revision + soft-delete
```

**Nguyên tắc thiết kế**

- **Postgres = single source of truth** — không IndexedDB nghiệp vụ; localStorage chỉ session auth
- **Document + index columns** — full `ProductRecord` / `QuoteRecord` trong `jsonb data`, cột index để filter/sort rẻ
- **Export pure-client** — GitHub Pages friendly: không server render, không API route
- **Security-first** — chỉ `anon` key trên frontend; RLS; signup public tắt; `service_role` không bao giờ vào bundle

### Stack

| Layer | Tech |
|---|---|
| UI | React 19, TypeScript, custom design system (mobile-first) |
| Build | Vite 8, ESLint, Vitest (~22 test files) |
| Backend | Supabase Auth · Postgres · Storage · Realtime |
| Export | docxtemplater + PizZip · ExcelJS · jsPDF + Noto Sans VI |
| Deploy | GitHub Actions → GitHub Pages · custom domain `saigonfox.online` |

---

## Logic “hay” đáng xem trong code

### Quote engine (`src/lib/quote-engine/`)
Tách pure functions: `quantity` · `accessory-pricing` · `totals` · `rounding` · `units` · fixed-accessory rules.  
Dễ test, không dính UI — ví dụ phụ kiện md/m² nhân SL×giá khi KL = 0; làm tròn tiền theo quy ước bán hàng VN.

### Word export không cần backend (`src/features/export/wordExport.ts`)
Template DOCX marker-row được clone runtime bằng PizZip. Ảnh contain-fit theo **chiều rộng/cao cell thật** (EMU/DXA), không hard-code box cố định — web và file xuất ra nhìn đồng bộ.

### Concurrent edit an toàn
- Cột `revision` + trigger server  
- Soft-delete (`deleted_at`) chặn form cũ “hồi sinh” record đã xoá máy khác  
- Realtime subscription cập nhật UI không cần nút Sync

### Image pipeline
Master WebP sắc + thumbnail nhỏ · lazy `ProductThumb` · lightbox toàn app · PDF dùng bản master độ phân giải cao hơn web.

---

## Cấu trúc monorepo

```text
owin-quote-tool/                 ← git root (CI/CD sống ở đây)
├── .github/workflows/
│   ├── ci.yml                   # lint · test · build
│   └── deploy-pages.yml         # build + deploy Pages
├── GITHUB_PAGES_DEPLOY.md
└── owin-quote-tool/             ← app source
    ├── src/
    │   ├── features/            # products · quote · catalogue · aluminum · export · supabase
    │   ├── lib/                 # quote-engine · media · aluminium · catalogue
    │   ├── components/          # smart inputs, lightbox, drag-reorder…
    │   └── types/models.ts      # nguồn chân lý kiểu dữ liệu
    ├── supabase/schema.sql      # idempotent schema + RLS
    ├── public/                  # CNAME, fonts VI, aluminum profile images
    └── package.json
```

---

## Chạy local

```bash
cd owin-quote-tool
cp .env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm ci
npm run dev
```

```bash
npm run lint
npm test
npm run build
```

Chi tiết Supabase (bucket, RLS, secrets Actions): [`owin-quote-tool/supabase/SETUP.md`](./owin-quote-tool/supabase/SETUP.md).

---

## Deploy

Push `main` → CI + **Deploy GitHub Pages**.

Secrets cần trong repo Actions:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`public/CNAME` = `saigonfox.online`.

---

## Liên quan (cùng profile)

| Repo | Vai trò |
|---|---|
| [`esp32_sim_neo10`](https://github.com/ThanhVu220809/esp32_sim_neo10) | Firmware ESP32-S3 SOS + GPS + 4G |
| [`Landing_page`](https://github.com/ThanhVu220809/Landing_page) | Landing thương mại BA.SEW |
| [`Tracking_page`](https://github.com/ThanhVu220809/Tracking_page) | Bản đồ theo dõi thiết bị realtime |

---

<p align="center">
  Built for real shop-floor quoting · <strong>OWIN</strong> · React · Supabase · client-side export
</p>
