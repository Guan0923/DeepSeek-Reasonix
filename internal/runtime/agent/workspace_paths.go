package agent

import "reasonix/internal/contract/tool"

func (a *Agent) workspaceWritePaths(plan *toolCallPlan) []string {
	if toolHooksMayMutateWorkspace(a.svc.hooks) || plan.runTool == nil {
		return nil
	}
	if !tool.WritesNamedPaths(plan.runTool) || !pathBoundWriterNames[plan.runTool.Name()] {
		return nil
	}
	paths, err := extractWritePathsFromArgs(plan.runTool.Name(), a.writeWorkspaceRoot, plan.runArgs)
	if err != nil {
		return nil
	}
	return paths
}
