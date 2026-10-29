export interface RadioStationConfig {
  station: 'study' | 'pop';
  token: string;
  streamUrl: string;
  voiceChannelId: string;
}

export type StreamHealthState = 'online' | 'offline' | 'connecting' | 'reconnecting' | 'failed';

export interface RadioStationState {
  station: 'study' | 'pop';
  state: StreamHealthState;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  uptimeStart: number | null;
  lastError: string | null;
  streamDomain: string | null;
}
