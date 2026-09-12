export type OutputFormat = 'json' | 'table';

export function writeResult(
  result: Record<string, string>,
  format: OutputFormat,
  write: (text: string) => void,
): void {
  if (format === 'json') {
    write(`${JSON.stringify(result)}\n`);
    return;
  }

  const rows: [string, string][] = [['FIELD', 'VALUE'], ...Object.entries(result)];
  const width = Math.max(...rows.map(([key]) => key.length));
  write(rows.map(([key, value]) => `${key.padEnd(width)}  ${value}`).join('\n') + '\n');
}
