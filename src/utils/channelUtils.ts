import { Guild, ChannelType, CategoryChannel, TextChannel, VoiceChannel } from 'discord.js';
import { ChannelDefinition, CategoryDefinition } from '../config/serverLayout';

/**
 * Creates a category if it does not exist.
 */
export async function getOrCreateCategory(guild: Guild, name: string): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase()
  ) as CategoryChannel | undefined;

  if (existing) {
    return existing;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
  });
}

/**
 * Creates a channel under a category if it doesn't exist, and sends a pinned welcome message if defined.
 */
export async function getOrCreateChannel(
  guild: Guild,
  category: CategoryChannel,
  def: ChannelDefinition
): Promise<TextChannel | VoiceChannel> {
  const existing = guild.channels.cache.find(
    (c) => c.parentId === category.id && c.name.toLowerCase() === def.name.toLowerCase()
  ) as TextChannel | VoiceChannel | undefined;

  if (existing) {
    return existing;
  }

  const channel = await guild.channels.create({
    name: def.name,
    type: def.type,
    parent: category.id,
    topic: def.topic,
  });

  if (channel.type === ChannelType.GuildText && def.welcomeMessage) {
    const textChannel = channel as TextChannel;
    try {
      const msg = await textChannel.send(def.welcomeMessage);
      await msg.pin();
    } catch (err) {
      console.error(`Failed to send/pin message in ${channel.name}:`, err);
    }
  }

  return channel;
}

/**
 * Normalizes a string to a safe slug.
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Pause execution for rate limit safety during sequential operations.
 */
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
