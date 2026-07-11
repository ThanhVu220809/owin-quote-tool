# REFERENCE export pipeline audit

Empirical + source trace (2026-07-10).

## Catalogue / Bảng giá

| Step | Location |
|------|----------|
| UI | `Web/src/app/admin/catalogue/page.tsx` links |
| API (server-only) | `/api/admin/catalogue/export/docx` |
| Core generator | `Web/src/lib/documents/catalogue-export-docx.ts` → `exportCatalogueV8ToDocx` |
| Row model | `catalogue-block-rows.ts` + `build-catalogue-money-blocks.ts` |
| Description | `product-info-block.ts` / accessory-block builders |
| Template | `Web/templates/owin-catalogue.docx` |
| Mapping config | `Web/config/owin-catalogue.mapping.json` (docs; generator uses code tokens) |

### How DOCX is produced (REFERENCE)

**Mode C: template + XML row clone / patch** (not pure generate-from-scratch).

1. Load `owin-catalogue.docx` as ZIP (AdmZip).
2. Find marker rows: `{category}`, `{product_info_block}`, `{accessory_block}`.
3. `buildCatalogueBlockRows(products)` → ordered category/product/accessory/extra rows.
4. Clone marker row XML; replace tokens; embed images via **fs + sharp** (server).
5. Vertical merge STT/image/total cells on product restart + accessory continue.
6. Block grouping + `cantSplit` + `keepNext` on every paragraph of non-last rows.
7. Normalize table widths/bold fonts; return Buffer.

PDF path: server converts DOCX (LibreOffice/Word COM) — **not portable to browser TARGET**.

Print path: `ProductStatisticsTable` / admin catalogue preview HTML + CSS (separate from DOCX XML).

---

## Quote / Báo giá

| Step | Location |
|------|----------|
| UI | quote detail export actions |
| API (server-only) | `/api/admin/quotes/[id]/export/docx` |
| Core generator | `Web/src/lib/quote/quote-export-docx.ts` → `exportQuoteToDocx` |
| Shared row model | `quote-print-rows.ts` + `buildQuotePrintModel` (`quote-print/`) |
| Description | `quote-description-lines.ts` |
| Template | `Web/templates/owin-quote.docx` |
| PDF | `quote-export-pdf.ts` = DOCX then server convert |

### How DOCX is produced (REFERENCE)

**Mode C: template + XML patch**, with a critical design choice:

1. Load `owin-quote.docx`.
2. Build **QuotePrintModel** (same model as browser preview).
3. Remove empty customer paragraphs (`{sdt}` / `{email}` / address when blank).
4. Replace header/totals tokens.
5. Find marker rows: `{nhom}`, product `{stt}/{mo_ta}`, `{bo_pk_*}`, `{pk_ten}`, `{ps_*}`, **and totals rows**.
6. Replace entire marker span with **rendered item rows only**.
7. **All data rows (product / fixed accessory / extra) use the PRODUCT marker row template** — not separate fixed/extra row clones.
8. Fixed package **item lines are multiline text inside the fixed package description**, not cloned `{pk_ten}` rows (avoids orphan `x`).
9. vMerge STT / Mã SP / Ảnh across full item block; keepNext/cantSplit.
10. Totals re-injected as a **standalone table** after the items table.
11. Round image corners; bold runs; fixed column widths.

Server image path uses **fs + sharp**. PDF uses external converter.

---

## Template token parity

Scanned 2026-07-10 (`scripts/inspect-docx-templates.mjs`):

- TARGET `Template_Bao_Gia.docx` markers **match** REF `owin-quote.docx`.
- TARGET `Template_Bang_Gia.docx` markers **match** REF `owin-catalogue.docx`.

So the template files are fine; correctness is in **row generation / which markers are cloned**.

---

## TARGET pipeline (before this fix)

| Area | TARGET |
|------|--------|
| Runtime | Browser-only PizZip + fetch template URL |
| Catalogue | Clone category/product/accessory rows + keepNext (close to REF) |
| Quote | Cloned **separate** fixed/extra templates; product row only for dimensions |
| Images | IndexedDB/public data URLs; no sharp; optional logo |
| PDF | `window.print()` only |

### Wrong before fix

1. Quote used separate `{bo_pk_*}` / `{ps_*}` row clones instead of unified product-row rendering (REFERENCE).
2. Risk of leftover `{pk_ten}` / orphan `x` if marker span incomplete.
3. Missing image did not always fall back to OWIN logo for DOCX embed.
4. Empty phone/email cleanup order differed from REFERENCE.

---

## Browser-safe mapping

| REFERENCE server piece | TARGET substitute |
|------------------------|-------------------|
| fs + sharp image | `getImageDataUrlByPath` + Image() fit 95% contain |
| AdmZip Buffer | PizZip Blob download |
| LibreOffice PDF | Browser print |
| Prisma product load | IndexedDB products/quotes |
