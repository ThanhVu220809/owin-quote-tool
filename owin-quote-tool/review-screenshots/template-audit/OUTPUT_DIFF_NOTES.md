# Output Diff Notes — current tool vs sample templates

Date: 2026-07-10  
Compared against:

- Templates: `src/assets/templates/Template_Bang_Gia.docx`, `Template_Bao_Gia.docx`
- Sample outputs already in workspace:  
  `review-screenshots/docx-qa/reference-real-output/*`  
  `review-screenshots/final-codex-pass/*`

Generated before-fix artifacts (this pass):  
`review-screenshots/template-audit/current-output-before/`

## Method

1. Unit-render DOCX XML via `renderBangGiaDocumentXml` / `renderQuoteDocumentXml` (same pipeline as the app).
2. Structural checks already enforced by `src/features/export/wordExport.node.test.ts`.
3. Visual page PNGs from prior codex pass retained as regression reference.

## Bảng giá

| Check | Sample expectation | Current tool | Status |
|-------|--------------------|--------------|--------|
| Logo / header | HOÀNG ANH OWIN + title bar | Header tables rebuilt to sample width | OK |
| Title | BẢNG GIÁ NHÔM OWIN LẮP ĐẶT HOÀN THIỆN | Same constant in exporter | OK |
| Page / table width | 14515 dxa fixed 10-col | Forced fixed layout + equal header/detail width | OK |
| Font | Times-like bold body | Bold + sz=20 on table runs | OK |
| Product image size | ≤ 42×38 mm contain | EMU caps 1512000×1368000 contain | OK |
| Image aspect | object-fit contain ~95% frame | Contain algorithm + logo fallback | OK |
| Borders | Continuous STT/image/total | vMerge + explicit tcBorders on continue | OK |
| Category rows | Own block, uppercase roman | `I. CỬA SỔ` style headings | OK |
| Product block | Specs multiline, empty key kept | `formatSpecLine` key-only when empty | OK |
| Fixed accessory | Package name + item lines | Multiline description on accessory row | OK |
| Extra accessory | Separate short row | `extraAccessory` min height 340 twips | OK |
| Totals column | Merged completed total | vMerge col 9 restart/continue | OK |
| Page break | Product+accessories stay together | cantSplit + keepNext | OK (Word-engine dependent) |
| Orphan x / tokens | None | `removeLeftoverTokens` + tests | OK |
| undefined/NaN | None | money/format guards | OK |

## Báo giá

| Check | Sample expectation | Current tool | Status |
|-------|--------------------|--------------|--------|
| Customer header | Name/address; hide blank phone/email | `removeBlankQuoteContactLines` | OK |
| Item blocks | Product + fixed + extra | Unified product marker row for all kinds | OK |
| Description | Name + specs | Empty-value specs print key only | OK |
| Fixed package | Name + item lines with optional xN | qty>1 only shows `xN` | OK |
| Extra rows | Name/unit/qty/price | Via unified product row | OK |
| Image | roundRect, column 95% | Geometry + EMU fill 0.95 | OK |
| Totals | tong/lam_tron/tam_ung/can_thanh_toan | From calculated quote summary | OK |
| Orphan x | None | Marker span replaced wholly | OK |
| Draft vs confirmed | Normalized data | Export uses `calculateQuote` + cleaned accessories | OK |

## Residual limitations

- Exact Word page breaks still depend on desktop Word/LibreOffice engine.
- Browser print CSS cannot perfectly match Word pagination.
- Image quality without server-side sharp may differ slightly from older server exports.
- No automatic Word COM render in this environment; structure is verified by XML + unit tests + prior PNG samples.

## Fixes applied in this final pass (beyond prior export work)

1. Quote item **confirm/lock** UI so print/export-facing data is normalized after confirm.
2. Aluminum action labels + spacing polish (calc logic/storage unchanged).
3. Re-audited template sources inside the project only (no external Web app).
