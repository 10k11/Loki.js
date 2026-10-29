export type ChannelCategory = 'ai' | 'cyber' | 'tools';

export interface RawNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: Date;
  summaryText: string;
}

export interface MistralProcessedItem {
  title: string;
  summary: string;     // max 45 words
  whyItMatters: string; // max 25 words
  priority: 'high' | 'medium' | 'low';
  category: string;
  url: string;
  source: string;
}

export interface StoredNewsItem {
  url: string;
  title: string;
  channelType: ChannelCategory;
  source: string;
  publishedAt: number | null; // Unix ms
  contentHash: string;
  postedAt: number; // Unix ms
  importanceScore?: number; // Might map from priority: high=3, medium=2, low=1
}

export interface NewsStoreConfig {
  ai: { lastRunAt: number | null; error: string | null; lastSuccessfulRunAt: number | null };
  cyber: { lastRunAt: number | null; error: string | null; lastSuccessfulRunAt: number | null };
  tools: { lastRunAt: number | null; error: string | null; lastSuccessfulRunAt: number | null };
  paused: {
    ai: boolean;
    cyber: boolean;
    tools: boolean;
  };
}

export interface NewsStore {
  config: NewsStoreConfig;
  items: StoredNewsItem[];
}
