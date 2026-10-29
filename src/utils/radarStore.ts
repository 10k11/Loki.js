import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RadarEvent {
  id: string;
  name: string;
  source: 'ctftime' | 'unstop' | 'manual';
  eventUrl: string | null;
  registrationUrl: string | null;
  startTime: number | null;       // Unix ms
  finishTime: number | null;      // Unix ms
  timezone: string | null;
  format: string | null;          // e.g. "Jeopardy", "Attack-Defense"
  onlineOrOffline: 'online' | 'offline' | 'hybrid' | null;
  location: string | null;
  teamSize: string | null;
  registrationDeadline: number | null; // Unix ms
  prizeAmount: string | null;     // exact string e.g. "50000" or null
  prizeCurrency: string | null;
  prizeEvidenceUrl: string | null;
  ctfTimeWeight: number | null;
  lastSeenAt: number;             // Unix ms
  contentHash: string;
}

export interface RadarConfig {
  enabled: boolean;
  hour: number;
  minute: number;
  lastRunAt: number | null;       // Unix ms
  lastMessageId: string | null;
  lastChannelId: string | null;
  lastRunDate: string | null;     // ISO date string (YYYY-MM-DD in IST)
  sourceHealth: {
    ctftime: { ok: boolean; error: string | null; checkedAt: number | null };
    unstop:  { ok: boolean; error: string | null; checkedAt: number | null };
  };
}

export interface RadarStore {
  config: RadarConfig;
  events: RadarEvent[];
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: RadarConfig = {
  enabled: true,
  hour: 7,
  minute: 30,
  lastRunAt: null,
  lastMessageId: null,
  lastChannelId: null,
  lastRunDate: null,
  sourceHealth: {
    ctftime: { ok: false, error: null, checkedAt: null },
    unstop:  { ok: false, error: null, checkedAt: null },
  },
};

// ─── Storage paths ───────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const RADAR_FILE = path.join(DATA_DIR, 'ctf-radar.json');

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

export async function loadRadarStore(): Promise<RadarStore> {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(RADAR_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RadarStore>;
    return {
      config: { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) },
      events: parsed.events ?? [],
    };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { config: { ...DEFAULT_CONFIG }, events: [] };
    }
    console.error('[RadarStore] Failed to load ctf-radar.json:', err);
    return { config: { ...DEFAULT_CONFIG }, events: [] };
  }
}

export async function saveRadarStore(store: RadarStore): Promise<void> {
  try {
    await ensureDataDir();
    const tmp = `${RADAR_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
    await fs.rename(tmp, RADAR_FILE);
  } catch (err) {
    console.error('[RadarStore] Failed to save ctf-radar.json:', err);
    throw err;
  }
}

// ─── Content hash ─────────────────────────────────────────────────────────────

export function makeContentHash(event: Omit<RadarEvent, 'contentHash' | 'lastSeenAt'>): string {
  const key = [
    event.id,
    event.name,
    event.startTime,
    event.finishTime,
    event.prizeAmount,
    event.registrationDeadline,
  ].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

// ─── Upsert events ────────────────────────────────────────────────────────────

/**
 * Merges incoming events into the store:
 * - Updates existing events by id (same source) if their contentHash changed
 * - Adds new events
 * - Returns the merged list
 */
export function upsertEvents(existing: RadarEvent[], incoming: RadarEvent[]): RadarEvent[] {
  const map = new Map<string, RadarEvent>();

  for (const e of existing) {
    map.set(e.id, e);
  }

  for (const e of incoming) {
    const prev = map.get(e.id);
    if (!prev || prev.contentHash !== e.contentHash) {
      map.set(e.id, { ...e, lastSeenAt: Date.now() });
    } else {
      // Refresh lastSeenAt to mark it's still around
      map.set(e.id, { ...prev, lastSeenAt: Date.now() });
    }
  }

  return Array.from(map.values());
}
