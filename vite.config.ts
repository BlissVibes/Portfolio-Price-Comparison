import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { priceLookupApiPlugin } from './vite-api-plugin'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages uses the repo name as base; production builds are served under
  // "/portfolio/" (behind the site proxy); dev stays at "/".
  base: process.env.GITHUB_PAGES
    ? '/Portfolio-Price-Comparison/'
    : command === 'build'
    ? '/portfolio/'
    : '/',
  plugins: [
    priceLookupApiPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      base: '/portfolio/',
      includeAssets: ['vite.svg'],
      workbox: {
        navigateFallback: '/portfolio/index.html',
      },
      manifest: {
        name: 'Portfolio Price Comparison',
        short_name: 'Price Comp',
        description: 'Compare Collectr CSV exports to track card prices over time',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        scope: '/portfolio/',
        start_url: '/portfolio/',
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
}))
