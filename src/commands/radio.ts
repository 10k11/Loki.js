import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  GuildChannelCreateOptions,
} from 'discord.js';
import { env } from '../config/env';
import { RadioManager } from '../radio/radio-manager';

const ADMIN_IDS = env.RADIO_ADMIN_USER_IDS;

function isRadioAdmin(userId: string): boolean {
  return ADMIN_IDS.includes(userId);
}

export const data = new SlashCommandBuilder()
  .setName('radio')
  .setDescription('Manage the 24/7 radio bots')
  .addSubcommand(subcmd =>
    subcmd
      .setName('setup')
      .setDescription('Setup the radio category and channels (requires Manage Channels)')
  )
  .addSubcommand(subcmd =>
    subcmd
      .setName('status')
      .setDescription('Check the status of the radio stations')
  )
  .addSubcommand(subcmd =>
    subcmd
      .setName('restart')
      .setDescription('Restart a radio station')
      .addStringOption(opt =>
        opt.setName('station')
          .setDescription('The station to restart')
          .setRequired(true)
          .addChoices(
            { name: 'Study', value: 'study' },
            { name: 'Pop', value: 'pop' }
          )
      )
  )
  .addSubcommand(subcmd =>
    subcmd
      .setName('stop')
      .setDescription('Stop a radio station')
      .addStringOption(opt =>
        opt.setName('station')
          .setDescription('The station to stop')
          .setRequired(true)
          .addChoices(
            { name: 'Study', value: 'study' },
            { name: 'Pop', value: 'pop' }
          )
      )
  )
  .addSubcommand(subcmd =>
    subcmd
      .setName('start')
      .setDescription('Start a radio station')
      .addStringOption(opt =>
        opt.setName('station')
          .setDescription('The station to start')
          .setRequired(true)
          .addChoices(
            { name: 'Study', value: 'study' },
            { name: 'Pop', value: 'pop' }
          )
      )
  )
  .addSubcommand(subcmd =>
    subcmd
      .setName('set-stream')
      .setDescription('Change the stream URL for a station')
      .addStringOption(opt =>
        opt.setName('station')
          .setDescription('The station to configure')
          .setRequired(true)
          .addChoices(
            { name: 'Study', value: 'study' },
            { name: 'Pop', value: 'pop' }
          )
      )
      .addStringOption(opt =>
        opt.setName('url')
          .setDescription('The new stream URL')
          .setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const manager = RadioManager.getInstance();

  if (subcommand === 'setup') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: 'You need the Manage Channels permission to use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    if (!guild) return interaction.followUp('Not in a guild.');

    try {
      const everyoneRole = guild.roles.everyone;
      let category = guild.channels.cache.find(c => c.name === '🎵 24/7 RADIO' && c.type === ChannelType.GuildCategory);
      
      if (!category) {
        const chillCategory = guild.channels.cache.find(c => c.name === '🎮 CHILL' && c.type === ChannelType.GuildCategory);
        
        category = await guild.channels.create({
          name: '🎵 24/7 RADIO',
          type: ChannelType.GuildCategory,
          position: chillCategory ? (chillCategory as any).position + 1 : undefined,
        });
      }

      let controlChannel = guild.channels.cache.find(c => c.name === 'radio-control' && c.parentId === category?.id);
      if (!controlChannel) {
        controlChannel = await guild.channels.create({
          name: 'radio-control',
          type: ChannelType.GuildText,
          parent: category.id,
        });

        const guideMsg = await (controlChannel as any).send(
          '# 🎵 24/7 Radio\n\n' +
          '🔊 study-lofi — continuous focus and lofi station\n' +
          '🔊 english-pop — continuous English pop radio station\n\n' +
          'Join a voice channel to listen.\n\n' +
          'Only admins can restart or change stations:\n' +
          '`/radio status`\n' +
          '`/radio restart station:study`\n' +
          '`/radio restart station:pop`'
        );
        await guideMsg.pin();
      }

      const createVoice = async (name: string) => {
        let vc = guild.channels.cache.find(c => c.name === name && c.parentId === category?.id);
        if (!vc) {
          vc = await guild.channels.create({
            name,
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: [
              {
                id: everyoneRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                deny: [PermissionFlagsBits.Speak],
              }
            ],
          });
        }
        return vc;
      };

      await createVoice('study-lofi');
      await createVoice('english-pop');

      return interaction.followUp('Radio setup completed successfully.');
    } catch (error) {
      console.error(error);
      return interaction.followUp('An error occurred during setup.');
    }
  }

  if (subcommand === 'status') {
    const status = manager.getStatus();
    
    const embed = new EmbedBuilder()
      .setTitle('🎵 24/7 Radio Status')
      .setColor('#0099ff')
      .setTimestamp();

    const formatStation = (name: string, state: any) => {
      if (!state) return 'Not configured or offline.';
      
      const uptime = state.uptimeStart 
        ? `<t:${Math.floor(state.uptimeStart / 1000)}:R>` 
        : 'N/A';
        
      return `**Status:** ${state.state}\n` +
             `**Channel:** ${state.voiceChannelName || state.voiceChannelId}\n` +
             `**Stream:** ${state.streamDomain || 'Unknown'}\n` +
             `**Uptime:** ${uptime}\n` +
             (state.lastError ? `**Last Error:** ${state.lastError}\n` : '');
    };

    embed.addFields(
      { name: 'Study Radio (study-lofi)', value: formatStation('Study', status.study) },
      { name: 'Pop Radio (english-pop)', value: formatStation('Pop', status.pop) }
    );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Mutation commands: everyone can use them now per user request
  const station = interaction.options.getString('station', true) as 'study' | 'pop';

  await interaction.deferReply({ ephemeral: true });

  try {
    if (subcommand === 'restart') {
      await manager.restartStation(station);
      return interaction.followUp(`Restarted the ${station} radio station.`);
    }

    if (subcommand === 'stop') {
      await manager.stopStation(station);
      return interaction.followUp(`Stopped the ${station} radio station.`);
    }

    if (subcommand === 'start') {
      await manager.startStation(station);
      return interaction.followUp(`Started the ${station} radio station.`);
    }

    if (subcommand === 'set-stream') {
      const url = interaction.options.getString('url', true);
      
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return interaction.followUp('Invalid URL provided.');
      }
      
      await manager.updateStreamUrl(station, url);
      return interaction.followUp(`Updated the stream URL for ${station} and restarted the station.`);
    }
  } catch (error: any) {
    console.error(error);
    return interaction.followUp(`An error occurred: ${error.message}`);
  }
}
