// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import { App } from "./App";
import { MockHub } from "../port/mock_hub";
import { boot, STORAGE } from "../i18n";
import type { Checkpoint } from "../port/port";

vi.mock("./Pane", () => ({
  Pane: ({ active, onFork }: { active: boolean; onFork?: (checkpoint: Checkpoint) => Promise<void> }) =>
    active && onFork ? <button onClick={() => void onFork({ turn: 0, msgIndex: 1, stamp: "stamp", prompt: "question", files: 1 })}>create fork</button> : null,
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  localStorage.setItem(STORAGE, "zh");
  boot();
});

it.each([
  { pref: "zh", system: "en-US", title: "项目分析(分支)" },
  { pref: "en", system: "zh-CN", title: "项目分析 (branch)" },
  { pref: "auto", system: "zh-Hant", title: "项目分析(分支)" },
  { pref: "auto", system: "en-US", title: "项目分析 (branch)" },
])("names a fork using $pref with system $system", async ({ pref, system, title }) => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue([system]);
  localStorage.setItem(STORAGE, pref);
  boot();
  const kernel = new MockHub();
  const source = (await kernel.runtimes())[0];
  const portFor = kernel.portFor.bind(kernel);
  kernel.portFor = (rt) => {
    const port = portFor(rt);
    port.providerSetup = async () => null;
    const appearance = port.appearance.bind(port);
    port.appearance = async () => ({ ...await appearance(), language: pref });
    return port;
  };
  let renamed = "";
  const rename = vi.spyOn(kernel, "renameSession").mockImplementation(async (_path, name) => { renamed = name; });
  vi.spyOn(kernel, "fork").mockImplementation(async () => kernel.open({ root: source.root, sessionPath: "/sessions/fork.jsonl" }));
  vi.spyOn(kernel, "tree").mockImplementation(async () => [{
    root: source.root, name: source.name, remembered: true,
    sessions: (await kernel.runtimes()).map((rt) => ({
      path: rt.sessionPath!, name: rt.id, title: rt.id === source.id ? "项目分析" : renamed,
      runtimeId: rt.id, turns: 2,
    })),
  }]);
  render(<App hub={kernel} />);
  await waitFor(() => expect(document.querySelector(".crumb b")?.textContent).toBe("项目分析"));
  await userEvent.click(await screen.findByRole("button", { name: "create fork" }));
  await waitFor(() => expect(rename).toHaveBeenCalledExactlyOnceWith("/sessions/fork.jsonl", title));
  await waitFor(() => expect(document.querySelector(".crumb b")?.textContent).toBe(title));
});
