// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import { MyPackages } from "./MarketPublish";
import { MockPort } from "../port/mock";
import { boot, STORAGE, t } from "../i18n";
import type { AgentPort, MarketPackage } from "../port/port";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.setItem(STORAGE, "zh");
  boot();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it.each(["zh", "en"].flatMap((lang) => ["success", "failure"].map((outcome) => ({ lang, outcome }))))(
  "keeps review submission owned by one row through a $lang $outcome",
  async ({ lang, outcome }) => {
    localStorage.setItem(STORAGE, lang);
    boot();
    const port = new MockPort() as unknown as AgentPort;
    const packages = await Promise.all(["first-draft", "second-draft"].map((name) => port.publishMarket({
      kind: "theme", name, source: "https://github.com/demo/themes", visibility: "private",
    })));
    const first = packages[0]!.package;
    const second = packages[1]!.package;
    const pending = deferred<MarketPackage>();
    const next = deferred<MarketPackage>();
    const submit = vi.spyOn(port, "submitMarket")
      .mockImplementationOnce(() => pending.promise)
      .mockImplementationOnce(() => next.promise);
    render(<MyPackages port={port} onInstalled={() => {}} />);
    const firstRow = (await screen.findByText(first.name)).closest("li")!;
    const secondRow = screen.getByText(second.name).closest("li")!;
    const firstButton = within(firstRow).getByRole<HTMLButtonElement>("button", { name: t("提交审核") });
    const secondButton = within(secondRow).getByRole<HTMLButtonElement>("button", { name: t("提交审核") });

    await userEvent.click(firstButton);
    await userEvent.click(secondButton);
    await userEvent.click(firstButton);
    expect(submit.mock.calls).toEqual([[first.slug]]);
    expect(firstButton.disabled).toBe(true);
    expect(firstButton.textContent).toBe(t("提交中…"));
    expect(secondButton.disabled).toBe(true);
    expect(within(secondRow).getByRole<HTMLButtonElement>("button", { name: t("安装") }).disabled).toBe(false);

    await act(async () => {
      if (outcome === "success") pending.resolve({ ...first, status: "pending" });
      else pending.reject(new Error("review temporarily unavailable"));
    });
    if (outcome === "success") {
      expect(within(firstRow).getByText(t("审核中"))).toBeTruthy();
      expect(firstRow.querySelector('[data-action="market.submit"]')).toBeNull();
    } else {
      expect(firstButton.disabled).toBe(false);
      expect(within(firstRow).getByText("review temporarily unavailable")).toBeTruthy();
      expect(within(secondRow).queryByText("review temporarily unavailable")).toBeNull();
    }
    expect(secondButton.disabled).toBe(false);
    await userEvent.click(secondButton);
    await userEvent.click(secondButton);
    if (outcome === "failure") await userEvent.click(firstButton);
    expect(submit.mock.calls).toEqual([[first.slug], [second.slug]]);
    expect(secondButton.disabled).toBe(true);
    expect(secondButton.textContent).toBe(t("提交中…"));
    await act(async () => next.resolve({ ...second, status: "pending" }));
    expect(within(secondRow).getByText(t("审核中"))).toBeTruthy();
    if (outcome === "failure") {
      await userEvent.click(firstButton);
      expect(submit.mock.calls).toEqual([[first.slug], [second.slug], [first.slug]]);
      expect(within(firstRow).getByText(t("审核中"))).toBeTruthy();
      expect(screen.queryByText("review temporarily unavailable")).toBeNull();
    }
  },
);
