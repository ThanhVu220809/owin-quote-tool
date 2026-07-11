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
  .aluminum-print-table .image { width: 74px; text-align: center; }
  .aluminum-print-image,
  .aluminum-print-image-placeholder {
    display: inline-flex;
    width: 64px;
    height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    object-fit: contain;
    padding: 3px;
    color: #94a3b8;
    font-size: 9px;
    text-align: center;
  }
  .aluminum-print-footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
  }
  .aluminum-print-empty { margin-top: 24px; color: #64748b; }
`;

function docxParagraph(text: string, options: { bold?: boolean; center?: boolean; size?: number } = {}): string {
  return `<w:p>${options.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''}<w:r><w:rPr>${options.bold ? '<w:b/>' : ''}<w:sz w:val="${options.size ?? 22}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function docxCell(text: string | number, options: { bold?: boolean; right?: boolean; center?: boolean; fill?: string } = {}): string {
  const align = options.right ? 'right' : options.center ? 'center' : 'left';
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${options.fill ? `<w:shd w:fill="${options.fill}"/>` : ''}</w:tcPr><w:p><w:pPr><w:jc w:val="${align}"/></w:pPr><w:r><w:rPr>${options.bold ? '<w:b/>' : ''}<w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
}

function docxTableRow(cells: string[]): string {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

function docxSectionTable(section: AluminumPrintSystemSection): string {
  const header = docxTableRow([
    docxCell('STT', { bold: true, center: true, fill: 'F1F5F9' }),
    docxCell('Hình', { bold: true, center: true, fill: 'F1F5F9' }),
    docxCell('Mã cây', { bold: true, fill: 'F1F5F9' }),
    docxCell('Mô tả / Tên cây', { bold: true, fill: 'F1F5F9' }),
    docxCell('SL cây', { bold: true, right: true, fill: 'F1F5F9' }),
    docxCell('Đơn giá/cây', { bold: true, right: true, fill: 'F1F5F9' }),
    docxCell('Thành tiền', { bold: true, right: true, fill: 'F1F5F9' }),
  ]);
  const body = section.rows.map((row) =>
    docxTableRow([
      docxCell(row.stt, { center: true }),
      docxCell(row.image ? 'Có ảnh' : 'Chưa có ảnh', { center: true }),
      docxCell(row.code, { bold: true }),
      docxCell(row.description),
      docxCell(formatAluminumPrintQuantity(row.quantity), { right: true }),
      docxCell(formatAluminumPrintCurrency(row.unitPrice), { right: true }),
      docxCell(formatAluminumPrintCurrency(row.lineTotal), { bold: true, right: true }),
    ]),
  );
  const total = docxTableRow([
    docxCell('Tổng hệ', { bold: true, fill: 'F8FAFC' }),
    docxCell('', { fill: 'F8FAFC' }),
    docxCell('', { fill: 'F8FAFC' }),
    docxCell('', { fill: 'F8FAFC' }),
    docxCell(formatAluminumPrintQuantity(section.totalQuantity), { bold: true, right: true, fill: 'F8FAFC' }),
    docxCell('', { fill: 'F8FAFC' }),
    docxCell(formatAluminumPrintCurrency(section.totalAmount), { bold: true, right: true, fill: 'F8FAFC' }),
  ]);

  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9E2EC"/><w:left w:val="single" w:sz="4" w:color="D9E2EC"/><w:bottom w:val="single" w:sz="4" w:color="D9E2EC"/><w:right w:val="single" w:sz="4" w:color="D9E2EC"/><w:insideH w:val="single" w:sz="4" w:color="D9E2EC"/><w:insideV w:val="single" w:sz="4" w:color="D9E2EC"/></w:tblBorders></w:tblPr>${header}${body.join('')}${total}</w:tbl>`;
}

function buildDocumentXml(model: AluminumPrintModel): string {
  const sections = model.sections.flatMap((section) => [
    docxParagraph(`${section.systemName} - Màu: ${section.color}`, { bold: true, size: 26 }),
    docxSectionTable(section),
  ]);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
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
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word')?.file('document.xml', buildDocumentXml(model));

  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const scope = model.scope === 'current-system' ? 'He_Hien_Tai' : 'Tat_Ca_He';
  const blob = zip.generate({ type: 'blob', mimeType: DOCX_MIME });
  downloadBlob(blob, `Bao_Gia_Nhom_OWIN_${scope}_${datePart}.docx`);
}
