# OWIN Reference Parity Checklist

Baseline captured on 2026-07-08.

| Screen | REFERENCE behavior | TARGET current behavior | Missing UI | Missing logic | Files to change | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Admin shell | Fixed left sidebar, top header, active menu, admin avatar, grey canvas | Sidebar/header/page frame cloned in SPA shell | None obvious for shell frame | SPA menu state preserved client-side | `src/App.tsx`, `src/styles/*` | fixed |
| Products list | Admin page title, search/filter card, Catalogue + Add buttons, skeleton/table/list in admin shell | Simple list card, no admin shell search/filter bar | Search/filter/header layout | List filter/search parity | `src/features/products/*` | todo |
| Product create | Dedicated admin page with back/title, large grouped form, image section, smart suggestions | Inline form above list | Page layout, grouped actions, reference spacing | Same data mostly present; form workflow differs | `src/features/products/ProductForm.tsx` | todo |
| Product edit | Dedicated edit route loading product | Inline edit form | Route/page affordance | Needs duplicate/detail-like flow if kept in SPA | `src/features/products/*` | todo |
| Quotes list | Separate quote history page with search/status table and actions | Quote create and history share one page | Separate list view/admin header | Needs route/tab split | `src/features/quote/QuoteView.tsx`, `src/App.tsx` | todo |
| Quote create | Customer card + totals panel + item section with product modal buttons | Same general sections but denser/different layout | Product picker modal, reference action bar | Needs closer modal/card behavior | `src/features/quote/*` | todo |
| Quote edit/detail | Detail route with export/view/edit/duplicate/delete | Load from history into same form | Detail page/action group | Dedicated detail parity missing | `src/features/quote/*` | todo |
| Bảng giá/Catalogue | Admin catalogue page with export buttons and template preview | Printable table exists, no admin shell | Admin header/buttons | Export flow mostly present; Excel parity incomplete | `src/features/catalogue/*`, `src/features/export/*` | todo |
| Word export | Reference templates, cloned table rows, image handling | Reference templates wired, browser-safe renderer present | Need visual output QA | Need compare output files deeper | `src/features/export/wordExport.ts` | todo |
| Browser print/PDF | Reference print/export routes and print preview | Browser print views exist | Shell/page print controls | Need closer print CSS QA | `src/styles/owin-theme.css`, export views | todo |
| Suggestions | Smart field-specific inputs backed by shared suggestions | Autosuggest exists, partial field coverage | Richer popover/remove behavior | Learn/remove parity incomplete | `src/lib/suggestions.ts`, form components | todo |
| Images | SafeImage, `/api/images` in reference, fit/contain rules | Static imported assets and IndexedDB images | Need consistent contain/fallback across pages | Good browser path support, needs QA | `src/utils/imagePaths.ts`, image components | todo |
| Aluminum estimator | Full calculator: systems, rows, summaries, copy/CSV/Word/print | Placeholder shell only | Nearly entire page | Full estimator storage/calculation/export missing | `src/features/aluminum/*`, new data/assets | todo |
