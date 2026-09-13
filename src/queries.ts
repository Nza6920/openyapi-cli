import { get } from './client.js';
import type { ResolvedConfig } from './config.js';
import { CliError } from './errors.js';
import { assertProjectIdentity, preflightProject, requiredProjectId } from './project-identity.js';

export interface PageResult {
  data: unknown[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AllPagesResult {
  data: unknown[];
  pagination: {
    limit: number;
    totalItems: number;
    totalPages: number;
    pagesFetched: number;
  };
}

interface PaginationData {
  count: number;
  total: number;
  list: unknown[];
}

export class YApiQueries {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly timeoutMs: number,
  ) {}

  async project(): Promise<unknown> {
    const projectId = requiredProjectId(this.config);
    const project = await get(this.config, '/api/project/get', {}, this.timeoutMs);
    assertProjectIdentity(project, projectId);
    return project;
  }

  async categories(): Promise<unknown[]> {
    const projectId = requiredProjectId(this.config);
    await preflightProject(this.config, this.timeoutMs);
    return requireArray(
      await get(this.config, '/api/interface/getCatMenu', { project_id: projectId }, this.timeoutMs),
      'category list',
    );
  }

  async interface(id: number): Promise<unknown> {
    await this.preflightProjectIfConfigured();
    return get(this.config, '/api/interface/get', { id }, this.timeoutMs);
  }

  async tree(): Promise<unknown[]> {
    const projectId = requiredProjectId(this.config);
    await preflightProject(this.config, this.timeoutMs);
    return requireArray(
      await get(this.config, '/api/interface/list_menu', { project_id: projectId }, this.timeoutMs),
      'interface tree',
    );
  }

  async page(categoryId: number | undefined, page: number, limit: number): Promise<PageResult> {
    const endpoint = this.listEndpoint(categoryId);
    await this.preflightProjectIfConfigured();
    const data = paginationData(await get(
      this.config,
      endpoint.path,
      { ...endpoint.params, page, limit },
      this.timeoutMs,
    ));
    validatePage(data, page, limit);
    return {
      data: data.list,
      pagination: {
        page,
        limit,
        totalItems: data.count,
        totalPages: data.total,
      },
    };
  }

  async all(categoryId: number | undefined, limit: number): Promise<AllPagesResult> {
    const endpoint = this.listEndpoint(categoryId);
    await this.preflightProjectIfConfigured();
    const collected: unknown[] = [];
    const identifiers = new Set<string>();
    let expectedCount: number | undefined;
    let expectedPages: number | undefined;
    let page = 1;

    while (true) {
      const current = paginationData(await get(
        this.config,
        endpoint.path,
        { ...endpoint.params, page, limit },
        this.timeoutMs,
      ));
      validatePage(current, page, limit);
      if (expectedCount === undefined) {
        expectedCount = current.count;
        expectedPages = current.total;
        if (expectedPages !== Math.ceil(expectedCount / limit)) {
          throw protocolError('Pagination total does not match count and limit.');
        }
      } else if (current.count !== expectedCount || current.total !== expectedPages) {
        throw protocolError('Pagination totals changed during full retrieval.');
      }

      if (current.list.length === 0 && collected.length < expectedCount) {
        throw protocolError('Pagination ended before all items were returned.');
      }
      for (const item of current.list) {
        const identifier = itemIdentifier(item);
        if (identifiers.has(identifier)) {
          throw protocolError(`Pagination returned duplicate interface ID ${identifier}.`);
        }
        identifiers.add(identifier);
        collected.push(item);
      }

      if (collected.length > expectedCount) {
        throw protocolError('Pagination returned more items than count.');
      }
      if (collected.length === expectedCount) break;
      if (page >= expectedPages) {
        throw protocolError('Pagination item count does not match the declared total.');
      }
      page += 1;
    }

    return {
      data: collected,
      pagination: {
        limit,
        totalItems: expectedCount,
        totalPages: expectedPages ?? 0,
        pagesFetched: page,
      },
    };
  }

  private listEndpoint(categoryId: number | undefined): {
    path: string;
    params: Record<string, number>;
  } {
    if (categoryId !== undefined) {
      return { path: '/api/interface/list_cat', params: { catid: categoryId } };
    }
    return {
      path: '/api/interface/list',
      params: { project_id: requiredProjectId(this.config) },
    };
  }

  private async preflightProjectIfConfigured(): Promise<void> {
    if (this.config.projectId !== undefined) await preflightProject(this.config, this.timeoutMs);
  }
}

function paginationData(value: unknown): PaginationData {
  const candidate = record(value);
  if (!candidate
    || !Number.isSafeInteger(candidate.count)
    || !Number.isSafeInteger(candidate.total)
    || (candidate.count as number) < 0
    || (candidate.total as number) < 0
    || !Array.isArray(candidate.list)) {
    throw protocolError('YApi returned an invalid pagination response.');
  }
  return {
    count: candidate.count as number,
    total: candidate.total as number,
    list: candidate.list,
  };
}

function validatePage(data: PaginationData, page: number, limit: number): void {
  if (data.total !== Math.ceil(data.count / limit)) {
    throw protocolError('Pagination total does not match count and limit.');
  }
  const expectedItems = page > data.total
    ? 0
    : page < data.total
      ? limit
      : data.count - ((page - 1) * limit);
  if (data.list.length !== expectedItems) {
    throw protocolError('Pagination page size is inconsistent with count, total, page, and limit.');
  }
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw protocolError(`YApi returned an invalid ${label} response.`);
  }
  return value;
}

function itemIdentifier(value: unknown): string {
  const candidate = record(value);
  const identifier = candidate?._id ?? candidate?.id;
  if (typeof identifier !== 'number' && typeof identifier !== 'string') {
    throw protocolError('Paginated interface is missing an ID.');
  }
  return String(identifier);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function protocolError(message: string): CliError {
  return new CliError('RESPONSE_ERROR', message);
}
