# Portfolio Price Comparison

A web app for comparing Collectr CSV exports to track trading card prices over time.

## Features

- Import multiple Collectr CSV exports via drag & drop or file picker
- Portfolio snapshot summaries: market value, cost basis, and P&L per export
- Side-by-side price comparison table across all snapshots
- Price change ($) and % between earliest and latest snapshot
- Sort, search, and filter by category, gain/loss, new, or removed cards
- PWA support — installable on mobile like a native app

## Usage

1. Export your portfolio from Collectr as a CSV
2. Drop the CSV into the app
3. Export again later and drop in the new CSV to see price changes

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
