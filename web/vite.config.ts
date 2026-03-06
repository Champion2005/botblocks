import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pyodidePlugin from 'vite-plugin-pyodide'

export default defineConfig({
  plugins: [react(), tailwindcss(), pyodidePlugin({ base: './public' })],
  optimizeDeps: {
    include: ['highlight.js'],
  },
  server: {
    proxy: {
      '/proxy/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/proxy\/openai/, ''),
      },
      '/proxy/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/proxy\/anthropic/, ''),
      },
    },
  },
})
