// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import type { AgentPort, Checkpoint, RewindScope } from "../port/port";
import { fromHistory, type Item } from "../state/session";
import { SayCard } from "./cards/SayCard";
import { useReplyActions } from "./reply";

afterEach(cleanup);

const checkpoint = (turn: number, msgIndex: number): Checkpoint => ({ turn, msgIndex, prompt: "再试一次", files: 0 });

function draw(items: Item[], checkpoints: Checkpoint[], running = false) {
  const prepareRewind = vi.fn(async (turn: number, _scope: RewindScope) => ({ planId: `plan-${turn}`, canConversation: true }));
  const commitRewind = vi.fn(async (_planId: string) => ({}));
  const submit = vi.fn(async (_text: string) => true);
  const reloadSession = vi.fn(async () => {});
  const port = { prepareRewind, commitRewind } as unknown as AgentPort;
  function Replies() {
    const { reply } = useReplyActions({
      port, items, checkpoints, running, submit, reloadSession,
      onSettings: vi.fn(), onRunDetail: vi.fn(), onError: vi.fn(),
    });
    return <>{items.filter((item): item is Extract<Item, { t: "say" }> => item.t === "say")
      .map((item) => <SayCard key={item.id} item={item} reply={reply} />)}</>;
  }
  render(<Replies />);
  return { prepareRewind, commitRewind, submit, reloadSession };
}

async function retry(index: number) {
  await userEvent.click(screen.getAllByRole("button", { name: "重新生成" })[index]);
  await userEvent.click(screen.getByRole("menuitem", { name: /按当前配置重试/ }));
}

it("rewinds each identical question to its own turn, including several replies in one turn", async () => {
  const items: Item[] = [
    { t: "user", id: "u1", text: "再试一次", msgIndex: 1 },
    { t: "say", id: "a1", text: "答一", done: true },
    { t: "say", id: "a1b", text: "补充", done: true },
    { t: "user", id: "u2", text: "再试一次", msgIndex: 5 },
    { t: "say", id: "a2", text: "答二", done: true },
  ];
  const { prepareRewind, commitRewind, submit } = draw(items, [checkpoint(0, 1), checkpoint(1, 5)]);
  await retry(0);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  await retry(1);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  await retry(2);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(3));
  expect(prepareRewind.mock.calls).toEqual([[0, "conversation"], [0, "conversation"], [1, "conversation"]]);
  expect(commitRewind.mock.calls.map(([plan]) => plan)).toEqual(["plan-0", "plan-0", "plan-1"]);
  expect(submit.mock.calls.map(([text]) => text)).toEqual(["再试一次", "再试一次", "再试一次"]);
});

it("uses restored message indices and sends the restored question", async () => {
  const items = fromHistory([
    { role: "system", content: "sys", msgIndex: 0 },
    { role: "user", content: "第一轮原问题", msgIndex: 1 },
    { role: "assistant", content: "旧回复", msgIndex: 2 },
    { role: "user", content: "第二轮原问题", msgIndex: 5 },
    { role: "assistant", content: "新回复", msgIndex: 6 },
  ]).items;
  const { prepareRewind, submit } = draw(items, [checkpoint(3, 1), checkpoint(8, 5)]);
  await retry(0);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  await retry(1);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(prepareRewind.mock.calls).toEqual([[3, "conversation"], [8, "conversation"]]);
  expect(submit.mock.calls.map(([text]) => text)).toEqual(["第一轮原问题", "第二轮原问题"]);
});

it("removes the superseded reply before sending the original question again", async () => {
  const items: Item[] = [
    { t: "user", id: "u1", text: "原问题", msgIndex: 1 },
    { t: "say", id: "a1", text: "旧回复", done: true },
    { t: "user", id: "u2", text: "后续问题", msgIndex: 5 },
    { t: "say", id: "a2", text: "后续回复", done: true },
  ];
  const order: string[] = [];
  const port = {
    prepareRewind: vi.fn(async () => ({ planId: "first", canConversation: true })),
    commitRewind: vi.fn(async () => ({})),
    history: vi.fn(async () => [{ role: "system" as const, content: "sys", msgIndex: 0 }]),
  } as unknown as AgentPort;
  function Replies() {
    const [visible, setVisible] = useState(items);
    const reloadSession = async () => {
      setVisible(fromHistory(await port.history()).items);
      order.push("reloaded");
    };
    const submit = async (text: string) => {
      order.push("submitted");
      setVisible((rows) => [...rows, { t: "user", id: "resent", text }]);
      return true;
    };
    const { reply } = useReplyActions({
      port, items: visible, checkpoints: [checkpoint(0, 1), checkpoint(1, 5)], running: false,
      submit, reloadSession, onSettings: vi.fn(), onRunDetail: vi.fn(), onError: vi.fn(),
    });
    return <>
      <div data-testid="questions">{visible.filter((i) => i.t === "user").map((i) => i.text).join("|")}</div>
      {visible.filter((i): i is Extract<Item, { t: "say" }> => i.t === "say")
        .map((i) => <SayCard key={i.id} item={i} reply={reply} />)}
    </>;
  }
  const view = render(<Replies />);
  await retry(0);
  await waitFor(() => expect(view.container.querySelectorAll('[data-k="say"]')).toHaveLength(0));
  expect(screen.getByTestId("questions").textContent).toBe("原问题");
  expect(order).toEqual(["reloaded", "submitted"]);
});

it("hides retry when the reply has no checkpoint or a task is running", () => {
  const items: Item[] = [
    { t: "user", id: "u1", text: "一", msgIndex: 1 },
    { t: "say", id: "a1", text: "答一", done: true },
    { t: "user", id: "u2", text: "二", msgIndex: 5 },
    { t: "say", id: "a2", text: "答二", done: true },
  ];
  const view = draw(items, [checkpoint(0, 1)]);
  expect(screen.getAllByRole("button", { name: "重新生成" })).toHaveLength(1);
  view.prepareRewind.mockClear();
  cleanup();
  draw(items, [checkpoint(0, 1), checkpoint(1, 5)], true);
  expect(screen.queryByRole("button", { name: "重新生成" })).toBeNull();
});
