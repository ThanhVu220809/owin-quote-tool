import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/types/models';
import { _clearAll, getAllProductsRaw, saveProduct } from '@/features/products/productStore';
import { _clearQuotes, saveQuoteRecord } from '@/features/quote/quoteStore';
import {
  aluminumEstimatorStore,
  saveAluminumEstimatorStorage,
} from '@/features/aluminum/aluminumEstimatorStorage';
import { getImage, getQuoteImage, imageStore, quoteImageStore, saveImage, saveQuoteImage } from '@/utils/imageStorage';
import { beginPullFromOtherAccount, beginPushToOtherAccount } from './transferEngine';

const drive = vi.hoisted(() => ({
  downloadDB: vi.fn(),
  downloadImage: vi.fn(),
  uploadDB: vi.fn(),
  uploadImage: vi.fn(),
  findFileMetadata: vi.fn(),
}));

vi.mock('./driveSync', () => drive);

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'P1',
    updatedAt: '2026-06-12T16:00:00.000Z',
    dvt: 'm²',
    ten: 'Cửa mẫu',
    ma: 'P1',
    donGiaGoc: 1000000,
    accessories: [],
    ...over,
  };
}

beforeEach(async () => {
  await _clearAll();
  await _clearQuotes();
  await aluminumEstimatorStore.clear();
  await imageStore.clear();
  await quoteImageStore.clear();
  vi.clearAllMocks();
  drive.downloadDB.mockResolvedValue(null);
  drive.downloadImage.mockResolvedValue(null);
  drive.uploadDB.mockResolvedValue(undefined);
  drive.uploadImage.mockResolvedValue(undefined);
  drive.findFileMetadata.mockResolvedValue(null);
});

describe('transferEngine - chuyển dữ liệu tài khoản Google khác', () => {
  it('đẩy kho sang tài khoản khác: upload DB và ảnh local đang được chọn', async () => {
    const saved = await saveProduct({
      dvt: 'm²',
      ten: 'Cửa local',
      ma: 'L1',
      donGiaGoc: 1500000,
      accessories: [],
      imageId: 'img-local',
    });
    await saveImage('img-local', new Blob(['local-image'], { type: 'image/png' }));

    const status = await beginPushToOtherAccount('other-token');

    expect(status).toMatchObject({ state: 'done', mode: 'push-other', products: 1, images: 1 });
    expect(drive.uploadDB).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 2,
        products: [expect.objectContaining({ id: saved.id, coverImagePath: 'legacy-images/img-local' })],
        quotes: expect.arrayContaining([
          expect.objectContaining({ code: 'OWIN-BG-20260707-0001' }),
        ]),
      }),
      'other-token',
    );
    expect(drive.uploadImage).toHaveBeenCalledWith('img-local', expect.any(Blob), 'other-token');
  });

  it('đẩy sang tài khoản khác: local ghi đè toàn bộ, không tạo BR-8 theo từng sản phẩm', async () => {
    await saveProduct({ id: 'S1', dvt: 'm²', ten: 'Cửa S1', ma: 'S1', donGiaGoc: 2000000, accessories: [] });
    drive.downloadDB.mockResolvedValue({
      schemaVersion: 1,
      systems: [],
      products: [
        product({ id: 'S1', ma: 'S1', ten: 'Cửa S1', donGiaGoc: 1500000 }),
        product({ id: 'REMOTE-ONLY', ma: 'REMOTE-ONLY', ten: 'Chỉ có ở kho đích' }),
      ],
    });

    const status = await beginPushToOtherAccount('other-token');

    expect(status).toMatchObject({ state: 'done', mode: 'push-other', products: 1 });
    expect(drive.downloadDB).not.toHaveBeenCalled();
    expect(drive.uploadDB).toHaveBeenCalledWith(
      expect.objectContaining({
        products: [expect.objectContaining({ id: 'S1', unitPriceVnd: 2000000 })],
      }),
      'other-token',
    );
    const uploaded = drive.uploadDB.mock.calls[0]?.[0];
    expect(uploaded.products.some((item: { id: string }) => item.id === 'REMOTE-ONLY')).toBe(false);
  });

  it('lấy kho từ tài khoản khác: ghi local và tải ảnh remote được chọn', async () => {
    drive.downloadDB.mockResolvedValue({
      schemaVersion: 1,
      systems: [],
      products: [product({ id: 'R1', ma: 'R1', ten: 'Cửa remote', imageId: 'img-remote' })],
    });
    drive.downloadImage.mockResolvedValue(new Blob(['remote-image'], { type: 'image/png' }));

    const status = await beginPullFromOtherAccount('other-token');

    expect(status).toMatchObject({ state: 'done', mode: 'pull-other', products: 1, images: 1 });
    expect((await getAllProductsRaw()).find((p) => p.id === 'R1')?.name).toBe('Cửa remote');
    expect(await getImage('img-remote')).toBeInstanceOf(Blob);
    expect(drive.downloadImage).toHaveBeenCalledWith('img-remote', 'other-token');
  });

  it('đẩy sang tài khoản khác: kèm ảnh quote và dữ liệu tính tạm nhôm', async () => {
    const quoteImagePath = 'quotes/Q1/items/HM-01/cover.webp';
    await saveQuoteImage(quoteImagePath, new Blob(['quote-image'], { type: 'image/png' }));
    const quote = await saveQuoteRecord({
      id: 'Q1',
      code: 'OWIN-BG-20260709-0001',
      customerName: 'Khách A',
      customerPhone: '0900000000',
      customerAddress: 'Hà Tĩnh',
      createdAt: '2026-07-09T01:00:00.000Z',
      updatedAt: '2026-07-09T01:00:00.000Z',
      items: [
        {
          id: 'QI1',
          sourceType: 'CUSTOM',
          productId: null,
          productCode: 'HM-01',
          itemName: 'Hạng mục có ảnh',
          category: null,
          imagePath: quoteImagePath,
          unit: 'M2',
          description: null,
          unitPriceVnd: 1000000,
          productSubtotalVnd: 1000000,
          accessorySubtotalVnd: 0,
          itemTotalVnd: 1000000,
          fixedAccessoryPackage: null,
          extraAccessories: null,
          dimensions: [],
          accessories: [],
        },
      ],
    });
    await saveAluminumEstimatorStorage({
      selectedSystemId: 'xingfa-he-55',
      inputRows: {
        'xingfa-he-55': {
          row1: { quantity: '2', unitPrice: '100000', note: 'test' },
        },
      },
      updatedAt: '2026-07-09T02:00:00.000Z',
    });

    const status = await beginPushToOtherAccount('other-token');

    expect(status).toMatchObject({ state: 'done', mode: 'push-other' });
    expect(drive.uploadImage).toHaveBeenCalledWith(quoteImagePath, expect.any(Blob), 'other-token');
    expect(drive.uploadDB).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: expect.arrayContaining([expect.objectContaining({ id: quote.id })]),
        aluminumCalculations: [
          expect.objectContaining({
            id: 'owin_aluminum_estimator_v2',
            selectedSystemId: 'xingfa-he-55',
          }),
        ],
      }),
      'other-token',
    );
  });

  it('lấy kho từ tài khoản khác: tải ảnh quote và ghi dữ liệu tính tạm nhôm', async () => {
    const quoteImagePath = 'quotes/RQ1/items/HM-REMOTE/cover.webp';
    drive.downloadDB.mockResolvedValue({
      schemaVersion: 2,
      systems: [],
      products: [],
      quotes: [
        {
          id: 'RQ1',
          code: 'OWIN-BG-20260709-0002',
          customerId: null,
          customerName: 'Khách remote',
          customerPhone: '0911111111',
          customerEmail: null,
          customerAddress: 'Vinh',
          quoteDate: '2026-07-09T00:00:00.000Z',
          depositVnd: 0,
          subtotalProductVnd: 0,
          subtotalAccessoryVnd: 0,
          totalVnd: 0,
          roundedTotalVnd: 0,
          balanceVnd: 0,
          status: 'SAVED',
          snapshot: {
            quoteCode: 'OWIN-BG-20260709-0002',
            createdAt: '2026-07-09T00:00:00.000Z',
            company: { name: 'OWIN', phone: '', email: '', address: '' },
            customerName: 'Khách remote',
            customerPhone: '0911111111',
            customerAddress: 'Vinh',
            depositVnd: 0,
            items: [
              {
                sourceType: 'CUSTOM',
                productCode: 'HM-REMOTE',
                quoteItemCode: 'HM-REMOTE',
                itemName: 'Remote có ảnh',
                image: quoteImagePath,
                coverImagePath: quoteImagePath,
                unit: 'M2',
                unitPriceVnd: 0,
                dimensions: [],
                accessories: [],
                productSubtotalVnd: 0,
                accessorySubtotalVnd: 0,
                itemTotalVnd: 0,
                sortOrder: 1,
              },
            ],
            summary: {
              subtotalProductVnd: 0,
              subtotalAccessoryVnd: 0,
              totalVnd: 0,
              roundedTotalVnd: 0,
              depositVnd: 0,
              balanceVnd: 0,
            },
          },
          items: [],
          exports: [],
          folderPath: null,
          deletedAt: null,
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:00:00.000Z',
        },
      ],
      suggestions: [],
      aluminumCalculations: [
        {
          id: 'owin_aluminum_estimator_v2',
          selectedSystemId: 'xingfa-he-93',
          inputRows: {
            'xingfa-he-93': {
              row2: { quantity: '3', unitPrice: '200000', note: 'remote' },
            },
          },
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:00:00.000Z',
        },
      ],
    });
    drive.downloadImage.mockResolvedValue(new Blob(['quote-remote-image'], { type: 'image/png' }));

    const status = await beginPullFromOtherAccount('other-token');

    expect(status).toMatchObject({ state: 'done', mode: 'pull-other', images: 1 });
    expect(drive.downloadImage).toHaveBeenCalledWith(quoteImagePath, 'other-token');
    expect(await getQuoteImage(quoteImagePath)).toBeInstanceOf(Blob);
    expect(await aluminumEstimatorStore.getItem('owin_aluminum_estimator_v2')).toMatchObject({
      selectedSystemId: 'xingfa-he-93',
    });
  });
});
