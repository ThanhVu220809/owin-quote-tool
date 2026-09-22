import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(() => ({
  // The custom domain serves the app at the root; BASE_PATH remains available for previews.
  base: process.env.BASE_PATH ?? '/',
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
