import { Client, GatewayIntentBits } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  AudioPlayer,
  VoiceConnection,
} from '@discordjs/voice';
import { getStreamUrl } from './radio-config';
import { RadioStationState, StreamHealthState } from './types';

export class RadioClient {
  public client: Client;
  public station: 'study' | 'pop';
  
  private token: string;
  private voiceChannelId: string;
  private guildId: string;
  
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  
  private state: StreamHealthState = 'offline';
  private uptimeStart: number | null = null;
  private lastError: string | null = null;
  
  private retryTimeout: NodeJS.Timeout | null = null;
  private retryAttempts = 0;
  private isShuttingDown = false;

  constructor(station: 'study' | 'pop', token: string, voiceChannelId: string, guildId: string) {
    this.station = station;
    this.token = token;
    this.voiceChannelId = voiceChannelId;
    this.guildId = guildId;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    this.client.on('ready', () => {
      console.log(`[RadioClient:${this.station}] Logged in as ${this.client.user?.tag}`);
      this.connectAndPlay();
    });

    this.client.on('error', (err) => {
      console.error(`[RadioClient:${this.station}] Client error:`, err);
      this.handleError(err.message);
    });
  }

  public async start() {
    this.isShuttingDown = false;
    this.state = 'connecting';
    try {
      await this.client.login(this.token);
    } catch (err: any) {
      console.error(`[RadioClient:${this.station}] Login failed:`, err);
      this.handleError(err.message);
    }
  }

  public async stop() {
    this.isShuttingDown = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    
    if (this.player) {
      this.player.stop();
      this.player = null;
    }
    
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    
    this.client.destroy();
    this.state = 'offline';
    this.uptimeStart = null;
    console.log(`[RadioClient:${this.station}] Stopped.`);
  }

  public getState(): RadioStationState {
    const streamUrl = getStreamUrl(this.station);
    let domain = null;
    try {
      if (streamUrl) {
        domain = new URL(streamUrl).hostname;
      }
    } catch { }

    const channel = this.client.channels.cache.get(this.voiceChannelId);
    
    return {
      station: this.station,
      state: this.state,
      voiceChannelId: this.voiceChannelId,
      voiceChannelName: channel && channel.isVoiceBased() ? channel.name : null,
      uptimeStart: this.uptimeStart,
      lastError: this.lastError,
      streamDomain: domain,
    };
  }

  private connectAndPlay() {
    if (this.isShuttingDown) return;
    
    const streamUrl = getStreamUrl(this.station);
    if (!streamUrl) {
      console.warn(`[RadioClient:${this.station}] No stream URL configured.`);
      this.handleError('No stream URL configured');
      return;
    }

    try {
      const channel = this.client.channels.cache.get(this.voiceChannelId);
      if (!channel || !channel.isVoiceBased()) {
        throw new Error('Voice channel not found or invalid');
      }

      if (!this.connection) {
        this.connection = joinVoiceChannel({
          channelId: this.voiceChannelId,
          guildId: this.guildId,
          adapterCreator: channel.guild.voiceAdapterCreator,
        });

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
          if (this.isShuttingDown) return;
          try {
            await Promise.race([
              entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
              entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            // Reconnecting automatically
          } catch (error) {
            console.error(`[RadioClient:${this.station}] Voice connection disconnected.`);
            try {
              if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                this.connection.destroy();
              }
            } catch (err) {
              // Ignore destroy errors
            }
            this.connection = null;
            this.handleError('Voice connection disconnected');
          }
        });
      }

      if (this.player) {
        this.player.stop();
      }

      this.player = createAudioPlayer();
      
      this.player.on('error', error => {
        console.error(`[RadioClient:${this.station}] Audio player error:`, error);
        this.handleError(error.message);
      });

      this.player.on(AudioPlayerStatus.Idle, () => {
        if (!this.isShuttingDown) {
          console.warn(`[RadioClient:${this.station}] Stream ended unexpectedly.`);
          this.handleError('Stream ended unexpectedly');
        }
      });

      this.player.on(AudioPlayerStatus.Playing, () => {
        console.log(`[RadioClient:${this.station}] Playing stream.`);
        this.state = 'online';
        this.uptimeStart = Date.now();
        this.retryAttempts = 0;
        this.lastError = null;
      });

      const resource = createAudioResource(streamUrl, {
        inlineVolume: false
      });
      
      this.player.play(resource);
      this.connection.subscribe(this.player);

    } catch (err: any) {
      console.error(`[RadioClient:${this.station}] Failed to connect/play:`, err);
      this.handleError(err.message);
    }
  }

  private handleError(errorMsg: string) {
    if (this.isShuttingDown) return;
    this.lastError = errorMsg;
    this.state = 'failed';
    this.uptimeStart = null;
    
    if (this.player) {
      this.player.stop();
    }

    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.retryTimeout || this.isShuttingDown) return;

    this.state = 'reconnecting';
    
    // Exponential backoff: 5s, 10s, 20s, max 60s
    const delay = Math.min(5000 * Math.pow(2, this.retryAttempts), 60000);
    this.retryAttempts++;
    
    console.log(`[RadioClient:${this.station}] Scheduling retry ${this.retryAttempts} in ${delay}ms...`);
    
    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      this.connectAndPlay();
    }, delay);
  }
}
