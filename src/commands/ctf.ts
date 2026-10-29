import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder
} from 'discord.js';
import { slugify, getOrCreateCategory, getOrCreateChannel, delay } from '../utils/channelUtils';
import { addWorkspace, getWorkspaceBySlug, updateWorkspace, removeWorkspace, loadWorkspaces } from '../utils/workspaceUtils';
import { loadRadarStore, saveRadarStore } from '../utils/radarStore';
import { runRadarReport } from '../utils/radarRunner';
import { restartRadarScheduler } from '../utils/scheduler';

export const data = new SlashCommandBuilder()
  .setName('ctf')
  .setDescription('Manage CTFs')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('create')
      .setDescription('Create a new CTF category and channels')
      .addStringOption((option) =>
        option.setName('name').setDescription('Name of the CTF').setRequired(true)
      )
      .addStringOption((option) =>
        option.setName('url').setDescription('URL of the CTF').setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('archive')
      .setDescription('Archive an existing CTF category')
      .addStringOption((option) =>
        option.setName('name').setDescription('Name of the CTF to archive').setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('start')
      .setDescription('Start a temporary private CTF workspace')
      .addStringOption((option) => option.setName('name').setDescription('Name of the CTF').setRequired(true))
      .addUserOption((option) => option.setName('teammate').setDescription('Your teammate for this CTF').setRequired(true))
      .addIntegerOption((option) => option.setName('duration').setDescription('Duration in hours (1-168, default 24)').setRequired(false).setMinValue(1).setMaxValue(168))
      .addStringOption((option) => option.setName('url').setDescription('URL of the CTF').setRequired(false))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('extend')
      .setDescription('Extend a temporary CTF workspace')
      .addStringOption((option) => option.setName('name').setDescription('Name of the CTF workspace').setRequired(true))
      .addIntegerOption((option) => option.setName('hours').setDescription('Hours to add').setRequired(true).setMinValue(1))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('close')
      .setDescription('Close and delete a temporary CTF workspace')
      .addStringOption((option) => option.setName('name').setDescription('Name of the CTF workspace').setRequired(true))
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('status')
      .setDescription('Show status of temporary CTF workspaces')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('radar')
      .setDescription('Fetch and post the latest CTF Radar report immediately')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('radar-config')
      .setDescription('Configure the daily CTF Radar schedule')
      .addBooleanOption(option =>
        option.setName('enabled').setDescription('Enable or disable the daily radar').setRequired(false)
      )
      .addIntegerOption(option =>
        option.setName('hour').setDescription('Hour to post (0-23, IST)').setRequired(false).setMinValue(0).setMaxValue(23)
      )
      .addIntegerOption(option =>
        option.setName('minute').setDescription('Minute to post (0-59, IST)').setRequired(false).setMinValue(0).setMaxValue(59)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('radar-status')
      .setDescription('Show CTF Radar schedule, last run, next run, source health, and event count')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;

  if (!guild) {
    return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
  }

  if (subcommand === 'create') {
    const name = interaction.options.getString('name', true);
    const url = interaction.options.getString('url') || 'N/A';
    const slug = slugify(name);
    const categoryName = `🏁 ctf-${slug}`;

    await interaction.deferReply({ ephemeral: false });

    try {
      const category = await getOrCreateCategory(guild, categoryName);
      await delay(500);

      const channelsToCreate: import('../config/serverLayout').ChannelDefinition[] = [
        { name: 'announcements', type: ChannelType.GuildText },
        { name: 'ctf-chat', type: ChannelType.GuildText },
        { name: 'web', type: ChannelType.GuildText },
        { name: 'crypto', type: ChannelType.GuildText },
        { name: 'forensics', type: ChannelType.GuildText },
        { name: 'rev-pwn', type: ChannelType.GuildText },
        { name: 'notes-links', type: ChannelType.GuildText },
        { name: 'writeup-drafts', type: ChannelType.GuildText },
      ];

      let notesLinksChannel: TextChannel | null = null;

      for (const def of channelsToCreate) {
        const channel = await getOrCreateChannel(guild, category, def) as TextChannel;
        if (def.name === 'notes-links') {
          notesLinksChannel = channel;
        }
        await delay(500);
      }

      if (notesLinksChannel) {
        const template = `**CTF Name:** ${name}\n**URL:** ${url}\n**Dates:** \n**Teammates:** \n**Scope/Rules:** \n**Flag Format:** \n**Credentials:** \n**Submission Notes:** `;
        const msg = await notesLinksChannel.send(template);
        await msg.pin();
      }

      await interaction.editReply(`Successfully created CTF channels under **${categoryName}**!`);
    } catch (error) {
      console.error('Error creating CTF:', error);
      await interaction.editReply('An error occurred while creating the CTF. Check bot logs.');
    }
  } else if (subcommand === 'archive') {
    const name = interaction.options.getString('name', true);
    const slug = slugify(name);
    const expectedCategoryName = `🏁 ctf-${slug}`;

    const category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === expectedCategoryName.toLowerCase()
    ) as import('discord.js').CategoryChannel | undefined;

    if (!category) {
      return interaction.reply({ content: `Could not find a category named **${expectedCategoryName}**.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: false });

    try {
      await category.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
      });

      const archivedName = `📦 archive-ctf-${slug}`;
      await category.setName(archivedName);

      const chatChannel = guild.channels.cache.find(
        (c) => c.parentId === category.id && c.name === 'ctf-chat'
      ) as TextChannel | undefined;

      if (chatChannel) {
        await chatChannel.send(`**This CTF has been archived!** 📦\n\nNo further messages can be sent. Please remember to move your finalized writeups to the <#${guild.channels.cache.find(c => c.name === 'writeups')?.id || 'writeups'}> channel!`);
      }

      await interaction.editReply(`Successfully archived **${archivedName}**!`);
    } catch (error) {
      console.error('Error archiving CTF:', error);
      await interaction.editReply('An error occurred while archiving the CTF. Check bot logs.');
    }
  } else if (subcommand === 'start') {
    const name = interaction.options.getString('name', true);
    const teammate = interaction.options.getUser('teammate', true);
    const durationHours = interaction.options.getInteger('duration') || 24;
    const url = interaction.options.getString('url') || 'N/A';
    const slug = slugify(name);
    const categoryName = `⚡ ctf-${slug}`;

    await interaction.deferReply({ ephemeral: false });

    try {
      const category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
          },
          {
            id: teammate.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
          },
          {
            id: interaction.client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
          }
        ]
      });

      await delay(500);

      const channelNames = [
        'brief',
        'team-chat',
        `${slugify(interaction.user.username)}-writeup`,
        `${slugify(teammate.username)}-writeup`,
        'final-writeup'
      ];

      const createdChannels: TextChannel[] = [];
      for (const chName of channelNames) {
        let permissionOverwrites: import('discord.js').OverwriteResolvable[] = [];

        // Custom permissions for personal writeup channels
        if (chName === `${slugify(interaction.user.username)}-writeup`) {
          permissionOverwrites = [
            { id: teammate.id, deny: [PermissionFlagsBits.ViewChannel] }
          ];
        } else if (chName === `${slugify(teammate.username)}-writeup`) {
          permissionOverwrites = [
            { id: interaction.user.id, deny: [PermissionFlagsBits.ViewChannel] }
          ];
        }

        const channel = await guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: permissionOverwrites.length > 0 ? permissionOverwrites : undefined
        });
        createdChannels.push(channel);
        await delay(500);
      }

      const briefChannel = createdChannels.find(c => c.name === 'brief');
      if (briefChannel) {
        const now = new Date();
        const expires = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
        const template = `**CTF Name:** ${name}\n**URL:** ${url}\n**Start Time:** <t:${Math.floor(now.getTime()/1000)}:f>\n**Expiry Time:** <t:${Math.floor(expires.getTime()/1000)}:f>\n**Teammates:** <@${interaction.user.id}>, <@${teammate.id}>\n**Flag Format:** \n**Scope/Rules:** \n**Submission Link:** \n**Important Findings:** \n**Final Writeup Checklist:** \n- [ ] Draft final writeup in final-writeup channel\n- [ ] Review by both teammates\n- [ ] Submit`;
        const msg = await briefChannel.send(template);
        await msg.pin();
      }

      const nowTime = Date.now();
      const expiresAt = nowTime + durationHours * 60 * 60 * 1000;
      await addWorkspace({
        guildId: guild.id,
        categoryId: category.id,
        channelIds: createdChannels.map(c => c.id),
        slug,
        name,
        ownerId: interaction.user.id,
        teammateId: teammate.id,
        createdAt: nowTime,
        expiresAt
      });

      await interaction.editReply(`Successfully created temporary workspace **${categoryName}**! Expires <t:${Math.floor(expiresAt/1000)}:R>.`);
    } catch (error) {
      console.error('Error starting CTF workspace:', error);
      await interaction.editReply('An error occurred while creating the temporary workspace.');
    }
  } else if (subcommand === 'extend') {
    const name = interaction.options.getString('name', true);
    const hours = interaction.options.getInteger('hours', true);
    const slug = slugify(name);
    
    await interaction.deferReply({ ephemeral: false });

    try {
      const workspace = await getWorkspaceBySlug(slug);
      if (!workspace) {
        return interaction.editReply(`No active workspace found for **${name}**.`);
      }

      workspace.expiresAt += hours * 60 * 60 * 1000;
      await updateWorkspace(workspace);
      
      await interaction.editReply(`Successfully extended **${name}** by ${hours} hours. New expiry: <t:${Math.floor(workspace.expiresAt/1000)}:R>.`);
    } catch (error) {
      console.error('Error extending workspace:', error);
      await interaction.editReply('An error occurred while extending the workspace.');
    }
  } else if (subcommand === 'close') {
    const name = interaction.options.getString('name', true);
    const slug = slugify(name);
    
    await interaction.deferReply({ ephemeral: false });

    try {
      const workspace = await getWorkspaceBySlug(slug);
      if (!workspace) {
        return interaction.editReply(`No active workspace found for **${name}**.`);
      }

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_delete')
            .setLabel('Confirm Delete')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_delete')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

      const response = await interaction.editReply({
        content: `Are you sure you want to permanently delete the workspace **${name}**? This cannot be undone.`,
        components: [row]
      });

      try {
        const confirmation = await response.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id,
          time: 30000,
          componentType: ComponentType.Button
        });

        if (confirmation.customId === 'confirm_delete') {
          await confirmation.update({ content: 'Deleting workspace...', components: [] });
          
          const category = guild.channels.cache.get(workspace.categoryId) as import('discord.js').CategoryChannel | undefined;
          
          for (const channelId of workspace.channelIds) {
            const ch = guild.channels.cache.get(channelId);
            if (ch) {
              await ch.delete().catch(console.error);
              await delay(500); // rate limit delay
            }
          }
          
          if (category) {
            await category.delete().catch(console.error);
          }

          await removeWorkspace(workspace.categoryId);
          await interaction.followUp(`Workspace **${name}** has been deleted.`);
        } else {
          await confirmation.update({ content: 'Deletion cancelled.', components: [] });
        }
      } catch (e) {
        await interaction.editReply({ content: 'Confirmation timed out. Deletion cancelled.', components: [] });
      }
    } catch (error) {
      console.error('Error closing workspace:', error);
      await interaction.editReply('An error occurred while closing the workspace.');
    }
  } else if (subcommand === 'status') {
    await interaction.deferReply({ ephemeral: false });
    
    try {
      const workspaces = await loadWorkspaces();
      
      if (workspaces.length === 0) {
        return interaction.editReply('There are currently no active temporary CTF workspaces.');
      }
      
      let statusMsg = '**Active Temporary CTF Workspaces:**\n';
      for (const w of workspaces) {
        statusMsg += `- **${w.name}**: Expires <t:${Math.floor(w.expiresAt/1000)}:R> (<@${w.ownerId}> & <@${w.teammateId}>)\n`;
      }
      
      await interaction.editReply({
        content: statusMsg,
        allowedMentions: { users: [] } // avoid pinging them in status
      });
    } catch (error) {
      console.error('Error getting status:', error);
      await interaction.editReply('An error occurred while fetching workspace status.');
    }

  // ─── /ctf radar ──────────────────────────────────────────────────────────
  } else if (subcommand === 'radar') {
    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.editReply('📡 Fetching CTF Radar report... this may take up to 30 seconds.');
      const result = await runRadarReport(interaction.client);
      if (result.channelId) {
        await interaction.editReply('✅ CTF Radar report posted to `#ctf-calendar`!');
      } else {
        await interaction.editReply('⚠️ Radar report finished, but could not post because the channel `#ctf-calendar` was not found. Please create it or check your `.env` config!');
      }
    } catch (error) {
      console.error('[CTF/radar] Error:', error);
      await interaction.editReply('❌ Failed to run radar report. Check bot logs.');
    }

  // ─── /ctf radar-config ───────────────────────────────────────────────────
  } else if (subcommand === 'radar-config') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const store = await loadRadarStore();
      const enabledOpt = interaction.options.getBoolean('enabled');
      const hourOpt = interaction.options.getInteger('hour');
      const minuteOpt = interaction.options.getInteger('minute');

      let changed = false;
      if (enabledOpt !== null) { store.config.enabled = enabledOpt; changed = true; }
      if (hourOpt !== null)    { store.config.hour = hourOpt;       changed = true; }
      if (minuteOpt !== null)  { store.config.minute = minuteOpt;   changed = true; }

      if (!changed) {
        const h = String(store.config.hour).padStart(2, '0');
        const m = String(store.config.minute).padStart(2, '0');
        return interaction.editReply(
          `ℹ️ No changes made. Current config:\n` +
          `• **Enabled**: ${store.config.enabled}\n` +
          `• **Schedule**: ${h}:${m} IST daily`
        );
      }

      await saveRadarStore(store);
      await restartRadarScheduler(interaction.client);

      const h = String(store.config.hour).padStart(2, '0');
      const m = String(store.config.minute).padStart(2, '0');
      await interaction.editReply(
        `✅ Radar config updated:\n` +
        `• **Enabled**: ${store.config.enabled}\n` +
        `• **Schedule**: ${h}:${m} IST daily (cron restarted)`
      );
    } catch (error) {
      console.error('[CTF/radar-config] Error:', error);
      await interaction.editReply('❌ Failed to update radar config. Check bot logs.');
    }

  // ─── /ctf radar-status ──────────────────────────────────────────────────
  } else if (subcommand === 'radar-status') {
    await interaction.deferReply({ ephemeral: false });
    try {
      const store = await loadRadarStore();
      const cfg = store.config;

      const h = String(cfg.hour).padStart(2, '0');
      const m = String(cfg.minute).padStart(2, '0');
      const schedule = cfg.enabled ? `${h}:${m} IST daily` : 'Disabled';

      const lastRun = cfg.lastRunAt
        ? `<t:${Math.floor(cfg.lastRunAt / 1000)}:F> (<t:${Math.floor(cfg.lastRunAt / 1000)}:R>)`
        : 'Never';

      // Compute next run (next occurrence of h:m IST)
      let nextRunStr = 'Unknown';
      if (cfg.enabled) {
        const now = new Date();
        const nextRun = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        nextRun.setHours(cfg.hour, cfg.minute, 0, 0);
        if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
        // Re-express as UTC timestamp
        const diffMs = nextRun.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getTime();
        const nextRunUtc = now.getTime() + diffMs;
        nextRunStr = `<t:${Math.floor(nextRunUtc / 1000)}:F> (<t:${Math.floor(nextRunUtc / 1000)}:R>)`;
      }

      const ctftime = cfg.sourceHealth.ctftime;
      const unstop  = cfg.sourceHealth.unstop;
      const ctftimeStatus = ctftime.ok ? '✅ Healthy' : `❌ ${ctftime.error ?? 'Unknown error'}`;
      const unstopStatus  = unstop.ok  ? '✅ Healthy' : `❌ ${unstop.error ?? 'Unknown error'}`;

      const embed = new EmbedBuilder()
        .setTitle('📡 CTF Radar — Status')
        .setColor(cfg.enabled ? 0x57F287 : 0xED4245)
        .addFields(
          { name: '⚙️ Schedule', value: schedule, inline: true },
          { name: '📊 Tracked Events', value: String(store.events.length), inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          { name: '🕐 Last Run', value: lastRun, inline: false },
          { name: '⏭️ Next Run', value: nextRunStr, inline: false },
          { name: '🌐 CTFtime', value: ctftimeStatus, inline: true },
          { name: '🔗 Unstop', value: unstopStatus, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[CTF/radar-status] Error:', error);
      await interaction.editReply('❌ Failed to fetch radar status. Check bot logs.');
    }
  }
}
