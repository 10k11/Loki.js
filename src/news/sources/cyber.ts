import { RawNewsItem } from '../types';
import { fetchRssFeed, fetchJson } from '../fetcher';

export async function fetchCyberNews(): Promise<RawNewsItem[]> {
  console.log('[News] Fetching Cyber news...');
  const items: RawNewsItem[] = [];

  // 1. CISA Alerts RSS
  try {
    const cisaData = await fetchRssFeed('https://www.cisa.gov/cybersecurity-advisories/all.xml');
    const feedItems = cisaData.items.slice(0, 5).map(item => ({
      title: item.title || 'No Title',
      url: item.link || '',
      source: 'CISA Advisories',
      publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
      summaryText: (item.contentSnippet || item.content || '').substring(0, 1000)
    }));
    items.push(...feedItems);
  } catch (error) {
    console.error(`[Cyber News] Failed to fetch CISA Alerts:`, error);
  }

  // 2. CISA KEV JSON
  try {
    const kevData = await fetchJson('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
    if (kevData && Array.isArray(kevData.vulnerabilities)) {
      const recentKevs = kevData.vulnerabilities.slice(-5).reverse(); // Get latest
      for (const kev of recentKevs) {
        items.push({
          title: `KEV Added: ${kev.cveID} - ${kev.vulnerabilityName}`,
          url: `https://nvd.nist.gov/vuln/detail/${kev.cveID}`,
          source: 'CISA KEV Catalog',
          publishedAt: new Date(kev.dateAdded),
          summaryText: kev.shortDescription || 'No description provided.'
        });
      }
    }
  } catch (error) {
    console.error(`[Cyber News] Failed to fetch CISA KEV:`, error);
  }

  // 3. Trusted Cyber News (The Hacker News)
  try {
    const thnData = await fetchRssFeed('https://feeds.feedburner.com/TheHackersNews');
    const thnItems = thnData.items.slice(0, 5).map(item => ({
      title: item.title || 'No Title',
      url: item.link || '',
      source: 'The Hacker News',
      publishedAt: item.isoDate ? new Date(item.isoDate) : new Date(),
      summaryText: (item.contentSnippet || item.content || '').substring(0, 1000)
    }));
    items.push(...thnItems);
  } catch (error) {
    console.error(`[Cyber News] Failed to fetch The Hacker News:`, error);
  }
  
  return items;
}
