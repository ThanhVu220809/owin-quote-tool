/**
 * Ảnh dùng cho file xuất (Word / Excel / PDF).
 *
 * Ảnh gốc trên Storage là bản master: tới 3840px, vài MB mỗi tấm. Nhúng thẳng
 * bản đó vào file là phần chậm nhất của việc xuất — vừa tải hàng chục MB, vừa
 * mã hoá lại một tấm ảnh khổng lồ cho một ô rộng chừng 2cm.
 *
 * Module này tách việc lấy ảnh làm hai tầng:
 *
 *  1. **Bytes nguồn** — mỗi ảnh chỉ tải + thu nhỏ về 480px JPEG đúng MỘT lần cho
 *     cả phiên, bất kể sau đó Word/Excel/PDF hỏi khung nào. Trước đây ba trình
 *     xuất dùng ba `maxEdge` khác nhau nên cùng một tấm ảnh bị tải và mã hoá lại
 *     ba lượt.
 *  2. **Khung yêu cầu** — nếu bytes nguồn đã nằm gọn trong khung thì trả thẳng,
 *     không đụng tới canvas. Với bảng giá vài trăm dòng, đây là chỗ tiết kiệm
 *     lớn nhất sau phần mạng: 300 lượt decode + encode lại trên luồng chính là
 *     vài giây đồng hồ.
 *
 * 480px phủ thoải mái mọi ô ảnh hiện có: ô rộng nhất (bảng giá Word) in ra
 * khoảng 4cm, tức ~305 DPI.
 */

import { getImageBlobByPath, thumbUrlFor } from '@/lib/media/imagePaths';
import { imageBlobCacheActive } from '@/lib/media/imageStorage';
import { publicUrl, storagePathFromPublicUrl, uploadImageBlob } from '@/services/supabase/imagesRepo';
import { DEFAULT_IMAGE_CONCURRENCY, mapWithConcurrency } from '@/lib/async/mapWithConcurrency';

export type ExportImage = {
  blob: Blob;
  /** 'jpeg' sau khi hạ kích thước; giữ nguyên loại gốc khi không đổi được. */
  extension: 'jpeg' | 'png' | 'gif' | 'webp';
  width: number;
  height: number;
};

export type ExportImageOptions = {
  /** Cạnh dài tối đa sau khi hạ kích thước. */
  maxEdge?: number;
  /** Chất lượng JPEG 0–1. */
  quality?: number;
  /** Dùng bản thumb khi có. Tắt cho ảnh vốn đã nhỏ / ảnh tĩnh. */
  preferThumb?: boolean;
  /** Rơi về logo OWIN khi không đọc được ảnh. */
  fallbackLogo?: boolean;
};

/**
 * Khung chuẩn của mọi file xuất. Word, Excel và PDF bảng giá đều dùng đúng con
 * số này để ba lần xuất liên tiếp xài lại chung một bản ảnh đã dựng sẵn.
 */
export const EXPORT_IMAGE_MAX_EDGE = 480;
export const EXPORT_IMAGE_QUALITY = 0.82;
/** Ô ảnh Excel báo giá hiển thị ~105×58px nên vẫn giữ bản nhỏ hơn. */
export const EXCEL_IMAGE_MAX_EDGE = 280;

const cache = new Map<string, Promise<ExportImage | null>>();

/** Số liệu cho `exportTiming`: chỉ đếm, không ảnh hưởng kết quả. */
const stats = {
  images: 0,
  thumbHits: 0,
  masterFallbacks: 0,
  bytesIn: 0,
  bytesOut: 0,
  /**
   * Giờ đồng hồ (ms) từ lúc chạm tới ảnh đầu tiên đến lúc xong tấm cuối.
   *
   * Cố tình KHÔNG cộng dồn thời gian từng tấm: ảnh tải song song 32 luồng nên
   * phép cộng đó ra những con số vô nghĩa kiểu "132808ms cho 329 tấm" trong khi
   * cả lần xuất chỉ mất 4 giây.
   */
  imageMs: 0,
  /** Ảnh lấy từ bộ nhớ đệm, không tốn thêm lượt nào. */
  cacheHits: 0,
  /** Ảnh do Supabase thu nhỏ sẵn ở đúng khung cần (nhẹ nhất). */
  renderHits: 0,
  /** Ảnh lấy từ bản rút gọn `export/` đã dựng ở lần xuất trước. */
  variantHits: 0,
  /** Ảnh vừa phải dựng bản rút gọn để lần xuất sau khỏi tải nặng lại. */
  variantsQueued: 0,
  /** Ảnh nhúng thẳng bytes nguồn, khỏi decode + mã hoá lại lần nữa. */
  reused: 0,
};

/** Mốc đầu–cuối của phần việc ảnh, để `imageMs` là giờ đồng hồ chứ không phải tổng luồng. */
let imageFirstAt = 0;
let imageLastAt = 0;

function markImageWork(at: number): void {
  if (!imageFirstAt) imageFirstAt = at;
  if (at > imageLastAt) imageLastAt = at;
}

export function resetExportImageStats(): void {
  imageFirstAt = 0;
  imageLastAt = 0;
  stats.images = 0;
  stats.thumbHits = 0;
  stats.masterFallbacks = 0;
  stats.bytesIn = 0;
  stats.bytesOut = 0;
  stats.cacheHits = 0;
  stats.renderHits = 0;
  stats.variantHits = 0;
  stats.variantsQueued = 0;
  stats.reused = 0;
}

export function readExportImageStats(): Readonly<typeof stats> {
  return { ...stats, imageMs: imageFirstAt ? imageLastAt - imageFirstAt : 0 };
}

/**
 * Blob → data URL. `FileReader` không có trong môi trường test Node nên có
 * đường vòng qua base64 thuần.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function extensionFromType(type: string): ExportImage['extension'] {
  const value = type.toLowerCase();
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpeg';
  if (value.includes('gif')) return 'gif';
  if (value.includes('webp')) return 'webp';
  return 'png';
}

function canRescale(): boolean {
  return typeof createImageBitmap === 'function' && typeof document !== 'undefined';
}

/**
 * Kích thước thật của một ảnh JPEG, đọc thẳng từ header.
 *
 * Cần nó để biết bytes vừa tải đã vừa khung chưa mà KHÔNG phải giải mã cả tấm
 * ảnh — gọi `createImageBitmap` vài trăm lượt chỉ để đo kích thước đúng là việc
 * thừa đang làm chậm bảng giá. Trả 0 khi không đọc được; nơi gọi sẽ quay về
 * đường thu nhỏ như cũ.
 */
async function jpegSize(blob: Blob): Promise<{ width: number; height: number }> {
  const none = { width: 0, height: 0 };
  if (!blob.type.toLowerCase().includes('jpeg')) return none;
  try {
    const view = new DataView(await blob.slice(0, 65536).arrayBuffer());
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return none;
    let offset = 2;
    while (offset + 9 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = view.getUint8(offset + 1);
      // Marker không có phần thân: đệm, SOI/EOI, RST.
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      // SOF0..SOF15 (trừ DHT 0xc4, JPG 0xc8, DAC 0xcc) mang kích thước ảnh.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      const length = view.getUint16(offset + 2);
      if (length < 2) return none;
      offset += 2 + length;
    }
  } catch {
    /* header lạ → cứ thu nhỏ như cũ */
  }
  return none;
}

const OBJECT_SEGMENT = '/storage/v1/object/public/';
const RENDER_SEGMENT = '/storage/v1/render/image/public/';

/**
 * URL nhờ Supabase thu nhỏ sẵn ảnh ngay trên CDN.
 *
 * Đây là điểm quyết định tốc độ khi bảng giá có vài trăm ảnh: bản thumb lưu sẵn
 * là 640px (~60–150KB/tấm), tải 300 tấm đã là 20–45MB. Hỏi thẳng CDN bản 480px
 * thì mỗi tấm chỉ còn chừng 15KB.
 *
 * Tính năng này tuỳ gói dịch vụ Supabase nên được dò đúng một lần rồi nhớ kết
 * quả; không có thì tự động quay về bản thumb như cũ.
 */
function renderUrlFor(url: string, maxEdge: number, quality: number): string | null {
  if (!url.includes(OBJECT_SEGMENT)) return null;
  const base = url.replace(OBJECT_SEGMENT, RENDER_SEGMENT);
  const params = new URLSearchParams({
    width: String(Math.round(maxEdge)),
    height: String(Math.round(maxEdge)),
    resize: 'contain',
    quality: String(Math.max(20, Math.min(100, Math.round(quality * 100)))),
  });
  return `${base}?${params}`;
}

/**
 * Bản rút gọn dành riêng cho file xuất: `img/<hash>.webp` → `export/<hash>.jpg`.
 *
 * Cần nó vì bản thumb 640px (lo phần danh sách trên màn hình) vẫn nặng
 * 60–150KB; nhân với 300 sản phẩm là 20–45MB, tức cả chục giây chờ tải dù máy
 * và mạng đều tốt. Bản này ~480px JPEG, chừng 15–20KB.
 *
 * Đây là dữ liệu dẫn xuất, dựng lại được bất cứ lúc nào — xoá cả thư mục
 * `export/` trong bucket `product-images` là app tự dựng lại ở lần xuất sau.
 */
const VARIANT_MAX_EDGE = EXPORT_IMAGE_MAX_EDGE;
const VARIANT_QUALITY = 0.78;

/**
 * Bật lên khi Storage từ chối ghi vào `export/` (thường là quyền bucket).
 *
 * Không có nó thì mỗi lần xuất đều tốn thêm một lượt 404 hỏi bản rút gọn không
 * bao giờ tồn tại — tức chậm hơn cả lúc chưa tối ưu. Hỏng thì lặng lẽ quay về
 * đúng đường cũ (CDN thu nhỏ tại chỗ).
 */
let variantWritesBlocked = false;

/**
 * Bỏ hỏi bản `export/` sau khi trượt liên tiếp mà chưa trúng phát nào.
 *
 * Lần xuất đầu tiên trên một bucket chưa có thư mục `export/` thì mỗi tấm ảnh
 * tốn thêm một lượt 404 (~300ms) rồi mới quay sang endpoint thu nhỏ — với 300
 * ảnh là cộng thêm vài giây cho đúng một lần. Sau 16 lượt trượt sạch thì coi như
 * cả bộ chưa được dựng, đi thẳng sang endpoint và vẫn xếp hàng dựng bản rút gọn
 * cho lần sau. Phiên sau, lượt hỏi đầu tiên trúng nên cờ này không bao giờ bật.
 *
 * Ngưỡng 16 nằm dưới mức 32 luồng song song, nên chỉ đúng đợt đầu bị trả giá.
 * Bucket dựng dở (vài sản phẩm mới chưa có bản rút gọn) không dính, vì chỉ cần
 * một lượt trúng là ngưỡng này vô hiệu vĩnh viễn.
 */
let variantProbeHits = 0;
let variantProbeMisses = 0;

function variantProbeWorthIt(): boolean {
  return variantProbeHits > 0 || variantProbeMisses < 16;
}

/** Xuất ra để kiểm thử: phải nhận cả đường dẫn cũ lẫn đường dẫn có tiền tố cửa hàng. */
export function variantPathFor(source: string): string | null {
  if (variantWritesBlocked) return null;
  const storagePath = storagePathFromPublicUrl(source);
  if (!storagePath) return null;
  // Khớp cả `img/<hash>` (ảnh cũ, phẳng ở gốc bucket) lẫn `<store>/img/<hash>`.
  const match = /^((?:[^/]+\/)?)img\/(.+)$/.exec(storagePath);
  if (!match) return null;
  return `${match[1]}export/${match[2].replace(/\.[^./]+$/, '')}.jpg`;
}

/**
 * Ảnh chờ tải lên, đã ở dạng rút gọn.
 *
 * Quan trọng: hàng đợi này chỉ được giữ bản ~18KB. Giữ ảnh gốc ở đây thì 300
 * ảnh master là ngót 1GB trong RAM — đủ để sập tab.
 */
const variantQueue = new Map<string, Blob>();

function queueVariant(path: string, small: Blob): void {
  if (!imageBlobCacheActive() || variantQueue.has(path)) return;
  variantQueue.set(path, small);
  stats.variantsQueued += 1;
}

/**
 * Tải các bản rút gọn còn nợ lên Storage. Gọi SAU khi file đã tải về nên không
 * làm chậm lần xuất hiện tại; hỏng thì bỏ qua, lần sau dựng lại.
 */
export async function flushExportVariants(): Promise<void> {
  if (variantQueue.size === 0) return;
  const pending = [...variantQueue];
  variantQueue.clear();
  let failures = 0;
  await mapWithConcurrency(pending, 8, async ([path, small]) => {
    try {
      await uploadImageBlob(path, small);
    } catch {
      failures += 1;
    }
  });
  // Hỏng cả loạt = không ghi được vào bucket, không phải trục trặc mạng lẻ tẻ.
  if (failures === pending.length) variantWritesBlocked = true;
}

let renderProbe: Promise<boolean> | null = null;

/**
 * Dò một lần duy nhất cho cả phiên; mọi lượt gọi song song chờ chung kết quả.
 * Ảnh không nằm trên Storage (logo tĩnh, data URL) trả `false` mà không ghi nhớ,
 * để không vì một ảnh lạ mà kết luận nhầm cho cả bộ.
 */
function renderAvailable(sampleUrl: string): Promise<boolean> {
  const probeUrl = renderUrlFor(sampleUrl, 64, 0.6);
  if (!probeUrl) return Promise.resolve(false);
  if (!renderProbe) {
    renderProbe = fetch(probeUrl)
      .then((response) => response.ok)
      .catch(() => false);
  }
  return renderProbe;
}

async function fetchRendered(url: string, maxEdge: number, quality: number): Promise<Blob | null> {
  const rendered = renderUrlFor(url, maxEdge, quality);
  if (!rendered) return null;
  try {
    const response = await fetch(rendered);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

/** Hạ kích thước + mã hoá JPEG nền trắng. Trả `null` khi môi trường không vẽ được. */
export async function rescaleExportImage(
  blob: Blob,
  maxEdge = EXPORT_IMAGE_MAX_EDGE,
  quality = EXPORT_IMAGE_QUALITY,
): Promise<ExportImage | null> {
  if (!canRescale()) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const encoded = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    return encoded ? { blob: encoded, extension: 'jpeg', width, height } : null;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

/** Bytes nguồn đã chuẩn hoá về ~480px cho mọi trình xuất dùng chung. */
type SourceBytes = {
  blob: Blob;
  extension: ExportImage['extension'];
  /** 0 khi không đọc được kích thước — nơi gọi sẽ thu nhỏ lại như cũ. */
  width: number;
  height: number;
};

const sourceCache = new Map<string, Promise<SourceBytes | null>>();

/**
 * Lấy bytes nguồn, thứ tự ưu tiên = từ nhẹ tới nặng. Chỉ chạy một lần cho mỗi
 * ảnh trong cả phiên, kể cả khi người dùng bấm lần lượt Word → Excel → PDF.
 */
async function loadSourceOnce(source: string, preferThumb: boolean): Promise<SourceBytes | null> {
  const startedAt = Date.now();
  markImageWork(startedAt);
  try {
    const ready = async (blob: Blob): Promise<SourceBytes> => {
      stats.images += 1;
      stats.bytesIn += blob.size;
      return { blob, extension: extensionFromType(blob.type), ...(await jpegSize(blob)) };
    };

    const variantPath = preferThumb ? variantPathFor(source) : null;

    // 1. Bản rút gọn `export/` đã dựng ở lần xuất trước (~20KB).
    //
    //    Hỏi TRƯỚC endpoint thu nhỏ của CDN, dù endpoint đó cũng trả về đúng bấy
    //    nhiêu bytes: đây là một object tĩnh, lấy về chừng vài chục ms, còn
    //    endpoint kia phải giải mã + resize ảnh master tại chỗ nên mất ~400ms
    //    mỗi tấm. Với 300 ảnh, khác biệt đó chính là khác biệt giữa 4 giây và
    //    nửa giây.
    if (variantPath && variantProbeWorthIt()) {
      const variant = await getImageBlobByPath(publicUrl(variantPath), {
        fallbackLogo: false,
        remember: false,
      });
      if (variant) {
        variantProbeHits += 1;
        stats.variantHits += 1;
        return ready(variant);
      }
      variantProbeMisses += 1;
    }

    // 2. CDN thu nhỏ tại chỗ. Chậm, nhưng vẫn rẻ hơn nhiều so với tải ảnh master
    //    về rồi tự thu nhỏ — và bytes trả về được giữ lại thành bản `export/`
    //    để lần sau rơi vào nhánh 1.
    if (preferThumb && (await renderAvailable(source))) {
      const rendered = await fetchRendered(source, VARIANT_MAX_EDGE, VARIANT_QUALITY);
      if (rendered) {
        stats.renderHits += 1;
        if (variantPath) queueVariant(variantPath, rendered);
        return ready(rendered);
      }
    }

    // 3. Bản thumb 640px dựng sẵn lúc upload, rồi mới tới ảnh master.
    //    `remember: false`: bộ nhớ đệm blob dùng chung giữ ảnh suốt phiên, mà
    //    300 ảnh master là ngót 1GB — chỉ bản 480px dưới đây mới đáng giữ.
    const thumb = preferThumb ? thumbUrlFor(source) : null;
    let heavy = thumb ? await getImageBlobByPath(thumb, { fallbackLogo: false, remember: false }) : null;
    if (heavy) {
      stats.thumbHits += 1;
    } else {
      heavy = await getImageBlobByPath(source, { fallbackLogo: false, remember: false });
      if (heavy) stats.masterFallbacks += 1;
    }

    if (!heavy) return null;
    stats.images += 1;
    stats.bytesIn += heavy.size;

    const small = await rescaleExportImage(heavy, VARIANT_MAX_EDGE, VARIANT_QUALITY);
    // Không vẽ được (test Node, trình duyệt cũ) → dùng nguyên bytes đã tải.
    if (!small) return { blob: heavy, extension: extensionFromType(heavy.type), width: 0, height: 0 };
    if (variantPath) queueVariant(variantPath, small.blob);
    return { blob: small.blob, extension: 'jpeg', width: small.width, height: small.height };
  } finally {
    markImageWork(Date.now());
  }
}

/**
 * Khoá chỉ gồm (nguồn + có dùng thumb hay không) — cố tình KHÔNG có `fallbackLogo`
 * lẫn khung ảnh, để Word, Excel và PDF cùng dùng đúng một lượt tải.
 */
function sourceBytes(source: string, preferThumb: boolean): Promise<SourceBytes | null> {
  const key = `${preferThumb}|${source}`;
  const cached = sourceCache.get(key);
  if (cached) return cached;
  const request = loadSourceOnce(source, preferThumb);
  sourceCache.set(key, request);
  void request
    .then((value) => {
      if (!value) sourceCache.delete(key);
    })
    .catch(() => sourceCache.delete(key));
  return request;
}

/** Logo OWIN dùng chung cho mọi dòng thiếu ảnh: tải và thu nhỏ đúng một lần. */
let logoBytes: Promise<SourceBytes | null> | null = null;

function fallbackLogoBytes(): Promise<SourceBytes | null> {
  if (!logoBytes) {
    logoBytes = (async () => {
      const blob = await getImageBlobByPath(null, { fallbackLogo: true });
      if (!blob) return null;
      const small = await rescaleExportImage(blob, VARIANT_MAX_EDGE, VARIANT_QUALITY);
      return small
        ? { blob: small.blob, extension: 'jpeg' as const, width: small.width, height: small.height }
        : { blob, extension: extensionFromType(blob.type), width: 0, height: 0 };
    })();
    void logoBytes.catch(() => {
      logoBytes = null;
    });
  }
  return logoBytes;
}

async function loadFresh(source: string, options: ExportImageOptions): Promise<ExportImage | null> {
  const maxEdge = options.maxEdge ?? EXPORT_IMAGE_MAX_EDGE;
  const quality = options.quality ?? EXPORT_IMAGE_QUALITY;
  let bytes = await sourceBytes(source, options.preferThumb !== false);
  // Ảnh hỏng/không còn → logo OWIN. Tuyệt đối không lưu logo thành bản rút gọn
  // của sản phẩm này, nếu không mọi lần xuất sau đều ra logo.
  if (!bytes && options.fallbackLogo === true) bytes = await fallbackLogoBytes();
  if (!bytes) return null;

  // Bytes nguồn đã vừa khung → nhúng thẳng. Đây là đường đi của gần như mọi
  // dòng bảng giá, và nó bỏ hẳn một lượt decode + mã hoá trên luồng chính.
  const longEdge = Math.max(bytes.width, bytes.height);
  if (bytes.extension === 'jpeg' && longEdge > 0 && longEdge <= maxEdge) {
    stats.reused += 1;
    stats.bytesOut += bytes.blob.size;
    return { blob: bytes.blob, extension: 'jpeg', width: bytes.width, height: bytes.height };
  }

  markImageWork(Date.now());
  const rescaled = await rescaleExportImage(bytes.blob, maxEdge, quality);
  markImageWork(Date.now());
  stats.bytesOut += (rescaled ?? bytes).blob.size;
  return rescaled ?? { blob: bytes.blob, extension: bytes.extension, width: bytes.width, height: bytes.height };
}

/** Ảnh sẵn sàng nhúng vào file xuất. Nhớ theo (đường dẫn + khung + chất lượng). */
export function loadExportImage(
  source: string | null | undefined,
  options: ExportImageOptions = {},
): Promise<ExportImage | null> {
  if (!source) return Promise.resolve(null);
  const key = [
    source,
    options.maxEdge ?? EXPORT_IMAGE_MAX_EDGE,
    options.quality ?? EXPORT_IMAGE_QUALITY,
    options.preferThumb !== false,
    options.fallbackLogo === true,
  ].join('|');
  const cached = cache.get(key);
  if (cached) {
    stats.cacheHits += 1;
    return cached;
  }
  const request = loadFresh(source, options);
  cache.set(key, request);
  void request
    .then((value) => {
      if (!value) cache.delete(key);
    })
    .catch(() => cache.delete(key));
  return request;
}

/**
 * Nạp sẵn ảnh cho lần xuất sắp tới (gọi khi người dùng vừa chạm vào nút xuất).
 *
 * Không chờ, không báo lỗi: chỉ hâm nóng đúng bộ nhớ đệm mà `loadExportImage`
 * sẽ đọc. Với bảng giá vài trăm dòng, quãng tải ảnh chuyển hẳn sang lúc rê
 * chuột, nên lúc bấm chỉ còn phần dựng file.
 */
export function prewarmExportImages(
  sources: ReadonlyArray<string | null | undefined>,
  options: ExportImageOptions = {},
): void {
  const unique = [...new Set(sources.filter((source): source is string => Boolean(source)))];
  if (unique.length === 0) return;
  void mapWithConcurrency(unique, DEFAULT_IMAGE_CONCURRENCY, (source) =>
    loadExportImage(source, options).catch(() => null),
  );
}
