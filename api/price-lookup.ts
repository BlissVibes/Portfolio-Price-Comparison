import type { VercelRequest, VercelResponse } from '@vercel/node';

// ───── Types ─────

interface PriceResult {
  raw: number;
  grade7: number;
  grade8: number;
  grade9: number;
  grade9_5: number;
  psa10: number;
  url: string;
}

interface SearchResult {
  title: string;
  url: string;
}

// ───── Rate-limit / block detection ─────

class RateLimitError extends Error {
  constructor(status: number) {
    super(`Rate limited (${status})`);
    this.name = 'RateLimitError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Simple server-side delay between external requests
let lastFetchTime = 0;
const MIN_FETCH_GAP_MS = 800;

async function throttledFetch(url: string, extraHeaders?: Record<string, string>): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastFetchTime;
  if (elapsed < MIN_FETCH_GAP_MS) {
    await sleep(MIN_FETCH_GAP_MS - elapsed);
  }
  lastFetchTime = Date.now();

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...extraHeaders,
    },
  });

  if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
    throw new RateLimitError(resp.status);
  }

  return resp;
}

// ───── Search via PriceCharting directly ─────

async function searchPriceCharting(query: string): Promise<SearchResult[]> {
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=prices`;
  const resp = await throttledFetch(url);

  if (!resp.ok) return [];

  const finalUrl = resp.url;
  if (finalUrl && /\/game\//.test(finalUrl)) {
    const html = await resp.text();
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = h1Match ? h1Match[1].trim() : query;
    const path = finalUrl.replace(/https?:\/\/www\.pricecharting\.com/, '');
    return [{ url: path, title }];
  }

  const html = await resp.text();

  const results: SearchResult[] = [];
  const re = /<td\s+class="title">\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const decodedUrl = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    results.push({
      url: decodedUrl,
      title: m[2].trim(),
    });
  }

  return results;
}

// ───── Fallback: PriceCharting AJAX Autocomplete ─────

function slugify(s: string): string {
  return s.toLowerCase().replace(/#/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function searchPriceChartingAutocomplete(query: string): Promise<SearchResult[]> {
  // Strip the slash portion from card numbers (e.g. "188/167" → "188") since PriceCharting's
  // suggestions endpoint returns HTML instead of JSON when the query contains a slash.
  const cleanQuery = query.replace(/\b(\d{1,4})\/\d{1,4}\b/g, '$1');
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(cleanQuery)}&type=suggestions`;
  const resp = await throttledFetch(url, { 'Accept': 'application/json' });

  if (!resp.ok) return [];
  const text = await resp.text();

  try {
    const data = JSON.parse(text);

    // Handle {products: [...]} response format from PriceCharting suggestions API
    const items = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : null);
    if (items) {
      return items
        .filter((item: Record<string, unknown>) => (item.productName || item.title))
        .map((item: Record<string, unknown>) => {
          // Support both old format ({url, title}) and current format ({productName, consoleName})
          if (item.url && item.title) {
            const itemUrl = item.url as string;
            return {
              url: itemUrl.startsWith('http')
                ? itemUrl.replace(/https?:\/\/www\.pricecharting\.com/, '')
                : itemUrl,
              title: (item.title as string) + (item['console-name'] ? ` [${item['console-name']}]` : ''),
            };
          }
          // Current PriceCharting suggestions format
          const consoleName = (item.consoleName as string) || '';
          const productName = (item.productName as string) || '';
          const gameUrl = `/game/${slugify(consoleName)}/${slugify(productName)}`;
          return {
            url: gameUrl,
            title: `${productName} [${consoleName}]`,
          };
        });
    }
  } catch {
    const results: SearchResult[] = [];
    const re = /<a\s+href="([^"]*\/game\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const decodedUrl = m[1].replace(/&amp;/g, '&');
      const path = decodedUrl.replace(/https?:\/\/www\.pricecharting\.com/, '');
      results.push({ url: path, title: m[2].trim() });
    }
    return results;
  }

  return [];
}

// ───── Fallback: Search via Google ─────

async function searchViaGoogle(query: string): Promise<SearchResult[]> {
  const googleQuery = `site:pricecharting.com ${query}`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}&num=5`;
  const resp = await throttledFetch(url);

  if (!resp.ok) return [];
  const html = await resp.text();

  const results: SearchResult[] = [];
  const re = /href="\/url\?q=(https?:\/\/www\.pricecharting\.com\/game\/[^&"]+)[&"]/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const fullUrl = decodeURIComponent(m[1]);
    const path = fullUrl.replace('https://www.pricecharting.com', '');
    const segments = path.split('/');
    const title = segments[segments.length - 1]
      ?.replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';

    if (!results.some((r) => r.url === path)) {
      results.push({ url: path, title });
    }
  }

  if (results.length === 0) {
    const re2 = /href="(https?:\/\/www\.pricecharting\.com\/game\/[^"]+)"/gi;
    while ((m = re2.exec(html)) !== null) {
      const fullUrl = decodeURIComponent(m[1]);
      const path = fullUrl.replace('https://www.pricecharting.com', '');
      const segments = path.split('/');
      const title = segments[segments.length - 1]
        ?.replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';

      if (!results.some((r) => r.url === path)) {
        results.push({ url: path, title });
      }
    }
  }

  return results;
}

// ───── Relevance Scoring ─────

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/[^a-z0-9#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeForMatch(s).split(' ').filter(Boolean);
}

function extractCardNumber(s: string): string | null {
  const hashMatch = s.match(/#(\d{1,4})/);
  if (hashMatch) return hashMatch[1];
  const slashMatch = s.match(/\b(\d{1,4})\/(\d{1,4})\b/);
  if (slashMatch) return slashMatch[1];
  return null;
}

function extractAllNumbers(s: string): string[] {
  const nums: string[] = [];
  for (const m of s.matchAll(/#(\d{1,4})/g)) nums.push(m[1]);
  for (const m of s.matchAll(/\b(\d{1,4})\/\d{1,4}\b/g)) nums.push(m[1]);
  for (const m of s.matchAll(/\b(\d{1,4})\b/g)) {
    const n = m[1];
    if (n.length <= 3 || n.startsWith('0')) {
      if (!nums.includes(n)) nums.push(n);
    }
  }
  return nums;
}

function cardNumbersMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (parseInt(a, 10) === parseInt(b, 10)) return true;
  return false;
}

const LANGUAGE_KEYWORDS = ['japanese', 'korean', 'chinese', 'german', 'french', 'italian', 'spanish', 'portuguese'];

function detectResultLanguage(s: string): string | null {
  const lower = s.toLowerCase();
  for (const lang of LANGUAGE_KEYWORDS) {
    if (lower.includes(lang)) return lang;
  }
  if (/\bs[\s-]?p\b/i.test(lower)) return 'japanese';
  return null;
}

// Keywords that indicate a sealed product — used for scoring, NOT hard-filtering
const SEALED_KEYWORDS = ['pack', 'booster', 'box', 'collection', 'tin', 'bundle', 'deck', 'set box', 'promo pack', 'etb', 'elite trainer'];

function looksLikeSealed(title: string, url?: string): boolean {
  const t = title.toLowerCase();
  if (SEALED_KEYWORDS.some((kw) => t.includes(kw))) return true;
  if (url) {
    const slug = url.toLowerCase().split('/').pop()?.replace(/-/g, ' ') ?? '';
    if (SEALED_KEYWORDS.some((kw) => slug.includes(kw))) return true;
  }
  if (/\bvol\.?\s*\d+\b/.test(t)) return true;
  return false;
}

function scoreResult(query: string, resultTitle: string, resultUrl?: string): number {
  const qNorm = normalizeForMatch(query);
  const tNorm = normalizeForMatch(resultTitle);

  if (qNorm === tNorm) return 1000;

  const qTokens = tokenize(query);
  const tTokens = tokenize(resultTitle);

  let score = 0;

  for (const qt of qTokens) {
    if (['pokemon', 'magic', 'yugioh', 'the', 'gathering', 'japanese', 'korean', 'chinese', 'german', 'french'].includes(qt)) continue;
    if (tTokens.some((tt) => tt === qt)) {
      score += 10;
    } else if (tTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
      score += 5;
    }
  }

  const extraTokens = tTokens.filter(
    (tt) => !qTokens.some((qt) => tt === qt || tt.includes(qt) || qt.includes(tt))
  );
  score -= extraTokens.length * 1;

  const cardNamePart = qTokens.filter((t) => !/^\d+$/.test(t) && !['pokemon', 'magic', 'yugioh', 'the', 'gathering', 'japanese', 'korean', 'chinese'].includes(t));
  const cardNameStr = cardNamePart.join(' ');
  if (cardNameStr && tNorm.includes(cardNameStr)) {
    score += 20;
  }

  const queryCardNum = extractCardNumber(query);
  const hasCardNameMatch = !!(cardNameStr && tNorm.includes(cardNameStr));
  if (queryCardNum) {
    const resultNums = extractAllNumbers(resultTitle);

    if (resultNums.length > 0) {
      const hasExactMatch = resultNums.some((rn) => cardNumbersMatch(rn, queryCardNum));
      if (hasExactMatch && hasCardNameMatch) {
        score += 100;
      } else if (hasExactMatch && !hasCardNameMatch) {
        score += 15;
      } else {
        score -= 300;
      }
    } else {
      score -= 10;
    }

    if (looksLikeSealed(resultTitle, resultUrl)) {
      score -= 50;
    }
  } else if (looksLikeSealed(resultTitle, resultUrl)) {
    // Only mildly penalize sealed for portfolio app — sealed products are valid
    score -= 5;
  }

  const queryHasLang = LANGUAGE_KEYWORDS.some((lk) => qNorm.includes(lk));
  const resultLang = detectResultLanguage(tNorm) || (resultUrl ? detectResultLanguage(resultUrl) : null);
  if (!queryHasLang && resultLang) {
    score -= 120;
  } else if (queryHasLang && !resultLang) {
    score -= 30;
  }

  const queryWantsPC = qNorm.includes('pokemon center');
  const resultHasPC = tNorm.includes('pokemon center') || (resultUrl ? resultUrl.toLowerCase().includes('pokemon-center') : false);
  if (queryWantsPC && !resultHasPC) {
    score -= 80;
  } else if (!queryWantsPC && resultHasPC) {
    score -= 80;
  }

  return score;
}

function rankResults(query: string, results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) return results;

  return [...results].sort((a, b) => {
    const slugA = a.url.split('/').pop()?.replace(/-/g, ' ') ?? '';
    const slugB = b.url.split('/').pop()?.replace(/-/g, ' ') ?? '';
    const scoreA = Math.max(scoreResult(query, a.title, a.url), scoreResult(query, slugA, a.url));
    const scoreB = Math.max(scoreResult(query, b.title, b.url), scoreResult(query, slugB, b.url));
    return scoreB - scoreA;
  });
}

// ───── Query Variants ─────

function buildQueryVariants(query: string): string[] {
  const variants: string[] = [query];
  const lower = query.toLowerCase();

  const nameNumEarly = query.match(
    /^((?:pokemon|magic the gathering|yugioh)\s+(?:japanese\s+|korean\s+|chinese\s+|german\s+|french\s+)?)(.+?)\s+(\d{1,4}(?:\/\d{1,4})?)\s+\S/i
  );
  if (nameNumEarly) {
    const prefix = nameNumEarly[1];
    const name   = nameNumEarly[2];
    const fullNum = nameNumEarly[3];
    const shortNum = fullNum.replace(/\/\d+$/, '');
    variants.push(`${prefix}${name} ${fullNum}`.trim());
    if (shortNum !== fullNum) {
      variants.push(`${prefix}${name} ${shortNum}`.trim());
    }
  }

  const withoutSlashPart = query.replace(/\b(\d{1,4})\/\d{1,4}\b/g, '$1');
  if (withoutSlashPart !== query) {
    variants.push(withoutSlashPart);
  }

  const stripped = query.replace(/^(pokemon|magic the gathering|yugioh)\s+/i, '');
  if (stripped !== query) variants.push(stripped);

  if (/\bmega\b/i.test(lower)) {
    variants.push(query.replace(/\bmega\s+/i, 'M ').replace(/\bex\b/i, 'EX'));
  }

  if (/\bvmax\b/i.test(lower)) {
    variants.push(query.replace(/\bVMAX\b/gi, 'V-MAX'));
  }

  if (/\bvstar\b/i.test(lower)) {
    variants.push(query.replace(/\bVSTAR\b/gi, 'V-STAR'));
  }

  if (query.includes("'") || query.includes('\u2019')) {
    variants.push(query.replace(/['\u2019]/g, ''));
  }

  const simplified = query
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*#?\d{1,4}(?:\/\d{1,4})?\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (simplified !== query && simplified.length > 2) {
    variants.push(simplified);
  }

  const nameNumMatch = query.match(/^(?:pokemon|magic the gathering|yugioh)\s+(?:japanese\s+|korean\s+|chinese\s+|german\s+|french\s+)?(.+?)\s+(\d{1,4}(?:\/\d{1,4})?)\s+.+$/i);
  if (nameNumMatch) {
    const justNum = nameNumMatch[2].replace(/\/\d+$/, '');
    variants.push(`${nameNumMatch[1]} ${justNum}`);
    const gamePrefix = query.match(/^(pokemon|magic the gathering|yugioh)\s+/i);
    if (gamePrefix) {
      variants.push(`${gamePrefix[1]} ${nameNumMatch[1]} ${justNum}`);
    }
  }

  return [...new Set(variants)];
}

// ───── Combined search — NO hard-filter on sealed products ─────
// Unlike the Grading Calculator, the Portfolio app can contain sealed product
// so we rank them but never exclude them.

async function searchCard(query: string): Promise<SearchResult[]> {
  const variants = buildQueryVariants(query);
  let lastRateLimitError: RateLimitError | null = null;

  for (const variant of variants) {
    let results: SearchResult[] = [];

    // Try primary search
    try {
      results = await searchPriceCharting(variant);
    } catch (err) {
      if (err instanceof RateLimitError) lastRateLimitError = err;
    }

    // Try autocomplete fallback
    if (results.length === 0) {
      try {
        results = await searchPriceChartingAutocomplete(variant);
      } catch (err) {
        if (err instanceof RateLimitError) lastRateLimitError = err;
      }
    }

    // Try Google fallback
    if (results.length === 0) {
      try {
        results = await searchViaGoogle(variant);
      } catch (err) {
        if (err instanceof RateLimitError) lastRateLimitError = err;
      }
    }

    if (results.length > 0) {
      return rankResults(query, results);
    }
  }

  // If all methods failed due to rate limiting, surface the error
  if (lastRateLimitError) throw lastRateLimitError;

  return [];
}

// ───── Fetch prices from a card detail page ─────

async function fetchPrices(cardPath: string): Promise<PriceResult> {
  const url = cardPath.startsWith('http')
    ? cardPath
    : `https://www.pricecharting.com${cardPath}`;

  const resp = await throttledFetch(url);

  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const html = await resp.text();

  const chartMatch = html.match(/VGPC\.chart_data\s*=\s*(\{[\s\S]*?\});/);
  if (!chartMatch) {
    return extractTablePrices(html, url);
  }

  try {
    const data = JSON.parse(chartMatch[1]);

    const getLatest = (arr: number[][] | undefined): number => {
      if (!arr || arr.length === 0) return 0;
      const last = arr[arr.length - 1];
      return last ? last[1] / 100 : 0;
    };

    return {
      raw: getLatest(data.used),
      grade7: getLatest(data.cib),
      grade8: getLatest(data.new),
      grade9: getLatest(data.graded),
      grade9_5: getLatest(data.boxonly),
      psa10: getLatest(data.manualonly),
      url,
    };
  } catch {
    return extractTablePrices(html, url);
  }
}

function extractTablePrices(html: string, url: string): PriceResult {
  const pricePattern = /\$([0-9,]+(?:\.[0-9]{2})?)/g;
  const prices: number[] = [];
  let m;
  while ((m = pricePattern.exec(html)) !== null && prices.length < 20) {
    prices.push(parseFloat(m[1].replace(/,/g, '')));
  }

  return {
    raw: prices[0] ?? 0,
    grade7: prices[1] ?? 0,
    grade8: prices[2] ?? 0,
    grade9: prices[3] ?? 0,
    grade9_5: prices[4] ?? 0,
    psa10: prices[5] ?? 0,
    url,
  };
}

// ───── API Handler ─────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q, path, mode } = req.query;

  try {
    if (mode === 'prices' && typeof path === 'string') {
      const prices = await fetchPrices(path);
      return res.status(200).json(prices);
    }

    if (typeof q === 'string' && q.trim()) {
      const results = await searchCard(q.trim());

      if (mode === 'search') {
        return res.status(200).json({ results });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'No cards found', query: q });
      }

      const prices = await fetchPrices(results[0].url);
      return res.status(200).json({
        ...prices,
        matchedTitle: results[0].title,
        allResults: results.slice(0, 5),
      });
    }

    return res.status(400).json({ error: 'Missing query parameter: q or path' });
  } catch (err: unknown) {
    if (err instanceof RateLimitError) {
      return res.status(429).json({ error: 'Rate limited by PriceCharting. Please wait a moment and try again.' });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
