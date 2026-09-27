import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bindings } from "./env";
import { remoteDevicePresence } from "./remoteGateway";

const env = {
  REMOTE_GATEWAY_ORIGIN: "https://remote.reasonix.io/",
  REMOTE_GATEWAY_TOKEN: "gateway-secret",
} as Bindings;

afterEach(() => vi.unstubAllGlobals());

describe("remote device presence", () => {
  it("returns only devices confirmed online by the gateway", async () => {
    const first = "1".repeat(64);
    const second = "2".repeat(64);
    const fetchMock = vi.fn(async () => Response.json({ devices: [
      { id: first, online: true },
      { id: second, online: false },
    ] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await remoteDevicePresence(env, [first, second]);

    expect(result.available).toBe(true);
    expect([...result.onlineIds]).toEqual([first]);
    expect(fetchMock).toHaveBeenCalledWith("https://remote.reasonix.io/v1/devices/status", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ deviceIds: [first, second] }),
    }));
  });

  it("fails closed when gateway presence cannot be checked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const result = await remoteDevicePresence(env, ["1".repeat(64)]);
    expect(result).toEqual({ onlineIds: new Set(), available: false });
  });
});
