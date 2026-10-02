package boot

import (
	"context"
	"os"
	"strings"
	"sync"
	"testing"

	"reasonix/internal/contract/config"
	"reasonix/internal/contract/event"
	"reasonix/internal/contract/provider"
)

// A settings verb typed into a built controller must reach the frontend sink as
// a notice, persist through the real config path, and never become a model turn.
func TestEffectSettingsSlashStaysOffTheModelAndReachesTheSink(t *testing.T) {
	isolateConfigHome(t)
	dir := robustTempDir(t)
	t.Chdir(dir)
	rec := &effectRecordingProvider{}
	provider.Register("boot-settings-slash", func(provider.Config) (provider.Provider, error) { return rec, nil })
	writeFile(t, dir, "reasonix.toml", `
default_model = "test-model"

[[providers]]
name = "test-model"
kind = "boot-settings-slash"
model = "x"
`)
	approveWorkspace(t, dir)

	var mu sync.Mutex
	var notices []string
	sink := event.FuncSink(func(e event.Event) {
		if e.Kind == event.Notice {
			mu.Lock()
			notices = append(notices, e.Text)
			mu.Unlock()
		}
	})
	ctrl, err := Build(context.Background(), Options{Sink: sink})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	defer ctrl.Close()

	for _, line := range []string{"/sandbox", "/output-style", "/reasoning-language zh", "/currency usd"} {
		ctrl.Submit(line)
	}
	mu.Lock()
	joined := strings.Join(notices, "\n---\n")
	mu.Unlock()
	for _, want := range []string{"OS bash sandbox", "output styles", "reasoning-language set to zh"} {
		if !strings.Contains(joined, want) {
			t.Errorf("sink never saw %q:\n%s", want, joined)
		}
	}
	if n := len(agentRequests(rec.requests())); n != 0 {
		t.Fatalf("%d slash verbs were sent to the model", n)
	}
	raw, err := os.ReadFile(config.UserConfigPath())
	if err != nil {
		t.Fatalf("read stored config: %v", err)
	}
	if !strings.Contains(string(raw), "USD") || !strings.Contains(string(raw), "zh") {
		t.Errorf("settings were not stored:\n%s", raw)
	}
}
