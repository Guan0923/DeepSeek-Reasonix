import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("./remote.js", import.meta.url), "utf8");
const page = await readFile(new URL("../pages/remote.astro", import.meta.url), "utf8");

test("website is only a device chooser for the full Web Studio", () => {
  assert.match(script, /https:\/\/studio\.reasonix\.io/);
  assert.match(script, /url\.searchParams\.set\("device", deviceId\)/);
  assert.match(script, /Open in Web Studio/);
  assert.match(page, /完整 Studio/);
});

test("website does not duplicate Studio messaging or relay transport", () => {
  assert.doesNotMatch(script, /WebSocket|tasks\.list|tasks\.get|tasks\.send|remote-grants/);
  assert.match(page, /端到端加密/);
});

test("only online devices are shown and signed-out users return after login", () => {
  assert.match(script, /filter\(\(device\) => !device\.revokedAt && device\.online === true\)/);
  assert.match(script, /encodeURIComponent\("\/remote\/"\)/);
  assert.match(script, /api\("\/me\/devices"\)/);
  assert.doesNotMatch(script, /api\("\/me"\)/);
  assert.match(script, /15_000/);
});
