# REAL WEB EXPORT PIPELINE (traced 2026-07-10)

REFERENCE app running at **http://localhost:3000**.

## 1. Catalogue Word — button → file

| Item | Value |
|------|--------|
| Page | `http://localhost:3000/admin/catalogue` |
| Source | `Web/src/app/admin/catalogue/page.tsx` |
| Button | **Tải Word (.docx)** |
| Link href | `/api/admin/catalogue/export/docx` |
| API route | `Web/src/app/api/admin/catalogue/export/docx/route.ts` |
| Generator | `exportCatalogueV8ToDocx` in `catalogue-export-docx.ts` |
| Template | `Web/templates/owin-catalogue.docx` |
| Real output saved | `reference-real-output/reference-catalogue.docx` (7.7 MB, HTTP 200) |

### How it works
1. API loads public products from **Prisma**.
2. Opens template with **AdmZip**.
3. Finds marker rows `{category}`, `{product_info_block}`, `{accessory_block}`.
4. Builds rows via `buildCatalogueBlockRows`.
5. Clones marker XML; fills tokens; embeds images via **fs + sharp**.
6. **Image EMU caps (measured from real file):** max **cx=1,512,000 (42mm)**, **cy=1,368,000 (38mm)** — `getContainExtent` width-first contain.
7. Product/accessory row height ~**1530** twips; extraAccessory **340** twips.
8. Geometry: **`prst="rect"`** (not round).
9. Blocks: category alone; product+accessories together with `cantSplit` + `keepNext`.
10. vMerge STT / image / total columns.
11. Table width **14515** dxa.

### PDF
- Button **Tải Catalogue PDF** → `/api/admin/catalogue/export/pdf`
- DOCX then server convert → `reference-catalogue.pdf` (444 KB, HTTP 200)

---

## 2. Quote Word — button → file

| Item | Value |
|------|--------|
| List page | `http://localhost:3000/admin/quotes` |
| Detail | `Web/src/app/admin/quotes/[id]/page.tsx` |
| Button | export Word link |
| Link href | `/api/admin/quotes/{id}/export/docx` |
| API route | `Web/src/app/api/admin/quotes/[id]/export/docx/route.ts` |
| Generator | `exportQuoteToDocx` in `quote-export-docx.ts` |
| Template | `Web/templates/owin-quote.docx` |
| Sample quote | `OWIN-BG-20260708-0002` (`cmrbprrw702lbu0kphgjn1okn`) |
| Real output | `reference-quote.docx` (4.6 MB, HTTP 200) |

### How it works
1. Load quote `snapshotJson` from Prisma.
2. `buildQuotePrintModel` → shared print groups.
3. Open template AdmZip.
4. Remove empty phone/email paragraphs.
5. Replace header/totals tokens.
6. Find marker rows including `{pk_ten}` (only to **delete**, not clone blanks).
7. **All data rows rendered with PRODUCT template** (`{stt}/{mo_ta}/…`).
8. Fixed package item lines = multiline description (not separate `{pk_ten}` clones).
9. Image: column 2600dxa × 0.95 fill → max **cx≈1,438,148**; **roundRect**.
10. vMerge STT/Mã/Ảnh across item block; keepNext/cantSplit.
11. Totals may be separate table after items.

### PDF
- `/api/admin/quotes/{id}/export/pdf` → `reference-quote.pdf` (228 KB)

---

## 3. Mode classification

| Output | Mode |
|--------|------|
| Catalogue DOCX | **Template + XML row clone/patch** (not pure generate-from-scratch) |
| Quote DOCX | **Template + XML patch**; unified product-row rendering |
| PDF | Server DOCX → LibreOffice/Word COM (**not portable**) |
| Browser print | Separate HTML tables (`ProductStatisticsTable`, `QuoteA4Table`) |

---

## 4. Server-only (cannot port to TARGET runtime)

- Prisma product/quote load
- `fs` + `sharp` image pipeline
- LibreOffice/Word COM PDF conversion
- Next.js API routes

## 5. Browser-safe TARGET equivalent

| REF piece | TARGET |
|-----------|--------|
| Prisma load | IndexedDB products / calculated quote |
| AdmZip | PizZip + fetch template asset |
| sharp getContainExtent | `fitImageDataUrlToEmuBox` with **same EMU caps** |
| PDF COM | Browser print only |
| export API | Client `exportBangGiaWord` / `exportQuoteWord` |

---

## 6. Screenshots collected

- `reference-catalogue-page.png`
- `reference-quotes-list.png`
- `reference-quote-detail.png`
- `REAL_DOCX_STRUCTURE.json` (measured extents / merges)
