import { useMemo } from 'react';
import type { Customer, QuoteLine } from '@/types/models';
import { buildFormat1Data, buildFormat2Data } from '@/features/export/buildQuoteData';

interface Props {
  format: 1 | 2;
  customer: Customer;
  lines: QuoteLine[];
  /** imageId → dataURL, cho cột ảnh Format 2. */
  imageMap: Record<string, string>;
  tamUng: number;
}

/** Multi-line text → các <div> để giữ \n (linebreaks). */
function MultiLine({ text }: { text: string | number | boolean }) {
  const s = String(text ?? '');
  if (s === '') return null;
  return (
    <>
      {s.split('\n').map((ln, i) => (
        <div key={i}>{ln}</div>
      ))}
    </>
  );
}

/** Preview WYSIWYG — cấu trúc dòng SP trên, dòng phụ kiện ngay dưới (trống STT/Mã). */
export function QuotePreview({ format, customer, lines, imageMap, tamUng }: Props) {
  const data = useMemo(
    () =>
      format === 1
        ? buildFormat1Data(customer, lines, tamUng)
        : buildFormat2Data(customer, lines, imageMap, tamUng),
    [format, customer, lines, imageMap, tamUng],
  );

  return (
    <div className="preview-doc" data-testid={`preview-f${format}`}>
      <div className="doc-title">
        {format === 1 ? 'BÁO GIÁ CÔNG TRÌNH' : 'BẢNG GIÁ HOÀN THIỆN NHÔM OWIN'}
      </div>
      <div className="cust">
        <div><b>Khách hàng:</b> {data.ten_kh || '—'}</div>
        <div><b>Địa chỉ:</b> {data.dia_chi || '—'}</div>
        <div><b>SĐT:</b> {data.sdt || '—'} &nbsp; <b>Email:</b> {data.email || '—'}</div>
      </div>

      <table>
        <thead>
          {format === 1 ? (
            <tr>
              <th>STT</th>
              <th>Mã</th>
              <th>Mô tả</th>
              <th>ĐVT</th>
              <th>Rộng</th>
              <th>Cao</th>
              <th>SL</th>
              <th>KL</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
            </tr>
          ) : (
            <tr>
              <th>STT</th>
              <th>Ảnh</th>
              <th>Mã</th>
              <th>Mô tả</th>
              <th>Kích thước</th>
              <th>ĐVT</th>
              <th>SL</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
            </tr>
          )}
        </thead>
        <tbody>
          {(data.items as Array<Record<string, string | number | boolean>>).map((it, idx) =>
            format === 1 ? (
              <tr key={idx} className={it.is_pk ? 'pk-row' : ''}>
                <td className="num">{it.stt as string | number}</td>
                <td>{it.ma as string}</td>
                <td><MultiLine text={it.mo_ta} /></td>
                <td>{it.dvt as string}</td>
                <td className="num">{it.rong as string | number}</td>
                <td className="num">{it.cao as string | number}</td>
                <td className="num">{it.sl as string | number}</td>
                <td className="num">{it.khoi_luong as string | number}</td>
                <td className="num">{it.don_gia as string}</td>
                <td className="num">{it.thanh_tien as string}</td>
              </tr>
            ) : (
              <tr key={idx} className={(it as { is_pk: boolean }).is_pk ? 'pk-row' : ''}>
                <td className="num">{(it as Record<string, string | number>).stt}</td>
                <td>
                  {(it as Record<string, string>).image ? (
                    <img src={(it as Record<string, string>).image} alt="" />
                  ) : null}
                </td>
                <td>{(it as Record<string, string>).ma}</td>
                <td><MultiLine text={(it as Record<string, string>).mo_ta} /></td>
                <td>{(it as Record<string, string>).kich_thuoc}</td>
                <td>{(it as Record<string, string>).dvt}</td>
                <td className="num">{(it as Record<string, string | number>).sl}</td>
                <td className="num">{(it as Record<string, string>).don_gia}</td>
                <td className="num">{(it as Record<string, string>).thanh_tien}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <div className="totals">
        <div><b>Tổng cộng:</b> {data.tong_tien}</div>
        <div>Tạm ứng: {data.tam_ung}</div>
        <div><b>Còn lại:</b> {data.con_lai}</div>
      </div>
    </div>
  );
}
