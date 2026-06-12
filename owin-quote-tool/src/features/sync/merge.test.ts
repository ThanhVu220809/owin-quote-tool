import { describe, it, expect } from 'vitest';
import type { Product } from '@/types/models';
import { mergeEntities, resolveConflict } from '@/features/sync/merge';

function p(id: string, over: Partial<Product> = {}): Product {
  return {
    id, updatedAt: '2026-06-12T16:00:00.000Z', dvt: 'm²', ten: id, ma: id,
    donGiaGoc: 1000000, accessories: [], ...over,
  };
}

describe('TEST 5.3 — merge LWW + tombstone + conflict (BR-8)', () => {
  it('Local có S99 mới, remote chưa có → sau merge có S99', () => {
    const local = [p('S1'), p('S99')];
    const remote = [p('S1')];
    const base = [p('S1')];
    const { merged, conflicts } = mergeEntities(local, remote, base);
    expect(merged.find((e) => e.id === 'S99')).toBeTruthy();
    expect(conflicts).toHaveLength(0);
  });

  it('Local xoá S5 (deleted:true, mới hơn) → KHÔNG hồi sinh', () => {
    const base = [p('S5', { updatedAt: '2026-06-12T16:00:00.000Z' })];
    const remote = [p('S5', { updatedAt: '2026-06-12T16:00:00.000Z' })]; // remote không đổi
    const local = [p('S5', { deleted: true, updatedAt: '2026-06-12T16:30:00.000Z' })];
    const { merged, conflicts } = mergeEntities(local, remote, base);
    const s5 = merged.find((e) => e.id === 'S5')!;
    expect(s5.deleted).toBe(true); // tombstone giữ nguyên, không bị remote cũ hồi sinh
    expect(conflicts).toHaveLength(0);
  });

  it('remote xoá mới hơn, local cũ → cũng tôn trọng tombstone (không hồi sinh từ local)', () => {
    const base = [p('S7', { updatedAt: '2026-06-12T16:00:00.000Z' })];
    const local = [p('S7', { updatedAt: '2026-06-12T16:00:00.000Z' })];
    const remote = [p('S7', { deleted: true, updatedAt: '2026-06-12T17:00:00.000Z' })];
    const { merged } = mergeEntities(local, remote, base);
    expect(merged.find((e) => e.id === 'S7')!.deleted).toBe(true);
  });

  it('Local sửa giá S1 (16:40), remote sửa tên S1 (16:41) → CONFLICT, không tự nuốt', () => {
    const base = [p('S1', { updatedAt: '2026-06-12T16:00:00.000Z', donGiaGoc: 1000000, ten: 'Cửa A' })];
    const local = [p('S1', { updatedAt: '2026-06-12T16:40:00.000Z', donGiaGoc: 1900000, ten: 'Cửa A' })];
    const remote = [p('S1', { updatedAt: '2026-06-12T16:41:00.000Z', donGiaGoc: 1000000, ten: 'Cửa B' })];
    const { merged, conflicts } = mergeEntities(local, remote, base);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe('S1');
    expect(conflicts[0].local.donGiaGoc).toBe(1900000);
    expect(conflicts[0].remote.ten).toBe('Cửa B');
    // merged tạm giữ local chờ người chọn
    expect(merged.find((e) => e.id === 'S1')!.donGiaGoc).toBe(1900000);
  });

  it('chỉ MỘT bên đổi → KHÔNG conflict, lấy bên đổi (không cần dialog)', () => {
    const base = [p('S1', { updatedAt: '2026-06-12T16:00:00.000Z', donGiaGoc: 1000000 })];
    const local = [p('S1', { updatedAt: '2026-06-12T16:40:00.000Z', donGiaGoc: 1900000 })]; // local đổi
    const remote = [p('S1', { updatedAt: '2026-06-12T16:00:00.000Z', donGiaGoc: 1000000 })]; // remote == base
    const { merged, conflicts } = mergeEntities(local, remote, base);
    expect(conflicts).toHaveLength(0);
    expect(merged.find((e) => e.id === 'S1')!.donGiaGoc).toBe(1900000);
  });

  it('nội dung 2 bên giống nhau (chỉ khác updatedAt) → không conflict', () => {
    const local = [p('S1', { updatedAt: '2026-06-12T16:40:00.000Z' })];
    const remote = [p('S1', { updatedAt: '2026-06-12T16:30:00.000Z' })];
    const { conflicts } = mergeEntities(local, remote, [p('S1')]);
    expect(conflicts).toHaveLength(0);
  });

  it('resolveConflict áp lựa chọn người dùng', () => {
    const base = [p('S1', { updatedAt: '2026-06-12T16:00:00.000Z', ten: 'A' })];
    const local = [p('S1', { updatedAt: '2026-06-12T16:40:00.000Z', ten: 'A-local' })];
    const remote = [p('S1', { updatedAt: '2026-06-12T16:41:00.000Z', ten: 'A-remote' })];
    const { merged, conflicts } = mergeEntities(local, remote, base);
    const afterRemote = resolveConflict(merged, conflicts[0], 'remote');
    expect(afterRemote.find((e) => e.id === 'S1')!.ten).toBe('A-remote');
    const afterLocal = resolveConflict(merged, conflicts[0], 'local');
    expect(afterLocal.find((e) => e.id === 'S1')!.ten).toBe('A-local');
  });
});
