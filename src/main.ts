#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { run } from './cli.js';

const metadata: { version: string } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

process.exitCode = await run(process.argv, metadata.version, {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
