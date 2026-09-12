export type ErrorCode =
  | 'CONFIG_ERROR'
  | 'HTTP_ERROR'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'PROJECT_MISMATCH'
  | 'RESPONSE_ERROR'
  | 'TIMEOUT_ERROR'
  | 'USAGE_ERROR'
  | 'YAPI_ERROR';

export class CliError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super('USAGE_ERROR', message);
  }
}

export class ConfigError extends CliError {
  constructor(message: string) {
    super('CONFIG_ERROR', message);
  }
}
