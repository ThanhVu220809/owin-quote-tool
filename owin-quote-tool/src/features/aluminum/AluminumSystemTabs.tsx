import { useMemo } from 'react';
import { formatEstimatorMoney } from '@/features/aluminum/estimator/estimator';
import { ALUMINUM_SYSTEMS } from '@/features/aluminum/estimator/systems';
import type { AluminumEstimatorSystemTotals } from '@/features/aluminum/aluminumRowModel';

/** Dải nút chọn hệ nhôm, kèm thành tiền của hệ khi hệ đó đã có dòng nhập. */
export function AluminumSystemTabs({
  selectedSystemId,
  rowCountsBySystem,
  systemTotals,
  onSelect,
}: {
  selectedSystemId: string;
  rowCountsBySystem: Record<string, number>;
  systemTotals: AluminumEstimatorSystemTotals[];
  onSelect: (systemId: string) => void;
}) {
  const totalById = useMemo(
    () => Object.fromEntries(systemTotals.map((s) => [s.systemId, s.totals.totalAmount])),
    [systemTotals],
  );

  return (
    <div className="aluminum-tabs">
      {ALUMINUM_SYSTEMS.map((system) => {
        const isActive = system.id === selectedSystemId;
        const rowCount = rowCountsBySystem[system.id] ?? 0;
        const amount = totalById[system.id] ?? 0;

        return (
          <button
            key={system.id}
            type="button"
            className={isActive ? 'active' : ''}
            onClick={() => onSelect(system.id)}
          >
            <span>{system.name}</span>
            {rowCount > 0 && (
              <strong className="aluminum-tab-amount">{formatEstimatorMoney(amount)} đ</strong>
            )}
          </button>
        );
      })}
    </div>
  );
}
