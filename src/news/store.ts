import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { NewsStore, NewsStoreConfig, StoredNewsItem, RawNewsItem } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news-cache.json');

const DEFAULT_CONFIG: NewsStoreConfig = {
  ai: { lastRunAt: null, error: null, lastSuccessfulRunAt: null },
  cyber: { lastRunAt: null, error: null, lastSuccessfulRunAt: null },
  tools: { lastRunAt: null, error: null, lastSuccessfulRunAt: null },
  paused: { ai: false, cyber: false, tools: false },
};

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadNewsStore(): Promise<NewsStore> {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(NEWS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<NewsStore>;
    return {
      config: { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) },
      items: parsed.items ?? [],
    };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { config: { ...DEFAULT_CONFIG }, items: [] };
    }
    console.error('[NewsStore] Failed to load news-cache.json:', err);
    return { config: { ...DEFAULT_CONFIG }, items: [] };
  }
}

export async function saveNewsStore(store: NewsStore): Promise<void> {
  try {
    await ensureDataDir();
    const tmp = `${NEWS_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
    await fs.rename(tmp, NEWS_FILE);
  } catch (err) {
    console.error('[NewsStore] Failed to save news-cache.json:', err);
    throw err;
  }
}

/**
 * Creates a unique hash for deduplication based on canonical URL and normalized title
 */
export function makeNewsContentHash(url: string, title: string): string {
  // Normalize canonical URL
  const cleanUrl = url.split('#')[0].replace(/\/$/, '').trim().toLowerCase();
  const cleanTitle = title.trim().toLowerCase();
  
  const key = `${cleanUrl}|${cleanTitle}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Returns items that are completely new (not in cache) based on content hash or url.
 */
export function filterNewItems(existingItems: StoredNewsItem[], incomingItems: RawNewsItem[]): RawNewsItem[] {
  const existingHashes = new Set(existingItems.map(i => i.contentHash));
  const existingUrls = new Set(existingItems.map(i => i.url.split('#')[0].replace(/\/$/, '').trim().toLowerCase()));

  return incomingItems.filter(item => {
    const hash = makeNewsContentHash(item.url, item.title);
    const cleanUrl = item.url.split('#')[0].replace(/\/$/, '').trim().toLowerCase();
    
    if (existingHashes.has(hash)) return false;
    if (existingUrls.has(cleanUrl)) return false;
    
    return true;
  });
}
