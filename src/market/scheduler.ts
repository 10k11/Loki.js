import cron from 'node-cron';
import { Client } from 'discord.js';
import { runMarketUpdate } from './runner';

export function startMarketScheduler(client: Client) {
  console.log('[MarketScheduler] Initializing Indian stock market scheduler...');

  // Schedule: 09:20 Asia/Kolkata Mon-Fri
  cron.schedule('20 9 * * 1-5', async () => {
    console.log('[MarketScheduler] Running morning market update (09:20 IST)...');
    await runMarketUpdate(client);
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Schedule: 11:00 Asia/Kolkata Mon-Fri
  cron.schedule('0 11 * * 1-5', async () => {
    console.log('[MarketScheduler] Running mid-morning market update (11:00 IST)...');
    await runMarketUpdate(client);
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Schedule: 13:00 (1 PM) Asia/Kolkata Mon-Fri
  cron.schedule('0 13 * * 1-5', async () => {
    console.log('[MarketScheduler] Running afternoon market update (13:00 IST)...');
    await runMarketUpdate(client);
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('[MarketScheduler] Scheduled market updates for 09:20, 11:00, and 13:00 IST (Mon-Fri).');
}
