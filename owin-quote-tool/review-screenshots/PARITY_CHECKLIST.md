# OWIN Reference Parity Checklist

Baseline captured on 2026-07-08.

| Screen | REFERENCE behavior | TARGET current behavior | Status |
| --- | --- | --- | --- |
| Admin shell | Fixed left sidebar, top header, active menu | SPA shell cloned | fixed |
| Products list | Search/filter, catalogue + add | IndexedDB list with actions | fixed |
| Product create/edit | Focused form, smart suggestions, accessories | Compact form, strict field suggestions, stable rows | fixed |
| Quotes list | History table + actions | List mode with view/edit/duplicate/delete | fixed |
| Quote create/item | Modal picker, item card = product-like editor | Image-first picker, always-on fixed package editor | fixed |
| Bảng giá | Block table + exports | Block tbody + keepNext DOCX + 95% images | fixed |
| Suggestions | Field-aware | Strict keys + type aliases + clear≠delete | fixed |
| Images | Contain fit | 95% contain + Ctrl+V paste | fixed |
| Aluminum | Full estimator | Client estimator + exports | fixed |

## Final UX pass - 2026-07-10 (second pass)

### Root causes fixed

1. **Clear-X “deleted” rows**: React keys used `item.name` / `spec.key`. Clearing the value remounted the row (focus lost / row looked gone). Fixed with **stable row ids**.
2. **Clear vs hide vs trash mixed**: Clear is field X only; hide is EyeOff in dropdown; trash is the only row delete. All use stopPropagation.
3. **Empty package disabled editor**: Quote always shows FixedAccessoryPackageEditor; `keepEmpty` serialization keeps blank shells while editing.
4. **Blank extra rows vanished**: `serializeExtraAccessoriesJson(..., { keepEmpty: true })` while editing; clean on calculate/save.
5. **Suggestion noise**: Strict spec-key list; value pools field-mapped; package name no longer falls back to accessory names.
6. **Image paste**: Intercepts only when clipboard has image files; form-scoped paste on product form.

### Screenshots

`review-screenshots/target-after-final-ux-pass/`
- product-form.png
- suggestion-dropdown.png
- quote-picker-modal.png
- quote-item-card.png
- bang-gia.png
- quote-form.png

### Verification

- `npm test`: 11 files / 63 tests passed
- `npm run build`: passed
- Forbidden runtime: none (no Next/Prisma/SQLite/api/images/fs/path/sharp)

### Remaining limitations

- Browser print/PDF only (no server converter)
- DOCX page-break best-effort via cantSplit/keepNext; very tall blocks may still split
- Hide-suggestion list is localStorage-only
