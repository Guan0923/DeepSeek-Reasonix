package cli

import (
	"path/filepath"
	"strings"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/ext/pluginpkg"
)

func TestPluginDoctorWarnsAboutFileAgentRootWhenDisabled(t *testing.T) {
	home := testenv.TempDir(t)
	t.Setenv("REASONIX_HOME", home)
	root := pluginpkg.InstallRoot(home, "root-warning-kit")
	writePluginTestFile(t, filepath.Join(root, pluginpkg.NativeManifest), `{"apiVersion":"reasonix.io/plugin/v2","name":"root-warning-kit","contributes":{"agents":["agents/reviewer.md"]}}`)
	writePluginTestFile(t, filepath.Join(root, "agents", "reviewer.md"), "---\nname: reviewer\ndescription: Review changes\n---\nRead the diff")
	for _, enabled := range []bool{true, false} {
		if err := pluginpkg.Upsert(home, pluginpkg.InstalledPlugin{Name: "root-warning-kit", Root: pluginpkg.RelativeRoot(home, root), ManifestKind: "reasonix", Enabled: enabled}); err != nil {
			t.Fatal(err)
		}
		for _, subcommand := range []string{"doctor", "show"} {
			out := captureStdout(t, func() {
				if rc := pluginCommand([]string{subcommand, "root-warning-kit"}); rc != 0 {
					t.Fatalf("%s rc=%d", subcommand, rc)
				}
			})
			if !strings.Contains(out, `warning: agents path "agents/reviewer.md" is not a directory`) {
				t.Errorf("enabled=%v %s omits root warning:\n%s", enabled, subcommand, out)
			}
		}
	}
}
