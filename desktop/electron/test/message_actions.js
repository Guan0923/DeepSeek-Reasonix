"use strict";
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { app, clipboard } = require("electron");
const { checker, listen, scriptedModel, seedHome, settledWindow, until, wait } = require("./livekit");
const { check, failures } = checker();

async function main() {
  const model = await listen(scriptedModel(() => null).handler);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "rx-message-actions-"));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "rx-message-workspace-"));
  process.env.REASONIX_HOME = home;
  seedHome(home, model.url, workspace);
  const { current } = require("../src/main.js");
  let browser;
  const savedClipboard = await clipboard.readText();
  try {
    const win = await settledWindow();
    win.show();
    win.focus();
    const { client, origin } = current();
    const js = (source) => win.webContents.executeJavaScript(source, true);
    const source = (await until("initial runtime", () => client.json("GET", "/runtimes")))[0];
    await until("composer ready", () => js("!!document.querySelector('.compose textarea')"));
    for (const [n, input] of ["1", "请检查这条较长的用户消息，随后从第一轮的最终回复创建对话分支。"].entries()) {
      await js(`(() => { const el=document.querySelector('.compose textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(input)});
        el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      await until("send enabled", () => js("!document.querySelector('button[data-action=\"session.send\"]').disabled"));
      await js("document.querySelector('button[data-action=\"session.send\"]').click()");
      await until("completed reply", async () => {
        const cps = await client.json("GET", source.base + "/checkpoints");
        const status = await client.json("GET", source.base + "/status");
        return cps?.length === n + 1 && cps[n].canFork && status?.running === false;
      });
      check(`submit ${n + 1} through the composer`, true);
    }
    await until("two fork controls", () => js("document.querySelectorAll('[data-action=\"reply.fork\"]').length === 2"));
    const shape = await js(`(() => {
      const r = document.querySelector('.call[data-k="me"]');
      const b = r.querySelector('.txt').getBoundingClientRect();
      const a = r.querySelector('.user-acts').getBoundingClientRect();
      return { gap: Math.abs(b.right-r.getBoundingClientRect().right), below: a.top >= b.bottom, width: b.width,
        names: [...r.querySelectorAll('.user-acts button')].map(e => e.getAttribute('aria-label')) };
    })()`);
    check("single digit is right aligned with only copy and edit below", shape.gap < 1 && shape.below && shape.names.length === 2, shape);
    win.show();
    win.focus();
    win.webContents.focus();
    await until("focused clipboard document", () => js("document.hasFocus()"));
    await js("document.querySelector('.user-acts .copy').click()");
    await until("clipboard copy", async () => await clipboard.readText() === "1");
    check("copy writes the exact user message", await clipboard.readText() === "1");
    await js("document.querySelector('.call[data-k=\"me\"] .txt').dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))");
    await until("double-click editor", () => js("document.querySelector('.reask textarea')?.value === '1'"));
    check("double click edits the single digit", true);
    await js("document.querySelector('[data-value=\"cancel\"]').click()");
    await until("editor cancelled", () => js("!document.querySelector('.reask')"));
    await js("document.querySelector('.user-acts [data-action=\"turn.edit\"]').focus()");
    const debuggerAPI = win.webContents.debugger;
    debuggerAPI.attach("1.3");
    await debuggerAPI.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
    await debuggerAPI.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    debuggerAPI.detach();
    const keyboardOpened = await until("keyboard editor", () => js("!!document.querySelector('.reask textarea')"), 3000).catch(() => false);
    check("keyboard activates the desktop edit button", keyboardOpened, await js("document.activeElement?.outerHTML.slice(0,350)"));
    if (!keyboardOpened) await js("document.querySelector('.user-acts [data-action=\"turn.edit\"]').click()");
    await until("edit button opened", () => js("!!document.querySelector('.reask textarea')"));
    const editorWidth = await js("document.querySelector('.reask textarea').getBoundingClientRect().width");
    check("keyboard edit keeps a usable input width", editorWidth > 150, editorWidth);
    await js("document.querySelector('[data-value=\"cancel\"]').click()");
    await until("cancelled", () => js("!document.querySelector('.reask')"));
    await js("[...document.querySelectorAll('.user-acts [data-action=\"turn.edit\"]')].at(-1).click()");
    await until("second editor", () => js("!!document.querySelector('.reask textarea')"));
    await js(`(() => { const el=document.querySelector('.reask textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'第二条已改写');
      el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await js("document.querySelector('button[data-action=\"turn.resend\"]').click()");
    await until("rewritten turn completed", async () => {
      const history = await client.json("GET", source.base + "/history");
      const status = await client.json("GET", source.base + "/status");
      return history?.filter(m=>m.role === 'user').at(-1)?.content === '第二条已改写' && status?.running === false;
    });
    const rewritten = await until("rewritten UI", () => js(`(() => { const text=[...document.querySelectorAll('.call[data-k="me"] .txt')].map(e=>e.textContent);
      return text.length === 2 && text[1] === '第二条已改写'; })()`));
    check("resend replaces the old turn in both history and visible transcript", rewritten);
    await until("fork controls after rewrite", () => js("document.querySelectorAll('[data-action=\"reply.fork\"]').length === 2"));
    const before = await client.json("GET", source.base + "/history");
    await js("document.querySelector('[data-action=\"reply.fork\"]').click()");
    const views = await until("fork runtime", async () => {
      const list = await client.json("GET", "/runtimes");
      return list?.length === 2 ? list : null;
    });
    const child = views.find(r => r.id !== source.id);
    await until("focused child", () => js(`document.querySelector('.ptab[aria-selected="true"]')?.dataset.pane === ${JSON.stringify(child.id)}`));
    const forked = await client.json("GET", child.base + "/history");
    const after = await client.json("GET", source.base + "/history");
    check("fork includes first reply and excludes the later user turn", forked.filter(m => m.role === "user").length === 1 && forked.at(-1).content === "done", forked.length);
    check("source conversation is unchanged", JSON.stringify(before) === JSON.stringify(after));
    check("fork shares the workspace and opens a separate focused pane", child.root === source.root && child.sessionPath !== source.sessionPath);
    win.setContentSize(540, 780);
    await wait(400);
    const narrow = await js(`(() => { const r = [...document.querySelectorAll('.pane:not([data-off]) .call[data-k="me"]')][0];
      const b=r.querySelector('.txt').getBoundingClientRect(); return Math.abs(b.right-r.getBoundingClientRect().right); })()`);
    check("desktop narrow-window bubble stays right aligned", narrow < 1, narrow);
    fs.writeFileSync(path.join(home, "desktop.png"), (await win.webContents.capturePage()).toPNG());

    const { chromium } = require("../../frontend-next/node_modules/playwright");
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await context.addCookies([{ name: "reasonix_token", value: client.token, url: origin, httpOnly: true }]);
    const page = await context.newPage();
    await page.goto(origin);
    await page.locator(`.ptab[data-pane="${source.id}"][aria-selected="true"]`).waitFor({ state: "attached" });
    const userRow = page.locator('.pane:not([data-off]) .call[data-k="me"]').first();
    await userRow.locator('.txt').dblclick();
    await userRow.locator('.reask textarea').waitFor();
    check("browser double click opens the same editor", await userRow.locator('.reask textarea').inputValue() === "1");
    await userRow.locator('[data-value="cancel"]').click();
    await userRow.locator('.user-acts [data-action="turn.edit"]').press("Enter");
    await userRow.locator('.reask textarea').waitFor();
    check("browser keyboard opens the editor", true);
    await userRow.locator('[data-value="cancel"]').click();
    await page.locator('.pane:not([data-off]) [data-action="reply.fork"]').first().click();
    const browserChild = await until("browser-created fork", async () => {
      const list = await client.json("GET", "/runtimes");
      return list?.length === 3 ? list.find(r => r.id !== source.id && r.id !== child.id) : null;
    });
    await page.locator(`.ptab[data-pane="${browserChild.id}"][aria-selected="true"]`).waitFor({ state: "attached" });
    check("browser fork focuses another new pane", true);
    await page.setViewportSize({ width: 420, height: 780 });
    const row = page.locator('.pane:not([data-off]) .call[data-k="me"]').first();
    const rowBox = await row.boundingBox(), bubble = await row.locator('.txt').boundingBox();
    check("browser narrow-window bubble stays right aligned", Math.abs(rowBox.x+rowBox.width-bubble.x-bubble.width) < 1);
    await page.screenshot({ path: path.join(home, "browser.png") });
    process.stdout.write(`screenshots: ${home}\n`);
  } catch (err) {
    check("message actions completed", false, err.stack);
  } finally {
    await browser?.close();
    await clipboard.writeText(savedClipboard);
    model.server.close();
    process.stdout.write(failures.length ? `${failures.length} check(s) failed\n` : "all message-action checks passed\n");
    const code = failures.length ? 1 : 0;
    app.once("will-quit", (event) => { event.preventDefault(); app.exit(code); });
    app.quit();
    setTimeout(() => app.exit(code), 3000).unref();
  }
}

app.whenReady().then(() => setTimeout(main, 0));
