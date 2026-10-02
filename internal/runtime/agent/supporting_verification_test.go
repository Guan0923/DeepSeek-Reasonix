package agent

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"reasonix/internal/contract/tool"
	"reasonix/internal/runtime/completion"
	"reasonix/internal/runtime/taskcontract"
	"reasonix/internal/runtime/taskpolicy"
	"reasonix/internal/safety/evidence"
	"reasonix/internal/state/instruction"
	"reasonix/internal/state/trustedstate"
)

func TestBalancedSupportingVerificationFloor(t *testing.T) {
	for _, tc := range []struct {
		name             string
		baseline         bool
		declared         bool
		captured         bool
		file             string
		incomplete       bool
		failed           bool
		delivery         bool
		wantVerification int
	}{
		{name: "supporting only"},
		{name: "baseline check", baseline: true, wantVerification: 1},
		{name: "declared check", declared: true, wantVerification: 1},
		{name: "captured criterion", captured: true, wantVerification: 1},
		{name: "untouched source", file: "main.go", wantVerification: 1},
		{name: "executable CMake input", file: "CMakeLists.txt", wantVerification: 1},
		{name: "uppercase Go test", file: "main_TEST.go", wantVerification: 1},
		{name: "uppercase document", file: "TODO.MD", wantVerification: 1},
		{name: "incomplete observation", incomplete: true, wantVerification: 1},
		{name: "failed observation", failed: true, wantVerification: 1},
		{name: "delivery", delivery: true, wantVerification: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reg := tool.NewRegistry()
			reg.Add(fakeTool{name: "bash"})
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, "notes.md"), []byte("A neutral note."), 0o600); err != nil {
				t.Fatal(err)
			}
			if tc.file != "" {
				if err := os.WriteFile(filepath.Join(root, tc.file), []byte("neutral"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			a := &Agent{
				task: taskRuntime{ledger: readinessLedger(evidence.Receipt{ToolName: "write_file", Success: true, Mutation: true, Write: true, MutationEvidence: evidence.MutationProven, Paths: []string{"notes.md"}})},
				svc:  agentServices{tools: reg},
				turn: turnRuntime{policySet: true, policy: taskpolicy.TaskPolicy{Verification: taskpolicy.VerifyTargeted}},
			}
			a.observeRoot = root
			a.writeWorkspaceRoot = root
			a.deliveryProfile = tc.delivery
			if tc.incomplete {
				scan := scanWorkspaceTo(t.Context(), root, 0)
				if scan.complete || !scan.overLimit {
					t.Fatal("expected incomplete observation")
				}
				a.task.overScanLimit = new(atomic.Bool)
				a.task.noteWorkspaceOverScanLimit()
			}
			if tc.failed {
				a.observeRoot = filepath.Join(root, "missing")
			}
			if tc.baseline {
				a.task.checkpoint.BaselineChecks = []string{"go test ./..."}
			}
			if tc.declared {
				a.projectChecks = []instruction.VerifyCheck{{Command: "go test ./..."}}
			}
			if tc.captured {
				a.task.baselineCriteria = map[string]evidence.TestCriterion{"a_test.go": {}}
			}
			if got := a.finalReadinessCheckFor().missingVerification; got != tc.wantVerification {
				t.Errorf("missing verification = %d, want %d", got, tc.wantVerification)
			}
			stale := false
			for _, o := range a.obligations() {
				if o.Kind == evidence.ObligationStaleVerification {
					stale = true
				}
			}
			if stale != (tc.wantVerification > 0 || tc.delivery) {
				t.Errorf("stale verification = %v", stale)
			}
		})
	}
}

func TestProseObservationCacheFollowsMutationEpoch(t *testing.T) {
	root := t.TempDir()
	write := func(name string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(root, name), []byte("neutral"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("notes.md")
	note := evidence.Receipt{Success: true, Write: true, Mutation: true, MutationEvidence: evidence.MutationProven, Paths: []string{"notes.md"}}
	a := &Agent{task: taskRuntime{ledger: readinessLedger(note), workspaceProse: new(workspaceProseCache)}}
	a.observeRoot = root
	if !a.workspaceIsProseOnly() {
		t.Fatal("complete prose observation did not waive verification")
	}
	write("main.go")
	if !a.workspaceIsProseOnly() {
		t.Fatal("observation was not cached for its mutation epoch")
	}
	a.task.ledger.Record(evidence.Receipt{Success: true, Write: true, Mutation: true, MutationEvidence: evidence.MutationProven, Paths: []string{"main.go"}})
	if a.workspaceIsProseOnly() {
		t.Fatal("new mutation reused a stale prose observation")
	}
}

func TestProseScanRejectsIncompleteObservation(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"notes.md", "todo.md"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("neutral"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if scanWorkspaceTo(t.Context(), root, 1).proseOnly() {
		t.Fatal("incomplete observation waived verification")
	}
	if !scanWorkspace(t.Context(), root).proseOnly() {
		t.Fatal("complete prose observation rejected")
	}
}

func TestProseScanRejectsLinks(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "main.go")
	if err := os.WriteFile(outside, []byte("package fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "alias.md")); err != nil {
		t.Skipf("symlink creation unavailable (Windows requires privilege or Developer Mode): %v", err)
	}
	if scanWorkspace(t.Context(), root).proseOnly() {
		t.Fatal("prose alias to external code waived verification")
	}
}

func TestDeliveryProseDebtSurvivesEvidenceSeal(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "notes.md"), []byte("neutral"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := trustedstate.Open(t.TempDir(), nil)
	a, sink := contractAgent(t, &scriptedProvider{}, "", store)
	a.observeRoot = root
	a.deliveryProfile = true
	a.task.ledger.Record(evidence.Receipt{ToolName: "write_file", Success: true, Write: true, Mutation: true, MutationEvidence: evidence.MutationProven, Paths: []string{"notes.md"}})
	a.sealShadowBundle("write a neutral note", taskcontract.New("write a neutral note"), completion.Report{}, a.task.ledger.Receipts(), false)
	if got := sealedVerdict(t, store, sink.last(t).Record, "stale_verification@0"); got != "owed" {
		t.Fatalf("sealed prose debt = %q, want owed", got)
	}
}
