import PizZip from 'pizzip';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const qaDir = resolve('review-screenshots/docx-qa');
mkdirSync(resolve(qaDir, 'reference'), { recursive: true });
mkdirSync(resolve(qaDir, 'target-before-fix'), { recursive: true });
mkdirSync(resolve(qaDir, 'target-after-fix'), { recursive: true });

function inspect(label, filePath) {
  const zip = new PizZip(readFileSync(filePath));
  const xml = zip.file('word/document.xml').asText();
  const tokens = [...new Set([...xml.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]))];
  const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  const markerRows = rows
    .filter((r) => /\{[a-zA-Z0-9_]+\}/.test(r))
    .map((r) => [...r.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((x) => x[0]).join(' '));
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
  console.log(`\n== ${label} ==`);
  console.log('path:', filePath);
  console.log('tokens:', tokens.join(', '));
  console.log('marker rows:');
  markerRows.forEach((r, i) => console.log(`  ${i}: ${r}`));
  console.log('media count:', media.length);
  return { tokens, markerRows, media, xml };
}

const results = {
  targetQuote: inspect('TARGET quote tpl', resolve('src/assets/templates/Template_Bao_Gia.docx')),
  targetCatalogue: inspect('TARGET catalogue tpl', resolve('src/assets/templates/Template_Bang_Gia.docx')),
  refQuote: inspect('REF quote tpl', resolve('../../../Web/templates/owin-quote.docx')),
  refCatalogue: inspect('REF catalogue tpl', resolve('../../../Web/templates/owin-catalogue.docx')),
};

writeFileSync(
  resolve(qaDir, 'template-marker-scan.json'),
  JSON.stringify(
    {
      targetQuote: { tokens: results.targetQuote.tokens, markerRows: results.targetQuote.markerRows },
      targetCatalogue: { tokens: results.targetCatalogue.tokens, markerRows: results.targetCatalogue.markerRows },
      refQuote: { tokens: results.refQuote.tokens, markerRows: results.refQuote.markerRows },
      refCatalogue: { tokens: results.refCatalogue.tokens, markerRows: results.refCatalogue.markerRows },
    },
    null,
    2,
  ),
);
console.log('\nWrote template-marker-scan.json');
