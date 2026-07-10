# OWIN Reference Parity Checklist

## Tool simplify pass - 2026-07-10

### Goal
Transform TARGET into a simple 4-module business tool (not admin dashboard).

### Issues found
1. Left admin sidebar + header chrome felt like a full admin app.
2. Suggestion hide (EyeOff) confused non-technical users with clear/delete.
3. Fixed vs extra accessory suggestions shared one noisy bucket.
4. Spec rows with empty values were dropped on save/print/export.
5. Missing product images used generic package icon instead of OWIN logo.
6. Quote print table cluttered the on-screen form.

### Fixes done
| Area | Change |
|------|--------|
| Navigation | Horizontal top nav: Sản phẩm / Báo giá / Bảng giá / Tính nhôm + compact Google sync |
| Suggestions UI | Removed hide-suggestion; clear-X only clears field value |
| Accessory suggestions | `fixed_accessory_item` vs `extra_accessory_name` separate buckets |
| Empty specs | Keep key-only lines (e.g. `Song Nhôm Bảo Vệ`) in form, print, DOCX |
| Images | OWIN logo fallback; 95% contain fit retained |
| Forms | Product/quote focused fields; print model off-screen |
| Export | Catalogue/quote descriptions keep empty-value keys |

### Screenshots
`review-screenshots/target-after-tool-simplify/`
- top-nav.png
- product-form.png
- suggestion-dropdown.png
- quote-picker-modal.png
- quote-item-card.png
- bang-gia.png
- quote-form.png

### Verification
- `npm test`: 11 files / 63 tests passed
- `npm run build`: passed
- Forbidden runtime: none

### Remaining limitations
- Browser print/PDF only (no server converter)
- DOCX page-break is best-effort cantSplit/keepNext
- Full template pixel-parity with desktop Word still depends on Word itself
- Sync still requires Google env configuration
