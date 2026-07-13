# GitHub Pages deployment

- Source: GitHub Actions.
- Production domain: `saigonfox.online`.
- Build root: `owin-quote-tool`.
- Required Actions secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Workflow chạy lint, test và production build trước khi deploy.
- `service_role`, PAT và mật khẩu người dùng không được đưa vào repository hoặc bundle.

Dữ liệu nghiệp vụ nằm trên Supabase. Chỉ khi cứu dữ liệu từ bản cũ mới cần mở menu trên đúng trình duyệt còn IndexedDB và chạy công cụ khôi phục một lần.
