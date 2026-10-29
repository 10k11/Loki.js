import fetch, { RequestInit } from 'node-fetch';
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
});

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal as any,
      headers: {
        'User-Agent': 'LocalhostBot/1.0 (CTF Team bot; https://github.com/10k11/Loki.js)',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchRssFeed(url: string, retries = 1): Promise<Parser.Output<{ [key: string]: any }>> {
  try {
    // using node-fetch to get raw xml and then pass to parser for better timeout/header control
    const res = await fetchWithTimeout(url);
    const text = await res.text();
    return await parser.parseString(text);
  } catch (error) {
    if (retries > 0) {
      console.warn(`[NewsFetcher] Retrying RSS fetch for ${url}...`);
      return fetchRssFeed(url, retries - 1);
    }
    throw error;
  }
}

export async function fetchJson(url: string, retries = 1): Promise<any> {
  try {
    const res = await fetchWithTimeout(url);
    return await res.json();
  } catch (error) {
    if (retries > 0) {
      console.warn(`[NewsFetcher] Retrying JSON fetch for ${url}...`);
      return fetchJson(url, retries - 1);
    }
    throw error;
  }
}
