import { RawNewsItem } from '../types';
import { fetchRssFeed } from '../fetcher';

export async function fetchToolsNews(): Promise<RawNewsItem[]> {
  console.log('[News] Fetching Tools news...');
  const items: RawNewsItem[] = [];

  const feeds = [
    { url: 'https://github.com/projectdiscovery/nuclei/releases.atom', name: 'ProjectDiscovery Nuclei Releases' },
    { url: 'https://portswigger.net/research/rss', name: 'PortSwigger Research' },
    { url: 'https://github.com/carlospolop/hacktricks/commits/master.atom', name: 'HackTricks Commits' }
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
      console.error(`[Tools News] Failed to fetch feed ${feed.url}:`, error);
    }
  }
  
  return items;
}
