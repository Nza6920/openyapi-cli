import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const openyapiEnvironmentNames = [
  'OPENYAPI_BASE_URL',
  'OPENYAPI_PROFILE',
  'OPENYAPI_PROJECT_ID',
  'OPENYAPI_TOKEN',
];

function isolatedEnvironment(configHome, overrides = {}) {
  const environment = { ...process.env, XDG_CONFIG_HOME: configHome };
  for (const name of openyapiEnvironmentNames) delete environment[name];
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
    requests.push({ method: request.method, pathname: url.pathname, query: Object.fromEntries(url.searchParams) });
    await handler({ request, response, url, requests });
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

test('project get uses environment-only token authentication and preserves project data', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response }) => {
    json(response, { errcode: 0, errmsg: 'success', data: { _id: 41, name: 'Docs', private: true } });
  });
  try {
    const result = await invoke(['project', 'get'], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: server.baseUrl,
        OPENYAPI_PROJECT_ID: '41',
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      data: { _id: 41, name: 'Docs', private: true },
    });
    assert.deepEqual(server.requests, [{
      method: 'GET',
      pathname: '/api/project/get',
      query: { token: 'secret-token', id: '41' },
    }]);
    assert.doesNotMatch(result.stdout + result.stderr, /secret-token/);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('project get validates command values before sending a request', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response }) => json(response, { errcode: 0, data: {} }));
  try {
    for (const args of [
      ['project', 'get', '--project-id', '0'],
      ['project', 'get', '--project-id', '1.5'],
      ['project', 'get', '--timeout-ms', '0'],
      ['project', 'get', '--timeout-ms', 'later'],
    ]) {
      const result = await invoke(args, {
        env: isolatedEnvironment(configHome, {
          OPENYAPI_BASE_URL: server.baseUrl,
          OPENYAPI_PROJECT_ID: '41',
          OPENYAPI_TOKEN: 'secret-token',
        }),
      });
      assert.equal(result.status, 2, JSON.stringify({ args, result }));
      assert.equal(result.stdout, '');
      assert.equal(JSON.parse(result.stderr).error.code, 'USAGE_ERROR');
    }
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('project get reports stable transport and protocol errors without leaking tokens', async (t) => {
  const cases = [
    { name: 'HTTP status', code: 'HTTP_ERROR', respond: ({ response }) => json(response, { message: 'no' }, 503) },
    { name: 'invalid JSON', code: 'RESPONSE_ERROR', respond: ({ response }) => { response.end('not json secret-token'); } },
    { name: 'malformed envelope', code: 'RESPONSE_ERROR', respond: ({ response }) => json(response, { data: {} }) },
    { name: 'YApi business error', code: 'YAPI_ERROR', respond: ({ response }) => json(response, { errcode: 400, errmsg: 'bad secret-token' }) },
    { name: 'redirect', code: 'HTTP_ERROR', respond: ({ response }) => { response.writeHead(302, { location: '/elsewhere?token=secret-token' }); response.end(); } },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
      const server = await fixture(scenario.respond);
      try {
        const result = await invoke(['project', 'get'], {
          env: isolatedEnvironment(configHome, {
            OPENYAPI_BASE_URL: server.baseUrl,
            OPENYAPI_PROJECT_ID: '41',
            OPENYAPI_TOKEN: 'secret-token',
          }),
        });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, '');
        assert.equal(JSON.parse(result.stderr).error.code, scenario.code);
        assert.doesNotMatch(result.stderr, /secret-token/);
      } finally {
        await server.close();
        await rm(configHome, { recursive: true, force: true });
      }
    });
  }
});

test('project get times out once without retrying', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(async ({ response }) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    json(response, { errcode: 0, data: { _id: 41 } });
  });
  try {
    const result = await invoke(['project', 'get', '--timeout-ms', '150'], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: server.baseUrl,
        OPENYAPI_PROJECT_ID: '41',
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'TIMEOUT_ERROR');
    assert.equal(server.requests.length, 1);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('profile and token lifecycle is isolated, permission-restricted, and redacted', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const env = isolatedEnvironment(configHome);
  try {
    const created = await invoke([
      'config', 'set', 'default', '--base-url', 'https://one.example/yapi/', '--project-id', '41',
    ], { env });
    assert.equal(created.status, 0);
    assert.deepEqual(JSON.parse(created.stdout), {
      name: 'default',
      baseUrl: 'https://one.example/yapi',
      projectId: 41,
      token: 'missing',
    });

    const tokenSet = await invoke(['config', 'token', 'set', '--stdin'], {
      env,
      input: 'stored-secret\n',
    });
    assert.equal(tokenSet.status, 0);
    assert.doesNotMatch(tokenSet.stdout + tokenSet.stderr, /stored-secret/);

    const updated = await invoke([
      'config', 'set', 'default', '--base-url', 'https://two.example', '--project-id', '42',
    ], { env });
    assert.equal(JSON.parse(updated.stdout).token, 'configured');

    const shown = await invoke(['config', 'show'], { env });
    assert.deepEqual(JSON.parse(shown.stdout), {
      name: 'default',
      baseUrl: 'https://two.example',
      projectId: 42,
      token: 'configured',
    });
    assert.doesNotMatch(shown.stdout + shown.stderr, /stored-secret/);

    await invoke([
      'config', 'set', 'staging', '--base-url', 'https://staging.example', '--project-id', '7',
    ], { env });
    const listed = await invoke(['config', 'list'], { env });
    assert.deepEqual(JSON.parse(listed.stdout).data.map(({ name }) => name), ['default', 'staging']);
    assert.doesNotMatch(listed.stdout + listed.stderr, /stored-secret/);

    const configFile = join(configHome, 'openyapi', 'profiles.json');
    assert.equal((await stat(join(configHome, 'openyapi'))).mode & 0o777, 0o700);
    assert.equal((await stat(configFile)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(configFile, 'utf8')).profiles.default.token, 'stored-secret');

    const unset = await invoke(['config', 'token', 'unset'], { env });
    assert.deepEqual(JSON.parse(unset.stdout), {
      profile: 'default', token: 'missing', removed: true,
    });
    const afterUnset = await invoke(['config', 'show'], { env });
    assert.equal(JSON.parse(afterUnset.stdout).baseUrl, 'https://two.example');
    assert.equal(JSON.parse(afterUnset.stdout).token, 'missing');

    const deleted = await invoke(['config', 'delete', 'staging'], { env });
    assert.deepEqual(JSON.parse(deleted.stdout), { profile: 'staging', deleted: true });
    const missing = await invoke(['config', 'show', 'staging'], { env });
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, '');
    assert.equal(JSON.parse(missing.stderr).error.code, 'CONFIG_ERROR');
  } finally {
    await rm(configHome, { recursive: true, force: true });
  }
});

test('explicit profile and connection options override environment selection and profile settings', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, url }) => {
    const id = Number(url.searchParams.get('id'));
    json(response, { errcode: 0, data: { _id: id, tokenKind: url.searchParams.get('token') } });
  });
  const env = isolatedEnvironment(configHome);
  try {
    for (const [name, id, token] of [['default', '41', 'default-token'], ['staging', '7', 'staging-token']]) {
      await invoke(['config', 'set', name, '--base-url', server.baseUrl, '--project-id', id], { env });
      await invoke(['config', 'token', 'set', name, '--stdin'], { env, input: token });
    }

    const selectedByEnvironment = await invoke(['project', 'get'], {
      env: { ...env, OPENYAPI_PROFILE: 'staging' },
    });
    assert.deepEqual(JSON.parse(selectedByEnvironment.stdout).data, {
      _id: 7, tokenKind: 'staging-token',
    });

    const explicit = await invoke([
      'project', 'get', '--profile', 'default', '--project-id', '9', '--base-url', server.baseUrl,
    ], {
      env: {
        ...env,
        OPENYAPI_PROFILE: 'staging',
        OPENYAPI_PROJECT_ID: '8',
        OPENYAPI_TOKEN: 'environment-token',
      },
    });
    assert.deepEqual(JSON.parse(explicit.stdout).data, {
      _id: 9, tokenKind: 'environment-token',
    });
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('category, interface detail, and tree commands map requests and render summaries', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, url }) => {
    if (url.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: 41, name: 'Docs' } });
    } else if (url.pathname === '/api/interface/getCatMenu') {
      json(response, { errcode: 0, data: [{ _id: 3, name: 'Users' }] });
    } else if (url.pathname === '/api/interface/get') {
      json(response, { errcode: 0, data: {
        _id: 8, method: 'POST', path: '/users', title: 'Create user', status: 'done', req_body_other: '{}',
      } });
    } else if (url.pathname === '/api/interface/list_menu') {
      json(response, { errcode: 0, data: [{
        _id: 3,
        name: 'Users',
        list: [{ _id: 8, method: 'POST', path: '/users', title: 'Create user', status: 'done' }],
      }] });
    } else {
      json(response, { errcode: 404, errmsg: 'unexpected path' });
    }
  });
  const projectEnvironment = isolatedEnvironment(configHome, {
    OPENYAPI_BASE_URL: server.baseUrl,
    OPENYAPI_PROJECT_ID: '41',
    OPENYAPI_TOKEN: 'secret-token',
  });
  try {
    const categories = await invoke(['category', 'list', '--format', 'table'], { env: projectEnvironment });
    assert.equal(categories.status, 0);
    assert.match(categories.stdout, /ID\s+NAME/);
    assert.match(categories.stdout, /3\s+Users/);

    const detail = await invoke(['interface', 'get', '--id', '8'], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: server.baseUrl,
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });
    assert.equal(detail.status, 0);
    assert.equal(JSON.parse(detail.stdout).data.req_body_other, '{}');

    const tree = await invoke(['interface', 'tree', '--format', 'table'], { env: projectEnvironment });
    assert.equal(tree.status, 0);
    assert.match(tree.stdout, /CATEGORY ID\s+CATEGORY\s+INTERFACE ID/);
    assert.match(tree.stdout, /Users\s+8\s+POST\s+\/users\s+Create user\s+done/);

    assert.deepEqual(server.requests.map(({ method, pathname, query }) => ({ method, pathname, query })), [
      { method: 'GET', pathname: '/api/project/get', query: { token: 'secret-token', id: '41' } },
      { method: 'GET', pathname: '/api/interface/getCatMenu', query: { token: 'secret-token', project_id: '41' } },
      { method: 'GET', pathname: '/api/interface/get', query: { token: 'secret-token', id: '8' } },
      { method: 'GET', pathname: '/api/project/get', query: { token: 'secret-token', id: '41' } },
      { method: 'GET', pathname: '/api/interface/list_menu', query: { token: 'secret-token', project_id: '41' } },
    ]);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('project identity mismatch stops the target query', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response }) => {
    json(response, { errcode: 0, data: { _id: 99, name: 'Wrong project' } });
  });
  try {
    const result = await invoke(['category', 'list'], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: server.baseUrl,
        OPENYAPI_PROJECT_ID: '41',
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'PROJECT_MISMATCH');
    assert.deepEqual(server.requests.map(({ pathname }) => pathname), ['/api/project/get']);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('interface list maps project and category pagination with stable JSON and table output', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response, url }) => {
    if (url.pathname === '/api/project/get') {
      json(response, { errcode: 0, data: { _id: 41 } });
      return;
    }
    const page = Number(url.searchParams.get('page'));
    const limit = Number(url.searchParams.get('limit'));
    const totalPages = Math.ceil(12 / limit);
    const firstId = ((page - 1) * limit) + 1;
    const itemCount = page > totalPages ? 0 : Math.min(limit, 12 - firstId + 1);
    json(response, {
      errcode: 0,
      data: {
        count: 12,
        total: totalPages,
        list: Array.from({ length: itemCount }, (_, index) => ({
          _id: firstId + index,
          method: 'GET',
          path: `/item/${firstId + index}`,
          title: 'Item',
          status: 'done',
        })),
      },
    });
  });
  try {
    const projectResult = await invoke(['interface', 'list'], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: server.baseUrl,
        OPENYAPI_PROJECT_ID: '41',
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });
    assert.deepEqual(JSON.parse(projectResult.stdout).pagination, {
      page: 1, limit: 10, totalItems: 12, totalPages: 2,
    });

    const categoryResult = await invoke([
      'interface', 'list', '--category-id', '3', '--page', '4', '--limit', '5', '--format', 'table',
    ], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: server.baseUrl,
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });
    assert.equal(categoryResult.status, 0);
    assert.match(categoryResult.stdout, /ID\s+METHOD\s+PATH\s+TITLE\s+STATUS/);
    assert.deepEqual(server.requests.map(({ pathname, query }) => ({ pathname, query })), [
      { pathname: '/api/project/get', query: { token: 'secret-token', id: '41' } },
      { pathname: '/api/interface/list', query: { token: 'secret-token', project_id: '41', page: '1', limit: '10' } },
      { pathname: '/api/interface/list_cat', query: { token: 'secret-token', catid: '3', page: '4', limit: '5' } },
    ]);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('interface list rejects invalid pagination options before any request', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response }) => json(response, { errcode: 0, data: {} }));
  const env = isolatedEnvironment(configHome, {
    OPENYAPI_BASE_URL: server.baseUrl,
    OPENYAPI_PROJECT_ID: '41',
    OPENYAPI_TOKEN: 'secret-token',
  });
  try {
    for (const args of [
      ['interface', 'list', '--all', '--page', '1'],
      ['interface', 'list', '--page', '0'],
      ['interface', 'list', '--limit', 'all'],
      ['interface', 'list', '--category-id', '-1'],
    ]) {
      const result = await invoke(args, { env });
      assert.equal(result.status, 2, JSON.stringify({ args, result }));
      assert.equal(result.stdout, '');
      assert.equal(JSON.parse(result.stderr).error.code, 'USAGE_ERROR');
    }
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('interface list --all aggregates numeric pages without loss or duplication', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const pages = new Map([
    [1, [{ _id: 1 }, { _id: 2 }]],
    [2, [{ _id: 3 }, { _id: 4 }]],
  ]);
  const server = await fixture(({ response, url }) => {
    const page = Number(url.searchParams.get('page'));
    json(response, { errcode: 0, data: { count: 4, total: 2, list: pages.get(page) ?? [] } });
  });
  try {
    const result = await invoke(['interface', 'list', '--category-id', '3', '--all', '--limit', '2'], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: server.baseUrl,
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      data: [{ _id: 1 }, { _id: 2 }, { _id: 3 }, { _id: 4 }],
      pagination: { limit: 2, totalItems: 4, totalPages: 2, pagesFetched: 2 },
    });
    assert.deepEqual(server.requests.map(({ query }) => query.page), ['1', '2']);
    assert.ok(server.requests.every(({ query }) => query.limit === '2'));
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('interface list --all accepts a static empty collection', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response }) => {
    json(response, { errcode: 0, data: { count: 0, total: 0, list: [] } });
  });
  try {
    const result = await invoke(['interface', 'list', '--category-id', '3', '--all'], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: server.baseUrl,
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });
    assert.deepEqual(JSON.parse(result.stdout), {
      data: [],
      pagination: { limit: 10, totalItems: 0, totalPages: 0, pagesFetched: 1 },
    });
    assert.equal(server.requests.length, 1);
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});

test('interface list --all rejects pagination anomalies without partial output', async (t) => {
  const scenarios = [
    {
      name: 'duplicate IDs',
      pages: [
        { count: 3, total: 2, list: [{ _id: 1 }, { _id: 2 }] },
        { count: 3, total: 2, list: [{ _id: 2 }] },
      ],
    },
    {
      name: 'changing totals',
      pages: [
        { count: 3, total: 2, list: [{ _id: 1 }, { _id: 2 }] },
        { count: 4, total: 2, list: [{ _id: 3 }, { _id: 4 }] },
      ],
    },
    {
      name: 'early empty page',
      pages: [
        { count: 3, total: 2, list: [{ _id: 1 }, { _id: 2 }] },
        { count: 3, total: 2, list: [] },
      ],
    },
    {
      name: 'inconsistent final count',
      pages: [
        { count: 4, total: 2, list: [{ _id: 1 }, { _id: 2 }] },
        { count: 4, total: 2, list: [{ _id: 3 }] },
      ],
    },
    {
      name: 'invalid response shape',
      pages: [{ count: '2', total: 1, list: [{ _id: 1 }, { _id: 2 }] }],
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
      const server = await fixture(({ response, url }) => {
        const page = Number(url.searchParams.get('page'));
        json(response, { errcode: 0, data: scenario.pages[page - 1] });
      });
      try {
        const result = await invoke(['interface', 'list', '--category-id', '3', '--all', '--limit', '2'], {
          env: isolatedEnvironment(configHome, {
            OPENYAPI_BASE_URL: server.baseUrl,
            OPENYAPI_TOKEN: 'secret-token',
          }),
        });
        assert.equal(result.status, 1);
        assert.equal(result.stdout, '');
        assert.equal(JSON.parse(result.stderr).error.code, 'RESPONSE_ERROR');
      } finally {
        await server.close();
        await rm(configHome, { recursive: true, force: true });
      }
    });
  }
});

test('missing and corrupt configuration fail predictably without a request', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  try {
    const missing = await invoke(['project', 'get'], { env: isolatedEnvironment(configHome) });
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, '');
    assert.equal(JSON.parse(missing.stderr).error.code, 'CONFIG_ERROR');

    const directory = join(configHome, 'openyapi');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'profiles.json'), '{not-json}\n');
    const corrupt = await invoke(['config', 'list'], { env: isolatedEnvironment(configHome) });
    assert.equal(corrupt.status, 1);
    assert.equal(corrupt.stdout, '');
    assert.equal(JSON.parse(corrupt.stderr).error.code, 'CONFIG_ERROR');
  } finally {
    await rm(configHome, { recursive: true, force: true });
  }
});

test('network failures use a stable error without exposing request details', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  const server = await fixture(({ response }) => json(response, { errcode: 0, data: {} }));
  const baseUrl = server.baseUrl;
  await server.close();
  try {
    const result = await invoke(['project', 'get'], {
      env: isolatedEnvironment(configHome, {
        OPENYAPI_BASE_URL: baseUrl,
        OPENYAPI_PROJECT_ID: '41',
        OPENYAPI_TOKEN: 'secret-token',
      }),
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'NETWORK_ERROR');
    assert.doesNotMatch(result.stderr, /secret-token|127\.0\.0\.1/);
  } finally {
    await rm(configHome, { recursive: true, force: true });
  }
});

test('single-page pagination rejects inconsistent protocol data but accepts beyond-last empty pages', async () => {
  const configHome = await mkdtemp(join(tmpdir(), 'openyapi-config-'));
  let valid = false;
  const server = await fixture(({ response }) => {
    json(response, {
      errcode: 0,
      data: valid
        ? { count: 2, total: 1, list: [] }
        : { count: 2, total: 9, list: [{ _id: 1 }] },
    });
  });
  const env = isolatedEnvironment(configHome, {
    OPENYAPI_BASE_URL: server.baseUrl,
    OPENYAPI_TOKEN: 'secret-token',
  });
  try {
    const inconsistent = await invoke([
      'interface', 'list', '--category-id', '3', '--limit', '10',
    ], { env });
    assert.equal(inconsistent.status, 1);
    assert.equal(inconsistent.stdout, '');
    assert.equal(JSON.parse(inconsistent.stderr).error.code, 'RESPONSE_ERROR');

    valid = true;
    const beyondLast = await invoke([
      'interface', 'list', '--category-id', '3', '--page', '2', '--limit', '10',
    ], { env });
    assert.equal(beyondLast.status, 0);
    assert.deepEqual(JSON.parse(beyondLast.stdout), {
      data: [],
      pagination: { page: 2, limit: 10, totalItems: 2, totalPages: 1 },
    });
  } finally {
    await server.close();
    await rm(configHome, { recursive: true, force: true });
  }
});
