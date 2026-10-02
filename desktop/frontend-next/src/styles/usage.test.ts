import { describe, expect, it } from "vitest";

const SHEET = Object.values(
  import.meta.glob("./app.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
)[0];

describe("usage remains readable on a phone", () => {
  it("lets an explicit source colour override the shared chart hue", () => {
    expect(SHEET).toMatch(/\.ufill\s*\{[^}]*background:\s*var\(--row-color,\s*var\(--chart\)\)/);
  });

  it("keeps the full daily table in a bounded scroll region", () => {
    const rule = SHEET.match(/\.utable-wrap\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/max-height:\s*\d+px/);
    expect(rule).toMatch(/overflow:\s*auto/);
  });

  it("stacks the custom date fields before they squeeze the inputs", () => {
    expect(SHEET).toMatch(/@media\s*\(max-width:\s*560px\)[\s\S]*?\.udates\s*\{[^}]*grid-template-columns:\s*1fr/);
  });
});
