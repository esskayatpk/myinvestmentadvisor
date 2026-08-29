import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.svg', 'icon-512.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: 'My Investment Advisor',
        short_name: 'InvAdvisor',
        description: 'AI-powered investment research platform — portfolio analysis, market scanner, real estate analyzer, live news ticker.',
        theme_color: '#111827',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['finance', 'business'],
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Pre-cache all build output (app shell — loads instantly offline)
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
        // Runtime caching for external APIs
        runtimeCaching: [
          {
            // Finnhub — company news, quotes, fundamentals
            urlPattern: /^https:\/\/finnhub\.io\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'finnhub-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 60 },
              networkTimeoutSeconds: 8,
            },
          },
          {
            // ExchangeRate-API — forex rates
            urlPattern: /^https:\/\/v6\.exchangerate-api\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'forex-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 8,
            },
          },
          {
            // Alpha Vantage — forex TA history
            urlPattern: /^https:\/\/www\.alphavantage\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'av-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 30 * 60 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Polygon.io — price history fallback
            urlPattern: /^https:\/\/api\.polygon\.io\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'polygon-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 15 * 60 },
              networkTimeoutSeconds: 8,
            },
          },
        ],
      },
    }),
  ],
  base: './',
  server: {
    host: true,
    port: 5174,
    proxy: {
      // Yahoo Finance price/quote proxy (avoids CORS in dev)
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
      },
      '/api/yahoo2': {
        target: 'https://query2.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo2/, ''),
      },
    },
  },
})
