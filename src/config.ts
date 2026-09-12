import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { ConfigError } from './errors.js';

export interface Profile {
  baseUrl: string;
  projectId: number;
  token?: string;
}

export interface ResolvedConfig {
  baseUrl: string;
  profileName: string;
  projectId?: number;
  token: string;
}

interface ProfileStore {
  profiles: Record<string, Profile>;
}

interface ConfigOverrides {
  baseUrl?: string;
  projectId?: number;
}

export function configPath(): string {
  const xdgConfigHome = nonEmpty(process.env.XDG_CONFIG_HOME);
  if (xdgConfigHome) return join(xdgConfigHome, 'openyapi', 'profiles.json');

  if (platform() === 'win32') {
    const appData = nonEmpty(process.env.APPDATA);
    if (!appData) throw new ConfigError('APPDATA is required to store profiles on Windows.');
    return join(appData, 'openyapi', 'profiles.json');
  }

  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'openyapi', 'profiles.json');
  }

  return join(homedir(), '.config', 'openyapi', 'profiles.json');
}

export function listProfiles(): Record<string, Profile> {
  return loadStore().profiles;
}

export function getProfile(name: string): Profile | undefined {
  return listProfiles()[name];
}

export function setProfile(name: string, settings: Omit<Profile, 'token'>): Profile {
  const store = loadStore();
  const existing = store.profiles[name];
  const profile: Profile = existing?.token
    ? { ...settings, token: existing.token }
    : settings;
  store.profiles[name] = profile;
  saveStore(store);
  return profile;
}

export function deleteProfile(name: string): boolean {
  const store = loadStore();
  const existed = Object.hasOwn(store.profiles, name);
  delete store.profiles[name];
  saveStore(store);
  return existed;
}

export function setProfileToken(name: string, token: string): void {
  const store = loadStore();
  const profile = store.profiles[name];
  if (!profile) throw new ConfigError(`Profile not found: ${name}`);
  if (!token) throw new ConfigError('Token read from stdin must not be empty.');
  store.profiles[name] = { ...profile, token };
  saveStore(store);
}

export function unsetProfileToken(name: string): boolean {
  const store = loadStore();
  const profile = store.profiles[name];
  if (!profile) throw new ConfigError(`Profile not found: ${name}`);
  const configured = profile.token !== undefined;
  const { token: _token, ...settings } = profile;
  store.profiles[name] = settings;
  saveStore(store);
  return configured;
}

export function resolveConfig(
  explicitProfileName: string | undefined,
  overrides: ConfigOverrides,
  requireProjectId: boolean,
): ResolvedConfig {
  const profileName = explicitProfileName
    ?? nonEmpty(process.env.OPENYAPI_PROFILE)
    ?? 'default';
  const profile = getProfile(profileName);
  const baseUrlValue = overrides.baseUrl
    ?? nonEmpty(process.env.OPENYAPI_BASE_URL)
    ?? profile?.baseUrl;
  const token = nonEmpty(process.env.OPENYAPI_TOKEN) ?? profile?.token;
  const projectIdValue = overrides.projectId
    ?? nonEmpty(process.env.OPENYAPI_PROJECT_ID)
    ?? profile?.projectId;

  if (!baseUrlValue) throw new ConfigError('Missing base URL configuration.');
  if (!token) throw new ConfigError('Missing token configuration.');
  const baseUrl = normalizeBaseUrl(baseUrlValue);
  const projectId = projectIdValue === undefined
    ? undefined
    : parseConfiguredPositiveInteger(projectIdValue, 'Project ID');
  if (requireProjectId && projectId === undefined) {
    throw new ConfigError('Missing project ID configuration.');
  }

  return projectId === undefined
    ? { baseUrl, profileName, token }
    : { baseUrl, profileName, projectId, token };
}

export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError('Base URL must be a valid absolute URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('Base URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigError('Base URL must not contain credentials, a query, or a fragment.');
  }
  return url.toString().replace(/\/$/, '');
}

function parseConfiguredPositiveInteger(value: string | number, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${label} must be a positive integer.`);
  }
  return parsed;
}

function loadStore(): ProfileStore {
  let source: string;
  try {
    source = readFileSync(configPath(), 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return { profiles: {} };
    throw new ConfigError('Unable to read the profile store.');
  }

  try {
    const parsed: unknown = JSON.parse(source);
    if (!isProfileStore(parsed)) throw new Error('invalid profile store');
    return parsed;
  } catch {
    throw new ConfigError('Profile store contains invalid data.');
  }
}

function saveStore(store: ProfileStore): void {
  const file = configPath();
  const directory = dirname(file);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (platform() !== 'win32') chmodSync(directory, 0o700);
    writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    if (platform() !== 'win32') chmodSync(file, 0o600);
  } catch {
    throw new ConfigError('Unable to save the profile store.');
  }
}

function isProfileStore(value: unknown): value is ProfileStore {
  if (!value || typeof value !== 'object') return false;
  const profiles = (value as { profiles?: unknown }).profiles;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return false;
  return Object.values(profiles).every((profile) => {
    if (!profile || typeof profile !== 'object') return false;
    const candidate = profile as Partial<Profile>;
    return typeof candidate.baseUrl === 'string'
      && Number.isSafeInteger(candidate.projectId)
      && candidate.projectId !== undefined
      && candidate.projectId > 0
      && (candidate.token === undefined || typeof candidate.token === 'string');
  });
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value;
}
