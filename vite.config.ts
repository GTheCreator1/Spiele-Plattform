import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Spiele-Plattform/',
  plugins: [react(), {
    name: 'stichrunde-content-security',
    apply: 'build',
    transformIndexHtml: () => [{
      tag: 'meta',
      injectTo: 'head-prepend',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; connect-src 'self' https://0.peerjs.com wss://0.peerjs.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'",
      },
    }],
  }],
  build: {
    target: ['chrome111', 'firefox114', 'safari16.4', 'edge111'],
  },
})
