import PizZip from 'pizzip';
import {
  formatAluminumPrintCurrency,
  formatAluminumPrintQuantity,
  type AluminumPrintModel,
  type AluminumPrintRow,
  type AluminumPrintSystemSection,
} from '@/lib/aluminum-estimator-print';
import { downloadBlob } from '@/utils/download';
import { withBasePath } from '@/utils/imagePaths';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeXml(value: string | number): string {
  return escapeHtml(value).replaceAll("'", '&apos;');
}

function toImageSrc(image: string | null | undefined, assetOrigin?: string): string | null {
  if (!image || !image.startsWith('/aluminum-profiles/')) return null;
  const path = withBasePath(image);
  return assetOrigin ? `${assetOrigin}${path}` : path;
}

function renderImage(row: AluminumPrintRow, assetOrigin?: string): string {
  const image = toImageSrc(row.image, assetOrigin);
  if (!image) return '<span class="aluminum-print-image-placeholder">Chưa có ảnh</span>';

  return `<img class="aluminum-print-image" src="${escapeHtml(image)}" alt="Hình ${escapeHtml(row.code)}" />`;
}

export function buildAluminumPrintHtml(model: AluminumPrintModel, assetOrigin?: string): string {
  const sections = model.sections
    .map((section) => {
      const rows = section.rows
        .map(
          (row) => `
            <tr>
              <td class="center">${row.stt}</td>
              <td class="image">${renderImage(row, assetOrigin)}</td>
              <td class="code">${escapeHtml(row.code)}</td>
              <td>${escapeHtml(row.description)}</td>
              <td class="number">${formatAluminumPrintQuantity(row.quantity)}</td>
              <td class="money">${formatAluminumPrintCurrency(row.unitPrice)}</td>
              <td class="money strong">${formatAluminumPrintCurrency(row.lineTotal)}</td>
            </tr>`,
        )
        .join('');

      return `
        <section class="aluminum-print-section">
          <div class="aluminum-print-section-heading">
            <div>
              <h2>${escapeHtml(section.systemName)}</h2>
              <p>Màu: ${escapeHtml(section.color)} · ${section.rows.length} dòng đã nhập</p>
            </div>
            <div class="aluminum-print-section-total">
              <span>${formatAluminumPrintQuantity(section.totalQuantity)} cây</span>
              <strong>${formatAluminumPrintCurrency(section.totalAmount)}</strong>
            </div>
          </div>
          <table class="aluminum-print-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Hình</th>
                <th>Mã cây</th>
                <th>Mô tả / Tên cây</th>
                <th>SL cây</th>
                <th>Đơn giá/cây</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="4">Tổng hệ</td>
                <td class="number">${formatAluminumPrintQuantity(section.totalQuantity)}</td>
                <td></td>
                <td class="money strong">${formatAluminumPrintCurrency(section.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </section>`;
    })
    .join('');

  return `
    <article class="aluminum-print-document">
      <header class="aluminum-print-header">
        <div>
          <h1>${escapeHtml(model.title)}</h1>
          <p>Ngày tạo: ${escapeHtml(model.generatedAt)} · ${
            model.scope === 'current-system' ? 'Phạm vi: Hệ hiện tại' : 'Phạm vi: Tất cả hệ'
          }</p>
        </div>
        <div class="aluminum-print-grand-total">
          <span>Tổng tạm tính</span>
          <strong>${formatAluminumPrintCurrency(model.totalAmount)}</strong>
          <p>${formatAluminumPrintQuantity(model.totalQuantity)} cây · ${model.rowCount} dòng</p>
        </div>
      </header>
      ${sections || '<p class="aluminum-print-empty">Chưa có dòng nào để in/xuất.</p>'}
      <footer class="aluminum-print-footer">
        Bảng này chỉ là tạm tính chi phí nhôm, không phải báo giá khách hàng.
      </footer>
    </article>`;
}

export const ALUMINUM_PRINT_CSS = `
  .aluminum-print-document {
    color: #111827;
    font-family: Arial, "Helvetica Neue", sans-serif;
    padding: 18mm;
    background: #ffffff;
  }
  .aluminum-print-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid #0f766e;
  }
  .aluminum-print-header h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
  .aluminum-print-header p,
  .aluminum-print-section-heading p,
  .aluminum-print-footer { color: #64748b; font-size: 12px; }
  .aluminum-print-grand-total {
    min-width: 240px;
    border: 1px solid #dbe3ea;
    border-radius: 12px;
    padding: 14px;
    text-align: right;
    background: #f8fafc;
  }
  .aluminum-print-grand-total span {
    display: block;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .aluminum-print-grand-total strong {
    display: block;
    margin-top: 5px;
    color: #0f766e;
    font-size: 24px;
    white-space: nowrap;
  }
  .aluminum-print-grand-total p { margin: 6px 0 0; }
  .aluminum-print-section {
    margin-top: 22px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .aluminum-print-section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
  }
  .aluminum-print-section-heading h2 { margin: 0; font-size: 17px; }
  .aluminum-print-section-heading p { margin: 4px 0 0; }
  .aluminum-print-section-total { text-align: right; font-size: 12px; color: #475569; }
  .aluminum-print-section-total span,
  .aluminum-print-section-total strong { display: block; }
  .aluminum-print-section-total strong { color: #111827; font-size: 16px; white-space: nowrap; }
  .aluminum-print-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #dbe3ea;
    font-size: 11.5px;
  }
  .aluminum-print-table th {
    border: 1px solid #dbe3ea;
    background: #f1f5f9;
    color: #334155;
    padding: 8px;
    text-align: left;
    text-transform: uppercase;
    font-size: 10.5px;
  }
  .aluminum-print-table td {
    border: 1px solid #e2e8f0;
    padding: 7px;
    vertical-align: middle;
  }
  .aluminum-print-table tfoot td { background: #f8fafc; font-weight: 700; }
  .aluminum-print-table .center { text-align: center; }
  .aluminum-print-table .number,
  .aluminum-print-table .money { text-align: right; white-space: nowrap; }
  .aluminum-print-table .strong { font-weight: 700; }
  .aluminum-print-table .code { font-weight: 700; white-space: nowrap; }
  .aluminum-print-table .image { width: 132px; text-align: center; }
  .aluminum-print-image,
  .aluminum-print-image-placeholder {
    display: inline-flex;
    width: 118px;
    height: 86px;
    align-items: center;
    justify-content: center;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    object-fit: contain;
    padding: 4px;
    color: #94a3b8;
    font-size: 10px;
    text-align: center;
  }
  .aluminum-print-image {
    width: 118px;
    height: 86px;
  }
  .aluminum-print-footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
  }
  .aluminum-print-empty { margin-top: 24px; color: #64748b; }
`;

/** ~32mm × 24mm display box in Word (EMU). Large enough to read profile shapes. */
const DOCX_IMG_MAX_CX = Math.round(32 * 36000);
const DOCX_IMG_MAX_CY = Math.round(24 * 36000);
const DOCX_COL_WIDTHS = [700, 1800, 1600, 3200, 900, 1400, 1600]; // sum ≈ 11200 dxa landscape content

function docxParagraph(text: string, options: { bold?: boolean; center?: boolean; size?: number } = {}): string {
  return `<w:p>${options.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''}<w:r><w:rPr>${options.bold ? '<w:b/>' : ''}<w:sz w:val="${options.size ?? 22}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function docxTextRun(text: string | number, options: { bold?: boolean; size?: number } = {}): string {
  return `<w:r><w:rPr>${options.bold ? '<w:b/>' : ''}<w:sz w:val="${options.size ?? 20}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function docxCellXml(
  inner: string,
  options: { bold?: boolean; right?: boolean; center?: boolean; fill?: string; width?: number } = {},
): string {
  const align = options.right ? 'right' : options.center ? 'center' : 'left';
  const width = options.width ?? 0;
  const tcW = width > 0 ? `<w:tcW w:w="${width}" w:type="dxa"/>` : '<w:tcW w:w="0" w:type="auto"/>';
  return `<w:tc><w:tcPr>${tcW}${options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="${align}"/></w:pPr>${inner}</w:p></w:tc>`;
}

function docxCell(text: string | number, options: { bold?: boolean; right?: boolean; center?: boolean; fill?: string; width?: number } = {}): string {
  return docxCellXml(docxTextRun(text, { bold: options.bold, size: 20 }), options);
}

function docxTableRow(cells: string[]): string {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function imageInfoFromDataUrl(dataUrl: string): { ext: string; contentType: string } {
  const contentType = dataUrl.match(/^data:([^;]+);base64,/i)?.[1]?.toLowerCase() || 'image/png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (contentType.includes('webp')) return { ext: 'webp', contentType: 'image/webp' };
  if (contentType.includes('gif')) return { ext: 'gif', contentType: 'image/gif' };
  return { ext: 'png', contentType: 'image/png' };
}

function fitToBox(nw: number, nh: number, maxCx: number, maxCy: number): { cx: number; cy: number } {
  const ratio = (nw || 1) / (nh || 1);
  let cx = maxCx;
  let cy = Math.round(cx / ratio);
  if (cy > maxCy) {
    cy = maxCy;
    cx = Math.round(cy * ratio);
  }
  return { cx: Math.max(1, cx), cy: Math.max(1, cy) };
}

async function naturalSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve({ w: 1, h: 1 });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

async function loadProfileDataUrl(imagePath: string | null | undefined): Promise<string | null> {
  if (!imagePath || !imagePath.startsWith('/aluminum-profiles/')) return null;
  try {
    const response = await fetch(withBasePath(imagePath));
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '') || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

interface DocxImagePack {
  contentTypes: Map<string, string>;
  mediaFiles: Array<{ name: string; bytes: Uint8Array }>;
  rels: string[];
  drawings: Map<string, string | null>;
}

async function buildImagePack(model: AluminumPrintModel): Promise<DocxImagePack> {
  const contentTypes = new Map<string, string>();
  const mediaFiles: Array<{ name: string; bytes: Uint8Array }> = [];
  const rels: string[] = [];
  const drawings = new Map<string, string | null>();
  let nextRel = 1;
  let nextDocPr = 6000;
  let nextImg = 1;

  const uniquePaths = Array.from(
    new Set(
      model.sections.flatMap((section) =>
        section.rows.map((row) => row.image).filter((path): path is string => Boolean(path)),
      ),
    ),
  );

  // Sequential so rId / file names stay deterministic and unique.
  for (const path of uniquePaths) {
    const dataUrl = await loadProfileDataUrl(path);
    if (!dataUrl) {
      drawings.set(path, null);
      continue;
    }
    const { ext, contentType } = imageInfoFromDataUrl(dataUrl);
    contentTypes.set(ext, contentType);
    const fileName = `profile-${nextImg++}.${ext}`;
    const relId = `rId${nextRel++}`;
    const docPrId = nextDocPr++;
    mediaFiles.push({ name: fileName, bytes: dataUrlToUint8Array(dataUrl) });
    rels.push(
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/>`,
    );
    const size = await naturalSize(dataUrl);
    const { cx, cy } = fitToBox(size.w, size.h, DOCX_IMG_MAX_CX, DOCX_IMG_MAX_CY);
    drawings.set(
      path,
      `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
        `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
        `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" distT="0" distB="0" distL="0" distR="0">` +
        `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="Profile ${docPrId}"/>` +
        `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${escapeXml(fileName)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`,
    );
  }

  return { contentTypes, mediaFiles, rels, drawings };
}

async function docxSectionTable(
  section: AluminumPrintSystemSection,
  drawings: Map<string, string | null>,
): Promise<string> {
  const w = DOCX_COL_WIDTHS;
  const header = docxTableRow([
    docxCell('STT', { bold: true, center: true, fill: 'F1F5F9', width: w[0] }),
    docxCell('Hình', { bold: true, center: true, fill: 'F1F5F9', width: w[1] }),
    docxCell('Mã cây', { bold: true, fill: 'F1F5F9', width: w[2] }),
    docxCell('Mô tả / Tên cây', { bold: true, fill: 'F1F5F9', width: w[3] }),
    docxCell('SL cây', { bold: true, right: true, fill: 'F1F5F9', width: w[4] }),
    docxCell('Đơn giá/cây', { bold: true, right: true, fill: 'F1F5F9', width: w[5] }),
    docxCell('Thành tiền', { bold: true, right: true, fill: 'F1F5F9', width: w[6] }),
  ]);

  const body = section.rows.map((row) => {
    const drawing = row.image ? drawings.get(row.image) : null;
    const imageInner = drawing
      ? `<w:r>${drawing}</w:r>`
      : docxTextRun(row.image ? 'Chưa tải được ảnh' : 'Chưa có ảnh', { size: 16 });
    return docxTableRow([
      docxCell(row.stt, { center: true, width: w[0] }),
      docxCellXml(imageInner, { center: true, width: w[1] }),
      docxCell(row.code, { bold: true, width: w[2] }),
      docxCell(row.description, { width: w[3] }),
      docxCell(formatAluminumPrintQuantity(row.quantity), { right: true, width: w[4] }),
      docxCell(formatAluminumPrintCurrency(row.unitPrice), { right: true, width: w[5] }),
      docxCell(formatAluminumPrintCurrency(row.lineTotal), { bold: true, right: true, width: w[6] }),
    ]);
  });

  const total = docxTableRow([
    docxCell('Tổng hệ', { bold: true, fill: 'F8FAFC', width: w[0] }),
    docxCell('', { fill: 'F8FAFC', width: w[1] }),
    docxCell('', { fill: 'F8FAFC', width: w[2] }),
    docxCell('', { fill: 'F8FAFC', width: w[3] }),
    docxCell(formatAluminumPrintQuantity(section.totalQuantity), { bold: true, right: true, fill: 'F8FAFC', width: w[4] }),
    docxCell('', { fill: 'F8FAFC', width: w[5] }),
    docxCell(formatAluminumPrintCurrency(section.totalAmount), { bold: true, right: true, fill: 'F8FAFC', width: w[6] }),
  ]);

  const totalWidth = w.reduce((sum, n) => sum + n, 0);
  const grid = w.map((col) => `<w:gridCol w:w="${col}"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${totalWidth}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9E2EC"/><w:left w:val="single" w:sz="4" w:color="D9E2EC"/><w:bottom w:val="single" w:sz="4" w:color="D9E2EC"/><w:right w:val="single" w:sz="4" w:color="D9E2EC"/><w:insideH w:val="single" w:sz="4" w:color="D9E2EC"/><w:insideV w:val="single" w:sz="4" w:color="D9E2EC"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${header}${body.join('')}${total}</w:tbl>`;
}

async function buildDocumentXml(
  model: AluminumPrintModel,
  drawings: Map<string, string | null>,
): Promise<string> {
  const sections: string[] = [];
  for (const section of model.sections) {
    sections.push(docxParagraph(`${section.systemName} - Màu: ${section.color}`, { bold: true, size: 26 }));
    sections.push(await docxSectionTable(section, drawings));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${docxParagraph(model.title, { bold: true, center: true, size: 34 })}
    ${docxParagraph(`Ngày tạo: ${model.generatedAt} | ${model.scope === 'current-system' ? 'Phạm vi: Hệ hiện tại' : 'Phạm vi: Tất cả hệ'}`, { center: true, size: 20 })}
    ${sections.join('')}
    ${docxParagraph(`Tổng SL cây: ${formatAluminumPrintQuantity(model.totalQuantity)}`, { bold: true, size: 24 })}
    ${docxParagraph(`Tổng tiền tất cả: ${formatAluminumPrintCurrency(model.totalAmount)}`, { bold: true, size: 28 })}
    ${docxParagraph('Bảng này chỉ là tạm tính chi phí nhôm, không phải báo giá khách hàng.', { center: true, size: 18 })}
    <w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
}

export async function downloadAluminumDocx(model: AluminumPrintModel): Promise<void> {
  const pack = await buildImagePack(model);
  const defaultExt = Array.from(pack.contentTypes.entries())
    .map(([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`)
    .join('');

  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `${defaultExt}` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  );
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  );

  const word = zip.folder('word');
  word?.file('document.xml', await buildDocumentXml(model, pack.drawings));
  word?.folder('_rels')?.file(
    'document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      pack.rels.join('') +
      `</Relationships>`,
  );
  const media = word?.folder('media');
  for (const file of pack.mediaFiles) {
    media?.file(file.name, file.bytes);
  }

  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const scope = model.scope === 'current-system' ? 'He_Hien_Tai' : 'Tat_Ca_He';
  const blob = zip.generate({ type: 'blob', mimeType: DOCX_MIME });
  downloadBlob(blob, `Bao_Gia_Nhom_OWIN_${scope}_${datePart}.docx`);
}
