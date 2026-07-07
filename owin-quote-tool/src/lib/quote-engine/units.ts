import type { QuoteEngineUnit, UnitInput } from './types';

export function normalizeUnit(input: UnitInput): QuoteEngineUnit {
  if (!input) return 'M2';
  const normalized = String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (normalized === 'bo' || normalized.includes(' bo') || normalized.includes('bo ')) {
    return 'BO';
  }
  if (normalized === 'm2' || normalized === 'm²' || normalized.includes('met vuong')) {
    return 'M2';
  }
  if (
    normalized.includes('met') ||
    normalized.includes('meter') ||
    normalized.includes('md') ||
    normalized.includes('dai')
  ) {
    return 'METER';
  }
  return 'M2';
}

export function isAreaUnit(unit: UnitInput): boolean {
  return normalizeUnit(unit) === 'M2';
}

export function isMeterUnit(unit: UnitInput): boolean {
  return normalizeUnit(unit) === 'METER';
}

export function isSetUnit(unit: UnitInput): boolean {
  return normalizeUnit(unit) === 'BO';
}
