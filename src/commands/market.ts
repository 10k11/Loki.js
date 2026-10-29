import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { runMarketUpdate } from '../market/runner';

export const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription('Market automation commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('update')
      .setDescription('Manually trigger an intraday stock market update')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (interaction.options.getSubcommand() === 'update') {
    await interaction.reply({ content: 'Fetching and analyzing market data... This might take a few seconds.', ephemeral: true });
    
    // We pass the client from the interaction to run the market update
    // runMarketUpdate handles the channel fetching and embed sending
    await runMarketUpdate(interaction.client);
    
    await interaction.editReply({ content: 'Market update triggered! Check the configured market channel.' });
  }
}
