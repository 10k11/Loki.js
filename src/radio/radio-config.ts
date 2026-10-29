import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

interface StoredRadioConfig {
  studyStreamUrl?: string;
  popStreamUrl?: string;
}

const configDir = path.resolve(__dirname, '../../../data');
const configPath = path.join(configDir, 'radio-config.json');

function ensureConfigDir() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

export function readRadioConfig(): StoredRadioConfig {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data) as StoredRadioConfig;
    }
  } catch (error) {
    console.error('[RadioConfig] Failed to read radio config:', error);
  }
  return {};
}

export function writeRadioConfig(config: StoredRadioConfig) {
  try {
    ensureConfigDir();
    const tempPath = `${configPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    fs.renameSync(tempPath, configPath);
  } catch (error) {
    console.error('[RadioConfig] Failed to write radio config:', error);
  }
}

export function getStreamUrl(station: 'study' | 'pop'): string {
  const storedConfig = readRadioConfig();
  if (station === 'study') {
    return storedConfig.studyStreamUrl || env.STUDY_STREAM_URL;
  } else {
    return storedConfig.popStreamUrl || env.POP_STREAM_URL;
  }
}

export function setStreamUrl(station: 'study' | 'pop', url: string) {
  const config = readRadioConfig();
  if (station === 'study') {
    config.studyStreamUrl = url;
  } else {
    config.popStreamUrl = url;
  }
  writeRadioConfig(config);
}
