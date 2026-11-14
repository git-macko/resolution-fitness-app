// Tests for uploading picked images from Expo web.
//
// React Native's FormData understands an { uri, name, type } descriptor, but
// the browser's FormData stringifies it — the backend then sees no file and
// rejects the scan with "No food photo provided". The API client must read
// web URIs into a Blob and append that instead.

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

it('sends the picked food photo as a real file part on web', async () => {
  let scanBody = null;

  // Capture request budgets: a scan waits on AI vision analysis, which takes
  // far longer than the default 15 s, and used to abort as "Request timed out".
  const budgetMs = [];
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, delay, ...rest) => {
    if (typeof delay === 'number') budgetMs.push(delay);
    return realSetTimeout(fn, delay, ...rest);
  };

  global.fetch = jest.fn(async (url, options = {}) => {
    const target = String(url);

    // The client turns the picked data URI into a Blob before uploading.
    if (target.startsWith('data:')) {
      return {
        ok: true,
        blob: async () =>
          new (window.Blob || Blob)(
            [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
            { type: 'image/jpeg' }
          ),
      };
    }

    if (target.includes('/api/food-scan') && options.body) {
      scanBody = options.body;
    }
    return jsonResponse({ data: { name: 'Chicken Salad' } });
  });

  const api = require('../client').default;
  const result = await api.scanFood('data:image/jpeg;base64,/9j/4AAQSkZJRg==');

  expect(result.data.name).toBe('Chicken Salad');
  expect(scanBody).not.toBeNull();

  const photo = scanBody.get('foodPhoto');
  expect(typeof photo).not.toBe('string');
  expect(photo).not.toBeNull();
  expect(photo.type).toBe('image/jpeg');
  expect(photo.size).toBeGreaterThan(0);

  global.setTimeout = realSetTimeout;
  expect(Math.max(...budgetMs)).toBeGreaterThanOrEqual(60000);
});
