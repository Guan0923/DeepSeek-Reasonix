package serve

import (
	"net/http"
	"strings"

	"reasonix/internal/base/i18n"
	"reasonix/internal/contract/config"
	"reasonix/internal/contract/event"
)

// reloadCommand answers a typed /reload by rebuilding the runtime in place. A
// refusal reaches the caller; success is announced as a notice because the
// request itself carries no body.
func (s *Server) reloadCommand(w http.ResponseWriter, r *http.Request, trimmed string) bool {
	if trimmed != "/reload" {
		return false
	}
	if err := s.reloadExtensions(r.Context()); err != nil {
		writeErr(w, http.StatusConflict, err)
		return true
	}
	s.bc.Emit(event.Event{Kind: event.Notice, Level: event.LevelInfo, Text: i18n.M.RuntimeReloaded})
	w.WriteHeader(http.StatusNoContent)
	return true
}

// afterSubmitCommand applies what a controller verb stored but the session
// ledger reads from the broadcaster: a /currency choice takes effect on the
// next cost line without a rebuild.
func (s *Server) afterSubmitCommand(trimmed string) {
	if f := strings.Fields(trimmed); len(f) != 2 || f[0] != "/currency" {
		return
	}
	if cfg, err := config.Load(); err == nil {
		s.bc.SetDisplayCurrency(cfg.ExplicitDisplayCurrency())
	}
}
