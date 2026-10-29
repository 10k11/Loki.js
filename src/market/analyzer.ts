import { Mistral } from '@mistralai/mistralai';
import { env } from '../config/env';
import { MarketNewsItem } from './scraper';

let mistralClient: Mistral | null = null;

function getMistralClient(): Mistral | null {
  if (mistralClient) return mistralClient;
  if (!env.MISTRAL_API_KEY) return null;
  mistralClient = new Mistral({ apiKey: env.MISTRAL_API_KEY });
  return mistralClient;
}

export interface StockRecommendation {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD' | 'WATCH';
  reason: string;
}

export interface MarketAnalysis {
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  summary: string;
  recommendations: StockRecommendation[];
}

export async function analyzeMarketData(newsItems: MarketNewsItem[]): Promise<MarketAnalysis | null> {
  const client = getMistralClient();
  if (!client) {
    console.warn('[MarketAnalyzer] MISTRAL_API_KEY not configured. Cannot perform market analysis.');
    return null;
  }

  if (newsItems.length === 0) return null;

  const payload = newsItems.map(item => ({
    title: item.title,
    summary: item.summary
  }));

  const systemPrompt = `You are an expert intraday Indian stock market analyst.
Your job is to read the latest stock market news headlines and summaries, analyze the overall intraday sentiment, and extract actionable stock recommendations (which stocks to buy, sell, hold, or watch) based *only* on the provided text.

Rules:
1. Base your analysis STRICTLY on the provided news items. Do not invent external facts.
2. Determine the overall market sentiment (BULLISH, BEARISH, or NEUTRAL).
3. Provide a brief 2-3 sentence summary of the market situation.
4. Extract up to 5 specific stocks mentioned. Identify the action (BUY, SELL, HOLD, or WATCH) implied by the news, and give a short 1-sentence reason.
5. Output MUST strictly conform to the following JSON schema:
{
  "sentiment": "BULLISH | BEARISH | NEUTRAL",
  "summary": "string",
  "recommendations": [
    {
      "symbol": "string (Company Name or Ticker)",
      "action": "BUY | SELL | HOLD | WATCH",
      "reason": "string (maximum 20 words)"
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
    if (!content) return null;

    const parsed = JSON.parse(content as string);
    return parsed as MarketAnalysis;
  } catch (error) {
    console.error('[MarketAnalyzer] Failed to analyze market data:', error);
    return null;
  }
}
