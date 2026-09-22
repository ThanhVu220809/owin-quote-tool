# owin-landing — Audit & Plan

Trạng thái: **PLAN, chưa code.** Mọi dòng dưới đây gắn nhãn nguồn: `[C]` xác nhận từ source, `[I]` suy luận từ source, `[N]` đề xuất mới, `[?]` chưa đủ thông tin.

---

## 1. Project hiện tại

| | |
|---|---|
| Git repo | `D:\work_place\owin-quote-tool` |
| App | `D:\work_place\owin-quote-tool\owin-quote-tool` (thư mục con) |
| Stack | React 19 · TypeScript · Vite 8 · CSS thuần · `@supabase/supabase-js` `[C]` |
| Backend | **Không có.** Client gọi Supabase PostgREST trực tiếp; RLS là tầng bảo mật duy nhất `[C]` |
| Routing | **Không có router.** 4 tab bằng `useState`, một URL duy nhất, toàn bộ nằm sau `AuthGate` `[C]` `src/App.tsx:39` |
| Deploy | GitHub Pages tĩnh, `public/CNAME` = `admin.hoanganhowin.io.vn` `[C]` |
| Cửa hàng | `stores.id = 'owin'`, chủ `hoanganhowin@gmail.com` `[C]` `supabase/migrations/0001_*.sql:73` |

### "API" để reuse là gì

Không có REST API riêng. Project mới dùng **cùng Supabase URL + anon key**, gọi PostgREST trực tiếp — không cần adapter, không cần API mới `[I]`. Đây là điểm thuận lợi: project tách rời vẫn đọc được dữ liệu thật mà không coupling code.

---

## 2. Product → Configuration → Pricing → Quotation

### Dữ liệu

`products`: cột phẳng để lọc/sort + cột `data jsonb` chứa full `ProductRecord` `[C]`. Cấu hình sản phẩm nằm trong `ProductRecord`: `unit` (`BO`/`M2`/`METER`), `unitPriceVnd`, `rawSizeText`, `rawPriceText`, `specs[]`, `accessories[]`, `fixedAccessoryPackage`, `extraAccessories` `[C]` `src/types/models.ts`.

Không có bảng variant/option. "Cấu hình" của khách chỉ là **Rộng × Cao × Số lượng** `[C]`.

### Engine giá — thuần TypeScript, không phụ thuộc React/Supabase

`src/lib/quoteEngine/*` chỉ import lẫn nhau + `@/types/models` `[C]` (đã grep toàn bộ import). Browser-safe, tree-shake được.

Đơn vị `[C]` `quoteEngine/quantity.ts`:

| Đơn vị | Khối lượng |
|---|---|
| `M2` | Rộng × Cao × SL |
| `METER` | (Rộng + Cao) × SL |
| `BO` | SL (bỏ qua kích thước) |

### HAI nhánh tiền, làm tròn KHÁC nhau — dùng nhầm là ra số khác admin `[C]`

| | Nhánh **Báo giá** | Nhánh **Bảng giá** |
|---|---|---|
| Entry | `lib/quote/quoteCalculator.ts` | `lib/catalogue/catalogueMoney.ts` |
| Dòng tiền | KL làm tròn 3 số lẻ → × đơn giá → `Math.round` | `roundMoneyToVnd` từng dòng |
| Tổng | **floor về bội số 100.000** (BR-1b) | **không floor** |

→ Thẻ sản phẩm trên landing dùng nhánh Bảng giá. Bộ tính giá dùng nhánh Báo giá.

### Bước chuẩn hoá giá — bỏ là sai số cho cả một nhóm sản phẩm `[C]`

`normalizeProductPriceForQuote` trong `src/features/quote/productToQuoteItem.ts`: nếu `rawPriceText` **không** có dấu hiệu đơn giá (`/`, `1m2`, `1m dài`) và đơn vị ≠ `BO`, thì `unitPriceVnd` đang là **giá trọn gói** và phải chia ngược về đơn giá theo kích thước mẫu. Bộ tính giá công khai **phải** đi qua `createQuoteItemFromProduct`, không được tự lắp input.

---

## 3. Ranh giới dữ liệu — hiện trạng

| Nguồn | anon đọc được? | Ghi chú |
|---|---|---|
| `products` | Có, policy `products_anon_read` `[C]` | Chỉ `is_public = true` và store thuộc `public_store_ids()` |
| Bucket `product-images` | Có, bucket `public = true` `[C]` | URL ảnh tải được; anon không list được object |
| `app_documents` (cấu hình) | **Không** `[C]` | Chỉ có policy `to authenticated` (`schema.sql:361`) |
| `quotes`, `stores`, `store_members`, `profiles`, `suggestions` | Không `[C]` | Đóng — đúng như mong muốn |

### Ba việc phải sửa trong repo hiện tại (không có đường tránh)

RLS nằm trong `supabase/schema.sql` của project hiện tại. Landing page **không đọc được gì** nếu không sửa:

1. **`products_anon_read` chỉ áp cho `anon`** `[C]` `schema.sql:341`. Người **đang đăng nhập** mở landing page sẽ thấy **trống**, vì role `authenticated` rơi vào `products_member_all` (đòi là thành viên store). Cần policy đọc công khai áp cho cả hai role.
2. **`stores.is_public` default `false`** `[C]`. Store `'owin'` có bật chưa → `[?]` phải kiểm DB thật. Chưa bật thì anon trả 0 dòng.
3. **Nội dung landing (hero/liên hệ) không có đường ra cho anon** `[C]`. Nội dung sẽ nằm trong `app_documents` (QĐ-3) nên cần thêm policy anon — **chỉ cho đúng document nội dung website**, không mở cả bảng: `app_documents` còn chứa cấu hình nội bộ và state tính nhôm.

> Đây là sửa **SQL + migration**, không đụng giao diện 4 tab. Đã được chấp thuận qua QĐ-2/QĐ-3.

### Sản phẩm nào lộ ra web

`products.is_public` tồn tại, nhưng client **luôn ghi `true`** và **không có nút bật/tắt** `[C]` `ProductForm.tsx:147`. Nghĩa là nếu bật landing page lên ngay hôm nay thì **toàn bộ bảng giá hiện ra**. QĐ-3 giải quyết việc này bằng nút bật/tắt trong tab Sản phẩm (Phase 3) — và vì vậy Phase 3 **phải xong trước khi** trang công khai lên sóng.

---

## 4. Theme & style có thể reuse

| Hạng mục | Trạng thái |
|---|---|
| Design tokens | `src/styles/tokens.css` — palette iOS, thang radius/type/spacing, `--control-h: 44px` `[C]`. Reuse được |
| Font | Roboto qua Google Fonts + fallback có dấu tiếng Việt `[C]`. Đúng yêu cầu |
| **Cơ chế** sáng/tối | `src/features/settings/appearance.ts` — localStorage `owin-appearance` + `data-appearance` trên `<html>` `[C]`. Reuse được |
| **Bộ màu tối** | **Chưa có cho app.** `tokens.css` không có biến thể dark; dark chỉ tồn tại ở màn đăng nhập (`login.css` scope `.login-premium[data-appearance='dark']`) `[C]` |

→ Dark mode của landing phải **viết mới bộ token tối** `[N]`, dùng lại đúng cơ chế toggle. Không đụng 4 tab cũ.

---

## 5. Ba quyết định — ĐÃ CHỐT

### QĐ-1 — Vị trí: `D:\work_place\owin-landing`

Cùng cấp với **git repo** hiện tại. Repo riêng, CI riêng, deploy riêng, domain riêng.

### QĐ-2 — Logic giá: package dùng chung

Chốt hướng package, **không copy file, không alias xuyên thư mục**.

Điều chỉnh kỹ thuật bắt buộc: `D:\work_place\` chứa hơn 30 project không liên quan nên **không thể làm workspace root**. Cách hiện thực đúng với quyết định này:

- Repo hiện tại trở thành workspace root: `owin-quote-tool/package.json` (mới, ở gốc repo) khai workspaces cho app hiện có + `packages/quote-engine` (mới).
- `packages/quote-engine` chứa engine giá **dời** từ `src/lib/quoteEngine/*`, `src/lib/quote/quoteCalculator.ts`, `src/lib/catalogue/catalogueMoney.ts`, phần chuẩn hoá giá của `productToQuoteItem.ts`, cùng các type liên quan trong `src/types/models.ts`.
- App hiện tại đổi sang import từ package (`@owin/quote-engine`). **Hành vi không đổi** — bộ test hiện có là lưới an toàn.
- `owin-landing` khai `"@owin/quote-engine": "file:../owin-quote-tool/packages/quote-engine"`.

Hệ quả: **sửa project hiện tại là bắt buộc** (thêm package.json gốc, dời file, đổi import). Đây là đánh đổi bạn đã chọn để có một nguồn chân lý duy nhất.

### QĐ-3 — Có admin UI trong project hiện tại

Thêm vào project hiện tại: nút bật/tắt `is_public` (lẻ + hàng loạt) trong tab Sản phẩm, và mục sửa nội dung landing (hero, liên hệ, thương hiệu, sản phẩm nổi bật) cho chủ/quản lý cửa hàng. Nội dung lưu vào `app_documents` — bảng cấu hình JSON theo cửa hàng **đã có sẵn**, không tạo bảng mới. Nhân viên thường không thấy mục này.

**Thứ tự bắt buộc:** làm nút bật/tắt **trước**, đóng công khai hàng loạt **sau**. Ngược lại thì đóng xong không mở lại được bằng giao diện.

---

## 6. Landing page — đề xuất `[N]`

Luồng: **Xem sản phẩm → chi tiết → nhập kích thước/SL → thấy giá → Gọi/Zalo/Messenger**

Sáu section, mỗi cái có lý do tồn tại. Không thêm cho dài trang:

| Section | Lý do |
|---|---|
| Header | Điều hướng + toggle sáng/tối + nút liên hệ |
| Hero | Nói cửa hàng làm gì, đẩy xuống sản phẩm |
| Sản phẩm | Dữ liệu thật: ảnh, tên, vài spec, giá trọn gói kích thước mẫu (nhánh Bảng giá) |
| **Bộ tính giá** | Trọng tâm. Chọn sản phẩm → R×C×SL → tách rõ tiền sản phẩm / phụ kiện / tổng |
| Vì sao chọn | **Chỉ dùng nội dung chủ cửa hàng cung cấp.** Code không chứng minh được claim marketing → không tự viết `[?]` |
| Liên hệ + Footer | Ba nút Gọi · Zalo · Messenger. Không form, không ghi DB |

Ghi rõ trên bộ tính giá: giá tham khảo, chưa gồm lắp đặt/vận chuyển.

### Bất biến của cả trang

**Cùng sản phẩm, cùng kích thước, cùng số lượng → giá web phải trùng giá tab Báo giá.** Sai chỗ này thì phần còn lại vô nghĩa.

### Xác định cửa hàng

Landing lấy `store_id` từ **config/hostname của bản deploy**, tuyệt đối không từ phiên đăng nhập `[N]`. Landing không có đăng nhập, nên điều này cũng là mặc định tự nhiên.

---

## 7. Giai đoạn triển khai

Phase trước nghiệm thu xong mới sang phase sau.

Phase 1–3 nằm trong **repo hiện tại**. Phase 4 trở đi nằm trong **`owin-landing`**.

| Phase | Ở đâu | Việc | Done khi |
|---|---|---|---|
| **0** | — | Kiểm DB thật: `stores.is_public` của `'owin'`, bao nhiêu sản phẩm `is_public = true`. Không sửa file nào | Biết chính xác dữ liệu thật đang ở trạng thái nào |
| **1** | repo hiện tại | Tách `packages/quote-engine`, app hiện tại đổi sang import từ package | `lint` · `test` · `build` xanh; **4 tab hành vi không đổi**; engine không import React/Supabase |

> **Xong (2026-09-17).** Repo thành npm workspace: gốc + `owin-quote-tool` + `packages/quote-engine`. 16 file engine dời vào package, đường dẫn cũ trong app thành shim re-export nên 113 điểm import không phải đổi. Test: package 105 + app 216 = **321**, đúng bằng con số trước khi tách.
>
> **Cái bẫy gặp phải:** `npm install` gãy với `Cannot read properties of null (reading 'edgesOut')`. Đã kiểm: **app nguyên bản cũng gãy y hệt** — bug npm 10.9.2 với đồ thị peer của vitest 4, có trước mọi thay đổi ở đây; repo chỉ chạy được nhờ `node_modules` có sẵn. Đã đặt `legacy-peer-deps=true` trong `.npmrc` gốc. Nâng npm lên bản đã sửa thì xoá dòng đó.
| **2** | repo hiện tại | Migration RLS: đọc công khai cho cả `anon` + `authenticated` (products + nội dung landing trong `app_documents`) | Đăng xuất **và** đăng nhập đều đọc được sản phẩm công khai + nội dung landing; `quotes`/`stores`/`profiles`/dữ liệu nhôm vẫn đóng |

> **Đã viết, CHƯA chạy (2026-09-17).** `supabase/migrations/0003_public_landing_read.sql` + hội tụ vào `schema.sql`. Việc "bật `stores.is_public`" đã bỏ khỏi phạm vi vì nó vốn đã bật (8b.1).
>
> Migration sửa hai thứ: `products_anon_read` → `products_public_read` áp cho **cả `anon` lẫn `authenticated`**; và mở `app_documents` cho anon nhưng **khoá đúng một khoá document** `owin_landing_content_v1`, vì bảng đó còn chứa state tab Tính nhôm.
>
> **Cần bạn chạy trong Supabase SQL editor** — tôi chỉ có anon key, không chạy được DDL. Bảng nghiệm thu nằm ở cuối file migration.
| **3** | repo hiện tại | Admin UI: nút bật/tắt `is_public` (lẻ trước, hàng loạt sau) + sửa nội dung landing | Chủ/quản lý sửa được; nhân viên không thấy mục này; sản phẩm đã tắt không bao giờ ra web |

> **Đã đảo thứ tự:** Phase 3 chạy trước Phase 1–2. Lý do ở 8b.1 — 333 sản phẩm đang công khai sẵn mà chủ cửa hàng chưa có công cụ nào để kiểm soát, nên nút bật/tắt là việc gấp hơn cú refactor engine.
>
> **Xong (2026-09-17):** nút bật/tắt lẻ trên từng dòng + hàng loạt cho cả danh mục. `tsc` · `lint` · 321 test · `build` xanh. Kiểm giao diện ở 375px và desktop.
>
> **Nội dung — xong (2026-09-18).** Mục "Nội dung trang web" trong menu tài khoản, chỉ chủ/quản lý thấy. Sửa phần mở đầu (dòng nhỏ, tiêu đề, mô tả, chữ hai nút, ảnh) và liên hệ (số gọi, số hiển thị, Zalo, Messenger, địa chỉ, giờ). Lưu vào `app_documents` khoá `owin_landing_content_v1` bằng CAS — đụng độ thì tải lại bản mới và báo, không ghi đè công sức người khác.
>
> **Ô trống = dùng mặc định của trang**, không phải xoá trắng. Điền dở dang vẫn ra một trang hoàn chỉnh.
>
> **Chặn XSS ở cả hai phía.** Zalo/Messenger đi thẳng vào `href` trên trang công khai, nên `javascript:` ở đó là XSS lưu trữ chạy trên máy khách. Chỉ nhận http/https; admin cảnh báo ngay lúc gõ, và **trang công khai lọc lại lần nữa** vì tài liệu có thể bị sửa bằng đường khác ngoài giao diện này.
>
> **Nổi bật — xong (2026-09-18).** Nút sao trong bảng sản phẩm, cạnh nút Hiện/Ẩn vì cả hai cùng trả lời một câu hỏi: sản phẩm này lên trang công khai thế nào. Trang công khai có phần "Sản phẩm nổi bật" trên đầu; chưa ai được chọn thì **ẩn hẳn**, không tự lấy bừa vài sản phẩm đầu danh sách rồi gọi là nổi bật.
>
> Cờ này **chỉ nằm trong `data`, không có cột quan hệ** — khác `is_public` (buộc phải có cột vì RLS lọc theo nó, và chính vì thế mới phải giữ đồng bộ hai nơi). Nổi bật chỉ là chuyện hiển thị nên để một nơi thì không bao giờ lệch. Trang lọc bằng `data->>isFeatured`, đã kiểm chạy được với anon.
>
> Nút sao **khoá khi sản phẩm đang ẩn** khỏi web — nổi bật thứ không ai thấy thì vô nghĩa.
>
> **Thứ tự** thì đã có sẵn từ trước: trang công khai xếp theo `sort_order`, tức đúng thứ tự kéo-thả trong tab Sản phẩm.
>
> **Chưa làm:** sửa logo thương hiệu (trang đang hiện tên bằng chữ).
| **4** | owin-landing | Scaffold + `file:` dependency sang engine + bộ token sáng/tối | `build` xanh; bundle **không** chứa `exceljs`/`jspdf`/`pizzip` và component của admin |

> **Xong (2026-09-17).** `D:\work_place\owin-landing` — Vite + React 19 + TS, git repo riêng. Bundle 222 kB, đã kiểm **không** chứa `exceljs`/`jspdf`/`pizzip`/`lucide`/`supabase`/`html2canvas`. Bộ token sáng/tối mới (nền tối không dùng đen tuyệt đối). Không tràn ngang ở 375px. Engine giá chạy thật trong trình duyệt.

### ⚠ Phát hiện ở Phase 4 — hai nhánh lệch nhau ở HAI chỗ, không phải một

Audit ban đầu nói hai nhánh chỉ khác nhau ở việc làm tròn tổng. **Sai.** Test parity của `owin-landing` bắt được chỗ thứ hai:

| | Nhánh Bảng giá | Nhánh Báo giá |
|---|---|---|
| Khối lượng | **đủ độ chính xác** (2.148016) | **làm tròn 3 số lẻ trước khi nhân** (2.148) |
| Tổng | không floor | floor về bội số 100.000 |

Cùng sản phẩm 1,196 × 1,796 @ 2.000.000đ/m²: bảng giá ra **4.296.032**, báo giá ra **4.296.000**. Chênh 32đ.

Nghĩa là tab Bảng giá hiện khối lượng `2,148` nhưng nhân tiền bằng `2,148016` — số hiển thị × đơn giá **không** ra số thành tiền hiển thị. Đây là hành vi có sẵn của app, không phải lỗi mới.

**Hệ quả cho trang công khai:** nếu thẻ sản phẩm lấy số nhánh Bảng giá còn bộ tính giá lấy số nhánh Báo giá, khách thấy **hai con số khác nhau cho cùng một sản phẩm trên cùng một trang**.

### QĐ-4 — ĐÃ CHỐT: dùng **nhánh Báo giá cho cả hai**

Thẻ sản phẩm và bộ tính giá đi chung một nhánh, nên hai con số không thể lệch nhau.

Kèm theo một hệ quả về hiển thị: nhánh Báo giá **có** bước làm tròn tổng xuống bội số 100.000. Thẻ sản phẩm vì vậy hiện `4.200.000` chứ không phải `4.296.032` — luôn thấp hơn, không bao giờ làm tăng số khách phải trả, và trùng đúng số tab Báo giá đưa ra cho cùng cấu hình.

Quyết định này được khoá bằng code chứ không chỉ nằm trong tài liệu: mọi con số tiền của trang công khai đi qua `owin-landing/src/lib/price.ts`, và `price.test.ts` khẳng định thẻ sản phẩm với bộ tính giá ra **cùng** kết quả khi cùng cấu hình. **Cấm import `buildCatalogueMoneyBlocks` ở bất kỳ đâu trong `owin-landing`.**
| **5** | owin-landing | Sản phẩm thật lên trang | Giá thẻ sản phẩm khớp tab Báo giá (QĐ-4); danh sách rỗng thì ẩn section, trang vẫn chạy |

> **Xong (2026-09-18).** 333 sản phẩm thật, ảnh thật, giá qua `priceFor`. Tải 24 sản phẩm mỗi lượt (toàn bộ là 613 KB — quá nặng cho lần vẽ đầu trên điện thoại). Danh sách rỗng ẩn hẳn section; lỗi tải thì nói thật là lỗi.
>
> Trang **không** tự lọc `is_public`/`deleted_at` — RLS đã làm. Lọc lại ở client chỉ tạo cảm giác an toàn giả.
>
> Hai chỗ sửa sau khi nhìn màn hình thật: hộp ảnh bị chính `<img>` quyết định chiều cao nên `aspect-ratio` vô nghĩa (thẻ cao 194–344px lô nhô) → đặt ảnh `absolute`; và nhãn giá ghi `2.80 x 2.80 m²` là sai đơn vị — đó là **mét**, không phải diện tích.
| **6** | owin-landing | Bộ tính giá | Chạy hết bảng đối chiếu dưới; **không có công thức giá nào được viết lại** |

> **Xong (2026-09-18).** Chọn sản phẩm (tìm bỏ dấu) → nhập R×C×SL → giá hiện ngay, tách rõ tiền sản phẩm · phụ kiện · tạm tính, kèm ba nút Gọi · Zalo · Messenger. Thẻ sản phẩm có nút đưa sang bộ tính giá với sản phẩm chọn sẵn.
>
> **Kiểm đầu-cuối bằng dữ liệu thật:** thẻ sản phẩm `74.400.000đ` === Tạm tính `74.400.000đ` cho cùng sản phẩm và cấu hình. Sản phẩm `BO` ẩn ô kích thước. Cả bảng đối chiếu đều có test.
>
> **Phát hiện cần bạn xác nhận:** bộ phụ kiện cố định nhân theo số lượng, còn **phụ kiện lẻ thì KHÔNG**. Đặt 3 cửa thì phào vẫn tính một lần. Đây là hành vi của engine nên tab Báo giá cũng vậy — trang công khai trùng số là đúng yêu cầu — nhưng nếu đó không phải ý định nghiệp vụ thì phải sửa ở engine, không sửa ở trang. Đã khoá bằng test để nó là lựa chọn có chủ đích.
| **7** | owin-landing | Giao diện, sáng/tối, responsive, liên hệ | Đạt ở 1920/1440/1280/1024/768/430/390/375; 375px không tràn ngang; sáng và tối đều đọc tốt; đi hết trang bằng bàn phím; tắt chuyển động khi hệ điều hành yêu cầu |

> **Xong (2026-09-18).** Điều hướng, phần lý do, liên hệ (3 nút, không form), footer, skip link.
>
> **Đã kiểm:** 1920/1280/1024/768/430/390/375 — không khổ nào tràn ngang, ở 375 không phần tử nào vượt mép. Tương phản WCAG AA đạt cả sáng lẫn tối (thấp nhất 5,07). `prefers-reduced-motion` đã có trong tokens.
>
> **CHƯA kiểm được:** focus bàn phím thật. `document.hasFocus()` luôn `false` vì cửa sổ pane không ở tiền cảnh, nên `:focus` không bao giờ khớp — không phải lỗi trang, nhưng cũng chưa được chứng minh. Cần bấm Tab một lần trên máy thật để xác nhận skip link bật ra.
>
> Phần lý do chỉ nói điều code làm được. Mọi tuyên bố về doanh nghiệp (số năm, bảo hành, số công trình) để chủ cửa hàng tự viết.
| **8** | owin-landing | SEO + hoàn thiện | `lint` · `test` · `build` xanh; chia sẻ link ra Zalo/Facebook có ảnh + mô tả (host tĩnh không chạy JS cho bot → nhúng thẻ lúc build) |

> **Xong (2026-09-18).** Plugin Vite nhúng thẻ chia sẻ thẳng vào `index.html` lúc build, lấy từ chính `content.ts`. Favicon (logo thật của cửa hàng) + `robots.txt`. `lint` · **27 test** · `build` xanh.
>
> **Hai thứ cố ý TẮT cho tới khi có dữ liệu thật:** canonical/`og:url` chỉ bật khi `seo.siteUrl` có tên miền; JSON-LD `LocalBusiness` chỉ bật khi số liên hệ đã thật. Khai số giả trong dữ liệu có cấu trúc còn tệ hơn không khai. Đây là các nhánh chỉ chạy đúng ngày lên sóng nên đã tách sang `src/seo.ts` và phủ test, gồm cả việc thoát `</script>` lọt vào JSON-LD.
>
> **Hiệu năng:** thay `supabase-js` bằng `postgrest-js`. Trang chỉ chạy `select` nhưng client đầy đủ đang đóng gói cả realtime (kèm phoenix) lẫn auth cho mọi khách. Bundle **465 → 267 kB** (gzip **133 → 83 kB**), đã kiểm `RealtimeClient`/`GoTrue`/`phoenix` biến mất khỏi bundle và dữ liệu vẫn đọc đúng như cũ.

**Phase 1 là phase rủi ro nhất** — nó sửa vào đường tính tiền của 4 tab đang chạy thật. Chỉ dời file và đổi import, không sửa một dòng công thức nào; bộ test hiện có là lưới an toàn duy nhất.

### Bảng đối chiếu giá (Phase 4) — mỗi ô phải **bằng tuyệt đối** với tab Báo giá

| Trường hợp | Kiểm |
|---|---|
| `BO` | Bỏ kích thước, chỉ nhân SL |
| `M2` | R × C × SL |
| `METER` | (R + C) × SL |
| Sản phẩm nhập **giá trọn gói** | `normalizeProductPriceForQuote` có chạy |
| Có phụ kiện | Tiền phụ kiện vào đúng tổng |
| SL > 1 | Không nhân lệch phụ kiện |
| **Biên làm tròn** | Kích thước sinh số lẻ ở ranh giới — quan trọng nhất, vì hai nhánh làm tròn khác nhau |

---

## 8. Nguyên tắc

**Không tự phát minh:** không review khách hàng, không số liệu thống kê, không logo đối tác, không thành tích, không giá tự nghĩ, không spec tự nghĩ, không section ngoài mục 6, không thêm UI framework.

**Không suy diễn từ code thành claim marketing.** Code chứng minh hệ thống *có* bộ tính giá; nó không chứng minh "giao nhanh", "bảo hành tốt", "nhiều năm kinh nghiệm".

**Không phá vỡ:** 4 tab hiện tại giữ nguyên **giao diện và hành vi**. Landing **chỉ đọc**. Khách vào landing không tải code xuất file (`exceljs`, `jspdf`, `pizzip`).

> Yêu cầu ban đầu là "không sửa project hiện tại". QĐ-2 và QĐ-3 **đã thay điều đó** bằng một ranh giới hẹp hơn: được sửa project hiện tại ở ba việc — tách package engine, migration RLS, thêm admin UI — và **không được đổi hành vi của 4 tab**. Ngoài ba việc đó thì không refactor tiện tay, không sửa lỗi không liên quan, không thêm tính năng.

**Nội dung người dùng nhập là văn bản thuần**, không render như HTML.

**Quyền dữ liệu mở đúng phạm vi mục 3**, rộng hơn là lỗi kể cả khi tiện hơn.

---

## 8b. Kết quả Phase 0 (đã chạy thật, 2026-09-17)

Kiểm bằng đúng anon key mà landing page sẽ dùng — tức là đo **chính xác** những gì khách vãng lai thấy.

| Câu hỏi | Kết quả |
|---|---|
| `stores.is_public` của `'owin'` | **Đã bật.** `rpc/public_store_ids` → `["owin"]` `[C]` |
| Sản phẩm anon đọc được | **333** `[C]` |
| Cột nào anon đọc được | **Toàn bộ, kể cả `data` jsonb** — full `ProductRecord`: specs, accessories, giá, gallery, đường dẫn ảnh `[C]` |
| `quotes` · `stores` · `store_members` · `profiles` · `app_documents` · `suggestions` | **401 cho anon** `[C]` — ranh giới riêng tư vững |

### Hai điều làm đổi plan

**1. Bảng giá 333 sản phẩm đã công khai từ trước, không phải do plan này mở ra.** Anon key nằm trong bundle đã deploy nên coi như công khai. Việc "bật `stores.is_public`" ở Phase 2 → **đã xong, bỏ khỏi phạm vi**. Nhưng đồng thời: rủi ro "lộ toàn bộ bảng giá" **đang có thật ngay lúc này**, chỉ là chưa có giao diện nào hiện nó ra. Nút bật/tắt `is_public` (Phase 3) do đó không chỉ là tính năng cho landing — nó là công cụ đầu tiên để chủ cửa hàng kiểm soát việc đã xảy ra rồi.

**2. Anon nhận cả cột `data`.** Đúng dòng nhưng thừa cột. Với landing thì phần lớn `data` là thứ trang sẽ hiển thị, nên không phải lỗ hổng cấp bách; nhưng nếu `ProductRecord` có chứa ghi chú nội bộ thì nó đang ra ngoài. Cần chủ cửa hàng xác nhận `[?]`. Cách siết nếu cần: view công khai chỉ expose đúng trường landing dùng.

### Ranh giới phụ thuộc engine giá — sạch `[C]`

Tập đóng của import **đúng bằng** tập ứng viên, không rò ra ngoài: không React, không Supabase, không DOM, không `import.meta.env`. Ngoại lệ duy nhất là `crypto.randomUUID()` (có sẵn ở browser và Node ≥ 19) — `accessoryDrafts.ts:44` đã guard, `productToQuoteItem.ts:67` gọi trực tiếp.

Tập file sẽ vào package: `lib/quoteEngine/*` · `lib/quote/quoteCalculator.ts` · `lib/quote/accessoryDrafts.ts` · `lib/catalogue/catalogueMoney.ts` · `lib/products/categoryOrder.ts` · `lib/format/titleCase.ts` · `features/quote/productToQuoteItem.ts` + các type liên quan.

**Không** vào package: `accessoryPackages.ts` và `suggestionEngine.ts` — chúng gắn với UI (component đang dùng), landing không cần `[C]`.

### Chiến lược Phase 1 để giảm rủi ro

71 file import `@/types/models`, 42 file import các module giá. Đổi hết import là 113 điểm chạm trên đường tính tiền đang chạy thật — không đáng.

Thay vào đó: **package giữ code thật, đường dẫn cũ trong app thành shim re-export.** Hành vi y nguyên, điểm chạm gần bằng 0, mà vẫn đạt một nguồn chân lý duy nhất. Bộ test hiện có nghiệm thu cả code lẫn shim.

---

## 9. Chưa biết — cần chủ cửa hàng cung cấp

- Điện thoại, Zalo, Messenger, địa chỉ, giờ làm việc `[?]` (không có trong code)
- Nội dung hero + phần "Vì sao chọn" `[?]`
- Có muốn **tất cả 333** sản phẩm hiện ra web không, hay chọn lọc `[?]`
- `ProductRecord` có chứa ghi chú nội bộ không nên ra ngoài không `[?]` (xem 8b.2)

---

## 10. Ưu tiên khi phải cắt

Cắt từ dưới lên. **Không bao giờ cắt P0.**

| | Hạng mục |
|---|---|
| **P0** | Giá web === giá Báo giá · Ranh giới công khai/riêng tư · Sản phẩm đã tắt không lộ · **4 tab cũ không bị ảnh hưởng** |
| **P1** | Responsive · Sáng/Tối · Bàn phím · Hiệu năng |
| **P2** | SEO · Chuyển động · Ảnh chia sẻ mạng xã hội |
