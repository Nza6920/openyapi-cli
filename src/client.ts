import type { ResolvedConfig } from './config.js';
import { CliError } from './errors.js';

interface YApiEnvelope {
  data?: unknown;
  errcode: number;
  errmsg?: unknown;
}

interface SuccessfulEnvelope extends YApiEnvelope {
  data: unknown;
}

export interface WriteResult {
  data: unknown;
  message: string;
}

export async function get(
  config: ResolvedConfig,
  path: string,
  params: Readonly<Record<string, string | number>>,
  timeoutMs: number,
): Promise<unknown> {
  const url = buildUrl(config, path, params);
  const body = await request(config, url, { method: 'GET' }, timeoutMs, false);
  return redactValue(body.data, config.token);
}

export async function post(
  config: ResolvedConfig,
  path: string,
  payload: Readonly<Record<string, unknown>>,
  timeoutMs: number,
): Promise<WriteResult> {
  const body = await request(
    config,
    new URL(`${config.baseUrl}${path}`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, token: config.token }),
    },
    timeoutMs,
    true,
  );
  return {
    data: redactValue(body.data, config.token),
    message: typeof body.errmsg === 'string' ? redact(body.errmsg, config.token) : '',
  };
}

async function request(
  config: ResolvedConfig,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  write: boolean,
): Promise<SuccessfulEnvelope> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, redirect: 'manual', signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      throw new CliError('HTTP_ERROR', `YApi returned an unsupported redirect (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new CliError('HTTP_ERROR', `YApi returned HTTP ${response.status}.`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CliError('RESPONSE_ERROR', 'YApi returned invalid JSON.');
    }
    if (!isEnvelope(body)) {
      throw new CliError('RESPONSE_ERROR', 'YApi returned an invalid response envelope.');
    }
    if (body.errcode !== 0) {
      const message = typeof body.errmsg === 'string'
        ? redact(body.errmsg, config.token)
        : `YApi returned business error ${body.errcode}.`;
      throw new CliError('YAPI_ERROR', message);
    }
    if (!Object.hasOwn(body, 'data')) {
      throw new CliError('RESPONSE_ERROR', 'YApi response is missing data.');
    }
    return body as SuccessfulEnvelope;
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (isAbortError(error)) {
      const message = write
        ? `YApi write request timed out after ${timeoutMs} ms; the result is unknown.`
        : `YApi request timed out after ${timeoutMs} ms.`;
      throw new CliError('TIMEOUT_ERROR', message);
    }
    const message = write
      ? 'Unable to confirm the YApi write result; the result is unknown.'
      : 'Unable to reach YApi.';
    throw new CliError('NETWORK_ERROR', message);
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(
  config: ResolvedConfig,
  path: string,
  params: Readonly<Record<string, string | number>>,
): URL {
  const url = new URL(`${config.baseUrl}${path}`);
  url.searchParams.set('token', config.token);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }
  return url;
}

function isEnvelope(value: unknown): value is YApiEnvelope {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { errcode?: unknown }).errcode === 'number';
}

function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError';
}

function redact(message: string, secret: string): string {
  if (!secret) return message;
  return [secret, encodeURIComponent(secret)]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .reduce((redacted, value) => redacted.split(value).join('[REDACTED]'), message);
}

function redactValue(value: unknown, secret: string): unknown {
  if (typeof value === 'string') return redact(value, secret);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secret));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    redact(key, secret),
    redactValue(item, secret),
  ]));
}
