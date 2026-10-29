import cron from 'node-cron';
import { Client } from 'discord.js';
import { runAllNews } from './runner';

export function startNewsScheduler(client: Client) {
  console.log('[NewsScheduler] Initializing news scheduler...');

  // The bot must post separate news digests twice daily in Asia/Kolkata timezone.
  // Schedule: 08:00 Asia/Kolkata
  cron.schedule('0 8 * * *', async () => {
    console.log('[NewsScheduler] Running morning digest (08:00 IST)...');
    await runAllNews(client);
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Schedule: 20:00 Asia/Kolkata
  cron.schedule('0 20 * * *', async () => {
    console.log('[NewsScheduler] Running evening digest (20:00 IST)...');
    await runAllNews(client);
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('[NewsScheduler] Scheduled jobs for 08:00 and 20:00 IST.');
}
