# OWIN Reference Parity Checklist

Baseline captured on 2026-07-08.

| Screen | REFERENCE behavior | TARGET current behavior | Missing UI | Missing logic | Files to change | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Admin shell | Fixed left sidebar, top header, active menu, admin avatar, grey canvas | Sidebar/header/page frame cloned in SPA shell | None obvious for shell frame | SPA menu state preserved client-side | `src/App.tsx`, `src/styles/*` | fixed |
| Products list | Admin page title, search/filter card, Catalogue + Add buttons, skeleton/table/list in admin shell | Admin shell page with search/category filters, table rows, preview/duplicate/edit/delete | None obvious in first viewport | IndexedDB filter/search/duplicate implemented | `src/features/products/*` | fixed |
| Product create | Dedicated admin page with back/title, large grouped form, image section, smart suggestions | SPA page transition with back/title and grouped structured form | Some lower form spacing still not pixel-identical | Manual code no longer required; structured fixed/extra accessories retained | `src/features/products/ProductForm.tsx` | fixed |
| Product edit | Dedicated edit route loading product | Same create/edit screen with loaded ProductRecord | Separate URL/detail route not present by design | Edit/duplicate/delete reload data in IndexedDB | `src/features/products/*` | fixed |
| Quotes list | Separate quote history page with search/status table and actions | Separate list mode with search/status table and view/edit/duplicate/delete/export | None obvious in first viewport | IndexedDB quote history feeds list | `src/features/quote/QuoteView.tsx`, `src/App.tsx` | fixed |
| Quote create | Customer card + totals panel + item section with product modal buttons | Separate create/edit mode with back/title/actions and existing item editor | Product picker is inline grid, not modal yet | Existing calculation/save/export preserved | `src/features/quote/*` | fixed |
| Quote edit/detail | Detail route with export/view/edit/duplicate/delete | Dedicated detail mode with customer, totals, items, edit/duplicate/delete/export/print | SPA state route rather than URL route | Saved imported quotes load/edit/duplicate/delete | `src/features/quote/*` | fixed |
| Bảng giá/Catalogue | Admin catalogue page with export buttons and template preview | Admin catalogue page with Word, Excel, browser PDF/print and template table | None obvious in first viewport | Catalogue Excel added; Word/table logic reused | `src/features/catalogue/*`, `src/features/export/*` | fixed |
| Word/Excel export | Reference templates, cloned table rows, quote/catalogue Excel if available | Browser-safe Word renderers use bundled reference templates; quote and catalogue Excel downloads are wired | Server-side image embedding in Excel omitted by design | Quote export history records docx/xlsx; row/totals/signature blocks follow reference shape | `src/features/export/*`, `src/features/quote/QuoteView.tsx` | fixed |
| Browser print/PDF | Reference print/export routes and print preview | Browser print buttons available for quote/detail and catalogue | Server PDF conversion not ported by design | Browser print keeps GitHub Pages compatibility | `src/styles/owin-theme.css`, export views | fixed |
| Suggestions | Smart field-specific inputs backed by shared suggestions | Ranked autosuggest with keyboard navigation, per-field hide, seeded/live data, and learning from saved products/quotes | None obvious for current fields | Spec labels/product types/units/accessories/customer fields learn into IndexedDB | `src/lib/suggestions.ts`, `src/lib/suggestionEngine.ts`, `src/components/AutoSuggestInput.tsx` | fixed |
| Images | SafeImage, `/api/images` in reference, fit/contain rules | Static imported assets, IndexedDB images, and aluminum public profile images resolve with Vite base path | Server `/api/images` omitted by design | Contain/fallback behavior verified in catalogue and aluminum table screenshots | `src/utils/imagePaths.ts`, image components, `public/aluminum-profiles/*` | fixed |
| Aluminum estimator | Full calculator: systems, rows, summaries, copy/CSV/Word/print | Full tabbed estimator with 6 systems, profile images, IndexedDB temp storage, copy/CSV/Word/browser print | Direct PDF generator and embedded Word images omitted like reference limitations | Quantity × unit price logic, totals, clear/copy/export, and legacy localStorage migration implemented | `src/features/aluminum/*`, `src/lib/aluminum-estimator*`, `public/aluminum-profiles/*` | fixed |

## Final corrective pass - 2026-07-09

### Fixed in this pass

- Product create/edit UI now hides manual `Mã SP`, raw price text, short description, public flag, and featured flag. Product code remains generated/saved internally.
- Product form keeps the focused reference order: image, group, name, unit, sample size, price, specs, fixed package, extra accessories, total estimate.
- Spec suggestions now combine default spec keys with imported/reference/live suggestion records, and quote spec values use field-specific pools where possible.
- Fixed accessory default item quantities now start at `0`, and imported placeholder packages where every item quantity was `1` normalize to `0` without changing package quantity/price totals.
- Quote list actions are reduced to view, edit, duplicate, and delete; export remains in quote create/detail.
- Quote picker is a modal with search, category pills, large image cards, and whole-card selection.
- Quote item editor removes normal workflow JSON/description textareas and adds compact specs + fixed package columns with extra accessories below.
- Bảng giá image frames render product images at about 95% of the available image cell with contain fit and rounded corners.
- Quote/Bảng giá Word image embedding now fits images to the target box without distortion; quote descriptions are generated from item/spec data instead of manual description text.

### Screenshots

- `review-screenshots/target-after-final-pass/product-form.png`
- `review-screenshots/target-after-final-pass/quote-picker-modal.png`
- `review-screenshots/target-after-final-pass/quote-item-card.png`
- `review-screenshots/target-after-final-pass/bang-gia.png`
- `review-screenshots/target-after-final-pass/quote-list.png`

### Verification

- `npm test`: passed, 11 files / 58 tests.
- `npm run build`: passed; existing Vite large chunk warning remains.
- Forbidden runtime search: only matched the guardrail comment in `src/features/export/wordExport.ts`; no Next.js, Prisma, SQLite, API routes, `/api/images`, `fs/path/sharp`, or server upload runtime usage found.

### Remaining limitations

- Browser print/PDF remains browser print by design.
- DOCX visual inspection inside desktop Word was not available in-browser; export row/image logic is verified through source review, build, and automated tests.
- Browser-safe DOCX output keeps closest merge/row behavior supported by the current template renderer rather than server-side Word automation.
