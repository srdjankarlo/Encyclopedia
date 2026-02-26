import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This allows the Docker container to talk to your Windows browser
    port: 5173,
    watch: {
      usePolling: true, // Necessary for Windows to detect file changes inside Docker
    },
  },
})