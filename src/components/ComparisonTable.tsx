import { useState, useMemo, useEffect, useRef } from 'react';
import type { CardComparison, PortfolioFile } from '../types';

interface Props {
  comparisons: CardComparison[];
  portfolios: PortfolioFile[];
}

type SortKey = 'productName' | 'set' | 'category' | 'priceChange' | 'priceChangePct';
type SortDir = 'asc' | 'desc';
type FilterMode = 'all' | 'gained' | 'lost' | 'new' | 'removed' | 'sealed';

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

/** Shared logic for finding the latest portfolio by date. */
function computeLatestPortfolioId(portfolios: PortfolioFile[]): string {
  if (portfolios.length === 0) return '';
  const sorted = [...portfolios].sort((a, b) =>
    a.marketPriceDate.localeCompare(b.marketPriceDate)
  );
  return sorted[sorted.length - 1].id;
}

/**
 * Mobile default: hide Card Game, Card #, Rarity, and every portfolio column
 * except the most recent one. Set, Card, Grade, latest portfolio, Change, Change% remain.
 */
function buildMobileHidden(portfolioIds: string[], latestId: string): Set<string> {
  const others = portfolioIds.filter((id) => id !== latestId);
  return new Set(['category', 'cardNumber', 'rarity', ...others]);
}

/** Grades whose full descriptive name should always be shown. */
const FULL_GRADE_NAMES = new Set([
  'Tag 10 Pristine',
  'BGS 10 Pristine',
  'BGS 10 Gem Mint',
  'BGS 10 Black Label',
]);

/** Strip the word suffix from a grade string, e.g. "PSA 9.0 Mint" → "PSA 9.0". */
function formatGrade(grade: string): string {
  if (!grade || grade === 'Ungraded') return '—';
  if (FULL_GRADE_NAMES.has(grade)) return grade;
  const match = grade.match(/^(\S+\s+[\d.]+)/);
  return match ? match[1] : grade;
}

/** Map a full condition string to its standard abbreviation (NM, LP, MP, HP, DMG). */
function formatCondition(condition: string): string {
  if (!condition) return '';
  const c = condition.toLowerCase().trim();
  if (c.startsWith('near mint')) return 'NM';
  if (c.startsWith('lightly played') || c.startsWith('light play')) return 'LP';
  if (c.startsWith('moderately played') || c.startsWith('moderate play')) return 'MP';
  if (c.startsWith('heavily played') || c.startsWith('heavy play')) return 'HP';
  if (c.startsWith('damaged')) return 'DMG';
  return condition;
}

/** Regex patterns that identify sealed products (booster boxes, ETBs, etc.). */
const SEALED_PATTERNS = [
  /\bbooster\s+box\b/i,
  /\belite\s+trainer\s+box\b/i,
  /\betb\b/i,
  /\bbooster\s+bundle\b/i,
  /\bbooster\s+pack\b/i,
  /\bex\s+box\b/i,
  /\bultra\s+premium\s+collection\b/i,
  /\bupc\b/i,
  /\btin\b/i,
];

function isSealedProduct(productName: string): boolean {
  return SEALED_PATTERNS.some((re) => re.test(productName));
}

/** Build an eBay sold-listings search URL for a card. */
function buildEbayUrl(card: CardComparison): string {
  const sealed = isSealedProduct(card.productName);
  const gradeFormatted = formatGrade(card.grade);
  const conditionAbbr = formatCondition(card.cardCondition);
  const grade = sealed ? null : (gradeFormatted === '—' ? (conditionAbbr || 'raw') : gradeFormatted);
  const query = [card.category, sealed ? null : card.set, card.productName, card.cardNumber, grade]
    .filter(Boolean)
    .join(' ');
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1`;
}

/** Build a TCGPlayer search URL for a card (no grade). */
function buildTcgPlayerUrl(card: CardComparison): string {
  const sealed = isSealedProduct(card.productName);
  const query = [card.category, sealed ? null : card.set, card.productName, card.cardNumber]
    .filter(Boolean)
    .join(' ');
  return `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(query)}`;
}

/** Strip file extension from filename (e.g., "for sale.csv" → "for sale"). */
function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '');
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
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    if (!window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches) return new Set();
    const latestId = computeLatestPortfolioId(portfolios);
    return buildMobileHidden(portfolios.map((p) => p.id), latestId);
  });
  const [showColPanel, setShowColPanel] = useState(false);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const topScrollInnerRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Keep the top scrollbar width in sync with the table's scroll width
  useEffect(() => {
    const top = topScrollRef.current;
    const inner = topScrollInnerRef.current;
    const wrapper = tableWrapperRef.current;
    if (!top || !inner || !wrapper) return;

    const updateWidth = () => { inner.style.width = wrapper.scrollWidth + 'px'; };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(wrapper);

    let syncingFromTop = false;
    let syncingFromWrapper = false;
    const onTopScroll = () => {
      if (syncingFromWrapper) return;
      syncingFromTop = true;
      wrapper.scrollLeft = top.scrollLeft;
      syncingFromTop = false;
    };
    const onWrapperScroll = () => {
      if (syncingFromTop) return;
      syncingFromWrapper = true;
      top.scrollLeft = wrapper.scrollLeft;
      syncingFromWrapper = false;
    };

    top.addEventListener('scroll', onTopScroll);
    wrapper.addEventListener('scroll', onWrapperScroll);
    return () => {
      ro.disconnect();
      top.removeEventListener('scroll', onTopScroll);
      wrapper.removeEventListener('scroll', onWrapperScroll);
    };
  }, []);

  // Auto-detect screen size changes and update mobile view accordingly
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => {
      const mobile = e.matches;
      setMobileView(mobile);
      if (mobile) {
        const latestId = computeLatestPortfolioId(portfolios);
        setHiddenColumns(buildMobileHidden(portfolios.map((p) => p.id), latestId));
      } else {
        setHiddenColumns(new Set());
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [portfolios]);

  // When new portfolios are added while in mobile view, keep their defaults correct
  useEffect(() => {
    if (mobileView) {
      const latestId = computeLatestPortfolioId(portfolios);
      setHiddenColumns(buildMobileHidden(portfolios.map((p) => p.id), latestId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios]);

  function toggleMobileView() {
    setMobileView((v) => {
      const next = !v;
      if (next) {
        const latestId = computeLatestPortfolioId(portfolios);
        setHiddenColumns(buildMobileHidden(portfolios.map((p) => p.id), latestId));
      } else {
        setHiddenColumns(new Set());
      }
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

  const latestPortfolioId = useMemo(
    () => computeLatestPortfolioId(portfolios),
    [portfolios]
  );

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
    if (filter === 'sealed') result = result.filter((c) => isSealedProduct(c.productName));

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
        <div className="filter-tabs">
          {(['all', ...(multipleSnapshots ? ['gained', 'lost', 'new', 'removed'] : []), 'sealed'] as FilterMode[]).map((f) => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? (f === 'sealed' ? 'filter-tab--active-sealed' : 'filter-tab--active') : ''}`}
              onClick={() => {
                setFilter(f);
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
                  { key: 'links', label: 'Links' },
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

      <div className="table-scroll-top" ref={topScrollRef}>
        <div className="table-scroll-top__inner" ref={topScrollInnerRef} />
      </div>

      <div className="table-wrapper" ref={tableWrapperRef}>
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
                Item <SortIcon k="productName" />
              </th>
              {show('cardNumber') && <th>Card #</th>}
              {show('rarity') && <th>Rarity</th>}
              {show('grade') && <th>Grade</th>}
              {sortedPortfolios.map((p) =>
                show(p.id) ? (
                  <th key={p.id} className="th-price">
                    <span className="th-price__file">{stripFileExtension(p.filename)}</span>
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
              {show('links') && <th>Links</th>}
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
                  : Math.abs(card.priceChange) <= 0.50
                  ? 'row--neutral'
                  : card.priceChange > 0
                  ? 'row--gain'
                  : 'row--loss';

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

              const sealed = isSealedProduct(card.productName);

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
                    {mobileView && card.cardNumber && (
                      <span className="td-card-num"> - {card.cardNumber}</span>
                    )}
                    {sealed && <span className="badge badge--sealed">Sealed</span>}
                  </td>
                  {show('cardNumber') && <td>{card.cardNumber}</td>}
                  {show('rarity') && <td>{card.rarity}</td>}
                  {show('grade') && (
                    <td>
                      {formatGrade(card.grade) === '—'
                        ? (formatCondition(card.cardCondition) || '—')
                        : formatGrade(card.grade)}
                    </td>
                  )}
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
                    <td className={`td-price td-change ${card.priceChange === null ? '' : Math.abs(card.priceChange) <= 0.50 ? 'td-neutral' : card.priceChange > 0 ? 'td-gain' : 'td-loss'}`}>
                      {card.priceChange !== null
                        ? (card.priceChange >= 0 ? '+' : '') + fmt(card.priceChange)
                        : '—'}
                    </td>
                  )}
                  {multipleSnapshots && show('changePct') && (
                    <td className={`td-price td-change ${card.priceChange === null ? '' : Math.abs(card.priceChange) <= 0.50 ? 'td-neutral' : card.priceChange > 0 ? 'td-gain' : 'td-loss'}`}>
                      {card.priceChangePct !== null ? pct(card.priceChangePct) : '—'}
                    </td>
                  )}
                  {show('links') && (
                    <td className="td-links">
                      <a
                        href={buildEbayUrl(card)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-btn link-btn--ebay"
                        onClick={(e) => e.stopPropagation()}
                      >
                        eBay
                      </a>
                      <a
                        href={buildTcgPlayerUrl(card)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-btn link-btn--tcg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        TCG
                      </a>
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
