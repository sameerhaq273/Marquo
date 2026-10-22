import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // One 740 kB bundle blocks the first paint and the first interaction with it. Splitting
    // the libraries out lets the browser fetch them in parallel, and keeps them cached
    // across deploys that only change app code.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'react'
          if (/node_modules\/(@mui|@emotion)\//.test(id)) return 'mui'
        },
      },
    },
  },
  server: {
    proxy: {
      // Flask API (server.py) runs the Python scraper
      '/api': 'http://127.0.0.1:5000',
    },
  },
})
