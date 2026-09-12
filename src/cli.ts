import { Command, CommanderError, Option } from 'commander';
import { writeResult } from './output.js';
import type { OutputFormat } from './output.js';

export interface OutputStreams {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export async function run(
  argv: string[],
  version: string,
  streams: OutputStreams,
): Promise<number> {
  const program = new Command()
    .name('openyapi')
    .description('A scriptable YApi OpenAPI client (initial scaffold).')
    .version(version)
    .addOption(
      new Option('--format <format>', 'result output format')
        .choices(['json', 'table'])
        .default('json'),
    )
    .exitOverride()
    .configureOutput({
      writeOut: streams.stdout,
      writeErr: streams.stderr,
      outputError: () => {},
    });

  program
    .command('info')
    .description('Show local CLI metadata; does not connect to YApi.')
    .action(() => {
      const { format } = program.opts<{ format: OutputFormat }>();
      writeResult(
        { name: 'openyapi-cli', version, stage: 'scaffold' },
        format,
        streams.stdout,
      );
    });

  program.action(() => program.outputHelp());

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return 0;
      streams.stderr(`${JSON.stringify({
        error: { code: 'USAGE_ERROR', message: error.message },
      })}\n`);
      return 2;
    }
    streams.stderr(`${JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected CLI failure.' },
    })}\n`);
    return 1;
  }
}
