import { REST, Routes } from 'discord.js';
import { env } from './config/env';
import * as setupCmd from './commands/setup';
import * as ctfCmd from './commands/ctf';
import * as newsCmd from './commands/news';
import * as serverCmd from './commands/server';
import * as radioCmd from './commands/radio';
import * as marketCmd from './commands/market';

const commands = [
  setupCmd.data.toJSON(),
  ctfCmd.data.toJSON(),
  newsCmd.data.toJSON(),
  serverCmd.data.toJSON(),
  radioCmd.data.toJSON(),
  marketCmd.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    const data = await rest.put(
      Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID),
      { body: commands }
    );

    console.log(`Successfully reloaded ${(data as any).length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();
