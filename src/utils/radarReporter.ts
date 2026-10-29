import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { RadarEvent, RadarStore } from './radarStore';
import { env } from '../config/env';

const IST_TZ = 'Asia/Kolkata';
const MAX_EVENTS_PER_SECTION = 5;

// ─── Report sections ─────────────────────────────────────────────────────────

export interface ReportSection {
  label: string;
  emoji: string;
  events: RadarEvent[];
}

export interface ReportData {
  recommended: RadarEvent[];
  indiaStudent: RadarEvent[];
  upcoming: RadarEvent[];
  newSinceLastRun: RadarEvent[];
  startingWithin7Days: RadarEvent[];
  generatedAt: number;
  lastRunAt: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIST(ms: number | null): string {
  if (!ms) return 'Unknown';
  return new Date(ms).toLocaleString('en-IN', {
    timeZone: IST_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' IST';
}

function daysBetween(a: number, b: number): number {
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

const INDIA_KEYWORDS = [
  'india', 'indian', 'iit', 'nit', 'iiit', 'student', 'college', 'university',
  'undergraduate', 'btech', 'b.tech', 'mtech', 'unstop', 'internship',
];

function isIndiaOrStudent(event: RadarEvent): boolean {
  const haystack = [event.name, event.location, event.source]
    .join(' ')
    .toLowerCase();
  return INDIA_KEYWORDS.some(k => haystack.includes(k)) || event.source === 'unstop';
}

function isExpired(event: RadarEvent, now: number): boolean {
  if (event.finishTime && event.finishTime < now) return true;
  if (event.registrationDeadline && event.registrationDeadline < now && !event.startTime) return true;
  return false;
}

// ─── Build report data ────────────────────────────────────────────────────────

export function buildRadarReport(events: RadarEvent[], lastRunAt: number | null): ReportData {
  const now = Date.now();

  const active = events.filter(e => !isExpired(e, now));

  const startingWithin7Days = active
    .filter(e => e.startTime && daysBetween(e.startTime, now) <= 7 && e.startTime >= now)
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  const newSinceLastRun = lastRunAt
    ? active.filter(e => e.lastSeenAt > lastRunAt)
    : [];

  const recommended = active
    .filter(e => e.onlineOrOffline === 'online' && e.startTime && daysBetween(e.startTime, now) <= 14 && e.startTime >= now)
    .sort((a, b) => (b.ctfTimeWeight ?? 0) - (a.ctfTimeWeight ?? 0))
    .slice(0, MAX_EVENTS_PER_SECTION);

  const indiaStudent = active
    .filter(e => isIndiaOrStudent(e) && !recommended.some(r => r.id === e.id))
    .sort((a, b) => (a.startTime ?? Infinity) - (b.startTime ?? Infinity))
    .slice(0, MAX_EVENTS_PER_SECTION);

  const usedIds = new Set([...recommended, ...indiaStudent].map(e => e.id));
  const upcoming = active
    .filter(e => !usedIds.has(e.id))
    .sort((a, b) => (a.startTime ?? Infinity) - (b.startTime ?? Infinity))
    .slice(0, MAX_EVENTS_PER_SECTION);

  return { recommended, indiaStudent, upcoming, newSinceLastRun, startingWithin7Days, generatedAt: now, lastRunAt };
}

// ─── Format a single event as an embed field value ───────────────────────────

function formatEventField(event: RadarEvent): string {
  const lines: string[] = [];

  lines.push(`🌐 **${event.onlineOrOffline ?? 'Unknown'}** • ${event.format ?? 'CTF'}`);
  
  const start = toIST(event.startTime);
  const end = event.finishTime ? ` - ${toIST(event.finishTime)}` : '';
  lines.push(`🕐 ${start}${end}`);
  
  if (event.registrationDeadline && !event.startTime) {
    lines.push(`📋 Reg. deadline: ${toIST(event.registrationDeadline)}`);
  }

  let prizeStr = 'Not stated';
  if (event.prizeAmount) {
    prizeStr = `${event.prizeCurrency ? event.prizeCurrency + ' ' : ''}${event.prizeAmount}`;
  }
  // Truncate prize string if it's too long or multiline
  const prizeLines = prizeStr.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let shortPrize = prizeLines[0] || 'Not stated';
  if (shortPrize.length > 80) shortPrize = shortPrize.substring(0, 77) + '...';
  if (prizeLines.length > 1) shortPrize += ' (+ more)';
  
  lines.push(`🏆 **Prize:** ${shortPrize}`);

  const meta = [];
  if (event.ctfTimeWeight != null) meta.push(`⚖️ Weight: ${event.ctfTimeWeight.toFixed(2)}`);
  meta.push(`📡 Src: \`${event.source}\``);
  lines.push(meta.join(' • '));

  const link = event.registrationUrl || event.eventUrl;
  if (link) lines.push(`🔗 [View Event](${link})`);

  return lines.join('\n');
}

// ─── Build the Discord embeds ─────────────────────────────────────────────────

export function buildEmbeds(report: ReportData): EmbedBuilder[] {
  const dateStr = new Date(report.generatedAt).toLocaleDateString('en-IN', {
    timeZone: IST_TZ,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const embeds: EmbedBuilder[] = [];

  // ── Header embed ──
  const header = new EmbedBuilder()
    .setTitle('📡 Daily CTF Radar')
    .setDescription(
      `**${dateStr} (IST)**\n` +
      `📅 Report generated at ${toIST(report.generatedAt)}\n\n` +
      `🆕 **${report.newSinceLastRun.length}** new since last report\n` +
      `⚡ **${report.startingWithin7Days.length}** starting within 7 days`
    )
    .setColor(0x5865F2)
    .setTimestamp(report.generatedAt);

  embeds.push(header);

  // ── Section builder ──
  function addSection(
    title: string,
    emoji: string,
    color: number,
    events: RadarEvent[],
    emptyMsg: string
  ) {
    if (events.length === 0) {
      const e = new EmbedBuilder()
        .setTitle(`${emoji} ${title}`)
        .setDescription(emptyMsg)
        .setColor(color);
      embeds.push(e);
      return;
    }

    const e = new EmbedBuilder().setTitle(`${emoji} ${title}`).setColor(color);
    for (const event of events.slice(0, MAX_EVENTS_PER_SECTION)) {
      let fieldName = `**${event.name}**`;
      if (fieldName.length > 250) fieldName = fieldName.substring(0, 247) + '...';
      
      let fieldValue = formatEventField(event);
      if (fieldValue.length > 1024) fieldValue = fieldValue.substring(0, 1021) + '...';

      e.addFields({
        name: fieldName,
        value: fieldValue,
        inline: false,
      });
    }
    if (events.length > MAX_EVENTS_PER_SECTION) {
      e.setFooter({ text: `+ ${events.length - MAX_EVENTS_PER_SECTION} more events not shown` });
    }
    embeds.push(e);
  }

  addSection(
    'Recommended — Online CTFs (≤ 14 days)',
    '⭐',
    0x57F287,
    report.recommended,
    '*No recommended online CTFs starting in the next 14 days.*'
  );

  addSection(
    'India / Student Opportunities',
    '🇮🇳',
    0xFF9B00,
    report.indiaStudent,
    '*No India or student-specific events found right now.*'
  );

  addSection(
    'Upcoming CTFs',
    '📅',
    0x5865F2,
    report.upcoming,
    '*No additional upcoming CTFs found.*'
  );

  // Footer embed
  const footer = new EmbedBuilder()
    .setDescription(
      '> Data from [CTFtime](https://ctftime.org) & [Unstop](https://unstop.com) — public listings only.\n' +
      '> Prize info shown only when explicitly stated on official pages.\n' +
      '> Run `/ctf radar` to refresh. Configure with `/ctf radar-config`.'
    )
    .setColor(0x4f545c);
  embeds.push(footer);

  return embeds;
}

// ─── Post or edit the report ──────────────────────────────────────────────────

export async function postOrUpdateRadarReport(
  client: Client,
  report: ReportData,
  store: RadarStore
): Promise<{ messageId: string | null; channelId: string | null }> {
  const channelName = env.CTF_RADAR_CHANNEL || 'ctf-calendar';

  // Find the channel across all guilds
  let targetChannel: TextChannel | null = null;
  for (const [, guild] of client.guilds.cache) {
    const ch = guild.channels.cache.find(
      c => c.name === channelName && c.isTextBased()
    ) as TextChannel | undefined;
    if (ch) {
      targetChannel = ch;
      break;
    }
  }

  if (!targetChannel) {
    console.error(`[RadarReporter] Channel #${channelName} not found in any guild`);
    return { messageId: null, channelId: null };
  }

  const embeds = buildEmbeds(report);

  // Same-day check: edit existing message if we already posted today
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: IST_TZ }); // YYYY-MM-DD
  const lastRunDate = store.config.lastRunDate;
  const existingMsgId = store.config.lastMessageId;
  const existingChannelId = store.config.lastChannelId;

  if (lastRunDate === todayIST && existingMsgId && existingChannelId === targetChannel.id) {
    try {
      const existing = await targetChannel.messages.fetch(existingMsgId);
      await existing.edit({ embeds });
      console.log('[RadarReporter] Edited existing daily report message:', existingMsgId);
      return { messageId: existingMsgId, channelId: targetChannel.id };
    } catch (err: any) {
      console.warn('[RadarReporter] Could not edit existing message (will post new):', err.message);
    }
  }

  // Post new message
  const msg = await targetChannel.send({ embeds });
  console.log('[RadarReporter] Posted new radar report message:', msg.id);
  return { messageId: msg.id, channelId: targetChannel.id };
}
