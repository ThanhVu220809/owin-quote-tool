import { describe, expect, it } from 'vitest';
import { getDefaultAluminumEstimatorRows } from '@/features/aluminum/estimator/systems';
import {
  createDefaultAluminumEstimatorState,
  type AluminumEstimatorPageState,
} from '@/features/aluminum/aluminumEstimatorStorage';
import {
  buildPrintInputSystems,
  buildRowsForSystem,
  normalizeInput,
  summarizeSystems,
} from '@/features/aluminum/aluminumRowModel';

/**
 * Khoá hành vi dựng bảng của tab "Tính nhôm" sau khi tách khỏi component:
 * thứ tự ưu tiên dòng, thành tiền, tổng theo hệ và STT khi xuất.
 */

const SYSTEM_ID = 'noi-that';
const COLOR = 'Ghi - Cafe';
const catalogue = getDefaultAluminumEstimatorRows(SYSTEM_ID);
const rowIdAt = (index: number) => catalogue[index].rowId;

/** State có: dòng 0 (giá + SL), dòng 2 (chỉ giá), dòng 4 (chỉ SL). */
function sampleState(): AluminumEstimatorPageState {
  return {
    ...createDefaultAluminumEstimatorState(),
    color: COLOR,
    quantities: {
      [SYSTEM_ID]: {
        [rowIdAt(0)]: '3',
        [rowIdAt(4)]: '2',
      },
    },
    unitPricesByColor: {
      [COLOR]: {
        [SYSTEM_ID]: {
          [rowIdAt(0)]: { unitPrice: '150000', note: '' },
          [rowIdAt(2)]: { unitPrice: '200000', note: '' },
        },
      },
    },
  };
}

describe('normalizeInput', () => {
  it('đọc số kiểu Việt Nam, giữ nguyên note', () => {
    expect(normalizeInput({ quantity: '1.500', unitPrice: '1.500.000', note: 'ghi chú' })).toEqual({
      quantity: 1500,
      unitPrice: 1500000,
      note: 'ghi chú',
    });
  });

  it('ô trống thành 0', () => {
    expect(normalizeInput({ quantity: '', unitPrice: '', note: '' })).toEqual({
      quantity: 0,
      unitPrice: 0,
      note: '',
    });
  });
});

describe('buildRowsForSystem', () => {
  it('xếp dòng có đơn giá lên trước, rồi dòng có SL, còn lại giữ thứ tự catalogue', () => {
    const rows = buildRowsForSystem(SYSTEM_ID, sampleState());
    expect(rows.map((row) => row.source.rowId).slice(0, 5)).toEqual([
      rowIdAt(0),
      rowIdAt(2),
      rowIdAt(4),
      rowIdAt(1),
      rowIdAt(3),
    ]);
    expect(rows).toHaveLength(catalogue.length);
  });

  it('thành tiền = SL × đơn giá, dòng thiếu một vế thì bằng 0', () => {
    const rows = buildRowsForSystem(SYSTEM_ID, sampleState());
    expect(rows[0].calculated.lineTotal).toBe(450000);
    expect(rows[1].calculated.lineTotal).toBe(0);
    expect(rows[2].calculated.lineTotal).toBe(0);
  });

  it('áp màu đang chọn cho mọi dòng', () => {
    const rows = buildRowsForSystem(SYSTEM_ID, sampleState());
    expect(rows.every((row) => row.source.color === COLOR)).toBe(true);
  });

  it('hệ không tồn tại thì không có dòng nào', () => {
    expect(buildRowsForSystem('khong-co', sampleState())).toEqual([]);
  });

  it('nối cây nhôm thêm thủ công vào hệ và đánh dấu để UI cho phép xoá', () => {
    const state = {
      ...sampleState(),
      customProfilesBySystem: {
        [SYSTEM_ID]: [{
          id: 'custom-01',
          code: 'OWIN-CUSTOM01',
          description: 'Cây thêm mới',
          image: 'https://example.com/custom.webp',
          createdAt: '2026-09-12T00:00:00.000Z',
        }],
      },
    };
    const custom = buildRowsForSystem(SYSTEM_ID, state).find((row) => row.source.rowId === 'custom-custom-01');

    expect(custom?.source).toMatchObject({
      code: 'OWIN-CUSTOM01',
      description: 'Cây thêm mới',
      image: 'https://example.com/custom.webp',
      isCustom: true,
    });
  });

  it('bỏ cây catalogue đã xóa khỏi danh sách và bản xuất', () => {
    const state = {
      ...sampleState(),
      hiddenProfileRowIdsBySystem: { [SYSTEM_ID]: [rowIdAt(0)] },
    };
    const rows = buildRowsForSystem(SYSTEM_ID, state);
    const printed = buildPrintInputSystems(state).find((system) => system.systemId === SYSTEM_ID);

    expect(rows.some((row) => row.source.rowId === rowIdAt(0))).toBe(false);
    expect(printed?.rows.some((row) => row.code === catalogue[0].code)).toBe(false);
  });
});

describe('summarizeSystems', () => {
  it('cộng tổng cho hệ đang nhập, các hệ khác bằng 0', () => {
    const summaries = summarizeSystems(sampleState());
    const current = summaries.find((summary) => summary.systemId === SYSTEM_ID);
    expect(current?.totals).toEqual({
      enteredRowCount: 2,
      totalQuantity: 5,
      totalAmount: 450000,
    });
    expect(
      summaries
        .filter((summary) => summary.systemId !== SYSTEM_ID)
        .every((summary) => summary.totals.totalAmount === 0),
    ).toBe(true);
  });
});

describe('buildPrintInputSystems', () => {
  it('đánh lại STT theo thứ tự đã ưu tiên, không dùng STT catalogue', () => {
    const systems = buildPrintInputSystems(sampleState());
    const current = systems.find((system) => system.systemId === SYSTEM_ID);
    expect(current?.rows.slice(0, 3).map((row) => [row.stt, row.code])).toEqual([
      [1, catalogue[0].code],
      [2, catalogue[2].code],
      [3, catalogue[4].code],
    ]);
  });

  it('chuyển nguyên chuỗi SL / đơn giá và màu đang chọn', () => {
    const systems = buildPrintInputSystems(sampleState());
    const current = systems.find((system) => system.systemId === SYSTEM_ID);
    expect(current?.color).toBe(COLOR);
    expect(current?.rows[0]).toMatchObject({
      quantity: '3',
      unitPrice: '150000',
      color: COLOR,
    });
    expect(current?.rows[2]).toMatchObject({ quantity: '2', unitPrice: '' });
  });
});
