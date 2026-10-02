package evidence

import (
	"slices"
	"testing"
)

func TestSupportingVerificationExemptionRequiresProvenScope(t *testing.T) {
	note := Receipt{ToolName: "write_file", Success: true, Write: true, Mutation: true, MutationEvidence: MutationProven, Paths: []string{"notes.md"}}
	for _, tc := range []struct {
		name     string
		extra    []Receipt
		checks   []string
		wantDebt bool
	}{
		{name: "supporting only"},
		{name: "declared check", checks: []string{"go test ./..."}, wantDebt: true},
		{name: "code before supporting", extra: []Receipt{{ToolName: "write_file", Success: true, Write: true, Mutation: true, MutationEvidence: MutationProven, Paths: []string{"main.go"}}}, wantDebt: true},
		{name: "opaque", extra: []Receipt{{ToolName: "mcp__ops__write", Success: true, Mutation: true, MutationEvidence: MutationProven}}, wantDebt: true},
		{name: "unproven supporting", extra: []Receipt{{ToolName: "bash", Success: true, Mutation: true, MutationEvidence: MutationUnknown, Paths: []string{"other.md"}}}, wantDebt: true},
		{name: "partial observed scope", extra: []Receipt{{ToolName: "bash", Success: true, Mutation: true, MutationEvidence: MutationProven, Paths: []string{"other.md"}}}, wantDebt: true},
		{name: "complete observed supporting", extra: []Receipt{{ToolName: "bash", Success: true, Mutation: true, MutationEvidence: MutationProven, PathsComplete: true, Paths: []string{"other.md"}}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			l := ledgerOf(append(tc.extra, note)...)
			if debt := slices.Contains(owed(l, tc.checks...), ObligationStaleVerification); debt != tc.wantDebt {
				t.Fatalf("stale_verification = %v, want %v", debt, tc.wantDebt)
			}
		})
	}
}
