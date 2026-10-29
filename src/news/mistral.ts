import { Mistral } from '@mistralai/mistralai';
import { env } from '../config/env';
import { RawNewsItem, MistralProcessedItem, ChannelCategory } from './types';

let mistralClient: Mistral | null = null;

export function getMistralClient(): Mistral | null {
  if (mistralClient) return mistralClient;
  if (!env.MISTRAL_API_KEY) return null;
  mistralClient = new Mistral({ apiKey: env.MISTRAL_API_KEY });
  return mistralClient;
}

export async function processNewsBatch(
  items: RawNewsItem[],
  category: ChannelCategory
): Promise<MistralProcessedItem[]> {
  const client = getMistralClient();
  if (!client) {
    console.warn('[NewsMistral] MISTRAL_API_KEY not configured. Falling back to empty processed array.');
    return [];
  }

  if (items.length === 0) return [];

  // Limit to 20 items per batch to avoid blowing context limits
  const processableItems = items.slice(0, 20);

  const payload = processableItems.map(item => ({
    title: item.title,
    source: item.source,
    url: item.url,
    publishedAt: item.publishedAt?.toISOString() || 'Unknown',
    summaryText: item.summaryText.slice(0, 1000) // cap text size
  }));

  const systemPrompt = `You are a cybersecurity and technology intelligence analyst.
Your job is to review a batch of news articles, identify the most critical and relevant updates for a computer science student interested in full-stack development, cybersecurity, CTFs, AI tools, and coding automation, and format them into a strict JSON payload.

Category focus: ${category}

Rules:
1. Never invent facts, CVEs, exploitability, prize money, source URLs, or dates.
2. If source information is incomplete, omit the item.
3. Never give trading or financial advice.
4. Never claim a vulnerability is exploited unless the source explicitly says that.
5. Prefer official and primary sources.
6. Limit the output to a MAXIMUM of 5 items. Pick only the most important ones.
7. If nothing useful is found, return an empty array in the JSON.
8. Output MUST strictly conform to the following JSON schema:
{
  "items": [
    {
      "title": "string",
      "summary": "string (maximum 45 words)",
      "whyItMatters": "string (maximum 25 words)",
      "priority": "high | medium | low",
      "category": "${category}",
      "url": "string (MUST MATCH the input URL exactly)",
      "source": "string (MUST MATCH the input source exactly)"
    }
  ]
}`;

  try {
    const response = await client.chat.complete({
      model: 'mistral-large-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload, null, 2) }
      ],
      responseFormat: { type: 'json_object' }
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content as string);
    if (Array.isArray(parsed.items)) {
      return parsed.items as MistralProcessedItem[];
    }
    return [];
  } catch (error) {
    console.error(`[NewsMistral] Failed to process ${category} news batch:`, error);
    return [];
  }
}
