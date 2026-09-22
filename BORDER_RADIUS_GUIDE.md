# OWIN Border Radius Guide

Tài liệu này là chuẩn bo góc dùng chung khi xây mới hoặc chỉnh sửa giao diện
OWIN. Mục tiêu là các chức năng có cùng độ gọn, cùng cấp bề mặt và không tự phát
sinh thêm giá trị `border-radius` ngoài hệ thống.

Chuẩn này lấy màn **Thiết kế & Lập báo giá** làm tham chiếu: card rõ khối nhưng
không bo quá tròn; control và khối nội dung con gọn hơn card; pill chỉ dùng cho
trạng thái hoặc hành động thực sự phù hợp.

## 1. Thang bo góc chuẩn

| Token vai trò | Giá trị | Dùng cho |
| --- | ---: | --- |
| `xs` | `6px` | Ô dữ liệu nhỏ, cell, tag vuông, khối rất compact |
| `sm` | `8px` | Input nhỏ, menu item, ảnh thumbnail, khối con |
| `md` | `10px` | Input, button thường, panel/editor bên trong card |
| `lg` | `14px` | Card chính, modal, popover, bảng dạng card |
| `xl` | `18px` | Bề mặt cấp cao cần tách rõ, chỉ dùng khi thật sự cần |
| `pill` | `999px` | Badge trạng thái, chip, segmented control, nút tròn |

Không tạo thêm các mức như `4px`, `12px`, `16px`, `20px`, `24px` nếu một token
trong bảng đã đáp ứng được vai trò. Khi cảm giác giao diện còn nặng, ưu tiên giảm
padding hoặc khoảng cách trước khi giảm radius xuống mức không có trong thang.

## 2. Khai báo token trong stylesheet của feature

Feature áp dụng chuẩn này phải khai báo thang radius một lần trên phần tử gốc:

```css
.feature-page {
  --r-xs: 6px;
  --r-sm: 8px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-xl: 18px;
  --r-pill: 999px;

  --ios-radius: var(--r-lg);
  --ios-radius-sm: var(--r-md);
}
```

Thay `.feature-page` bằng class gốc của chức năng, ví dụ `.product-page`,
`.catalogue-page` hoặc `.aluminum-page`. Tất cả component con phải tham chiếu
token, không ghi lại giá trị số trực tiếp.

Màn báo giá hiện dùng mẫu sau:

```css
:is(.quote-workflow-page, .quote-detail-page) {
  --r-xs: 6px;
  --r-sm: 8px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-xl: 18px;
  --ios-radius: var(--r-lg);
  --ios-radius-sm: var(--r-md);
}
```

## 3. Chọn radius theo thành phần

| Thành phần | Radius mặc định |
| --- | --- |
| Card nội dung chính | `var(--r-lg)` |
| Modal/dialog | `var(--r-lg)` |
| Popover, dropdown menu | `var(--r-lg)` |
| Panel/editor nằm trong card | `var(--r-md)` |
| Input, select, textarea | `var(--r-md)` |
| Button chữ nhật | `var(--r-md)` |
| Hàng dữ liệu dạng card | `var(--r-sm)` hoặc `var(--r-md)` |
| Thumbnail/khung ảnh nhỏ | `var(--r-sm)` |
| Tag có dáng vuông | `var(--r-xs)` |
| Badge trạng thái, chip, nút tròn | `var(--r-pill)` |
| Ảnh đại diện tròn | `50%` |

`50%` chỉ dành cho phần tử cần là hình tròn theo kích thước thật. Với button,
badge và chip, dùng `var(--r-pill)` để hình dạng ổn định khi chiều rộng thay đổi.

## 4. Quy tắc phân cấp bề mặt

- Bề mặt ngoài phải có radius bằng hoặc lớn hơn bề mặt bên trong.
- Card chính dùng `lg`; panel nằm trong card dùng `md`; cell hoặc thumbnail bên
  trong panel dùng `sm`.
- Không bo từng dòng nếu các dòng đã nằm trong một card chung. Khi đó card ngoài
  chịu trách nhiệm bo góc và các dòng chỉ dùng đường phân cách.
- Không dùng pill cho mọi button. Pill phù hợp với toolbar hành động ngắn, badge,
  trạng thái và control có tính chọn lọc; form button thông thường dùng `md`.
- Tránh đặt nhiều khung bo góc lồng nhau cùng một mức vì làm giao diện dày và tạo
  khoảng trắng thừa.
- Radius không thay cho spacing. Khoảng cách giữa nội dung và viền vẫn phải dùng
  token spacing riêng.

## 5. Mẫu áp dụng

```css
.feature-card {
  border-radius: var(--r-lg);
}

.feature-editor,
.feature-input,
.feature-button {
  border-radius: var(--r-md);
}

.feature-thumbnail,
.feature-row-block {
  border-radius: var(--r-sm);
}

.feature-status,
.feature-chip {
  border-radius: var(--r-pill);
}
```

Trong React, dùng class theo vai trò; không viết radius inline:

```tsx
// Đúng
<section className="feature-card">...</section>

// Không đúng
<section style={{ borderRadius: 14 }}>...</section>
```

## 6. Modal và màn chi tiết

Modal hoặc màn chi tiết nên dùng cấu trúc:

```css
.feature-detail-modal {
  border-radius: var(--r-lg);
  padding: 16px;
}

.feature-detail-section {
  border-radius: var(--r-md);
  padding: 12px;
}

.feature-detail-row {
  border-bottom: 1px solid var(--ios-separator);
}
```

Không bọc mỗi dòng bằng một card riêng nếu danh sách đã có card ngoài. Cách này
giảm cả số lượng góc bo lẫn khoảng trắng giữa các dòng.

## 7. Responsive

- Giữ nguyên token radius giữa desktop, tablet và mobile để nhận diện giao diện
  không thay đổi theo breakpoint.
- Có thể giảm padding và gap trên mobile; không tự giảm `lg` từ `14px` xuống một
  giá trị mới.
- Modal toàn màn hình trên điện thoại có thể bỏ radius ở cạnh tiếp xúc trực tiếp
  với mép viewport, nhưng phải ghi chú rõ lý do trong CSS.
- Vùng bấm tối thiểu không được thu nhỏ chỉ để tương xứng với radius gọn hơn.

## 8. Quy tắc triển khai

- Không ghi trực tiếp `border-radius: 6px/8px/10px/14px/18px/999px` bên ngoài
  khối khai báo token.
- Không dùng inline `style={{ borderRadius: ... }}` trong JSX/TSX.
- Không dùng `!important` nếu selector của feature đã đủ độ ưu tiên.
- Nếu phải đè rule dùng chung có `!important`, vẫn tham chiếu token và ghi chú lý
  do ngay cạnh khai báo.
- Không dùng `overflow: hidden` chỉ để thấy bo góc nếu component có dropdown,
  popover hoặc nội dung cần thoát khỏi khung.
- Khi card cần cắt ảnh hoặc nền con theo góc, chỉ đặt `overflow: hidden` trên đúng
  card đó.

## 9. Checklist trước khi hoàn tất một chức năng

- [ ] Feature đã khai báo đủ thang `xs/sm/md/lg/xl/pill` ở phần tử gốc.
- [ ] Card/modal chính dùng `lg`; panel và control dùng `md`.
- [ ] Thumbnail và khối compact dùng `sm` hoặc `xs`.
- [ ] Pill chỉ xuất hiện ở badge, chip, trạng thái hoặc control phù hợp.
- [ ] Không còn radius số trực tiếp ngoài khối token.
- [ ] Không còn radius inline trong JSX/TSX.
- [ ] Không có nhiều card bo góc lồng nhau gây khoảng trắng dư.
- [ ] Đã kiểm tra desktop, tablet, mobile và nội dung dài.
- [ ] Đã chạy `npm run lint`, `npm test` và `npm run build`.

Có thể rà nhanh một feature bằng lệnh:

```powershell
rg -n "border-radius|borderRadius|--r-" src/features/<ten-feature>
```

Kết quả hợp lệ nên chủ yếu gồm khối khai báo token và các dòng dùng
`var(--r-*)`. Các ngoại lệ như `50%` phải có vai trò hình tròn rõ ràng.
