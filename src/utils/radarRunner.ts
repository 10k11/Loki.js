import { Client } from 'discord.js';
import { loadRadarStore, saveRadarStore, upsertEvents } from './radarStore';
import { fetchCtftimeEvents } from './ctftimeFetcher';
import { fetchUnstopEvents } from './unstopFetcher';
import { buildRadarReport, postOrUpdateRadarReport } from './radarReporter';

/**
 * Orchestrates a full CTF Radar run:
 *  1. Load existing store
 *  2. Fetch CTFtime events
 *  3. Fetch Unstop events
 *  4. Deduplicate by id
 *  5. Upsert into store and save
 *  6. Build report
 *  7. Post or edit embed in #ctf-calendar
 *  8. Update lastRunAt, lastMessageId, source health in store
 */
export async function runRadarReport(client: Client): Promise<{ channelId: string | null }> {
  console.log('[RadarRunner] Starting CTF Radar report...');

  let store = await loadRadarStore();

  // ── 1. Fetch sources ──────────────────────────────────────────────────────
  const [ctftimeResult, unstopResult] = await Promise.all([
    fetchCtftimeEvents(),
    fetchUnstopEvents(),
  ]);

  // Update source health
  const now = Date.now();
  store.config.sourceHealth.ctftime = {
    ok: ctftimeResult.ok,
    error: ctftimeResult.error ?? null,
    checkedAt: now,
  };
  store.config.sourceHealth.unstop = {
    ok: unstopResult.ok,
    error: unstopResult.error ?? null,
    checkedAt: now,
  };

  // ── 2. Check if all sources failed ───────────────────────────────────────
  if (!ctftimeResult.ok && !unstopResult.ok) {
    console.error('[RadarRunner] All sources failed — posting error notice');
    await postSourceErrorNotice(client, ctftimeResult.error, unstopResult.error);
    store.config.lastRunAt = now;
    await saveRadarStore(store);
    return { channelId: null }; // We can't guarantee channel was found easily, but it's an error state
  }

  // ── 3. Merge and deduplicate ──────────────────────────────────────────────
  const incoming = [...ctftimeResult.events, ...unstopResult.events];

  // Deduplicate by normalized name+date (cross-source)
  const deduped = deduplicateCrossSource(incoming);
  console.log(`[RadarRunner] Merged ${incoming.length} events → ${deduped.length} after dedup`);

  store.events = upsertEvents(store.events, deduped);

  // ── 4. Build report ───────────────────────────────────────────────────────
  const report = buildRadarReport(store.events, store.config.lastRunAt);

  // ── 5. Post or edit embed ─────────────────────────────────────────────────
  const { messageId, channelId } = await postOrUpdateRadarReport(client, report, store);

  // ── 6. Save updated store ─────────────────────────────────────────────────
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  store.config.lastRunAt = now;
  store.config.lastRunDate = todayIST;
  if (messageId) store.config.lastMessageId = messageId;
  if (channelId) store.config.lastChannelId = channelId;

  await saveRadarStore(store);

  console.log(
    `[RadarRunner] Done. CTFtime: ${ctftimeResult.ok ? 'OK' : 'FAIL'}, ` +
    `Unstop: ${unstopResult.ok ? 'OK' : 'FAIL'}, ` +
    `Events stored: ${store.events.length}`
  );

  return { channelId };
}

// ─── Cross-source deduplication ───────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function deduplicateCrossSource(events: ReturnType<typeof Array.prototype.concat>): typeof events {
  const seen = new Map<string, (typeof events)[0]>();

  for (const event of events) {
    const key = normalizeName(event.name);
    if (!seen.has(key)) {
      seen.set(key, event);
    } else {
      // Prefer CTFtime source when there's a conflict
      const existing = seen.get(key)!;
      if (event.source === 'ctftime' && existing.source !== 'ctftime') {
        seen.set(key, event);
      }
    }
  }

  return Array.from(seen.values());
}

// ─── Source error notice ──────────────────────────────────────────────────────

async function postSourceErrorNotice(
  client: Client,
  ctftimeError?: string,
  unstopError?: string
): Promise<void> {
  const { env } = await import('../config/env');
  const channelName = env.CTF_RADAR_CHANNEL || 'ctf-calendar';

  for (const [, guild] of client.guilds.cache) {
    const ch = guild.channels.cache.find(
      c => c.name === channelName && c.isTextBased()
    );
    if (ch && ch.isTextBased()) {
      await (ch as import('discord.js').TextChannel).send({
        content:
          `⚠️ **CTF Radar — Source Error** (${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)\n` +
          `All data sources failed. No report available.\n` +
          (ctftimeError ? `• CTFtime: \`${ctftimeError}\`\n` : '') +
          (unstopError ? `• Unstop: \`${unstopError}\`\n` : '') +
          `\nRetry with \`/ctf radar\` once connectivity is restored.`,
      });
      break;
    }
  }
}
