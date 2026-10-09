package control

import (
	"context"
	"sync"

	"reasonix/internal/state/workspacelease"
	"reasonix/internal/tools/jobs"
)

type workspaceActivity struct {
	mu           sync.Mutex
	readers      int
	checkout     chan struct{}
	inboxWaiters map[*Controller]struct{}
	references   int
}

var workspaceActivities = struct {
	sync.Mutex
	entries map[string]*workspaceActivity
}{entries: make(map[string]*workspaceActivity)}

// Entries live only while an operation owns or is waiting for its guard.
func (c *Controller) workspaceActivity() (*workspaceActivity, func(), error) {
	root := c.workspaceRepo.WorkTree
	if root == "" {
		root = c.workspaceRoot
	}
	if root == "" {
		return nil, func() {}, nil
	}
	key, err := workspacelease.CanonicalWorkspace(root)
	if err != nil {
		return nil, nil, err
	}
	workspaceActivities.Lock()
	activity := workspaceActivities.entries[key]
	if activity == nil {
		activity = &workspaceActivity{}
		workspaceActivities.entries[key] = activity
	}
	activity.references++
	workspaceActivities.Unlock()
	return activity, func() {
		workspaceActivities.Lock()
		defer workspaceActivities.Unlock()
		activity.references--
		if activity.references == 0 {
			delete(workspaceActivities.entries, key)
		}
	}, nil
}

func (c *Controller) holdWorkspaceActivity(ctx context.Context) (func(), error) {
	return c.acquireWorkspaceActivity(ctx, true)
}

func (c *Controller) tryWorkspaceActivity() (func(), error) {
	return c.acquireWorkspaceActivity(context.Background(), false)
}

func (c *Controller) acquireWorkspaceActivity(ctx context.Context, wait bool) (func(), error) {
	activity, release, err := c.workspaceActivity()
	if err != nil {
		return nil, err
	}
	if activity == nil {
		return release, nil
	}
	for {
		if err := ctx.Err(); err != nil {
			release()
			return nil, err
		}
		activity.mu.Lock()
		done := activity.checkout
		if done == nil {
			activity.readers++
			activity.mu.Unlock()
			return func() {
				activity.mu.Lock()
				activity.readers--
				activity.mu.Unlock()
				release()
			}, nil
		}
		activity.mu.Unlock()
		if !wait {
			release()
			return nil, ErrTurnRunning
		}
		select {
		case <-ctx.Done():
			release()
			return nil, ctx.Err()
		case <-done:
		}
	}
}

func (c *Controller) excludeWorkspaceActivity() (func(), error) {
	activity, release, err := c.workspaceActivity()
	if err != nil {
		return nil, err
	}
	if activity == nil {
		return release, nil
	}
	activity.mu.Lock()
	if activity.readers != 0 || activity.checkout != nil {
		activity.mu.Unlock()
		release()
		return nil, ErrTurnRunning
	}
	activity.checkout = make(chan struct{})
	activity.mu.Unlock()
	return func() {
		activity.mu.Lock()
		close(activity.checkout)
		activity.checkout = nil
		waiters := activity.inboxWaiters
		activity.inboxWaiters = nil
		activity.mu.Unlock()
		release()
		for waiting := range waiters {
			go waiting.maybeDispatchInbox()
		}
	}, nil
}

// A retry reads the durable queue again; no user input body waits in memory.
func (c *Controller) resumeInboxAfterWorkspaceCheckout() {
	activity, release, err := c.workspaceActivity()
	if err != nil {
		c.notice("input remains queued: workspace unavailable: " + err.Error())
		return
	}
	defer release()
	if activity != nil {
		activity.mu.Lock()
		if activity.checkout != nil {
			if activity.inboxWaiters == nil {
				activity.inboxWaiters = make(map[*Controller]struct{})
			}
			activity.inboxWaiters[c] = struct{}{}
			activity.mu.Unlock()
			return
		}
		activity.mu.Unlock()
	}
	go c.maybeDispatchInbox()
}

// Cancellation does not end a background process; its done channel does.
func (c *Controller) releaseWorkspaceTurn(release func()) {
	if release == nil {
		return
	}
	if c.jobs == nil || !c.jobs.HasUnfinishedForSession("") {
		release()
		return
	}
	go func() {
		defer release()
		for {
			running := c.jobs.Running()
			if len(running) == 0 {
				return
			}
			ids := make([]string, len(running))
			for i, j := range running {
				ids[i] = j.ID
			}
			c.jobs.Wait(context.Background(), ids, jobs.WaitOptions{})
		}
	}()
}
