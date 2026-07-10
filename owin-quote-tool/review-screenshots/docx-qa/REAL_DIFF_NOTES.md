# REAL DIFF NOTES — REFERENCE export vs TARGET

Compared against files in `reference-real-output/` downloaded from live `localhost:3000` APIs that power the real buttons.

## Measured REFERENCE facts (authoritative)

### Catalogue DOCX (`reference-catalogue.docx`)
- 20 product images embedded as `catalogue-v8-image-*.jpg`
- Image extents: **max cx=1512000 (42mm), max cy=1368000 (38mm)**
- Geometry: **rect** (0 roundRect)
- vMerge count: 306; cantSplit: 103; keepNext: 638
- Row heights: product/accessory ~1530 twips; extra ~340
- Table width: **14515**
- No leftover tokens; no orphan `x`

### Quote DOCX (`reference-quote.docx`)
- Product images max cx≈1438148 (column 95% contain)
- Geometry: **roundRect**
- Unified product-row rendering for all line kinds
- vMerge / cantSplit / keepNext present
- No orphan `x`

## What TARGET had wrong (pre-fix)

1. **Image sizing guessed from CSS px** (`190×270` px → ~50×71 mm) — **far larger** than REF 42×38 mm catalogue box → first product block looked tiny/wrong and layout pushed next products oddly.
2. Used wrong fit model (px * 9525) instead of REF EMU contain algorithm.
3. Catalogue images used roundRect; REF uses **rect**.
4. Product row heights not set to REF ~1530 twips.
5. Earlier quote path used separate fixed/extra row shells vs REF unified product row (already fixed in prior pass).

## Fixes applied after real measurement

1. Catalogue image: `maxCx=1512000`, `maxCy=1368000`, width-first contain (`fitImageDataUrlToEmuBox`), geometry **rect**.
2. Quote image: `maxCx≈1438148`, roundRect, 95% column fill.
3. Catalogue product/accessory min height **1530** twips; extra **340**.
4. Block model: category alone; product+accessories keepNext block (matches `exportCatalogueV8ToDocx`).
5. Logo fallback still browser-safe via public path fetch.

## Residual gaps

- Cannot embed full Prisma/fs product set from TARGET without local images matching REF storage paths → TARGET file size smaller unless same blobs exist in IndexedDB/public.
- No LibreOffice COM visual PDF of TARGET DOCX in this environment; structure verified via EMU/XML tests + REF file analysis.
- Exact Word page break still Word-engine dependent.
