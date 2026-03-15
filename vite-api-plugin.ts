/**
 * Vite plugin that handles /api/price-lookup requests during development.
 * In production on Vercel, the serverless function in api/price-lookup.ts handles this.
 * This plugin replicates the same logic so `npm run dev` works without `vercel dev`.
 *
 * Uses node-fetch + https-proxy-agent so it works behind proxies (e.g. dev sandboxes).
 * On Vercel, the api/price-lookup.ts serverless function uses native fetch (works fine).
 */

import type { Plugin } from 'vite';
import nodeFetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ───── Proxy Agent ─────
// Respect proxy env vars (npm_config_proxy, GLOBAL_AGENT_HTTP_PROXY, HTTPS_PROXY, etc.)

function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl =
    process.env.npm_config_proxy ||
    process.env.GLOBAL_AGENT_HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
}

const proxyAgent = getProxyAgent();

// ───── Types ─────

interface SearchResult {
  title: string;
  url: string;
}

class RateLimitError extends Error {
  constructor(status: number) {
    super(`Rate limited (${status})`);
    this.name = 'RateLimitError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastFetchTime = 0;
const MIN_FETCH_GAP_MS = 800;

async function throttledFetch(url: string): Promise<import('node-fetch').Response> {
  const now = Date.now();
  const elapsed = now - lastFetchTime;
  if (elapsed < MIN_FETCH_GAP_MS) {
    await sleep(MIN_FETCH_GAP_MS - elapsed);
  }
  lastFetchTime = Date.now();

  const resp = await nodeFetch(url, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent: proxyAgent as any,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
    throw new RateLimitError(resp.status);
  }

  return resp;
}

// ───── Search Methods ─────

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
    results.push({
      url: m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
      title: m[2].trim(),
    });
  }
  return results;
}

async function searchPriceChartingAutocomplete(query: string): Promise<SearchResult[]> {
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=suggestions`;
  const resp = await throttledFetch(url);
  if (!resp.ok) return [];
  const text = await resp.text();

  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return data
        .filter((item: { url?: string; title?: string }) => item.url && item.title)
        .map((item: { url: string; title: string; 'console-name'?: string }) => ({
          url: item.url.startsWith('http')
            ? item.url.replace(/https?:\/\/www\.pricecharting\.com/, '')
            : item.url,
          title: item.title + (item['console-name'] ? ` [${item['console-name']}]` : ''),
        }));
    }
  } catch {
    const results: SearchResult[] = [];
    const re = /<a\s+href="([^"]*\/game\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const path = m[1].replace(/&amp;/g, '&').replace(/https?:\/\/www\.pricecharting\.com/, '');
      results.push({ url: path, title: m[2].trim() });
    }
    return results;
  }
  return [];
}

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
  return results;
}

// ───── Scoring ─────

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[-–—]/g, ' ').replace(/[^a-z0-9#.\s]/g, ' ').replace(/\s+/g, ' ').trim();
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
  return a === b || parseInt(a, 10) === parseInt(b, 10);
}

const LANGUAGE_KEYWORDS = ['japanese', 'korean', 'chinese', 'german', 'french', 'italian', 'spanish', 'portuguese'];
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
    if (tTokens.some((tt) => tt === qt)) score += 10;
    else if (tTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) score += 5;
  }

  const extraTokens = tTokens.filter((tt) => !qTokens.some((qt) => tt === qt || tt.includes(qt) || qt.includes(tt)));
  score -= extraTokens.length;

  const cardNamePart = qTokens.filter((t) => !/^\d+$/.test(t) && !['pokemon', 'magic', 'yugioh', 'the', 'gathering', 'japanese', 'korean', 'chinese'].includes(t));
  const cardNameStr = cardNamePart.join(' ');
  if (cardNameStr && tNorm.includes(cardNameStr)) score += 20;

  const queryCardNum = extractCardNumber(query);
  const hasCardNameMatch = !!(cardNameStr && tNorm.includes(cardNameStr));
  if (queryCardNum) {
    const resultNums = extractAllNumbers(resultTitle);
    if (resultNums.length > 0) {
      const hasExactMatch = resultNums.some((rn) => cardNumbersMatch(rn, queryCardNum));
      if (hasExactMatch && hasCardNameMatch) score += 100;
      else if (hasExactMatch && !hasCardNameMatch) score += 15;
      else score -= 300;
    } else {
      score -= 10;
    }
    if (looksLikeSealed(resultTitle, resultUrl)) score -= 50;
  } else if (looksLikeSealed(resultTitle, resultUrl)) {
    score -= 5;
  }

  const queryHasLang = LANGUAGE_KEYWORDS.some((lk) => qNorm.includes(lk));
  const detectResultLanguage = (s: string): string | null => {
    const lower = s.toLowerCase();
    for (const lang of LANGUAGE_KEYWORDS) { if (lower.includes(lang)) return lang; }
    return null;
  };
  const resultLang = detectResultLanguage(tNorm) || (resultUrl ? detectResultLanguage(resultUrl) : null);
  if (!queryHasLang && resultLang) score -= 120;
  else if (queryHasLang && !resultLang) score -= 30;

  const queryWantsPC = qNorm.includes('pokemon center');
  const resultHasPC = tNorm.includes('pokemon center') || (resultUrl ? resultUrl.toLowerCase().includes('pokemon-center') : false);
  if (queryWantsPC && !resultHasPC) score -= 80;
  else if (!queryWantsPC && resultHasPC) score -= 80;

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
    const prefix = nameNumEarly[1], name = nameNumEarly[2], fullNum = nameNumEarly[3];
    const shortNum = fullNum.replace(/\/\d+$/, '');
    variants.push(`${prefix}${name} ${fullNum}`.trim());
    if (shortNum !== fullNum) variants.push(`${prefix}${name} ${shortNum}`.trim());
  }

  const withoutSlashPart = query.replace(/\b(\d{1,4})\/\d{1,4}\b/g, '$1');
  if (withoutSlashPart !== query) variants.push(withoutSlashPart);

  const stripped = query.replace(/^(pokemon|magic the gathering|yugioh)\s+/i, '');
  if (stripped !== query) variants.push(stripped);

  if (/\bmega\b/i.test(lower)) variants.push(query.replace(/\bmega\s+/i, 'M ').replace(/\bex\b/i, 'EX'));
  if (/\bvmax\b/i.test(lower)) variants.push(query.replace(/\bVMAX\b/gi, 'V-MAX'));
  if (/\bvstar\b/i.test(lower)) variants.push(query.replace(/\bVSTAR\b/gi, 'V-STAR'));

  if (query.includes("'") || query.includes('\u2019')) variants.push(query.replace(/['\u2019]/g, ''));

  const simplified = query.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*#?\d{1,4}(?:\/\d{1,4})?\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (simplified !== query && simplified.length > 2) variants.push(simplified);

  return [...new Set(variants)];
}

// ───── Combined Search (no hard-filter on sealed) ─────

async function searchCard(query: string): Promise<SearchResult[]> {
  const variants = buildQueryVariants(query);
  for (const variant of variants) {
    try {
      let results = await searchPriceCharting(variant);
      if (results.length === 0) results = await searchPriceChartingAutocomplete(variant);
      if (results.length === 0) results = await searchViaGoogle(variant);
      if (results.length > 0) return rankResults(query, results);
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
    }
  }
  return [];
}

// ───── Price Fetching ─────

async function fetchPrices(cardPath: string) {
  const url = cardPath.startsWith('http') ? cardPath : `https://www.pricecharting.com${cardPath}`;
  const resp = await throttledFetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const html = await resp.text();

  const chartMatch = html.match(/VGPC\.chart_data\s*=\s*(\{[\s\S]*?\});/);
  if (!chartMatch) {
    const pricePattern = /\$([0-9,]+(?:\.[0-9]{2})?)/g;
    const prices: number[] = [];
    let m;
    while ((m = pricePattern.exec(html)) !== null && prices.length < 20) {
      prices.push(parseFloat(m[1].replace(/,/g, '')));
    }
    return { raw: prices[0] ?? 0, grade7: prices[1] ?? 0, grade8: prices[2] ?? 0, grade9: prices[3] ?? 0, grade9_5: prices[4] ?? 0, psa10: prices[5] ?? 0, url };
  }

  try {
    const data = JSON.parse(chartMatch[1]);
    const getLatest = (arr: number[][] | undefined): number => {
      if (!arr || arr.length === 0) return 0;
      const last = arr[arr.length - 1];
      return last ? last[1] / 100 : 0;
    };
    return {
      raw: getLatest(data.used), grade7: getLatest(data.cib), grade8: getLatest(data.new),
      grade9: getLatest(data.graded), grade9_5: getLatest(data.boxonly), psa10: getLatest(data.manualonly), url,
    };
  } catch {
    return { raw: 0, grade7: 0, grade8: 0, grade9: 0, grade9_5: 0, psa10: 0, url };
  }
}

// ───── Vite Plugin ─────

export function priceLookupApiPlugin(): Plugin {
  return {
    name: 'price-lookup-api',
    configureServer(server) {
      server.middlewares.use('/api/price-lookup', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        const urlObj = new URL(req.url || '/', 'http://localhost');
        const q = urlObj.searchParams.get('q');
        const path = urlObj.searchParams.get('path');
        const mode = urlObj.searchParams.get('mode');

        try {
          if (mode === 'prices' && path) {
            const prices = await fetchPrices(path);
            res.statusCode = 200;
            res.end(JSON.stringify(prices));
            return;
          }

          if (q && q.trim()) {
            const results = await searchCard(q.trim());

            if (mode === 'search') {
              res.statusCode = 200;
              res.end(JSON.stringify({ results }));
              return;
            }

            if (results.length === 0) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'No cards found', query: q }));
              return;
            }

            const prices = await fetchPrices(results[0].url);
            res.statusCode = 200;
            res.end(JSON.stringify({
              ...prices,
              matchedTitle: results[0].title,
              allResults: results.slice(0, 5),
            }));
            return;
          }

          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing query parameter: q or path' }));
        } catch (err: unknown) {
          if (err instanceof RateLimitError) {
            res.statusCode = 429;
            res.end(JSON.stringify({ error: 'Rate limited by PriceCharting. Please wait a moment and try again.' }));
            return;
          }
          const message = err instanceof Error ? err.message : 'Unknown error';
          res.statusCode = 500;
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}
