import { readFile } from 'node:fs/promises';
import { UsageError } from './errors.js';

export interface JsonInputOptions {
  file?: string;
  stdin?: boolean;
}

export interface ImportInputOptions extends JsonInputOptions {
  url?: string;
}

export type ImportSource = { document: unknown } | { url: string };

export async function readJsonInput(options: JsonInputOptions): Promise<Record<string, unknown>> {
  if (Boolean(options.file) === Boolean(options.stdin)) {
    throw new UsageError('Exactly one of --file or --stdin is required.');
  }

  const value = await readJsonValue(options);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageError('JSON input must be an object.');
  }
  return value as Record<string, unknown>;
}

export async function readImportInput(options: ImportInputOptions): Promise<ImportSource> {
  const sourceCount = Number(Boolean(options.file)) + Number(Boolean(options.stdin)) + Number(Boolean(options.url));
  if (sourceCount !== 1) {
    throw new UsageError('Exactly one of --file, --stdin, or --url is required.');
  }
  if (options.url) return { url: options.url };
  return { document: await readJsonValue(options) };
}

async function readJsonValue(options: JsonInputOptions): Promise<unknown> {
  let bytes: Buffer;
  try {
    bytes = options.file ? await readFile(options.file) : await readStdinBytes();
  } catch {
    throw new UsageError('Unable to read the selected JSON input.');
  }

  let source: string;
  try {
    source = decodeJsonBytes(bytes);
  } catch {
    throw new UsageError('JSON input must be UTF-8 or BOM-marked UTF-16LE.');
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new UsageError('JSON input is malformed.');
  }
  return value;
}

function decodeJsonBytes(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) throw new TypeError('unsupported encoding');
  const offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset));
}

async function readStdinBytes(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
