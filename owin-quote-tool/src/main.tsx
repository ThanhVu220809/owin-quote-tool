import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/ios.css'
import './styles/owin-theme.css'
import App from './App.tsx'
import { purgeLegacyOAuthConfig } from './features/sync/legacyConfigCleanup'

// Dọn key cấu hình OAuth cũ (nếu còn) — không chặn render, không đụng dữ liệu.
void purgeLegacyOAuthConfig();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
