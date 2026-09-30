package serve

import (
	"encoding/json"
	"errors"
	"net/http"

	"reasonix/internal/session/control"
)

func (h *Hub) forkRuntime(w http.ResponseWriter, r *http.Request) {
	rt := h.Get(r.PathValue("id"))
	if rt == nil {
		notFound(w, "runtime", r.PathValue("id"))
		return
	}
	if !rt.Local() {
		refuse(w, http.StatusBadRequest, "fork.local_only", "fork is only available for local conversations", nil)
		return
	}
	var req struct {
		SessionPath string `json:"sessionPath"`
		Turn        int    `json:"turn"`
		MsgIndex    int    `json:"msgIndex"`
		Stamp       string `json:"stamp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badBody(w)
		return
	}
	rt.Server.bindMu.Lock()
	defer rt.Server.bindMu.Unlock()
	ctrl := rt.Server.Controller()
	if controllerHasActiveRuntimeWork(ctrl) {
		busy(w, "fork.busy", "wait for the running turn to finish before forking", nil)
		return
	}
	path, err := ctrl.ForkTurn(req.SessionPath, req.Turn, req.MsgIndex, req.Stamp)
	if err != nil {
		switch {
		case errors.Is(err, control.ErrForkBusy):
			busy(w, "fork.busy", err.Error(), nil)
		case errors.Is(err, control.ErrForkBoundary):
			busy(w, "fork.stale", err.Error(), nil)
		default:
			refuse(w, http.StatusInternalServerError, "fork.failed", err.Error(), nil)
		}
		return
	}
	child, err := h.Open(r.Context(), OpenRequest{Root: rt.Root, SessionPath: path})
	if err != nil {
		refuse(w, http.StatusInternalServerError, "fork.open_failed", "fork was saved but its pane could not be opened: "+err.Error(), map[string]any{"sessionPath": path})
		return
	}
	writeJSON(w, child.view())
}
