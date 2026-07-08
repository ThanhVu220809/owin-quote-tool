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
| Bảng giá/Catalogue | Admin catalogue page with export buttons and template preview | Printable table exists, no admin shell | Admin header/buttons | Export flow mostly present; Excel parity incomplete | `src/features/catalogue/*`, `src/features/export/*` | todo |
| Word export | Reference templates, cloned table rows, image handling | Reference templates wired, browser-safe renderer present | Need visual output QA | Need compare output files deeper | `src/features/export/wordExport.ts` | todo |
| Browser print/PDF | Reference print/export routes and print preview | Browser print views exist | Shell/page print controls | Need closer print CSS QA | `src/styles/owin-theme.css`, export views | todo |
| Suggestions | Smart field-specific inputs backed by shared suggestions | Autosuggest exists, partial field coverage | Richer popover/remove behavior | Learn/remove parity incomplete | `src/lib/suggestions.ts`, form components | todo |
| Images | SafeImage, `/api/images` in reference, fit/contain rules | Static imported assets and IndexedDB images | Need consistent contain/fallback across pages | Good browser path support, needs QA | `src/utils/imagePaths.ts`, image components | todo |
| Aluminum estimator | Full calculator: systems, rows, summaries, copy/CSV/Word/print | Placeholder shell only | Nearly entire page | Full estimator storage/calculation/export missing | `src/features/aluminum/*`, new data/assets | todo |
