import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { env } from '../config/env';
import { scrapeMarketNews } from './scraper';
import { analyzeMarketData } from './analyzer';

export async function runMarketUpdate(client: Client) {
  console.log('[MarketRunner] Starting intraday market update...');

  try {
    // 1. Fetch channels by ID instead of name
    const analysisChannelId = env.MARKET_ANALYSIS_CHANNEL_ID;
    const newsChannelId = env.MARKET_NEWS_CHANNEL_ID;

    const analysisChannelObj = await client.channels.fetch(analysisChannelId).catch(() => null);
    const newsChannelObj = await client.channels.fetch(newsChannelId).catch(() => null);

    if (!analysisChannelObj || !analysisChannelObj.isTextBased()) {
      console.error(`[MarketRunner] Could not find text channel for analysis: ${analysisChannelId}`);
      return;
    }
    if (!newsChannelObj || !newsChannelObj.isTextBased()) {
      console.error(`[MarketRunner] Could not find text channel for news: ${newsChannelId}`);
      return;
    }

    const analysisChannel = analysisChannelObj as TextChannel;
    const newsChannel = newsChannelObj as TextChannel;

    // 2. Scrape News
    const newsItems = await scrapeMarketNews();
    if (newsItems.length === 0) {
      console.log('[MarketRunner] No market news found.');
      return;
    }

    // 3. Post Raw News to News Channel
    let newsDescription = '';
    for (let i = 0; i < Math.min(10, newsItems.length); i++) {
      const item = newsItems[i];
      if (item.link) {
        newsDescription += `**[${item.title}](${item.link})**\n${item.summary}\n\n`;
      } else {
        newsDescription += `**${item.title}**\n${item.summary}\n\n`;
      }
    }
    
    if (newsDescription.length > 4096) {
        newsDescription = newsDescription.slice(0, 4093) + '...';
    }

    const newsEmbed = new EmbedBuilder()
      .setTitle('📰 Indian Stock Market News')
      .setDescription(newsDescription)
      .setColor(0x0099FF)
      .setTimestamp()
      .setFooter({ text: 'Sourced from Economic Times' });

    await newsChannel.send({ embeds: [newsEmbed] });
    console.log('[MarketRunner] Successfully sent news update.');

    // 4. Analyze Data and Post to Analysis Channel
    const analysis = await analyzeMarketData(newsItems);
    if (!analysis) {
      console.log('[MarketRunner] Analysis failed or returned null.');
      return;
    }

    const embedColor = analysis.sentiment === 'BULLISH' ? 0x00FF00 : (analysis.sentiment === 'BEARISH' ? 0xFF0000 : 0xFFFF00);
    
    const analysisEmbed = new EmbedBuilder()
      .setTitle('📈 Mistral AI Market Analysis')
      .setDescription(`**Sentiment:** ${analysis.sentiment}\n\n${analysis.summary}`)
      .setColor(embedColor)
      .setTimestamp()
      .setFooter({ text: 'Powered by Mistral AI' });

    if (analysis.recommendations && analysis.recommendations.length > 0) {
      let recText = '';
      for (const rec of analysis.recommendations) {
        const icon = rec.action === 'BUY' ? '🟢' : (rec.action === 'SELL' ? '🔴' : (rec.action === 'HOLD' ? '🟡' : '👀'));
        recText += `${icon} **${rec.symbol}** - ${rec.action}\n*${rec.reason}*\n\n`;
      }
      analysisEmbed.addFields({ name: 'Stock Recommendations', value: recText });
    } else {
      analysisEmbed.addFields({ name: 'Stock Recommendations', value: 'No specific stock actions identified in recent news.' });
    }

    await analysisChannel.send({ embeds: [analysisEmbed] });
    console.log('[MarketRunner] Successfully sent market analysis.');

  } catch (error) {
    console.error('[MarketRunner] Error during market update:', error);
  }
}
