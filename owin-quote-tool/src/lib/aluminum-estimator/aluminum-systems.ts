export type AluminumProfileRow = {
  stt: number;
  code: string;
  description: string;
  image: string | null;
  defaultWeightKg: number | null;
  packageSize: number | null;
};

export type AluminumSystem = {
  id: string;
  name: string;
  customerName: string | null;
  color: string;
  rows: AluminumProfileRow[];
};

export type AluminumEstimatorDefaultRow = AluminumProfileRow & {
  rowId: string;
  systemId: string;
  systemName: string;
  color: string;
};

export function getAluminumProfileImageKey(systemId: string, row: Pick<AluminumProfileRow, "stt" | "code">): string {
  return `${systemId}:${row.stt}:${row.code}`;
}

const profile = (
  stt: number,
  code: string,
  description: string,
  packageSize: number | null,
): AluminumProfileRow => ({
  stt,
  code,
  description,
  image: null,
  defaultWeightKg: null,
  packageSize,
});

const RAW_ALUMINUM_SYSTEMS: AluminumSystem[] = [
  {
    id: "noi-that",
    name: "Nội thất",
    customerName: null,
    color: "Gỗ trắc",
    rows: [
      profile(1, "OWIN-NT01", "Trụ to", 4),
      profile(2, "OWIN-NT02", "Trụ nhỏ", 6),
      profile(3, "OWIN-NT03", "Trụ sau", 8),
      profile(4, "OWIN-NT04", "Khung bao ngang", 6),
      profile(5, "OWIN-NT06", "Cánh tủ", 6),
      profile(6, "OWIN-NT07", "Lá hộp dày", 5),
      profile(7, "OWIN-NT08", "Lá hộp mỏng", 5),
      profile(8, "OWIN-NT09", "Lá chớp", 5),
      profile(9, "OWIN-NT11", "Phào nhỏ", 6),
      profile(10, "OWIN-NT12", "Phào to", 4),
      profile(11, "OWIN-NT13", "U16", 30),
      profile(12, "OWIN-NT14", "Thanh ngăn kéo", 20),
      profile(13, "OWIN-NT05", "Khung bao tiết kiệm", 6),
      profile(14, "OWIN-NT10", "Bát chia ngăn", 8),
      profile(15, "OWIN-NT15", "Nan trang trí", 30),
    ],
  },
  {
    id: "xfa-owin",
    name: "Hệ XFA OWIN",
    customerName: "Anh",
    color: "Gỗ trắc",
    rows: [
      profile(1, "OWIN-C3328A", "Khung bao cửa đi", 4),
      profile(2, "OWIN-C3303A", "Cánh cửa đi mở ngoài", 3),
      profile(3, "OWIN-C3332A", "Cánh cửa đi mở trong", 3),
      profile(4, "OWIN-C3318", "Khung bao cửa sổ", 4),
      profile(5, "OWIN-C3202", "Cánh cửa sổ", 4),
      profile(6, "OWIN-C3313", "Đố chia khung", 4),
      profile(7, "OWIN-C3304A", "Thanh ngang dưới cánh cửa đi", 2),
      profile(8, "OWIN-C3209", "Khung bao vách", 4),
      profile(9, "OWIN-C3203", "Đố chia T", 4),
      profile(10, "OWIN-C3323", "Đố động dùng chung", 4),
      profile(11, "OWIN-C3295", "Sập cánh kính thường", 12),
      profile(12, "OWIN-C3286", "Sập cánh kính hộp", 12),
      profile(13, "OWIN-C3296B", "Sập vách cải tiến", 12),
      profile(14, "OWIN-C3296", "Sập khung vách", 12),
      profile(15, "OWIN-C3329", "Ốp chân cánh cửa đi", 10),
      profile(16, "OWIN-C3329LS", "Ốp chân cánh cửa đi", 10),
      profile(17, "OWIN-C3300", "I nối khung", 10),
      profile(18, "OWIN-C3208", "Đảo khung vách", 4),
      profile(19, "OWIN-C3326", "Chuyển góc 90", 4),
      profile(20, "OWIN-E1283A", "Khung bao chớp", 10),
      profile(21, "OWIN-E192", "Lá chớp", 10),
    ],
  },
  {
    id: "vat-canh",
    name: "Hệ vát cạnh",
    customerName: "Anh",
    color: "Gỗ trắc",
    rows: [
      profile(1, "OWIN-5101B", "Khung bao cửa", 4),
      profile(2, "OWIN-5201B", "Cánh cửa đi", 4),
      profile(3, "OWIN-5301B", "Cánh cửa sổ", 4),
      profile(4, "OWIN-5402", "Đố T", 4),
      profile(5, "OWIN-5503", "Ôp chân cánh", 10),
      profile(6, "OWIN-5505", "Sập vách", 16),
      profile(7, "OWIN-5403A", "Đố động", 4),
      profile(8, "OWIN-5517A", "Khung bao cửa lùa", 4),
      profile(9, "OWIN-5602A", "Cánh lùa", 4),
      profile(10, "OWIN-5603", "ÔP cánh lùa", 10),
      profile(11, "OWIN-5302A", "Đố ngang cửa đi", 4),
      profile(12, "OWIN-3300", "Nối khung", 10),
      profile(13, "OWIN-3326", "Cây bo góc", 4),
      profile(14, "OWIN-5604", "Cây đối đầu cửa lùa", 10),
      profile(15, "OWIN-5101 1-1", "Khung bao cửa", 4),
      profile(16, "OWIN-5542", "Cánh cửa đi không gân", 4),
      profile(17, "OWIN-5543", "Cánh cửa sổ không gân", 4),
    ],
  },
  {
    id: "thuy-luc",
    name: "Hệ thủy lực",
    customerName: "Anh",
    color: "Gỗ trắc",
    rows: [
      profile(1, "OWIN-67", "Khung bao 200", 1),
      profile(2, "OWIN-TL180", "Cánh 180 5m2", null),
      profile(3, "OWIN-TL180", "Cánh 180 4m8", null),
      profile(4, "OWIN-TL03", "Ôp cánh 5m2", null),
      profile(5, "OWIN-TL07", "Sập vách", 20),
      profile(6, "OWIN-TL06", "Đế vách kính thường", 10),
      profile(7, "OWIN-TL09", "Đế vách kính hộp", 10),
      profile(8, "OWIN-TLTP04", "Sập cánh kính thường", 1),
      profile(9, "OWIN-TLTP05", "Sập cánh kính hộp", 1),
      profile(10, "OWIN-KP03", "Phào", 10),
      profile(11, "OWIN-KP06", "Dãn phào", 10),
      profile(12, "OWIN-TL11", "Ke bắn khung bao", 6),
      profile(13, "OWIN-TL10", "Khung bao 120", 2),
      profile(14, "OWIN-TL02", "Cánh 150", 1),
      profile(15, "OWIN-67", "Khung bao 200 55X200", 1),
      profile(16, "OWIN-TL01", "Cánh 180 5m2", null),
      profile(17, "OWIN-TL01", "Cánh 180 4m8", null),
      profile(18, "OWIN-TL04", "Sập cánh kính thường", null),
      profile(19, "OWIN-TL05", "Sập cánh kính hộp", null),
    ],
  },
  {
    id: "lua-vip-70-90",
    name: "Hệ lùa VIP 70+90",
    customerName: "Anh",
    color: "Gỗ trắc",
    rows: [
      profile(1, "OWIN-KLV55", "Khung bao cửa lùa", 4),
      profile(2, "OWIN-CLV70", "Cánh lùa 70", 4),
      profile(3, "OWIN-OMV55", "Ốp móc lùa 70", 10),
      profile(4, "OWIN-RBCLV90", "Ray bằng cửa lùa", 5),
      profile(5, "OWIN-HCLV", "Đối đầu cửa lùa 4 cánh", 10),
      profile(6, "OWIN-CLV90", "Cánh lùa 90", 3),
      profile(7, "OWIN-OMV90", "Ốp móc 90", 10),
      profile(8, "OWIN-RAYINOX", "Ray inox", 20),
    ],
  },
  {
    id: "chan-song",
    name: "Hệ chấn song",
    customerName: null,
    color: "Gỗ trắc",
    rows: [
      profile(1, "OWIN-KP01", "Khung bao phào đơn", 2),
      profile(2, "OWIN-KP02", "Nối khung bao", 2),
      profile(3, "OWIN-3303 F16", "Cánh cửa đi mở ngoài bản 160", 1),
      profile(4, "OWIN-3332 F16", "Cánh cửa đi mở trong bản 160", 1),
      profile(5, "OWIN-C3295", "Sập cánh kính thường", 12),
      profile(6, "OWIN-C3296B", "Sập vách cải tiến", 12),
      profile(7, "OWIN-C3329LS", "Ốp chân cánh cửa đi", 10),
      profile(8, "OWIN-C3202 BL", "Cánh sổ bản 100", 2),
      profile(9, "OWIN-KP03N", "Phào", 10),
      profile(10, "OWIN-C3313", "Đố chia khung", 4),
      profile(11, "OWIN-CV15", "Nối hộp chia khung fix", 4),
      profile(12, "OWIN-H46X74", "Hộp chia khung bao đơn", 3),
      profile(13, "OWIN-H143X74", "Hộp chia khung bao kép", 1),
      profile(14, "OWIN-KP07", "Đố chia chấn song", 4),
      profile(15, "OWIN-C3286", "Sập cánh kính hộp", 12),
      profile(16, "OWIN-KP05", "Chấn song phi 25", 6),
      profile(17, "OWIN-C3323", "Đố động dùng chung", 4),
      profile(18, "OWIN-3303BL", "Cánh cửa đi mở ngoài bản 138", 2),
      profile(19, "OWIN-3332BL", "Cánh cửa đi mở trong bản 138", 2),
      profile(20, "OWIN-D150", "Cánh đi bo phào 150", 1),
      profile(21, "OWIN-CS100", "Cánh đi bo phào 100", 2),
      profile(22, "OWIN-DV 100", "Cánh cửa đi bản 100", 2),
      profile(23, "OWIN-KP08", "U bịt khung bao", 20),
      profile(24, "OWIN-KP09", "Coss chấn song phi 25", 6),
      profile(25, "OWIN-SV76", "Cánh cửa sổ bo bản 76", 4),
      profile(26, "OWIN-C3296", "Sập khung vách", 12),
      profile(27, "OWIN-H20X36", "Đố chia chấn song nhỏ", 10),
      profile(28, "OWIN-KP06", "Dãn phào", 10),
      profile(29, "OWIN-P50", "Phào nội thất", 10),
      profile(30, "OWIN-H150", "Hộp nối khung bao kép tiết kiệm", 2),
      profile(31, "OWIN-KP10", "Chấn song phi 30", 5),
      profile(32, "OWIN-KP11", "Coss chấn song phi", 6),
      profile(33, "OWIN-KP13", "Coss chấn song vuông", 6),
    ],
  },
];

const ALUMINUM_SYSTEM_ORDER = [
  "chan-song",
  "lua-vip-70-90",
  "thuy-luc",
  "vat-canh",
  "xfa-owin",
  "noi-that",
];

export const ALUMINUM_SYSTEMS: AluminumSystem[] = ALUMINUM_SYSTEM_ORDER.map<AluminumSystem | null>((systemId) => {
  const system = RAW_ALUMINUM_SYSTEMS.find((item) => item.id === systemId);
  if (!system) return null;

  return {
    ...system,
    rows: system.rows.map((row) => ({
      ...row,
      image: ALUMINUM_PROFILE_IMAGES[getAluminumProfileImageKey(system.id, row)] ?? row.image,
    })),
  };
}).filter((system): system is AluminumSystem => Boolean(system));

export function getAluminumSystemById(id: string): AluminumSystem | null {
  return ALUMINUM_SYSTEMS.find((system) => system.id === id) ?? null;
}

export function getDefaultAluminumEstimatorRows(systemId: string): AluminumEstimatorDefaultRow[] {
  const system = getAluminumSystemById(systemId);
  if (!system) return [];

  return system.rows.map((row) => ({
    ...row,
    rowId: `${system.id}-${row.stt}-${row.code.replaceAll(" ", "-")}`,
    systemId: system.id,
    systemName: system.name,
    color: system.color,
  }));
}
import { ALUMINUM_PROFILE_IMAGES } from "@/lib/aluminum-estimator/aluminum-profile-images.generated";
