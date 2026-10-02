package mcpsetup

import (
	"reflect"
	"strings"
	"testing"
)

func TestNodeServerNameUsesScriptEntryPoint(t *testing.T) {
	for _, tc := range []struct {
		args []string
		name string
	}{
		{[]string{"reasonix_server.js", "client-mode"}, "reasonix-server"},
		{[]string{"--require", "./preload.cjs", "reasonix_server.js", "client-mode"}, "reasonix-server"},
		{[]string{"-r", "./preload.cjs", "reasonix_server.js", "client-mode"}, "reasonix-server"},
		{[]string{"--require=./preload.cjs", "reasonix_server.js", "client-mode"}, "reasonix-server"},
		{[]string{"--import", "./preload.mjs", "reasonix_server.js", "client-mode"}, "reasonix-server"},
		{[]string{"--import=./preload.mjs", "reasonix_server.js", "client-mode"}, "reasonix-server"},
		{[]string{"--require", "./preload.cjs", "--import", "./preload.mjs", "reasonix_server.js"}, "reasonix-server"},
		{[]string{"--", "reasonix_server.js", "--require", "client-mode"}, "reasonix-server"},
		{[]string{"-e", "0", "client-mode"}, "mcp-server"},
		{[]string{"--eval", "0", "client-mode"}, "mcp-server"},
		{[]string{"--eval=0", "client-mode"}, "mcp-server"},
		{[]string{"-p", "0", "client-mode"}, "mcp-server"},
		{[]string{"--print", "0", "client-mode"}, "mcp-server"},
		{[]string{"--print=true", "0", "client-mode"}, "mcp-server"},
		{[]string{"--require", "./preload.cjs", "--eval", "0", "client-mode"}, "mcp-server"},
		{[]string{"-", "client-mode"}, "mcp-server"},
		{[]string{"--require", "./preload.cjs"}, "mcp-server"},
		{[]string{"--require"}, "mcp-server"},
	} {
		t.Run(strings.Join(tc.args, " "), func(t *testing.T) {
			if got := NameFromArgv("node", tc.args); got != tc.name {
				t.Errorf("name = %q, want %q", got, tc.name)
			}
			entry, err := ParseArgs(append([]string{"--", "node"}, tc.args...))
			if err != nil || entry.Name != tc.name || entry.Command != "node" || !reflect.DeepEqual(entry.Args, tc.args) {
				t.Errorf("CLI entry = %+v, err=%v", entry, err)
			}
			explicit, err := ParseArgs(append([]string{"manual", "--", "node"}, tc.args...))
			if err != nil || explicit.Name != "manual" || !reflect.DeepEqual(explicit.Args, tc.args) {
				t.Errorf("explicit entry = %+v, err=%v", explicit, err)
			}
		})
	}
	if got := NameFromArgv("npx", []string{"-p", "bootstrap", "demo-server"}); got != "demo-server" {
		t.Errorf("npx control = %q", got)
	}
	if got := NameFromArgv("python3", []string{"-m", "demo_server"}); got != "demo-server" {
		t.Errorf("Python control = %q", got)
	}
}
