import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { ChannelCategory, RawNewsItem, StoredNewsItem } from './types';
import { loadNewsStore, saveNewsStore, filterNewItems, makeNewsContentHash } from './store';
import { processNewsBatch } from './mistral';
import { fetchAINews } from './sources/ai';
import { fetchCyberNews } from './sources/cyber';
import { fetchToolsNews } from './sources/tools';

const CHANNEL_NAMES: Record<ChannelCategory, string> = {
  ai: 'ai-news',
  cyber: 'cyber-news',
  tools: 'tools-resources'
};

const CATEGORY_TITLES: Record<ChannelCategory, string> = {
  ai: '🧠 AI Brief',
  cyber: '🛡 Cyber Brief',
  tools: '🧰 Tools Radar'
};

function getPriorityEmoji(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'high': return '🚨';
    case 'medium': return '⚡';
    case 'low': return '📌';
    default: return '📌';
  }
}

function getImportanceScore(priority: string): number {
  switch (priority.toLowerCase()) {
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

export async function runNewsCategory(client: Client, category: ChannelCategory): Promise<void> {
  const store = await loadNewsStore();
  
  if (store.config.paused[category]) {
    console.log(`[NewsRunner] Skipping ${category} because it is paused.`);
    return;
  }
  
  store.config[category].lastRunAt = Date.now();
  
  try {
    let rawItems: RawNewsItem[] = [];
    
    // 1. Fetch raw items
    if (category === 'ai') {
      rawItems = await fetchAINews();
    } else if (category === 'cyber') {
      rawItems = await fetchCyberNews();
    } else if (category === 'tools') {
      rawItems = await fetchToolsNews();
    }
    
    // 2. Deduplicate against cache
    const newItems = filterNewItems(store.items, rawItems);
    if (newItems.length === 0) {
      console.log(`[NewsRunner] No new items for ${category}.`);
      store.config[category].lastSuccessfulRunAt = Date.now();
      store.config[category].error = null;
      await saveNewsStore(store);
      return;
    }
    
    // 3. Process with mistral
    const processed = await processNewsBatch(newItems, category);
    if (processed.length === 0) {
      console.log(`[NewsRunner] Mistral returned 0 items for ${category}.`);
      store.config[category].lastSuccessfulRunAt = Date.now();
      store.config[category].error = null;
      await saveNewsStore(store);
      return;
    }
    
    // 4. Find the channel
    const channelName = CHANNEL_NAMES[category];
    const channel = client.channels.cache.find(
      c => c.isTextBased() && ('name' in c) && c.name === channelName
    ) as TextChannel | undefined;
    
    if (!channel) {
      throw new Error(`Channel #${channelName} not found.`);
    }
    
    // 5. Post to Discord
    const now = new Date();
    // format date/time IST
    const timeString = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    
    const embed = new EmbedBuilder()
      .setTitle(`${CATEGORY_TITLES[category]} — ${timeString}`)
      .setColor('#0099ff')
      .setFooter({ text: 'Powered by Mistral AI' })
      .setTimestamp();
      
    let description = '';
    
    for (const item of processed) {
      const emoji = getPriorityEmoji(item.priority);
      description += `${emoji} **[${item.title}](${item.url})**\n`;
      description += `*Source: ${item.source}*\n`;
      description += `**Summary:** ${item.summary}\n`;
      description += `**Why It Matters:** ${item.whyItMatters}\n\n`;
      
      // Update cache
      const storedItem: StoredNewsItem = {
        url: item.url,
        title: item.title,
        channelType: category,
        source: item.source,
        publishedAt: null, // Ideally we would map this from raw items, but for now null
        contentHash: makeNewsContentHash(item.url, item.title),
        postedAt: Date.now(),
        importanceScore: getImportanceScore(item.priority)
      };
      store.items.push(storedItem);
    }
    
    embed.setDescription(description.trim());
    
    await channel.send({ embeds: [embed] });
    
    store.config[category].lastSuccessfulRunAt = Date.now();
    store.config[category].error = null;
  } catch (error: any) {
    console.error(`[NewsRunner] Error running ${category}:`, error);
    store.config[category].error = error.message || 'Unknown error';
  }
  
  await saveNewsStore(store);
}

export async function runAllNews(client: Client): Promise<void> {
  await runNewsCategory(client, 'ai');
  await runNewsCategory(client, 'cyber');
  await runNewsCategory(client, 'tools');
}
