import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("./remote.js", import.meta.url), "utf8");
const page = await readFile(new URL("../pages/remote.astro", import.meta.url), "utf8");

test("browser relay admission keeps the one-time grant out of the URL", () => {
  assert.match(script, /new WebSocket\(`\$\{RELAY\}\/v1\/sessions\/connect`, \["reasonix\.remote\.v1", `reasonix\.auth\.\$\{ticket\}`\]\)/);
  assert.doesNotMatch(script, /sessions\/connect\?[^`]*ticket/);
});

test("remote probe uses X25519, HKDF, and authenticated encryption", () => {
  assert.match(script, /name: "X25519"/);
  assert.match(script, /name: "HKDF", hash: "SHA-256"/);
  assert.match(script, /name: "AES-GCM"/);
  assert.match(script, /type: "ping"/);
  assert.match(page, /端到端加密/);
});

test("connected remote devices expose only the typed task protocol", () => {
  assert.match(script, /request\("tasks\.list"\)/);
  assert.match(script, /request\("tasks\.get", \{ taskId:/);
  assert.match(script, /request\("tasks\.send", \{ taskId: select\.value, text \}\)/);
  assert.doesNotMatch(script, /request\("shell\./);
});
