import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const relaisApi = {
  '/api': {
    target: process.env.VITE_API_PROXY ?? 'http://localhost:3001',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH ?? '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // En développement, l'interface tourne sur 5173 et l'API sur 3001 : le
  // relais évite d'avoir à gérer une configuration CORS différente de celle de
  // la production, où nginx joue ce rôle. La prévisualisation d'un build local
  // utilise le même relais.
  server: { proxy: relaisApi },
  preview: { proxy: relaisApi },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
