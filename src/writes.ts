import { get, post } from './client.js';
import type { WriteResult } from './client.js';
import type { ResolvedConfig } from './config.js';
import { CliError, UsageError } from './errors.js';
import type { ImportSource } from './input.js';

export class YApiWrites {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly timeoutMs: number,
  ) {}

  async category(payload: Record<string, unknown>): Promise<WriteResult> {
    requireNonEmptyString(payload, 'name');
    if (payload.desc !== undefined && typeof payload.desc !== 'string') {
      throw new UsageError('Field desc must be a string.');
    }
    const body = this.writePayload(payload);
    await this.preflightProject();
    return post(this.config, '/api/interface/add_cat', body, this.timeoutMs);
  }

  async createInterface(payload: Record<string, unknown>): Promise<WriteResult> {
    validateInterfaceCreation(payload);
    const body = this.writePayload(payload);
    await this.preflightProject();
    return post(this.config, '/api/interface/add', body, this.timeoutMs);
  }

  async saveInterface(payload: Record<string, unknown>): Promise<WriteResult> {
    validateInterfaceCreation(payload);
    const body = this.writePayload(payload);
    await this.preflightProject();
    return post(this.config, '/api/interface/save', body, this.timeoutMs);
  }

  async updateInterface(payload: Record<string, unknown>): Promise<WriteResult> {
    if (!isPositiveIntegerLike(payload.id)) {
      throw new UsageError('Field id must be a positive integer.');
    }
    const body = this.writePayload(payload);
    const projectId = requiredProjectId(this.config);
    await this.preflightProject();
    const target = record(await get(
      this.config,
      '/api/interface/get',
      { id: Number(payload.id) },
      this.timeoutMs,
    ));
    if (!target || !isIntegerLike(target.project_id)) {
      throw new CliError('RESPONSE_ERROR', 'YApi returned an interface without a project_id.');
    }
    if (Number(target.project_id) !== projectId) {
      throw new CliError(
        'PROJECT_MISMATCH',
        `Target interface does not belong to configured project ${projectId}.`,
      );
    }
    return post(this.config, '/api/interface/up', body, this.timeoutMs);
  }

  async importDocument(
    source: ImportSource,
    type: string,
    merge: 'normal' | 'good' | 'merge',
  ): Promise<WriteResult> {
    const projectId = requiredProjectId(this.config);
    const body: Record<string, unknown> = {
      type,
      merge,
      project_id: projectId,
      ...('url' in source ? { url: source.url } : { json: JSON.stringify(source.document) }),
    };
    await this.preflightProject();
    return post(this.config, '/api/open/import_data', body, this.timeoutMs);
  }

  private writePayload(payload: Record<string, unknown>): Record<string, unknown> {
    if (Object.hasOwn(payload, 'token')) {
      throw new UsageError('Field token is not allowed in write input.');
    }
    const projectId = requiredProjectId(this.config);
    if (payload.project_id !== undefined
      && (!isIntegerLike(payload.project_id) || Number(payload.project_id) !== projectId)) {
      throw new CliError(
        'PROJECT_MISMATCH',
        `Input project_id does not match configured project ${projectId}.`,
      );
    }
    return { ...payload, project_id: projectId };
  }

  private async preflightProject(): Promise<void> {
    const projectId = requiredProjectId(this.config);
    const project = await get(this.config, '/api/project/get', {}, this.timeoutMs);
    const actual = record(project)?._id;
    if (!isIntegerLike(actual) || Number(actual) !== projectId) {
      throw new CliError(
        'PROJECT_MISMATCH',
        `Authenticated project does not match configured project ${projectId}.`,
      );
    }
  }
}

function requiredProjectId(config: ResolvedConfig): number {
  if (config.projectId === undefined) {
    throw new CliError('CONFIG_ERROR', 'Missing project ID configuration.');
  }
  return config.projectId;
}

function requireNonEmptyString(payload: Record<string, unknown>, field: string): void {
  const value = payload[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new UsageError(`Field ${field} must be a nonempty string.`);
  }
}

function validateInterfaceCreation(payload: Record<string, unknown>): void {
  if (Object.hasOwn(payload, 'id')) {
    throw new UsageError('Field id is not allowed for interface create or save.');
  }
  for (const field of ['title', 'path', 'method']) requireNonEmptyString(payload, field);
  if (!isPositiveIntegerLike(payload.catid)) {
    throw new UsageError('Field catid must be a positive integer.');
  }
}

function isIntegerLike(value: unknown): value is string | number {
  return (typeof value === 'string' || typeof value === 'number')
    && Number.isSafeInteger(Number(value));
}

function isPositiveIntegerLike(value: unknown): value is string | number {
  return isIntegerLike(value) && Number(value) > 0;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
