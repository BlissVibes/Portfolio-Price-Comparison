export interface CollectrCard {
  portfolioName: string;
  category: string;
  set: string;
  productName: string;
  cardNumber: string;
  rarity: string;
  variance: string;
  grade: string;
  cardCondition: string;
  averageCostPaid: number;
  quantity: number;
  marketPrice: number;
  marketPriceDate: string; // extracted from header "Market Price (As of YYYY-MM-DD)"
  priceOverride: number;
  watchlist: boolean;
  dateAdded: string;
  notes: string;
}

export interface PortfolioFile {
  id: string;
  filename: string;
  portfolioName: string;
  uploadedAt: string;
  marketPriceDate: string;
  cards: CollectrCard[];
}

export interface CardComparison {
  key: string; // unique card identifier: category + set + productName + cardNumber + grade + variance
  productName: string;
  set: string;
  category: string;
  cardNumber: string;
  rarity: string;
  variance: string;
  grade: string;
  snapshots: {
    portfolioId: string;
    filename: string;
    marketPriceDate: string;
    marketPrice: number;
    quantity: number;
    averageCostPaid: number;
  }[];
  priceChange: number | null; // latest vs earliest
  priceChangePct: number | null;
}

export interface PortfolioSummary {
  portfolioId: string;
  filename: string;
  marketPriceDate: string;
  totalCards: number;
  totalMarketValue: number;
  totalCostBasis: number;
  totalProfitLoss: number;
}
