import fetch from 'node-fetch';
import { RadarEvent, makeContentHash } from './radarStore';

const CTFTIME_API = 'https://ctftime.org/api/v1/events/';
const USER_AGENT = 'localhost-ctf-discord-bot/1.0 (https://github.com/10k11/Loki.js)';
const TIMEOUT_MS = 12000;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 2000;

export interface FetchResult {
  events: RadarEvent[];
  ok: boolean;
  error?: string;
}

// ─── Types from CTFtime API ───────────────────────────────────────────────────

interface CtftimeEvent {
  id: number;
  title: string;
  url: string;
  ctftime_url: string;
  logo: string;
  format: string;
  format_id: number;
  start: string;  // ISO 8601
  finish: string; // ISO 8601
  duration: { hours: number; minutes: number };
  weight: number;
  onsite: boolean;
  location: string;
  participants: number;
  prizes: string;
  restrictions: string;
  organizers: Array<{ id: number; name: string }>;
}

// ─── Fetch helper with timeout + retry ───────────────────────────────────────

async function fetchWithRetry(url: string, attempt = 0): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal as any,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } catch (err: any) {
    clearTimeout(timer);
    if (attempt < RETRY_COUNT) {
      console.warn(`[CTFtime] Retry ${attempt + 1}/${RETRY_COUNT} after error: ${err.message}`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return fetchWithRetry(url, attempt + 1);
    }
    throw err;
  }
}

// ─── Map CTFtime event to RadarEvent ─────────────────────────────────────────

function mapCtftimeEvent(e: CtftimeEvent): RadarEvent {
  const startTime = e.start ? new Date(e.start).getTime() : null;
  const finishTime = e.finish ? new Date(e.finish).getTime() : null;

  // Prize: only use if explicitly stated in the prizes field (non-empty, non-generic)
  let prizeAmount: string | null = null;
  let prizeCurrency: string | null = null;
  if (e.prizes && e.prizes.trim() && e.prizes.trim().toLowerCase() !== 'none') {
    // We store the raw prize string; reporter will display it verbatim
    prizeAmount = e.prizes.trim();
  }

  const partial: Omit<RadarEvent, 'contentHash'> = {
    id: `ctftime-${e.id}`,
    name: e.title,
    source: 'ctftime',
    eventUrl: e.ctftime_url || e.url || null,
    registrationUrl: e.url || null,
    startTime,
    finishTime,
    timezone: 'UTC',
    format: e.format || null,
    onlineOrOffline: e.onsite ? 'offline' : 'online',
    location: e.location || null,
    teamSize: null,
    registrationDeadline: null,
    prizeAmount,
    prizeCurrency,
    prizeEvidenceUrl: null,
    ctfTimeWeight: e.weight ?? null,
    lastSeenAt: Date.now(),
  };

  return { ...partial, contentHash: makeContentHash(partial) };
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function fetchCtftimeEvents(): Promise<FetchResult> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const thirtyDays = now + 30 * 24 * 60 * 60;
    const url = `${CTFTIME_API}?limit=50&start=${now}&finish=${thirtyDays}`;

    console.log('[CTFtime] Fetching events from:', url);
    const raw = await fetchWithRetry(url);
    const data = JSON.parse(raw) as CtftimeEvent[];

    if (!Array.isArray(data)) {
      throw new Error('CTFtime API did not return an array');
    }

    const events = data.map(mapCtftimeEvent);
    console.log(`[CTFtime] Fetched ${events.length} events`);
    return { events, ok: true };
  } catch (err: any) {
    console.error('[CTFtime] Fetch failed:', err.message);
    return { events: [], ok: false, error: err.message };
  }
}
