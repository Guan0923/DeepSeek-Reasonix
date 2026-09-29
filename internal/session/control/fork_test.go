package control

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"reasonix/internal/state/sessionstore"
)

func TestForkTurnKeepsTheSourceAndCutsAfterTheReply(t *testing.T) {
	c, _, _ := runTwoTurns(t)
	defer c.Close()
	parent := c.SessionPath()
	before := c.History()
	cp := c.Checkpoints()[0]
	path, err := c.ForkTurn(parent, cp.Turn, cp.MsgIndex, cp.Time.Format(time.RFC3339Nano))
	if err != nil {
		t.Fatal(err)
	}
	child, err := sessionstore.LoadSession(path)
	if err != nil {
		t.Fatal(err)
	}
	msgs := child.Snapshot()
	if msgs[len(msgs)-1].Content != "first answer" || len(msgs) >= len(before) {
		t.Fatalf("fork contains the wrong prefix: %+v", msgs)
	}
	if c.SessionPath() != parent || !reflect.DeepEqual(before, c.History()) {
		t.Fatal("fork changed the source conversation")
	}
	meta, _, err := sessionstore.LoadBranchMeta(path)
	if err != nil || meta.ParentID != sessionstore.BranchID(parent) {
		t.Fatalf("fork parent: %+v, %v", meta, err)
	}
	if _, err := c.ForkTurn(parent, cp.Turn, cp.MsgIndex, "stale"); !errors.Is(err, ErrForkBoundary) {
		t.Fatalf("stale checkpoint: %v", err)
	}
	if _, err := c.ForkTurn(parent, cp.Turn, cp.MsgIndex+1, cp.Time.Format(time.RFC3339Nano)); !errors.Is(err, ErrForkBoundary) {
		t.Fatalf("non-checkpoint message boundary: %v", err)
	}
}

func TestForkTurnRefusesRunningConversation(t *testing.T) {
	c, ag, _ := runTwoTurns(t)
	defer c.Close()
	cp := c.Checkpoints()[0]
	release := make(chan struct{})
	c.runner = blockingRunner{session: ag.Session(), release: release}
	done := make(chan error, 1)
	go func() { done <- c.RunTurn(context.Background(), "running") }()
	waitForRunning(t, c)
	_, err := c.ForkTurn(c.SessionPath(), cp.Turn, cp.MsgIndex, cp.Time.Format(time.RFC3339Nano))
	close(release)
	<-done
	if !errors.Is(err, ErrForkBusy) {
		t.Fatalf("fork during a running turn: %v", err)
	}
}
