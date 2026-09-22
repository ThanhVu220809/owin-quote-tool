/**
 * Dữ liệu địa giới Việt Nam sau đợt sắp xếp tháng 07/2025.
 * API v2 có cấu trúc 2 cấp: tỉnh/thành → phường/xã.
 */

export interface VietnamWard {
  code: number;
  name: string;
  division_type: string;
  province_code: number;
}

export interface VietnamProvince {
  code: number;
  name: string;
  division_type: string;
  wards: VietnamWard[];
}

const VIETNAM_ADDRESS_API = 'https://provinces.open-api.vn/api/v2/?depth=2';
let cachedAddresses: Promise<VietnamProvince[]> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseAddresses(value: unknown): VietnamProvince[] {
  if (!Array.isArray(value)) throw new Error('API địa chỉ trả về dữ liệu không hợp lệ.');

  const provinces = value
    .filter(isRecord)
    .map((province) => ({
      code: Number(province.code),
      name: String(province.name || ''),
      division_type: String(province.division_type || ''),
      wards: Array.isArray(province.wards)
        ? province.wards.filter(isRecord).map((ward) => ({
            code: Number(ward.code),
            name: String(ward.name || ''),
            division_type: String(ward.division_type || ''),
            province_code: Number(ward.province_code || province.code),
          }))
        : [],
    }))
    .filter((province) => Number.isFinite(province.code) && province.name && province.wards.length > 0);
  if (provinces.length === 0) throw new Error('API địa chỉ chưa trả về danh sách tỉnh/thành và phường/xã.');
  return provinces;
}

export function fetchVietnamAddresses(): Promise<VietnamProvince[]> {
  if (!cachedAddresses) {
    cachedAddresses = fetch(VIETNAM_ADDRESS_API, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API địa chỉ phản hồi ${response.status}.`);
        return parseAddresses(await response.json());
      })
      .catch((error) => {
        cachedAddresses = null;
        throw error;
      });
  }
  return cachedAddresses;
}
