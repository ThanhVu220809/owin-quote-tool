import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/tokens.css'
import '@/styles/ios.css'
import '@/styles/components.css'
import '@/styles/patterns.css'
import '@/styles/shell.css'
import { initAppearance } from '@/features/settings/appearance'
import App from '@/App'

initAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
