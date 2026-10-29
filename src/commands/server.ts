import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, ChannelType, CategoryChannel, TextChannel, MessageFlags, EmbedBuilder, OverwriteType } from 'discord.js';
import { delay } from '../utils/channelUtils';
import { classifyMessage, sendInboxUIForMessage } from '../utils/inbox';

export const data = new SlashCommandBuilder()
  .setName('server')
  .setDescription('Manage server-level organization')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('inbox-preview')
      .setDescription('Preview the changes that will be applied for the inbox layout')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('inbox-apply')
      .setDescription('Apply the inbox layout changes (creates categories and moves channels)')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('migrate-imp-stuff')
      .setDescription('Migrate recent messages from imp-stuff to their proper channels via Mistral AI')
      .addIntegerOption(option => 
        option.setName('limit')
          .setDescription('Number of messages to scan (default: 50, max: 100)')
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('onboarding-preview')
      .setDescription('Preview the new onboarding layout')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('onboarding-apply')
      .setDescription('Apply the new onboarding layout')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('help')
      .setDescription('Show server guide and channel routing')
  );

const START_HERE_NAME = '📥 START HERE';
const OLD_ARCHIVE_NAME = '📦 OLD ARCHIVE';
const DROP_ZONE_NAME = 'drop-zone'; // internally discord uses lower-case with hyphens for text channels
const HOW_TO_USE_NAME = 'how-to-use';

const DROP_ZONE_TOPIC = 'Paste any link, idea, screenshot, bug, AI news, trade note, or resource here. The bot will help route it to the correct channel.';
const DROP_ZONE_MESSAGE = `# Drop Zone\n\nPaste anything here.\n\nThe bot will suggest the right destination:\nAI news • cyber news • CTF resources • bugs • freelance • market • useful links\n\nChoose:\nSend → forwards it\nChoose Different → pick another channel\nKeep Here → leaves it in Drop Zone`;

const OLD_CHANNELS_TO_MOVE = [
  'general',
  'bug-reports',
  'imp_stuff',
  'news',
  'snist-full-chat', // Normalized channel names
  'snist-bug-report'
];

const ONBOARDING_GUIDE = `# Welcome to Localhost CTFs ⚡

This server is our workspace for CTFs, cybersecurity, learning, tools, freelance work, AI, and market research.

## First rule: use #drop-zone when unsure

Have a useful link, screenshot, idea, AI update, CTF resource, bug report, freelance lead, or market note?

Post it in **#drop-zone**.

The bot will suggest where it belongs. You choose:

**Send** → forwards it to the suggested channel  
**Choose Different** → select another channel  
**Keep Here** → leaves it in Drop Zone  

---

## Main areas

### 📌 COMMAND
- **#announcements** — important team updates
- **#imp-stuff** — important saved notes and decisions
- **#bug-reports** — security bugs, report work, disclosures
- **#roadmap** — upcoming plans and priorities

### 🧠 KNOWLEDGE
- **#ai-news** — AI models, tools, coding agents, research
- **#cyber-news** — CVEs, breaches, advisories, exploits
- **#tools-resources** — useful tools, GitHub projects, recon resources
- **#study-notes** — learning notes and concepts
- **#useful-links** — links worth saving

### 🏁 CTF HQ
- **#ctf-calendar** — upcoming CTFs, registration, dates, prizes
- **#ctf-chat** — normal CTF discussion
- **#ctf-resources** — payloads, techniques, tools, references
- **#writeups** — final CTF solutions and lessons

For an active CTF:

\`/ctf start name:<CTF name> teammate:@username duration:24\`

This creates a temporary private workspace for both teammates.

### 💼 FUTURE WORK
- **#ui-design** — UI inspiration and projects
- **#video-editing** — editing ideas and resources
- **#freelance-leads** — potential clients and gigs
- **#client-ideas** — project and product ideas
- **#portfolio-feedback** — portfolio improvement

### 📈 MARKET LAB
- **#market-news** — market-related news
- **#watchlist** — companies/assets being tracked
- **#trade-journal** — trades, reasoning, mistakes, review
- **#learning-resources** — market-learning material

### 🎮 CHILL
- **#general** — normal chat
- **#memes-media** — memes and random media

## Rule

Do not bury useful things in random chat.

Use **#drop-zone** when unsure.`;

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;

  if (!guild) {
    return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
  }

  const allChannels = await guild.channels.fetch();

  const startHereCategory = allChannels.find(c => c && c.type === ChannelType.GuildCategory && c.name === START_HERE_NAME) as CategoryChannel | undefined;
  const oldArchiveCategory = allChannels.find(c => c && c.type === ChannelType.GuildCategory && c.name === OLD_ARCHIVE_NAME) as CategoryChannel | undefined;
  const dropZoneChannel = allChannels.find(c => c && c.type === ChannelType.GuildText && c.name === DROP_ZONE_NAME) as TextChannel | undefined;
  const howToUseChannel = allChannels.find(c => c && c.type === ChannelType.GuildText && c.name === HOW_TO_USE_NAME) as TextChannel | undefined;

  if (subcommand === 'inbox-preview') {
    let preview = '### Server Organization Preview\n\n';

    preview += `**Category: ${START_HERE_NAME}**\n`;
    preview += `- Exists: ${startHereCategory ? '✅ Yes' : '❌ No (Will Create)'}\n`;
    
    preview += `\n**Channel: #${DROP_ZONE_NAME}**\n`;
    preview += `- Exists: ${dropZoneChannel ? '✅ Yes' : '❌ No (⚠️ Cannot apply if not existing)'}\n`;
    if (dropZoneChannel) {
      const inCorrectCategory = dropZoneChannel.parentId === startHereCategory?.id;
      preview += `- In correct category: ${inCorrectCategory ? '✅ Yes' : '❌ No (Will Move)'}\n`;
    }

    preview += `\n**Category: ${OLD_ARCHIVE_NAME}**\n`;
    preview += `- Exists: ${oldArchiveCategory ? '✅ Yes' : '❌ No (Will Create)'}\n`;

    preview += `\n**Old Channels to Move:**\n`;
    let oldChannelsFound = 0;
    
    for (const oldName of OLD_CHANNELS_TO_MOVE) {
      // Find channels with matching normalized names
      const channel = allChannels.find(c => c && c.type === ChannelType.GuildText && c.name.toLowerCase().replace(/_/g, '-') === oldName.toLowerCase().replace(/_/g, '-'));
      if (channel) {
        if (channel.parentId === oldArchiveCategory?.id) {
          preview += `- #${channel.name} (Already in archive)\n`;
        } else {
          preview += `- #${channel.name} (Will move to archive)\n`;
        }
        oldChannelsFound++;
      }
    }
    if (oldChannelsFound === 0) {
      preview += `- None found.\n`;
    }

    return interaction.reply({ content: preview, flags: MessageFlags.Ephemeral });
  }

  if (subcommand === 'inbox-apply') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const summary = {
      categoriesCreated: [] as string[],
      channelsMoved: [] as string[],
      pinnedGuideStatus: 'Unchanged',
      skippedChannels: [] as string[]
    };

    try {
      // 1. Create or get START HERE category
      let startCat = startHereCategory;
      if (!startCat) {
        startCat = await guild.channels.create({
          name: START_HERE_NAME,
          type: ChannelType.GuildCategory,
          position: 0 // Will adjust positions correctly later if needed
        });
        summary.categoriesCreated.push(START_HERE_NAME);
        await delay(1000);
      }

      // 2. Move Drop Zone to START HERE and set topic
      if (dropZoneChannel) {
        if (dropZoneChannel.parentId !== startCat.id) {
          await dropZoneChannel.setParent(startCat.id, { lockPermissions: false });
          summary.channelsMoved.push(dropZoneChannel.name);
          await delay(1000);
        }
        
        if (dropZoneChannel.topic !== DROP_ZONE_TOPIC) {
          await dropZoneChannel.setTopic(DROP_ZONE_TOPIC);
          await delay(1000);
        }

        // 3. Set category to highest position
        if (startCat.position !== 0) {
          await startCat.setPosition(0);
          await delay(1000);
        }
        
        // 4. Set Drop Zone to top position inside category
        await dropZoneChannel.setPosition(0);
        await delay(1000);

        // 5. Send and pin message if not already done
        const pinnedMessages = await dropZoneChannel.messages.fetchPins();
        const hasGuidePinned = (pinnedMessages as any).some((m: any) => m.content === DROP_ZONE_MESSAGE && m.author.id === interaction.client.user?.id);
        
        if (!hasGuidePinned) {
          const sentMsg = await dropZoneChannel.send(DROP_ZONE_MESSAGE);
          await sentMsg.pin();
          summary.pinnedGuideStatus = 'Pinned new guide message';
        } else {
          summary.pinnedGuideStatus = 'Already pinned';
        }
      } else {
        summary.skippedChannels.push(DROP_ZONE_NAME + ' (Not found)');
      }

      // 6. Create or get OLD ARCHIVE category
      let archiveCat = oldArchiveCategory;
      if (!archiveCat) {
        archiveCat = await guild.channels.create({
          name: OLD_ARCHIVE_NAME,
          type: ChannelType.GuildCategory
        });
        summary.categoriesCreated.push(OLD_ARCHIVE_NAME);
        await delay(1000);
      }

      // 7. Move old channels to OLD ARCHIVE
      for (const oldName of OLD_CHANNELS_TO_MOVE) {
        // Find matching channels
        const channel = allChannels.find(c => c && c.type === ChannelType.GuildText && c.name.toLowerCase().replace(/_/g, '-') === oldName.toLowerCase().replace(/_/g, '-')) as TextChannel | undefined;
        
        if (channel) {
          if (channel.parentId !== archiveCat.id) {
            await channel.setParent(archiveCat.id, { lockPermissions: false });
            summary.channelsMoved.push(channel.name);
            await delay(1000);
          }
        } else {
          summary.skippedChannels.push(oldName + ' (Not found)');
        }
      }

      // 8. Set OLD ARCHIVE to bottom
      await archiveCat.setPosition(999);

      let replyContent = '### Apply Success\n\n';
      replyContent += `**Categories Created:** ${summary.categoriesCreated.length > 0 ? summary.categoriesCreated.join(', ') : 'None'}\n`;
      replyContent += `**Channels Moved:** ${summary.channelsMoved.length > 0 ? summary.channelsMoved.join(', ') : 'None'}\n`;
      replyContent += `**Guide Message:** ${summary.pinnedGuideStatus}\n`;
      replyContent += `**Skipped Channels:** ${summary.skippedChannels.length > 0 ? summary.skippedChannels.join(', ') : 'None'}\n`;

      await interaction.editReply({ content: replyContent });
    } catch (error) {
      console.error('Error applying server inbox layout:', error);
      await interaction.editReply('An error occurred while applying the layout. Check bot logs for more details.');
    }
  }

  if (subcommand === 'migrate-imp-stuff') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const limit = interaction.options.getInteger('limit') || 50;
    
    // Find imp-stuff channel (strict match to avoid empty duplicate imp_stuff channel)
    const impStuffChannel = allChannels.find(c => c && c.type === ChannelType.GuildText && c.name === 'imp-stuff') as TextChannel | undefined;
    
    if (!impStuffChannel) {
      return interaction.editReply('Could not find imp-stuff channel.');
    }
    
    try {
      const messages = await impStuffChannel.messages.fetch({ limit });
      // We want to migrate user messages, OR messages the bot already migrated 
      // (which start with "**From")
      const messagesToMigrate = messages.filter(m => 
        !m.author.bot || (m.author.bot && m.content.startsWith('**From '))
      );
      
      let processedCount = 0;
      let failedCount = 0;
      
      for (const [, msg] of messagesToMigrate) {
        let content = msg.content;
        
        // If it's a previously migrated bot message, strip the prefix
        if (msg.author.bot && content.startsWith('**From ')) {
          const lines = content.split('\n');
          // Remove the first line (the bold "**From ... (Migrated):**" header)
          lines.shift();
          content = lines.join('\n').trim();
        }

        const attachments = msg.attachments.map(a => a.name);
        const urls = content.match(/https?:\/\/[^\s]+/g) || [];
        const embedTitles = msg.embeds.map(e => e.title).filter(Boolean) as string[];
        
        try {
          await sendInboxUIForMessage(msg, content, attachments, urls, embedTitles);
          processedCount++;
        } catch (e) {
          console.error('Failed to send UI for message', e);
          failedCount++;
        }
        
        await delay(15500); // respect rate limits and Mistral API limits (max 4 req/min)
      }
      
      return interaction.editReply(`Migration scan complete! Posted classification UI for ${processedCount} messages. Failed: ${failedCount}. You can now select channels using the buttons.`);
    } catch (error) {
      console.error('Error migrating imp-stuff messages:', error);
      return interaction.editReply('An error occurred while migrating messages. Check bot logs for more details.');
    }
  }

  if (subcommand === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Localhost CTFs Guide')
      .setDescription(
        `**Unsure where something belongs? Post it in <#${dropZoneChannel?.id || DROP_ZONE_NAME}>.**\n\n` +
        `### Key Channels\n` +
        `📖 <#${howToUseChannel?.id || HOW_TO_USE_NAME}> - Full server guide\n` +
        `📥 <#${dropZoneChannel?.id || DROP_ZONE_NAME}> - Smart inbox for sorting\n` +
        `📅 <#${allChannels.find(c => c?.name === 'ctf-calendar')?.id || 'ctf-calendar'}> - Upcoming CTFs\n` +
        `💬 <#${allChannels.find(c => c?.name === 'ctf-chat')?.id || 'ctf-chat'}> - CTF discussions\n` +
        `📝 <#${allChannels.find(c => c?.name === 'writeups')?.id || 'writeups'}> - Solutions and lessons\n` +
        `🧠 <#${allChannels.find(c => c?.name === 'ai-news')?.id || 'ai-news'}> - AI updates\n` +
        `🔒 <#${allChannels.find(c => c?.name === 'cyber-news')?.id || 'cyber-news'}> - Security news\n` +
        `🛠️ <#${allChannels.find(c => c?.name === 'tools-resources')?.id || 'tools-resources'}> - Useful links\n\n` +
        `### Active CTF Command\n` +
        `\`/ctf start name:<CTF name> teammate:@username duration:24\``
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (subcommand === 'onboarding-preview') {
    let preview = '### Onboarding System Preview\n\n';

    preview += `**Category: ${START_HERE_NAME}**\n`;
    preview += `- Exists: ${startHereCategory ? '✅ Yes' : '❌ No (Will Create)'}\n`;
    
    preview += `\n**Channel: #${HOW_TO_USE_NAME}**\n`;
    preview += `- Exists: ${howToUseChannel ? '✅ Yes' : '❌ No (Will Create)'}\n`;
    if (howToUseChannel) {
      const everyonePerms = howToUseChannel.permissionOverwrites.cache.get(guild.roles.everyone.id);
      const isReadOnly = everyonePerms && everyonePerms.allow.has(PermissionFlagsBits.ViewChannel) && everyonePerms.deny.has(PermissionFlagsBits.SendMessages);
      preview += `- Read-only for @everyone: ${isReadOnly ? '✅ Yes' : '❌ No (Will Update)'}\n`;
      
      const pinnedMessages = await howToUseChannel.messages.fetchPins().catch(() => null);
      const hasGuidePinned = pinnedMessages ? (pinnedMessages as any).some((m: any) => m.embeds[0]?.description === ONBOARDING_GUIDE && m.author.id === interaction.client.user?.id) : false;
      preview += `- Guide pinned: ${hasGuidePinned ? '✅ Yes' : '❌ No (Will Post & Pin)'}\n`;
    }

    preview += `\n**Channel: #${DROP_ZONE_NAME}**\n`;
    preview += `- Exists: ${dropZoneChannel ? '✅ Yes' : '❌ No'}\n`;
    
    return interaction.reply({ content: preview, flags: MessageFlags.Ephemeral });
  }

  if (subcommand === 'onboarding-apply') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const summary = { categoriesCreated: 0, channelsCreated: 0, channelsMoved: 0, messagesPinned: false };

    try {
      // 1. Create or get START HERE category
      let startCat = startHereCategory;
      if (!startCat) {
        startCat = await guild.channels.create({ name: START_HERE_NAME, type: ChannelType.GuildCategory });
        summary.categoriesCreated++;
        await delay(1000);
      }

      // 2. Make START HERE top position
      if (startCat.position !== 0) {
        await startCat.setPosition(0);
        await delay(1000);
      }

      // 3. Create or get how-to-use channel
      let howToChannel = howToUseChannel;
      if (!howToChannel) {
        howToChannel = await guild.channels.create({
          name: HOW_TO_USE_NAME,
          type: ChannelType.GuildText,
          parent: startCat.id,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
              deny: [PermissionFlagsBits.SendMessages],
              type: OverwriteType.Role
            },
            {
              id: interaction.client.user!.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks],
              type: OverwriteType.Member
            }
          ]
        });
        summary.channelsCreated++;
        await delay(1000);
      } else {
        if (howToChannel.parentId !== startCat.id) {
          await howToChannel.setParent(startCat.id, { lockPermissions: false });
          summary.channelsMoved++;
          await delay(1000);
        }
        // Update perms
        await howToChannel.permissionOverwrites.edit(guild.roles.everyone.id, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: false
        });
        await delay(1000);
        await howToChannel.permissionOverwrites.edit(interaction.client.user!.id, {
          ViewChannel: true,
          SendMessages: true,
          ManageMessages: true,
          EmbedLinks: true
        });
        await delay(1000);
      }

      // 4. Move Drop Zone to START HERE
      if (dropZoneChannel && dropZoneChannel.parentId !== startCat.id) {
        await dropZoneChannel.setParent(startCat.id, { lockPermissions: false });
        summary.channelsMoved++;
        await delay(1000);
      }

      // 5. Position how-to-use above drop-zone
      await howToChannel.setPosition(0);
      await delay(1000);
      if (dropZoneChannel) {
        await dropZoneChannel.setPosition(1);
        await delay(1000);
      }

      // 6. Post and pin guide if not present
      const pinnedMessages = await howToChannel.messages.fetchPins();
      const hasGuidePinned = (pinnedMessages as any).some((m: any) => m.embeds[0]?.description === ONBOARDING_GUIDE && m.author.id === interaction.client.user?.id);
      
      if (!hasGuidePinned) {
        const embed = new EmbedBuilder().setColor('#2b2d31').setDescription(ONBOARDING_GUIDE);
        const sentMsg = await howToChannel.send({ embeds: [embed] });
        await sentMsg.pin();
        summary.messagesPinned = true;
      }

      return interaction.editReply(`### Onboarding Apply Success\n\n` +
        `- Categories created: **${summary.categoriesCreated}**\n` +
        `- Channels created: **${summary.channelsCreated}**\n` +
        `- Channels moved: **${summary.channelsMoved}**\n` +
        `- Guide pinned: **${summary.messagesPinned ? 'Yes' : 'Already pinned'}**`
      );
    } catch (error) {
      console.error('Error applying onboarding:', error);
      return interaction.editReply('An error occurred. Check bot logs.');
    }
  }
}
