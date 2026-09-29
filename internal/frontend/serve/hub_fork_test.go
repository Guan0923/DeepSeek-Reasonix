package serve

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"reasonix/internal/base/testenv"
	"reasonix/internal/contract/config"
	"reasonix/internal/contract/event"
	"reasonix/internal/contract/tool"
	"reasonix/internal/runtime/agent"
	"reasonix/internal/session/control"
	"reasonix/internal/state/sessionstore"
)

func TestHubForkOpensTheCompletedPrefixInAnotherRuntime(t *testing.T) {
	writeOpenableConfig(t)
	root := testenv.TempDir(t)
	ag := agent.New(&turnIdentityProvider{}, tool.NewRegistry(), sessionstore.NewSession("sys"), agent.Options{}, event.Discard)
	ctrl := control.New(control.Options{Runner: ag, Executor: ag, WorkspaceRoot: root,
		SessionDir: SessionDirFor(root), SessionPath: filepath.Join(SessionDirFor(root), "source.jsonl")})
	h := NewHub(HubOptions{})
	defer h.Shutdown()
	bc := NewBroadcaster()
	rt, err := h.Adopt(New(ctrl, bc, config.ServeConfig{}), bc)
	if err != nil {
		t.Fatal(err)
	}
	for _, prompt := range []string{"first", "second"} {
		if err := ctrl.Run(context.Background(), prompt); err != nil {
			t.Fatal(err)
		}
	}
	cp := ctrl.Checkpoints()[0]
	parent := ctrl.SessionPath()
	body, _ := json.Marshal(map[string]any{"sessionPath": parent, "turn": cp.Turn,
		"msgIndex": cp.MsgIndex, "stamp": cp.Time.Format(time.RFC3339Nano)})
	srv := httptest.NewServer(operatorHandler(h))
	defer srv.Close()
	res, err := http.Post(srv.URL+"/runtimes/"+rt.ID+"/fork", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("fork status %d", res.StatusCode)
	}
	var child RuntimeView
	if err := json.NewDecoder(res.Body).Decode(&child); err != nil {
		t.Fatal(err)
	}
	if child.ID == rt.ID || child.Root != root || ctrl.SessionPath() != parent || len(h.List()) != 2 {
		t.Fatalf("fork did not open separately: %+v", child)
	}
	msgs := h.Get(child.ID).Server.Controller().History()
	if msgs[len(msgs)-1].Content != "answered" || len(msgs) >= len(ctrl.History()) {
		t.Fatalf("wrong child history: %+v", msgs)
	}
}
