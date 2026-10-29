import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { RadarEvent, makeContentHash } from './radarStore';
import { extractEventFieldsWithMistral } from './mistralExtractor';

const USER_AGENT =
  'Mozilla/5.0 (compatible; localhost-ctf-discord-bot/1.0; +https://github.com/10k11/Loki.js)';
const TIMEOUT_MS = 12000;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 3000;

// Unstop public listing page for cybersecurity / hackathons
const LISTING_URL = 'https://unstop.com/hackathons?domain=cyber-security&oppstatus=open';

export interface FetchResult {
  events: RadarEvent[];
  ok: boolean;
  error?: string;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchHtml(url: string, attempt = 0): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal as any,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err: any) {
    clearTimeout(timer);
    if (attempt < RETRY_COUNT) {
      console.warn(`[Unstop] Retry ${attempt + 1}/${RETRY_COUNT}: ${err.message}`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return fetchHtml(url, attempt + 1);
    }
    throw err;
  }
}

// ─── Deterministic date parsing ──────────────────────────────────────────────

function parseUnstopDate(raw: string | undefined): number | null {
  if (!raw) return null;
  const ts = Date.parse(raw.trim());
  return isNaN(ts) ? null : ts;
}

// ─── Extract events from listing HTML ────────────────────────────────────────

interface UnstopCard {
  name: string;
  url: string;
  startText: string | null;
  endText: string | null;
  deadlineText: string | null;
  location: string | null;
  onlineOrOffline: 'online' | 'offline' | 'hybrid' | null;
  prizeText: string | null;
}

function extractCardsFromHtml(html: string, baseUrl: string): UnstopCard[] {
  const $ = cheerio.load(html);
  const cards: UnstopCard[] = [];

  // Unstop renders competition cards in various wrappers; try multiple selectors
  const selectors = [
    'app-competition-card',
    '.opportunity-card',
    '[class*="competition-card"]',
    '[class*="listing-card"]',
    'article',
  ];

  let cardEls = $([]);
  for (const sel of selectors) {
    const found = $(sel);
    if (found.length > 0) {
      cardEls = found;
      break;
    }
  }

  if (cardEls.length === 0) {
    // Fallback: look for any link with "/hackathons/" or "/competitions/" in href
    $('a[href*="/hackathons/"], a[href*="/competitions/"]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      const name = $(el).text().trim();
      if (name.length > 5 && href.length > 10) {
        cards.push({
          name,
          url: href.startsWith('http') ? href : `https://unstop.com${href}`,
          startText: null,
          endText: null,
          deadlineText: null,
          location: null,
          onlineOrOffline: null,
          prizeText: null,
        });
      }
    });
    return cards;
  }

  cardEls.each((_i, el) => {
    const $el = $(el);
    const linkEl = $el.find('a[href*="/hackathons/"], a[href*="/competitions/"]').first();
    const href = linkEl.attr('href') || $el.find('a').first().attr('href') || '';
    const name = $el.find('[class*="title"], [class*="name"], h2, h3').first().text().trim()
      || linkEl.text().trim();

    if (!name || !href) return;

    const fullUrl = href.startsWith('http') ? href : `https://unstop.com${href}`;

    // Dates
    const dateEls = $el.find('[class*="date"], [class*="deadline"], time');
    const dates = dateEls.map((_j, d) => $(d).text().trim()).get();

    // Location / online
    const locationText = $el.find('[class*="location"], [class*="mode"]').first().text().trim() || null;
    let onlineOrOffline: 'online' | 'offline' | 'hybrid' | null = null;
    if (locationText) {
      const lt = locationText.toLowerCase();
      if (lt.includes('online')) onlineOrOffline = 'online';
      else if (lt.includes('hybrid')) onlineOrOffline = 'hybrid';
      else if (lt.includes('offline') || lt.includes('on-site') || lt.includes('onsite')) onlineOrOffline = 'offline';
    }

    // Prize
    const prizeEl = $el.find('[class*="prize"], [class*="reward"]').first();
    const prizeText = prizeEl.text().trim() || null;

    cards.push({
      name,
      url: fullUrl,
      startText: dates[0] || null,
      endText: dates[1] || null,
      deadlineText: dates[2] || null,
      location: locationText,
      onlineOrOffline,
      prizeText,
    });
  });

  return cards;
}

// ─── Build a RadarEvent from a card (+ optional Mistral enrichment) ──────────

async function cardToRadarEvent(card: UnstopCard): Promise<RadarEvent> {
  const startTime = parseUnstopDate(card.startText ?? undefined);
  const finishTime = parseUnstopDate(card.endText ?? undefined);
  const registrationDeadline = parseUnstopDate(card.deadlineText ?? undefined);

  let prizeAmount: string | null = null;
  let prizeCurrency: string | null = null;
  let prizeEvidenceUrl: string | null = null;
  let onlineOrOffline = card.onlineOrOffline;
  let location = card.location;
  let format: string | null = null;
  let teamSize: string | null = null;

  // Deterministic prize parsing: only accept if a clear number is present
  if (card.prizeText) {
    const match = card.prizeText.match(/([₹$€£])\s?([\d,]+)/);
    if (match) {
      const symbolMap: Record<string, string> = { '₹': 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP' };
      prizeAmount = match[2].replace(/,/g, '');
      prizeCurrency = symbolMap[match[1]] || null;
      prizeEvidenceUrl = card.url;
    }
  }

  // If deterministic extraction is insufficient, optionally call Mistral
  const missingCritical = !startTime || !finishTime || (!prizeAmount && card.prizeText);
  if (missingCritical) {
    try {
      // Fetch the individual event page text (low volume, single page)
      const html = await fetchHtml(card.url, 0);
      const $ = cheerio.load(html);
      // Remove script/style for cleaner text
      $('script, style, nav, footer, header').remove();
      const pageText = $('body').text().replace(/\s+/g, ' ').trim();

      const extracted = await extractEventFieldsWithMistral(pageText, card.url);
      if (extracted) {
        if (!startTime && extracted.startTime) {
          const ts = Date.parse(extracted.startTime);
          if (!isNaN(ts)) (card as any)._startTime = ts;
        }
        if (!finishTime && extracted.finishTime) {
          const ts = Date.parse(extracted.finishTime);
          if (!isNaN(ts)) (card as any)._finishTime = ts;
        }
        if (!prizeAmount && extracted.prizeAmount) {
          prizeAmount = extracted.prizeAmount;
          prizeCurrency = extracted.prizeCurrency ?? null;
          prizeEvidenceUrl = extracted.prizeEvidenceUrl ?? card.url;
        }
        if (!onlineOrOffline && extracted.onlineOrOffline) onlineOrOffline = extracted.onlineOrOffline;
        if (!location && extracted.location) location = extracted.location;
        if (!format && extracted.format) format = extracted.format;
        if (!teamSize && extracted.teamSize) teamSize = extracted.teamSize;
      }
    } catch (err: any) {
      console.warn(`[Unstop] Could not enrich event "${card.name}": ${err.message}`);
    }
  }

  const id = `unstop-${crypto.createHash('md5').update(card.url).digest('hex').slice(0, 12)}`;

  const partial: Omit<RadarEvent, 'contentHash'> = {
    id,
    name: card.name,
    source: 'unstop',
    eventUrl: card.url,
    registrationUrl: card.url,
    startTime: (card as any)._startTime ?? startTime,
    finishTime: (card as any)._finishTime ?? finishTime,
    timezone: null,
    format,
    onlineOrOffline,
    location,
    teamSize,
    registrationDeadline: registrationDeadline ?? null,
    prizeAmount,
    prizeCurrency,
    prizeEvidenceUrl,
    ctfTimeWeight: null,
    lastSeenAt: Date.now(),
  };

  return { ...partial, contentHash: makeContentHash(partial) };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function fetchUnstopEvents(): Promise<FetchResult> {
  try {
    console.log('[Unstop] Fetching listing from:', LISTING_URL);
    const html = await fetchHtml(LISTING_URL);
    const cards = extractCardsFromHtml(html, LISTING_URL);

    if (cards.length === 0) {
      console.warn('[Unstop] No event cards found in HTML — page structure may have changed');
      return { events: [], ok: true }; // Not a hard failure
    }

    console.log(`[Unstop] Found ${cards.length} cards, enriching...`);

    // Process cards sequentially to avoid hammering Unstop
    const events: RadarEvent[] = [];
    for (const card of cards.slice(0, 15)) { // Limit to 15 for safety
      try {
        const event = await cardToRadarEvent(card);
        events.push(event);
        await new Promise(r => setTimeout(r, 800)); // polite delay between pages
      } catch (err: any) {
        console.warn(`[Unstop] Failed to process card "${card.name}": ${err.message}`);
      }
    }

    console.log(`[Unstop] Successfully processed ${events.length} events`);
    return { events, ok: true };
  } catch (err: any) {
    console.error('[Unstop] Fetch failed:', err.message);
    return { events: [], ok: false, error: err.message };
  }
}
