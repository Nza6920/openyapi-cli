import { appendFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const [portFile, recordFile] = process.argv.slice(2);
if (!portFile || !recordFile) throw new Error('Expected port and record file paths.');

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid');
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  await appendFile(recordFile, `${JSON.stringify({
    method: request.method,
    pathname: url.pathname,
    body: bytes.length === 0 ? null : JSON.parse(bytes.toString('utf8')),
  })}\n`);

  const data = url.pathname === '/api/project/get'
    ? { _id: 41 }
    : url.pathname === '/api/interface/get'
      ? { _id: 8, project_id: 41 }
      : url.pathname === '/api/open/import_data'
        ? null
        : { _id: 8 };
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ errcode: 0, errmsg: 'success', data }));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Fixture failed to listen.');
await writeFile(portFile, String(address.port));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
