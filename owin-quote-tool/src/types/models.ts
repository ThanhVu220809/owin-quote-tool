/**
 * NGUỒN CHÂN LÝ KIỂU DỮ LIỆU — Owin Quote Tool.
 *
 * ProductRecord / QuoteRecord are the complete documents persisted in Supabase.
 * Product / QuoteLine remain compatibility views used by a few UI/export helpers.
 */

/** Hệ đơn vị tính legacy trong TARGET cũ. */
export type DVT = 'm²' | 'md' | 'Bộ';

/** Hệ đơn vị tính theo REFERENCE. */
export type ProductUnit = 'BO' | 'M2' | 'METER';

export type QuoteStatus = 'DRAFT' | 'SAVED' | 'EXPORTED';

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

/** Phụ kiện legacy cho UI TARGET cũ. */
export interface Accessory {
  id: string;
  ten: string;
  donGia: number;
  sl: number;
  enabled: boolean;
}

/** Sản phẩm compatibility view. ProductRecord trong Supabase là nguồn dữ liệu chính. */
export interface Product extends SyncEntity {
  dvt: DVT;
  ten: string;
  ma: string;
  donGiaGoc: number;
  rongMacDinh?: number;
  caoMacDinh?: number;
  imageId?: string;
  mau?: string;
  heNhom?: string;
  khungBao?: string;
  banCanh?: string;
  kinh?: string;
  accessories: Accessory[];
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

/**
 * Một dòng legacy trên bảng báo giá. Snapshot từ Product cũ, giữ cho UI hiện tại
 * compile cho tới Phase 4.
 */
export interface QuoteLine extends SyncEntity {
  productId: string;
  dvt: DVT;
  ten: string;
  ma: string;
  rong?: number;
  cao?: number;
  sl: number;
  donGia: number;
  accessories: Accessory[];
  imageId?: string;
  moTa?: string;
}

/** Thông tin khách hàng đầu báo giá legacy. */
export interface Customer {
  ten: string;
  sdt: string;
  diaChi: string;
  email: string;
}

/** Một hệ sản phẩm legacy. */
export interface ProductSystem extends SyncEntity {
  ten: string;
  productIds?: string[];
}

export interface SuggestionRecord extends SyncEntity {
  type: string;
  value: string;
  usedCount: number;
  createdAt: string;
}

export interface AluminumEstimatorInputState {
  quantity: string;
  unitPrice: string;
  note: string;
}

export type AluminumEstimatorRowsBySystem = Record<string, Record<string, AluminumEstimatorInputState>>;

export interface AluminumCalculationRecord extends SyncEntity {
  selectedSystemId: string;
  inputRows: AluminumEstimatorRowsBySystem;
  /** Màu áp cho toàn bộ thanh nhôm (Ghi Xanh / Vân Gỗ Trắc / Vân Gỗ Lim). */
  color?: string;
  createdAt: string;
}

/** Aggregate tương thích; dữ liệu bền vững và metadata nằm trong Supabase. */
export interface OwinDB {
  schemaVersion: number;
  systems: ProductSystem[];
  products: ProductRecord[];
  quotes?: QuoteRecord[];
  suggestions?: SuggestionRecord[];
  aluminumCalculations?: AluminumCalculationRecord[];
}
