import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Spiele-Plattform/',
  plugins: [react()],
  build: {
    target: ['chrome111', 'firefox114', 'safari16.4', 'edge111'],
  },
})
