import { roundMoneyDownToHundredThousands } from './rounding';
import type { QuoteTotals, QuoteTotalsInput } from './types';

export function calculateProductSubtotal(lines: Array<{ lineTotalVnd: number }>): number {
  return lines.reduce((sum, line) => sum + line.lineTotalVnd, 0);
}

export function calculateRoundedTotal(totalVnd: number): number {
  return roundMoneyDownToHundredThousands(totalVnd);
}

export function calculateBalance(
  roundedTotalVnd: number,
  depositVnd: number | string | null | undefined,
): number {
  const safeDepositVnd = Math.max(0, Math.round(Number(depositVnd || 0)));
  return Math.max(0, roundedTotalVnd - safeDepositVnd);
}

export function calculateQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  const totalVnd = input.subtotalProductVnd + input.subtotalAccessoryVnd;
  const roundedTotalVnd = calculateRoundedTotal(totalVnd);
  const depositVnd = Math.max(0, Math.round(Number(input.depositVnd || 0)));
  const balanceVnd = calculateBalance(roundedTotalVnd, depositVnd);

  return {
    subtotalProductVnd: input.subtotalProductVnd,
    subtotalAccessoryVnd: input.subtotalAccessoryVnd,
    totalVnd,
    roundedTotalVnd,
    depositVnd,
    balanceVnd,
  };
}
