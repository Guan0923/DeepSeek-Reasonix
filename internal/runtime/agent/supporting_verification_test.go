package agent

import (
	"testing"

	"reasonix/internal/contract/tool"
	"reasonix/internal/runtime/taskpolicy"
	"reasonix/internal/safety/evidence"
	"reasonix/internal/state/instruction"
)

func TestBalancedSupportingVerificationFloor(t *testing.T) {
	for _, tc := range []struct {
		name             string
		baseline         bool
		declared         bool
		captured         bool
		wantVerification int
	}{
		{name: "supporting only"},
		{name: "baseline check", baseline: true, wantVerification: 1},
		{name: "declared check", declared: true, wantVerification: 1},
		{name: "captured criterion", captured: true, wantVerification: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reg := tool.NewRegistry()
			reg.Add(fakeTool{name: "bash"})
			a := &Agent{
				task: taskRuntime{ledger: readinessLedger(evidence.Receipt{ToolName: "write_file", Success: true, Mutation: true, Write: true, MutationEvidence: evidence.MutationProven, Paths: []string{"notes.md"}})},
				svc:  agentServices{tools: reg},
				turn: turnRuntime{policySet: true, policy: taskpolicy.TaskPolicy{Verification: taskpolicy.VerifyTargeted}},
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
			if stale != (tc.wantVerification > 0) {
				t.Errorf("stale verification = %v", stale)
			}
		})
	}
}
