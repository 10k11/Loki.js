import { ChannelType } from 'discord.js';

export interface ChannelDefinition {
  name: string;
  type: ChannelType.GuildText | ChannelType.GuildVoice;
  topic?: string;
  welcomeMessage?: string;
}

export interface CategoryDefinition {
  name: string;
  channels: ChannelDefinition[];
}

export const serverLayout: CategoryDefinition[] = [
  {
    name: '📌 COMMAND',
    channels: [
      { name: 'announcements', type: ChannelType.GuildText, topic: 'Server-wide announcements for Localhost', welcomeMessage: 'Welcome to #announcements. Important updates will be posted here.' },
      { name: 'drop-zone', type: ChannelType.GuildText, topic: 'Smart Inbox - drop messages here for AI classification', welcomeMessage: 'Welcome to the #drop-zone! Drop your links, notes, and files here and Mistral AI will sort them for you.' },
      { name: 'imp-stuff', type: ChannelType.GuildText, topic: 'Important stuff and links', welcomeMessage: 'Welcome to #imp-stuff. Keep important documents and references here.' },
      { name: 'bug-reports', type: ChannelType.GuildText, topic: 'Report bugs and infrastructure issues', welcomeMessage: 'Welcome to #bug-reports. Please report any issues here.' },
      { name: 'roadmap', type: ChannelType.GuildText, topic: 'Team roadmap and planning', welcomeMessage: 'Welcome to #roadmap. Future plans and goals go here.' },
    ],
  },
  {
    name: '🧠 KNOWLEDGE',
    channels: [
      { name: 'ai-news', type: ChannelType.GuildText, topic: 'Latest news in AI and ML', welcomeMessage: 'Welcome to #ai-news.' },
      { name: 'cyber-news', type: ChannelType.GuildText, topic: 'Cybersecurity news and alerts', welcomeMessage: 'Welcome to #cyber-news. Stay updated with the latest in infosec.' },
      { name: 'tools-resources', type: ChannelType.GuildText, topic: 'Tools and resources for pentesting and CTFs', welcomeMessage: 'Welcome to #tools-resources. Share useful tools here.' },
      { name: 'study-notes', type: ChannelType.GuildText, topic: 'Study notes and learning materials', welcomeMessage: 'Welcome to #study-notes. Share your learning progress.' },
      { name: 'useful-links', type: ChannelType.GuildText, topic: 'Miscellaneous useful links', welcomeMessage: 'Welcome to #useful-links.' },
    ],
  },
  {
    name: '🏁 CTF HQ',
    channels: [
      { name: 'ctf-chat', type: ChannelType.GuildText, topic: 'General CTF discussion and coordination', welcomeMessage: 'Welcome to #ctf-chat. Coordinate your current CTF efforts here.' },
      { name: 'ctf-calendar', type: ChannelType.GuildText, topic: 'Upcoming CTF schedule', welcomeMessage: 'Welcome to #ctf-calendar. Keep track of upcoming events.' },
      { name: 'writeups', type: ChannelType.GuildText, topic: 'Polished CTF writeups and solutions', welcomeMessage: 'Welcome to #writeups. Post your finalized writeups here.' },
      { name: 'ctf-resources', type: ChannelType.GuildText, topic: 'Specific resources for playing CTFs', welcomeMessage: 'Welcome to #ctf-resources.' },
    ],
  },
  {
    name: '💼 FUTURE WORK',
    channels: [
      { name: 'ui-design', type: ChannelType.GuildText, topic: 'UI/UX design discussions', welcomeMessage: 'Welcome to #ui-design.' },
      { name: 'video-editing', type: ChannelType.GuildText, topic: 'Video editing projects and ideas', welcomeMessage: 'Welcome to #video-editing.' },
      { name: 'freelance-leads', type: ChannelType.GuildText, topic: 'Potential freelance gigs and leads', welcomeMessage: 'Welcome to #freelance-leads.' },
      { name: 'client-ideas', type: ChannelType.GuildText, topic: 'Ideas for client projects', welcomeMessage: 'Welcome to #client-ideas.' },
      { name: 'portfolio-feedback', type: ChannelType.GuildText, topic: 'Feedback on personal portfolios', welcomeMessage: 'Welcome to #portfolio-feedback.' },
    ],
  },
  {
    name: '📈 MARKET LAB',
    channels: [
      { name: 'market-news', type: ChannelType.GuildText, topic: 'Market and financial news', welcomeMessage: 'Welcome to #market-news.' },
      { name: 'watchlist', type: ChannelType.GuildText, topic: 'Trading watchlist', welcomeMessage: 'Welcome to #watchlist.' },
      { name: 'trade-journal', type: ChannelType.GuildText, topic: 'Journal for trading ideas', welcomeMessage: 'Welcome to #trade-journal.' },
      { name: 'learning-resources', type: ChannelType.GuildText, topic: 'Resources for market learning', welcomeMessage: 'Welcome to #learning-resources (Market Lab).' },
    ],
  },
  {
    name: '🎮 CHILL',
    channels: [
      { name: 'general', type: ChannelType.GuildText, topic: 'General hangout chat', welcomeMessage: 'Welcome to #general. Just chill out here.' },
      { name: 'memes-media', type: ChannelType.GuildText, topic: 'Memes and funny media', welcomeMessage: 'Welcome to #memes-media. Share your memes.' },
      { name: 'games-movies', type: ChannelType.GuildText, topic: 'Gaming and movie discussion', welcomeMessage: 'Welcome to #games-movies.' },
    ],
  },
  {
    name: '🔊 VOICE',
    channels: [
      { name: 'General', type: ChannelType.GuildVoice },
      { name: 'Focus Room', type: ChannelType.GuildVoice },
      { name: 'CTF War Room', type: ChannelType.GuildVoice },
    ],
  },
];
