// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import type { AgentPort, RewindScope } from "../port/port";
import { fromHistory } from "../state/session";
import { RewindControl } from "./cards/RewindControl";
import { useRewindActions } from "./rewind";

afterEach(cleanup);

function draw(scope: RewindScope) {
  const history = [{ role: "user" as const, content: "修改文件", msgIndex: 0 }];
  const reloadSession = vi.fn();
  const undoRewind = vi.fn(async (_transactionId: string) => {});
  const port = {
    prepareRewind: vi.fn(async () => ({ planId: "plan-0", fileCount: 1, requiresConfirmation: false })),
    commitRewind: vi.fn(async () => ({ ok: true, conversationOk: scope !== "code", undoAvailable: true, transactionId: "tx-0" })),
    undoRewind,
  } as unknown as AgentPort;

  function Rewind() {
    const [items, setItems] = useState(() => fromHistory(history).items);
    const actions = useRewindActions(port, () => {
      reloadSession();
      setItems(fromHistory(history).items);
    });
    return <RewindControl
      key={items[0].id}
      cp={{ turn: 0, prompt: "修改文件", files: 1, msgIndex: 0 }}
      onPrepare={actions.onPrepareRewind}
      onCommit={actions.onCommitRewind}
      onUndo={actions.onUndoRewind}
    />;
  }

  render(<Rewind />);
  return { reloadSession, undoRewind };
}

it("keeps the undo entry after a code-only rewind without rebuilding history", async () => {
  const { reloadSession, undoRewind } = draw("code");
  await userEvent.click(screen.getByRole("button", { name: "回到这里" }));
  await userEvent.click(screen.getByRole("menuitem", { name: /只还原代码/ }));
  const undo = await screen.findByRole("menuitem", { name: "撤销这次还原" });
  expect(reloadSession).not.toHaveBeenCalled();
  await userEvent.click(undo);
  await waitFor(() => expect(undoRewind).toHaveBeenCalledWith("tx-0"));
});

it.each([
  { scope: "conversation" as const, label: "只回退对话" },
  { scope: "both" as const, label: "代码和对话" },
])("reloads history after a $scope rewind", async ({ scope, label }) => {
  const { reloadSession } = draw(scope);
  await userEvent.click(screen.getByRole("button", { name: "回到这里" }));
  await userEvent.click(screen.getByRole("menuitem", { name: new RegExp(label) }));
  await waitFor(() => expect(reloadSession).toHaveBeenCalledTimes(1));
});
