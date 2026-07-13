# GitHub Pages deployment

- Source: GitHub Actions.
- Production domain: `saigonfox.online`.
- Build root: `owin-quote-tool`.
- Required Actions secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Workflow chạy lint, test và production build trước khi deploy.
- `service_role`, PAT và mật khẩu người dùng không được đưa vào repository hoặc bundle.

Dữ liệu nghiệp vụ nằm hoàn toàn trên Supabase; bản production không dùng browser database.
