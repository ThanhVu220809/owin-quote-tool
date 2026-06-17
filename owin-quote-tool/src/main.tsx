import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/ios.css'
import './styles/owin-theme.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
