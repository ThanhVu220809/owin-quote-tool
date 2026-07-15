import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { importQuoteFromDocx } from './importQuoteFromDocx';

function makeDocxWithTable(rows: string[][]): ArrayBuffer {
  const rowXml = rows
    .map(
      (cells) =>
        `<w:tr>${cells
          .map((text) => {
            const lines = text.split('\n');
            const paragraphs = lines
              .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
              .join('');
            return `<w:tc>${paragraphs || '<w:p/>'}</w:tc>`;
          })
          .join('')}</w:tr>`,
    )
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      ${rowXml}
    </w:tbl>
  </w:body>
</w:document>`;

  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file('word/document.xml', documentXml);
  return zip.generate({ type: 'arraybuffer' });
}

describe('importQuoteFromDocx', () => {
  it('parses customer + product rows from OWIN-like quote table', async () => {
    const buffer = makeDocxWithTable([
      ['Tên khách hàng: Nguyễn Văn A', 'Địa chỉ: Q.7, TP.HCM', 'ngày 12 tháng 5 năm 2026'],
      ['STT', 'Mã', 'Ảnh', 'Mô tả', 'ĐVT', 'Rộng', 'Cao', 'SL', 'KL', 'Đơn giá'],
      [
        '1',
        'CS-001',
        '',
        'Cửa sổ mở quay - hệ khuôn phào\nMàu: Vân Gỗ Trắc',
        'm²',
        '1.2',
        '1.5',
        '2',
        '',
        '1.500.000',
      ],
      [
        '',
        '',
        '',
        'Bộ phụ kiện: Kinlong chính hãng',
        'Bộ',
        '',
        '',
        '1',
        '',
        '500.000',
      ],
      [
        '',
        '',
        '',
        'Phào trang trí',
        'md',
        '',
        '',
        '3',
        '',
        '100.000',
      ],
    ]);

    const draft = await importQuoteFromDocx(buffer);
    expect(draft.customerName).toBe('Nguyễn Văn A');
    expect(draft.customerAddress).toContain('Q.7');
    expect(draft.quoteDate).toBe('2026-05-12');
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].itemName).toMatch(/Cửa sổ/i);
    expect(draft.items[0].productCode).toBe('CS-001');
    expect(draft.items[0].dimensions[0]).toMatchObject({
      widthM: 1.2,
      heightM: 1.5,
      quantity: 2,
      unitPriceVnd: 1_500_000,
    });
    expect(draft.items[0].fixedAccessoryPackage).toBeTruthy();
    expect(String(draft.items[0].fixedAccessoryPackage)).toMatch(/phụ kiện|Kinlong|Thủy Lực/i);
    expect(draft.items[0].extraAccessories).toContain('Phào');
  });

  it('throws when no product rows found', async () => {
    const buffer = makeDocxWithTable([
      ['STT', 'Mã', 'Ảnh', 'Mô tả', 'ĐVT', 'Rộng', 'Cao', 'SL', 'KL', 'Đơn giá'],
      ['', '', '', 'Không có sản phẩm', '', '', '', '', '', ''],
    ]);
    await expect(importQuoteFromDocx(buffer)).rejects.toThrow(/Không tìm thấy hạng mục/);
  });
});
