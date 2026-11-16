import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Send API calls to the backend in /server during development
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
