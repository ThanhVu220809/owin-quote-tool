import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const featureDirectory = dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(join(featureDirectory, 'products.css'), 'utf8');

describe('border radius của feature Sản phẩm', () => {
  it('khai báo đủ thang token theo BORDER_RADIUS_GUIDE', () => {
    expect(stylesheet).toContain('--r-xs: 6px;');
    expect(stylesheet).toContain('--r-sm: 8px;');
    expect(stylesheet).toContain('--r-md: 10px;');
    expect(stylesheet).toContain('--r-lg: 14px;');
    expect(stylesheet).toContain('--r-xl: 18px;');
    expect(stylesheet).toContain('--r-pill: 999px;');
  });

  it('mọi border-radius trong CSS đều tham chiếu token (hoặc 50% cho hình tròn)', () => {
    const declarations = [...stylesheet.matchAll(/border-radius\s*:\s*([^;]+);/g)]
      .map((match) => match[1].trim());

    expect(declarations.length).toBeGreaterThan(0);
    declarations.forEach((value) => {
      expect(value).toMatch(/^(var\(--r-(xs|sm|md|lg|xl|pill)\)|50%)(?:\s*!important)?$/);
    });
  });

  it('không khai báo borderRadius inline trong TSX', () => {
    const componentSources = readdirSync(featureDirectory)
      .filter((fileName) => fileName.endsWith('.tsx'))
      .map((fileName) => readFileSync(join(featureDirectory, fileName), 'utf8'));

    componentSources.forEach((source) => {
      expect(source).not.toMatch(/borderRadius\s*:/);
    });
  });
});
