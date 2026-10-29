import { ButtonInteraction, StringSelectMenuInteraction, StringSelectMenuBuilder, ActionRowBuilder, TextChannel, Message, EmbedBuilder, GuildMember, PermissionFlagsBits } from 'discord.js';
import { ALLOWED_DESTINATIONS, DestinationChannel } from '../config/constants';

async function forwardMessage(interaction: ButtonInteraction | StringSelectMenuInteraction, destinationName: string, originalMessage: Message) {
  const guild = interaction.guild;
  if (!guild) return;

  const destinationChannel = guild.channels.cache.find(c => c.name === destinationName && c.isTextBased()) as TextChannel | undefined;

  if (!destinationChannel) {
    await interaction.reply({ content: `Error: Destination channel #${destinationName} not found.`, ephemeral: true });
    return;
  }

  const files = originalMessage.attachments.map(a => a.url);

  // Attempt to forward
  try {
    await destinationChannel.send({
      content: `${originalMessage.content}\n\n*Submitted via #drop-zone by ${originalMessage.author}*`,
      files: files.length > 0 ? files : undefined,
      embeds: originalMessage.embeds
    });

    await originalMessage.delete();

    const successEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setDescription(`✅ Message successfully forwarded to <#${destinationChannel.id}>.`);

    await interaction.update({ embeds: [successEmbed], components: [] });
  } catch (error) {
    console.error('Failed to forward message:', error);
    await interaction.reply({ content: 'Failed to forward message due to an error.', ephemeral: true });
  }
}

export async function handleInboxInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction) {
  if (!interaction.message.reference?.messageId) {
    // If we can't find the original message reference, we can't be sure who the author is easily.
    // Actually, we can fetch the referenced message.
  }

  let originalMessage: Message | undefined;
  try {
    originalMessage = await interaction.channel?.messages.fetch(interaction.message.reference?.messageId as string);
  } catch (error) {
    console.error('Could not fetch original message:', error);
  }

  if (!originalMessage) {
    await interaction.reply({ content: 'Original message not found. It may have been deleted.', ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember | null;
  const isAdmin = member?.permissions.has(PermissionFlagsBits.ManageChannels);

  if (interaction.user.id !== originalMessage.author.id && !isAdmin) {
    await interaction.reply({ content: 'Only the author of the message or an admin can use these controls.', ephemeral: true });
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith('inbox_send_')) {
      const destName = customId.replace('inbox_send_', '');
      await forwardMessage(interaction, destName, originalMessage);
    } 
    else if (customId === 'inbox_choose_diff') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('inbox_select_dest')
        .setPlaceholder('Select a destination channel')
        .addOptions(
          ALLOWED_DESTINATIONS.map(dest => ({
            label: `#${dest}`,
            value: dest
          }))
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      
      await interaction.update({ components: [row] });
    }
    else if (customId === 'inbox_keep') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#888888')
        .setFooter({ text: 'Kept in Drop Zone' });
        
      await interaction.update({ embeds: [embed], components: [] });
    }
  } 
  else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'inbox_select_dest') {
      const destName = interaction.values[0];
      await forwardMessage(interaction, destName, originalMessage);
    }
  }
}
