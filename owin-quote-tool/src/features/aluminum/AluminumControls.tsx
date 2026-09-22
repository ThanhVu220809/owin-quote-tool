import { SmartNumberInput } from '@/components/SmartNumberInput';
import { AluminumSystemTabs } from '@/features/aluminum/AluminumSystemTabs';
import {
  ALUMINUM_COLORS,
  DEFAULT_COLOR_BASE_RATES,
  type AluminumColor,
  type AluminumColorBaseRates,
} from '@/features/aluminum/aluminumEstimatorStorage';
import type { AluminumEstimatorSystemTotals } from '@/features/aluminum/aluminumRowModel';

/** Hai thẻ điều khiển: chọn hệ nhôm và chọn màu + mốc quy đổi của từng màu. */
export function AluminumControls({
  selectedSystemId,
  rowCountsBySystem,
  systemTotals,
  color,
  colorBaseRates,
  onSelectSystem,
  onSelectColor,
  onBaseRateChange,
}: {
  selectedSystemId: string;
  rowCountsBySystem: Record<string, number>;
  systemTotals: AluminumEstimatorSystemTotals[];
  color: string;
  colorBaseRates?: AluminumColorBaseRates;
  onSelectSystem: (systemId: string) => void;
  onSelectColor: (color: AluminumColor) => void;
  onBaseRateChange: (color: AluminumColor, raw: number) => void;
}) {
  return (
    <div className="aluminum-controls">
      <div className="aluminum-control-card aluminum-systems-card">
        <span className="aluminum-control-label">Hệ nhôm</span>
        <AluminumSystemTabs
          selectedSystemId={selectedSystemId}
          rowCountsBySystem={rowCountsBySystem}
          systemTotals={systemTotals}
          onSelect={onSelectSystem}
        />
      </div>
      <div className="aluminum-control-card aluminum-color-block">
        <span className="aluminum-control-label aluminum-color-label">Màu</span>
        <div className="aluminum-color-pair-grid" role="group" aria-label="Màu và mốc quy đổi">
          {ALUMINUM_COLORS.map((item) => (
            <div key={item} className="aluminum-color-pair">
              <button
                type="button"
                className={`aluminum-color-chip${color === item ? ' active' : ''}`}
                onClick={() => onSelectColor(item)}
              >
                {item}
              </button>
              <SmartNumberInput
                className="input aluminum-base-rate-input"
                mode="int"
                min={1}
                value={colorBaseRates?.[item] ?? DEFAULT_COLOR_BASE_RATES[item]}
                onChange={(n) => onBaseRateChange(item, n)}
                placeholder={String(DEFAULT_COLOR_BASE_RATES[item])}
                aria-label={`Mốc ${item}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
