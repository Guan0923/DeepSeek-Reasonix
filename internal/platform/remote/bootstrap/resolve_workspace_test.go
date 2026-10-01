package bootstrap

import (
	"strings"
	"testing"
)

func TestResolveWorkspace(t *testing.T) {
	cases := []struct {
		name      string
		target    remoteOS
		home      string
		workspace string
		want      string
	}{
		{"posix empty", posixShell{}, "/home/u", "", "/home/u"},
		{"posix root empty", posixShell{}, "/", "", "/"},
		{"posix root tilde", posixShell{}, "/", "~", "/"},
		{"posix tilde", posixShell{}, "/home/u", "~", "/home/u"},
		{"posix tilde sub", posixShell{}, "/home/u", "~/a b", "/home/u/a b"},
		{"posix relative", posixShell{}, "/home/u", "proj", "/home/u/proj"},
		{"posix absolute", posixShell{}, "/home/u", "/srv/it's", "/srv/it's"},
		{"windows empty", windowsShell{}, "/C:/Users/u", "", "/C:/Users/u"},
		{"windows tilde", windowsShell{}, "/C:/Users/u", "~", "/C:/Users/u"},
		{"windows tilde sub", windowsShell{}, "/C:/Users/u", "~/Desktop/x", "/C:/Users/u/Desktop/x"},
		{"windows relative", windowsShell{}, "/C:/Users/u", "Desktop/x", "/C:/Users/u/Desktop/x"},
		{"windows drive backslash", windowsShell{}, "/C:/Users/u", `C:\Users\u\Desktop\x`, "/C:/Users/u/Desktop/x"},
		{"windows drive slash", windowsShell{}, "/C:/Users/u", "C:/Users/u", "/C:/Users/u"},
		{"windows other drive", windowsShell{}, "/C:/Users/u", `D:\work y`, "/D:/work y"},
		{"windows sftp spelling", windowsShell{}, "/C:/Users/u", "/C:/Users/u/x", "/C:/Users/u/x"},
		{"windows UNC backslash", windowsShell{}, "/C:/Users/u", `\\srv\share\x`, "//srv/share/x"},
		{"windows UNC slash", windowsShell{}, "/C:/Users/u", "//srv/share/x", "//srv/share/x"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := resolveWorkspace(c.target, c.workspace, c.home)
			if got != c.want {
				t.Fatalf("resolveWorkspace(%q) = %q, want %q", c.workspace, got, c.want)
			}
		})
	}
}

func TestWindowsAbsoluteWorkspaceDoesNotUseHomePrefixedState(t *testing.T) {
	const (
		home      = `/C:/Users/u`
		workspace = `C:\Users\u\Desktop\x`
	)
	// The failing behavior was home + "/" + workspace. Keep the old spelling in
	// the test so a regression back to it still names the duplicate-home slug.
	oldPath := strings.TrimRight(home, "/") + "/" + workspace
	oldState := windowsShell{}.Paths(home, oldPath).StateJSON

	gotPath := resolveWorkspace(windowsShell{}, workspace, home)
	gotState := windowsShell{}.Paths(home, gotPath).StateJSON
	wantState := windowsShell{}.Paths(home, "/C:/Users/u/Desktop/x").StateJSON
	if gotPath == oldPath || gotState == oldState {
		t.Fatalf("windows absolute workspace kept home-prefixed path %q / state %q", gotPath, gotState)
	}
	if gotState != wantState {
		t.Fatalf("state path = %q, want %q", gotState, wantState)
	}
}

func TestWindowsWorkspaceRoundTripsToShell(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"drive backslash", `C:\Users\u\Desktop\x`, `C:\Users\u\Desktop\x`},
		{"drive slash", "C:/Users/u/Desktop/x", `C:\Users\u\Desktop\x`},
		{"sftp drive", "/C:/Users/u/Desktop/x", `C:\Users\u\Desktop\x`},
		{"UNC backslash", `\\srv\share\x`, `\\srv\share\x`},
		{"UNC slash", "//srv/share/x", `\\srv\share\x`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := (windowsShell{}).NativePath(c.in); got != c.want {
				t.Fatalf("NativePath(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
