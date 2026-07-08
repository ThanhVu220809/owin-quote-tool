# Diff Notes

## Initial Visual Pass

- Screenshots saved under `review-screenshots/reference` and `review-screenshots/target`.
- REFERENCE has the full admin frame: left sidebar, top header, active state, wide grey content canvas.
- TARGET still uses compact top tabs and lacks dashboard/customers/list-vs-create separation.
- Product and quote data are present in TARGET, but workflows are visually compressed compared with REFERENCE.
- Bảng giá table is much closer than other pages, but it still lacks the reference admin page shell.
- Aluminum estimator is the largest gap: TARGET is only a placeholder, while REFERENCE has full systems/tabs/actions/table/summary.

## Screenshot Notes

- Full-page capture on the target SPA can stitch repeated content because heavy panels stay mounted. Viewport screenshots are the reliable comparison set.
- Reference dashboard currently shows skeleton cards only in the running dev server; product/quote/catalogue/aluminum pages are usable for visual comparison.
