import { useCallback } from "react";
import type { AgentPort, RewindScope } from "../port/port";

/** Only a rewind that changes the conversation reloads the session.
 *  Code-only rewinds preserve the initiating card and its undo menu. */
export function useRewindActions(port: AgentPort, reloadSession: () => void) {
  const onPrepareRewind = useCallback((turn: number, scope: RewindScope) => port.prepareRewind(turn, scope), [port]);
  const onCommitRewind = useCallback(
    async (planId: string) => {
      const result = await port.commitRewind(planId);
      if (result.conversationOk) reloadSession();
      return result;
    },
    [port, reloadSession],
  );
  const onUndoRewind = useCallback((transactionId: string) => port.undoRewind(transactionId).then(reloadSession), [port, reloadSession]);
  const onPrepareFileRevert = useCallback((path: string) => port.prepareFileRevert(path), [port]);
  const onCommitFileRevert = useCallback((planId: string, resolution?: string) => port.commitFileRevert(planId, resolution), [port]);
  return { onPrepareRewind, onCommitRewind, onUndoRewind, onPrepareFileRevert, onCommitFileRevert };
}
