package control

import (
	"context"

	"reasonix/internal/contract/config"
	"reasonix/internal/state/workspacelease"

	"reasonix/internal/platform/gitstatus"
)

// SwitchWorkspaceBranch checks out another local branch while the workspace
// is idle. Panes in this host share the admission guard; the write lease also
// honors existing cross-process write claims through checkout and summary.
func (c *Controller) SwitchWorkspaceBranch(ctx context.Context, name string) (gitstatus.Info, bool, error) {
	c.commitMu.Lock()
	defer c.commitMu.Unlock()
	releaseWorkspace, err := c.excludeWorkspaceActivity()
	if err != nil {
		return gitstatus.Info{}, false, err
	}
	defer releaseWorkspace()
	c.mu.Lock()
	busy := c.gate.busy()
	c.mu.Unlock()
	if busy {
		return gitstatus.Info{}, false, ErrTurnRunning
	}
	if c.workspaceRepo.Valid() {
		lease, err := workspacelease.New(c.workspaceRepo.WorkTree, config.WorkspaceLeaseDir(), nil)
		if err != nil {
			return gitstatus.Info{}, false, err
		}
		lease.BeginRun()
		defer lease.EndRun()
		if err := lease.AcquireWrite(ctx); err != nil {
			return gitstatus.Info{}, false, err
		}
	}
	if err := gitstatus.SwitchBranch(ctx, c.workspaceRepo, name); err != nil {
		return gitstatus.Info{}, false, err
	}
	info, ok := gitstatus.Summary(ctx, c.workspaceRepo)
	return info, ok, nil
}
