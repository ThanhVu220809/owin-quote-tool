# DOCX / print diff notes

## Findings

### Templates
- Marker tokens for quote + catalogue templates are **identical** between REFERENCE and TARGET (see `template-marker-scan.json`).
- Bug was not “wrong .docx file”; it was **how rows were generated from markers**.

### Quote (main mismatch)
| REFERENCE | TARGET before | TARGET after |
|-----------|---------------|--------------|
| All item lines use **product** marker row | Used product + fixed + extra separate clones | Unified product-row renderer for product/fixed/extra |
| Fixed items = multiline in package description | Same intent, different row shell | Multiline in description via product row |
| Never clones blank `{pk_ten}` | Marker span could leave shells | Entire marker span replaced; strip leftover `x` |
| STT/image merge across full block | Partial | vMerge cols 0–2 for full item block |
| keepNext/cantSplit | Present | Present |
| Logo fallback | Server path | Browser logo data URL |

### Catalogue
| REFERENCE | TARGET |
|-----------|--------|
| category own block (no keepNext to product) | category glued to first product (stricter keep-together) |
| accessory continue vMerge | Same |
| extra row min height 340 twips | Same |
| sharp images | 95% contain data-URL fit + logo fallback |
| bold font pass | bold runs added |

### Print/PDF
| REFERENCE | TARGET |
|-----------|--------|
| QuoteA4Table from print model | QuotePrintDocument from `calculateQuote` (aligned descriptions) |
| Catalogue ProductStatisticsTable | BangGiaView tbody blocks |
| Server PDF | Browser print only |

## Residual limits
- No Word COM / LibreOffice visual render in CI; XML + unit tests verify structure.
- Exact Word pagination still depends on desktop Word engine.
- Image quality differs without sharp.
