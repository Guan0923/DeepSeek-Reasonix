package serve

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"reasonix/internal/state/sessionstore"
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

func foldedRow(t *testing.T, srv *httptest.Server) treeSession {
	t.Helper()
	tree := hubGet[[]treeWorkspace](t, srv, "/tree")
	for _, ws := range tree {
		for _, s := range ws.Sessions {
			if len(s.Copies) > 0 {
				return s
			}
		}
	}
	t.Fatalf("/tree = %+v, want a folded recovery row", tree)
	return treeSession{}
}

func TestRemoveRecoveryRowKeepsASiblingAPaneHasOpen(t *testing.T) {
	root, _, lineage := seedLegacyRecoveryRow(t)
	h := NewHub(HubOptions{})
	rt := hubRuntime(t, h, root)
	openPath := lineage[0]
	rt.Server.Controller().SetSessionPath(openPath)
	srv := httptest.NewServer(operatorHandler(h))
	defer srv.Close()

	row := foldedRow(t, srv)
	resp := postRemoveSession(t, srv, row.Path)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("remove = %d, want 204", resp.StatusCode)
	}
	if _, err := os.Stat(openPath); err != nil {
		t.Errorf("open sibling was deleted with its folded row: %v", err)
	}
	for _, p := range lineage {
		if p == openPath {
			continue
		}
		if _, err := os.Stat(p); err == nil {
			t.Errorf("closed sibling survived: %s", filepath.Base(p))
		}
	}
}

func TestRemoveRecoveryRowRemovesTheLeadsVersions(t *testing.T) {
	root, dir, _ := seedLegacyRecoveryRow(t)
	h := NewHub(HubOptions{})
	hubRuntime(t, h, root)
	srv := httptest.NewServer(operatorHandler(h))
	defer srv.Close()

	row := foldedRow(t, srv)
	version := filepath.Join(dir, "20260803-150000-version.jsonl")
	writeSessionAt(t, version)
	if err := sessionstore.SaveBranchMeta(version, sessionstore.BranchMeta{
		Superseded: true, ParentID: sessionstore.BranchID(row.Path),
	}); err != nil {
		t.Fatal(err)
	}
	if got := sessionstore.SessionVersionPaths(row.Path); len(got) != 1 {
		t.Fatalf("seeded versions = %v, want the one cut from the lead", got)
	}

	resp := postRemoveSession(t, srv, row.Path)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("remove = %d, want 204", resp.StatusCode)
	}
	if _, err := os.Stat(version); !os.IsNotExist(err) {
		t.Errorf("the lead's version outlived its row: %v", err)
	}
}

func TestRemoveRecoveryRowRefusesWhenASiblingIsHeld(t *testing.T) {
	root, _, lineage := seedLegacyRecoveryRow(t)
	h := NewHub(HubOptions{})
	hubRuntime(t, h, root)
	srv := httptest.NewServer(operatorHandler(h))
	defer srv.Close()

	row := foldedRow(t, srv)
	held := lineage[1]
	if held == row.Path {
		held = lineage[2]
	}
	lease, err := sessionstore.TryAcquireSessionLease(held)
	if err != nil {
		t.Fatalf("TryAcquireSessionLease: %v", err)
	}
	defer lease.Release()

	resp := postRemoveSession(t, srv, row.Path)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("remove = %d, want 409 while a sibling is held", resp.StatusCode)
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Code != "session.in_use" {
		t.Errorf("refusal code = %q, want session.in_use", body.Code)
	}
	if _, err := os.Stat(held); err != nil {
		t.Errorf("held sibling erased despite the refusal: %v", err)
	}
}
