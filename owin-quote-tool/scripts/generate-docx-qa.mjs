/**
 * Dev-only QA: render TARGET catalogue + quote DOCX XML samples to review-screenshots/docx-qa.
 * Uses the same wordExport functions as the app (via vitest-style direct import not available in plain node).
 * Instead: open templates and assert marker hygiene after a simulated structure dump.
 */
import PizZip from 'pizzip';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('review-screenshots/docx-qa/target-after-fix');
mkdirSync(outDir, { recursive: true });

function scan(path, label) {
  const zip = new PizZip(readFileSync(path));
  const xml = zip.file('word/document.xml').asText();
  const report = {
    label,
    path,
    leftoverTokens: [...xml.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]),
    hasPkTen: xml.includes('{pk_ten}'),
    hasBoPk: xml.includes('{bo_pk_ten}'),
    hasPsTen: xml.includes('{ps_ten}'),
    hasStt: xml.includes('{stt}'),
    media: Object.keys(zip.files).filter((f) => f.startsWith('word/media/')),
  };
  return report;
}

const reports = [
  scan(resolve('src/assets/templates/Template_Bao_Gia.docx'), 'target-quote-template'),
  scan(resolve('src/assets/templates/Template_Bang_Gia.docx'), 'target-catalogue-template'),
  scan(resolve('../../../Web/templates/owin-quote.docx'), 'ref-quote-template'),
  scan(resolve('../../../Web/templates/owin-catalogue.docx'), 'ref-catalogue-template'),
];

writeFileSync(resolve(outDir, 'template-hygiene.json'), JSON.stringify(reports, null, 2));
console.log('Wrote', resolve(outDir, 'template-hygiene.json'));
console.log(JSON.stringify(reports, null, 2));
