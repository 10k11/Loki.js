import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { loadNewsStore, saveNewsStore } from '../news/store';
import { runNewsCategory, runAllNews } from '../news/runner';
import { ChannelCategory } from '../news/types';

export const data = new SlashCommandBuilder()
  .setName('news')
  .setDescription('Manage the Daily Intelligence Digest system')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('run')
      .setDescription('Force run a news category immediately')
      .addStringOption((option) =>
        option
          .setName('type')
          .setDescription('The category to run')
          .setRequired(true)
          .addChoices(
            { name: 'AI', value: 'ai' },
            { name: 'Cyber', value: 'cyber' },
            { name: 'Tools', value: 'tools' },
            { name: 'All', value: 'all' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('status')
      .setDescription('Check the status of the News system')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('sources')
      .setDescription('List the configured sources for news')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('pause')
      .setDescription('Pause a specific news category')
      .addStringOption((option) =>
        option
          .setName('type')
          .setDescription('The category to pause')
          .setRequired(true)
          .addChoices(
            { name: 'AI', value: 'ai' },
            { name: 'Cyber', value: 'cyber' },
            { name: 'Tools', value: 'tools' }
          )
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('resume')
      .setDescription('Resume a specific news category')
      .addStringOption((option) =>
        option
          .setName('type')
          .setDescription('The category to resume')
          .setRequired(true)
          .addChoices(
            { name: 'AI', value: 'ai' },
            { name: 'Cyber', value: 'cyber' },
            { name: 'Tools', value: 'tools' }
          )
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'run') {
    const type = interaction.options.getString('type', true);
    await interaction.deferReply({ ephemeral: false });
    
    try {
      if (type === 'all') {
        await runAllNews(interaction.client);
        await interaction.editReply('Successfully ran all news categories.');
      } else {
        await runNewsCategory(interaction.client, type as ChannelCategory);
        await interaction.editReply(`Successfully ran the ${type} news category.`);
      }
    } catch (error: any) {
      console.error('[NewsCommand] Run error:', error);
      await interaction.editReply(`Error running news: ${error.message}`);
    }
  } else if (subcommand === 'status') {
    const store = await loadNewsStore();
    const config = store.config;
    
    let statusText = '### Daily Intelligence Digest Status\n\n';
    
    // next scheduled run (assuming 08:00 or 20:00 IST)
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    let nextRun = new Date(nowIST);
    if (nowIST.getHours() < 8) {
      nextRun.setHours(8, 0, 0, 0);
    } else if (nowIST.getHours() < 20) {
      nextRun.setHours(20, 0, 0, 0);
    } else {
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(8, 0, 0, 0);
    }
    
    statusText += `**Next Scheduled Run (IST):** ${nextRun.toLocaleString('en-IN')}\n`;
    statusText += `**Total Cached Items:** ${store.items.length}\n\n`;
    
    const categories: ChannelCategory[] = ['ai', 'cyber', 'tools'];
    for (const cat of categories) {
      const catConfig = config[cat];
      const paused = config.paused[cat] ? ' (PAUSED)' : '';
      const lastSuccess = catConfig.lastSuccessfulRunAt ? new Date(catConfig.lastSuccessfulRunAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never';
      const errorMsg = catConfig.error ? `\n  └ Error: ${catConfig.error}` : '';
      
      statusText += `**${cat.toUpperCase()}**${paused}\n`;
      statusText += `  ├ Last Success: ${lastSuccess}${errorMsg}\n`;
    }
    
    await interaction.reply({ content: statusText, ephemeral: true });
  } else if (subcommand === 'sources') {
    let sourceText = '### Configured News Sources\n\n';
    
    sourceText += '**AI News:**\n- Mistral Blog\n- Hugging Face Blog\n\n';
    sourceText += '**Cyber News:**\n- CISA Alerts/Advisories\n- NVD CVE API\n\n';
    sourceText += '**Tools/Resources:**\n- GitHub Releases\n- PortSwigger\n\n';
    sourceText += '*(Note: Currently using mock sources for testing. Real sources will be added soon.)*';
    
    await interaction.reply({ content: sourceText, ephemeral: true });
  } else if (subcommand === 'pause') {
    const type = interaction.options.getString('type', true) as ChannelCategory;
    const store = await loadNewsStore();
    store.config.paused[type] = true;
    await saveNewsStore(store);
    await interaction.reply({ content: `Paused news category: ${type}`, ephemeral: true });
  } else if (subcommand === 'resume') {
    const type = interaction.options.getString('type', true) as ChannelCategory;
    const store = await loadNewsStore();
    store.config.paused[type] = false;
    await saveNewsStore(store);
    await interaction.reply({ content: `Resumed news category: ${type}`, ephemeral: true });
  }
}
