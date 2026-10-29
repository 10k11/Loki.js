export const INBOX_CHANNEL_NAME = 'drop-zone';

export const ALLOWED_DESTINATIONS = [
  'ai-news',
  'cyber-news',
  'tools-resources',
  'bug-reports',
  'ctf-resources',
  'freelance-leads',
  'ui-design',
  'video-editing',
  'market-news',
  'watchlist',
  'trade-journal',
  'useful-links',
  'imp-stuff',
] as const;

export type DestinationChannel = typeof ALLOWED_DESTINATIONS[number];
