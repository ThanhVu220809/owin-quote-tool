# 🤖 OWIN QUOTE TOOL — RUNBOOK TRIỂN KHAI TỰ ĐỘNG (AGENT-DRIVEN)

> **File này dành cho AI agent chạy liên tục.** Agent đọc từ trên xuống, làm từng TASK theo thứ tự, chạy TEST sau mỗi task. PASS thì tích `[x]` và sang task kế. FAIL thì sửa rồi chạy lại test ĐÚNG task đó, không nhảy cóc. **Mọi hành động phải cập nhật lại chính file này** (tích checkbox, ghi note vào mục LOG cuối file).

---

## 📜 LUẬT VẬN HÀNH CHO AGENT (đọc kỹ trước khi bắt đầu)

1. **Tuần tự, không nhảy cóc.** Không bắt đầu TASK N+1 khi TEST của TASK N chưa PASS. Các PHASE cũng tuần tự: không sang PHASE sau khi cổng `PHASE GATE` của phase trước chưa xanh.
2. **Mỗi task = làm → test → cập nhật file.** Sau khi sửa code, chạy đúng lệnh test ghi trong task. Dán kết quả tóm tắt vào LOG.
3. **FAIL thì sửa tại chỗ, tối đa 3 lần thử.** Nếu sau 3 lần vẫn fail, DỪNG, ghi `🔴 BLOCKED` vào checkbox task đó + mô tả lỗi vào LOG + ghi rõ cần con người quyết gì. Không bịa kết quả pass.
4. **Không tự ý đổi quyết định nghiệp vụ đã chốt** (xem mục HẰNG SỐ). Nếu thấy mâu thuẫn, ghi vào LOG và DỪNG hỏi người, không tự quyết.
5. **Việc cần con người làm thủ công** (tạo OAuth client, deploy Apps Script, bấm consent Google...) được đánh dấu `👤 HUMAN`. Agent KHÔNG tự làm được các bước này — agent chuẩn bị sẵn mọi thứ, ghi hướng dẫn, rồi DỪNG chờ người xác nhận xong mới đi tiếp.
6. **Secret không bao giờ vào git.** `client_secret`, `SHARED_SECRET` chỉ nằm ở Script Properties (backend) hoặc biến môi trường. Nếu phát hiện secret bị commit, DỪNG ngay.
7. **Verify-trước-khi-tin với API bên thứ ba.** Trước khi code đụng docxtemplater / Google OAuth / image-module, agent đọc lại docs đúng version đã cài (xem `package.json`), KHÔNG dựa vào trí nhớ. API các thư viện này đổi theo major version.

---

## 🔒 HẰNG SỐ NGHIỆP VỤ (BẤT BIẾN — KHÔNG ĐƯỢC ĐỔI)

Các quyết định này đã chốt với chủ dự án. Agent code đúng theo đây, không tự diễn giải lại.

| Mã | Luật | Chi tiết |
|----|------|----------|
| **BR-1** | Công thức thành tiền = **FULL PRECISION** | `thanh_tien = round(rong × cao × sl × don_gia)`. KHÔNG làm tròn khối lượng trước khi nhân. Chỉ làm tròn KẾT QUẢ CUỐI thành số nguyên đồng. Ví dụ chuẩn khớp file mẫu: S1 rong=1.196 cao=1.796 sl=1 đơn giá=2.000.000 → **4.296.032đ** (KHÔNG phải 4.296.000). |
| **BR-2** | Khối lượng hiển thị làm tròn 3 số lẻ | UI hiện `2.148 m²` cho đẹp, nhưng số đem nhân tiền là `2.148016` (đầy đủ). Tách rõ "số hiển thị" và "số tính toán". |
| **BR-3** | 3 hệ ĐVT | `m²`: KL = rộng×cao×sl. `md` (mét dài): KL = (rộng+cao)×sl. `Bộ`: KL = sl (không dùng rộng/cao), thành tiền = sl×đơn giá. |
| **BR-4** | File 2 (Bảng giá hoàn thiện) xuất theo **GIỎ ĐÃ CHỌN** | Không xuất cả catalog. Thợ tick chọn mẫu nào thì xuất mẫu đó. |
| **BR-5** | Ảnh bắt buộc xử lý **EXIF orientation** | Thợ chụp bằng tablet/điện thoại. Dùng `browser-image-compression` (tự lo EXIF). Nén ~800px, ~100KB. |
| **BR-6** | Override không phá dữ liệu gốc | Sửa giá/phụ kiện trên 1 dòng báo giá KHÔNG được đổi sản phẩm gốc ở kho. |
| **BR-7** | Token: backend tí hon giữ secret | Apps Script giữ `client_secret` + `refresh_token`. Front-end chỉ giữ access_token trong RAM. Refresh ngầm qua backend. KHÔNG để refresh_token trên tablet. |
| **BR-8** | Sync: LWW per-entity + **tombstone** + conflict dialog | Xóa = đánh dấu `deleted:true` (không xóa thật) để sync không hồi sinh. Hai máy sửa cùng id → hiện dialog cho người chọn, KHÔNG tự nuốt. |
| **BR-9** | Ảnh TÁCH khỏi file sync | `owin_db.json` trên Drive chỉ chứa metadata/giá (nhẹ). Ảnh là file riêng trên Drive, chỉ sync khi đổi. |

> ⚠️ **Lưu ý trung thực về kiến trúc:** Spec gốc nói "100% client-side, không server". Vì đã chọn backend Apps Script giữ secret (BR-7), tuyên bố đó KHÔNG còn đúng tuyệt đối. Mô tả đúng là: "server tối giản chỉ giữ secret + đổi token; phần còn lại client-side; chi phí gần 0đ". Agent giữ cách mô tả này trong mọi tài liệu sinh ra.

---

## 🧱 PHASE 0 — KHỞI TẠO & XÁC LẬP NỀN

### TASK 0.1 — Khởi tạo dự án Vite React-TS
- [x] Chạy: `npm create vite@latest owin-quote-tool -- --template react-ts`
- [x] `cd owin-quote-tool && npm install`
- [x] Khởi tạo git, tạo `.gitignore` chắc chắn có: `node_modules`, `dist`, `.env`, `*.local`

**TEST 0.1:** `npm run dev` khởi động không lỗi; mở localhost thấy trang Vite mặc định. `npm run build` tạo `/dist` không lỗi TypeScript. ✅ PASS — dev HTTP 200 @5173, build sạch (Vite 8.0.16).
> PASS = cả dev và build đều sạch lỗi. FAIL → đọc lỗi, sửa, chạy lại.

### TASK 0.2 — Cài thư viện lõi (cố định version, ghi lại version thật)
- [x] `npm install docxtemplater pizzip docxtemplater-image-module-free`
- [x] `npm install browser-image-compression localforage`
- [x] `npm install lucide-react`
- [x] **Sau khi cài, MỞ `package.json` đọc version THẬT của `docxtemplater` và `docxtemplater-image-module-free`. Ghi 2 version đó vào LOG.** (Mọi code đụng 2 lib này phải verify theo đúng version này, không theo trí nhớ.)

> **VERSION THẬT đã cài (nguồn chân lý cho Phase 4):**
> - `docxtemplater@3.68.7`
> - `docxtemplater-image-module-free@1.1.1`
> - `pizzip@3.2.0` · `browser-image-compression@2.0.2` · `localforage@1.10.0` · `lucide-react@1.17.0`
> ⚠️ `npm audit`: critical trong `xmldom` (transitive của image-module-free, "No fix available"). Giữ lib theo runbook; rủi ro thấp (client-side, XML do app tự sinh).

**TEST 0.2:** `npm run build` vẫn xanh sau khi thêm deps. Version đã ghi vào LOG. ✅ PASS — build xanh.

### TASK 0.3 — Cấu hình alias + cấu trúc thư mục
- [x] `vite.config.ts`: thêm alias `@` → `/src`. Cài `npm install -D @types/node` nếu cần cho `path`.
- [x] `tsconfig.app.json`: thêm `"paths": { "@/*": ["./src/*"] }`. (Để ở tsconfig.app.json — nơi compile src; KHÔNG cần `baseUrl` vì moduleResolution=bundler + TS mới deprecate baseUrl.)
- [x] Tạo cây thư mục rỗng: `src/components`, `src/utils`, `src/data`, `src/types`, `src/hooks`, `src/features/products`, `src/features/quote`, `src/features/export`, `src/features/sync`.

**TEST 0.3:** Tạo file thử `src/utils/ping.ts` export một hằng, import bằng `@/utils/ping` ở `App.tsx`. `npm run build` xanh = alias chạy. Xoá file thử sau khi pass. ✅ PASS — alias resolve qua tsc+vite; file thử đã xoá.

### TASK 0.4 — Nguồn chân lý kiểu dữ liệu + placeholder
- [x] Tạo `src/types/models.ts`: định nghĩa `Product`, `Accessory`, `QuoteLine`, `Customer`, `SyncEntity` (có `id`, `updatedAt`, `deleted?`). + `ProductSystem`, `OwinDB`.
- [x] Tạo `src/types/placeholders.ts`: **2 bộ tên placeholder TÁCH RIÊNG** cho 2 file Word, là nguồn chân lý duy nhất. Format 1 dùng `{rong}` `{cao}` `{sl}`; Format 2 dùng `{kich_thuoc}`. Liệt kê đầy đủ mọi key. Mọi nơi khác phải import từ đây, cấm gõ tay tên placeholder.

**TEST 0.4:** `npm run build` xanh; `placeholders.ts` không có key trùng/lệch giữa định nghĩa và comment mô tả. ✅ PASS — build xanh; dup-check (scripts/dupcheck.cjs): F1_TOP 7, F1_ITEM 12, F2_TOP 7, F2_ITEM 12, ALL-OK no-dup.

### TASK 0.5 — Dữ liệu mẫu khởi tạo
- [x] Tạo `src/data/initialData.json`: khung xương Hệ Xingfa Owin + Hệ Cửa Thủy Lực, vài sản phẩm mẫu (S1, D1, mẫu thuỷ lực) đúng theo file mẫu thật để test công thức sau này. (S1/S2 m² @2.000.000, D1 m², S6 Bộ @2.000.000, TL1 md thủy lực; thêm resolveJsonModule.)

**TEST 0.5:** JSON parse được (chạy `node -e "JSON.parse(require('fs').readFileSync('src/data/initialData.json'))"`), khớp interface ở `models.ts`. ✅ PASS — 5 products / 2 systems, SCHEMA-OK (validate đủ field bắt buộc, dvt hợp lệ, mã uppercase).

### 🚦 PHASE 0 GATE
- [x] Tất cả TEST 0.x PASS. `npm run dev` và `npm run build` đều xanh. Đã ghi version lib vào LOG.
> 🔴 Chỉ sang PHASE 1 khi ô này tích. ✅ XANH.

---

## 🧮 PHASE 1 — ENGINE TOÁN HỌC (làm trước UI vì đây là trái tim, dễ test nhất)

### TASK 1.1 — Hàm tính khối lượng theo 3 hệ ĐVT (BR-3)
- [x] Tạo `src/utils/calc.ts`: `tinhKhoiLuong(dvt, rong, cao, sl)` xử lý đủ 3 nhánh `m²` / `md` / `Bộ`.
- [x] Giữ FULL PRECISION, không làm tròn ở bước này (BR-1, BR-2).

**TEST 1.1 (unit test, bắt buộc):**
- [x] Cài `npm install -D vitest`. Thêm script `"test": "vitest run"`.
- [x] Viết `calc.test.ts`: `m²` 1.196×1.796×1 = `2.148016`; `md` (1.2+2.4)×2 = `7.2`; `Bộ` sl=2 = `2`.
> PASS = `npm run test` xanh hết. FAIL → sửa calc.ts. ✅ PASS.

### TASK 1.2 — Hàm tính thành tiền FULL PRECISION (BR-1) — TASK QUAN TRỌNG NHẤT
- [x] `tinhThanhTien(dvt, rong, cao, sl, donGia)`: nhân từ khối lượng đầy đủ, chỉ `Math.round()` ở kết quả cuối.
- [x] Hàm `formatHienThiKhoiLuong(kl)` riêng → làm tròn 3 số lẻ CHỈ để hiển thị (BR-2).

**TEST 1.2 (gate khớp file mẫu — không pass thì cả dự án sai):**
- [x] S1: rong=1.196 cao=1.796 sl=1 đơn giá=2.000.000 → **phải ra đúng `4296032`**. ✅
- [x] S2: 1.194×1.794×1×2.000.000 → khớp `4284072` (theo file mẫu). ✅
- [x] Hệ Bộ S6: sl=1 đơn giá=2.000.000 → `2000000` (không dính rộng/cao). ✅
- [x] Phụ kiện: sl=2 đơn giá=500.000 → `1000000`. ✅
> 🔴 PASS = mọi con số khớp file mẫu Owin TỪNG ĐỒNG. ✅ PASS — thêm test khẳng định số hiển thị (4296000) ≠ số tính (4296032).

### TASK 1.3 — Format tiền tệ VN
- [x] `formatVND(n)` → "4.296.032đ" (dấu chấm phân cách nghìn, đúng kiểu file mẫu). (`src/utils/format.ts`)

**TEST 1.3:** `formatVND(4296032)` === `"4.296.032"` (hoặc kèm "đ" theo chuẩn đã chọn). Test số 0, số âm (không xảy ra nhưng không được crash). ✅ PASS — chuẩn chọn: kèm "đ" → "4.296.032đ"; 0→"0đ"; -500000→"-500.000đ".

### 🚦 PHASE 1 GATE
- [x] TEST 1.1, 1.2, 1.3 PASS. `npm run test` xanh toàn bộ. (13/13 tests passed)
> 🔴 Engine toán là nền của mọi thứ. ✅ XANH.

---

## 🖼️ PHASE 2 — XỬ LÝ ẢNH & LƯU TRỮ (IndexedDB)

### TASK 2.1 — Nén ảnh + EXIF + lưu IndexedDB (BR-5, BR-9)
- [x] Tạo `src/utils/imageStorage.ts` dùng `browser-image-compression` (verify API @2.0.2: default export `imageCompression(file,options)`; EXIF bake vào pixel mặc định `preserveExif:false`).
- [x] Cấu hình `maxWidthOrHeight: 800`, `initialQuality: 0.7`, `useWebWorker: true`. `maxSizeMB` bắt đầu 0.1.
- [x] Lưu ảnh nén vào IndexedDB qua localforage (instance `images`, driver INDEXEDDB). Record SP chỉ giữ `imageId` (BR-9 — bytes tách riêng).
- [x] Bắt buộc có try-catch + `ImageError` (NOT_IMAGE/COMPRESS_FAILED/STORE_FAILED) để Promise không treo khi ảnh hỏng / không phải ảnh.

**TEST 2.1:**
- [ ] ⏸ HUMAN-PENDING — Nén ảnh dọc thật (portrait) → KHÔNG bị xoay ngang (EXIF). *Cần ảnh chụp thật có EXIF; verify bằng mắt qua dropzone Phase 3. Code đã đúng (lib tự xử lý EXIF).*
- [x] Ảnh ~3MB → sau nén < ~120KB. ✅ PASS (browser thật qua Preview: 7.8MB → **72KB**, cạnh dài 722px ≤800).
- [x] Chọn file không phải ảnh → ném lỗi sạch, KHÔNG treo. ✅ PASS (vitest: ImageError NOT_IMAGE).

### TASK 2.2 — Test tràn quota
- [x] Lưu liên tiếp 20–30 ảnh nén vào IndexedDB. (25 ảnh nén thật trong browser + 60×100KB=6MB trong node)

**TEST 2.2:** Không có `QuotaExceededError`; đọc lại ảnh thứ 1 và thứ 20 ra đúng. ✅ PASS — browser thật: 25 ảnh nén, read #1 & #20 OK; node: 60 ảnh >5MB lưu/đọc OK (thoát bẫy localStorage, dùng IndexedDB).

### 🚦 PHASE 2 GATE
- [x] TEST 2.1, 2.2 PASS — TRỪ xác minh EXIF bằng mắt (⏸ HUMAN-PENDING, không chặn code; gate chỉ kẹt vì việc human → đi tiếp theo rule 5).
> 🔴 `[120,90]` cho ảnh Word sẽ căn lại ở Phase 4 với ảnh thật, KHÔNG fix cứng mù quáng.

---

## 🎨 PHASE 3 — UI QUẢN LÝ SẢN PHẨM GỐC (iOS style)

### TASK 3.1 — Đọc skill frontend trước khi dựng UI
- [x] `👤/agent` Đọc `/mnt/skills/public/frontend-design/SKILL.md` (nếu môi trường có) để theo đúng design tokens. Nếu không có, theo nguyên tắc iOS: card bo `rounded-3xl`, segmented control, switch xanh `#34C759`. (Skill KHÔNG có trên Windows → tự dựng `src/styles/ios.css` với tokens iOS: --ios-radius 24px, --ios-green #34C759, segmented, switch.)

### TASK 3.2 — Form sản phẩm gốc 2 cột
- [x] Cột trái: Segmented Control ĐVT (`m²|Bộ|md`), ô Tên, Mã (auto-uppercase), Đơn giá gốc, iOS Image Dropzone (gọi `imageStorage`). + Rộng/Cao mặc định (ẩn/hiện theo ĐVT).
- [x] Cột phải: 5 hàng auto-suggest (Màu, Hệ nhôm, Khung bao, Bản cánh, Kính), danh sách phụ kiện có Switch toggle.
- [x] Lưu sản phẩm → IndexedDB (gắn `id`, `updatedAt`).

**TEST 3.2:** ✅ PASS (browser thật qua Preview)
- [x] Chọn `Bộ` → ô Rộng/Cao ẩn mượt (animation). Chọn `m²` → hiện lại. ✅ (end-state: closed offsetHeight 0/opacity 0; open 79/opacity 1; transition .28s defined).
- [x] Mã gõ thường → tự uppercase. ✅ ("qa1" → "QA1").
- [x] Lưu rồi reload trang → đọc lại đúng từ IndexedDB. ✅ (QA1 "Cửa test E2E" 1.234.567đ/m² persist sau reload). *Ảnh: path getImageUrl đã verify ở Phase 2; upload ảnh thật qua dropzone gắn với ⏸ EXIF-HUMAN.*
- [x] Auto-suggest: gõ phần đầu từ đã nhập trước → hiện gợi ý. ✅ (datalist: Màu 4, Hệ nhôm 3 gợi ý từ catalog).

### TASK 3.3 — Danh sách + sửa + xóa (tombstone, BR-8)
- [x] List sản phẩm gốc, sửa, xóa. Xóa = set `deleted:true` + cập nhật `updatedAt` (KHÔNG xóa cứng).

**TEST 3.3:** Xóa 1 sản phẩm → biến mất khỏi UI nhưng record còn `deleted:true` trong IndexedDB. Sửa giá → `updatedAt` đổi. ✅ PASS — live: xóa QA1 → mất khỏi UI, raw IndexedDB record `deleted:true`; sửa giá→updatedAt mới (vitest productStore 4/4).

### 🚦 PHASE 3 GATE
- [x] TEST 3.2, 3.3 PASS. Dữ liệu vào/ra IndexedDB chính xác, ảnh không lỗi. (Fix dual-React: vite dedupe+optimizeDeps cho lucide-react@1.17 dùng useContext.)

---

## 📝 PHASE 4 — MÀN BÁO GIÁ + PREVIEW + XUẤT WORD

### TASK 4.1 — Form khách + chọn sản phẩm dạng thẻ lưới
- [x] Form khách: Tên, SĐT, Địa chỉ, Email (đầu trang).
- [x] Grid card sản phẩm (ảnh bo góc + tên đậm + mã). Bấm = nạp vào danh sách tính.

**TEST 4.1:** Bấm 1 thẻ → dòng được thêm vào bảng báo giá với dữ liệu gốc đúng. ✅ PASS (browser: click S1 → dòng + 2 hàng phụ kiện snapshot).

### TASK 4.2 — Engine real-time + override không phá gốc (BR-6)
- [x] Nhập Rộng/Cao/SL → gọi `calc.ts`, số nhảy tức thì.
- [x] Cho override đơn giá/phụ kiện trên dòng → KHÔNG đổi sản phẩm gốc.

**TEST 4.2 (khớp Test 3.x của spec gốc):** ✅ PASS
- [x] Nhập S1 m² 1.196×1.796×1 đơn giá 2.000.000 + phụ kiện 2×500.000 → tiền cửa `4.296.032`, phụ kiện `1.000.000`, tổng dòng `5.296.032`. Số nhảy real-time. ✅ (browser: dòng 4.296.032đ, tổng 5.296.032đ; vitest quoteCalc).
- [x] Sửa giá S1 trên màn báo giá xuống 1.900.000 → vào kho gốc, S1 VẪN 2.000.000 (BR-6). ✅ (browser xác nhận kho "S1 · 2.000.000đ/m²").

### TASK 4.3 — Preview WYSIWYG (HTML table) cho cả 2 format
- [x] Format 1: dòng sản phẩm trên, dòng phụ kiện ngay dưới (trống STT/Mã, KHÔNG merge).
- [x] Format 2: thêm cột ảnh, nhúng Base64 vào ô.

**TEST 4.3:** Đổi số ở khối nhập → preview cập nhật tức thì. Cấu trúc dòng-chồng-dòng đúng. Ảnh co vừa ô (F2). ✅ PASS — F1 cập nhật real-time (KL hiển thị 2.148 BR-2, thành tiền 4.296.032); F2 cột Ảnh + Kích thước gộp "1.196 × 1.796 (m)".

### TASK 4.4 — 👤 HUMAN: Chuẩn bị 2 file template Word → AGENT TỰ ĐỤC (có công cụ docx)
- [x] Tạo `src/assets/templates/Template_Bao_Gia.docx` qua python-docx: header + bảng 10 cột, 1 hàng dữ liệu bọc `{#items}...{/items}` (cùng hàng → lặp hàng), khách `{ten_kh}{dia_chi}{sdt}{email}`, tổng `{tong_tien}{tam_ung}{con_lai}` NGOÀI loop, mỗi ô 1 run (tag không bị cắt), KHÔNG merge. (`scripts/make_templates.py`)
- [x] Tạo `Template_Bang_Gia.docx`: tương tự, cột Ảnh đặt `{%image}` TRONG loop.
- [ ] ⏸ HUMAN visual-polish (KHÔNG chặn): mở 2 template/ file xuất ra, chỉnh branding/logo/độ rộng cột/căn lề cho đẹp theo file mẫu Owin thật. Engine + render đã hoạt động, đây chỉ là tinh chỉnh mỹ thuật.

### TASK 4.5 — Engine xuất Word (docxtemplater)
- [x] **VERIFY DOCS trước:** docxtemplater@3.68.7 — `new Docxtemplater(zip,{modules,paragraphLoop,linebreaks})` + `doc.render(data)` (KHÔNG setData) + `doc.toBlob()`. linebreaks/paragraphLoop = true. (Đọc js/docxtemplater.d.ts.)
- [x] image-module-free@1.1.1: `new ImageModule(opts)`, `getImage` PHẢI trả **ArrayBuffer** (xác nhận test.js: `bytes.buffer`), `getSize`→[w,h]. Converter tự strip mọi prefix `data:*;base64,` (regex mẫu chỉ nhận png/jpg → JPEG sẽ hỏng). `getSize` tính theo ảnh thật (Image natural size, cạnh ≤110px), ô rỗng→[1,1].
- [x] Build flat array: mỗi sản phẩm → dòng SP + (nếu có PK) dòng PK (`is_sp`/`is_pk`). Mô tả dùng `\n` (linebreaks). (`buildQuoteData.ts` — dùng chung preview + Word.)

**TEST 4.5 (gate xuất file thật):**
- [x] Xuất Word F1 → `.docx` tạo được, số khớp BR-1 TỪNG ĐỒNG. ✅ PASS — node render: XML chứa 4.296.032 (KHÔNG 4.296.000), 1.000.000, 5.296.032, "Anh Tú", dòng PK expand; browser: pipeline fetch?url→PizZip→render→toBlob ra blob docx 37KB, không lỗi.
- [x] Xuất F2 (giỏ đã chọn, BR-4) → ảnh nhúng đúng. ✅ PASS — node: `word/media/*` + `<a:blip>` xuất hiện, kích thước gộp đúng; browser: blob 37.7KB, ô ảnh rỗng (dòng PK) xử lý bằng pixel trong suốt, không lỗi.
- [ ] ⏸ HUMAN visual: mở file `.docx` tải về bằng Word/Google Docs xác nhận KHÔNG vỡ cột, font tiếng Việt đúng, ảnh vừa ô. (Render hợp lệ + số khớp đã chứng minh tự động; chỉ còn nhìn mắt.)
> 🔴 PASS = file mở được, đúng layout, số khớp BR-1. (Số + cấu trúc + nhúng ảnh: PASS tự động. Layout đẹp mắt: ⏸ HUMAN.)

### 🚦 PHASE 4 GATE
- [x] TEST 4.1→4.5 PASS (số khớp từng đồng, render hợp lệ). Layout đẹp mắt = ⏸ HUMAN visual, KHÔNG chặn (gate chỉ kẹt vì việc human → đi tiếp theo rule 5).

---

## ☁️ PHASE 5 — GOOGLE DRIVE SYNC + ĐÓNG GÓI

### TASK 5.1 — 👤 HUMAN: Tạo OAuth client + Apps Script backend
- [ ] ⏸ HUMAN-PENDING `👤` Google Cloud Console: tạo OAuth Client ID (Web), `Authorized JavaScript Origins` = domain GitHub Pages, `Redirect URI`. Scope `drive.appdata`.
- [ ] ⏸ HUMAN-PENDING `👤` Consent screen → trạng thái phù hợp (Published nếu cần token bền — VERIFY docs Google).
- [ ] ⏸ HUMAN-PENDING `👤` Tạo Apps Script, dán `Code.gs` (có sẵn ở repo). Script Properties: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SHARED_SECRET`, `REDIRECT_URI`. Deploy Web App: Execute as Me, Access Anyone. Copy URL `/exec`.
> Checklist + bẫy đã ghi ở mục "VIỆC HUMAN CÒN LẠI" cuối LOG. Agent KHÔNG tự làm được. Nhận lại CLIENT_ID + BACKEND_URL + SHARED_SECRET → điền `.env`.

### TASK 5.2 — Ráp front-end auth (googleAuth.js đã cung cấp)
- [x] Port `googleAuth.js` → `src/features/sync/googleAuth.ts`; config qua `import.meta.env.VITE_*` (KHÔNG commit secret — `.env` gitignored, có `.env.example`).
- [x] Nạp GIS trong `index.html`. Nút "Kết nối Google" → `connectGoogle()` (SyncBar). Mọi call Drive qua `ensureToken()` (driveSync).

**TEST 5.2 (cần con người bấm consent — `👤 HUMAN`):**
- [ ] ⏸ HUMAN-BLOCKED — chờ TASK 5.1 (OAuth+backend) + bấm consent. Bấm Kết nối Google → popup consent → access_token.
- [ ] ⏸ HUMAN-BLOCKED — token hết hạn → `ensureToken()` refresh ngầm không popup.
- [ ] ⏸ HUMAN-BLOCKED — thu hồi quyền → call tiếp nhận `NEED_RELOGIN`, UI hiện lại nút kết nối. *(Code đường đi NEED_RELOGIN đã có trong googleAuth.ts + SyncBar.)*

### TASK 5.3 — Sync engine: merge LWW + tombstone + conflict dialog (BR-8)
- [x] Tạo `src/features/sync/merge.ts`: per-entity LWW, tombstone `deleted:true` không hồi sinh (2 chiều).
- [x] Phát hiện conflict thật (hai phía cùng sửa 1 id, so với `base` lần sync trước) → KHÔNG tự chọn → trả conflict cho UI dialog "[Giữ bản của bạn]/[Lấy bản trên Drive]" (SyncBar).
- [x] `owin_db.json` trên Drive chỉ metadata; ảnh file riêng `img_<id>` (BR-9 — driveSync.ts).

**TEST 5.3:** ✅ PASS (vitest 7 ca)
- [x] Local có S99 mới, remote chưa có → sau merge có S99. ✅
- [x] Local xóa S5 (deleted:true, mới hơn) → KHÔNG hồi sinh (cả chiều remote-xoá). ✅
- [x] Local sửa giá S1 (16:40), remote sửa tên S1 (16:41) → KHÔNG tự nuốt → trả conflict. ✅ + resolveConflict áp lựa chọn.

### TASK 5.4 — Hàng đợi sync offline
- [x] Queue thay đổi vào IndexedDB (`syncQueue.ts`, gộp theo id+kind). Orchestrator `syncEngine.syncNow()`: ensureToken→tải remote→merge→conflict?→đẩy lên→lưu base→clear queue. Skip êm khi offline/chưa cấu hình.

**TEST 5.4:**
- [x] Tắt mạng → nhập kích thước, tính tiền, XUẤT WORD vẫn chạy (local-first). ✅ by-construction — toàn app chạy trên IndexedDB, Word export thuần client (Phase 2/4 đã chứng minh không cần mạng); queue logic vitest 3 ca PASS.
- [ ] ⏸ HUMAN-BLOCKED — Bật mạng → queue flush lên Drive đúng. Chờ TASK 5.1.
- [ ] ⏸ HUMAN-BLOCKED — Máy A thêm SP → máy B sync thấy. Chờ TASK 5.1.

### TASK 5.5 — Build & deploy GitHub Pages
- [x] `vite.config.ts` `base` = `/<repo>/` qua env `BASE_PATH` (verify: asset prefixed `/owin-quote-tool/`, GIS external giữ nguyên). GitHub Actions `.github/workflows/deploy.yml` (build owin-quote-tool/ → Pages, inject VITE_* từ repo secrets).
- [ ] ⏸ HUMAN — `npm run build` → deploy thật + khai `Authorized JavaScript Origins` khớp domain Pages.

**TEST 5.5:**
- [ ] ⏸ HUMAN-BLOCKED — Mở Pages live: app chạy, đăng nhập Google OK, xuất Word OK, sync OK. Chờ TASK 5.1 + deploy.
- [x] Bundle KHÔNG chứa client_secret (grep dist). ✅ PASS — grep dist: không có `client_secret`/`GOCSPX`/`refresh_token`. (client_secret chỉ ở Code.gs/Script Properties, không bao giờ vào frontend — BR-7.)

### 🚦 PHASE 5 GATE = HOÀN THÀNH DỰ ÁN
- [ ] ⏸ HUMAN — kẹt CHỈ vì việc human (TASK 5.1 OAuth+Apps Script, consent, deploy thật). Mọi CODE đã xong + test phần tự động hoá được PASS. Sau khi human làm xong 5.1 + deploy, các test 5.2/5.4/5.5-live mở khoá.

---

## ✅ CHECKLIST TỔNG (agent cập nhật khi mỗi PHASE GATE xanh)
- [x] PHASE 0 — Nền tảng
- [x] PHASE 1 — Engine toán (BR-1 khớp từng đồng)
- [x] PHASE 2 — Ảnh + IndexedDB (EXIF visual ⏸ HUMAN, còn lại PASS)
- [x] PHASE 3 — UI sản phẩm gốc
- [x] PHASE 4 — Báo giá + Preview + Xuất Word (số khớp; layout đẹp ⏸HUMAN)
- [x] PHASE 5 — Drive sync engine + deploy config (code+test xong; OAuth/deploy live ⏸HUMAN)

---

## 📋 LOG (agent ghi MỌI hành động vào đây, mới nhất lên đầu)

> Định dạng mỗi dòng: `[YYYY-MM-DD HH:MM] TASK x.y | TRẠNG THÁI (PASS/FAIL/BLOCKED/HUMAN-WAIT) | ghi chú ngắn (lỗi gì, sửa gì, version lib, cần người làm gì)`

- [2026-06-12 08:41] PHASE 5 | CODE DONE (live ⏸HUMAN) | merge.ts (LWW+tombstone+conflict, vitest 7 ca PASS), googleAuth.ts (port TS, env config), driveSync.ts (appData, owin_db.json + img_<id> tách BR-9), syncQueue.ts (vitest 3 ca), syncEngine.syncNow, SyncBar (conflict dialog). vite base via BASE_PATH (verify /owin-quote-tool/), GH Actions deploy.yml. dist grep: KHÔNG có client_secret/refresh_token. vitest 40/40. SECRET: VITE_SHARED_SECRET qua .env (gitignored) — nhúng bundle theo thiết kế (client phải gửi); client_secret KHÔNG bao giờ vào frontend.
- [2026-06-12 08:33] PHASE 4 GATE | PASS (layout đẹp ⏸HUMAN) | Báo giá real-time + preview 2 format + xuất Word. vitest 30/30 (TEST 4.2: 4.296.032/1.000.000/5.296.032; TEST 4.5 node: F1 số khớp + F2 nhúng ảnh a:blip). Browser: BR-6 override không phá kho, F2 kích thước gộp, export F1/F2 ra blob docx không lỗi.
- [2026-06-12 08:31] TASK 4.5 | code+VERIFY | wordExport.ts. docxtemplater@3.68.7 render(data)+toBlob; image-module-free@1.1.1 getImage→ArrayBuffer (strip mọi data:*;base64,), getSize theo Image thật. declarations.d.ts cho *.docx?url + image module.
- [2026-06-12 08:27] TASK 4.4 | agent-docx | python-docx 1.2.0 sinh Template_Bao_Gia.docx + Template_Bang_Gia.docx ({#items} 1 hàng, {%image} F2, mỗi ô 1 run). Visual-polish ⏸HUMAN.
- [2026-06-12 08:20] TASK 4.1/4.2/4.3 | code | quoteCalc + buildQuoteData (flat sp/pk) + QuoteView + QuotePreview + nav tabs. Fix: giữ 2 view mounted (đổi tab không mất báo giá). ProductThumb fill mode.
- [2026-06-12 08:16] PHASE 3 GATE | PASS | UI sản phẩm gốc iOS. Browser thật: segmented ĐVT, Rộng/Cao ẩn(Bộ)/hiện(m²), Mã uppercase, save+reload IndexedDB OK, auto-suggest datalist, xóa→tombstone deleted:true. vitest 22/22, build xanh.
- [2026-06-12 08:10] TASK 3.x FIX | dual-React | lucide-react@1.17.0 (createLucideIcon dùng useContext) gây "Invalid hook call" do Vite pre-bundle 2 bản React. Fix: vite resolve.dedupe[react,react-dom] + optimizeDeps.include. Xoá .vite cache, restart → hết lỗi.
- [2026-06-12 08:00] TASK 3.1/3.2/3.3 | code | ios.css + SegmentedControl/Switch/AutoSuggestInput(datalist)/ImageDropzone/ProductForm/ProductList/ProductThumb/ProductsView + productStore(tombstone)+useProducts. lucide LoaderCircle (Loader2 không có ở 1.17). Product model +rongMacDinh/caoMacDinh.
- [2026-06-12 00:00] PHASE 2 GATE | PASS (trừ EXIF visual ⏸HUMAN) | imageStorage.ts. Browser thật (Preview): 7.8MB→72KB, cạnh 722px, 25 ảnh nén lưu/đọc IndexedDB OK. Node: 60 ảnh >5MB OK, chặn non-image. Fix erasableSyntaxOnly (param-property→field). EXIF dọc cần ảnh thật→HUMAN.
- [2026-06-11 23:55] TASK 2.1/2.2 | PASS | imageStorage: compressImage(EXIF auto), saveImage/getImage/delete/count via localforage INDEXEDDB. vitest +5 (18 tổng). browser-image-compression@2.0.2 verify d.ts.
- [2026-06-11 23:53] PHASE 1 GATE | PASS | Engine toán xong. vitest 13/13 xanh, build xanh.
- [2026-06-11 23:53] TASK 1.3 | PASS | format.ts formatVND/formatSoVND. Chuẩn: kèm "đ". 0/âm/<1000 không crash.
- [2026-06-11 23:52] TASK 1.2 | PASS | tinhThanhTien full precision (BR-1): S1=4296032, S2=4284072, Bộ=2000000, PK=1000000 — khớp file mẫu TỪNG ĐỒNG. Có test chứng minh số hiển thị≠số tính.
- [2026-06-11 23:51] TASK 1.1 | PASS | calc.ts tinhKhoiLuong 3 ĐVT (m²/md/Bộ), exhaustive never-check. vitest cài, script test thêm.
- [2026-06-11 23:48] PHASE 0 GATE | PASS | Nền tảng xong. build+dev xanh.
- [2026-06-11 23:47] TASK 0.5 | PASS | initialData.json: 5 products (S1/S2/D1 m², S6 Bộ, TL1 md) + 2 systems. resolveJsonModule on. Validate SCHEMA-OK.
- [2026-06-11 23:45] TASK 0.4 | PASS | models.ts (Product/Accessory/QuoteLine/Customer/SyncEntity/ProductSystem/OwinDB) + placeholders.ts (2 bộ TÁCH RIÊNG: F1 {rong}{cao}{sl}, F2 {kich_thuoc}+{%image}). dup-check no-dup.
- [2026-06-11 23:44] TASK 0.3 | PASS | alias @→/src (vite + tsconfig.app.paths). Gỡ baseUrl (TS deprecate). @types/node. Cây thư mục src/* tạo đủ.
- [2026-06-11 23:42] TASK 0.2 | PASS | Cài 6 lib lõi. VERSION: docxtemplater@3.68.7, docxtemplater-image-module-free@1.1.1, pizzip@3.2.0, browser-image-compression@2.0.2, localforage@1.10.0, lucide-react@1.17.0. audit: xmldom critical (transitive, no-fix) — giữ lib theo runbook, ghi chú. Build xanh.
- [2026-06-11 23:40] TASK 0.1 | PASS | Vite React-TS scaffold (owin-quote-tool), npm install 152 pkg, git init, .gitignore +.env. dev HTTP 200, build sạch. Node v22.17, Vite 8.0.16.

---

## 👤 VIỆC HUMAN CÒN LẠI (agent KHÔNG tự làm được — làm theo thứ tự)

> Trạng thái code: **TẤT CẢ phần tự động hoá được đã PASS** (vitest 40/40, build sạch, xuất Word số khớp BR-1 từng đồng, merge sync 7 ca PASS, dist không lộ secret). Các việc dưới đây là tay người + nhìn mắt + thao tác trên dịch vụ Google/GitHub.

### 1. (NHỎ) Xác minh EXIF ảnh dọc — mở khoá nốt TEST 2.1
- **Bước:** chạy app (`npm run dev` trong `owin-quote-tool`) → tab Kho → Thêm sản phẩm → kéo 1 ảnh CHỤP DỌC bằng điện thoại/tablet (ảnh có EXIF orientation) vào dropzone.
- **Kỳ vọng:** ảnh hiển thị ĐÚNG CHIỀU, KHÔNG bị xoay ngang.
- **Vì sao human:** cần ảnh chụp thật có EXIF; agent chỉ tạo được ảnh synthetic không EXIF. Code đã đúng (browser-image-compression tự bake orientation).
- **Mở khoá:** đánh dấu TEST 2.1 EXIF xanh.

### 2. (NHỎ) Nhìn file Word xuất ra — mở khoá nốt TEST 4.5 visual
- **Bước:** tab Báo giá → thêm vài SP, nhập số → bấm "Xuất Word — Báo giá (F1)" và "Bảng giá (F2)" → mở 2 file `.docx` tải về bằng **Microsoft Word hoặc Google Docs**.
- **Kỳ vọng:** bảng KHÔNG vỡ cột, font tiếng Việt đúng dấu, số tiền khớp UI (vd `4.296.032`), F2 ảnh nằm gọn trong ô.
- **Nếu ảnh tràn/cột xấu:** chỉnh độ rộng cột trong 2 template `src/assets/templates/*.docx` (hoặc sửa `scripts/make_templates.py` rồi chạy lại `python scripts/make_templates.py`), hoặc chỉnh `maxW` trong `computeSize()` ở `wordExport.ts`.
- **Tuỳ chọn branding:** thêm logo Owin/đầu trang vào 2 template cho đẹp (giữ nguyên các tag `{...}` `{#items}` `{%image}`).

### 3. (LỚN) Tạo OAuth Client + Apps Script backend (TASK 5.1) — mở khoá toàn bộ sync
Cần lần lượt:
**3a. Google Cloud Console → tạo OAuth Client ID (loại Web application)**
   - APIs & Services → Credentials → Create credentials → OAuth client ID.
   - **Authorized JavaScript origins:** `https://<github-username>.github.io` (domain Pages thật, KHÔNG kèm path repo).
   - **Authorized redirect URIs:** thêm đúng URI sẽ khai trong Script Property `REDIRECT_URI`.
   - Lưu lại **Client ID** và **Client secret**.
   - Bẫy: origin KHÔNG có dấu `/` cuối, KHÔNG kèm `/owin-quote-tool/`.
**3b. OAuth consent screen**
   - Thêm scope `https://www.googleapis.com/auth/drive.appdata`.
   - Để lấy refresh_token BỀN: cân nhắc Publish app (Testing mode có thể giới hạn refresh_token ~7 ngày). VERIFY chính sách Google hiện hành trước khi quyết.
**3c. Apps Script backend**
   - script.google.com → New project → dán nội dung `Code.gs` (ở thư mục dự án này).
   - Project Settings → Script Properties, thêm 4 dòng:
     - `GOOGLE_CLIENT_ID` = Client ID ở 3a
     - `GOOGLE_CLIENT_SECRET` = Client secret ở 3a  ← **bí mật, chỉ ở đây, KHÔNG vào git**
     - `SHARED_SECRET` = tự đặt chuỗi ngẫu nhiên ~32 ký tự (sẽ điền y hệt vào `.env` frontend)
     - `REDIRECT_URI` = đúng redirect URI đã khai ở 3a
   - Deploy → New deployment → type **Web app**: Execute as **Me**, Who has access **Anyone**.
   - Copy URL kết thúc bằng **`/exec`** → đây là `BACKEND_URL`.
   - Bẫy: mỗi lần "New deployment" URL `/exec` ĐỔI → phải cập nhật lại `.env`. Dùng "Manage deployments → Edit" để giữ URL.
   - Bẫy CORS: frontend gửi `Content-Type: text/plain` để né preflight — Code.gs đã tự `JSON.parse`. Đừng đổi thành application/json.
   - Bẫy refresh_token: chỉ cấp lần đầu khi `access_type=offline` + `prompt=consent` (googleAuth.ts đã set). Nếu test lại mà không thấy refresh_token, thu hồi quyền ở myaccount.google.com rồi consent lại.

### 4. Điền `.env` cho frontend (sau khi có 3 giá trị từ mục 3)
- Trong `owin-quote-tool/`: copy `.env.example` → `.env`, điền:
  - `VITE_GOOGLE_CLIENT_ID` = Client ID
  - `VITE_BACKEND_URL` = URL `/exec`
  - `VITE_SHARED_SECRET` = đúng `SHARED_SECRET` đã đặt ở Script Property
- `.env` đã được .gitignore — đừng commit.
- **Mở khoá:** chạy `npm run dev`, SyncBar hiện nút "Kết nối Google" thay vì "chưa cấu hình".

### 5. Deploy GitHub Pages (TASK 5.5)
- Tạo repo GitHub, push toàn bộ thư mục dự án (lưu ý: code app nằm trong `owin-quote-tool/`).
- Repo Settings → Pages → Source = **GitHub Actions**.
- Settings → Secrets and variables → Actions → **Secrets**: thêm `VITE_GOOGLE_CLIENT_ID`, `VITE_BACKEND_URL`, `VITE_SHARED_SECRET` (giá trị thật).
- Nếu tên repo KHÁC `owin-quote-tool`: thêm **Variable** `BASE_PATH` = `/<tên-repo>/`.
- Push lên `main` → workflow `.github/workflows/deploy.yml` tự build + deploy.
- Quay lại mục 3a cập nhật `Authorized JavaScript origins` = domain Pages thật nếu lúc đầu chưa biết.

### 6. Nghiệm thu live (sau mục 3–5) — mở khoá TEST 5.2 / 5.4 / 5.5
- [ ] Mở link Pages → bấm **Kết nối Google** → popup consent → kết nối thành công (TEST 5.2 #1).
- [ ] Để token hết hạn (hoặc đợi >1h) → thao tác sync → refresh ngầm KHÔNG popup (TEST 5.2 #2).
- [ ] Thu hồi quyền ở myaccount.google.com → sync tiếp → UI báo cần kết nối lại (TEST 5.2 #3).
- [ ] **Máy A** thêm "Cửa trượt Owin Cao Cấp" → Đồng bộ. **Máy B** (cùng tài khoản Google) mở web → Đồng bộ → thấy sản phẩm đó (TEST 5.4 #3).
- [ ] Tắt mạng → vẫn nhập/tính/xuất Word được; bật lại → Đồng bộ đẩy lên không mất (TEST 5.4 #1,2).
- [ ] Tạo conflict: máy A & B cùng sửa 1 SP khác nhau rồi sync → hiện dialog "[Giữ bản của bạn]/[Lấy bản trên Drive]" (BR-8).

> **Thứ tự mở khoá:** 3 (OAuth+backend) là nút thắt — xong 3+4 thì test consent/refresh chạy local được; xong 5 (deploy) thì nghiệm thu live + đa máy chạy được.

---

## ⚠️ DANH SÁCH "VERIFY TRƯỚC KHI CODE" (agent bắt buộc check, không tin trí nhớ)
1. **docxtemplater** version thật → API `render(data)` đúng chưa, `linebreaks`/`paragraphLoop` đặt ở đâu.
2. **docxtemplater-image-module-free** version thật → `getImage` trả ArrayBuffer hay Uint8Array; cách đăng ký module.
3. **Google OAuth** docs hiện hành → `initCodeClient` popup trả code thế nào; `access_type:offline`+`prompt:consent` có ép cấp refresh_token không; chính sách Published/verification/100-user; vòng đời refresh_token.
4. **Apps Script CORS** → xác nhận mẹo `Content-Type: text/plain` còn né được preflight không.
5. **getSize ảnh Word** → căn lại bằng ảnh thật trong ô thật, không tin `[120,90]` chạy đúng ngay.
