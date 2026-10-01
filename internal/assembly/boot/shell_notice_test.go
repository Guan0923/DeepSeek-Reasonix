package boot

import (
	"bytes"
	"strings"
	"testing"

	"reasonix/internal/contract/event"
)

func TestResolveShellWithNoticeReportsFallback(t *testing.T) {
	var stderr bytes.Buffer
	var notices []event.Event
	resolveShellWithNotice("not-a-shell", "", &stderr, event.FuncSink(func(e event.Event) {
		notices = append(notices, e)
	}))

	if !strings.Contains(stderr.String(), "not recognised") {
		t.Fatalf("stderr = %q, want the shell warning", stderr.String())
	}
	if len(notices) != 1 {
		t.Fatalf("notices = %+v, want one load warning", notices)
	}
	got := notices[0]
	if got.Kind != event.Notice || got.Level != event.LevelWarn || got.Audience != event.NoticeAudienceOperator || !strings.Contains(got.Detail, "not recognised") {
		t.Fatalf("notice = %+v, want an operator warning carrying the shell detail", got)
	}
}
