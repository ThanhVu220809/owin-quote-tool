import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages project site phục vụ tại /<repo>/.
  // 👤 HUMAN: sửa BASE_PATH (env) hoặc default dưới cho khớp TÊN REPO thật.
  // Dev luôn '/'.
  base: mode === 'production' ? (process.env.BASE_PATH ?? '/owin-quote-tool/') : '/',
  plugins: [react()],
  // Honor a PORT env when provided (preview tooling) — normal `npm run dev` still defaults to 5173.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Tránh "Invalid hook call" do 2 bản React (lucide-react dùng useContext).
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'lucide-react'],
  },
}))
