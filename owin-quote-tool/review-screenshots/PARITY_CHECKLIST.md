# OWIN Reference Parity Checklist

Baseline captured on 2026-07-08.

| Screen | REFERENCE behavior | TARGET current behavior | Missing UI | Missing logic | Files to change | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Admin shell | Fixed left sidebar, top header, active menu, admin avatar, grey canvas | Sidebar/header/page frame cloned in SPA shell | None obvious for shell frame | SPA menu state preserved client-side | `src/App.tsx`, `src/styles/*` | fixed |
| Products list | Admin page title, search/filter card, Catalogue + Add buttons, skeleton/table/list in admin shell | Admin shell page with search/category filters, table rows, preview/duplicate/edit/delete | None obvious in first viewport | IndexedDB filter/search/duplicate implemented | `src/features/products/*` | fixed |
| Product create | Dedicated admin page with back/title, large grouped form, image section, smart suggestions | SPA page transition with back/title and grouped structured form | Some lower form spacing still not pixel-identical | Manual code no longer required; structured fixed/extra accessories retained | `src/features/products/ProductForm.tsx` | fixed |
| Product edit | Dedicated edit route loading product | Same create/edit screen with loaded ProductRecord | Separate URL/detail route not present by design | Edit/duplicate/delete reload data in IndexedDB | `src/features/products/*` | fixed |
| Quotes list | Separate quote history page with search/status table and actions | Separate list mode with search/status table and view/edit/duplicate/delete/export | None obvious in first viewport | IndexedDB quote history feeds list | `src/features/quote/QuoteView.tsx`, `src/App.tsx` | fixed |
| Quote create | Customer card + totals panel + item section with product modal buttons | Separate create/edit mode with back/title/actions and existing item editor | Product picker is modal image-first | Existing calculation/save/export preserved | `src/features/quote/*` | fixed |
| Quote edit/detail | Detail route with export/view/edit/duplicate/delete | Dedicated detail mode with customer, totals, items, edit/duplicate/delete/export/print | SPA state route rather than URL route | Saved imported quotes load/edit/duplicate/delete | `src/features/quote/*` | fixed |
| Bảng giá/Catalogue | Admin catalogue page with export buttons and template preview | Admin catalogue page with Word, Excel, browser PDF/print and template table | None obvious in first viewport | Catalogue Excel added; Word/table logic reused | `src/features/catalogue/*`, `src/features/export/*` | fixed |
| Word/Excel export | Reference templates, cloned table rows, quote/catalogue Excel if available | Browser-safe Word renderers use bundled reference templates; quote and catalogue Excel downloads are wired | Server-side image embedding in Excel omitted by design | Quote export history records docx/xlsx; row/totals/signature blocks follow reference shape | `src/features/export/*`, `src/features/quote/QuoteView.tsx` | fixed |
| Browser print/PDF | Reference print/export routes and print preview | Browser print buttons available for quote/detail and catalogue | Server PDF conversion not ported by design | Browser print keeps GitHub Pages compatibility | `src/styles/owin-theme.css`, export views | fixed |
| Suggestions | Smart field-specific inputs backed by shared suggestions | Ranked autosuggest with clear-value vs hide-suggestion, strict spec keys, field-specific value pools | None obvious for current fields | Spec values/product names/accessories/customer fields learn into IndexedDB by type | `src/lib/suggestions.ts`, `src/components/AutoSuggestInput.tsx` | fixed |
| Images | SafeImage, `/api/images` in reference, fit/contain rules | Static imported assets, IndexedDB images, and aluminum public profile images resolve with Vite base path | Server `/api/images` omitted by design | 95% contain fit across form/picker/catalogue/print/DOCX | `src/utils/imagePaths.ts`, image components, CSS | fixed |
| Aluminum estimator | Full calculator: systems, rows, summaries, copy/CSV/Word/print | Full tabbed estimator with 6 systems, profile images, IndexedDB temp storage, copy/CSV/Word/browser print | Direct PDF generator and embedded Word images omitted like reference limitations | Quantity × unit price logic, totals, clear/copy/export, and legacy localStorage migration implemented | `src/features/aluminum/*`, `src/lib/aluminum-estimator*`, `public/aluminum-profiles/*` | fixed |

## UX correction pass - 2026-07-10

### Issues found

1. Suggestion hide-X could click-through and delete the whole spec/accessory row; no dedicated clear-value control.
2. Spec key dropdown mixed random learned labels; value pools were incomplete (missing color/frame aliases).
3. Extra accessory blank rows defaulted to quantity 1; empty fixed package name could collapse the quote editor.
4. Product picker still showed unit prices and used cover-style image cropping.
5. Product form image lacked Ctrl+V paste and used cover fit.
6. Quote item still exposed manual mã SP; accessory editor could unmount on empty package name.
7. Image fit was cover/tiny in several places instead of ~95% contain.
8. Quote DOCX lacked keepNext/cantSplit; catalogue print split category away from first product block.

### Fixed in this pass

- **Clear vs hide suggestions**: input clear-value X only clears field value; dropdown hide-X is separate and uses mousedown stopPropagation to prevent row-delete click-through.
- **Strict spec keys**: only `Màu / Khung Bao / Bản Cánh / Độ Dày / Loại Kính / Phào / Song Nhôm Bảo Vệ`.
- **Field-specific value pools**: color+spec_value_color, frame+spec_value_frame, sash, thickness, glass, molding, protection_bar; product/item names merged via aliases.
- **Accessories**: blank extra qty defaults to 0; fixed package empty name keeps editor open (`keepEmpty`); add/remove/up/down retained.
- **Product picker**: image-first cards, contain fit, optional Chọn chip, no unit price clutter.
- **Product form**: focused fields only; Ctrl+V image paste when clipboard has image files (text paste in inputs untouched).
- **Quote item**: name/category/unit only (no manual mã); same specs/accessories UX as product form.
- **Image fit 95% contain**: form, picker, quote item, Bảng giá, print, DOCX embed scaling.
- **Document blocks**: catalogue category joins first product block; quote/catalogue rows use cantSplit + keepNext; print uses `break-inside: avoid` on item blocks.

### Screenshots

- `review-screenshots/target-after-ux-pass/product-form.png`
- `review-screenshots/target-after-ux-pass/suggestion-dropdown.png`
- `review-screenshots/target-after-ux-pass/quote-picker-modal.png`
- `review-screenshots/target-after-ux-pass/quote-item-card.png`
- `review-screenshots/target-after-ux-pass/bang-gia.png`
- `review-screenshots/target-after-ux-pass/quote-form.png`

### Verification

- `npm test`: passed, 11 files / 60 tests.
- `npm run build`: passed; existing Vite large chunk warning remains.
- Forbidden runtime search: no Next.js, Prisma, SQLite, `/api/images`, `fs/path/sharp` in browser runtime.

### Remaining limitations

- Browser print/PDF remains browser print by design.
- DOCX visual inspection inside desktop Word was not available in-browser; keepNext/cantSplit verified via export tests and XML markers.
- Very tall product blocks may still split if taller than a page (Word constraint); order and borders are preserved.
- Suggestion hide-list is localStorage-per-browser, not synced via Google Drive.
