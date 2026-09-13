import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from 'commander';
import {
  deleteProfile,
  getProfile,
  listProfiles,
  normalizeBaseUrl,
  resolveConfig,
  setProfile,
  setProfileToken,
  unsetProfileToken,
} from './config.js';
import type { Profile, ResolvedConfig } from './config.js';
import { CliError, ConfigError, UsageError } from './errors.js';
import { readImportInput, readJsonInput } from './input.js';
import { writeResult } from './output.js';
import type { OutputFormat, Table } from './output.js';
import { YApiQueries } from './queries.js';
import { YApiWrites } from './writes.js';

export interface OutputStreams {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface RemoteOptions {
  baseUrl?: string;
  format: OutputFormat;
  profile?: string;
  projectId?: number;
  timeoutMs?: number;
}

interface ListOptions extends RemoteOptions {
  all?: boolean;
  categoryId?: number;
  limit?: number;
  page?: number;
}

interface JsonInputOptions extends RemoteOptions {
  file?: string;
  stdin?: boolean;
}

interface ImportOptions extends JsonInputOptions {
  allowOverwrite?: boolean;
  merge: 'normal' | 'good' | 'merge';
  type: string;
  url?: string;
}

export async function run(
  argv: string[],
  version: string,
  streams: OutputStreams,
): Promise<number> {
  const program = new Command()
    .name('openyapi')
    .description('A scriptable YApi OpenAPI client.')
    .version(version)
    .addOption(
      new Option('--format <format>', 'result output format')
        .choices(['json', 'table'])
        .default('json'),
    )
    .configureHelp({ showGlobalOptions: true })
    .exitOverride()
    .configureOutput({
      writeOut: streams.stdout,
      writeErr: streams.stderr,
      outputError: () => {},
    });

  program.command('info')
    .description('Show local CLI metadata; does not connect to YApi.')
    .action((_options, command) => {
      writeResult(
        { name: 'openyapi-cli', version, stage: 'sprint2' },
        outputFormat(command),
        streams.stdout,
      );
    });

  configureConfigCommands(program, streams);
  configureQueryCommands(program, streams);
  configureImportCommand(program, streams);
  program.action(() => program.outputHelp());

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return 0;
      writeError(new UsageError(error.message), streams.stderr);
      return 2;
    }
    if (error instanceof CliError) {
      writeError(error, streams.stderr);
      return error.code === 'USAGE_ERROR' ? 2 : 1;
    }
    writeError(new CliError('INTERNAL_ERROR', 'Unexpected CLI failure.'), streams.stderr);
    return 1;
  }
}

function configureImportCommand(program: Command, streams: OutputStreams): void {
  withRemoteOptions(program.command('import').description('Import an API document into YApi.'))
    .option('--file <path>', 'read JSON from a file')
    .option('--stdin', 'read JSON from stdin')
    .option('--url <url>', 'let YApi fetch the document URL')
    .requiredOption('--type <type>', 'server import plugin type', nonEmptyArgument('type'))
    .addOption(new Option('--merge <mode>', 'import merge mode')
      .choices(['normal', 'good', 'merge'])
      .default('normal'))
    .option('--allow-overwrite', 'authorize merge mode overwrites')
    .action(async (_options: unknown, command: Command) => {
      const options = command.optsWithGlobals<ImportOptions>();
      if (options.merge === 'merge' && !options.allowOverwrite) {
        throw new UsageError('--merge merge requires --allow-overwrite.');
      }
      const source = await readImportInput(options);
      const { writes, format } = writeContext(command);
      const result = await writes.importDocument(source, options.type, options.merge);
      writeResult(result, format, streams.stdout);
    });
}

function configureConfigCommands(program: Command, streams: OutputStreams): void {
  const config = program.command('config').description('Manage local profiles.');

  config.command('set <name>')
    .description('Create or update a profile while preserving its stored token.')
    .requiredOption('--base-url <url>', 'YApi base URL', baseUrlArgument)
    .requiredOption('--project-id <id>', 'YApi project ID', positiveIntegerArgument('project-id'))
    .action((name: string, options: { baseUrl: string; projectId: number }, command: Command) => {
      const profile = setProfile(name, { baseUrl: options.baseUrl, projectId: options.projectId });
      writeResult(profileView(name, profile), outputFormat(command), streams.stdout);
    });

  config.command('show [name]')
    .description('Show a profile without revealing its token.')
    .action((name: string = 'default', _options: unknown, command: Command) => {
      const profile = getProfile(name);
      if (!profile) throw new ConfigError(`Profile not found: ${name}`);
      writeResult(profileView(name, profile), outputFormat(command), streams.stdout);
    });

  config.command('list')
    .description('List profiles without revealing tokens.')
    .action((_options, command) => {
      const data = Object.entries(listProfiles())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, profile]) => profileView(name, profile));
      writeResult({ data }, outputFormat(command), streams.stdout, profileTable(data));
    });

  config.command('delete <name>')
    .description('Delete a profile.')
    .action((name: string, _options: unknown, command: Command) => {
      writeResult(
        { profile: name, deleted: deleteProfile(name) },
        outputFormat(command),
        streams.stdout,
      );
    });

  const token = config.command('token').description('Manage a stored profile token.');
  token.command('set [name]')
    .description('Read and store a token from stdin.')
    .requiredOption('--stdin', 'read the token from stdin')
    .action(async (name: string = 'default', _options: unknown, command: Command) => {
      setProfileToken(name, await readStdin());
      writeResult(
        { profile: name, token: 'configured' },
        outputFormat(command),
        streams.stdout,
      );
    });
  token.command('unset [name]')
    .description('Remove a stored token while retaining the profile.')
    .action((name: string = 'default', _options: unknown, command: Command) => {
      writeResult(
        { profile: name, token: 'missing', removed: unsetProfileToken(name) },
        outputFormat(command),
        streams.stdout,
      );
    });
}

function configureQueryCommands(program: Command, streams: OutputStreams): void {
  const project = program.command('project').description('Query YApi projects.');
  withRemoteOptions(project.command('get').description('Get the configured project.'))
    .action(async (_options: unknown, command: Command) => {
      const { queries, format } = queryContext(command, true);
      const data = await queries.project();
      writeResult({ data }, format, streams.stdout, projectTable(data));
    });

  const category = program.command('category').description('Read and write YApi categories.');
  withRemoteOptions(category.command('list').description('List project categories.'))
    .action(async (_options, command) => {
      const { queries, format } = queryContext(command, true);
      const data = await queries.categories();
      writeResult({ data }, format, streams.stdout, categoryTable(data));
    });

  configureJsonWrite(
    category.command('create').description('Create a category from JSON.'),
    streams,
    (writes, payload) => writes.category(payload),
  );

  const interfaceCommand = program.command('interface').description('Query YApi interfaces.');
  withRemoteOptions(
    interfaceCommand.command('get').description('Get an interface.')
      .requiredOption('--id <id>', 'interface ID', positiveIntegerArgument('id')),
  ).action(async (options: { id: number }, command) => {
    const { queries, format } = queryContext(command, false);
    const data = await queries.interface(options.id);
    writeResult({ data }, format, streams.stdout, interfaceTable([data]));
  });

  configureJsonWrite(
    interfaceCommand.command('create').description('Create an interface from JSON.'),
    streams,
    (writes, payload) => writes.createInterface(payload),
  );
  configureJsonWrite(
    interfaceCommand.command('save').description('Create or save an interface by path and method.'),
    streams,
    (writes, payload) => writes.saveInterface(payload),
  );
  configureJsonWrite(
    interfaceCommand.command('update').description('Update an interface by ID.'),
    streams,
    (writes, payload) => writes.updateInterface(payload),
  );

  withRemoteOptions(interfaceCommand.command('list').description('List interfaces.'))
    .option('--category-id <id>', 'category ID', positiveIntegerArgument('category-id'))
    .option('--page <page>', 'page number', positiveIntegerArgument('page'))
    .option('--limit <limit>', 'page size', positiveIntegerArgument('limit'))
    .option('--all', 'read every page from page 1')
    .action(async (_options: unknown, command: Command) => {
      const options = command.optsWithGlobals<ListOptions>();
      if (options.all && options.page !== undefined) {
        throw new UsageError('--all cannot be combined with --page.');
      }
      const { queries, format } = queryContext(command, options.categoryId === undefined);
      const limit = options.limit ?? 10;
      const result = options.all
        ? await queries.all(options.categoryId, limit)
        : await queries.page(options.categoryId, options.page ?? 1, limit);
      writeResult(result, format, streams.stdout, interfaceTable(result.data));
    });

  withRemoteOptions(interfaceCommand.command('tree').description('List categories and interfaces as a tree.'))
    .action(async (_options, command) => {
      const { queries, format } = queryContext(command, true);
      const data = await queries.tree();
      writeResult({ data }, format, streams.stdout, treeTable(data));
    });
}

function withRemoteOptions(command: Command): Command {
  return command
    .option('--profile <name>', 'profile name')
    .option('--base-url <url>', 'YApi base URL', baseUrlArgument)
    .option('--project-id <id>', 'project ID and optional identity preflight', positiveIntegerArgument('project-id'))
    .option('--timeout-ms <ms>', 'per-request timeout in milliseconds', positiveIntegerArgument('timeout-ms'));
}

function withJsonInput(command: Command): Command {
  return command
    .option('--file <path>', 'read JSON from a file')
    .option('--stdin', 'read JSON from stdin');
}

function configureJsonWrite(
  command: Command,
  streams: OutputStreams,
  operation: (writes: YApiWrites, payload: Record<string, unknown>) => Promise<unknown>,
): void {
  withJsonInput(withRemoteOptions(command)).action(async (_options: unknown, actionCommand: Command) => {
    const options = actionCommand.optsWithGlobals<JsonInputOptions>();
    const payload = await readJsonInput(options);
    const { writes, format } = writeContext(actionCommand);
    writeResult(await operation(writes, payload), format, streams.stdout);
  });
}

function queryContext(command: Command, requireProjectId: boolean): {
  format: OutputFormat;
  queries: YApiQueries;
} {
  const options = command.optsWithGlobals<RemoteOptions>();
  const config = resolveConfig(options.profile, configOverrides(options), requireProjectId);
  return {
    format: options.format,
    queries: new YApiQueries(config, options.timeoutMs ?? 30_000),
  };
}

function writeContext(command: Command): {
  format: OutputFormat;
  writes: YApiWrites;
} {
  const options = command.optsWithGlobals<RemoteOptions>();
  const config = resolveConfig(options.profile, configOverrides(options), true);
  return {
    format: options.format,
    writes: new YApiWrites(config, options.timeoutMs ?? 30_000),
  };
}

function configOverrides(options: RemoteOptions): { baseUrl?: string; projectId?: number } {
  const overrides: { baseUrl?: string; projectId?: number } = {};
  if (options.baseUrl !== undefined) overrides.baseUrl = options.baseUrl;
  if (options.projectId !== undefined) overrides.projectId = options.projectId;
  return overrides;
}

function outputFormat(command: Command): OutputFormat {
  return command.optsWithGlobals<{ format: OutputFormat }>().format;
}

function positiveIntegerArgument(name: string): (value: string) => number {
  return (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new InvalidArgumentError(`${name} must be a positive integer.`);
    }
    return parsed;
  };
}

function nonEmptyArgument(name: string): (value: string) => string {
  return (value) => {
    if (!value.trim()) throw new InvalidArgumentError(`${name} must be nonempty.`);
    return value;
  };
}

function baseUrlArgument(value: string): string {
  try {
    return normalizeBaseUrl(value);
  } catch (error) {
    if (error instanceof ConfigError) throw new InvalidArgumentError(error.message);
    throw error;
  }
}

async function readStdin(): Promise<string> {
  let value = '';
  for await (const chunk of process.stdin) value += String(chunk);
  return value.trim();
}

function writeError(error: CliError, write: (text: string) => void): void {
  write(`${JSON.stringify({ error: { code: error.code, message: error.message } })}\n`);
}

function profileView(name: string, profile: Profile): {
  name: string;
  baseUrl: string;
  projectId: number;
  token: string;
} {
  return {
    name,
    baseUrl: profile.baseUrl,
    projectId: profile.projectId,
    token: profile.token ? 'configured' : 'missing',
  };
}

function profileTable(data: ReturnType<typeof profileView>[]): Table {
  return {
    headers: ['NAME', 'BASE URL', 'PROJECT ID', 'TOKEN'],
    rows: data.map((profile) => [profile.name, profile.baseUrl, String(profile.projectId), profile.token]),
  };
}

function projectTable(data: unknown): Table {
  const item = object(data);
  return {
    headers: ['ID', 'NAME', 'BASE PATH', 'TYPE'],
    rows: [[field(item, '_id'), field(item, 'name'), field(item, 'basepath'), field(item, 'project_type')]],
  };
}

function categoryTable(data: unknown[]): Table {
  return {
    headers: ['ID', 'NAME'],
    rows: data.map((value) => {
      const item = object(value);
      return [field(item, '_id'), field(item, 'name')];
    }),
  };
}

function interfaceTable(data: unknown[]): Table {
  return {
    headers: ['ID', 'METHOD', 'PATH', 'TITLE', 'STATUS'],
    rows: data.map((value) => {
      const item = object(value);
      return [
        field(item, '_id', 'id'),
        field(item, 'method'),
        field(item, 'path'),
        field(item, 'title'),
        field(item, 'status'),
      ];
    }),
  };
}

function treeTable(data: unknown[]): Table {
  const rows: string[][] = [];
  for (const category of data) {
    const categoryRecord = object(category);
    const interfaces = Array.isArray(categoryRecord.list) ? categoryRecord.list : [];
    if (interfaces.length === 0) {
      rows.push([field(categoryRecord, '_id'), field(categoryRecord, 'name'), '', '', '', '', '']);
    }
    for (const value of interfaces) {
      const item = object(value);
      rows.push([
        field(categoryRecord, '_id'),
        field(categoryRecord, 'name'),
        field(item, '_id', 'id'),
        field(item, 'method'),
        field(item, 'path'),
        field(item, 'title'),
        field(item, 'status'),
      ]);
    }
  }
  return {
    headers: ['CATEGORY ID', 'CATEGORY', 'INTERFACE ID', 'METHOD', 'PATH', 'TITLE', 'STATUS'],
    rows,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function field(value: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const candidate = value[name];
    if (candidate !== undefined && candidate !== null) return String(candidate);
  }
  return '';
}
