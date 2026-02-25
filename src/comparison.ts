import type { CardComparison, PortfolioFile, PortfolioSummary } from './types';
import { cardKey } from './csvParser';

export function buildComparisons(portfolios: PortfolioFile[]): CardComparison[] {
  // Sort portfolios by marketPriceDate ascending so earliest is first
  const sorted = [...portfolios].sort((a, b) =>
    a.marketPriceDate.localeCompare(b.marketPriceDate)
  );

  const map = new Map<string, CardComparison>();

  for (const portfolio of sorted) {
    for (const card of portfolio.cards) {
      const key = cardKey(card);

      if (!map.has(key)) {
        map.set(key, {
          key,
          productName: card.productName.trim(),
          set: card.set,
          category: card.category,
          cardNumber: card.cardNumber,
          rarity: card.rarity,
          variance: card.variance,
          grade: card.grade,
          cardCondition: card.cardCondition,
          language: card.language,
          snapshots: [],
          priceChange: null,
          priceChangePct: null,
        });
      }

      const entry = map.get(key)!;
      entry.snapshots.push({
        portfolioId: portfolio.id,
        filename: portfolio.filename,
        marketPriceDate: portfolio.marketPriceDate,
        marketPrice: card.marketPrice,
        quantity: card.quantity,
        averageCostPaid: card.averageCostPaid,
      });
    }
  }

  // Calculate price changes where we have multiple snapshots.
  // Anchor to portfolio IDs rather than array indices so that duplicate
  // card rows within the same CSV don't corrupt the calculation.
  const earliestPortfolioId = sorted[0].id;
  const latestPortfolioId = sorted[sorted.length - 1].id;

  for (const entry of map.values()) {
    const earliestSnap = entry.snapshots.find((s) => s.portfolioId === earliestPortfolioId);
    const latestSnap = entry.snapshots.find((s) => s.portfolioId === latestPortfolioId);
    if (earliestSnap && latestSnap && earliestSnap.portfolioId !== latestSnap.portfolioId) {
      const earliest = earliestSnap.marketPrice;
      const latest = latestSnap.marketPrice;
      entry.priceChange = latest - earliest;
      entry.priceChangePct = earliest !== 0 ? ((latest - earliest) / earliest) * 100 : null;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.category.localeCompare(b.category) || a.set.localeCompare(b.set) || a.productName.localeCompare(b.productName)
  );
}

export function buildSummaries(portfolios: PortfolioFile[]): PortfolioSummary[] {
  return portfolios
    .slice()
    .sort((a, b) => a.marketPriceDate.localeCompare(b.marketPriceDate))
    .map((p) => {
      const totalMarketValue = p.cards.reduce(
        (sum, c) => sum + c.marketPrice * c.quantity,
        0
      );
      const totalCostBasis = p.cards.reduce(
        (sum, c) => sum + c.averageCostPaid * c.quantity,
        0
      );
      return {
        portfolioId: p.id,
        filename: p.filename,
        marketPriceDate: p.marketPriceDate,
        totalCards: p.cards.reduce((sum, c) => sum + c.quantity, 0),
        totalMarketValue,
        totalCostBasis,
        totalProfitLoss: totalMarketValue - totalCostBasis,
      };
    });
}
