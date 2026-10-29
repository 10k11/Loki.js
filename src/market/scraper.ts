import * as cheerio from 'cheerio';

export interface MarketNewsItem {
  title: string;
  summary: string;
  link?: string;
}

export async function scrapeMarketNews(): Promise<MarketNewsItem[]> {
  const url = 'https://economictimes.indiatimes.com/markets/stocks/news';
  const newsItems: MarketNewsItem[] = [];

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[MarketScraper] HTTP error! status: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // ET Markets news structure: Usually in divs with class .eachStory
    $('div.eachStory').each((i, element) => {
      // Limit to top 15 news items so we don't overload the LLM
      if (newsItems.length >= 15) return false;

      const headlineElement = $(element).find('h3 a');
      const title = headlineElement.text().trim();
      const link = headlineElement.attr('href') || '';
      
      const summaryElement = $(element).find('p');
      const summary = summaryElement.text().trim();

      if (title) {
        newsItems.push({
          title,
          summary,
          link: link.startsWith('http') ? link : `https://economictimes.indiatimes.com${link}`
        });
      }
    });

    // Fallback if the structure changed
    if (newsItems.length === 0) {
      $('div.story-box').each((i, element) => {
        if (newsItems.length >= 15) return false;
        const title = $(element).find('h2.title a').text().trim() || $(element).find('.desc h3').text().trim();
        const summary = $(element).find('p').text().trim();
        if (title) {
          newsItems.push({ title, summary });
        }
      });
    }
    
    console.log(`[MarketScraper] Successfully scraped ${newsItems.length} news items.`);
    return newsItems;

  } catch (error) {
    console.error('[MarketScraper] Failed to scrape market news:', error);
    return [];
  }
}
