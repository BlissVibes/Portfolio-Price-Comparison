import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { priceLookupApiPlugin } from './vite-api-plugin'

// https://vite.dev/config/
export default defineConfig({
  // Use repo name as base path when deploying to GitHub Pages
  base: process.env.GITHUB_PAGES ? '/Portfolio-Price-Comparison/' : '/',
  plugins: [
    priceLookupApiPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'Portfolio Price Comparison',
        short_name: 'Price Comp',
        description: 'Compare Collectr CSV exports to track card prices over time',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        icons: [
          {
            src: 'vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
