import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const createApiClient = vi.fn(() => ({
  axios: { interceptors: { response: { use: vi.fn() } } },
}));
vi.mock("@solidtime/api", () => ({ createApiClient }));

const DEFAULT_ENDPOINT = "https://app.solidtime.io";
const STORED_ENDPOINT = "https://time.example.test";
const LEGACY_ENDPOINT = "https://legacy.example.test";

let data: Record<string, string>;
let listeners: ((changes: any, area: string) => void)[];
const onChanged = (changes: any, area: string) =>
  listeners.forEach((fn) => fn(changes, area));

// pageIsExtension: true simulates the popup, false a content script on a web page
async function load(pageIsExtension: boolean) {
  vi.resetModules();
  listeners = [];
  const store = {
    get: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        list.filter((k) => k in data).map((k) => [k, data[k]]),
      );
    }),
    set: vi.fn(async (items: Record<string, string>) => {
      Object.assign(data, items);
    }),
    remove: vi.fn(async () => {}),
  };
  (globalThis as any).browser = {
    storage: {
      local: store,
      onChanged: { addListener: vi.fn((fn) => listeners.push(fn)) },
    },
    runtime: {
      sendMessage: vi.fn(),
      getURL: vi.fn(() =>
        pageIsExtension ? location.origin + "/" : "chrome-extension://test/",
      ),
    },
    identity: { getRedirectURL: vi.fn() },
  };
  const oauth = await import("../entrypoints/utils/oauth");
  await new Promise((r) => setTimeout(r, 0));
  return { oauth, store };
}

beforeEach(() => {
  data = {};
  localStorage.clear();
  createApiClient.mockClear();
});

afterEach(() => {
  delete (globalThis as any).browser;
});

describe("endpoint in a content script (Linear, Jira, Plane, Notion)", () => {
  it("uses the endpoint saved in browser.storage.local", async () => {
    data.instance_endpoint = STORED_ENDPOINT;
    const { oauth } = await load(false);
    expect(oauth.endpoint.value).toBe(STORED_ENDPOINT);
  });

  it("ignores the host page's localStorage", async () => {
    localStorage.setItem("instance_endpoint", LEGACY_ENDPOINT);
    const { oauth, store } = await load(false);
    expect(oauth.endpoint.value).toBe(DEFAULT_ENDPOINT);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("falls back to the default when nothing is saved", async () => {
    const { oauth } = await load(false);
    expect(oauth.endpoint.value).toBe(DEFAULT_ENDPOINT);
  });

  it("sends API calls to the saved endpoint", async () => {
    data.instance_endpoint = STORED_ENDPOINT;
    await load(false);
    const { apiClient } = await import("../entrypoints/utils/api");
    apiClient();
    expect(createApiClient).toHaveBeenCalledWith(
      STORED_ENDPOINT + "/api",
      expect.anything(),
    );
  });

  it("follows changes made in the popup", async () => {
    const { oauth } = await load(false);
    onChanged({ instance_endpoint: { newValue: STORED_ENDPOINT } }, "local");
    expect(oauth.endpoint.value).toBe(STORED_ENDPOINT);
  });
});

describe("endpoint in the popup", () => {
  it("migrates a value from the popup's localStorage once", async () => {
    localStorage.setItem("instance_endpoint", LEGACY_ENDPOINT);
    const { oauth, store } = await load(true);
    expect(oauth.endpoint.value).toBe(LEGACY_ENDPOINT);
    expect(store.set).toHaveBeenCalledWith({
      instance_endpoint: LEGACY_ENDPOINT,
    });
  });

  it("prefers browser.storage.local over the legacy value", async () => {
    data.instance_endpoint = STORED_ENDPOINT;
    localStorage.setItem("instance_endpoint", LEGACY_ENDPOINT);
    const { oauth } = await load(true);
    expect(oauth.endpoint.value).toBe(STORED_ENDPOINT);
  });

  it("saves edits to browser.storage.local", async () => {
    const { oauth, store } = await load(true);
    oauth.endpoint.value = STORED_ENDPOINT;
    await nextTick();
    expect(store.set).toHaveBeenCalledWith({
      instance_endpoint: STORED_ENDPOINT,
    });
  });
});
