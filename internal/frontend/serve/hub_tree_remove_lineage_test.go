package serve

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestRemoveRecoveryRowRemovesItsWholeLineage(t *testing.T) {
	root, _, lineage := seedLegacyRecoveryRow(t)
	h := NewHub(HubOptions{})
	hubRuntime(t, h, root)
	srv := httptest.NewServer(operatorHandler(h))
	defer srv.Close()

	tree := hubGet[[]treeWorkspace](t, srv, "/tree")
	if len(tree) != 1 || len(tree[0].Sessions) != 1 {
		t.Fatalf("/tree = %+v, want one folded row", tree)
	}
	resp := postRemoveSession(t, srv, tree[0].Sessions[0].Path)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("remove = %d, want 204", resp.StatusCode)
	}

	tree = hubGet[[]treeWorkspace](t, srv, "/tree")
	for _, ws := range tree {
		for _, s := range ws.Sessions {
			t.Errorf("row %s (%d turns, %d copies) survived deleting its folded row", s.Name, s.Turns, len(s.Copies))
		}
	}
	for _, p := range lineage {
		if _, err := os.Stat(p); err == nil {
			t.Logf("sibling still on disk: %s", p)
		}
	}
}
