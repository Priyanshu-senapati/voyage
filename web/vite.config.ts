import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const api = { '/v1': process.env.VOYANCE_API ?? 'http://127.0.0.1:8000' }

// /v1 goes to the FastAPI app, so the dashboard needs no CORS setup in dev or preview
export default defineConfig({
  plugins: [react()],
  server: { proxy: api },
  preview: { proxy: api },
})
