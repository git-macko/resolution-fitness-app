// Tests for the API client's cold-start warm-up and timeout behaviour.
// The backend sleeps when idle on free hosting, so the client pings
// /api/health before the first timed request.

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

// Each test gets a fresh module so the warm-up state starts at zero.
function loadClient() {
  let client;
  jest.isolateModules(() => {
    client = require('../client').default;
  });
  return client;
}

const realFetch = global.fetch;

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('API client warm-up', () => {
  it('pings /api/health before the first real request', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      return jsonResponse({ ok: true });
    });

    const api = loadClient();
    await api.getProfile();

    expect(calls[0]).toContain('/api/health');
    expect(calls[1]).toContain('/api/profile');
    expect(calls).toHaveLength(2);
  });

  it('does not ping again while the API is known to be awake', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      return jsonResponse({ ok: true });
    });

    const api = loadClient();
    await api.getProfile();
    await api.getSettings({ skipCache: true });

    expect(calls.filter((u) => u.includes('/api/health'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/api/profile'))).toHaveLength(2);
  });

  it('keeps polling while the instance boots, then sends the request', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      if (String(url).includes('/api/health')) {
        // First attempt fails like a booting proxy, then the instance answers.
        return calls.filter((u) => u.includes('/api/health')).length === 1
          ? jsonResponse({ error: 'Bad gateway' }, false)
          : jsonResponse({ data: { status: 'healthy' } });
      }
      return jsonResponse({ ok: true });
    });

    const api = loadClient();
    const started = Date.now();
    await api.getProfile();
    const elapsed = Date.now() - started;

    expect(calls.filter((u) => u.includes('/api/health'))).toHaveLength(2);
    expect(calls[calls.length - 1]).toContain('/api/profile');
    // One 3 s retry delay should have elapsed between the health attempts.
    expect(elapsed).toBeGreaterThanOrEqual(2900);
  }, 15000);

  it('fails fast instead of waiting out the budget when the network is down', async () => {
    const offline = Object.assign(new TypeError('Failed to fetch'), {
      name: 'TypeError',
    });
    let healthAttempts = 0;
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/api/health')) healthAttempts += 1;
      throw offline;
    });

    const api = loadClient();
    const started = Date.now();
    await expect(api.getProfile()).rejects.toThrow('Failed to fetch');
    const elapsed = Date.now() - started;

    expect(healthAttempts).toBe(1); // no retry loop once we know we're offline
    expect(elapsed).toBeLessThan(2000);
  });

  it('reports warm-up state to subscribers', async () => {
    let releaseHealth;
    global.fetch = jest.fn((url) => {
      if (String(url).includes('/api/health')) {
        return new Promise((resolve) => {
          releaseHealth = () =>
            resolve(jsonResponse({ data: { status: 'healthy' } }));
        });
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    const api = loadClient();
    const seen = [];
    const unsubscribe = api.subscribeWarmUp((warming) => seen.push(warming));

    const pending = api.getProfile();
    // Let the token lookup settle so the warm-up has actually started.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.isWarmingUp()).toBe(true);
    expect(seen).toEqual([true]);

    releaseHealth();
    await pending;

    expect(api.isWarmingUp()).toBe(false);
    expect(seen).toEqual([true, false]);

    unsubscribe();
    expect(typeof unsubscribe).toBe('function');
  });

  it('surfaces a friendly message when a request itself times out', async () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/api/health')) {
        return jsonResponse({ data: { status: 'healthy' } });
      }
      throw abortError;
    });

    const api = loadClient();
    await expect(api.getProfile()).rejects.toThrow(
      'Request timed out. Please check your connection and try again.'
    );
  });
});

describe('AI usage allowance', () => {
  it('publishes the allowance fetched from /api/ai/usage', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/api/ai/usage')) {
        return jsonResponse({ data: { used: 4, limit: 20, remaining: 16 } });
      }
      return jsonResponse({ ok: true });
    });

    const api = loadClient();
    const seen = [];
    const unsubscribe = api.subscribeAIUsage((usage) => seen.push(usage));

    const usage = await api.refreshAIUsage();
    unsubscribe();

    const expected = { used: 4, limit: 20, remaining: 16 };
    expect(usage).toEqual(expected);
    expect(api.getAIUsageSnapshot()).toEqual(expected);
    expect(seen[seen.length - 1]).toEqual(expected);
  });

  it('refreshes the allowance after an AI request spends one', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      if (String(url).includes('/api/ai/usage')) {
        return jsonResponse({ data: { used: 1, limit: 20, remaining: 19 } });
      }
      return jsonResponse({ data: { reply: 'hi' } });
    });

    const api = loadClient();
    await api.sendChatMessage('hello');
    // The refresh is fire-and-forget; let it settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls.some((url) => url.includes('/api/ai/usage'))).toBe(true);
    expect(api.getAIUsageSnapshot()).toEqual({ used: 1, limit: 20, remaining: 19 });
  });
});
