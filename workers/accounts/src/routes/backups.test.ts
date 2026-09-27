import { describe, expect, it } from "vitest";
import app from "../app";
import type { Bindings } from "../env";

const bindings: Bindings = {
  DB: {} as D1Database,
  APP_ORIGIN: "https://reasonix.io",
  ACCOUNT_ORIGIN: "https://id.reasonix.io",
  REMOTE_GATEWAY_ORIGIN: "https://remote.reasonix.io",
  ALLOWED_ORIGINS: "https://reasonix.io",
  COOKIE_DOMAIN: ".reasonix.io",
  EMAIL_PROVIDER: "stub",
  MAIL_FROM: "Reasonix <test@example.com>",
};

describe("config backup HTTP boundary", () => {
  it("answers nothing to a request without a session", async () => {
    for (const [method, path] of [["GET", "/me/backups"], ["POST", "/me/backups"], ["GET", "/me/backups/" + "a".repeat(64)], ["DELETE", "/me/backups/" + "a".repeat(64)]] as const) {
      const response = await app.request(path, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined }, bindings);
      expect(response.status).toBe(401);
    }
  });
});
