import type { CardComparison, PortfolioSummary } from '../types';

interface Props {
  earliest: PortfolioSummary;
  latest: PortfolioSummary;
  comparisons: CardComparison[];
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PortfolioDelta({ earliest, latest, comparisons }: Props) {
  const cardDiff = latest.totalCards - earliest.totalCards;
  const valueDiff = latest.totalMarketValue - earliest.totalMarketValue;

  // Sum qty-weighted price changes split into gains and losses
  let totalGained = 0;
  let totalLost = 0;
  for (const c of comparisons) {
    if (c.priceChange === null) continue;
    const latestSnap = c.snapshots.find((s) => s.portfolioId === latest.portfolioId)
      ?? c.snapshots[c.snapshots.length - 1];
    const delta = c.priceChange * latestSnap.quantity;
    if (delta > 0) totalGained += delta;
    else totalLost += Math.abs(delta);
  }

  return (
    <section className="delta-section">
      <div className="delta-grid">
        <div className={`delta-box ${cardDiff >= 0 ? 'delta-box--gain' : 'delta-box--loss'}`}>
          <span className="delta-box__label">Card Count Change</span>
          <span className="delta-box__value">{cardDiff >= 0 ? '+' : ''}{cardDiff}</span>
        </div>
        <div className={`delta-box ${valueDiff >= 0 ? 'delta-box--gain' : 'delta-box--loss'}`}>
          <span className="delta-box__label">Market Value Change</span>
          <span className="delta-box__value">{valueDiff >= 0 ? '+' : ''}{fmt(valueDiff)}</span>
        </div>
        <div className="delta-box delta-box--gain">
          <span className="delta-box__label">Total Value Gained</span>
          <span className="delta-box__value">+{fmt(totalGained)}</span>
        </div>
        <div className="delta-box delta-box--loss">
          <span className="delta-box__label">Total Value Lost</span>
          <span className="delta-box__value">-{fmt(totalLost)}</span>
        </div>
      </div>
    </section>
  );
}
