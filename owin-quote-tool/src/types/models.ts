/**
 * NGUỒN CHÂN LÝ KIỂU DỮ LIỆU — Owin Quote Tool.
 *
 * Các type của phép tính tiền (sản phẩm, dòng báo giá, kết quả đã tính) sống
 * trong `@owin/quote-engine` vì web công khai cũng dùng chúng. File này tái
 * xuất chúng để 70+ chỗ đang `import ... from '@/types/models'` không phải đổi
 * gì, và giữ lại những type chỉ công cụ quản trị mới cần.
 */
export type {
  AccessoryInput,
  CalculatedAccessory,
  CalculatedDimension,
  CalculatedQuote,
  CalculatedQuoteItem,
  DimensionInput,
  ProductAccessoryRecord,
  ProductRecord,
  ProductSpecRecord,
  ProductUnit,
  QuoteExtraAccessory,
  QuoteExtraAccessoryUnit,
  QuoteInput,
  QuoteItemInput,
  SyncEntity,
} from '@owin/quote-engine';

import type { CalculatedQuote, ProductUnit, SyncEntity } from '@owin/quote-engine';

export type QuoteStatus = 'DRAFT' | 'SAVED' | 'EXPORTED';

export interface QuoteSnapshotData extends CalculatedQuote {
  quoteCode: string;
  createdAt: string;
  company: {
    name: string;
    phone: string;
    email: string;
    address: string;
    logo?: string;
  };
}

export interface QuoteDimensionRecord {
  unit: ProductUnit;
  widthM: number;
  heightM: number;
  quantity: number;
  calculatedQty: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
  description?: string | null;
  sortOrder?: number;
}

export interface QuoteAccessoryRecord {
  name: string;
  quantityPerSet: number;
  totalSet: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
  note: string | null;
  sortOrder?: number;
}

export interface QuoteItemRecord {
  id: string;
  sourceType: 'PRODUCT' | 'CUSTOM';
  productId: string | null;
  sourceProductId?: string | null;
  productCode: string;
  productName?: string | null;
  itemName: string;
  category: string | null;
  imagePath: string | null;
  imageReference?: string | null;
  imageOverridePath?: string | null;
  imageChecksum?: string | null;
  missingImageReference?: boolean;
  unit: ProductUnit;
  description: string | null;
  unitPriceVnd: number;
  productSubtotalVnd: number;
  accessorySubtotalVnd: number;
  itemTotalVnd: number;
  fixedAccessoryPackage: string | null;
  extraAccessories: string | null;
  snapshotJson?: string;
  dimensions: QuoteDimensionRecord[];
  accessories: QuoteAccessoryRecord[];
  sortOrder?: number;
}

export interface QuoteExportRecord {
  id: string;
  type: 'docx' | 'xlsx' | 'pdf';
  fileName: string;
  filePath: string | null;
  createdAt: string;
}

export interface QuoteRecord extends SyncEntity {
  code: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerAddress: string;
  quoteDate: string | null;
  depositVnd: number;
  subtotalProductVnd: number;
  subtotalAccessoryVnd: number;
  totalVnd: number;
  roundedTotalVnd: number;
  balanceVnd: number;
  status: QuoteStatus;
  snapshot: QuoteSnapshotData;
  snapshotJson?: string;
  items: QuoteItemRecord[];
  exports: QuoteExportRecord[];
  folderPath: string | null;
  deletedAt: string | null;
  createdAt: string;
}


export interface SuggestionRecord extends SyncEntity {
  type: string;
  value: string;
  usedCount: number;
  createdAt: string;
}

/** Ô nhập UI: SL (session) + đơn giá của màu đang chọn. */
export interface AluminumEstimatorInputState {
  quantity: string;
  unitPrice: string;
  note: string;
}

/** Đơn giá bền vững theo một dòng (không chứa SL). */
export interface AluminumEstimatorPriceState {
  unitPrice: string;
  note: string;
}

/** Legacy shape: system → row → input (còn dùng khi migrate). */
export type AluminumEstimatorRowsBySystem = Record<string, Record<string, AluminumEstimatorInputState>>;

/** SL session: system → row → quantity string. Không lưu Supabase. */
export type AluminumEstimatorQuantitiesBySystem = Record<string, Record<string, string>>;

/** Đơn giá theo màu → system → row. */
export type AluminumEstimatorUnitPricesByColor = Record<
  string,
  Record<string, Record<string, AluminumEstimatorPriceState>>
>;

/** Một cây nhôm được thêm trực tiếp từ màn Bảng tính nhôm. */
export interface AluminumCustomProfile {
  /** ID ổn định, tách khỏi mã cây vì mã có thể trùng giữa các hệ. */
  id: string;
  code: string;
  description: string;
  /** URL ảnh đã tải lên Storage, hoặc null nếu chưa có ảnh. */
  image: string | null;
  createdAt: string;
}

/** Các cây nhôm do người dùng thêm, phân theo hệ nhôm. */
export type AluminumCustomProfilesBySystem = Record<string, AluminumCustomProfile[]>;

/** ID các cây catalogue được ẩn khỏi bảng tính theo từng hệ. */
export type AluminumHiddenProfileRowIdsBySystem = Record<string, string[]>;

export interface AluminumCalculationRecord extends SyncEntity {
  selectedSystemId: string;
  /**
   * @deprecated Bản cũ lưu SL+đơn giá chung một màu.
   * Load path migrate sang unitPricesByColor (bỏ SL).
   */
  inputRows?: AluminumEstimatorRowsBySystem;
  /** Đơn giá theo màu (Ghi - Cafe | Vân Gỗ), tách biệt từng màu. */
  unitPricesByColor?: AluminumEstimatorUnitPricesByColor;
  /** Cây nhôm thêm thủ công theo từng hệ. */
  customProfilesBySystem?: AluminumCustomProfilesBySystem;
  /** Cây catalogue người dùng đã xóa khỏi danh sách tính nhôm. */
  hiddenProfileRowIdsBySystem?: AluminumHiddenProfileRowIdsBySystem;
  /** Màu đang chọn: Ghi - Cafe | Vân Gỗ. */
  color?: string;
  /**
   * Mốc quy đổi 2 màu (đồng/md).
   * Công thức: giá_VânGỗ = giá_Ghi / baseGhi × baseVanGo (và ngược lại).
   */
  colorBaseRates?: {
    'Ghi - Cafe'?: number;
    'Vân Gỗ'?: number;
  };
  createdAt: string;
}
