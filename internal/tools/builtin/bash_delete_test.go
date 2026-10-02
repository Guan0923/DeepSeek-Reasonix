package builtin

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"reasonix/internal/contract/tool"
	"reasonix/internal/safety/sandbox"
)

type deleteGateTerminal struct{ calls int }

func (r *deleteGateTerminal) RunCommand(context.Context, string, string, time.Duration, map[string]string) (string, bool, error) {
	r.calls++
	return "stub", true, nil
}

func TestBashDestructiveTargetGate(t *testing.T) {
	t.Setenv("REASONIX_FILTER_SUBPROCESS_ENV", "")
	root := t.TempDir()
	outside := t.TempDir()
	cases := []struct {
		command string
		ps      bool
	}{
		{`rm -rf "$HOME"`, false}, {`rm -rf ~`, false}, {`rm -rf /`, false},
		{`rm -rf "$target"`, false}, {`rm -rf "${target}/child"`, false},
		{`rm --recursive '` + filepath.ToSlash(outside) + `'`, false}, {`rm -rf ..`, false},
		{`rm -rf .`, false}, {`cd ..; rm -rf child`, false},
		{`Remove-Item -Recurse -Force $HOME`, true},
		{`Remove-Item -Recurse -Force $env:USERPROFILE`, true},
		{`Remove-Item -Recurse -Force $target`, true},
		{`Remove-Item -Recurse -Force ~`, true},
		{`Remove-Item -Recurse -Force 'C:\'`, true},
		{`Remove-Item -Recurse -Force '` + outside + `'`, true},
		{`Remove-Item -Recurse -Force ..`, true},
		{`Remove-Item -Recurse -Force .`, true},
		{`rm -r -fo $target`, true}, {`del /s %USERPROFILE%`, true}, {`rd /s C:\`, true},
		{`$home = Join-Path $env:TEMP 'cf-p6-manual'; if (Test-Path $home) { Remove-Item -Recurse -Force $home }`, true},
	}
	for _, tc := range cases {
		t.Run(tc.command, func(t *testing.T) {
			sh := sandbox.Shell{Kind: sandbox.ShellBash, Path: "bash"}
			if tc.ps {
				sh = sandbox.Shell{Kind: sandbox.ShellPowerShell, Path: powershellPath(t)}
			}
			terminal := &deleteGateTerminal{}
			b := bash{shell: sh, workDir: root, sb: sandbox.Spec{WriteRoots: []string{root}}, terminal: terminal}
			args, _ := json.Marshal(map[string]string{"command": tc.command})
			res, err := b.ExecuteDetailed(t.Context(), args)
			var refusal tool.Refusal
			if !errors.As(err, &refusal) || refusal.Code != "shell.destructive_target" {
				t.Fatalf("want typed destructive-target refusal, got %v", err)
			}
			if terminal.calls != 0 || res.Execution.State != tool.ShellStateNotRun || res.Execution.MutationRisk != tool.ShellMutationNotStarted {
				t.Fatalf("command reached execution: calls=%d, execution=%+v", terminal.calls, res.Execution)
			}
		})
	}
}

func TestBashDeleteGateAllowsBoundedCleanup(t *testing.T) {
	root := t.TempDir()
	for _, ps := range []bool{false, true} {
		sh := sandbox.Shell{Kind: sandbox.ShellBash, Path: "bash"}
		command := `rm -rf child`
		if ps {
			sh = sandbox.Shell{Kind: sandbox.ShellPowerShell, Path: powershellPath(t)}
			command = `Remove-Item -LiteralPath child -Recurse -Force`
		}
		terminal := &deleteGateTerminal{}
		b := bash{shell: sh, workDir: root, sb: sandbox.Spec{WriteRoots: []string{root}}, terminal: terminal}
		args, _ := json.Marshal(map[string]string{"command": command})
		_, err := b.ExecuteDetailed(t.Context(), args)
		if err != nil || terminal.calls != 1 {
			t.Fatalf("bounded cleanup: calls=%d, err=%v", terminal.calls, err)
		}
	}
}

func TestBashDeleteGateRejectsAlternateScopes(t *testing.T) {
	root := t.TempDir()
	for _, command := range []string{`command rm -rf "$target"`, `env rm -rf "$target"`, `Remove-Item -Recurse /outside`, `Remove-Item -Recurse \outside`} {
		sh := sandbox.Shell{Kind: sandbox.ShellBash, Path: "bash"}
		if strings.HasPrefix(command, "Remove-Item") {
			sh = sandbox.Shell{Kind: sandbox.ShellPowerShell, Path: powershellPath(t)}
		}
		terminal := &deleteGateTerminal{}
		b := bash{shell: sh, workDir: root, sb: sandbox.Spec{WriteRoots: []string{root}}, terminal: terminal}
		args, _ := json.Marshal(map[string]string{"command": command})
		_, err := b.ExecuteDetailed(t.Context(), args)
		var refusal tool.Refusal
		if !errors.As(err, &refusal) || refusal.Code != "shell.destructive_target" {
			t.Errorf("%s: expected refusal, got %v", command, err)
		}
	}
}

func TestPowerShellDeleteAnalysisPreservesUnicode(t *testing.T) {
	sh := sandbox.Shell{Kind: sandbox.ShellPowerShell, Path: powershellPath(t)}
	target := "\u4e2d\u6587-fixture"
	analysis, err := analyzePowerShellDelete(t.Context(), sh, "Remove-Item -Recurse '"+target+"'")
	if err != nil || len(analysis.Calls) != 1 || len(analysis.Calls[0].Args) != 2 || analysis.Calls[0].Args[1] != target {
		t.Fatalf("unicode analysis = %+v, err=%v", analysis, err)
	}
}

func TestBashDeleteGateRejectsNestedDirectoryChange(t *testing.T) {
	terminal := &deleteGateTerminal{}
	root := t.TempDir()
	b := bash{shell: sandbox.Shell{Kind: sandbox.ShellBash, Path: "bash"}, workDir: root, sb: sandbox.Spec{WriteRoots: []string{root}}, terminal: terminal}
	args, _ := json.Marshal(map[string]string{"command": `echo "$(cd ..; rm -rf child)"`})
	_, err := b.ExecuteDetailed(t.Context(), args)
	var refusal tool.Refusal
	if !errors.As(err, &refusal) || refusal.Code != "shell.destructive_target" || terminal.calls != 0 {
		t.Fatalf("nested delete reached execution: err=%v calls=%d", err, terminal.calls)
	}
}
