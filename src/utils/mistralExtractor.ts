import { env } from '../config/env';
import { Mistral } from '@mistralai/mistralai';

export interface ExtractedEventFields {
  name: string | null;
  startTime: string | null;          // ISO 8601 or null
  finishTime: string | null;
  registrationDeadline: string | null;
  prizeAmount: string | null;        // Exact string from page, or null
  prizeCurrency: string | null;
  prizeEvidenceUrl: string | null;   // Exact URL where prize was stated
  format: string | null;
  teamSize: string | null;
  location: string | null;
  onlineOrOffline: 'online' | 'offline' | 'hybrid' | null;
}

const SYSTEM_PROMPT = `You are a structured data extractor for CTF and hackathon event pages.
Extract ONLY the fields listed in the JSON schema from the provided plain text.
STRICT RULES:
- Return ONLY valid JSON. No markdown, no explanation.
- Set any field to null if it is not clearly stated on the page.
- NEVER invent, infer, estimate, or guess dates, prize amounts, eligibility, or URLs.
- For prizeAmount: only include an exact cash figure that is clearly stated (e.g. "50000"). Do NOT convert currencies or estimate totals.
- For prizeEvidenceUrl: only include the exact URL where the prize was stated. If you cannot verify it, set to null.
- For onlineOrOffline: only "online", "offline", or "hybrid". If unclear, null.
- For dates: ISO 8601 format only if explicitly found on the page.`;

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    name:                 { type: ['string', 'null'] },
    startTime:            { type: ['string', 'null'] },
    finishTime:           { type: ['string', 'null'] },
    registrationDeadline: { type: ['string', 'null'] },
    prizeAmount:          { type: ['string', 'null'] },
    prizeCurrency:        { type: ['string', 'null'] },
    prizeEvidenceUrl:     { type: ['string', 'null'] },
    format:               { type: ['string', 'null'] },
    teamSize:             { type: ['string', 'null'] },
    location:             { type: ['string', 'null'] },
    onlineOrOffline:      { type: ['string', 'null'], enum: ['online', 'offline', 'hybrid', null] },
  },
  required: [
    'name', 'startTime', 'finishTime', 'registrationDeadline',
    'prizeAmount', 'prizeCurrency', 'prizeEvidenceUrl',
    'format', 'teamSize', 'location', 'onlineOrOffline',
  ],
};

let client: Mistral | null = null;

function getClient(): Mistral | null {
  if (!env.MISTRAL_API_KEY) return null;
  if (!client) client = new Mistral({ apiKey: env.MISTRAL_API_KEY });
  return client;
}

/**
 * Use Mistral to extract structured fields from raw event page text.
 * Returns null if Mistral is unavailable or extraction fails.
 * Only call this when deterministic parsing is insufficient.
 */
export async function extractEventFieldsWithMistral(
  pageText: string,
  pageUrl: string
): Promise<ExtractedEventFields | null> {
  const mistral = getClient();
  if (!mistral) {
    console.log('[Mistral] API key not set; skipping AI extraction');
    return null;
  }

  // Truncate to ~4000 chars to stay within token budget
  const truncated = pageText.slice(0, 4000);

  try {
    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Page URL: ${pageUrl}\n\n--- PAGE TEXT ---\n${truncated}\n--- END ---\n\nExtract the event fields as JSON.`,
        },
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0,
      maxTokens: 512,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      console.warn('[Mistral] Empty response');
      return null;
    }

    const parsed = JSON.parse(content) as ExtractedEventFields;
    return parsed;
  } catch (err: any) {
    console.error('[Mistral] Extraction failed:', err.message);
    return null;
  }
}
