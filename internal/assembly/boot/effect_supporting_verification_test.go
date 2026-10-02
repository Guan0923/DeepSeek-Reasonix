package boot

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"reasonix/internal/contract/event"
	"reasonix/internal/runtime/agent"
	"reasonix/internal/runtime/agent/testutil"
	"reasonix/internal/session/control"
)

func TestEffectSupportingWritesWithoutChecksMayFinish(t *testing.T) {
	for _, tc := range []struct {
		name  string
		code  bool
		check bool
	}{
		{name: "markdown only"},
		{name: "markdown and code", code: true},
		{name: "markdown with declared check", check: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			isolateConfigHome(t)
			dir := robustTempDir(t)
			t.Chdir(dir)
			writeUserConfig(t, userModel)
			registerBootTokenProfileTestProvider()
			writeFile(t, dir, "reasonix.toml", "[codegraph]\nenabled = false\n")
			if tc.check {
				writeFile(t, dir, "AGENTS.md", "## Reasonix host checks\n\n- verify: go test ./...\n")
			}
			approveWorkspace(t, dir)
			turns := []testutil.Turn{call("notes", "write_file", `{"path":"notes.md","content":"A neutral note.\n"}`)}
			if tc.code {
				turns = append(turns, call("code", "write_file", `{"path":"main.go","content":"package main\n"}`))
			}
			turns = append(turns, testutil.Turn{Text: "done"})
			prov := testutil.NewMock("supporting", turns...)
			setBootTokenProfileTestProvider(t, prov)
			ctrl, err := Build(context.Background(), Options{WorkspaceRoot: dir, Sink: event.Discard, HeadlessApprovalMode: control.ToolApprovalAuto})
			if err != nil {
				t.Fatal(err)
			}
			defer ctrl.Close()
			err = ctrl.Run(context.Background(), "write the requested files")
			wantDebt := tc.code || tc.check
			var unready *agent.FinalReadinessError
			if wantDebt {
				if !errors.As(err, &unready) {
					t.Errorf("Run = %v, want readiness error", err)
				} else if !slices.Contains(unready.Missing, "verification") {
					t.Errorf("missing = %v, want verification", unready.Missing)
				} else if tc.check && !slices.Contains(unready.Missing, "project_check") {
					t.Errorf("missing = %v, want declared project check", unready.Missing)
				}
			} else if err != nil {
				t.Errorf("Run = %v, want completion", err)
			}
			id := "notes"
			if tc.code {
				id = "code"
			}
			result := toolResults(prov.Requests())[id]
			if debt := strings.Contains(result, "stale_verification"); debt != wantDebt {
				t.Errorf("stale_verification = %v, want %v; result: %s", debt, wantDebt, result)
			}
			if _, err := os.Stat(filepath.Join(dir, "notes.md")); err != nil {
				t.Fatal(err)
			}
		})
	}
}
