# Template Source Audit (tool-only)

Date: 2026-07-10  
Branch: `full-reference-parity`  
Scope: current TARGET project only (no old Web app, no `localhost:3000`).

## Sample / template files found

| Path | Role |
|------|------|
| `src/assets/templates/Template_Bang_Gia.docx` | **Bảng giá** Word template (source of truth) |
| `src/assets/templates/Template_Bao_Gia.docx` | **Báo giá** Word template (source of truth) |
| `dist/assets/Template_Bang_Gia-*.docx` | Build-hashed copy of Bảng giá template |
| `dist/assets/Template_Bao_Gia-*.docx` | Build-hashed copy of Báo giá template |
| `review-screenshots/final-codex-pass/reference-catalogue.docx` | Prior sample Bảng giá output (visual QA) |
| `review-screenshots/final-codex-pass/reference-catalogue.pdf` | Prior sample Bảng giá PDF/print |
| `review-screenshots/docx-qa/reference-real-output/reference-catalogue.docx` | Prior measured sample catalogue output |
| `review-screenshots/docx-qa/reference-real-output/reference-quote.docx` | Prior measured sample quote output |
| `public/owin-user-assets/logo/logo.webp` | Fallback logo for missing product images |
| `public/imported-assets/**` | Product/quote cover images used in exports |

No user `.xlsx` price-list sample is required for Word/PDF row cloning; Excel export is a separate secondary path.

## Which file is Bảng giá sample/template?

- **Template used by code:** `src/assets/templates/Template_Bang_Gia.docx`
- **Visual/sample outputs for comparison:**  
  `review-screenshots/final-codex-pass/reference-catalogue.docx` (+ rendered pages)  
  `review-screenshots/docx-qa/reference-real-output/reference-catalogue.docx`

## Which file is Báo giá sample/template?

- **Template used by code:** `src/assets/templates/Template_Bao_Gia.docx`
- **Visual/sample outputs for comparison:**  
  `review-screenshots/docx-qa/reference-real-output/reference-quote.docx`

## Template markers (current templates)

### Bảng giá (`Template_Bang_Gia.docx`)
- Rows: `{category}` · `{stt}/{image}/{product_info_block}/...` · `{accessory_block}/...`
- Header tables: company + title “BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN”

### Báo giá (`Template_Bao_Gia.docx`)
- Header: `{ten_kh} {dia_chi} {sdt} {ngay} {thang} {nam}`
- Rows: `{nhom}` · product `{stt}/{ma_sp}/{anh_sp}/{mo_ta}/...` · `{bo_pk_*}` · `{pk_*}` · `{ps_*}`
- Totals: `{tong_tien} {lam_tron} {tam_ung} {can_thanh_toan}`

## Code that uses the samples

| Area | File | Uses |
|------|------|------|
| Word Bảng giá | `src/features/export/wordExport.ts` → `exportBangGiaWord` / `renderBangGiaDocumentXml` | Clones template rows; embeds images; header normalize |
| Word Báo giá | `src/features/export/wordExport.ts` → `exportQuoteWord` / `renderQuoteDocumentXml` | Unified product-row clone; blank contact cleanup |
| Catalogue row model | `src/lib/catalogue/catalogueRows.ts` | Category / product / fixed package / extra rows |
| Quote calc model | `src/lib/quote/quoteCalculator.ts` | Normalized totals for export/print |
| Print Bảng giá | `src/features/catalogue/BangGiaView.tsx` | Browser print HTML aligned with row model |
| Print Báo giá | `src/features/quote/QuoteView.tsx` → `QuotePrintDocument` | Browser print/PDF via `window.print()` |
| Excel (secondary) | `catalogueExcelExport.ts`, `quoteExcelExport.ts` | Not Word templates; separate spreadsheet layout |

## Code that does **not** invent alternate templates

- No Next.js/Prisma/server DOCX path.
- No docxtemplater pure-placeholder fill for the main catalogue/quote tables (marker-row clone instead).
- Placeholders module `src/types/placeholders.ts` documents naming; active exporter is PizZip XML clone.

## What was wrong historically (still guarded by tests)

1. Image extents too large vs sample (now capped 42×38 mm catalogue / ~95% quote column).
2. Quote used separate fixed/extra row shells → orphan `x` / blank marker rows (now unified product row + multiline fixed items).
3. Empty-value specs dropped or printed with trailing colon (now key-only, e.g. `Song Nhôm Bảo Vệ`).
4. Missing images lacked OWIN logo fallback.
5. Blank phone/email still left empty paragraphs (now removed when empty).

## Current output policy

- **Do not invent random new layouts.** Repair data mapping against the bundled `.docx` samples.
- PDF = browser print of the same normalized data used for Word.
- Export always uses cleaned confirmed data (`cleanItemAccessoriesForPersist` / quote snapshot), not half-edited empty draft shells.
