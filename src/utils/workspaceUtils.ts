import fs from 'fs/promises';
import path from 'path';

export interface CtfWorkspace {
  guildId: string;
  categoryId: string;
  channelIds: string[];
  slug: string;
  name: string;
  ownerId: string;
  teammateId: string;
  createdAt: number;
  expiresAt: number;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const WORKSPACES_FILE = path.join(DATA_DIR, 'ctf-workspaces.json');

/**
 * Ensures the data directory exists.
 */
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

/**
 * Loads workspaces from the JSON file.
 */
export async function loadWorkspaces(): Promise<CtfWorkspace[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(WORKSPACES_FILE, 'utf-8');
    return JSON.parse(data) as CtfWorkspace[];
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return []; // File doesn't exist yet
    }
    console.error('Failed to load workspaces:', err);
    return [];
  }
}

/**
 * Saves workspaces atomically to the JSON file.
 */
export async function saveWorkspaces(workspaces: CtfWorkspace[]): Promise<void> {
  try {
    await ensureDataDir();
    const tmpFile = `${WORKSPACES_FILE}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(workspaces, null, 2), 'utf-8');
    await fs.rename(tmpFile, WORKSPACES_FILE);
  } catch (err) {
    console.error('Failed to save workspaces:', err);
  }
}

/**
 * Adds a new workspace.
 */
export async function addWorkspace(workspace: CtfWorkspace): Promise<void> {
  const workspaces = await loadWorkspaces();
  workspaces.push(workspace);
  await saveWorkspaces(workspaces);
}

/**
 * Removes a workspace by category ID.
 */
export async function removeWorkspace(categoryId: string): Promise<void> {
  const workspaces = await loadWorkspaces();
  const filtered = workspaces.filter((w) => w.categoryId !== categoryId);
  await saveWorkspaces(filtered);
}

/**
 * Finds a workspace by its slug.
 */
export async function getWorkspaceBySlug(slug: string): Promise<CtfWorkspace | undefined> {
  const workspaces = await loadWorkspaces();
  return workspaces.find((w) => w.slug === slug);
}

/**
 * Updates a workspace (e.g., extending time).
 */
export async function updateWorkspace(workspace: CtfWorkspace): Promise<void> {
  const workspaces = await loadWorkspaces();
  const index = workspaces.findIndex((w) => w.categoryId === workspace.categoryId);
  if (index !== -1) {
    workspaces[index] = workspace;
    await saveWorkspaces(workspaces);
  }
}
