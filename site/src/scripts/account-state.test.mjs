import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { accountSlotHTML, signedInDestination } from "./account-slot.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("a signed-in visitor sees their handle, never a sign-in link", () => {
  const html = accountSlotHTML({ handle: "alice", emailVerified: true }, "/docs/");
  assert.match(html, /@alice/);
  assert.match(html, /href="\/account\/"/);
  assert.doesNotMatch(html, /\/login\//);
  assert.doesNotMatch(html, /acct-warn/);
});

test("an unverified account is flagged next to the handle", () => {
  assert.match(accountSlotHTML({ handle: "bob", emailVerified: false }, "/"), /acct-warn/);
});

test("a signed-out visitor gets a sign-in link that returns to the current page", () => {
  const html = accountSlotHTML(null, "/changelog/?v=1");
  assert.match(html, /href="\/login\/\?next=%2Fchangelog%2F%3Fv%3D1"/);
  assert.doesNotMatch(html, /acct-name/);
});

test("the handle is escaped before it reaches markup", () => {
  const html = accountSlotHTML({ handle: '<img src=x onerror="x">', emailVerified: true }, "/");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("the sign-in page sends an existing session on instead of asking again", () => {
  const origin = "https://reasonix.io";
  const user = { handle: "alice" };
  assert.equal(signedInDestination(user, null, origin, "/account/"), "https://reasonix.io/account/");
  assert.equal(signedInDestination(user, "/skills/", origin, "/account/"), "https://reasonix.io/skills/");
  assert.equal(signedInDestination(user, "https://evil.example/", origin, "/account/"), "https://reasonix.io/account/");
  assert.equal(signedInDestination(null, "/skills/", origin, "/account/"), null);
});

test("every page on the shared header asks the account service, not a static link", async () => {
  const header = await source("../components/SiteHeader.astro");
  assert.doesNotMatch(header, /accountSlot/);
  assert.equal((header.match(/data-account-slot/g) ?? []).length, 2);
  assert.match(header, /import ['"]\.\.\/scripts\/account-nav\.js['"]/);
});

test("pages read the session through the one shared client", async () => {
  const [skills, nav, auth] = await Promise.all([
    source("../pages/skills.astro"),
    source("./account-nav.js"),
    source("./auth.js"),
  ]);
  assert.doesNotMatch(skills, /accountSlot/);
  assert.doesNotMatch(skills, /function mountAccount/);
  assert.doesNotMatch(skills, /href="https:\/\/id\.reasonix\.io"/);
  assert.match(skills, /from ['"]\.\.\/scripts\/account-nav\.js['"]/);
  assert.match(nav, /currentAccount/);
  assert.match(nav, /pageshow/);
  assert.match(auth, /signedInDestination/);
});
