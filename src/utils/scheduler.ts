import { Client, TextChannel } from 'discord.js';
import { loadWorkspaces, saveWorkspaces, removeWorkspace } from './workspaceUtils';
import { delay } from './channelUtils';
import * as cron from 'node-cron';
import { loadRadarStore, saveRadarStore } from './radarStore';
import { runRadarReport } from './radarRunner';

// ─── Workspace expiry scheduler ───────────────────────────────────────────────

export function startScheduler(client: Client) {
  // Run on startup and then every 60 seconds
  checkWorkspaces(client);
  setInterval(() => checkWorkspaces(client), 60 * 1000);
}

// ─── CTF Radar cron scheduler ─────────────────────────────────────────────────

let radarCronTask: cron.ScheduledTask | null = null;

/**
 * Starts (or restarts) the daily CTF Radar cron job.
 * Reads hour/minute from the persisted RadarConfig.
 * Timezone is always Asia/Kolkata.
 */
export async function startRadarScheduler(client: Client): Promise<void> {
  const store = await loadRadarStore();
  const { enabled, hour, minute } = store.config;

  if (!enabled) {
    console.log('[RadarScheduler] CTF Radar is disabled — skipping cron setup');
    return;
  }

  // Validate cron fields
  const h = Math.min(23, Math.max(0, hour));
  const m = Math.min(59, Math.max(0, minute));
  const expression = `${m} ${h} * * *`;

  console.log(`[RadarScheduler] Scheduling radar at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} IST (cron: "${expression}")`);

  if (radarCronTask) {
    radarCronTask.stop();
    radarCronTask = null;
  }

  radarCronTask = cron.schedule(expression, async () => {
    console.log('[RadarScheduler] Cron fired — running CTF Radar report');
    try {
      await runRadarReport(client);
    } catch (err) {
      console.error('[RadarScheduler] Radar report failed:', err);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('[RadarScheduler] CTF Radar cron job started');
}

/**
 * Restarts the radar cron job after a config change.
 * Call this from /ctf radar-config.
 */
export async function restartRadarScheduler(client: Client): Promise<void> {
  if (radarCronTask) {
    radarCronTask.stop();
    radarCronTask = null;
  }
  await startRadarScheduler(client);
}

// Keep track of warnings sent to avoid spamming
// categoryId -> boolean
const warning1hrSent = new Set<string>();
const warning10minSent = new Set<string>();

async function checkWorkspaces(client: Client) {
  try {
    const workspaces = await loadWorkspaces();
    const now = Date.now();
    
    for (const workspace of workspaces) {
      const timeRemaining = workspace.expiresAt - now;
      
      const guild = client.guilds.cache.get(workspace.guildId);
      if (!guild) continue;
      
      const teamChat = guild.channels.cache.find(
        c => c.parentId === workspace.categoryId && c.name === 'team-chat'
      ) as TextChannel | undefined;

      // Check if expired
      if (timeRemaining <= 0) {
        if (teamChat) {
          await teamChat.send('**Time is up!** 🏁\nThis CTF workspace has expired and will now be deleted.').catch(console.error);
        }
        
        // Sequentially delete channels
        for (const channelId of workspace.channelIds) {
          const ch = guild.channels.cache.get(channelId);
          if (ch) {
            await ch.delete().catch(console.error);
            await delay(500); // Rate limit safe delay
          }
        }
        
        // Delete category
        const category = guild.channels.cache.get(workspace.categoryId);
        if (category) {
          await category.delete().catch(console.error);
        }
        
        // Remove from DB and sets
        await removeWorkspace(workspace.categoryId);
        warning1hrSent.delete(workspace.categoryId);
        warning10minSent.delete(workspace.categoryId);
        
        continue;
      }
      
      // Check for 1 hour warning
      if (timeRemaining <= 60 * 60 * 1000 && !warning1hrSent.has(workspace.categoryId)) {
        if (teamChat) {
          await teamChat.send(`⚠️ **Warning:** This CTF workspace expires in 1 hour! (<t:${Math.floor(workspace.expiresAt/1000)}:R>)`).catch(console.error);
        }
        warning1hrSent.add(workspace.categoryId);
      }
      
      // Check for 10 minutes warning
      if (timeRemaining <= 10 * 60 * 1000 && !warning10minSent.has(workspace.categoryId)) {
        if (teamChat) {
          await teamChat.send(`🚨 **URGENT:** This CTF workspace expires in 10 minutes! Export your final writeups now!`).catch(console.error);
        }
        warning10minSent.add(workspace.categoryId);
      }
    }
  } catch (error) {
    console.error('Error running scheduler:', error);
  }
}
