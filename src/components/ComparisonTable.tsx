import { useState, useMemo } from 'react';
import type { CardComparison, PortfolioFile } from '../types';

interface Props {
  comparisons: CardComparison[];
  portfolios: PortfolioFile[];
}

type SortKey = 'productName' | 'set' | 'category' | 'priceChange' | 'priceChangePct';
type SortDir = 'asc' | 'desc';
type FilterMode = 'all' | 'gained' | 'lost' | 'new' | 'removed';

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function pct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

export default function ComparisonTable({ comparisons, portfolios }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'priceChange',
    dir: 'desc',
  });
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

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
      </div>

      <div className="table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('category')} className="th-sortable">
                Card Game <SortIcon k="category" />
              </th>
              <th onClick={() => toggleSort('set')} className="th-sortable">
                Set <SortIcon k="set" />
              </th>
              <th onClick={() => toggleSort('productName')} className="th-sortable">
                Card <SortIcon k="productName" />
              </th>
              <th>Card #</th>
              <th>Rarity</th>
              <th>Grade</th>
              {sortedPortfolios.map((p) => (
                <th key={p.id} className="th-price">
                  <span className="th-price__file">{p.filename}</span>
                  {p.marketPriceDate && (
                    <span className="th-price__date">{p.marketPriceDate}</span>
                  )}
                </th>
              ))}
              {multipleSnapshots && (
                <>
                  <th onClick={() => toggleSort('priceChange')} className="th-sortable th-price">
                    Change <SortIcon k="priceChange" />
                  </th>
                  <th onClick={() => toggleSort('priceChangePct')} className="th-sortable th-price">
                    Change% <SortIcon k="priceChangePct" />
                  </th>
                </>
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
              const changeClass =
                card.priceChange === null
                  ? ''
                  : card.priceChange > 0
                  ? 'row--gain'
                  : card.priceChange < 0
                  ? 'row--loss'
                  : '';

              return (
                <tr key={card.key} className={changeClass}>
                  <td>{card.category}</td>
                  <td>{card.set}</td>
                  <td className="td-name">
                    {card.productName}
                    {card.variance && card.variance !== 'Normal' && (
                      <span className="badge">{card.variance}</span>
                    )}
                  </td>
                  <td>{card.cardNumber}</td>
                  <td>{card.rarity}</td>
                  <td>{card.grade !== 'Ungraded' ? card.grade : '—'}</td>
                  {sortedPortfolios.map((p) => {
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
                  {multipleSnapshots && (
                    <>
                      <td className={`td-price td-change ${card.priceChange === null ? '' : card.priceChange >= 0 ? 'td-gain' : 'td-loss'}`}>
                        {card.priceChange !== null
                          ? (card.priceChange >= 0 ? '+' : '') + fmt(card.priceChange)
                          : '—'}
                      </td>
                      <td className={`td-price td-change ${card.priceChangePct === null ? '' : card.priceChangePct >= 0 ? 'td-gain' : 'td-loss'}`}>
                        {card.priceChangePct !== null ? pct(card.priceChangePct) : '—'}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        Showing {filtered.length} of {comparisons.length} cards
      </div>
    </section>
  );
}
