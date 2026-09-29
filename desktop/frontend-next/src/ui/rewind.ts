import { useCallback } from "react";
import type { AgentPort } from "../port/port";

export function useRewindActions(port: AgentPort) {
  const onPrepareFileRevert = useCallback((path: string) => port.prepareFileRevert(path), [port]);
  const onCommitFileRevert = useCallback((planId: string, resolution?: string) => port.commitFileRevert(planId, resolution), [port]);
  return { onPrepareFileRevert, onCommitFileRevert };
}
