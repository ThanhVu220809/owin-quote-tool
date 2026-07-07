import type { ProductUnit } from '@/types/models';

export type QuoteEngineUnit = ProductUnit;
export type UnitInput = QuoteEngineUnit | 'm²' | 'md' | 'Bộ' | string | null | undefined;

export interface DimensionQuantityInput {
  unit: UnitInput;
  widthM?: number | string | null;
  heightM?: number | string | null;
  quantity: number | string;
}

export interface ExtraAccessoryPricingInput {
  unit?: UnitInput;
  quantity?: number | string | null;
  weight?: number | string | null;
  unitPriceVnd?: number | string | null;
  unitPrice?: number | string | null;
}

export interface LegacyAccessoryPricingInput {
  quantityPerSet: number | string;
  unitPriceVnd: number | string;
  isEnabled?: boolean;
}

export interface QuoteTotalsInput {
  subtotalProductVnd: number;
  subtotalAccessoryVnd: number;
  depositVnd?: number | string | null;
}

export interface QuoteTotals {
  subtotalProductVnd: number;
  subtotalAccessoryVnd: number;
  totalVnd: number;
  roundedTotalVnd: number;
  depositVnd: number;
  balanceVnd: number;
}

export interface FixedAccessoryRuleItem {
  name: string;
  quantity: number;
}

export type FixedAccessoryPackageLike = {
  name?: string | null;
  items?: FixedAccessoryRuleItem[] | null;
  itemsText?: string | null;
  packageQuantity?: number | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  unitPriceVnd?: number | null;
  total?: number | null;
  totalVnd?: number | null;
};
