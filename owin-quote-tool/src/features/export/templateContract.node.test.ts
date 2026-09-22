import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import { calculateQuote } from '@/lib/quote/quoteCalculator';
import {
  buildQuoteWordData,
  renderCatalogueDocumentXml,
  renderQuoteDocumentXml,
} from '@/features/export/wordExport';
import type { ProductRecord } from '@/types/models';

/**
 * HỢP ĐỒNG TEMPLATE WORD — 2 file .docx là dữ liệu nhị phân, review không diff được.
 * Nếu template bị thay/sửa marker mà code không đổi theo, removeLeftoverTokens()
 * sẽ XOÁ marker không khớp → ô trống, KHÔNG ném lỗi nào.
 * Bộ test này là lưới chặn duy nhất cho tình huống đó.
 */

const TEMPLATE_DIR = resolve(__dirname, '../../assets/templates');
const QUOTE_TEMPLATE = 'Template_Bao_Gia.docx';
const CATALOGUE_TEMPLATE = 'Template_Bang_Gia.docx';

/** Marker thật trong template. Bỏ tag XML trước vì Word hay cắt {email} thành nhiều run. */
function markersInTemplate(fileName: string): string[] {
  const zip = new PizZip(readFileSync(resolve(TEMPLATE_DIR, fileName)));
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error(`Template ${fileName} thiếu word/document.xml`);
  const plain = entry.asText().replace(/<[^>]+>/g, '');
  return [...new Set(plain.match(/\{[a-zA-Z_0-9]+\}/g) ?? [])].sort();
}

/** Marker mà wordExport.ts tham chiếu — chỉ lấy string literal, loại template-literal của JS. */
function markersReferencedByCode(): string[] {
  const source = readFileSync(resolve(__dirname, 'wordExport.ts'), 'utf8');
  const found = [...source.matchAll(/'(\{[a-zA-Z_0-9]+\})'/g)].map((match) => match[1]);
  return [...new Set(found)].sort();
}

function markersInAllTemplates(): string[] {
  return [
    ...new Set([...markersInTemplate(QUOTE_TEMPLATE), ...markersInTemplate(CATALOGUE_TEMPLATE)]),
  ].sort();
}

function plainTextOf(xml: string): string {
  return xml.replace(/<[^>]+>/g, '');
}

/**
 * Marker CHỈ để NEO dòng, cố ý không bao giờ được điền.
 * findQuoteTemplateRows() định vị dòng bằng {bo_pk_ten}/{pk_ten}/{ps_ten} rồi thay
 * CẢ DÒNG bằng dòng sản phẩm, nên các ô còn lại trên dòng neo bị bỏ theo dòng.
 */
const ANCHOR_ONLY_MARKERS = [
  '{bo_pk_dg}',
  '{bo_pk_dv}',
  '{bo_pk_sl}',
  '{bo_pk_tt}',
  '{pk_sl_item}',
  '{ps_dg}',
  '{ps_dv}',
  '{ps_sl}',
  '{ps_tt}',
].sort();

/** Marker code dùng để tìm dòng — mất một cái là renderer ném lỗi ngay. */
const ROW_ANCHOR_MARKERS = ['{nhom}', '{stt}', '{ma_sp}', '{bo_pk_ten}', '{pk_ten}', '{ps_ten}'];

describe('Template báo giá — khoá danh sách marker', () => {
  it('marker trong Template_Bao_Gia.docx đúng như đã chốt', () => {
    expect(markersInTemplate(QUOTE_TEMPLATE)).toEqual([
      '{anh_sp}', '{bo_pk_dg}', '{bo_pk_dv}', '{bo_pk_sl}', '{bo_pk_ten}', '{bo_pk_tt}',
      '{can_thanh_toan}', '{cao}', '{dg}', '{dia_chi}', '{dv}', '{email}', '{kl}',
      '{lam_tron}', '{ma_sp}', '{mo_ta}', '{nam}', '{ngay}', '{nhom}', '{pk_sl_item}',
      '{pk_ten}', '{ps_dg}', '{ps_dv}', '{ps_sl}', '{ps_ten}', '{ps_tt}', '{rong}',
      '{sdt}', '{sl}', '{stt}', '{tam_ung}', '{ten_kh}', '{thang}', '{tong_tien}', '{tt}',
    ]);
  });

  it('mọi dòng neo bắt buộc còn tồn tại', () => {
    const markers = markersInTemplate(QUOTE_TEMPLATE);
    for (const marker of ROW_ANCHOR_MARKERS) {
      expect(markers, `thiếu dòng neo ${marker}`).toContain(marker);
    }
  });
});

describe('Template bảng giá — khoá danh sách marker', () => {
  it('marker trong Template_Bang_Gia.docx đúng như đã chốt', () => {
    expect(markersInTemplate(CATALOGUE_TEMPLATE)).toEqual([
      '{accessory_block}', '{cao}', '{category}', '{don_gia}', '{dv}', '{image}', '{kl}',
      '{pk_don_gia}', '{pk_dv}', '{pk_kl}', '{pk_thanh_tien}', '{product_info_block}',
      '{rong}', '{stt}', '{thanh_tien}', '{tong_tien}',
    ]);
  });
});

describe('Code và template không được lệch nhau', () => {
  it('mọi marker code dùng đều CÓ THẬT trong template (bắt gõ sai / code chết)', () => {
    const inTemplates = new Set(markersInAllTemplates());
    const orphanInCode = markersReferencedByCode().filter((marker) => !inTemplates.has(marker));
    expect(orphanInCode).toEqual([]);
  });

  it('marker template mà code KHÔNG điền chỉ được là các marker neo đã biết', () => {
    const referenced = new Set(markersReferencedByCode());
    const unfilled = markersInAllTemplates().filter((marker) => !referenced.has(marker));
    // Marker lạ ở đây = thêm ô vào template mà quên viết code → ô sẽ TRỐNG âm thầm.
    expect(unfilled).toEqual(ANCHOR_ONLY_MARKERS);
  });
});

/* ────────────── Render thật: marker có được thay bằng giá trị không ────────────── */

function sentinelQuote() {
  return calculateQuote({
    customerName: 'KHACH SENTINEL TENKH',
    customerPhone: '0900000111',
    customerEmail: 'sentinel-email',
    customerAddress: 'SO 1 DIACHI SENTINEL',
    quoteDate: new Date(2026, 4, 17),
    depositVnd: 1_000_000,
    items: [
      {
        productCode: 'SENTINELMA',
        quoteItemCode: 'SENTINELMA',
        itemName: 'Cua so sentinel',
        category: 'Cua So',
        groupName: 'NHOM SENTINEL',
        unit: 'M2',
        unitPriceVnd: 2_000_000,
        coverImagePath: null,
        specs: [],
        dimensions: [{ widthM: 1.196, heightM: 1.796, quantity: 1 }],
        accessories: [],
      },
    ],
  });
}

describe('Render báo giá — marker thực sự được thay giá trị', () => {
  it('mọi giá trị trong buildQuoteWordData đều có mặt trong tài liệu render ra', async () => {
    const quote = sentinelQuote();
    const zip = new PizZip(readFileSync(resolve(TEMPLATE_DIR, QUOTE_TEMPLATE)));
    const xml = await renderQuoteDocumentXml(zip, quote);

    // Lấy map trực tiếp từ code: thêm marker mới vào map là test tự bao phủ luôn.
    const data = buildQuoteWordData(quote);
    const missing = Object.entries(data)
      .filter(([, value]) => String(value).trim())
      .filter(([, value]) => !xml.includes(String(value)))
      .map(([marker]) => marker);

    expect(missing).toEqual([]);
    expect(Object.keys(data).length).toBeGreaterThanOrEqual(11);
  });

  it('không marker nào lọt vào file giao cho khách', async () => {
    const zip = new PizZip(readFileSync(resolve(TEMPLATE_DIR, QUOTE_TEMPLATE)));
    const xml = await renderQuoteDocumentXml(zip, sentinelQuote());
    expect(plainTextOf(xml).match(/\{[a-zA-Z_0-9]+\}/g)).toBeNull();
  });

  it('dữ liệu dòng sản phẩm được ghi vào tài liệu', async () => {
    const zip = new PizZip(readFileSync(resolve(TEMPLATE_DIR, QUOTE_TEMPLATE)));
    const plain = plainTextOf(await renderQuoteDocumentXml(zip, sentinelQuote()));
    expect(plain).toContain('SENTINELMA');    // {ma_sp}
    expect(plain).toContain('NHOM SENTINEL'); // {nhom}
    expect(plain).toContain('4.296.000');     // {tt} — BR-1
  });
});

describe('Render bảng giá — marker thực sự được thay giá trị', () => {
  const product: ProductRecord = {
    id: 'p-sentinel',
    updatedAt: new Date(2026, 4, 17).toISOString(),
    createdAt: new Date(2026, 4, 17).toISOString(),
    numericId: 1,
    code: 'CATSENTINEL',
    name: 'San pham bang gia sentinel',
    slug: 'san-pham-bang-gia-sentinel',
    category: 'Cua Chinh',
    unit: 'M2',
    unitPriceVnd: 2_000_000,
    shortDesc: null,
    coverImagePath: null,
    gallery: [],
    rawSizeText: '1.196 x 1.796',
    rawPriceText: null,
    specs: [],
    accessories: [],
    fixedAccessoryPackage: null,
    extraAccessories: '[]',
    isFeatured: false,
    isPublic: true,
  };

  it('ghi được tên sản phẩm + nhóm loại và không để sót marker', async () => {
    const zip = new PizZip(readFileSync(resolve(TEMPLATE_DIR, CATALOGUE_TEMPLATE)));
    const plain = plainTextOf(await renderCatalogueDocumentXml(zip, [product]));

    // Bảng giá là tài liệu cho khách: in TÊN sản phẩm, không in mã nội bộ.
    expect(plain.toUpperCase()).toContain('SAN PHAM BANG GIA SENTINEL');
    expect(plain).toContain('CỬA CHÍNH'); // {category} — đã normalize + Title Case
    expect(plain.match(/\{[a-zA-Z_0-9]+\}/g)).toBeNull();
  });

  /**
   * KHÁC BIỆT CÓ Ý ĐỒ so với báo giá: getCatalogueLineWeight() giữ KL full precision
   * khi tính tiền, chỉ làm tròn lúc HIỂN THỊ — nên Bảng giá ra 4.296.032đ
   * còn Báo giá (BR-1: round3 KL trước khi nhân) ra 4.296.000đ.
   * Khoá lại để không ai "sửa" một bên mà không biết bên kia.
   */
  it('bảng giá dùng KL full precision cho tiền, KHÁC BR-1 của báo giá', async () => {
    const zip = new PizZip(readFileSync(resolve(TEMPLATE_DIR, CATALOGUE_TEMPLATE)));
    const plain = plainTextOf(await renderCatalogueDocumentXml(zip, [product]));

    expect(plain).toContain('4.296.032'); // 1.196 × 1.796 × 2.000.000, không round3 trước
    expect(plain).toContain('2,148');     // KL hiển thị vẫn làm tròn 3 số lẻ
    expect(plain).not.toContain('4.296.000');
  });
});
