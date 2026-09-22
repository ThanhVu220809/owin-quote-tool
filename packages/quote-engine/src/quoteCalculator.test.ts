import { describe, expect, it } from 'vitest';
import { calculateQuote } from './quoteCalculator';

describe('reference quote calculation engine', () => {
  it('calculates M2 rows with rounded KL', () => {
    const quote = calculateQuote({
      customerName: 'A',
      customerPhone: '',
      customerAddress: '',
      items: [
        {
          productCode: 'S1',
          itemName: 'Cửa sổ',
          unit: 'M2',
          unitPriceVnd: 2000000,
          dimensions: [{ widthM: 1.196, heightM: 1.796, quantity: 1 }],
          accessories: [],
        },
      ],
    });

    expect(quote.items[0].dimensions[0].calculatedQty).toBe(2.148);
    expect(quote.items[0].productSubtotalVnd).toBe(4296000);
  });

  it('calculates METER rows', () => {
    const quote = calculateQuote({
      customerName: 'A',
      customerPhone: '',
      customerAddress: '',
      items: [
        {
          productCode: 'MD1',
          itemName: 'Nẹp',
          unit: 'METER',
          unitPriceVnd: 100000,
          dimensions: [{ widthM: 1.2, heightM: 2.4, quantity: 2 }],
          accessories: [],
        },
      ],
    });

    expect(quote.items[0].dimensions[0].calculatedQty).toBe(7.2);
    expect(quote.items[0].productSubtotalVnd).toBe(720000);
  });

  it('calculates BO rows without dimensions', () => {
    const quote = calculateQuote({
      customerName: 'A',
      customerPhone: '',
      customerAddress: '',
      items: [
        {
          productCode: 'PK1',
          itemName: 'Bộ phụ kiện',
          unit: 'BO',
          unitPriceVnd: 2000000,
          dimensions: [{ widthM: 99, heightM: 99, quantity: 3 }],
          accessories: [],
        },
      ],
    });

    expect(quote.items[0].dimensions[0].calculatedQty).toBe(3);
    expect(quote.items[0].productSubtotalVnd).toBe(6000000);
  });

  it('calculates accessory subtotal and final rounded balance', () => {
    const quote = calculateQuote({
      customerName: 'A',
      customerPhone: '',
      customerAddress: '',
      depositVnd: 1000000,
      items: [
        {
          productCode: 'S1',
          itemName: 'Cửa sổ',
          unit: 'M2',
          unitPriceVnd: 2000000,
          dimensions: [{ widthM: 1.196, heightM: 1.796, quantity: 1 }],
          accessories: [
            { name: 'Tay nắm', quantityPerSet: 2, unitPriceVnd: 500000 },
            { name: 'Tắt', quantityPerSet: 1, unitPriceVnd: 999999, isEnabled: false },
          ],
        },
      ],
    });

    expect(quote.summary.subtotalAccessoryVnd).toBe(1000000);
    expect(quote.summary.totalVnd).toBe(5296000);
    expect(quote.summary.roundedTotalVnd).toBe(5200000);
    expect(quote.summary.balanceVnd).toBe(4200000);
  });
});
