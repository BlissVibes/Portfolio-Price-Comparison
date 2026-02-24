import type { PortfolioSummary } from '../types';

interface Props {
  summaries: PortfolioSummary[];
  onRemove: (id: string) => void;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function SummaryCards({ summaries, onRemove }: Props) {
  if (summaries.length === 0) return null;

  return (
    <section className="summary-section">
      <h2 className="section-title">Portfolio Snapshots</h2>
      <div className="summary-grid">
        {summaries.map((s) => (
          <div key={s.portfolioId} className="summary-card">
            <button
              className="summary-card__remove"
              onClick={() => onRemove(s.portfolioId)}
              title="Remove this snapshot"
            >
              ✕
            </button>
            <div className="summary-card__filename">{s.filename}</div>
            {s.marketPriceDate && (
              <div className="summary-card__date">Market prices as of {s.marketPriceDate}</div>
            )}
            <div className="summary-card__stats">
              <div className="stat">
                <span className="stat__label">Cards</span>
                <span className="stat__value">{s.totalCards}</span>
              </div>
              <div className="stat">
                <span className="stat__label">Market Value</span>
                <span className="stat__value">{fmt(s.totalMarketValue)}</span>
              </div>
              <div className="stat">
                <span className="stat__label">Cost Basis</span>
                <span className="stat__value">{fmt(s.totalCostBasis)}</span>
              </div>
              <div className={`stat ${s.totalProfitLoss >= 0 ? 'stat--gain' : 'stat--loss'}`}>
                <span className="stat__label">P&amp;L</span>
                <span className="stat__value">
                  {s.totalProfitLoss >= 0 ? '+' : ''}{fmt(s.totalProfitLoss)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
