//go:build darwin || linux

package pluginpkg

import (
	"path/filepath"
	"syscall"
	"testing"

	"reasonix/internal/base/testenv"
)

func TestAgentInventorySkipsNamedPipeSources(t *testing.T) {
	root := testenv.TempDir(t)
	writeTestFile(t, filepath.Join(root, NativeManifest), `{"apiVersion":"reasonix.io/plugin/v2","name":"pipe-agents","contributes":{"agents":["agents"]}}`)
	writeTestFile(t, filepath.Join(root, "agents", "ordinary.md"), "---\ndescription: Ordinary profile\n---\nORDINARY")
	if err := syscall.Mkfifo(filepath.Join(root, "agents", "pipe.md"), 0o600); err != nil {
		t.Fatal(err)
	}
	pkg, _, err := ParseDir(root)
	if err != nil {
		t.Fatal(err)
	}
	agents := pkg.Inventory().Agents
	if len(agents) != 1 || agents[0].Name != "ordinary" {
		t.Fatalf("inventory=%+v", agents)
	}
}
