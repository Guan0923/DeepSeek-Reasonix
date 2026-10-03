package boot

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"reasonix/internal/contract/provider"
	"reasonix/internal/session/control"
)

func TestEffectWideWorkspaceSnapshotResourceBound(t *testing.T) {
	isolateConfigHome(t)
	dir := robustTempDir(t)
	t.Chdir(dir)
	for i := range 1024 {
		path := filepath.Join(dir, "node_modules", fmt.Sprintf("d%04d", i), "child")
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	resolver := &provider.StaticResolver{
		Descriptors: []provider.Descriptor{{Ref: "fixture/chat", Model: "chat", Default: true}},
		Providers:   map[string]provider.Provider{"fixture/chat": &scriptedProvider{}},
	}
	approveWorkspace(t, dir)
	sink := &bundleAuditSink{}
	ctrl, err := Build(t.Context(), Options{WorkspaceRoot: dir, Sink: sink, ProviderResolver: resolver, HeadlessApprovalMode: control.ToolApprovalAuto})
	if err != nil {
		t.Fatal(err)
	}
	defer ctrl.Close()
	baseline := runtime.NumGoroutine()
	done := make(chan error, 1)
	go func() { done <- ctrl.Run(context.Background(), "reply") }()
	peak := baseline
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case err := <-done:
			if err != nil {
				t.Fatal(err)
			}
			audits := sink.audits()
			if len(audits) != 1 || !audits[0].Sealed || !audits[0].SnapshotComplete {
				t.Fatalf("audits = %+v", audits)
			}
			if peak-baseline > 64 {
				t.Fatalf("turn goroutine growth = %d, want <= 64 including host background work", peak-baseline)
			}
			return
		case <-tick.C:
			peak = max(peak, runtime.NumGoroutine())
		}
	}
}
