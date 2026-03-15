import type { CardComparison } from './types';

// ───── Types ─────

export interface PriceLookupResult {
  raw: number;
  grade7: number;
  grade8: number;
  grade9: number;
  grade9_5: number;
  psa10: number;
  url: string;
  matchedTitle?: string;
  allResults?: { title: string; url: string }[];
}

export interface LookupStatus {
  cardKey: string;
  status: 'pending' | 'loading' | 'done' | 'error' | 'not-found';
  result?: PriceLookupResult;
  error?: string;
}

// ───── API Base URL ─────

function getApiBase(): string {
  if (window.location.hostname.includes('vercel.app') || window.location.hostname === 'localhost') {
    return '';
  }
  return localStorage.getItem('ppc_api_base') || '';
}

// ───── Rate Limiter ─────

class RateLimiter {
  private queue: (() => Promise<void>)[] = [];
  private running = false;
  private delayMs: number;

  constructor(delayMs = 2000) {
    this.delayMs = delayMs;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs));
      }
    }

    this.running = false;
  }

  clear() {
    this.queue = [];
  }
}

const limiter = new RateLimiter(2000);

// ───── Language Detection ─────

const KNOWN_LANG_CODES = new Set(['EN', 'JP', 'KR', 'CN', 'DE', 'FR', 'IT', 'ES', 'PT', 'NL', 'PL', 'RU', 'TH', 'ID']);

export function detectLanguage(name: string): string {
  if (!name) return 'EN';

  const matches = [...name.matchAll(/\(([A-Z]{2,3})\)/g)];
  for (const m of [...matches].reverse()) {
    if (KNOWN_LANG_CODES.has(m[1])) return m[1];
  }

  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(name)) return 'JP';
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(name)) return 'KR';
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(name)) return 'CN';

  return 'EN';
}

// ───── Query Builder ─────

export function buildQuery(card: CardComparison): string {
  const parts: string[] = [];

  if (card.productName) {
    const name = card.productName.replace(/\s+/g, ' ').trim();
    parts.push(name);
  }

  if (card.cardNumber) {
    parts.push(card.cardNumber);
  }

  if (card.set) {
    parts.push(card.set);
  }

  if (card.category) {
    const gameMap: Record<string, string> = {
      'Pokémon': 'pokemon',
      'Pokemon': 'pokemon',
      'Magic: The Gathering': 'magic the gathering',
      'Yu-Gi-Oh!': 'yugioh',
    };
    const mapped = gameMap[card.category];
    if (mapped) parts.unshift(mapped);
  }

  // Include language keyword for non-English cards
  const lang = card.language || detectLanguage(card.productName);
  if (lang && lang !== 'EN') {
    const langWordMap: Record<string, string> = {
      JP: 'japanese',
      KR: 'korean',
      CN: 'chinese',
      DE: 'german',
      FR: 'french',
      IT: 'italian',
      ES: 'spanish',
      PT: 'portuguese',
    };
    const langWord = langWordMap[lang];
    if (langWord) parts.splice(1, 0, langWord);
  }

  return parts.join(' ');
}

// ───── Single Card Lookup ─────

export async function lookupCard(card: CardComparison): Promise<PriceLookupResult> {
  const query = buildQuery(card);
  if (!query) throw new Error('No card name to search for');

  const apiBase = getApiBase();
  const url = `${apiBase}/api/price-lookup?q=${encodeURIComponent(query)}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `Lookup failed: ${resp.status}`);
  }

  return resp.json();
}

// ───── Lookup with Rate Limiting ─────

export async function lookupCardRateLimited(
  card: CardComparison,
  onProgress: (status: LookupStatus) => void,
): Promise<void> {
  if (!card.productName) {
    onProgress({ cardKey: card.key, status: 'error', error: 'No card name' });
    return;
  }

  onProgress({ cardKey: card.key, status: 'loading' });

  let retries = 0;
  const maxRetries = 2;

  while (retries <= maxRetries) {
    try {
      const result = await limiter.enqueue(() => lookupCard(card));

      if (result.raw === 0 && result.grade9 === 0 && result.psa10 === 0) {
        onProgress({ cardKey: card.key, status: 'not-found', result });
      } else {
        onProgress({ cardKey: card.key, status: 'done', result });
      }
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed';

      if (message.includes('429') || message.includes('Rate limit')) {
        retries++;
        if (retries <= maxRetries) {
          await new Promise((r) => setTimeout(r, 5000 * retries));
          continue;
        }
      }

      onProgress({ cardKey: card.key, status: 'error', error: message });
      break;
    }
  }
}
