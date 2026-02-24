import { useState, useMemo, useEffect } from 'react';
import type { CardComparison, PortfolioFile } from '../types';

interface Props {
  comparisons: CardComparison[];
  portfolios: PortfolioFile[];
}

type SortKey = 'productName' | 'set' | 'category' | 'priceChange' | 'priceChangePct';
type SortDir = 'asc' | 'desc';
type FilterMode = 'all' | 'gained' | 'lost' | 'new' | 'removed';

const VENDOR_DEFAULT_COLOR = '#9333ea';
const MOBILE_BREAKPOINT = 768;

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function pct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

/** Convert a hex color to a low-opacity rgba background tint. */
function vendorBg(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.22)`;
}

/** Columns hidden in mobile view: card game, card #, rarity, and all portfolio columns. */
function buildMobileHidden(portfolioIds: string[]): Set<string> {
  return new Set(['category', 'cardNumber', 'rarity', ...portfolioIds]);
}

export default function ComparisonTable({ comparisons, portfolios }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'priceChange',
    dir: 'desc',
  });
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [vendorMode, setVendorMode] = useState(false);
  const [vendorColor, setVendorColor] = useState(VENDOR_DEFAULT_COLOR);
  const [markedCards, setMarkedCards] = useState<Map<string, string>>(new Map());

  // Initialise mobile view and column visibility based on current screen width
  const [mobileView, setMobileView] = useState(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
  );
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() =>
    window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
      ? buildMobileHidden(portfolios.map((p) => p.id))
      : new Set()
  );
  const [showColPanel, setShowColPanel] = useState(false);

  // Auto-detect screen size changes and update mobile view accordingly
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => {
      const mobile = e.matches;
      setMobileView(mobile);
      setHiddenColumns(mobile ? buildMobileHidden(portfolios.map((p) => p.id)) : new Set());
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [portfolios]);

  // When new portfolios are added while in mobile view, hide their columns too
  useEffect(() => {
    if (mobileView) {
      setHiddenColumns(buildMobileHidden(portfolios.map((p) => p.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios]);

  function toggleMobileView() {
    setMobileView((v) => {
      const next = !v;
      setHiddenColumns(next ? buildMobileHidden(portfolios.map((p) => p.id)) : new Set());
      return next;
    });
  }

  function toggleColumn(key: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const show = (key: string) => !hiddenColumns.has(key);

  const categories = useMemo(() => {
    const cats = new Set(comparisons.map((c) => c.category));
    return ['all', ...Array.from(cats).sort()];
  }, [comparisons]);

  const multipleSnapshots = portfolios.length >= 2;

  // Determine the latest portfolio by date (not upload order)
  const latestPortfolioId = useMemo(() => {
    if (portfolios.length === 0) return '';
    const sorted = [...portfolios].sort((a, b) =>
      a.marketPriceDate.localeCompare(b.marketPriceDate)
    );
    return sorted[sorted.length - 1].id;
  }, [portfolios]);

  const filtered = useMemo(() => {
    let result = comparisons;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.productName.toLowerCase().includes(q) ||
          c.set.toLowerCase().includes(q) ||
          c.cardNumber.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((c) => c.category === categoryFilter);
    }

    if (multipleSnapshots) {
      if (filter === 'gained') result = result.filter((c) => (c.priceChange ?? 0) > 0);
      if (filter === 'lost') result = result.filter((c) => (c.priceChange ?? 0) < 0);
      if (filter === 'new') result = result.filter((c) => c.snapshots.length === 1 && c.snapshots[0].portfolioId === latestPortfolioId);
      if (filter === 'removed') result = result.filter((c) => c.snapshots.length === 1 && c.snapshots[0].portfolioId !== latestPortfolioId);
    }

    return [...result].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sort.key === 'priceChange') { av = a.priceChange ?? -Infinity; bv = b.priceChange ?? -Infinity; }
      else if (sort.key === 'priceChangePct') { av = a.priceChangePct ?? -Infinity; bv = b.priceChangePct ?? -Infinity; }
      else { av = (a[sort.key] as string).toLowerCase(); bv = (b[sort.key] as string).toLowerCase(); }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [comparisons, search, categoryFilter, filter, sort, latestPortfolioId, multipleSnapshots]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    );
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sort.key !== k) return <span className="sort-icon sort-icon--inactive">↕</span>;
    return <span className="sort-icon">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  }

  function handleRowClick(cardKey: string) {
    if (!vendorMode) return;
    setMarkedCards((prev) => {
      const next = new Map(prev);
      if (next.has(cardKey)) {
        next.delete(cardKey);
      } else {
        next.set(cardKey, vendorColor);
      }
      return next;
    });
  }

  // Sorted portfolios by date for column headers
  const sortedPortfolios = [...portfolios].sort((a, b) =>
    a.marketPriceDate.localeCompare(b.marketPriceDate)
  );

  return (
    <section className="table-section">
      <h2 className="section-title">Card Price Comparison</h2>

      <div className="table-controls">
        <input
          className="search-input"
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'all' ? 'All Card Games' : c}</option>
          ))}
        </select>
        {multipleSnapshots && (
          <div className="filter-tabs">
            {(['all', 'gained', 'lost', 'new', 'removed'] as FilterMode[]).map((f) => (
              <button
                key={f}
                className={`filter-tab ${filter === f ? 'filter-tab--active' : ''}`}
                onClick={() => {
                  setFilter(f);
                  // Auto-adjust sort direction so the most significant changes stay on top
                  if (sort.key === 'priceChange' || sort.key === 'priceChangePct') {
                    setSort((prev) => ({
                      ...prev,
                      dir: f === 'lost' ? 'asc' : 'desc',
                    }));
                  }
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}

        <div className="vendor-controls">
          <div className="col-toggle-wrap">
            <button
              className={`col-toggle-btn ${showColPanel ? 'col-toggle-btn--active' : ''}`}
              onClick={() => setShowColPanel((v) => !v)}
            >
              Columns {showColPanel ? '▲' : '▼'}
            </button>
            {showColPanel && (
              <div className="col-panel">
                {[
                  { key: 'category', label: 'Card Game' },
                  { key: 'set', label: 'Set' },
                  { key: 'cardNumber', label: 'Card #' },
                  { key: 'rarity', label: 'Rarity' },
                  { key: 'grade', label: 'Grade' },
                  ...sortedPortfolios.map((p) => ({ key: p.id, label: p.filename })),
                  ...(multipleSnapshots
                    ? [{ key: 'change', label: 'Change' }, { key: 'changePct', label: 'Change%' }]
                    : []),
                ].map(({ key, label }) => (
                  <label key={key} className="col-panel-item">
                    <input
                      type="checkbox"
                      checked={show(key)}
                      onChange={() => toggleColumn(key)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            className={`mobile-view-btn ${mobileView ? 'mobile-view-btn--active' : ''}`}
            onClick={toggleMobileView}
            title={mobileView ? 'Switch to desktop view (show all columns)' : 'Switch to mobile view (hide less important columns)'}
          >
            {mobileView ? '📱' : '🖥️'} Mobile View
          </button>

          <button
            className={`vendor-mode-btn ${vendorMode ? 'vendor-mode-btn--active' : ''}`}
            onClick={() => setVendorMode((v) => !v)}
            title={vendorMode ? 'Exit Vendor Mode' : 'Vendor Mode — click rows to mark as dealt with'}
          >
            {vendorMode ? '✓ Vendor Mode' : 'Vendor Mode'}
          </button>
          {vendorMode && (
            <input
              type="color"
              className="vendor-color-picker"
              value={vendorColor}
              onChange={(e) => setVendorColor(e.target.value)}
              title="Mark color"
            />
          )}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              {show('category') && (
                <th onClick={() => toggleSort('category')} className="th-sortable">
                  Card Game <SortIcon k="category" />
                </th>
              )}
              {show('set') && (
                <th onClick={() => toggleSort('set')} className="th-sortable">
                  Set <SortIcon k="set" />
                </th>
              )}
              <th onClick={() => toggleSort('productName')} className="th-sortable">
                Card <SortIcon k="productName" />
              </th>
              {show('cardNumber') && <th>Card #</th>}
              {show('rarity') && <th>Rarity</th>}
              {show('grade') && <th>Grade</th>}
              {sortedPortfolios.map((p) =>
                show(p.id) ? (
                  <th key={p.id} className="th-price">
                    <span className="th-price__file">{p.filename}</span>
                    {p.marketPriceDate && (
                      <span className="th-price__date">{p.marketPriceDate}</span>
                    )}
                  </th>
                ) : null
              )}
              {multipleSnapshots && show('change') && (
                <th onClick={() => toggleSort('priceChange')} className="th-sortable th-price">
                  Change <SortIcon k="priceChange" />
                </th>
              )}
              {multipleSnapshots && show('changePct') && (
                <th onClick={() => toggleSort('priceChangePct')} className="th-sortable th-price">
                  Change% <SortIcon k="priceChangePct" />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={99} className="empty-row">No cards match your filters.</td>
              </tr>
            )}
            {filtered.map((card) => {
              const isRemoved =
                card.snapshots.length === 1 &&
                card.snapshots[0].portfolioId !== latestPortfolioId;

              const markedColor = markedCards.get(card.key);

              const changeClass =
                card.priceChange === null
                  ? ''
                  : card.priceChange > 0
                  ? 'row--gain'
                  : card.priceChange < 0
                  ? 'row--loss'
                  : '';

              const rowClass = [
                markedColor ? '' : isRemoved ? 'row--removed' : changeClass,
                vendorMode ? 'row--vendor-clickable' : '',
              ].filter(Boolean).join(' ');

              const rowStyle = markedColor
                ? {
                    backgroundColor: vendorBg(markedColor),
                    boxShadow: `inset 3px 0 0 ${markedColor}`,
                  }
                : undefined;

              return (
                <tr
                  key={card.key}
                  className={rowClass}
                  style={rowStyle}
                  onClick={() => handleRowClick(card.key)}
                >
                  {show('category') && <td>{card.category}</td>}
                  {show('set') && <td>{card.set}</td>}
                  <td className="td-name">
                    {card.productName}
                    {card.variance && card.variance !== 'Normal' && (
                      <span className="badge">{card.variance}</span>
                    )}
                  </td>
                  {show('cardNumber') && <td>{card.cardNumber}</td>}
                  {show('rarity') && <td>{card.rarity}</td>}
                  {show('grade') && <td>{card.grade !== 'Ungraded' ? card.grade : '—'}</td>}
                  {sortedPortfolios.map((p) => {
                    if (!show(p.id)) return null;
                    const snap = card.snapshots.find((s) => s.portfolioId === p.id);
                    return (
                      <td key={p.id} className="td-price">
                        {snap ? (
                          <>
                            {fmt(snap.marketPrice)}
                            {snap.quantity > 1 && (
                              <span className="qty"> ×{snap.quantity}</span>
                            )}
                          </>
                        ) : (
                          <span className="td-missing">—</span>
                        )}
                      </td>
                    );
                  })}
                  {multipleSnapshots && show('change') && (
                    <td className={`td-price td-change ${card.priceChange === null ? '' : card.priceChange >= 0 ? 'td-gain' : 'td-loss'}`}>
                      {card.priceChange !== null
                        ? (card.priceChange >= 0 ? '+' : '') + fmt(card.priceChange)
                        : '—'}
                    </td>
                  )}
                  {multipleSnapshots && show('changePct') && (
                    <td className={`td-price td-change ${card.priceChangePct === null ? '' : card.priceChangePct >= 0 ? 'td-gain' : 'td-loss'}`}>
                      {card.priceChangePct !== null ? pct(card.priceChangePct) : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        {vendorMode && markedCards.size > 0 && (
          <span className="vendor-footer">
            {markedCards.size} marked ·{' '}
            <button className="vendor-clear-btn" onClick={() => setMarkedCards(new Map())}>
              clear all
            </button>
            {' · '}
          </span>
        )}
        Showing {filtered.length} of {comparisons.length} cards
      </div>
    </section>
  );
}
