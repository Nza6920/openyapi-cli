import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const remoteEnvironmentNames = [
  'OPENYAPI_BASE_URL',
  'OPENYAPI_PROFILE',
  'OPENYAPI_PROJECT_ID',
  'OPENYAPI_TOKEN',
];

function isolatedEnvironment(configHome, overrides = {}) {
  const environment = { ...process.env, XDG_CONFIG_HOME: configHome };
  for (const name of remoteEnvironmentNames) delete environment[name];
  return { ...environment, ...overrides };
}

function invoke(args, { env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function fixture(handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://fixture.invalid');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const recorded = {
      method: request.method,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: body.length === 0 ? undefined : JSON.parse(body.toString('utf8')),
    };
    requests.push(recorded);
    await handler({ request, response, url, requests, recorded });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function json(response, body, status = 200, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

function remoteEnvironment(configHome, baseUrl) {
  return isolatedEnvironment(configHome, {
    OPENYAPI_BASE_URL: baseUrl,
    OPENYAPI_PROJECT_ID: '41',
    OPENYAPI_TOKEN: 'secret-token',
  });
}

test('category create decodes a UTF-8 BOM file and sends one authenticated write after preflight', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const inputDirectory = await mkdtemp(join(tmpdir(), 'openyapi input '));
  const inputPath = join(inputDirectory, '中文 category.json');
  await writeFile(inputPath, Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify({ name: '用户', desc: '中文描述' })),
  ]));
  const server = await fixture(({ response, recorded }) => {
    if (recorded.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: 41 } });
    } else {
      json(response, {
        errcode: 0,
        errmsg: 'created secret-token',
        data: { _id: 7, name: '用户' },
      });
    }
  });
  try {
    const result = await invoke(['category', 'create', '--file', inputPath], {
      env: remoteEnvironment(configHome, server.baseUrl),
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      data: { _id: 7, name: '用户' },
      message: 'created [REDACTED]',
    });
    assert.deepEqual(server.requests, [
      {
        method: 'GET',
        pathname: '/api/project/get',
        query: { token: 'secret-token' },
        body: undefined,
      },
      {
        method: 'POST',
        pathname: '/api/interface/add_cat',
        query: {},
        body: {
          name: '用户',
          desc: '中文描述',
          project_id: 41,
          token: 'secret-token',
        },
      },
    ]);
    assert.doesNotMatch(result.stdout + result.stderr, /secret-token/);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
    await rm(inputDirectory, { recursive: true, force: true });
  }
});

test('interface create accepts BOM-marked UTF-16LE stdin and preserves business fields', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    if (recorded.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: '41' } });
    } else {
      json(response, { errcode: 0, data: { _id: 8 }, errmsg: 'success' });
    }
  });
  const payload = {
    title: '新增用户',
    path: '/users',
    method: 'POST',
    catid: 7,
    req_body_other: '{"name":"张三"}',
  };
  const input = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(JSON.stringify(payload), 'utf16le'),
  ]);
  try {
    const result = await invoke(['interface', 'create', '--stdin'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input,
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { data: { _id: 8 }, message: 'success' });
    assert.deepEqual(server.requests.map(({ method, pathname, query, body }) => ({
      method, pathname, query, body,
    })), [
      { method: 'GET', pathname: '/api/project/get', query: { token: 'secret-token' }, body: undefined },
      {
        method: 'POST',
        pathname: '/api/interface/add',
        query: {},
        body: { ...payload, project_id: 41, token: 'secret-token' },
      },
    ]);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('interface save maps to the save endpoint and preserves its pre-update response', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    if (recorded.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: 41 } });
    } else {
      json(response, {
        errcode: 0,
        errmsg: 'saved',
        data: [{ _id: 8, res_body: '{"before":true}' }],
      });
    }
  });
  const payload = { title: 'Save user', path: '/users', method: 'PUT', catid: 7 };
  try {
    const result = await invoke(['interface', 'save', '--stdin'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input: JSON.stringify(payload),
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      data: [{ _id: 8, res_body: '{"before":true}' }],
      message: 'saved',
    });
    assert.equal(server.requests[1].pathname, '/api/interface/save');
    assert.deepEqual(server.requests[1].body, {
      ...payload, project_id: 41, token: 'secret-token',
    });
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('interface update verifies project and target ownership before posting partial fields', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    if (recorded.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: 41 } });
    } else if (recorded.pathname === '/api/interface/get') {
      json(response, { errcode: 0, data: { _id: 8, project_id: '41' } });
    } else {
      json(response, { errcode: 0, data: true, errmsg: 'updated' });
    }
  });
  const payload = { id: 8, title: '更新标题', status: 'done' };
  try {
    const result = await invoke(['interface', 'update', '--stdin'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input: JSON.stringify(payload),
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { data: true, message: 'updated' });
    assert.deepEqual(server.requests, [
      { method: 'GET', pathname: '/api/project/get', query: { token: 'secret-token' }, body: undefined },
      { method: 'GET', pathname: '/api/interface/get', query: { token: 'secret-token', id: '8' }, body: undefined },
      {
        method: 'POST',
        pathname: '/api/interface/up',
        query: {},
        body: { ...payload, project_id: 41, token: 'secret-token' },
      },
    ]);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('import serializes a local JSON document inside the YApi request envelope', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    if (recorded.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: 41 } });
    } else {
      json(response, { errcode: 0, data: null, errmsg: '2 interfaces imported' });
    }
  });
  const document = {
    swagger: '2.0',
    token: 'document-token-is-business-data',
    paths: { '/users': { get: {} } },
  };
  try {
    const result = await invoke(['import', '--stdin', '--type', 'swagger'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input: JSON.stringify(document),
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { data: null, message: '2 interfaces imported' });
    assert.deepEqual(server.requests[1], {
      method: 'POST',
      pathname: '/api/open/import_data',
      query: {},
      body: {
        type: 'swagger',
        merge: 'normal',
        json: JSON.stringify(document),
        project_id: 41,
        token: 'secret-token',
      },
    });
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('local write validation rejects ambiguous, unsafe, malformed, and unsupported input without HTTP', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const inputDirectory = await mkdtemp(join(tmpdir(), 'openyapi-invalid-'));
  const validPath = join(inputDirectory, 'valid.json');
  const malformedPath = join(inputDirectory, 'malformed.json');
  const utf16bePath = join(inputDirectory, 'utf16be.json');
  await writeFile(validPath, JSON.stringify({ name: 'Users' }));
  await writeFile(malformedPath, '{"secret-content":');
  await writeFile(utf16bePath, Buffer.from([0xfe, 0xff, 0x00, 0x7b, 0x00, 0x7d]));
  const server = await fixture(({ response }) => json(response, { errcode: 0, data: { _id: 41 } }));
  const env = remoteEnvironment(configHome, server.baseUrl);
  const cases = [
    { args: ['category', 'create'], code: 'USAGE_ERROR' },
    { args: ['category', 'create', '--file', validPath, '--stdin'], input: '{}', code: 'USAGE_ERROR' },
    { args: ['category', 'create', '--file', malformedPath], code: 'USAGE_ERROR' },
    { args: ['category', 'create', '--file', utf16bePath], code: 'USAGE_ERROR' },
    { args: ['category', 'create', '--stdin'], input: '[]', code: 'USAGE_ERROR' },
    { args: ['category', 'create', '--stdin'], input: '{}', code: 'USAGE_ERROR' },
    { args: ['category', 'create', '--stdin'], input: '{"name":"Users","desc":7}', code: 'USAGE_ERROR' },
    { args: ['category', 'create', '--stdin'], input: '{"name":"Users","token":"payload-secret"}', code: 'USAGE_ERROR' },
    { args: ['category', 'create', '--stdin'], input: '{"name":"Users","project_id":99}', code: 'PROJECT_MISMATCH' },
    { args: ['interface', 'create', '--stdin'], input: '{"title":"T","path":"/x","method":"GET"}', code: 'USAGE_ERROR' },
    { args: ['interface', 'save', '--stdin'], input: '{"id":8,"title":"T","path":"/x","method":"GET","catid":7}', code: 'USAGE_ERROR' },
    { args: ['interface', 'update', '--stdin'], input: '{"title":"T"}', code: 'USAGE_ERROR' },
    { args: ['import', '--file', validPath, '--url', 'https://example.test/openapi.json', '--type', 'swagger'], code: 'USAGE_ERROR' },
    { args: ['import', '--stdin', '--type', 'swagger', '--merge', 'merge'], input: '{}', code: 'USAGE_ERROR' },
  ];

  try {
    for (const scenario of cases) {
      const result = await invoke(scenario.args, { env, input: scenario.input });
      assert.equal(result.stdout, '', JSON.stringify({ scenario, result }));
      assert.equal(JSON.parse(result.stderr).error.code, scenario.code, JSON.stringify({ scenario, result }));
      assert.doesNotMatch(result.stderr, /secret-content|payload-secret/);
    }
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
    await rm(inputDirectory, { recursive: true, force: true });
  }
});

test('interface update refuses a target owned by another project without posting', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    json(response, {
      errcode: 0,
      data: recorded.pathname === '/api/project/get'
        ? { _id: 41 }
        : { _id: 8, project_id: 99 },
    });
  });
  try {
    const result = await invoke(['interface', 'update', '--stdin'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input: '{"id":8,"title":"Wrong target"}',
    });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'PROJECT_MISMATCH');
    assert.deepEqual(server.requests.map(({ method, pathname }) => ({ method, pathname })), [
      { method: 'GET', pathname: '/api/project/get' },
      { method: 'GET', pathname: '/api/interface/get' },
    ]);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('write project preflight mismatch prevents the POST', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response }) => {
    json(response, { errcode: 0, data: { _id: 99 } });
  });
  try {
    const result = await invoke(['category', 'create', '--stdin'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input: '{"name":"Users"}',
    });

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'PROJECT_MISMATCH');
    assert.deepEqual(server.requests.map(({ method, pathname }) => ({ method, pathname })), [
      { method: 'GET', pathname: '/api/project/get' },
    ]);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('write table output presents both server data and an empty default message', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    json(response, {
      errcode: 0,
      data: recorded.pathname === '/api/project/get' ? { _id: 41 } : { _id: 7, name: 'Users' },
    });
  });
  try {
    const result = await invoke(['category', 'create', '--stdin', '--format', 'table'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input: '{"name":"Users"}',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /FIELD\s+VALUE/);
    assert.match(result.stdout, /data\s+\{"_id":7,"name":"Users"\}/);
    assert.match(result.stdout, /message\s*\n/);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('unsupported import plugin errors remain server-owned business failures', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    if (recorded.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: 41 } });
    } else {
      json(response, { errcode: 40022, errmsg: 'unsupported plugin' });
    }
  });
  try {
    const result = await invoke(['import', '--stdin', '--type', 'instance-plugin'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input: '{}',
    });

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'YAPI_ERROR');
    assert.equal(server.requests.filter(({ method }) => method === 'POST').length, 1);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('duplicate interface create preserves the YApi business error and sends one POST', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    if (recorded.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: 41 } });
    } else {
      json(response, { errcode: 40022, errmsg: 'interface already exists' });
    }
  });
  try {
    const result = await invoke(['interface', 'create', '--stdin'], {
      env: remoteEnvironment(configHome, server.baseUrl),
      input: '{"title":"Duplicate","path":"/duplicate","method":"GET","catid":7}',
    });

    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stderr), {
      error: { code: 'YAPI_ERROR', message: 'interface already exists' },
    });
    assert.equal(server.requests.filter(({ method }) => method === 'POST').length, 1);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('interface update stops when target details fail or omit ownership', async (t) => {
  const scenarios = [
    {
      name: 'target lookup business error',
      code: 'YAPI_ERROR',
      target: { errcode: 400, errmsg: 'missing interface' },
    },
    {
      name: 'target missing project ID',
      code: 'RESPONSE_ERROR',
      target: { errcode: 0, data: { _id: 8 } },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
      const server = await fixture(({ response, recorded }) => {
        json(response, recorded.pathname === '/api/project/get'
          ? { errcode: 0, data: { _id: 41 } }
          : scenario.target);
      });
      try {
        const result = await invoke(['interface', 'update', '--stdin'], {
          env: remoteEnvironment(configHome, server.baseUrl),
          input: '{"id":8,"title":"Unavailable target"}',
        });
        assert.equal(result.status, 1);
        assert.equal(JSON.parse(result.stderr).error.code, scenario.code);
        assert.equal(server.requests.filter(({ method }) => method === 'POST').length, 0);
      } finally {
        await server.close();
        await rm(configHome, { recursive: true, force: true });
      }
    });
  }
});

test('import accepts a JSON file as the source for an explicit mode', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const inputDirectory = await mkdtemp(join(tmpdir(), 'openyapi-import-'));
  const inputPath = join(inputDirectory, 'API document.json');
  const document = { swagger: '2.0', paths: { '/file': { get: {} } } };
  await writeFile(inputPath, JSON.stringify(document));
  const server = await fixture(({ response, recorded }) => {
    json(response, {
      errcode: 0,
      data: recorded.pathname === '/api/project/get' ? { _id: 41 } : null,
      errmsg: 'success',
    });
  });
  try {
    const result = await invoke(['import', '--file', inputPath, '--type', 'swagger', '--merge', 'good'], {
      env: remoteEnvironment(configHome, server.baseUrl),
    });

    assert.equal(result.status, 0);
    assert.equal(server.requests[1].body.json, JSON.stringify(document));
    assert.equal(server.requests[1].body.merge, 'good');
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
    await rm(inputDirectory, { recursive: true, force: true });
  }
});

test('import supports server-fetched URLs and explicit good and authorized merge modes', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, recorded }) => {
    json(response, {
      errcode: 0,
      data: recorded.pathname === '/api/project/get' ? { _id: 41 } : null,
      errmsg: recorded.pathname === '/api/project/get' ? undefined : 'imported',
    });
  });
  try {
    const env = remoteEnvironment(configHome, server.baseUrl);
    const fromUrl = await invoke([
      'import', '--url', 'https://yapi-network.example/spec.json', '--type', 'swagger', '--merge', 'good',
    ], { env });
    const merge = await invoke([
      'import', '--stdin', '--type', 'swagger', '--merge', 'merge', '--allow-overwrite',
    ], { env, input: '{"swagger":"2.0"}' });

    assert.equal(fromUrl.status, 0);
    assert.equal(merge.status, 0);
    const posts = server.requests.filter(({ method }) => method === 'POST');
    assert.deepEqual(posts.map(({ body }) => body), [
      {
        type: 'swagger',
        merge: 'good',
        url: 'https://yapi-network.example/spec.json',
        project_id: 41,
        token: 'secret-token',
      },
      {
        type: 'swagger',
        merge: 'merge',
        json: '{"swagger":"2.0"}',
        project_id: 41,
        token: 'secret-token',
      },
    ]);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('write transport and protocol failures are stable, redacted, and never retried', async (t) => {
  const scenarios = [
    {
      name: 'HTTP status',
      code: 'HTTP_ERROR',
      respond: ({ response }) => json(response, { message: 'no' }, 503),
    },
    {
      name: 'business error',
      code: 'YAPI_ERROR',
      respond: ({ response }) => json(response, { errcode: 40022, errmsg: 'duplicate secret-token' }),
    },
    {
      name: 'invalid JSON',
      code: 'RESPONSE_ERROR',
      respond: ({ response }) => response.end('invalid secret-token'),
    },
    {
      name: 'malformed envelope',
      code: 'RESPONSE_ERROR',
      respond: ({ response }) => json(response, { data: {} }),
    },
    {
      name: 'missing data',
      code: 'RESPONSE_ERROR',
      respond: ({ response }) => json(response, { errcode: 0, errmsg: 'ok' }),
    },
    {
      name: 'redirect',
      code: 'HTTP_ERROR',
      respond: ({ response }) => {
        response.writeHead(302, { location: '/elsewhere?token=secret-token' });
        response.end();
      },
    },
    {
      name: 'disconnected response',
      code: 'NETWORK_ERROR',
      unknown: true,
      respond: ({ response }) => response.destroy(),
    },
    {
      name: 'timeout',
      code: 'TIMEOUT_ERROR',
      unknown: true,
      timeout: 1_000,
      respond: async ({ response }) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        json(response, { errcode: 0, data: { _id: 7 } });
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
      const server = await fixture(async (context) => {
        if (context.recorded.pathname === '/api/project/get') {
          json(context.response, { errcode: 0, data: { _id: 41 } });
        } else {
          await scenario.respond(context);
        }
      });
      try {
        const args = ['category', 'create', '--stdin'];
        if (scenario.timeout) args.push('--timeout-ms', String(scenario.timeout));
        const result = await invoke(args, {
          env: remoteEnvironment(configHome, server.baseUrl),
          input: '{"name":"Users"}',
        });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, '');
        assert.equal(JSON.parse(result.stderr).error.code, scenario.code);
        assert.equal(server.requests.filter(({ method }) => method === 'POST').length, 1);
        assert.doesNotMatch(result.stderr, /secret-token/);
        if (scenario.unknown) assert.match(JSON.parse(result.stderr).error.message, /result is unknown/i);
      } finally {
        await server.close();
        await rm(configHome, { recursive: true, force: true });
      }
    });
  }
});
