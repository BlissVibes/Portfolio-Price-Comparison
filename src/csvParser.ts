import Papa from 'papaparse';
import type { CollectrCard, PortfolioFile } from './types';

// ───── Collectr helpers ─────

function extractMarketPriceDate(headers: string[]): string {
  const marketHeader = headers.find((h) => h.toLowerCase().includes('market price'));
  if (!marketHeader) return '';
  const match = marketHeader.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function cardKey(card: CollectrCard): string {
  return [card.category, card.set, card.productName.trim(), card.cardNumber, card.grade, card.variance, card.language]
    .join('||')
    .toLowerCase();
}

export { cardKey };

// ───── TCGPlayer set code → full name map ─────

const TCG_SET_CODES: Record<string, string> = {
  // Base era
  BS: 'Base Set',
  BS2: 'Base Set 2',
  JU: 'Jungle',
  FO: 'Fossil',
  TR: 'Team Rocket',
  G1: 'Gym Heroes',
  G2: 'Gym Challenge',
  // Neo era
  N1: 'Neo Genesis',
  N2: 'Neo Discovery',
  N3: 'Neo Revelation',
  N4: 'Neo Destiny',
  // E-Card era
  LC: 'Legendary Collection',
  EX: 'Expedition Base Set',
  AQ: 'Aquapolis',
  SK: 'Skyridge',
  // EX era
  RS: 'EX Ruby & Sapphire',
  SS: 'EX Sandstorm',
  DR: 'EX Dragon',
  MA: 'EX Team Magma vs Team Aqua',
  HL: 'EX Hidden Legends',
  FL: 'EX FireRed & LeafGreen',
  TRR: 'EX Team Rocket Returns',
  DE: 'EX Deoxys',
  EM: 'EX Emerald',
  UF: 'EX Unseen Forces',
  DS: 'EX Delta Species',
  LM: 'EX Legend Maker',
  HP: 'EX Holon Phantoms',
  CG: 'EX Crystal Guardians',
  DF: 'EX Dragon Frontiers',
  PK: 'EX Power Keepers',
  // Diamond & Pearl era
  DP: 'Diamond & Pearl',
  MT: 'Mysterious Treasures',
  SW: 'Secret Wonders',
  GE: 'Great Encounters',
  MD: 'Majestic Dawn',
  LA: 'Legends Awakened',
  SF: 'Stormfront',
  // Platinum era
  PL: 'Platinum',
  RR: 'Rising Rivals',
  SV: 'Supreme Victors',
  AR: 'Arceus',
  // HGSS era
  HS: 'HeartGold & SoulSilver',
  UL: 'Unleashed',
  UD: 'Undaunted',
  TM: 'Triumphant',
  CL: 'Call of Legends',
  // Black & White era
  BLW: 'Black & White',
  EPO: 'Emerging Powers',
  NVI: 'Noble Victories',
  NXD: 'Next Destinies',
  DEX: 'Dark Explorers',
  DRX: 'Dragons Exalted',
  BCR: 'Boundaries Crossed',
  PLS: 'Plasma Storm',
  PLF: 'Plasma Freeze',
  PLB: 'Plasma Blast',
  LTR: 'Legendary Treasures',
  // XY era
  XY: 'XY',
  FLF: 'Flashfire',
  FFI: 'Furious Fists',
  PHF: 'Phantom Forces',
  PRC: 'Primal Clash',
  DCR: 'Double Crisis',
  ROS: 'Roaring Skies',
  AOR: 'Ancient Origins',
  BKT: 'BREAKthrough',
  BKP: 'BREAKpoint',
  FCO: 'Fates Collide',
  STS: 'Steam Siege',
  EVO: 'Evolutions',
  // Sun & Moon era
  SUM: 'Sun & Moon',
  GRI: 'Guardians Rising',
  BUS: 'Burning Shadows',
  SHF: 'Shining Legends',
  CIN: 'Crimson Invasion',
  UPR: 'Ultra Prism',
  FLI: 'Forbidden Light',
  CES: 'Celestial Storm',
  DRM: 'Dragon Majesty',
  LOT: 'Lost Thunder',
  TEU: 'Team Up',
  DET: 'Detective Pikachu',
  UNB: 'Unbroken Bonds',
  UNM: 'Unified Minds',
  HIF: 'Hidden Fates',
  CEC: 'Cosmic Eclipse',
  // Sword & Shield era
  SSH: 'Sword & Shield',
  RCL: 'Rebel Clash',
  DAA: 'Darkness Ablaze',
  CPA: "Champion's Path",
  VIV: 'Vivid Voltage',
  SHF2: 'Shining Fates',
  BST: 'Battle Styles',
  CRE: 'Chilling Reign',
  EVS: 'Evolving Skies',
  CEL: 'Celebrations',
  FST: 'Fusion Strike',
  BRS: 'Brilliant Stars',
  ASR: 'Astral Radiance',
  PGO: 'Pokemon GO',
  LOR: 'Lost Origin',
  SIT: 'Silver Tempest',
  CRZ: 'Crown Zenith',
  // Scarlet & Violet era
  SVI: 'Scarlet & Violet',
  PAL: 'Paldea Evolved',
  OBF: 'Obsidian Flames',
  MEW: '151',
  PAR: 'Paradox Rift',
  PAF: 'Paldean Fates',
  TEF: 'Temporal Forces',
  TWM: 'Twilight Masquerade',
  SFA: 'Shrouded Fable',
  SCR: 'Stellar Crown',
  SSP: 'Surging Sparks',
  PRE: 'Prismatic Evolutions',
  JTG: 'Journey Together',
};

function resolveSetCode(code: string): string {
  return TCG_SET_CODES[code] ?? code;
}

// ───── Format detection ─────

export type PortfolioFormat =
  | 'collectr'
  | 'tcgplayer-csv'
  | 'tcgplayer-text-prices'
  | 'tcgplayer-text-no-prices';

export function detectFormat(content: string): PortfolioFormat {
  const trimmed = content.trim();
  const firstLine = trimmed.split('\n')[0].trim();

  if (firstLine.includes('TCGplayer Id')) return 'tcgplayer-csv';

  if (
    firstLine.includes('Portfolio Name') ||
    (firstLine.includes('Product Name') && firstLine.includes('Category'))
  ) {
    return 'collectr';
  }

  if (/\$\d+(?:\.\d+)?\s+each/i.test(trimmed)) return 'tcgplayer-text-prices';

  if (/^\d+\s+.+\[[A-Za-z0-9-]+\]/m.test(trimmed)) return 'tcgplayer-text-no-prices';

  return 'collectr';
}

// ───── Collectr CSV ─────

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
    language: row['Language'] || '',
    averageCostPaid: parseFloat(row['Average Cost Paid'] || '0') || 0,
    quantity: parseInt(row['Quantity'] || '1', 10) || 1,
    marketPrice: parseFloat(row[marketPriceKey] || '0') || 0,
    marketPriceDate,
    priceOverride: parseFloat(row['Price Override'] || '0') || 0,
    watchlist: (row['Watchlist'] || 'false').toLowerCase() === 'true',
    dateAdded: row['Date Added'] || '',
    notes: row['Notes'] || '',
  }));

  const portfolioName = cards.length > 0 ? cards[0].portfolioName : '';

  return {
    id: crypto.randomUUID(),
    filename,
    portfolioName,
    uploadedAt: new Date().toISOString(),
    marketPriceDate,
    cards,
  };
}

// ───── TCGPlayer CSV ─────

export function parseTCGPlayerCSV(
  content: string,
  filename: string
): PortfolioFile | null {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0 && result.data.length === 0) return null;

  const today = new Date().toISOString().split('T')[0];

  const cards: CollectrCard[] = result.data
    .filter((row) => row['TCGplayer Id'])
    .map((row) => ({
      portfolioName: '',
      category: row['Product Line'] || '',
      set: row['Set Name'] || '',
      productName: row['Product Name'] || '',
      cardNumber: row['Number'] || '',
      rarity: row['Rarity'] || '',
      variance: '',
      grade: '',
      cardCondition: row['Condition'] || '',
      language: '',
      averageCostPaid: 0,
      quantity: parseInt(row['Total Quantity'] || '1', 10) || 1,
      marketPrice: parseFloat(row['TCG Market Price'] || '0') || 0,
      marketPriceDate: today,
      priceOverride: 0,
      watchlist: false,
      dateAdded: '',
      notes: '',
    }));

  if (cards.length === 0) return null;

  return {
    id: crypto.randomUUID(),
    filename,
    portfolioName: '',
    uploadedAt: new Date().toISOString(),
    marketPriceDate: today,
    cards,
  };
}

// ───── TCGPlayer text export with prices ─────

// Matches: {qty} {name} [{setCode}] {cardNumber} ({conditions}) ${price} each
const TEXT_LINE_RE =
  /^(\d+)\s+(.+?)\s+\[([A-Za-z0-9-]+)\]\s+(\S+)\s+\(([^)]+)\)\s+\$([0-9]+(?:\.[0-9]+)?)\s+each/;

export function parseTCGPlayerText(
  content: string,
  filename: string
): PortfolioFile | null {
  const today = new Date().toISOString().split('T')[0];
  const cards: CollectrCard[] = [];

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('TOTAL:') || line.startsWith('//')) continue;

    const m = TEXT_LINE_RE.exec(line);
    if (!m) continue;

    const [, qtyStr, name, setCode, cardNumber, conditionsStr, priceStr] = m;
    const parts = conditionsStr.split(',').map((s) => s.trim());

    let variant = '';
    let condition = '';
    if (parts.length >= 3) {
      variant = parts[0];
      condition = parts[parts.length - 2];
    } else if (parts.length === 2) {
      condition = parts[0];
    } else {
      condition = parts[0] ?? '';
    }

    cards.push({
      portfolioName: '',
      category: 'Pokemon',
      set: resolveSetCode(setCode),
      productName: name.trim(),
      cardNumber,
      rarity: '',
      variance: variant,
      grade: '',
      cardCondition: condition,
      language: '',
      averageCostPaid: 0,
      quantity: parseInt(qtyStr, 10) || 1,
      marketPrice: parseFloat(priceStr) || 0,
      marketPriceDate: today,
      priceOverride: 0,
      watchlist: false,
      dateAdded: '',
      notes: '',
    });
  }

  if (cards.length === 0) return null;

  return {
    id: crypto.randomUUID(),
    filename,
    portfolioName: '',
    uploadedAt: new Date().toISOString(),
    marketPriceDate: today,
    cards,
  };
}

// ───── Unified entry point ─────

export function parsePortfolioFile(
  content: string,
  filename: string
): { result: PortfolioFile | null; error?: string } {
  const format = detectFormat(content);

  if (format === 'tcgplayer-text-no-prices') {
    return {
      result: null,
      error:
        'TCGPlayer text exports without prices cannot be used for price comparison. ' +
        'In TCGPlayer, enable "Show prices" when generating your text export, or use the CSV export instead.',
    };
  }

  let result: PortfolioFile | null;
  if (format === 'tcgplayer-csv') {
    result = parseTCGPlayerCSV(content, filename);
  } else if (format === 'tcgplayer-text-prices') {
    result = parseTCGPlayerText(content, filename);
  } else {
    result = parseCollectrCSV(content, filename);
  }

  if (!result) {
    return {
      result: null,
      error: `Failed to parse "${filename}". Make sure it's a valid TCGPlayer or Collectr export.`,
    };
  }

  return { result };
}
