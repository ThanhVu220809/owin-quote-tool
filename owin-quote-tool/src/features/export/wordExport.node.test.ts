/**
 * TEST 4.5 (phần tự động hoá được trong node) — render docxtemplater THẬT trên 2 template,
 * kiểm tra: placeholder thay đúng, số khớp BR-1 TỪNG ĐỒNG, dòng lặp đúng, ảnh F2 nhúng.
 *
 * Phần "mở bằng Word/Google Docs nhìn layout" là ⏸ HUMAN visual (xuất file trong app).
 * Ở đây ta xác nhận engine sinh XML/zip hợp lệ với đúng nội dung.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import type { Customer, QuoteLine } from '@/types/models';
import { buildFormat1Data, buildFormat2Data } from '@/features/export/buildQuoteData';

const DIR = resolve(__dirname, '../../assets/templates');
const customer: Customer = { ten: 'Anh Tú', sdt: '0909123456', diaChi: '12 Lê Lợi, Q1', email: 'tu@owin.vn' };

function lineS1(imageId?: string): QuoteLine {
  return {
    id: '1', updatedAt: '', productId: 'S1', dvt: 'm²', ten: 'Cửa sổ mở quay 1 cánh', ma: 'S1',
    rong: 1.196, cao: 1.796, sl: 1, donGia: 2000000, imageId,
    moTa: 'Xingfa 55\nKính cường lực 8mm',
    accessories: [{ id: 'a1', ten: 'Tay nắm Kinlong', donGia: 500000, sl: 2, enabled: true }],
  };
}

const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = Buffer.from(base64, 'base64');
  return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
}

describe('TEST 4.5 — Xuất Word Format 1 (Báo giá)', () => {
  it('render không lỗi, số khớp BR-1 từng đồng, dòng SP + phụ kiện expand', () => {
    const content = readFileSync(resolve(DIR, 'Template_Bao_Gia.docx'), 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(buildFormat1Data(customer, [lineS1()], 1000000));
    const xml = doc.getZip().file('word/document.xml')!.asText();

    expect(xml).toContain('Anh Tú');           // khách
    expect(xml).toContain('4.296.000');         // tiền cửa (BR-1 quy tắc mới: round3 KL rồi nhân)
    expect(xml).not.toContain('4.296.032');
    expect(xml).toContain('1.000.000');         // phụ kiện 2×500.000
    expect(xml).toContain('5.296.000');         // tổng = cửa + PK (CHƯA làm tròn)
    expect(xml).toContain('5.200.000');         // LÀM TRÒN xuống bội số 100.000
    expect(xml).toContain('Tay nắm Kinlong');   // dòng phụ kiện expand
    expect(xml).toContain('S1');
    // tạm ứng 1.000.000 → cần thanh toán = 5.200.000 − 1.000.000 = 4.200.000
    expect(xml).toContain('4.200.000');
  });
});

describe('TEST 4.5 — Xuất Word Format 2 (Bảng giá, có ảnh)', () => {
  it('render không lỗi, nhúng ảnh (media), số khớp, kích thước gộp', () => {
    const imageMap = { img1: TRANSPARENT_PNG };
    const data = buildFormat2Data(customer, [lineS1('img1')], imageMap, 0);

    const imageModule = new ImageModule({
      centered: false,
      fileType: 'docx',
      getImage: (tagValue: string) =>
        dataUrlToArrayBuffer(tagValue && tagValue.length > 0 ? tagValue : TRANSPARENT_PNG),
      getSize: (_img: ArrayBuffer, tagValue: string): [number, number] =>
        tagValue ? [50, 40] : [1, 1],
    });

    const content = readFileSync(resolve(DIR, 'Template_Bang_Gia.docx'), 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { modules: [imageModule], paragraphLoop: true, linebreaks: true });
    doc.render(data);

    const outZip = doc.getZip();
    const xml = outZip.file('word/document.xml')!.asText();
    expect(xml).toContain('Anh Tú');
    expect(xml).toContain('4.296.000');
    expect(xml).toContain('1.196 × 1.796 (m)'); // kích thước gộp Format 2
    // ảnh được nhúng → có file media trong zip
    const mediaFiles = Object.keys(outZip.files).filter((f) => f.startsWith('word/media/'));
    expect(mediaFiles.length).toBeGreaterThan(0);
    // và có thẻ drawing/blip trong document
    expect(xml).toContain('<a:blip');
  });
});
