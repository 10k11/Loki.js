import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env file (force override to pick up hot reloads)
config({ path: resolve(__dirname, '../../.env'), override: true });

export const env = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  CLIENT_ID: process.env.CLIENT_ID || '',
  GUILD_ID: process.env.GUILD_ID || '',
  // Optional: used for Mistral-assisted field extraction from event pages
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
  // Optional: name of the Discord channel for daily CTF reports (default: ctf-calendar)
  CTF_RADAR_CHANNEL: process.env.CTF_RADAR_CHANNEL || 'ctf-calendar',

  // Market Automation Feature
  MARKET_ANALYSIS_CHANNEL_ID: process.env.MARKET_ANALYSIS_CHANNEL_ID || '',
  MARKET_NEWS_CHANNEL_ID: process.env.MARKET_NEWS_CHANNEL_ID || '',

  // 24/7 Radio Feature Configuration (Optional)
  STUDY_RADIO_BOT_TOKEN: process.env.STUDY_RADIO_BOT_TOKEN || '',
  POP_RADIO_BOT_TOKEN: process.env.POP_RADIO_BOT_TOKEN || '',
  STUDY_STREAM_URL: process.env.STUDY_STREAM_URL || '',
  POP_STREAM_URL: process.env.POP_STREAM_URL || '',
  STUDY_VOICE_CHANNEL_ID: process.env.STUDY_VOICE_CHANNEL_ID || '',
  POP_VOICE_CHANNEL_ID: process.env.POP_VOICE_CHANNEL_ID || '',
  RADIO_ADMIN_USER_IDS: process.env.RADIO_ADMIN_USER_IDS ? process.env.RADIO_ADMIN_USER_IDS.split(',').map(id => id.trim()) : [],
};

// Required variables — bot cannot start without these
const required: Array<keyof typeof env> = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missing = required.filter(key => !env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Optional variables — warn but continue
if (!env.MISTRAL_API_KEY) {
  console.warn('[Env] MISTRAL_API_KEY not set — Mistral-assisted extraction will be skipped.');
}
