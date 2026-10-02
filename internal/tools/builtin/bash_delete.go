package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"reasonix/internal/base/proc"
	"reasonix/internal/base/secrets"
	"reasonix/internal/base/shellparse"
	"reasonix/internal/contract/tool"
	"reasonix/internal/safety/sandbox"
	"reasonix/internal/safety/shellsafe"
)

const CodeDestructiveTarget = "shell.destructive_target"

const CodeShellAnalysisUnknown = "shell.analysis_unknown"

func (b bash) refuseCommand(ctx context.Context, sh sandbox.Shell, command string) error {
	if err := b.refuseExternalRef(command); err != nil {
		return err
	}
	if err := checkCommandLine(unconfinedShellArgv(sh, command)); err != nil {
		return err
	}
	return b.refuseDestructiveDelete(ctx, sh, command)
}

func (b bash) refuseDestructiveDelete(ctx context.Context, sh sandbox.Shell, command string) error {
	analysis, err := shellparse.AnalyzeDeleteCalls(command)
	powerShell := sh.Kind == sandbox.ShellPowerShell
	if powerShell {
		analysis, err = analyzePowerShellDelete(ctx, sh, command)
	}
	refusal := tool.Refusal{Code: CodeDestructiveTarget, Message: "Shell command refused before execution: destructive extent is unknown, or a recursive delete targets a protected/out-of-scope path. Use a separate command with literal targets strictly inside the workspace or explicitly granted write roots. Auto and YOLO cannot bypass this guard."}
	if err != nil {
		return tool.Refusal{Code: CodeShellAnalysisUnknown, Message: fmt.Sprintf("Shell command refused before execution: host shell analysis failed: %v. Its extent is unknown; no user command was executed.", err)}
	}
	for _, call := range analysis.Calls {
		if call.Name == "" {
			return tool.Refusal{Code: CodeShellAnalysisUnknown, Message: "Shell command refused before execution: a dynamic command name has unknown extent. Use a literal executable name."}
		}
		targets, recursive := shellsafe.RecursiveDeleteTargets(call.Name, call.Args, powerShell)
		if !recursive {
			continue
		}
		if !analysis.Standalone {
			return refusal
		}
		for _, target := range targets {
			if !b.boundedDeleteTarget(target) {
				return refusal
			}
		}
	}
	return nil
}

func analyzePowerShellDelete(ctx context.Context, sh sandbox.Shell, command string) (shellparse.DeleteAnalysis, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, sh.Path, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", sandbox.PowerShellUTF8Script(shellparse.PowerShellDeleteAnalysis))
	cmd.Stdin = strings.NewReader(command)
	cmd.Env = secrets.ProcessEnv()
	proc.HideWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return shellparse.DeleteAnalysis{}, err
	}
	var analysis shellparse.DeleteAnalysis
	err = json.Unmarshal(out, &analysis)
	return analysis, err
}

func (b bash) boundedDeleteTarget(target string) bool {
	if target == "" || strings.ContainsAny(target, "$%~*?[]`\x00") {
		return false
	}
	if runtime.GOOS == "windows" && strings.HasPrefix(target, "/") || runtime.GOOS == "windows" && strings.HasPrefix(target, "\\") && !filepath.IsAbs(target) {
		return false
	}
	// Provider-qualified and drive-relative paths do not have ordinary filesystem scope.
	if strings.Contains(target, ":") && (!filepath.IsAbs(target) || strings.Contains(strings.TrimPrefix(target, filepath.VolumeName(target)), ":")) {
		return false
	}
	cwd := b.workDir
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	if !filepath.IsAbs(target) {
		target = filepath.Join(cwd, target)
	}
	resolved, err := filepath.EvalSymlinks(target)
	if os.IsNotExist(err) {
		resolved, err = realPath(target)
	}
	if err != nil || filepath.Dir(resolved) == resolved {
		return false
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	home, err = realPath(home)
	if err != nil || withinFold(resolved, home) {
		return false
	}
	workspace, err := realPath(cwd)
	if err != nil || withinFold(resolved, workspace) {
		return false
	}
	roots := b.sb.WriteRoots
	if len(roots) == 0 {
		roots = []string{workspace}
	}
	for _, root := range realRoots(roots) {
		if within(root, resolved) && !withinFold(resolved, root) {
			return true
		}
	}
	return false
}
