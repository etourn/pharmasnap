import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
  ],
  // pre-bundle at startup so Vite doesn't discover it mid-load and force a reload
  optimizeDeps: {
    include: ["firebase/auth"],
  },
})