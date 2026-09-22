# OWIN Font Weight Guide

Tài liệu này là chuẩn dùng chung khi xây mới hoặc chỉnh sửa giao diện OWIN.
Mục tiêu là mọi chức năng có cùng nhịp chữ, cùng mức nhấn và không tự phát sinh
thêm độ đậm ngoài hệ thống.

## 1. Thang font weight chuẩn

Toàn bộ giao diện chỉ dùng bốn mức sau với font `Roboto`:

| Token vai trò | Giá trị | Dùng cho |
| --- | ---: | --- |
| `regular` | `400` | Nội dung thường, input, mô tả, ghi chú, dữ liệu bảng |
| `medium` | `500` | Nhãn field, metadata, tab chưa chọn, giá trị phụ |
| `semibold` | `600` | Nút, section label, table header, trạng thái, dữ liệu cần nhấn |
| `bold` | `700` | Tiêu đề màn/card, tổng tiền quan trọng, CTA hoặc badge chính |

Không dùng `100–300`, `800`, `900`, `normal`, `bold`, `bolder` hoặc
`lighter`. Khi cần tăng phân cấp, ưu tiên đổi cỡ chữ, màu hoặc khoảng cách trước
khi tăng độ đậm.

## 2. Cách chọn weight theo thành phần

| Thành phần | Weight mặc định |
| --- | ---: |
| Body, paragraph, helper text, placeholder | `400` |
| Text trong input/select/textarea | `400` |
| Field label, metadata, caption | `500` |
| Button, link hành động, tab đang chọn | `600` |
| Section label, table header | `600` |
| Tên sản phẩm, mã báo giá, giá trị tiền cần chú ý | `600` |
| Tiêu đề trang, dialog, card chính | `700` |
| Tổng cuối cùng, số liệu quan trọng nhất | `700` |

Một thành phần chỉ được tăng một cấp khi trạng thái hoặc ý nghĩa thực sự quan
trọng hơn thành phần cạnh nó. Không làm toàn bộ một card thành `600` hoặc `700`.

## 3. Khai báo token trong stylesheet của feature

Feature mới khai báo một lần ở phần đầu stylesheet và tất cả component con phải
tham chiếu các token này:

```css
.feature-page {
  --feature-weight-regular: 400;
  --feature-weight-medium: 500;
  --feature-weight-semibold: 600;
  --feature-weight-bold: 700;

  font-weight: var(--feature-weight-regular);
}
```

Thay `feature` bằng tên chức năng, ví dụ `product`, `catalogue`, `aluminum`.
Tính năng báo giá hiện dùng `--quote-weight-*` trong
`owin-quote-tool/src/features/quote/quote.css` và là bản tham chiếu.

## 4. Mẫu áp dụng

```css
.feature-field > label {
  font-weight: var(--feature-weight-medium);
}

.feature-action,
.feature-section-label {
  font-weight: var(--feature-weight-semibold);
}

.feature-title,
.feature-grand-total {
  font-weight: var(--feature-weight-bold);
}
```

Trong React, dùng class theo vai trò; không viết weight trực tiếp trong JSX:

```tsx
// Đúng
<span className="feature-total-value">{formattedTotal}</span>

// Không đúng
<span style={{ fontWeight: 700 }}>{formattedTotal}</span>
```

Với biến thể trạng thái, thêm class thay vì tính weight inline:

```tsx
<div className={`feature-total${important ? ' is-important' : ''}`}>
  {formattedTotal}
</div>
```

```css
.feature-total {
  font-weight: var(--feature-weight-semibold);
}

.feature-total.is-important {
  font-weight: var(--feature-weight-bold);
}
```

## 5. Quy tắc triển khai

- Không ghi trực tiếp `font-weight: 500/600/700` bên ngoài khối khai báo token.
- Không dùng inline `style={{ fontWeight: ... }}` trong TSX.
- Không dùng `!important` nếu selector feature bình thường đã đủ độ ưu tiên.
- Nếu phải đè rule dùng chung có `!important`, vẫn dùng token và ghi chú lý do.
- Không dùng độ đậm để thay cho màu trạng thái, hierarchy hoặc spacing.
- Giữ cùng weight ở desktop, tablet và mobile; breakpoint chỉ đổi khi có lý do
  tiếp cận rõ ràng.
- Font weight của tài liệu xuất Word/Excel/PDF phải theo cùng vai trò, dù cơ chế
  khai báo không dùng CSS.

## 6. Checklist trước khi hoàn tất một chức năng

- [ ] Chỉ còn bốn giá trị `400`, `500`, `600`, `700` trong khối token.
- [ ] Body và control nhập liệu dùng `400`.
- [ ] Nhãn phụ dùng `500`; section/action dùng `600`.
- [ ] `700` chỉ dành cho tiêu đề và số liệu quan trọng nhất.
- [ ] Không còn weight inline trong JSX/TSX.
- [ ] Không có `800`, `900`, `bold`, `bolder` hoặc `lighter`.
- [ ] Đã kiểm tra màn danh sách, form, modal, chi tiết và responsive.
- [ ] Đã chạy `npm run lint`, `npm test` và `npm run build`.

Có thể rà nhanh feature bằng lệnh:

```powershell
rg -n "font-weight|fontWeight" src/features/<ten-feature>
```

Kết quả hợp lệ chỉ nên gồm khối khai báo token và các dòng sử dụng
`var(--<ten-feature>-weight-...)`.
