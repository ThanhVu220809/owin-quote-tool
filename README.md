# OWIN Quote Tool

### Báo giá cửa nhôm chuyên nghiệp — từ catalogue đến file gửi khách trong vài giây

<p align="center">
  <a href="https://saigonfox.online"><img src="https://img.shields.io/badge/🟢_Live-saigonfox.online-22c55e?style=for-the-badge" alt="Live" /></a>
  &nbsp;
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
</p>

<p align="center">
  <strong><a href="https://saigonfox.online">→ Mở ứng dụng production</a></strong>
</p>

---

## ✨ Một dòng

Công cụ nội bộ cho sales / xưởng cửa nhôm: quản lý sản phẩm, lập báo giá, xuất **Word · Excel · PDF**, tính nhôm — realtime đa máy, mobile-ready, deploy domain riêng.

---

## 🧩 Modules

<table>
<tr>
<td width="50%" valign="top">

### 📦 Sản phẩm
Catalogue đầy đủ: mã, danh mục, đơn vị  
(m² / mét / bộ), giá, specs, gallery.  
Phụ kiện theo set + gói gợi ý.  
Kéo-thả sắp xếp bảng giá.

</td>
<td width="50%" valign="top">

### 📝 Báo giá
Chọn SP → kích thước → SL → phụ kiện.  
Snapshot giá lúc chốt (không lệch sau này).  
Lọc danh mục, khoá dòng gọn.  
Smart input tiền / số (gõ thô, format lúc blur).

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📒 Bảng giá
Xem catalogue block đẹp như file in.  
Ảnh scale fit ô (web + PDF).  
Xuất theo 1 loại cửa hoặc toàn bộ.  
Word khoá chỉnh sửa (read-only + password).

</td>
<td width="50%" valign="top">

### 🧮 Tính nhôm
Ước lượng thanh profile theo hệ / màu.  
Giá đơn vị theo màu, SL = số cái.  
Export Word / PDF kèm ảnh profile.

</td>
</tr>
</table>

---

## 📤 Export — điểm mạnh

| Định dạng | Báo giá | Bảng giá | Tính nhôm |
|:---------:|:-------:|:--------:|:---------:|
| **Word (.docx)** | ✅ | ✅ read-only | ✅ |
| **Excel (.xlsx)** | ✅ | ✅ | — |
| **PDF** | ✅ tải file | ✅ tải file | ✅ |

- Chạy **100% trên trình duyệt** — không server render, không API export  
- Template bám layout sales thật (ảnh, phụ kiện, tổng VND, font tiếng Việt)  
- PDF không phụ thuộc print dialog trình duyệt  

---

## 🏗️ Công nghệ

```text
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│   React 19  ·  TypeScript  ·  Vite 8  ·  Design system  │
│   Mobile portrait / landscape  ·  Global image lightbox │
└───────────────────────┬─────────────────────────────────┘
                        │
          Auth · REST · Realtime · Storage URL
                        │
┌───────────────────────▼─────────────────────────────────┐
│                      SUPABASE                           │
│   Auth (email)  ·  Postgres (JSON document + index)     │
│   Storage (CDN ảnh)  ·  Realtime multi-device            │
│   RLS  ·  soft-delete  ·  optimistic revision           │
└─────────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                   GITHUB PAGES                          │
│   CI: lint · test · build  →  deploy saigonfox.online   │
└─────────────────────────────────────────────────────────┘
```

### Stack chi tiết

| Tầng | Công nghệ |
|------|-----------|
| UI | React 19, TypeScript, Lucide icons, custom CSS design system |
| Build | Vite 8, ESLint, Vitest |
| Backend | Supabase Auth · Postgres · Storage · Realtime |
| Export | docxtemplater + PizZip · ExcelJS · jsPDF + Noto Sans Vietnamese |
| Ảnh | WebP master + thumbnail · lazy load · compression 4K-class |
| Deploy | GitHub Actions → GitHub Pages · custom domain |

---

## 🧠 Logic nghiệp vụ “nặng”

Không phải CRUD form. Engine tính toán tách lớp, pure, testable:

| Bài toán | Cách xử lý |
|----------|------------|
| Đơn vị m² / md / bộ lẫn phụ kiện | Quantity engine + rule phụ kiện cố định |
| Tiền VND, làm tròn theo thói quen bán hàng | Rounding / totals riêng, không dính UI |
| Phụ kiện md/m² khi không có khối lượng | Fallback SL × đơn giá — đúng thực tế xưởng |
| Nhiều máy cùng sửa | Realtime + revision + soft-delete chống “hồi sinh” data |
| Catalogue đổi sau khi đã báo giá | Snapshot full document lúc lưu quote |
| Ảnh HD vs performance | Master sắc nét + thumb nhỏ + lazy |

---

## 📱 Trải nghiệm

- **Desktop** — tool shell gọn, nav 4 tab, form densified  
- **Phone portrait** — control nhỏ, không chen chúc, dùng ngoài công trình  
- **Phone landscape / mini desktop** — layout nén riêng  
- **Lightbox** — chạm ảnh là zoom full  
- **Chỉ Lưu mới ghi server** — không autosave bất ngờ  

---

## 🔐 Bảo mật & vận hành

| Nguyên tắc | Thực tế |
|------------|---------|
| Secret trên client | Chỉ `anon` key public · không `service_role` |
| Quyền dữ liệu | RLS Postgres · signup public tắt |
| Ảnh báo giá | Bucket private · catalogue public URL có kiểm soát |
| Data cũ trình duyệt | Đã migrate hết lên Supabase |
| CI/CD | Lint + test bắt buộc trước deploy |

---

## 🚀 Production

| | |
|--|--|
| **URL** | [https://saigonfox.online](https://saigonfox.online) |
| **Hosting** | GitHub Pages |
| **Data** | Supabase (EU/region project) |
| **CI** | GitHub Actions on `main` |

---

## 🔗 Cùng profile

Hệ IoT **BA.SEW** (SOS GPS) — stack khác, cùng tác giả:

| Project | Mô tả |
|---------|--------|
| [esp32_sim_neo10](https://github.com/ThanhVu220809/esp32_sim_neo10) | Firmware ESP32-S3 · SOS · 4G · FreeRTOS |
| [Landing_page](https://github.com/ThanhVu220809/Landing_page) | Landing bán thiết bị |
| [Tracking_page](https://github.com/ThanhVu220809/Tracking_page) | Bản đồ theo dõi realtime |

---

<p align="center">
  <sub>Built for real shop-floor quoting · OWIN · React · Supabase · client-side export</sub>
</p>
