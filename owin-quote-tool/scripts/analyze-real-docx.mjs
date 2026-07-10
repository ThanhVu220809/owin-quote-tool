/**
 * Analyze real REFERENCE-exported DOCX (and optional TARGET) for structural facts.
 */
import PizZip from 'pizzip';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const qa = resolve('review-screenshots/docx-qa');
const outDir = resolve(qa, 'reference-real-output');

function analyze(filePath, label) {
  if (!existsSync(filePath)) return { label, error: 'missing', path: filePath };
  const zip = new PizZip(readFileSync(filePath));
  const xml = zip.file('word/document.xml')?.asText() || '';
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
  const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  const extents = [...xml.matchAll(/<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/g)].map((m) => ({
    cx: Number(m[1]),
    cy: Number(m[2]),
    cxMm: Math.round((Number(m[1]) / 36000) * 100) / 100,
    cyMm: Math.round((Number(m[2]) / 36000) * 100) / 100,
  }));
  const vMerges = (xml.match(/<w:vMerge\b[^>]*\/>/g) || []).length;
  const cantSplit = (xml.match(/<w:cantSplit\b[^>]*\/>/g) || []).length;
  const keepNext = (xml.match(/<w:keepNext\b[^>]*\/>/g) || []).length;
  const leftovers = [...new Set([...xml.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]))];
  const orphanX = (xml.match(/>\s*x\s*</g) || []).length;
  const tblW = [...xml.matchAll(/<w:tblW\b[^>]*w:w="(\d+)"[^>]*\/>/g)].map((m) => Number(m[1]));
  const trHeights = [...xml.matchAll(/<w:trHeight\b[^>]*w:val="(\d+)"[^>]*\/>/g)].map((m) => Number(m[1]));
  const roundRect = (xml.match(/prst="roundRect"/g) || []).length;
  const rect = (xml.match(/prst="rect"/g) || []).length;

  // Sample first image-bearing row text snippet
  const firstDrawing = xml.indexOf('<w:drawing>');
  const sampleAround = firstDrawing >= 0 ? xml.slice(Math.max(0, firstDrawing - 80), firstDrawing + 200) : '';

  return {
    label,
    path: filePath,
    sizeBytes: readFileSync(filePath).length,
    rowCount: rows.length,
    mediaCount: media.length,
    mediaSample: media.slice(0, 8),
    imageExtents: extents.slice(0, 12),
    imageExtentStats: extents.length
      ? {
          count: extents.length,
          minCx: Math.min(...extents.map((e) => e.cx)),
          maxCx: Math.max(...extents.map((e) => e.cx)),
          minCy: Math.min(...extents.map((e) => e.cy)),
          maxCy: Math.max(...extents.map((e) => e.cy)),
          avgCxMm: Math.round((extents.reduce((s, e) => s + e.cxMm, 0) / extents.length) * 100) / 100,
          avgCyMm: Math.round((extents.reduce((s, e) => s + e.cyMm, 0) / extents.length) * 100) / 100,
        }
      : null,
    vMerges,
    cantSplit,
    keepNext,
    leftoverTokens: leftovers,
    orphanX,
    tblW,
    trHeightsSample: trHeights.slice(0, 20),
    roundRect,
    rectGeom: rect,
    hasBold: xml.includes('<w:b/>') || xml.includes('<w:b '),
    sampleAroundFirstDrawing: sampleAround.replace(/\s+/g, ' ').slice(0, 280),
  };
}

const reports = {
  referenceCatalogue: analyze(resolve(outDir, 'reference-catalogue.docx'), 'REF catalogue real export'),
  referenceQuote: analyze(resolve(outDir, 'reference-quote.docx'), 'REF quote real export'),
  targetCatalogueTpl: analyze(resolve('src/assets/templates/Template_Bang_Gia.docx'), 'TARGET catalogue template'),
  targetQuoteTpl: analyze(resolve('src/assets/templates/Template_Bao_Gia.docx'), 'TARGET quote template'),
};

writeFileSync(resolve(outDir, 'REAL_DOCX_STRUCTURE.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
