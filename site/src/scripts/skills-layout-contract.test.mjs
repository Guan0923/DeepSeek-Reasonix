import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(new URL("../pages/skills.astro", import.meta.url), "utf8");

test("the registry publish CTA does not inherit the publish panel layout", async () => {
  const page = await source();

  assert.match(page, /class="btn btn-dark reg-publish-cta" id="publish-open"/);
  assert.match(page, /<section class="reg-publish" id="publish" hidden>/);
  assert.doesNotMatch(page, /class="btn btn-dark reg-publish" id="publish-open"/);
});

test("the registry exposes plugins as a first-class package kind", async () => {
  const page = await source();

  assert.match(page, /<button data-kind="plugin" role="tab">Plugins<\/button>/);
  assert.match(page, /<option value="plugin">plugin<\/option>/);
  assert.match(page, /installKind: installerFor\(f\.get\('kind'\)\)/);
  assert.match(page, /Plugins and themes must point to a GitHub repository or path containing/);
  assert.match(page, /reasonix-plugin\.json/);
  assert.match(page, /\.codex-plugin\/plugin\.json/);
  assert.match(page, /\.claude-plugin\/plugin\.json/);
  assert.match(page, /\.claude-plugin\/marketplace\.json/);
  assert.match(page, /pattern="\(https\?:\/\/\[\^ \]\+\|git:github\[\.\]com\/\[\^ \]\+/);
});

test("themes are their own category and install through the plugin installer", async () => {
  const page = await source();

  assert.match(page, /<button data-kind="theme" role="tab">Themes<\/button>/);
  assert.match(page, /<option value="theme">theme<\/option>/);
  assert.match(page, /const installerFor = \(kind\) => \(kind === 'theme' \? 'plugin' : kind\);/);
});

test("registry copy requests preserve the reviewed package kind", async () => {
  const page = await source();

  assert.match(page, /Install this Reasonix \$\{p\.kind\} package from \$\{p\.source\}/);
  assert.match(page, /Use install_source with kind="\$\{installerFor\(p\.kind\)\}"/);
  assert.match(page, /data-copy="\$\{esc\(installRequest\(p\)\)\}"/);
  assert.doesNotMatch(page, /data-copy="\$\{esc\(p\.source\)\}"/);
});

test("admin approval is bound to the package revision shown in the review queue", async () => {
  const page = await source();

  assert.match(page, /data-version="\$\{esc\(p\.latestVersion\)\}"/);
  assert.match(page, /data-updated-at="\$\{esc\(p\.updatedAt\)\}"/);
  assert.match(page, /data-status="\$\{esc\(p\.status\)\}"/);
  assert.match(page, /expectedVersion: row\.dataset\.version/);
  assert.match(page, /expectedUpdatedAt: row\.dataset\.updatedAt/);
  assert.match(page, /expectedStatus: row\.dataset\.status/);
  assert.match(page, /if \(r\.status === 409\) loadReview\(\)/);
});

test("a publisher can keep a package private instead of sending it to review", async () => {
  const page = await source();

  assert.match(page, /<input type="checkbox" name="private" \/>/);
  assert.match(page, /\.\.\.\(f\.get\('private'\) \? \{ visibility: 'private' \} : \{\}\)/);
  assert.match(page, /status === 'private'/);
});
