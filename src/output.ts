export type OutputFormat = 'json' | 'table';

export interface Table {
  headers: string[];
  rows: string[][];
}

export function writeResult(
  result: unknown,
  format: OutputFormat,
  write: (text: string) => void,
  table?: Table,
): void {
  if (format === 'json') {
    write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (table) {
    writeTable(table, write);
    return;
  }

  const object = result && typeof result === 'object' && !Array.isArray(result)
    ? result as Record<string, unknown>
    : { value: result };
  writeTable({
    headers: ['FIELD', 'VALUE'],
    rows: Object.entries(object).map(([key, value]) => [key, display(value)]),
  }, write);
}

function writeTable(table: Table, write: (text: string) => void): void {
  const rows = [table.headers, ...table.rows];
  const widths = table.headers.map((_, column) => Math.max(
    ...rows.map((row) => (row[column] ?? '').length),
  ));
  write(`${rows.map((row) => row.map((cell, column) => (
    column === row.length - 1 ? cell : cell.padEnd(widths[column] ?? cell.length)
  )).join('  ')).join('\n')}\n`);
}

function display(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? '';
}
