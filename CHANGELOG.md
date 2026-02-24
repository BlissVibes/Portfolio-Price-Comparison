# Changelog

All notable changes to this project will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

---

## [1.2.2] - 2026-02-24

### Fixed
- Filter tabs (All / Gained / Lost / New / Removed) no longer disappear on mobile — caused by `flex-wrap` creating an invisible overflow column
- Table horizontal scrolling restored on mobile (`white-space: nowrap` on cells, `-webkit-overflow-scrolling: touch`)
- Columns dropdown no longer clips off the left edge of the screen on mobile (opens rightward)
- Columns dropdown still lists all columns on mobile; mobile view only changes the checked defaults, not which options appear

### Changed
- Mobile default columns revised: Set, Card, Grade, most-recent portfolio, Change $, Change % are shown; Card Game, Card #, Rarity, and older portfolio columns are hidden by default
- Card number appended inline to card name on mobile view (e.g. Charizard — 11/102) since the Card # column is hidden
- Grade display now shows only the grade identifier (e.g. PSA 9.0, BGS 9.5) — full descriptive name kept only for Tag 10 Pristine, BGS 10 Pristine, BGS 10 Gem Mint, and BGS 10 Black Label
- Variant badge removed; replaced with a yellow Sealed badge for booster boxes, ETBs, booster bundles, booster packs, EX boxes, Ultra Premium Collections, and tins

---

## [1.2.1] - 2026-02-24

### Added
- Mobile view toggle button (📱 / 🖥️) next to the Columns dropdown — auto-detects mobile screens on load and hides Card Game, Card #, Rarity, and imported portfolio columns by default, leaving Set, Grade, Change, and Change % visible
- Columns, Mobile View, and Vendor Mode controls left-align on narrow screens instead of floating right

---

## [1.1.0] - 2026-02-24

### Added
- Vendor Mode: toggle from the table controls to enter a click-to-mark workflow
- In Vendor Mode, clicking any row marks it with the selected color (default purple) to indicate the price change has been dealt with; clicking again unmarks it
- Color picker in Vendor Mode lets the user choose any mark color per session
- "X marked · clear all" counter in the table footer while Vendor Mode is active
- Removed items (cards present in earlier snapshots but dropped from the latest) now show an orange tint in all filter views

### Fixed
- Price change calculation no longer corrupted by duplicate card rows in a single CSV export

---

## [1.0.2] - 2026-02-24

### Changed
- Deployed version 1.0.2

---

## [1.0.1] - 2026-02-24

### Added
- Display version number in app header
- CSV portfolio import feature

### Fixed
- Sort direction reset when switching to Lost filter
- New/Removed filters now use date-sorted portfolio ID

---

## [0.1.0] - 2026-02-24

### Added
- Initial release — Collectr CSV portfolio price comparison web app
- Drag & drop (or browse) to import one or more Collectr CSV exports
- Portfolio snapshot summary cards showing market value, cost basis, and P&L per export
- Side-by-side card price comparison table across all uploaded snapshots
- Price change ($) and percentage between earliest and latest snapshot
- Sortable columns: category, set, card name, price change, change %
- Search bar to filter by card name, set, or card number
- Category filter dropdown (e.g. Pokemon, One Piece)
- Filter tabs: All / Gained / Lost / New / Removed
- Gain/loss color coding (green/red rows and values)
- Remove individual snapshots from the comparison
- PWA support — installable on mobile as a standalone app
- GitHub Pages deployment via GitHub Actions
