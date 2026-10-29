import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from 'discord.js';
import crypto from 'crypto';
import { Mistral } from '@mistralai/mistralai';
import { env } from '../config/env';
import { INBOX_CHANNEL_NAME, ALLOWED_DESTINATIONS, DestinationChannel } from '../config/constants';

// Cooldown map: userId -> expiry timestamp
const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 3000;

// Duplicate cache: hash -> expiry timestamp
const duplicates = new Map<string, number>();
const DUPLICATE_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cleanup interval for memory management
setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of cooldowns.entries()) {
    if (now > expiry) cooldowns.delete(key);
  }
  for (const [key, expiry] of duplicates.entries()) {
    if (now > expiry) duplicates.delete(key);
  }
}, 60 * 60 * 1000); // Clean up every hour

const mistral = new Mistral({
  apiKey: env.MISTRAL_API_KEY,
});

function hashMessage(content: string, attachments: string[]): string {
  const data = content + attachments.join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function classifyMessage(content: string, attachments: string[], urls: string[], embedTitles: string[]): Promise<{ suggestedDestination: DestinationChannel, confidenceScore: number, classificationReason: string }> {
  const prompt = `
Classify the following Discord message into EXACTLY ONE of the allowed destinations.
Allowed destinations: ${ALLOWED_DESTINATIONS.join(', ')}

Message Text: ${content}
URLs: ${urls.join(', ')}
Attachment Filenames: ${attachments.join(', ')}
Embed Titles: ${embedTitles.join(', ')}
`;

  let suggestedDestination: DestinationChannel = 'imp-stuff';
  let confidenceScore = 0;
  let classificationReason = 'Fallback due to classification failure';

  try {
    const response = await mistral.chat.complete({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: prompt }],
      responseFormat: { type: 'json_object' },
    });

    const contentResponse = response.choices?.[0]?.message?.content;
    if (typeof contentResponse === 'string') {
      const parsed = JSON.parse(contentResponse);
      const dest = parsed.destination;
      const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
      
      if (ALLOWED_DESTINATIONS.includes(dest as DestinationChannel) && conf >= 70) {
        suggestedDestination = dest as DestinationChannel;
        confidenceScore = conf;
        classificationReason = parsed.reason || 'Classified by Mistral';
      } else {
        classificationReason = parsed.reason || 'Low confidence, defaulting to imp-stuff';
      }
    }
  } catch (error) {
    console.error('Mistral AI Classification error:', error);
  }

  return { suggestedDestination, confidenceScore, classificationReason };
}

export async function sendInboxUIForMessage(message: Message, content: string, attachments: string[], urls: string[], embedTitles: string[]) {
  const classification = await classifyMessage(content, attachments, urls, embedTitles);

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('📥 Smart Inbox Classification')
    .setDescription(`**Suggested destination:** #${classification.suggestedDestination}\n**Confidence:** ${classification.confidenceScore}%\n**Reason:** ${classification.classificationReason}`);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`inbox_send_${classification.suggestedDestination}`)
        .setLabel('Send')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('inbox_choose_diff')
        .setLabel('Choose Different Channel')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('inbox_keep')
        .setLabel('Keep in Drop Zone')
        .setStyle(ButtonStyle.Danger)
    );

  await message.reply({
    embeds: [embed],
    components: [row]
  });
}

export async function handleInboxMessage(message: Message) {
  const channel = message.channel;
  if (!(channel instanceof TextChannel) || channel.name !== INBOX_CHANNEL_NAME) {
    return;
  }

  const userId = message.author.id;
  const now = Date.now();

  // Cooldown check
  const userCooldown = cooldowns.get(userId);
  if (userCooldown && now < userCooldown) {
    return; // Ignore silently to prevent spam
  }
  cooldowns.set(userId, now + COOLDOWN_MS);

  // Compile message features
  const content = message.content;
  const attachments = message.attachments.map(a => a.name);
  const urls = content.match(/https?:\/\/[^\s]+/g) || [];
  const embedTitles = message.embeds.map(e => e.title).filter(Boolean) as string[];

  // Duplicate check
  const msgHash = hashMessage(content, attachments);
  if (duplicates.has(msgHash)) {
    return; // Ignore duplicates
  }
  duplicates.set(msgHash, now + DUPLICATE_CACHE_MS);

  await sendInboxUIForMessage(message, content, attachments, urls, embedTitles);
}
