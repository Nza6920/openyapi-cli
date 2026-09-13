import { get } from './client.js';
import type { ResolvedConfig } from './config.js';
import { CliError } from './errors.js';

export function requiredProjectId(config: ResolvedConfig): number {
  if (config.projectId === undefined) {
    throw new CliError('CONFIG_ERROR', 'Missing project ID configuration.');
  }
  return config.projectId;
}

export function assertProjectIdentity(value: unknown, expectedProjectId: number): void {
  const actual = record(value)?._id;
  if (!isIntegerLike(actual) || Number(actual) !== expectedProjectId) {
    throw new CliError(
      'PROJECT_MISMATCH',
      `Authenticated project does not match configured project ${expectedProjectId}.`,
    );
  }
}

export async function preflightProject(
  config: ResolvedConfig,
  timeoutMs: number,
): Promise<void> {
  const projectId = requiredProjectId(config);
  assertProjectIdentity(
    await get(config, '/api/project/get', {}, timeoutMs),
    projectId,
  );
}

function isIntegerLike(value: unknown): value is string | number {
  return (typeof value === 'string' || typeof value === 'number')
    && Number.isSafeInteger(Number(value));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
