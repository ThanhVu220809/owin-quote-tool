/**
 * NGUỒN CHÂN LÝ KIỂU DỮ LIỆU của engine giá.
 *
 * Đây là các type mà phép tính tiền thật sự cần: sản phẩm, dòng báo giá, và
 * kết quả đã tính. Chúng ở trong package vì cả công cụ quản trị lẫn web công
 * khai đều phải nói cùng một ngôn ngữ về giá.
 *
 * Những type còn lại của ứng dụng (QuoteRecord, SuggestionRecord, Aluminum*)
 * KHÔNG thuộc về đây — chúng là chuyện lưu trữ và giao diện của công cụ quản
 * trị, engine không biết đến.
 */

/** Hệ đơn vị tính theo REFERENCE. */
export type ProductUnit = 'BO' | 'M2' | 'METER';


/** Mọi document nghiệp vụ mang updatedAt để hiển thị và xử lý phiên bản. */
export interface SyncEntity {
  id: string;
  updatedAt: string;
  /** Server-side optimistic concurrency token. Never supplied by user input. */
  revision?: number;
  /** Cờ tương thích; cột deleted_at của Supabase là trạng thái xóa chính thức. */
  deleted?: boolean;
  /** Tombstone mới dùng được cho quote/product history. */
  deletedAt?: string | null;
}

export interface ProductSpecRecord {
  key: string;
  value: string;
  sortOrder?: number;
}

export interface ProductAccessoryRecord {
  name: string;
  quantityPerSet: number;
  unitPriceVnd: number;
  note: string | null;
  sortOrder?: number;
}

/** Sản phẩm gốc lưu trong Supabase, theo REFERENCE catalogue/price-table shape. */
export interface ProductRecord extends SyncEntity {
  numericId: number;
  code: string;
  name: string;
  slug: string;
  category: string;
  unit: ProductUnit;
  unitPriceVnd: number;
  shortDesc: string | null;
  coverImagePath: string | null;
  gallery: string[];
  rawSizeText: string | null;
  rawPriceText: string | null;
  specs: ProductSpecRecord[];
  accessories: ProductAccessoryRecord[];
  fixedAccessoryPackage: string | null;
  extraAccessories: string;
  isFeatured: boolean;
  isPublic: boolean;
  /** Manual display order in the catalogue (drag-to-reorder). Undefined → sorted by code. */
  sortOrder?: number;
  folderPath?: string | null;
  createdAt: string;
}

export interface DimensionInput {
  unit?: ProductUnit | null;
  widthM?: number | null;
  heightM?: number | null;
  quantity: number;
  unitPriceVnd?: number | null;
  description?: string | null;
}

export interface AccessoryInput {
  name: string;
  quantityPerSet: number;
  unitPriceVnd: number;
  note?: string | null;
  isEnabled?: boolean;
}

export type QuoteExtraAccessoryUnit = ProductUnit | 'Bộ' | 'm²' | 'md';

export interface QuoteExtraAccessory {
  id: string;
  name: string;
  unit: QuoteExtraAccessoryUnit;
  quantity: number;
  weight: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

export interface QuoteItemInput {
  sourceType?: 'PRODUCT' | 'CUSTOM';
  productId?: string | null;
  /** Stable reference to the source product; kept separate for legacy imports. */
  sourceProductId?: string | null;
  productCode: string;
  /** Snapshot of the product code/name used when the quote was created. */
  productName?: string | null;
  quoteItemCode?: string;
  itemName: string;
  productType?: string | null;
  category?: string | null;
  groupName?: string | null;
  coverImagePath?: string | null;
  categoryImagePath?: string | null;
  categoryImage?: string | null;
  companyLogo?: string | null;
  image?: string | null;
  /** Product image path at quote creation; override paths live under quotes/. */
  imageReference?: string | null;
  imageOverridePath?: string | null;
  imageChecksum?: string | null;
  missingImageReference?: boolean;
  unit: ProductUnit;
  description?: string | null;
  unitPriceVnd: number;
  specs?: ProductSpecRecord[];
  dimensions: DimensionInput[];
  accessories: AccessoryInput[];
  fixedAccessoryPackage?: string | null;
  extraAccessories?: string | null;
  numericId?: number | null;
}

export interface QuoteInput {
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerAddress: string;
  quoteDate?: string | Date | null;
  depositVnd?: number | null;
  items: QuoteItemInput[];
}

export interface CalculatedDimension {
  unit: ProductUnit;
  widthM: number | null;
  heightM: number | null;
  quantity: number;
  calculatedQty: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
  description?: string | null;
}

export interface CalculatedAccessory {
  enabled: boolean;
  isEnabled: boolean;
  name: string;
  quantityPerSet: number;
  totalSet: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
  note?: string | null;
}

export interface CalculatedQuoteItem {
  sourceType: 'PRODUCT' | 'CUSTOM';
  productId?: string | null;
  sourceProductId?: string | null;
  productCode: string;
  quoteItemCode: string;
  itemName: string;
  productName?: string;
  productType?: string | null;
  category?: string | null;
  groupName?: string | null;
  coverImagePath?: string | null;
  categoryImagePath?: string | null;
  categoryImage?: string | null;
  companyLogo?: string | null;
  image?: string | null;
  imageReference?: string | null;
  imageOverridePath?: string | null;
  imageChecksum?: string | null;
  missingImageReference?: boolean;
  unit: ProductUnit;
  description?: string | null;
  unitPriceVnd: number;
  specs?: ProductSpecRecord[];
  dimensions: CalculatedDimension[];
  accessories: CalculatedAccessory[];
  fixedAccessoryPackage?: string | null;
  extraAccessories?: string | null;
  productSubtotalVnd: number;
  accessorySubtotalVnd: number;
  itemTotalVnd: number;
  mainTotal?: number;
  accessoryTotal?: number;
  itemTotal?: number;
  sortOrder: number;
  numericId?: number | null;
}

export interface CalculatedQuote {
  quoteCode?: string;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerAddress: string;
  quoteDate?: string | Date | null;
  depositVnd: number;
  items: CalculatedQuoteItem[];
  summary: {
    subtotalProductVnd: number;
    subtotalAccessoryVnd: number;
    totalVnd: number;
    roundedTotalVnd: number;
    depositVnd: number;
    balanceVnd: number;
  };
}
