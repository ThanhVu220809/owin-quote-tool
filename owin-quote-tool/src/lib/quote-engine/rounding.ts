export function roundDownToNearestMultiple(
  value: number | string | null | undefined,
  multiple = 100,
): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const safeMultiple = Math.max(1, Math.abs(Math.round(multiple)));
  return Math.floor(num / safeMultiple) * safeMultiple;
}

export function roundMoneyDownToHundredThousands(
  value: number | string | null | undefined,
): number {
  return roundDownToNearestMultiple(value, 100000);
}

export function roundMoneyDownToHundreds(value: number | string | null | undefined): number {
  return roundMoneyDownToHundredThousands(value);
}
