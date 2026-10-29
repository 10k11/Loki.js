import { Client, GatewayIntentBits, Collection, REST, Routes, ChatInputCommandInteraction } from 'discord.js';
import { env } from './config/env';
import * as setupCmd from './commands/setup';
import * as ctfCmd from './commands/ctf';
import * as newsCmd from './commands/news';
import * as serverCmd from './commands/server';
import * as radioCmd from './commands/radio';
import * as marketCmd from './commands/market';
import { startScheduler, startRadarScheduler } from './utils/scheduler';
import { startNewsScheduler } from './news/scheduler';
import { startMarketScheduler } from './market/scheduler';
import { RadioManager } from './radio/radio-manager';

// Extend the client to store commands
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, any>;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
client.commands.set(setupCmd.data.name, setupCmd);
client.commands.set(ctfCmd.data.name, ctfCmd);
client.commands.set(newsCmd.data.name, newsCmd);
client.commands.set(serverCmd.data.name, serverCmd);
client.commands.set(radioCmd.data.name, radioCmd);
client.commands.set(marketCmd.data.name, marketCmd);

import { handleInboxMessage } from './utils/inbox';
import { handleInboxInteraction } from './utils/inboxInteractions';

client.once('clientReady', () => {
  console.log(`Bot logged in as ${client.user?.tag}`);
  startScheduler(client);
  startRadarScheduler(client).catch(err =>
    console.error('[Index] Failed to start radar scheduler:', err)
  );
  startNewsScheduler(client);
  startMarketScheduler(client);
  RadioManager.getInstance().initialize();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  await handleInboxMessage(message);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`[Interaction] No command matching ${interaction.commandName} was found.`);
      return;
    }

    console.log(`[Interaction] Executing command: /${interaction.commandName}`);
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
  } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await handleInboxInteraction(interaction);
  }
});

// Trigger nodemon restart 2
console.log("Restarting from Antigravity edit...");

client.login(env.DISCORD_TOKEN);
