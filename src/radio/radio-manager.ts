import { env } from '../config/env';
import { RadioClient } from './radio-client';
import { RadioStationState } from './types';
import { setStreamUrl } from './radio-config';

export class RadioManager {
  private static instance: RadioManager;
  
  private studyClient: RadioClient | null = null;
  private popClient: RadioClient | null = null;

  private constructor() {}

  public static getInstance(): RadioManager {
    if (!RadioManager.instance) {
      RadioManager.instance = new RadioManager();
    }
    return RadioManager.instance;
  }

  public initialize() {
    console.log('[RadioManager] Initializing radio stations...');
    if (env.STUDY_RADIO_BOT_TOKEN && env.STUDY_VOICE_CHANNEL_ID) {
      this.startStation('study');
    } else {
      console.log('[RadioManager] Study radio not configured (missing token or channel ID).');
    }

    if (env.POP_RADIO_BOT_TOKEN && env.POP_VOICE_CHANNEL_ID) {
      this.startStation('pop');
    } else {
      console.log('[RadioManager] Pop radio not configured (missing token or channel ID).');
    }
  }

  public async startStation(station: 'study' | 'pop') {
    if (station === 'study') {
      if (!this.studyClient) {
        if (!env.STUDY_RADIO_BOT_TOKEN || !env.STUDY_VOICE_CHANNEL_ID) {
          throw new Error('Study radio is missing token or voice channel config in environment.');
        }
        this.studyClient = new RadioClient('study', env.STUDY_RADIO_BOT_TOKEN, env.STUDY_VOICE_CHANNEL_ID, env.GUILD_ID);
      }
      await this.studyClient.start();
    } else {
      if (!this.popClient) {
        if (!env.POP_RADIO_BOT_TOKEN || !env.POP_VOICE_CHANNEL_ID) {
          throw new Error('Pop radio is missing token or voice channel config in environment.');
        }
        this.popClient = new RadioClient('pop', env.POP_RADIO_BOT_TOKEN, env.POP_VOICE_CHANNEL_ID, env.GUILD_ID);
      }
      await this.popClient.start();
    }
  }

  public async stopStation(station: 'study' | 'pop') {
    if (station === 'study' && this.studyClient) {
      await this.studyClient.stop();
    } else if (station === 'pop' && this.popClient) {
      await this.popClient.stop();
    }
  }

  public async restartStation(station: 'study' | 'pop') {
    await this.stopStation(station);
    // Give it a brief moment to fully disconnect
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startStation(station);
  }

  public async updateStreamUrl(station: 'study' | 'pop', url: string) {
    setStreamUrl(station, url);
    await this.restartStation(station);
  }

  public getStatus(): { study: RadioStationState | null, pop: RadioStationState | null } {
    return {
      study: this.studyClient ? this.studyClient.getState() : null,
      pop: this.popClient ? this.popClient.getState() : null,
    };
  }
}
