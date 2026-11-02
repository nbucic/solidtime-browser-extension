import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMyMemberships = vi.fn();
const createApiClient = vi.fn(() => ({ getMyMemberships }));
vi.mock("@solidtime/api", () => ({ createApiClient }));

const store = {
  get: vi.fn(async () => ({})),
  set: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
};

// Fake token, never a real one
const FAKE_TOKEN = "fake-token-123";

async function load() {
  vi.resetModules();
  (globalThis as any).browser = {
    storage: { local: store, onChanged: { addListener: vi.fn() } },
    runtime: { sendMessage: vi.fn() },
    identity: { getRedirectURL: vi.fn() },
  };
  return await import("../entrypoints/utils/oauth");
}

let spies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

afterEach(() => {
  spies.forEach((s) => s.mockRestore());
  delete (globalThis as any).browser;
});

describe("loginWithApiToken", () => {
  it("rejects an empty token", async () => {
    const oauth = await load();
    await expect(oauth.loginWithApiToken("   ")).rejects.toThrow(
      "Enter an API token",
    );
    expect(createApiClient).not.toHaveBeenCalled();
  });

  it("maps 401 to an invalid token message and stores nothing", async () => {
    const oauth = await load();
    getMyMemberships.mockRejectedValue({ response: { status: 401 } });
    await expect(oauth.loginWithApiToken(FAKE_TOKEN)).rejects.toThrow(
      "Token is invalid or expired, enter a new one",
    );
    expect(store.set).not.toHaveBeenCalled();
    expect(oauth.accessToken.value).toBe("");
  });

  it("maps other errors to a generic verify message", async () => {
    const oauth = await load();
    getMyMemberships.mockRejectedValue(new Error("network"));
    await expect(oauth.loginWithApiToken(FAKE_TOKEN)).rejects.toThrow(
      "Could not verify the token, check the instance URL",
    );
    expect(store.set).not.toHaveBeenCalled();
  });

  it("stores the trimmed token in browser.storage.local only", async () => {
    const oauth = await load();
    getMyMemberships.mockResolvedValue({});
    await oauth.loginWithApiToken(`  ${FAKE_TOKEN} `);

    expect(store.remove).toHaveBeenCalledWith("refresh_token");
    expect(store.set).toHaveBeenCalledWith({
      access_token: FAKE_TOKEN,
      auth_mode: "api_token",
    });
    expect(oauth.accessToken.value).toBe(FAKE_TOKEN);
    expect(oauth.authMode.value).toBe("api_token");
    expect(oauth.refreshToken.value).toBe("");

    // Not leaked to web storage
    const dump = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(dump).not.toContain(FAKE_TOKEN);
  });

  it("never passes the token to console.*", async () => {
    const oauth = await load();
    getMyMemberships.mockResolvedValue({});
    await oauth.loginWithApiToken(FAKE_TOKEN);
    getMyMemberships.mockRejectedValue({ response: { status: 401 } });
    await oauth.loginWithApiToken(FAKE_TOKEN).catch(() => {});
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE_TOKEN);
    }
  });
});

describe("refreshAccessToken in api_token mode", () => {
  it("logs out and throws", async () => {
    const oauth = await load();
    getMyMemberships.mockResolvedValue({});
    await oauth.loginWithApiToken(FAKE_TOKEN);

    await expect(oauth.refreshAccessToken()).rejects.toThrow(
      "Token is invalid or expired, enter a new one",
    );
    expect(oauth.accessToken.value).toBe("");
    expect(oauth.authMode.value).toBe("");
    expect(store.remove).toHaveBeenLastCalledWith([
      "access_token",
      "refresh_token",
      "auth_mode",
    ]);
    expect((globalThis as any).browser.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
