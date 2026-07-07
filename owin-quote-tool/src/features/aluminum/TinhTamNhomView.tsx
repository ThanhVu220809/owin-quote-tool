import { Calculator } from 'lucide-react';

export function TinhTamNhomView() {
  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="app-title">Tính tạm nhôm</h1>
          <p className="app-subtitle">Công cụ ước tính nhôm sẽ được bổ sung ở bước tiếp theo.</p>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Tạm tính vật tư nhôm</div>
        <div className="muted" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calculator size={22} />
          <span>Trang đã sẵn sàng trong menu. Logic tính chi tiết chưa được port trong phase này.</span>
        </div>
      </div>
    </div>
  );
}
