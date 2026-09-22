import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const featureDirectory = dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(join(featureDirectory, 'quote.css'), 'utf8');

describe('font weight của feature Báo giá', () => {
  it('khai báo đúng bốn token theo FONT_WEIGHT_GUIDE', () => {
    expect(stylesheet).toContain('--quote-weight-regular: 400;');
    expect(stylesheet).toContain('--quote-weight-medium: 500;');
    expect(stylesheet).toContain('--quote-weight-semibold: 600;');
    expect(stylesheet).toContain('--quote-weight-bold: 700;');
  });

  it('mọi font-weight trong CSS đều tham chiếu token của feature', () => {
    const declarations = [...stylesheet.matchAll(/font-weight\s*:\s*([^;]+);/g)]
      .map((match) => match[1].trim());

    expect(declarations.length).toBeGreaterThan(0);
    declarations.forEach((value) => {
      expect(value).toMatch(/^var\(--quote-weight-(regular|medium|semibold|bold)\)(?:\s*!important)?$/);
    });
  });

  it('không khai báo fontWeight inline trong TSX', () => {
    const componentSources = readdirSync(featureDirectory)
      .filter((fileName) => fileName.endsWith('.tsx'))
      .map((fileName) => readFileSync(join(featureDirectory, fileName), 'utf8'));

    componentSources.forEach((source) => {
      expect(source).not.toMatch(/fontWeight\s*:/);
    });
  });
});
