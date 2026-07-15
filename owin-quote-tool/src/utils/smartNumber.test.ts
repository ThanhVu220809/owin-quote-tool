import { describe, expect, it } from 'vitest';
import {
  formatSmartNumber,
  parseSmartNumber,
  sanitizeSmartDraft,
} from './smartNumber';

describe('parseSmartNumber', () => {
  it('empty / wipe → 0', () => {
    expect(parseSmartNumber('')).toBe(0);
    expect(parseSmartNumber('   ')).toBe(0);
    expect(parseSmartNumber(null)).toBe(0);
    expect(parseSmartNumber(undefined)).toBe(0);
    expect(parseSmartNumber('', { mode: 'currency' })).toBe(0);
    expect(parseSmartNumber('', { mode: 'int' })).toBe(0);
  });

  it('currency strips separators', () => {
    expect(parseSmartNumber('1.234.567', { mode: 'currency' })).toBe(1_234_567);
    expect(parseSmartNumber('abc', { mode: 'currency' })).toBe(0);
    expect(parseSmartNumber('12a3', { mode: 'currency' })).toBe(123);
  });

  it('decimal accepts comma and dot', () => {
    expect(parseSmartNumber('1,5', { mode: 'decimal' })).toBe(1.5);
    expect(parseSmartNumber('1.5', { mode: 'decimal' })).toBe(1.5);
    expect(parseSmartNumber('2.20', { mode: 'decimal' })).toBe(2.2);
  });

  it('int truncates', () => {
    expect(parseSmartNumber('12', { mode: 'int' })).toBe(12);
    expect(parseSmartNumber('3.9', { mode: 'int' })).toBe(39); // digits only after strip
  });

  it('respects min/max', () => {
    expect(parseSmartNumber('-5', { mode: 'int', min: 0 })).toBe(0);
    expect(parseSmartNumber('999', { mode: 'int', max: 10 })).toBe(10);
  });
});

describe('formatSmartNumber', () => {
  it('0 → empty string for free retype', () => {
    expect(formatSmartNumber(0, { mode: 'currency' })).toBe('');
    expect(formatSmartNumber(0, { mode: 'int' })).toBe('');
    expect(formatSmartNumber(0, { mode: 'decimal' })).toBe('');
  });

  it('formats currency with dots', () => {
    expect(formatSmartNumber(1_234_567, { mode: 'currency' })).toBe('1.234.567');
  });

  it('formats decimal without trailing zeros', () => {
    expect(formatSmartNumber(1.5, { mode: 'decimal', decimals: 3 })).toBe('1.5');
    expect(formatSmartNumber(2, { mode: 'decimal' })).toBe('2');
  });
});

describe('sanitizeSmartDraft', () => {
  it('currency groups thousands while typing', () => {
    expect(sanitizeSmartDraft('1234567', 'currency')).toBe('1.234.567');
    expect(sanitizeSmartDraft('', 'currency')).toBe('');
  });

  it('allows empty draft after wipe', () => {
    expect(sanitizeSmartDraft('', 'int')).toBe('');
    expect(sanitizeSmartDraft('', 'decimal')).toBe('');
  });

  it('decimal keeps one separator', () => {
    expect(sanitizeSmartDraft('1,5', 'decimal')).toBe('1,5');
    expect(sanitizeSmartDraft('1.2.3', 'decimal')).toBe('1.23');
  });
});
