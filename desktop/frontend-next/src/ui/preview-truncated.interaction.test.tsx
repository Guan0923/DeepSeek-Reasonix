// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "./testkit";
import { Candidate } from "./AddPlugin";
import { PlanConfirm } from "./MarketConfirm";
import type { MarketPlan, PluginAction } from "../port/port";

afterEach(cleanup);

const action: PluginAction = { kind: "plugin", name: "notes", action: "install_plugin_package", status: "planned", riskLevel: "high" };
const plan = (over: Partial<MarketPlan>): MarketPlan => ({
  ok: true, applied: false, status: "planned", slug: "demo/notes", version: "1.0.0", planId: "p1", actions: [action], ...over,
});
const draw = (p: MarketPlan) =>
  render(<PlanConfirm slug="demo/notes" plan={p} busy={false} error="" onCancel={() => {}} onInstall={() => {}} />);

it("market confirmation says so when only the plan-level text was cut", () => {
  draw(plan({ previewTruncated: true, warnings: ["w"] }));
  expect(screen.getByTestId("preview-cut")).toBeTruthy();
});

it("market confirmation stays quiet for a complete plan", () => {
  draw(plan({ warnings: ["w"] }));
  expect(screen.queryByTestId("preview-cut")).toBeNull();
});

it("a cut step is marked on its own row", () => {
  const { container } = render(<Candidate a={{ ...action, previewTruncated: true }} />);
  expect(container.textContent).toContain("预览只显示了一部分");
  cleanup();
  const { container: whole } = render(<Candidate a={action} />);
  expect(whole.textContent).not.toContain("预览只显示了一部分");
});
