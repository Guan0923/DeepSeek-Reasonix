package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/runtime/completion"
	"reasonix/internal/runtime/taskmonitor"
	"reasonix/internal/safety/evidence"
)

func writeTestFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// The receipt lists what the turn changed and left unchecked. State the host
// wrote itself, a repository's own store and a cache its tool tagged as one are
// not that work, so none of them may reach the card.
func TestReceiptListsOnlyTheWorkProduct(t *testing.T) {
	root := testenv.TempDir(t)
	work := filepath.Join(root, "src", "api.py")
	snapshot := filepath.Join(root, taskmonitor.StoreDir, "20261008-step-5", "snapshot.json")
	cache := filepath.Join(root, ".pytest_cache", "v", "cache", "lastfailed")
	gitfile := filepath.Join(root, ".git")
	untagged := filepath.Join(root, "build", "out.txt")
	writeTestFile(t, work, "x\n")
	writeTestFile(t, snapshot, "{}\n")
	writeTestFile(t, cache, "{}\n")
	writeTestFile(t, filepath.Join(root, ".pytest_cache", "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n")
	writeTestFile(t, gitfile, "gitdir: ../elsewhere\n")
	writeTestFile(t, untagged, "x\n")

	a := &Agent{}
	a.writeWorkspaceRoot = root
	ledger := evidence.NewLedger()
	ledger.Record(evidence.Receipt{
		ToolName: "bash", Success: true, Mutation: true, MutationEvidence: evidence.MutationProven,
		Paths: []string{work, snapshot, cache, gitfile, untagged},
	})
	c := buildShadowContract("fix the download", ledger.Receipts(), nil)
	got := completionReceipt(completion.Build(c, ledger, a.pathInWorkspace))
	if got == nil {
		t.Fatal("a turn that changed files must produce a receipt")
	}
	var paths []string
	for _, ch := range got.Changes {
		paths = append(paths, ch.Path)
	}
	want := []string{work, untagged}
	if len(paths) != len(want) || !strings.EqualFold(paths[0], want[0]) || !strings.EqualFold(paths[1], want[1]) {
		t.Fatalf("changes = %q, want only %q", paths, want)
	}
	for _, g := range got.Gaps {
		if g.Kind == "unreviewed_change" && !strings.EqualFold(g.Detail, work) && !strings.EqualFold(g.Detail, untagged) {
			t.Errorf("gap %+v names state the host or a tool owns", g)
		}
	}
}

// A worktree or submodule keeps `.git` as a file, which the walk used to
// record like any other file.
func TestScanSkipsAVCSStoreKeptAsAFile(t *testing.T) {
	root := testenv.TempDir(t)
	writeTestFile(t, filepath.Join(root, ".git"), "gitdir: ../elsewhere\n")
	writeTestFile(t, filepath.Join(root, "a.py"), "x\n")
	scan := scanWorkspace(t.Context(), root)
	if _, held := scan.state[filepath.Join(root, ".git")]; held {
		t.Fatalf("scan recorded a VCS store file: %v", scan.state)
	}
	if _, held := scan.state[filepath.Join(root, "a.py")]; !held {
		t.Fatalf("scan lost the work file: %v", scan.state)
	}
}
