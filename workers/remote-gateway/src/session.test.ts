import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteSession } from "./session";
import type { Env } from "./env";

afterEach(() => vi.unstubAllGlobals());

describe("remote session presence", () => {
  it("reports and renews an authenticated live device socket", async () => {
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    const attachment = { role: "device", userId: 7, scopes: ["desktop"], connectionId: null, expiresAt: 1 };
    const serializeAttachment = vi.fn();
    const socket = {
      readyState: 1,
      deserializeAttachment: vi.fn(() => attachment),
      serializeAttachment,
    } as unknown as WebSocket;
    const state = {
      getWebSockets: vi.fn((tag: string) => tag === "device" ? [socket] : []),
    } as unknown as DurableObjectState;
    const session = new RemoteSession(state, {} as Env);

    const response = await session.fetch(new Request("https://session.internal/status"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ online: true });
    expect(serializeAttachment).toHaveBeenCalledOnce();
    expect(attachment.expiresAt).toBeGreaterThan(Date.now());
  });

  it("does not report a closed historical socket as online", async () => {
    vi.stubGlobal("WebSocket", { OPEN: 1 });
    const state = {
      getWebSockets: vi.fn(() => [{ readyState: 3, deserializeAttachment: vi.fn() }]),
    } as unknown as DurableObjectState;
    const session = new RemoteSession(state, {} as Env);

    const response = await session.fetch(new Request("https://session.internal/status"));

    await expect(response.json()).resolves.toEqual({ online: false });
  });
});
