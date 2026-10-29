import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { serverLayout } from '../config/serverLayout';
import { getOrCreateCategory, getOrCreateChannel, delay } from '../utils/channelUtils';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Manage server setup')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('preview')
      .setDescription('Preview the exact categories and channels that would be created')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('apply')
      .setDescription('Create missing categories and channels according to the layout')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;

  if (!guild) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  if (subcommand === 'preview') {
    let previewContent = '### Server Setup Preview\n\n';

    for (const categoryDef of serverLayout) {
      const categoryExists = guild.channels.cache.some(
        (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryDef.name.toLowerCase()
      );
      
      previewContent += `**${categoryDef.name}** ${categoryExists ? '(Exists)' : '(Will Create)'}\n`;
      
      const parentId = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryDef.name.toLowerCase()
      )?.id;

      for (const channelDef of categoryDef.channels) {
        const channelExists = parentId
          ? guild.channels.cache.some(
              (c) => c.parentId === parentId && c.name.toLowerCase() === channelDef.name.toLowerCase()
            )
          : false;

        const icon = channelDef.type === ChannelType.GuildText ? '#' : '🔊';
        previewContent += `└─ ${icon} ${channelDef.name} ${channelExists ? '(Exists)' : '(Will Create)'}\n`;
      }
      previewContent += '\n';
    }

    await interaction.reply({ content: previewContent, ephemeral: true });
  } else if (subcommand === 'apply') {
    await interaction.deferReply({ ephemeral: false });

    try {
      for (const categoryDef of serverLayout) {
        const category = await getOrCreateCategory(guild, categoryDef.name);
        await delay(500); // Rate limit safety

        for (const channelDef of categoryDef.channels) {
          await getOrCreateChannel(guild, category, channelDef);
          await delay(500); // Rate limit safety
        }
      }

      await interaction.editReply('Server setup applied successfully!');
    } catch (error) {
      console.error('Error applying setup:', error);
      await interaction.editReply('An error occurred while applying the setup. Check bot logs.');
    }
  }
}
