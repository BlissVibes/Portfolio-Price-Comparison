import Papa from 'papaparse';
import type { CollectrCard, PortfolioFile } from './types';

// Extract "As of YYYY-MM-DD" date from the market price column header
function extractMarketPriceDate(headers: string[]): string {
  const marketHeader = headers.find((h) => h.toLowerCase().includes('market price'));
  if (!marketHeader) return '';
  const match = marketHeader.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function cardKey(card: CollectrCard): string {
  return [card.category, card.set, card.productName.trim(), card.cardNumber, card.grade, card.variance]
    .join('||')
    .toLowerCase();
}

export { cardKey };

export function parseCollectrCSV(
  content: string,
  filename: string
): PortfolioFile | null {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    console.error('CSV parse errors', result.errors);
    return null;
  }

  const rawHeaders = Object.keys(result.data[0] || {});
  const marketPriceDate = extractMarketPriceDate(rawHeaders);

  // Find the market price column key (it contains "Market Price")
  const marketPriceKey = rawHeaders.find((h) => h.toLowerCase().includes('market price')) || 'Market Price';

  const cards: CollectrCard[] = result.data.map((row) => ({
    portfolioName: row['Portfolio Name'] || '',
    category: row['Category'] || '',
    set: row['Set'] || '',
    productName: row['Product Name'] || '',
    cardNumber: row['Card Number'] || '',
    rarity: row['Rarity'] || '',
    variance: row['Variance'] || '',
    grade: row['Grade'] || '',
    cardCondition: row['Card Condition'] || '',
    averageCostPaid: parseFloat(row['Average Cost Paid'] || '0') || 0,
    quantity: parseInt(row['Quantity'] || '1', 10) || 1,
    marketPrice: parseFloat(row[marketPriceKey] || '0') || 0,
    marketPriceDate,
    priceOverride: parseFloat(row['Price Override'] || '0') || 0,
    watchlist: (row['Watchlist'] || 'false').toLowerCase() === 'true',
    dateAdded: row['Date Added'] || '',
    notes: row['Notes'] || '',
  }));

  return {
    id: crypto.randomUUID(),
    filename,
    uploadedAt: new Date().toISOString(),
    marketPriceDate,
    cards,
  };
}
