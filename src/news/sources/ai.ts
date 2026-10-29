import { RawNewsItem } from '../types';
import { fetchRssFeed } from '../fetcher';

export async function fetchAINews(): Promise<RawNewsItem[]> {
  console.log('[News] Fetching AI news...');
  const items: RawNewsItem[] = [];

  const feeds = [
    { url: 'https://huggingface.co/blog/feed.xml', name: 'Hugging Face Blog' },
    { url: 'https://blog.google/technology/ai/rss/', name: 'Google AI Blog' }
  ];

  for (const feed of feeds) {
    try {
      const data = await fetchRssFeed(feed.url);
      const feedItems = data.items.slice(0, 5).map(item => ({
        title: item.title || 'No Title',
        url: item.link || '',
        source: feed.name,
        publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
        summaryText: (item.contentSnippet || item.content || '').substring(0, 1000)
      }));
      items.push(...feedItems);
    } catch (error) {
      console.error(`[AI News] Failed to fetch feed ${feed.url}:`, error);
      // Continue to next source on failure
    }
  }
  
  return items;
}
