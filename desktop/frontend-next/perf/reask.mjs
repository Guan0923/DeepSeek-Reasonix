// The rewrite box of a sent message: a long paragraph with no line breaks must
// be readable in full without scrolling inside the box, at desktop and phone width.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const PAGE = process.env.PERF_URL ?? "http://localhost:4399/perf.html";
const SHOTS = process.env.REASK_SHOTS ?? fileURLToPath(new URL("shots", import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const TAG = process.env.REASK_TAG ?? "now";
const LONG = "请把这个模块里所有的错误处理统一改成带类型的错误，并且保证调用方可以用 errors.Is 区分每一种失败，同时补上对应的单元测试，再检查文档里提到旧行为的地方是否需要更新，最后给出一份简短的迁移说明，列出每个受影响的函数以及它们各自需要调整的调用点。".repeat(3);

const fails = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  for (const [label, width, height] of [["wide", 1440, 900], ["phone", 390, 800]]) {
    const ctx = await browser.newContext({ locale: "zh-CN", colorScheme: scheme, viewport: { width, height } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fails.push("pageerror: " + e.message));
    await page.goto(PAGE, { waitUntil: "networkidle" });
    await page.waitForSelector(".app", { timeout: 15000 });
    await page.waitForTimeout(600);
    const composer = page.locator(".compose textarea").first();
    await composer.fill(LONG);
    await composer.press("Enter");
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__feed({ kind: "turn_started", authoredTurn: 1, msgIndex: 1 }));
    await page.waitForTimeout(700);
    await page.locator(".reask-open").last().click({ force: true });
    await page.waitForTimeout(500);
    const g = await page.evaluate(() => {
      const el = document.querySelector(".reask textarea");
      if (!el) return null;
      return { h: el.getBoundingClientRect().height, scroll: el.scrollHeight, client: el.clientHeight, view: innerHeight };
    });
    check(`${scheme}/${label}: the rewrite box opened`, !!g);
    if (g) {
      const room = Math.min(g.scroll, g.view * 0.6, 448);
      check(`${scheme}/${label}: long single-line text is visible without scrolling the box`, g.client >= room - 2, `box ${Math.round(g.h)}px, content ${g.scroll}px`);
    }
    await page.locator(".reask").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/reask-${TAG}-${scheme}-${label}.png` });
    await ctx.close();
  }
}
await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);
